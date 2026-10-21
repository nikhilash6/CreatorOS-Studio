/* ============================================================
   Transport « Comfy SDK » — les rendus partent par l'API Comfy v2
   (@comfyorg/sdk) au lieu de l'API locale de ComfyUI.

   Deux cibles, même code :
   - Comfy Cloud, avec la clé du VISITEUR (en-tête X-Comfy-Key) : ses
     crédits, son compte ; rien ne tourne sur la machine qui sert l'appli ;
   - un ComfyUI local derrière `comfy-api-proxy` (CREATOROS_TRANSPORT=sdk,
     COMFY_BASE_URL=http://127.0.0.1:8189), sans clé.

   La clé n'est jamais écrite : ni en base, ni dans le payload du job, ni
   dans les journaux. Elle vit en mémoire le temps du job (cf. jobs.js).

   Le reste du serveur ne voit pas la différence : submitPrompt rend un
   identifiant « sdk:<id> », waitForPrompt rend une entrée d'historique au
   format de ComfyUI, readImage lit les octets par le SDK.
   ============================================================ */
import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'
import { Comfy } from '@comfyorg/sdk'
import { CONFIG } from './config.js'

/** Transport de TOUS les jobs : 'local' (API de ComfyUI) ou 'sdk' (proxy v2). */
export const TRANSPORT = (process.env.CREATOROS_TRANSPORT || 'local').trim().toLowerCase() === 'sdk' ? 'sdk' : 'local'
const BASE_LOCALE = (process.env.COMFY_BASE_URL || 'http://127.0.0.1:8189').trim()

/* Le contexte du job en cours : { cle } pour Comfy Cloud, {} pour le proxy local. */
const contexte = new AsyncLocalStorage()
/** Exécute `fn` (un job) sur le transport SDK. `cle` absente = proxy local. */
export const avecSdk = (cle, fn) => contexte.run({ cle: cle || null }, fn)
/** Le job courant passe-t-il par le SDK ? */
export const surSdk = () => Boolean(contexte.getStore()) || TRANSPORT === 'sdk'
/** … et vers Comfy Cloud (clé de visiteur) ? */
export const surCloud = () => Boolean(contexte.getStore()?.cle)

function client() {
  const cle = contexte.getStore()?.cle ?? null
  /* La cible se lit dans COMFY_BASE_URL à la construction (contrat du SDK) :
     absente = Comfy Cloud. On la pose le temps du constructeur, synchrone. */
  const avant = process.env.COMFY_BASE_URL
  try {
    if (cle) delete process.env.COMFY_BASE_URL
    else process.env.COMFY_BASE_URL = BASE_LOCALE
    return new Comfy({ ...(cle ? { apiKey: cle } : {}), clientInfo: 'creatoros-studio' })
  } finally {
    if (avant === undefined) delete process.env.COMFY_BASE_URL
    else process.env.COMFY_BASE_URL = avant
  }
}

/* ---------- différences de catalogue Comfy Cloud ----------
   Mêmes modèles, parfois un autre nom de fichier ; et pas de nœud GGUF :
   le chargeur est remplacé par un UNETLoader sur l'équivalent fp8. */
let tableCloud = null
function catalogueCloud() {
  if (tableCloud) return tableCloud
  try { tableCloud = JSON.parse(fs.readFileSync(path.join(CONFIG.workflowsDir, 'cloud.json'), 'utf8')) }
  catch { tableCloud = { renommer: {}, gguf: {} } }
  return tableCloud
}
function adapterAuCloud(graphe) {
  const { renommer = {}, gguf = {} } = catalogueCloud()
  for (const n of Object.values(graphe)) {
    if (!n || typeof n !== 'object') continue
    if (n.class_type === 'UnetLoaderGGUF') {
      const cible = gguf[n.inputs?.unet_name]
      if (!cible) throw new Error(`modèle GGUF « ${n.inputs?.unet_name} » sans équivalent sur Comfy Cloud`)
      n.class_type = 'UNETLoader'
      n.inputs = { unet_name: cible, weight_dtype: 'default' }
      continue
    }
    for (const [k, v] of Object.entries(n.inputs ?? {}))
      if (typeof v === 'string' && renommer[v]) n.inputs[k] = renommer[v]
  }
}

/* Champs « nom de fichier d'entrée » des chargeurs : le fichier est dans le
   dossier input/ du ComfyUI local ; par le SDK il est TÉLÉVERSÉ (dédupliqué
   par empreinte, un fichier déjà connu du serveur ne repart pas). */
const ENTREES = { LoadImage: 'image', VHS_LoadVideo: 'video', LoadVideo: 'file', LoadImageMask: 'image' }

const jobs = new Map()   // 'sdk:<id>' → Job du SDK

export async function soumettre(workflow) {
  const c = client()
  const graphe = structuredClone(workflow)
  if (surCloud()) adapterAuCloud(graphe)
  const wf = c.workflows.fromJson(graphe)
  for (const [id, n] of Object.entries(graphe)) {
    const champ = ENTREES[n?.class_type]
    const nom = champ && n.inputs?.[champ]
    if (typeof nom !== 'string' || !nom) continue
    const fichier = path.join(CONFIG.comfyInput, path.basename(nom))
    if (!fs.existsSync(fichier)) throw new Error(`entrée « ${nom} » introuvable dans input/`)
    wf.setInput(id, champ, c.assets.fromFile(fichier))
  }
  const job = await c.submit(wf)
  const pid = `sdk:${job.id}`
  jobs.set(pid, job)
  if (jobs.size > 50) jobs.delete(jobs.keys().next().value)
  return pid
}

const attendre = ms => new Promise(r => setTimeout(r, ms))

/** Attend la fin du job ; rend une entrée d'historique au format ComfyUI. */
export async function attendreFin(pid, { onPhase, timeoutMs } = {}) {
  const job = jobs.get(pid)
  if (!job) throw new Error('job Comfy SDK inconnu (serveur redémarré pendant le rendu ?)')
  const t0 = Date.now()
  let phase = null
  for (;;) {
    await job.refresh()
    const next = job.status === 'running' ? 'rendering' : job.status === 'queued' ? 'queued' : phase
    if (next && next !== phase) { phase = next; onPhase?.(next) }
    if (['succeeded', 'failed', 'canceled', 'expired'].includes(job.status)) break
    if (timeoutMs && Date.now() - t0 > timeoutMs * 4) throw new Error(`délai dépassé (${Math.round(timeoutMs / 1000)} s) côté Comfy`)
    await attendre(job.status === 'queued' ? 3000 : 1500)
  }
  if (job.status !== 'succeeded') {
    const e = job.error
    const detail = e ? [e.code, e.message, e.class_type && `nœud ${e.class_type}${e.node_id ? ` #${e.node_id}` : ''}`].filter(Boolean).join(' — ') : job.status
    return { status: { completed: false, status_str: job.status, messages: [['execution_error', { exception_message: detail }]] }, outputs: {} }
  }
  /* Sorties regroupées par nœud, toutes sous `images` comme le fait
     ComfyUI pour SaveImage et SaveVideo (outputsOf ne lit que là). */
  const outputs = {}
  for (const o of job.outputs) {
    if (o.type === 'text' || o.type === 'latent') continue
    ;(outputs[o.nodeId] ??= { images: [] }).images.push({ filename: o.name, subfolder: '', type: 'output', __sdk: o })
  }
  return { status: { completed: true, status_str: 'success', messages: [] }, outputs }
}

export async function lireSortie(img) {
  return Buffer.from(await img.__sdk.toBytes({ timeoutMs: 10 * 60_000 }))
}

export async function annuler(pid) {
  const job = jobs.get(pid)
  if (job) await job.cancel().catch(() => {})
}

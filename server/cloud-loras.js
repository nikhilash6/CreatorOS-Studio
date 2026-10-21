/* ============================================================
   LoRA des personnages sur Comfy Cloud — import en un clic.

   Un rendu envoyé à Comfy Cloud avec la clé du visiteur charge les LoRA
   d'identité PAR LEUR NOM DE FICHIER. Comfy Cloud ne les a pas dans son
   catalogue : il faut les importer dans le compte du visiteur. Comfy Cloud
   sait télécharger lui-même depuis Civitai (POST /api/assets/download), en
   tâche de fond suivie par GET /api/tasks/{id} : rien ne transite par ce
   serveur.

   La source de chaque fichier est dans workflows/cloud.json (`loras` : nom
   de fichier → version Civitai). Le nom importé est celui que Civitai donne
   au fichier, le même que dans le dossier loras/ local : les recettes n'ont
   rien à renommer.

   La clé du visiteur sert à l'appel et n'est jamais écrite ni journalisée.
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from './config.js'
import { personas } from './persona.js'

/* Hôte de l'API Comfy Cloud ; surchargé pour les tests (faux serveur local). */
const API = (process.env.COMFY_CLOUD_API || 'https://cloud.comfy.org').replace(/\/+$/, '')

function table() {
  try { return JSON.parse(fs.readFileSync(path.join(CONFIG.workflowsDir, 'cloud.json'), 'utf8')) }
  catch { return {} }
}

async function appel(cle, methode, chemin, corps) {
  const r = await fetch(API + chemin, {
    method: methode,
    headers: { 'X-API-Key': cle, Accept: 'application/json', ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const texte = await r.text()
  let json = null
  try { json = texte ? JSON.parse(texte) : null } catch { /* corps non JSON */ }
  if (!r.ok) {
    const msg = json?.message || json?.error?.message || json?.error || texte.slice(0, 200) || `HTTP ${r.status}`
    const e = new Error(r.status === 401 || r.status === 403
      ? 'clé Comfy Cloud refusée (ou abonnement requis)' : `Comfy Cloud : ${msg}`)
    e.statusCode = r.status === 401 || r.status === 403 ? 401 : 502
    throw e
  }
  return json
}

/** Noms des LoRA déjà présentes dans le compte du visiteur. */
async function presentes(cle) {
  const noms = new Set()
  for (let offset = 0; offset < 5000; offset += 500) {
    const d = await appel(cle, 'GET', `/api/assets?include_tags=models,loras&limit=500&offset=${offset}`)
    const liste = d?.assets ?? d?.data ?? (Array.isArray(d) ? d : [])
    for (const a of liste) if (a?.name) noms.add(path.basename(a.name))
    if (liste.length < 500 || d?.has_more === false) break
  }
  return noms
}

/** LoRA photo des personnages (Krea 2 et Klein), avec leur source. */
function lorasDesPersonnages() {
  const { loras: src = {}, renommer = {} } = table()
  const out = []
  for (const p of personas().list) {
    for (const [moteur, liste] of [['krea', p.loras], ['klein', p.lorasKlein], ['video', p.videoLoras]])
      for (const l of liste ?? [])
        out.push({ persona: p.id, personaName: p.name, moteur, name: l.name, cloudName: renommer[l.name] ?? l.name, source: src[l.name] ?? null })
  }
  return out
}

/** État : pour chaque LoRA de personnage, présente sur le compte ou non. */
export async function etatCloud(cle) {
  const noms = await presentes(cle)
  return { loras: lorasDesPersonnages().map(l => ({ ...l, present: noms.has(l.cloudName) })) }
}

/** Lance l'import des LoRA absentes (toutes, ou celles d'un personnage). */
export async function importerCloud(cle, { persona } = {}) {
  const noms = await presentes(cle)
  const cibles = lorasDesPersonnages().filter(l => !noms.has(l.cloudName) && (!persona || l.persona === persona))
  const resultats = []
  for (const l of cibles) {
    if (!l.source) { resultats.push({ name: l.name, persona: l.persona, status: 'sans-source' }); continue }
    try {
      const d = await appel(cle, 'POST', '/api/assets/download', {
        source_url: l.source, tags: ['models', 'loras'],
        user_metadata: { creatoros_persona: l.persona, filename: l.name },
      })
      resultats.push({ name: l.name, persona: l.persona, status: d?.task_id ? (d.status ?? 'created') : 'completed', task: d?.task_id ?? null })
    } catch (e) {
      if (e.statusCode === 401) throw e
      resultats.push({ name: l.name, persona: l.persona, status: 'failed', error: String(e.message).slice(0, 200) })
    }
  }
  return { lances: resultats }
}

/** Suivi d'une tâche d'import. */
export async function tacheCloud(cle, id) {
  if (!/^[0-9a-f-]{8,64}$/i.test(String(id))) { const e = new Error('identifiant de tâche invalide'); e.statusCode = 400; throw e }
  const d = await appel(cle, 'GET', `/api/tasks/${id}`)
  return { id, status: d?.status ?? 'unknown', progress: d?.progress ?? null, error: d?.error ?? d?.message ?? null }
}

/* ============================================================
   Outils de l'assistant d'installation : affichage, commandes, détection,
   chemins de modèles de ComfyUI, téléchargements avec reprise.

   Rien ici n'installe quoi que ce soit de lui-même : setup.mjs décide, et
   demande avant chaque étape.
   ============================================================ */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/* ---------- affichage ---------- */

const couleur = process.stdout.isTTY && !process.env.NO_COLOR
const teinte = code => s => couleur ? `\x1b[${code}m${s}\x1b[0m` : String(s)
export const vert = teinte('32'), rouge = teinte('31'), jaune = teinte('33'), gris = teinte('90'), gras = teinte('1')

export const titre = s => console.log(`\n${gras(s)}`)
export const ok = (s, d = '') => console.log(`  ${vert('✓')} ${s}${d ? gris('  ' + d) : ''}`)
export const ko = (s, conseil = '') => console.log(`  ${rouge('✗')} ${s}${conseil ? '\n      ' + jaune('→ ' + conseil) : ''}`)
export const alerte = (s, conseil = '') => console.log(`  ${jaune('!')} ${s}${conseil ? '\n      ' + jaune('→ ' + conseil) : ''}`)
export const info = s => console.log(`    ${gris(s)}`)

export const octets = n => {
  if (!Number.isFinite(n)) return '?'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++ }
  return `${n.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`
}

export const tilde = p => p.startsWith(os.homedir() + path.sep) ? '~' + p.slice(os.homedir().length) : p
export const deplier = p => p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p

/* ---------- commandes ---------- */

/** Chemin d'un exécutable dans le PATH, ou null. Sans shell : rien à échapper. */
export function trouver(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue
    const p = path.join(dir, cmd)
    try { fs.accessSync(p, fs.constants.X_OK); if (fs.statSync(p).isFile()) return p } catch { /* suivant */ }
  }
  return null
}

/** Exécution capturée, bornée dans le temps — pour la détection seulement. */
export function lire(cmd, args, timeout = 20_000) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 16 << 20 })
  return { code: r.error ? -1 : r.status, out: String(r.stdout ?? ''), err: String(r.stderr ?? r.error?.message ?? '') }
}

/** Exécution visible (sortie dans le terminal) — pour les étapes d'installation. */
export function executer(cmd, args, opts = {}) {
  console.log(gris(`    $ ${[cmd, ...args].join(' ')}`))
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts })
    p.on('error', reject)
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with code ${code}`)))
  })
}

/* ---------- ComfyUI ---------- */

export const estComfy = d => !!d && fs.existsSync(path.join(d, 'main.py')) && fs.existsSync(path.join(d, 'comfy'))

/** Le Python du venv de ComfyUI : COMFY_PYTHON, sinon venv/ ou .venv/. */
export function pythonDeComfy(dir) {
  if (process.env.COMFY_PYTHON) return process.env.COMFY_PYTHON
  for (const v of ['venv', '.venv']) {
    const p = path.join(dir, v, 'bin', 'python')
    if (fs.existsSync(p)) return p
  }
  return null
}

/* Dossiers par défaut de folder_paths : certaines clés regroupent deux
   dossiers historiques (unet/ et diffusion_models/, clip/ et text_encoders/). */
const ALIAS = {
  diffusion_models: ['diffusion_models', 'unet'],
  unet: ['unet', 'diffusion_models'],
  text_encoders: ['text_encoders', 'clip'],
  clip: ['clip', 'text_encoders'],
}

/* Lecture minimale d'extra_model_paths.yaml — juste la forme que ComfyUI
   documente : des sections, une base_path, des clés à une valeur ou à bloc
   « | » (une ligne par dossier). Pas de dépendance YAML pour si peu. */
export function lireExtraPaths(comfyDir) {
  const f = path.join(comfyDir, 'extra_model_paths.yaml')
  if (!fs.existsSync(f)) return []
  const sections = []
  let cur = null, bloc = null
  for (const brute of fs.readFileSync(f, 'utf8').split('\n')) {
    const ligne = brute.replace(/\s+#.*$/, '').replace(/^\s*#.*$/, '')
    if (!ligne.trim()) continue
    const indent = ligne.match(/^ */)[0].length
    if (indent === 0) {
      cur = { nom: ligne.replace(/:\s*$/, '').trim(), base: '', defaut: false, cles: {} }
      sections.push(cur); bloc = null; continue
    }
    if (!cur) continue
    if (bloc && indent > bloc.indent) { cur.cles[bloc.cle].push(ligne.trim()); continue }
    bloc = null
    const m = ligne.trim().match(/^([\w.-]+):\s*(.*)$/)
    if (!m) continue
    const [, cle, val] = m
    if (cle === 'base_path') cur.base = val.replace(/^["']|["']$/g, '')
    else if (cle === 'is_default') cur.defaut = /^true$/i.test(val)
    else if (val === '|' || val === '') { cur.cles[cle] = []; bloc = { cle, indent } }
    else cur.cles[cle] = [val.replace(/^["']|["']$/g, '')]
  }
  for (const s of sections) {
    const base = deplier(s.base || '')
    s.base = path.isAbsolute(base) ? base : path.resolve(comfyDir, base)
    for (const k of Object.keys(s.cles))
      s.cles[k] = s.cles[k].map(v => path.isAbsolute(deplier(v)) ? deplier(v) : path.join(s.base, v))
  }
  return sections
}

/** Tous les dossiers où ComfyUI cherche une clé folder_paths. */
export function dossiersDe(cle, comfyDir, extra) {
  const cles = ALIAS[cle] ?? [cle]
  const out = cles.map(k => path.join(comfyDir, 'models', k))
  for (const s of extra) for (const k of cles) out.push(...(s.cles[k] ?? []))
  return [...new Set(out)]
}

/** Où écrire un fichier neuf : le dossier is_default d'extra_model_paths
    s'il déclare la clé (c'est là que ComfyUI range ses propres
    téléchargements), sinon models/<clé>/. */
export function destinationDe(cle, comfyDir, extra) {
  const def = extra.find(s => s.defaut && s.cles[cle]?.length)
  return def ? def.cles[cle][0] : path.join(comfyDir, 'models', cle)
}

/* ---------- disque ---------- */

/** Espace libre (octets) sur le système de fichiers qui portera `p`. */
export function espaceLibre(p) {
  let d = path.resolve(p)
  while (!fs.existsSync(d) && path.dirname(d) !== d) d = path.dirname(d)
  try { const s = fs.statfsSync(d); return { libre: s.bavail * s.bsize, dev: fs.statSync(d).dev, ancre: d } }
  catch { return { libre: NaN, dev: null, ancre: d } }
}

/* ---------- réseau ---------- */

const UA = 'creatoros-studio-setup'

/* Requête qui suit les redirections À LA MAIN : le jeton Hugging Face ne
   part que vers huggingface.co, jamais vers le CDN où l'on est redirigé
   (l'URL signée s'y suffit). Le jeton ne figure ni dans l'URL ni à l'écran. */
export async function requete(url, { method = 'GET', headers = {}, signal } = {}) {
  let u = new URL(url)
  for (let saut = 0; saut < 10; saut++) {
    const h = { 'User-Agent': UA, ...headers }
    if (process.env.HF_TOKEN && u.hostname === 'huggingface.co') h.Authorization = `Bearer ${process.env.HF_TOKEN}`
    const r = await fetch(u, { method, headers: h, redirect: 'manual', signal })
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      r.body?.cancel().catch(() => {})
      u = new URL(r.headers.get('location'), u)
      continue
    }
    return r
  }
  throw new Error('too many redirects')
}

/** Taille annoncée d'une URL Hugging Face sans rien télécharger (HEAD, sans
    jeton). Le 302 de huggingface.co porte X-Linked-Size. */
export async function sonder(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  const taille = Number(r.headers.get('x-linked-size') ?? r.headers.get('content-length'))
  return { statut: r.status, taille: Number.isFinite(taille) ? taille : null, erreur: r.headers.get('x-error-code') }
}

/** Taille d'un fichier d'un dépôt à accès accepté, lue sur l'API publique
    (la liste des fichiers reste lisible sans jeton). */
export async function tailleParApi(url) {
  const m = new URL(url).pathname.match(/^\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/)
  if (!m) return null
  const [, depot, rev, fichier] = m
  const dir = path.posix.dirname(fichier)
  const r = await fetch(`https://huggingface.co/api/models/${depot}/tree/${rev}${dir === '.' ? '' : '/' + dir}`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) return null
  const e = (await r.json()).find(x => x.path === fichier)
  return e ? (e.lfs?.size ?? e.size) : null
}

/* Téléchargement avec reprise : on écrit dans <fichier>.part et l'on
   reprend par en-tête Range là où l'on s'était arrêté (Ctrl+C compris).
   Le fichier n'apparaît sous son vrai nom qu'une fois complet : ComfyUI ne
   voit jamais un modèle tronqué. */
export async function telecharger(url, dest, attendu) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const part = dest + '.part'
  let deja = fs.existsSync(part) ? fs.statSync(part).size : 0
  if (attendu && deja > attendu) { fs.rmSync(part); deja = 0 }
  if (attendu && deja === attendu) { fs.renameSync(part, dest); return }

  const r = await requete(url, { headers: deja ? { Range: `bytes=${deja}-` } : {} })
  if (r.status === 401 || r.status === 403) {
    const code = r.headers.get('x-error-code')
    throw new Error(code === 'GatedRepo' || r.status === 401
      ? `access refused (${r.status}): accept the licence on the model page, then set HF_TOKEN`
      : `access refused (${r.status})`)
  }
  if (r.status === 416 && attendu && deja === attendu) { fs.renameSync(part, dest); return }
  if (r.status !== 200 && r.status !== 206) throw new Error(`HTTP ${r.status}`)
  if (r.status === 200 && deja) deja = 0          // Range ignoré : on repart de zéro
  /* La taille qui fait foi est celle du serveur (Content-Range sur une
     reprise, Content-Length sinon) : si le dépôt a republié le fichier, le
     manifeste a vieilli, pas le téléchargement. */
  const annonce = r.status === 206
    ? Number(r.headers.get('content-range')?.split('/')[1])
    : Number(r.headers.get('content-length'))
  const total = Number.isFinite(annonce) && annonce > 0 ? annonce : (attendu || 0)

  let recu = deja, dernier = 0
  const debut = Date.now(), depart = deja
  const progres = new Transform({
    transform(chunk, _enc, cb) {
      recu += chunk.length
      const t = Date.now()
      if (t - dernier > 500 && process.stdout.isTTY) {
        dernier = t
        const debit = (recu - depart) / Math.max(1, (t - debut) / 1000)
        const reste = total && debit ? Math.round((total - recu) / debit) : null
        const pct = total ? ` ${(100 * recu / total).toFixed(1)}%` : ''
        process.stdout.write(`\r      ${octets(recu)}${total ? ' / ' + octets(total) : ''}${pct}  ${octets(debit)}/s`
          + `${reste != null ? '  ' + Math.floor(reste / 60) + 'm' + String(reste % 60).padStart(2, '0') + 's left' : ''}   `)
      }
      cb(null, chunk)
    },
  })
  try {
    await pipeline(Readable.fromWeb(r.body), progres, fs.createWriteStream(part, { flags: deja ? 'a' : 'w' }))
  } finally {
    if (process.stdout.isTTY) process.stdout.write('\r\x1b[K')
  }
  const final = fs.statSync(part).size
  if (total && final !== total) throw new Error(`incomplete: got ${octets(final)} of ${octets(total)} (partial file kept, re-run to resume)`)
  fs.renameSync(part, dest)
  return { taille: final, ecart: !!attendu && final !== attendu }
}

/* ============================================================
   Visites (21/10) — combien de visiteurs par jour, et une limite de rendus
   pour ceux qui arrivent d'Internet (Tailscale Funnel).

   Rien de personnel n'est gardé : un visiteur est une empreinte
   sha256(sel du jour + adresse + navigateur), tronquée, qui ne sert qu'à
   compter les visiteurs distincts du jour. Le sel change chaque jour et
   n'est jamais écrit : une empreinte d'hier ne se relie à rien. Sur disque,
   seulement des compteurs par jour (visites.json).

   Un visiteur du tailnet (en-tête Tailscale-User-Login posé par `tailscale
   serve`) ou le propriétaire n'est ni compté comme visiteur Internet ni limité.
   Le chargement d'une page ne porte pas la clé : le propriétaire est reconnu
   au POST /api/proprietaire que la page envoie au démarrage, et son empreinte
   sort alors du décompte du jour (visiteur et pages déjà comptés compris).

   Rendus des visiteurs Internet (22/10) : chacun est suivi jusqu'au bout et
   noté dans un journal (journal-visiteurs.json, les 200 derniers : type,
   durée, cause d'échec). Le propriétaire est notifié au lancement, à l'échec
   et au refus (cf. notif.js).
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { notifier } from './notif.js'

const RENDUS_PAR_HEURE = 5     // par visiteur Internet
const FILE_MAX_PUBLIC = 8      // au-delà, un visiteur Internet attend que la file se vide

/** Les routes qui lancent un rendu sur le GPU. */
const ROUTES_RENDU = new Set([
  'POST /api/jobs', 'POST /api/jobs/:id/retry', 'POST /api/carrousel', 'POST /api/reels',
  'POST /api/assets/:id/photo-hd', 'POST /api/assets/:id/inpaint', 'POST /api/assets/:id/edit-video',
  'POST /api/assets/:id/upscale', 'POST /api/montages/:id/export', 'POST /api/presets/:id/lancer',
  'POST /api/parole', 'POST /api/reshoot',
])

const JOURNAL_MAX = 200

/** Ce que l'on dit d'un rendu : mode et recette ou moteur, sans le prompt. */
const typeDe = row => {
  let p = null
  try { p = JSON.parse(row.payload || 'null') } catch { /* payload illisible */ }
  const quoi = p?.videoEngine ?? row.recipe_id?.split('@')[0] ?? row.workflow_file?.replace(/\.json$/, '') ?? ''
  return [row.mode, quoi].filter(Boolean).join(' · ')
}
/** Les identifiants de jobs d'une réponse de route de rendu, quelle que soit sa forme. */
function idsDe(v, out = new Set(), cle = '') {
  if (typeof v === 'string') { if (/^(id|jobId|jobIds|ids|jobs)$/.test(cle)) out.add(v) }
  else if (Array.isArray(v)) v.forEach(x => idsDe(x, out, cle))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) idsDe(x, out, k)
  return out
}

export function installerVisites(app, { dataDir, estProprietaire, avecCle, profondeurFile, lireJob }) {
  const fichier = path.join(dataDir, 'visites.json')
  let jours = {}
  try { jours = JSON.parse(fs.readFileSync(fichier, 'utf8')) } catch { /* premier jour */ }
  let sel = { jour: '', valeur: '' }, vus = new Set(), rendus = new Map()
  let pagesDe = new Map(), proprietaires = new Set()   // par empreinte, pour le jour
  let sale = false
  const jourDe = () => new Date().toISOString().slice(0, 10)
  // rendus = visiteurs d'Internet ; rendusProprietaire = propriétaire et tailnet (depuis le 22/10)
  const compteurs = j => (jours[j] ??= { visiteurs: 0, pages: 0, rendus: 0, rendusProprietaire: 0, refuses: 0, tailnet: 0 })
  const empreinte = req => {
    const j = jourDe()
    if (sel.jour !== j) { sel = { jour: j, valeur: crypto.randomBytes(16).toString('hex') }; vus = new Set(); rendus = new Map(); pagesDe = new Map(); proprietaires = new Set() }
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim()
    return crypto.createHash('sha256').update(`${sel.valeur}|${ip}|${req.headers['user-agent'] ?? ''}`).digest('hex').slice(0, 16)
  }
  const duTailnet = req => !!req.headers['tailscale-user-login']

  /* ---------- journal des rendus visiteurs ---------- */
  const fichierJournal = path.join(dataDir, 'journal-visiteurs.json')
  let journal = []
  try { journal = JSON.parse(fs.readFileSync(fichierJournal, 'utf8')) } catch { /* pas encore de journal */ }
  const suivis = new Map()   // jobId → { depuis, route }
  const noter = e => {
    journal.unshift({ at: Date.now(), ...e }); journal.length = Math.min(journal.length, JOURNAL_MAX)
    fs.writeFile(fichierJournal, JSON.stringify(journal, null, 1), () => {})
  }
  setInterval(() => {
    for (const [id, s] of suivis) {
      const row = lireJob(id)
      if (!row) { suivis.delete(id); continue }
      if (row.status !== 'done' && row.status !== 'blocked') {
        if (Date.now() - s.depuis > 6 * 3600_000) suivis.delete(id)   // abandonné après 6 h
        continue
      }
      suivis.delete(id)
      const annule = row.status === 'blocked' && /annulé par/i.test(row.error ?? '')
      const statut = row.status === 'done' ? 'terminé' : annule ? 'annulé' : 'échec'
      const e = { job: id, type: typeDe(row), statut, dureeMs: row.duration_ms ?? (Date.now() - s.depuis), erreur: statut === 'échec' ? String(row.error ?? '').slice(0, 400) : undefined }
      noter(e)
      if (statut === 'échec') void notifier(`Rendu visiteur en échec · ${e.type}`, `#${id} — ${e.erreur || 'sans message'}`, { tags: ['warning'], priorite: 4 })
    }
  }, 10_000).unref()
  const refuser = (raison, route) => {
    noter({ type: route, statut: 'refusé', erreur: raison })
    void notifier('Rendu visiteur refusé', `${route} — ${raison}`, { tags: ['no_entry'] })
  }
  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.rendusVisiteur || reply.statusCode >= 400 || typeof payload !== 'string') return payload
    let corps = null
    try { corps = JSON.parse(payload) } catch { return payload }
    const lances = [...idsDe(corps)].map(id => lireJob(id)).filter(Boolean)
    for (const row of lances) suivis.set(row.id, { depuis: Date.now(), route: req.rendusVisiteur })
    if (lances.length) {
      const types = [...new Set(lances.map(typeDe))].join(', ')
      void notifier('Un visiteur lance un rendu', `${types}${lances.length > 1 ? ` (${lances.length} jobs)` : ''} · file : ${profondeurFile()}`, { tags: ['art'] })
    }
    return payload
  })
  setInterval(() => {
    if (!sale) return
    sale = false
    fs.writeFile(fichier, JSON.stringify(jours, null, 1), () => {})
  }, 30_000).unref()

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]
    // une page = le document de l'app, pas ses fichiers ni l'API
    if (req.method === 'GET' && !url.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(url)) {
      // pages = visiteurs d'Internet ; tailnet = propriétaire et tailnet (depuis le 22/10)
      const c = compteurs(jourDe()); sale = true
      if (duTailnet(req)) { c.tailnet++; return }
      const e = empreinte(req)
      if (proprietaires.has(e)) { c.tailnet++; return }
      c.pages++; pagesDe.set(e, (pagesDe.get(e) ?? 0) + 1)
      if (!vus.has(e)) { vus.add(e); c.visiteurs++ }
      return
    }
    if (req.method === 'POST' && url === '/api/proprietaire') {
      if (!avecCle() || duTailnet(req) || !estProprietaire(req)) return
      const e = empreinte(req)
      if (proprietaires.has(e)) return
      proprietaires.add(e)
      const c = compteurs(jourDe()), n = pagesDe.get(e) ?? 0
      if (vus.has(e)) c.visiteurs = Math.max(0, c.visiteurs - 1)
      c.pages = Math.max(0, c.pages - n); c.tailnet += n; sale = true
      return
    }
    if (!ROUTES_RENDU.has(`${req.method} ${req.routeOptions?.url}`)) return
    const c = compteurs(jourDe())
    if (duTailnet(req) || estProprietaire(req)) { c.rendusProprietaire = (c.rendusProprietaire ?? 0) + 1; sale = true; return }
    const e = empreinte(req), maintenant = Date.now()
    const recents = (rendus.get(e) ?? []).filter(t => maintenant - t < 3600_000)
    if (recents.length >= RENDUS_PAR_HEURE) {
      c.refuses++; sale = true
      refuser(`limite de ${RENDUS_PAR_HEURE} rendus par heure atteinte`, `${req.method} ${req.routeOptions?.url}`)
      reply.code(429).send({ error: `limite de la démo publique : ${RENDUS_PAR_HEURE} rendus par heure et par visiteur` })
      return reply
    }
    if (profondeurFile() >= FILE_MAX_PUBLIC) {
      c.refuses++; sale = true
      refuser(`file publique pleine (${FILE_MAX_PUBLIC})`, `${req.method} ${req.routeOptions?.url}`)
      reply.code(503).send({ error: 'le GPU de la démo est occupé : réessaie dans quelques minutes' })
      return reply
    }
    recents.push(maintenant); rendus.set(e, recents); c.rendus++; sale = true
    req.rendusVisiteur = `${req.method} ${req.routeOptions?.url}`
  })

  // réservée au propriétaire (cf. ROUTES_PROPRIETAIRE)
  app.get('/api/visites', async () => ({
    jours: Object.entries(jours).sort(([a], [b]) => b.localeCompare(a)).map(([jour, c]) => ({ jour, ...c })),
    limites: { rendusParHeure: RENDUS_PAR_HEURE, fileMaxPublic: FILE_MAX_PUBLIC },
    journal: journal.slice(0, 50),
    enCours: suivis.size,
  }))
}

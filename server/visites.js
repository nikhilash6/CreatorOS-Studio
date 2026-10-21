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
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const RENDUS_PAR_HEURE = 5     // par visiteur Internet
const FILE_MAX_PUBLIC = 8      // au-delà, un visiteur Internet attend que la file se vide

/** Les routes qui lancent un rendu sur le GPU. */
const ROUTES_RENDU = new Set([
  'POST /api/jobs', 'POST /api/jobs/:id/retry', 'POST /api/carrousel', 'POST /api/reels',
  'POST /api/assets/:id/photo-hd', 'POST /api/assets/:id/inpaint', 'POST /api/assets/:id/edit-video',
  'POST /api/assets/:id/upscale', 'POST /api/montages/:id/export', 'POST /api/presets/:id/lancer',
  'POST /api/parole', 'POST /api/reshoot',
])

export function installerVisites(app, { dataDir, estProprietaire, profondeurFile }) {
  const fichier = path.join(dataDir, 'visites.json')
  let jours = {}
  try { jours = JSON.parse(fs.readFileSync(fichier, 'utf8')) } catch { /* premier jour */ }
  let sel = { jour: '', valeur: '' }, vus = new Set(), rendus = new Map()
  let sale = false
  const jourDe = () => new Date().toISOString().slice(0, 10)
  // rendus = visiteurs d'Internet ; rendusProprietaire = propriétaire et tailnet (depuis le 22/10)
  const compteurs = j => (jours[j] ??= { visiteurs: 0, pages: 0, rendus: 0, rendusProprietaire: 0, refuses: 0, tailnet: 0 })
  const empreinte = req => {
    const j = jourDe()
    if (sel.jour !== j) { sel = { jour: j, valeur: crypto.randomBytes(16).toString('hex') }; vus = new Set(); rendus = new Map() }
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim()
    return crypto.createHash('sha256').update(`${sel.valeur}|${ip}|${req.headers['user-agent'] ?? ''}`).digest('hex').slice(0, 16)
  }
  const duTailnet = req => !!req.headers['tailscale-user-login']
  setInterval(() => {
    if (!sale) return
    sale = false
    fs.writeFile(fichier, JSON.stringify(jours, null, 1), () => {})
  }, 30_000).unref()

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0]
    // une page = le document de l'app, pas ses fichiers ni l'API
    if (req.method === 'GET' && !url.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(url)) {
      const c = compteurs(jourDe()); c.pages++; sale = true
      if (duTailnet(req)) { c.tailnet++; return }
      const e = empreinte(req)
      if (!vus.has(e)) { vus.add(e); c.visiteurs++ }
      return
    }
    if (!ROUTES_RENDU.has(`${req.method} ${req.routeOptions?.url}`)) return
    const c = compteurs(jourDe())
    if (duTailnet(req) || estProprietaire(req)) { c.rendusProprietaire = (c.rendusProprietaire ?? 0) + 1; sale = true; return }
    const e = empreinte(req), maintenant = Date.now()
    const recents = (rendus.get(e) ?? []).filter(t => maintenant - t < 3600_000)
    if (recents.length >= RENDUS_PAR_HEURE) {
      c.refuses++; sale = true
      reply.code(429).send({ error: `limite de la démo publique : ${RENDUS_PAR_HEURE} rendus par heure et par visiteur` })
      return reply
    }
    if (profondeurFile() >= FILE_MAX_PUBLIC) {
      c.refuses++; sale = true
      reply.code(503).send({ error: 'le GPU de la démo est occupé : réessaie dans quelques minutes' })
      return reply
    }
    recents.push(maintenant); rendus.set(e, recents); c.rendus++; sale = true
  })

  // réservée au propriétaire (cf. ROUTES_PROPRIETAIRE)
  app.get('/api/visites', async () => ({
    jours: Object.entries(jours).sort(([a], [b]) => b.localeCompare(a)).map(([jour, c]) => ({ jour, ...c })),
    limites: { rendusParHeure: RENDUS_PAR_HEURE, fileMaxPublic: FILE_MAX_PUBLIC },
  }))
}

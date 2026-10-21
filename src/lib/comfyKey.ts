/* ============================================================
   Clé Comfy Cloud du visiteur.

   Gardée dans CE navigateur seulement (localStorage). Avec une clé, chaque
   dépôt de rendu (POST /api/…) la porte en en-tête X-Comfy-Key : le serveur
   envoie alors le rendu à Comfy Cloud sur le compte du visiteur, et l'oublie
   à la fin du job. Sans clé, le rendu tourne sur le ComfyUI du serveur.
   ============================================================ */
const CLE = 'creatoros.comfyKey'

export function lireCleComfy(): string | null {
  try { return localStorage.getItem(CLE) || null } catch { return null }
}
export function ecrireCleComfy(v: string | null) {
  try { if (v) localStorage.setItem(CLE, v); else localStorage.removeItem(CLE) } catch { /* stockage indisponible */ }
}

/** Ajoute l'en-tête aux requêtes POST de même origine vers /api/ — une seule
 *  fois, au démarrage. Les autres requêtes partent telles quelles. */
export function brancherCleComfy() {
  const origine = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const cle = lireCleComfy()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const methode = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const memeOrigine = url.startsWith('/') || url.startsWith(window.location.origin)
    if (cle && methode === 'POST' && memeOrigine && new URL(url, window.location.origin).pathname.startsWith('/api/')) {
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      h.set('X-Comfy-Key', cle)
      return origine(input, { ...init, headers: h })
    }
    return origine(input, init)
  }
}

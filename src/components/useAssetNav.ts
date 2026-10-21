/* ============================================================
   Navigation d'un asset à l'autre dans une vue de détail.

   La liste parcourue est celle AFFICHÉE, pas la base entière :
   si l'opérateur a filtré sur « validés », les flèches doivent rester
   dans les validés. Naviguer vers un asset invisible à l'écran
   donnerait l'impression que le filtre ne s'applique pas.
   ============================================================ */
import { useEffect, useRef } from 'react'
import type { Asset } from '../types'

/** Un champ de saisie a le clavier : les flèches y déplacent le curseur.
 *  Les détourner ferait sauter d'image pendant qu'on tape. */
function typing(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

export function useAssetNav(
  list: Asset[],
  current: Asset | null,
  go: (a: Asset | null) => void,
) {
  const index = current ? list.findIndex(a => a.id === current.id) : -1
  /* Dernière position connue DANS la liste. Quand l'asset courant sort du
     filtre affiché (ex. trié « à revoir », on le passe « validé »), index
     tombe à -1 alors que la vue de détail reste ouverte : les flèches
     mourraient. On bascule alors sur le voisin précédent de la catégorie
     (ou le nouveau premier), au lieu de laisser l'opérateur coincé. */
  const lastIndex = useRef(-1)
  if (index >= 0) lastIndex.current = index
  useEffect(() => {
    if (!current || index >= 0) return
    if (lastIndex.current < 0) return // ouvert hors liste : ne pas sauter
    if (!list.length) { go(null); return }
    const at = Math.min(Math.max(lastIndex.current - 1, 0), list.length - 1)
    go(list[at])
  }, [current, index, list, go])
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < list.length - 1
  const prev = () => { if (hasPrev) go(list[index - 1]) }
  const next = () => { if (hasNext) go(list[index + 1]) }

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); go(list[index - 1]) }
      else if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); go(list[index + 1]) }
      else if (e.key === 'Escape') { e.preventDefault(); go(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, index, hasPrev, hasNext, list, go])

  return { index, total: list.length, hasPrev, hasNext, prev, next }
}

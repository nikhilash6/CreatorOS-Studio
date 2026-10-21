/* ============================================================
   Tri des dossiers — UNE préférence, appliquée partout où des
   dossiers s'affichent : sidebar Bibliothèque, menu « Déplacer
   vers… », fiche détail, feuille dossiers du mobile.
   Le serveur renvoie toujours le même ordre (created_at DESC) ;
   c'est le client qui décide, comme un Finder — le tri est une
   préférence d'affichage, pas une donnée.
   ============================================================ */

export type FolderSort = 'recent' | 'ancien' | 'nom' | 'nomDesc' | 'taille'

export const FOLDER_SORTS: { id: FolderSort; label: string; court: string }[] = [
  { id: 'recent', label: 'Plus récents en haut', court: 'récents' },
  { id: 'ancien', label: 'Plus anciens en haut', court: 'anciens' },
  { id: 'nom', label: 'Nom (A → Z)', court: 'A→Z' },
  { id: 'nomDesc', label: 'Nom (Z → A)', court: 'Z→A' },
  { id: 'taille', label: 'Les plus remplis', court: 'remplis' },
]

interface Triable { name: string; createdAt: number; count: number }

export function trierDossiers<T extends Triable>(folders: T[], mode: FolderSort): T[] {
  /* `numeric` : « Lot 2 » après « Lot 10 » serait faux ; `base` : les
     accents et la casse ne doivent pas décider de la place d'un dossier. */
  const parNom = (a: T, b: T) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true })
  const out = [...folders]
  switch (mode) {
    case 'ancien': return out.sort((a, b) => a.createdAt - b.createdAt)
    case 'nom': return out.sort(parNom)
    case 'nomDesc': return out.sort((a, b) => parNom(b, a))
    /* À nombre d'éléments égal le nom départage : sinon l'ordre change tout
       seul d'un rechargement à l'autre. */
    case 'taille': return out.sort((a, b) => b.count - a.count || parNom(a, b))
    default: return out.sort((a, b) => b.createdAt - a.createdAt)
  }
}

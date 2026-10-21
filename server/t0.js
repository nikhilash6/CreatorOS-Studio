/* ============================================================
   T0 côté serveur — le plancher dur, rejoué sur le texte RÉSOLU.

   Le front inspecte le prompt avant l'envoi, mais il ne voit que le
   token wildcard (`__tenues*__`), pas la ligne tirée. Le tirage vivant
   ici, le contrôle est rejoué sur le texte final, après tirage et avant
   injection. Même liste que le front — à modifier par paires.

   Deux familles : tout ce qui évoque un mineur, et le contenu sexuel ou
   la nudité — l'application ne produit que du SFW.
   ============================================================ */
export const T0_BLOCKLIST = [
  'minor', 'teen', 'child', 'underage', 'barely legal', 'schoolgirl',
  'young girl', 'loli', 'jeune fille mineure',
  'naked', 'fully nude', 'nude body', 'nsfw', 'topless', 'nipple', 'genital',
  'pussy', 'penis', 'porn', 'sex scene', 'see-through', 'seins nus',
  'nude woman', 'nude girl', 'nudity', 'erotic', 'lingerie',
  'nothing under', 'nothing underneath', 'no clothes', 'without clothes',
  'undressed', 'undressing', 'bare chest', 'bare breast', 'breasts', 'underwear',
  'rien en dessous', 'déshabillée', 'poitrine nue',
]
/* Mots courts cherchés en MOT ENTIER (« nue » est dans « avenue », « nu »
   dans « menu ») : comparés aux mots du texte, pas en sous-chaîne. */
export const T0_MOTS = ['nude', 'nue', 'nues', 'nu', 'nus', 'sexy', 'stripping', 'striptease']

/** Rend le terme bloqué, ou null. */
export function t0Hit(text) {
  const lower = String(text ?? '').toLowerCase()
  const sous = T0_BLOCKLIST.find(term => lower.includes(term))
  if (sous) return sous
  const mots = new Set(lower.split(/[^\p{L}\p{N}]+/u))
  return T0_MOTS.find(m => mots.has(m)) ?? null
}

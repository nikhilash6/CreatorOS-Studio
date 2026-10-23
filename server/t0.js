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
  // l'enfance est dans T0_ENFANCE_* (mots entiers) ; restent ici les sous-chaînes sans faux positif
  'underage', 'barely legal', 'schoolgirl', 'young girl', 'loli', 'jeune fille mineure',
  'naked', 'fully nude', 'nude body', 'nsfw', 'topless', 'nipple', 'genital',
  'pussy', 'penis', 'porn', 'sex scene', 'see-through', 'seins nus',
  'nude woman', 'nude girl', 'nudity', 'erotic', 'lingerie',
  'nothing under', 'nothing underneath', 'no clothes', 'without clothes',
  'undressed', 'undressing', 'bare chest', 'bare breast', 'breasts', 'underwear',
  'rien en dessous', 'déshabillée', 'poitrine nue',
]
/* Mots courts cherchés en MOT ENTIER (« nue » est dans « avenue », « nu »
   dans « menu ») : comparés aux mots du texte, pas en sous-chaîne. */
export const T0_MOTS = ['nude', 'nue', 'nues', 'nu', 'nus', 'sexy', 'stripping', 'striptease', 'fetish', 'fétiche', 'fetichiste', 'fétichiste']

/* Enfance :
   tout ce qui désigne un enfant ou un âge mineur est refusé, quel que soit le
   reste du texte, en anglais et en français, y compris les orthographes
   déguisées. Mots entiers (après normalisation des chiffres-lettres), puis
   expressions, puis âges écrits en chiffres ou en lettres. */
export const T0_ENFANCE_MOTS = [
  'kid', 'kids', 'kiddo', 'kiddie', 'child', 'children', 'childlike', 'childish', 'toddler', 'toddlers', 'infant', 'infants',
  'baby', 'babies', 'preteen', 'preteens', 'tween', 'tweens', 'teen', 'teens', 'teenager', 'teenagers', 'teenage', 'teeny',
  'minor', 'minors', 'underage', 'underaged', 'juvenile', 'loli', 'lolis', 'lolicon', 'lolita', 'shota', 'shotacon',
  'schoolgirl', 'schoolgirls', 'schoolboy', 'schoolboys', 'pubescent', 'prepubescent', 'puberty', 'nymphet', 'jailbait',
  'ageplay', 'youngster', 'youngsters', 'girlchild', 'cub', 'youngest', 'youngling', 'younglings', 'flatchested', 'petiote', 'petiotes',
  'enfant', 'enfants', 'enfantin', 'enfantine', 'gamin', 'gamine', 'gamins', 'gamines', 'gosse', 'gosses', 'fillette', 'fillettes',
  'bambin', 'bambine', 'bébé', 'bebe', 'ado', 'ados', 'adolescent', 'adolescente', 'adolescents', 'adolescentes',
  'mineur', 'mineure', 'mineurs', 'mineures', 'collégien', 'collégienne', 'collégiens', 'collégiennes',
  'lycéen', 'lycéenne', 'lycéens', 'lycéennes', 'écolier', 'écolière', 'écoliers', 'écolières', 'pubère', 'prépubère', 'préado', 'préados',
]
export const T0_ENFANCE_EXPRESSIONS = [
  'little girl', 'little boy', 'young girl', 'young boy', 'school girl', 'school boy', 'barely legal', 'pre-teen', 'pre teen',
  'under 18', 'under eighteen', 'not 18', 'age play', 'jeune fille', 'jeune garçon', 'petite fille', 'petit garçon',
  'pré-ado', 'moins de 18', 'sous 18', 'pas majeure', 'pas encore majeure', 'jeune adolescente',
  'very young', 'too young', 'so young', 'extremely young', 'young looking', 'young-looking', 'looks young', 'looking young',
  'looks like a girl', 'little one', 'little skinny', 'little body', 'tiny body', 'small body', 'tiny girl', 'small girl',
  'little lady', 'flat chest', 'flat-chest', 'undeveloped', 'not yet developed', 'very small breasts',
  'très jeune', 'trop jeune', 'toute jeune', 'si jeune', 'petit corps', 'corps d’enfant', "corps d'enfant", 'poitrine plate', 'petite jeune',
]
const AGE_CHIFFRES = /\b(?:[1-9]|1[0-7])\s*(?:-|\s)?(?:yo|y\/o|y\.o\.?|yrs?|years?|year-old|years-old|ans|an)\b/u
const AGE_LETTRES = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|un|deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept)[\s-]*(?:years?|year-old|ans)\b/u
// 1 → i, 3 → e, 4 → a, 0 → o, 5 → s, 7 → t, @ → a : « k1d », « t33n », « l0li »
const DECHIFFRER = t => t.replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/0/g, 'o').replace(/5|\$/g, 's').replace(/7/g, 't')

/** Rend le terme d'enfance trouvé, ou null. */
export function t0Enfance(text) {
  const lower = String(text ?? '').toLowerCase().normalize('NFC')
  if (AGE_CHIFFRES.test(lower)) return lower.match(AGE_CHIFFRES)[0]
  if (AGE_LETTRES.test(lower)) return lower.match(AGE_LETTRES)[0]
  const exp = T0_ENFANCE_EXPRESSIONS.find(e => lower.includes(e))
  if (exp) return exp
  const mots = new Set([...lower.split(/[^\p{L}\p{N}@$!|]+/u), ...DECHIFFRER(lower).split(/[^\p{L}\p{N}]+/u)])
  return T0_ENFANCE_MOTS.find(m => mots.has(m)) ?? null
}

/** Rend le terme bloqué, ou null. */
export function t0Hit(text) {
  const enfance = t0Enfance(text)
  if (enfance) return enfance
  const lower = String(text ?? '').toLowerCase()
  const sous = T0_BLOCKLIST.find(term => lower.includes(term))
  if (sous) return sous
  const mots = new Set(lower.split(/[^\p{L}\p{N}]+/u))
  return T0_MOTS.find(m => mots.has(m)) ?? null
}

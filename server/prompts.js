/* ============================================================
   Textes de façonnage — la couche qui décide de ce que le modèle rend.

   Plusieurs familles, toutes lues sur le disque À CHAQUE JOB :
     intent_*      intention globale du réécriveur LLM
     engine_*      consignes d'écriture propres à chaque moteur de diffusion
     rewrite_*     system prompts de repli du réécriveur
     shoot_*, caption.txt, mood_*  carrousel, captions, couches d'ambiance

   Pourquoi hors du code : ce sont les textes qui bougent le plus souvent, et
   ceux dont l'effet se juge sur une image, pas sur une relecture. Les laisser
   dans le code imposait un déploiement par ajustement de virgule.

   Même mécanique que les recettes : lecture par job (aucun cache), écriture
   validée, sauvegarde horodatée avant écrasement, jeton de concurrence.
   ============================================================ */
import fs from 'node:fs'
import path from 'node:path'
import { CONFIG } from './config.js'
import { PROMPT_SEED, PROMPT_META } from './prompts.seed.js'

export { PROMPT_META }

/** Écrit les fichiers manquants à partir de la graine. Appelé une fois au
 *  démarrage : une installation neuve doit marcher sans copie manuelle, et un
 *  fichier effacé par mégarde ne doit pas bloquer la production.
 *  N'ÉCRASE JAMAIS un fichier existant — sinon toute modification de
 *  l'opérateur serait perdue au prochain redémarrage. */
export function seedPrompts() {
  fs.mkdirSync(CONFIG.promptsDir, { recursive: true })
  const created = []
  for (const [file, text] of Object.entries(PROMPT_SEED)) {
    const full = path.join(CONFIG.promptsDir, file)
    if (fs.existsSync(full)) continue
    fs.writeFileSync(full, text)
    created.push(file)
  }
  return created
}

export function promptPath(file) {
  if (typeof file !== 'string' || !file.endsWith('.txt'))
    throw new Error('nom de texte invalide : un fichier .txt est attendu')
  if (file.includes('/') || file.includes('\\') || file.includes('..'))
    throw new Error(`nom de texte invalide : « ${file} » n’est pas un nom de fichier nu`)
  const full = path.join(CONFIG.promptsDir, file)
  if (!full.startsWith(CONFIG.promptsDir + path.sep)) throw new Error('texte hors périmètre')
  return full
}

/** Lecture pour usage en production. Lève si le fichier manque : un texte de
 *  façonnage absent produirait un rendu silencieusement différent, ce qui est
 *  pire qu'un job en échec avec un message clair. */
export function readPrompt(file) {
  const full = promptPath(file)
  let text
  try { text = fs.readFileSync(full, 'utf8') }
  catch { throw new Error(`texte de façonnage absent : ${full}`) }
  if (!text.trim()) throw new Error(`texte de façonnage vide : ${full}`)
  return text
}

/** Lecture pour l'éditeur : contenu + horodatage (jeton de concurrence). */
export function readPromptRaw(file) {
  const full = promptPath(file)
  const st = fs.statSync(full)
  return { file, text: fs.readFileSync(full, 'utf8'), mtimeMs: st.mtimeMs, bytes: st.size }
}

export function listPrompts() {
  try {
    return fs.readdirSync(CONFIG.promptsDir).filter(f => f.endsWith('.txt')).sort()
  } catch { return [] }
}

/** Écriture. Validation volontairement LÉGÈRE — ce sont des textes libres, il
 *  n'y a pas de « format valide » à vérifier. Le seul refus est le vide : un
 *  system prompt vide ferait répondre le LLM n'importe quoi sans rien signaler. */
export function writePrompt(file, text, baseMtimeMs) {
  const full = promptPath(file)
  if (typeof text !== 'string' || !text.trim())
    throw new Error('texte vide : un texte de façonnage vide changerait le rendu sans le dire')

  const exists = fs.existsSync(full)
  if (exists && Number.isFinite(baseMtimeMs)) {
    const cur = fs.statSync(full).mtimeMs
    if (Math.abs(cur - baseMtimeMs) > 1) {
      const e = new Error('le texte a été modifié sur le disque depuis son ouverture')
      e.code = 'CONFLIT'
      e.currentMtimeMs = cur
      throw e
    }
  }

  let backup = null
  if (exists) {
    const dir = path.join(CONFIG.promptsDir, '.backups')
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = path.join(dir, `${file.replace(/\.txt$/, '')}.${stamp}.txt`)
    fs.copyFileSync(full, backup)
  }
  const tmp = full + '.tmp'
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, full)
  const st = fs.statSync(full)
  return {
    file, mtimeMs: st.mtimeMs, bytes: st.size, backup: backup && path.basename(backup),
    words: text.trim().split(/\s+/).length,
  }
}

/* ---------- résolution registre → fichier ---------- */

const byKind = kind => Object.entries(PROMPT_META)
  .filter(([, m]) => m.kind === kind)
  .map(([file, m]) => ({ file, ...m }))

/** Fichier servant un (kind, registre). Le registre unique est le SFW :
 *  tout registre inconnu y retombe. */
export function fileFor(kind, register) {
  const all = byKind(kind)
  return (all.find(x => x.registers.includes(register))
    ?? all.find(x => x.registers.includes('sfw')))?.file
}

export const promptFor = (kind, register) => readPrompt(fileFor(kind, register))

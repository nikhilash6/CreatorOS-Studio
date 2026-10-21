/* ============================================================
   Validateur T0 — enforcement HORS-LLM du plancher dur :
   personnage adulte, aucun mineur, intégrité d'identité.
   Tourne après composition, avant dispatch. Structurellement
   non-dérogeable (règle projet #2) : le LLM ne peut pas le franchir.
   Le mock utilise une liste de termes interdits ; le réel sera
   plus robuste (patterns + revue) côté worker aussi.
   ============================================================ */
import { t } from '../i18n'

export interface ValidationResult {
  ok: boolean
  reason?: string
}

/** Termes toujours bloqués (jamais dérogeable). */
let T0_BLOCKLIST = [
  'minor', 'teen', 'child', 'underage', 'barely legal', 'schoolgirl',
  'young girl', 'loli', 'jeune fille mineure',
]

/** La liste de référence vit côté serveur (server/t0.js, rejouée sur le
 *  texte résolu) et arrive par GET /api/health au montage ; celle ci-dessus
 *  n'est que le repli hors ligne. */
export function setT0Blocklist(list: unknown) {
  if (Array.isArray(list) && list.length && list.every(x => typeof x === 'string')) T0_BLOCKLIST = list
}

export function validateT0(composedPositive: string): ValidationResult {
  const lower = composedPositive.toLowerCase()
  const hit = T0_BLOCKLIST.find(term => lower.includes(term))
  if (hit) return { ok: false, reason: t('Terme bloqué (T0) : « {hit} »', { hit }) }
  return { ok: true }
}

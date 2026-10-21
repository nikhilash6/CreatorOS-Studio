/** Durée de rendu lisible : « 48 s », « 12 min 04 s ». null si inconnue
 *  (0 = job ré-attaché après redémarrage, la mesure n'existe pas). */
export function renderTime(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return `${m} min ${String(s % 60).padStart(2, '0')} s`
}

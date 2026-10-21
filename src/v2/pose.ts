/* Re-shoot : une pose de caméra autour du sujet (az : degrés autour, négatif = gauche ;
   el : hauteur) et l'interpolation d'un mouvement début → fin. Hors de Scene3D pour
   que la vue s'en serve sans charger three.js. */
export interface Pose { az: number; el: number }
export const lisser = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
export function poseA(cles: Pose[] | null, statique: Pose, t: number): Pose {
  if (!cles || cles.length < 2) return statique
  const k = lisser(Math.max(0, Math.min(1, t)))
  return { az: cles[0].az + (cles[1].az - cles[0].az) * k, el: cles[0].el + (cles[1].el - cles[0].el) * k }
}

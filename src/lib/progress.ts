/* Progression d'un job par le TEMPS : écoulé depuis le passage en rendu,
   contre l'estimation faite par le serveur à l'enqueue (coefficients mesurés,
   server/jobs.js RENDER_RATES). Le % de ComfyUI (progression du nœud en
   cours) reste affiché à côté quand il existe, mais c'est le temps qui porte
   la barre : lui ne ment pas sur la longueur d'un driver. */
import { useEffect, useState } from 'react'
import type { Job } from '../types'

export interface RenderRates {
  photoMs: number
  videoSecPerSec: Record<string, number>
  draftSecPerSec: Record<string, number>
  motionSecPerFrame: { final: number; preview: number }
}

export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
}
export const fmtMin = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `≈ ${Math.round(ms / 60000)} min`)

/** Horloge partagée : un rendu par `everyMs`. */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(t) }, [everyMs])
  return now
}

export function jobProgress(job: Job, now: number) {
  const started = job.status === 'rendering' && job.startedAt ? job.startedAt : null
  const elapsedMs = started ? now - started : 0
  const estimatedMs = job.estimatedMs ?? null
  // Plafonnée à 98 % : une estimation n'est pas une promesse, la barre ne
  // se remplit jamais toute seule.
  const ratio = estimatedMs && started ? Math.min(0.98, elapsedMs / estimatedMs) : null
  const over = estimatedMs && started ? elapsedMs > estimatedMs : false
  return { started, elapsedMs, estimatedMs, ratio, over }
}

/** Estimation avant envoi, côté front, avec les coefficients du serveur. */
export function estimateVideoMs(rates: RenderRates | null | undefined, engine: string, seconds: number, draft: boolean) {
  if (!rates) return null
  const rate = draft ? (rates.draftSecPerSec[engine] ?? rates.videoSecPerSec[engine] / 3) : rates.videoSecPerSec[engine]
  return Number.isFinite(rate) ? rate * seconds * 1000 : null
}
export function estimateMotionMs(rates: RenderRates | null | undefined, frames: number, preview: boolean) {
  if (!rates || !frames) return null
  return frames * rates.motionSecPerFrame[preview ? 'preview' : 'final'] * 1000
}

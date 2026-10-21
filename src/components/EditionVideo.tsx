/* ============================================================
   « Éditer » une vidéo : deux façons de dire quoi changer.
   · Pinceau — on peint la zone sur la première image (outil Pinceau).
   · Au prompt — on nomme l'élément (« dress ») et ce qu'il devient ;
     SAM3 le trouve et le suit sur tout le clip, la zone est redessinée,
     le reste de la vidéo reste celui de la source.
   Styles en ligne : partagé bureau et mobile.
   ============================================================ */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store/useAppStore'
import type { Asset } from '../types'
import { t, tServeur } from '../i18n'

const champ: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 10, font: 'inherit', fontSize: 13.5, color: 'inherit', width: '100%',
  background: 'rgba(127,127,127,0.12)', border: '1px solid rgba(127,127,127,0.3)',
}
const choix: React.CSSProperties = {
  display: 'grid', gap: 3, textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', font: 'inherit',
  color: 'inherit', background: 'rgba(127,127,127,0.10)', border: '1px solid rgba(127,127,127,0.25)',
}
const bouton: React.CSSProperties = { padding: '8px 14px', borderRadius: 10, border: 0, font: 'inherit', fontSize: 13, cursor: 'pointer', background: '#24262c', color: '#e8e9ec' }

export function EditionVideo({ asset, onClose, onPinceau }: { asset: Asset; onClose: () => void; onPinceau: () => void }) {
  const [mode, setMode] = useState<'choix' | 'prompt'>('choix')
  const [cible, setCible] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const adopter = useAppStore(s => s.adoptServerJob)

  const lancer = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/assets/${encodeURIComponent(asset.id)}/edit-video`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cible: cible.trim(), prompt: prompt.trim() }) })
      const d = await r.json().catch(() => ({})) as { jobId?: string; error?: string }
      if (!r.ok || !d.jobId) throw new Error(tServeur(d.error) ?? `HTTP ${r.status}`)
      await adopter(d.jobId)
      onClose()
    } catch (e) { setErr(String((e as Error).message || e)) }
    setBusy(false)
  }

  return createPortal(
    <div onClick={busy ? undefined : onClose} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(6,7,9,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label={t('Éditer la vidéo')} onClick={e => e.stopPropagation()}
        style={{ width: 'min(460px, 100%)', borderRadius: 16, padding: 18, background: '#14161a', color: '#e8e9ec',
          border: '1px solid rgba(127,127,127,.25)', boxShadow: '0 24px 60px rgba(0,0,0,.55)', fontSize: 13.5, lineHeight: 1.5, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <b style={{ fontSize: 15 }}>{t('Éditer la vidéo')}</b>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label={t('fermer')} style={{ border: 0, background: 'none', color: 'inherit', fontSize: 18, cursor: 'pointer', opacity: .6 }}>×</button>
        </div>
        {mode === 'choix' ? (<>
          <button style={choix} onClick={() => { onClose(); onPinceau() }}>
            <b>{t('🖌 Pinceau')}</b>
            <span style={{ fontSize: 12, opacity: .7 }}>{t('peindre une zone sur la première image et la refaire sur tout le clip')}</span>
          </button>
          <button style={choix} onClick={() => setMode('prompt')}>
            <b>{t('✎ Au prompt')}</b>
            <span style={{ fontSize: 12, opacity: .7 }}>{t('nommer un élément de la vidéo et dire ce qu’il devient ; il est retrouvé et suivi sur tout le clip')}</span>
          </button>
        </>) : (<>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, opacity: .85 }}>{t('Élément à modifier (en anglais, un nom court)')}
            <input style={champ} autoFocus maxLength={80} value={cible} placeholder="dress, sunglasses, hair, car…" onChange={e => setCible(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, opacity: .85 }}>{t('Ce qu’il devient (en anglais)')}
            <textarea style={{ ...champ, minHeight: 70, resize: 'vertical' }} maxLength={400} value={prompt}
              placeholder="a red silk slip dress with thin straps" onChange={e => setPrompt(e.target.value)} />
          </label>
          <span style={{ fontSize: 11.5, opacity: .6 }}>{t('L’élément doit être visible dans la vidéo : l’édition le transforme, elle n’ajoute pas un objet absent. Clips de 10 s au plus.')}</span>
          {err && <span style={{ fontSize: 12, color: '#f08a7e' }}>{err}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...bouton, background: 'transparent', opacity: .75 }} onClick={() => setMode('choix')} disabled={busy}>{t('‹ Retour')}</button>
            <span style={{ flex: 1 }} />
            <button style={{ ...bouton, background: 'linear-gradient(90deg,#f24d8a,#a855f7)', color: '#fff', fontWeight: 600, opacity: cible.trim() && prompt.trim() ? 1 : .5 }}
              disabled={busy || !cible.trim() || !prompt.trim()} onClick={() => void lancer()}>{busy ? '…' : t('Lancer l’édition')}</button>
          </div>
        </>)}
      </div>
    </div>, document.body)
}

/* ============================================================
   Galerie « Caméra & effets » (21/10) — des cartes qui tournent en boucle,
   une photo, un clic : le clip part dans la file de rendu ordinaire et arrive
   dans la bibliothèque (onglet Vidéo). Les presets vivent côté serveur
   (server/presets.js) ; ici on choisit et on lance.
   ============================================================ */
import { useEffect, useMemo, useState } from 'react'
import type { Asset } from '../types'
import { useAppStore } from '../store/useAppStore'
import { getLang, t, tServeur } from '../i18n'

interface Preset { id: string; famille: 'camera' | 'effet'; nom: string; nomEn: string; icone: string; lora: string | null; apercu: string | null; moteur: 'ltx_hq' | 'wan21' | 'wan21_hq'; deuxRendus?: boolean }
const json = async (r: Response) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(tServeur(b.error) ?? `HTTP ${r.status}`); return b }

export function PresetsView({ goVideo }: { goVideo: () => void }) {
  const [presets, setPresets] = useState<Preset[]>([])
  const [ouvert, setOuvert] = useState<Preset | null>(null)
  const [famille, setFamille] = useState<'camera' | 'effet'>('camera')
  useEffect(() => { void fetch('/api/presets').then(json).then(d => setPresets(d.presets ?? [])).catch(() => {}) }, [])
  const liste = presets.filter(p => p.famille === famille)
  const nom = (p: Preset) => getLang() === 'en' ? p.nomEn : p.nom
  return (
    <div className="flex-1 min-h-0 overflow-y-auto vue-page" style={{ padding: '22px 28px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{t('Caméra & effets')}</h2>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{t('Choisis un mouvement, choisis une photo : le clip arrive dans ta bibliothèque.')}</div>
          </div>
          <span style={{ flex: 1 }} />
          <div className="wtabs">
            <button className={`wtab ${famille === 'camera' ? 'on' : ''}`} onClick={() => setFamille('camera')}>{t('Mouvements de caméra')}</button>
            {presets.some(p => p.famille === 'effet') && <button className={`wtab ${famille === 'effet' ? 'on' : ''}`} onClick={() => setFamille('effet')}>{t('Effets')}</button>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
          {liste.map(p => (
            <button key={p.id} onClick={() => setOuvert(p)}
              style={{ position: 'relative', aspectRatio: '9 / 14', borderRadius: 16, overflow: 'hidden', border: 0, padding: 0, cursor: 'pointer', color: '#fff', textAlign: 'left',
                background: 'linear-gradient(160deg, var(--lv3), var(--lv1))' }}>
              {p.apercu
                ? <video src={p.apercu} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 46, opacity: .5 }}>{p.icone}</span>}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 12px 11px', background: 'linear-gradient(transparent, rgba(0,0,0,.8))', fontSize: 13.5, fontWeight: 700 }}>
                {nom(p)}{p.lora && <span style={{ marginLeft: 6, fontSize: 9.5, padding: '1px 5px', borderRadius: 5, background: 'rgba(255,255,255,.2)' }}>LoRA</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
      {ouvert && <Lancer p={ouvert} nom={nom(ouvert)} onClose={() => setOuvert(null)} goVideo={goVideo} />}
    </div>
  )
}

function Lancer({ p, nom, onClose, goVideo }: { p: Preset; nom: string; onClose: () => void; goVideo: () => void }) {
  const s = useAppStore()
  const [photo, setPhoto] = useState<Asset | null>(null)
  const [detail, setDetail] = useState('')
  const [duree, setDuree] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fait, setFait] = useState(false)
  const photos = useMemo(() => s.assets.filter(a => a.mediaType === 'photo' && a.reviewStatus !== 'rejected')
    .sort((x, y) => Number(y.reviewStatus === 'approved') - Number(x.reviewStatus === 'approved') || y.createdAt - x.createdAt).slice(0, 120), [s.assets])
  const go = async () => {
    if (!photo) return
    setBusy(true); setErr(null)
    try {
      const r = await json(await fetch(`/api/presets/${p.id}/lancer`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: photo.id, detail, duree }) }))
      void s.adoptServerJob(r.jobId)
      setFait(true)
    } catch (e) { setErr(String((e as Error).message)) }
    setBusy(false)
  }
  return (
    <div className="pop" onClick={onClose}>
      <div className="pbox" style={{ width: 'min(860px,94%)' }} onClick={e => e.stopPropagation()}>
        <h3>{p.icone} {nom} <button className="x" onClick={onClose}>✕</button></h3>
        {fait ? (
          <div style={{ display: 'grid', gap: 10, padding: '10px 2px', fontSize: 13 }}>
            <div>✓ {t('Le clip est en file de rendu. Il arrivera dans l’onglet Vidéo.')}</div>
            <div className="flex gap-2">
              <button className="pill" onClick={() => { onClose(); goVideo() }}>{t('Aller à Vidéo')}</button>
              <button className="pill tool" onClick={() => { setFait(false); setPhoto(null) }}>{t('Une autre photo')}</button>
            </div>
          </div>
        ) : (<>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{t('1. Choisis la photo à animer')}</div>
          <div className="pkgrid" style={{ maxHeight: 300 }}>
            {photos.map(a => (
              <button key={a.id} className="pk" onClick={() => setPhoto(a)} style={{ outline: photo?.id === a.id ? '3px solid var(--accent)' : undefined }}>
                <img src={a.uri} alt="" loading="lazy" />
              </button>
            ))}
            {!photos.length && <div style={{ gridColumn: '1/-1', color: 'var(--faint)', fontSize: 11, padding: 12 }}>{t('rien dans la bibliothèque')}</div>}
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <input value={detail} onChange={e => setDetail(e.target.value)} maxLength={300} placeholder={t('2. Optionnel : ce qu’elle fait pendant le plan (en anglais)')}
              style={{ padding: '9px 11px', borderRadius: 10, background: 'var(--lv2)', border: '1px solid var(--lv3)', color: 'var(--text)', font: 'inherit', fontSize: 12.5 }} />
            <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12, color: 'var(--muted)' }}>
              <span>{t('Durée')}</span>
              {(p.moteur.startsWith('wan21') ? [3, 4, 5] : [4, 5, 6, 8]).map(k => <button key={k} className={`wtab ${duree === k ? 'on' : ''}`} onClick={() => setDuree(k)}>{k} s</button>)}
              <span style={{ marginLeft: 8, color: 'var(--faint)' }}>{p.moteur === 'wan21_hq' ? t('Wan 2.1 · LoRA dédiée · muet · ~8 min') : p.moteur === 'wan21' ? t('Wan 2.1 · LoRA dédiée · muet') : p.deuxRendus ? t('LTX-2.5 puis Wan 2.2 · deux rendus, le second finit sur ta photo') : `LTX-2.5 · ${t('avec le son')}${p.lora ? ' · LoRA' : ''}`}</span>
              <span style={{ flex: 1 }} />
              <button className="cta" style={{ padding: '9px 16px', flexDirection: 'row' }} disabled={!photo || busy} onClick={() => void go()}>{busy ? '…' : `✨ ${t('Animer')}`}</button>
            </div>
            {err && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{err}</div>}
          </div>
        </>)}
      </div>
    </div>
  )
}

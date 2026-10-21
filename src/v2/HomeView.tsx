/* ============================================================
   Accueil (21/10) — la vitrine : ce que l'app sait faire, en grandes cartes
   qui tournent en boucle, un clic pour ouvrir l'outil. Les vidéos viennent
   de la bibliothèque du personnage actif (derniers clips, dernier reel) :
   rien n'est figé dans le code, la vitrine montre ce que la machine a rendu.
   ============================================================ */
import { useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { vignetteOf } from '../components/AssetMedia'
import { t } from '../i18n'

type Cible = 'reel' | 'presets' | 'parole' | 'montage' | 'image' | 'video' | 'assets'

export function HomeView({ go }: { go: (s: Cible) => void }) {
  const s = useAppStore()
  const videos = useMemo(() => s.assets.filter(a => a.mediaType === 'video' && a.reviewStatus !== 'rejected')
    .sort((x, y) => Number(y.reviewStatus === 'approved') - Number(x.reviewStatus === 'approved') || y.createdAt - x.createdAt), [s.assets])
  const photos = useMemo(() => s.assets.filter(a => a.mediaType === 'photo' && a.reviewStatus !== 'rejected')
    .sort((x, y) => Number(y.reviewStatus === 'approved') - Number(x.reviewStatus === 'approved') || y.createdAt - x.createdAt), [s.assets])
  const reel = videos.find(a => String(a.jobId).startsWith('mtg-')) ?? videos[0]
  const autres = videos.filter(a => a.id !== reel?.id)
  const CARTES: { cible: Cible; titre: string; texte: string; media?: { uri: string; video: boolean; poster?: string } }[] = [
    { cible: 'presets', titre: t('Caméra & effets'), texte: t('Un mouvement de caméra de cinéma sur n’importe quelle photo, en un clic.'),
      media: autres[0] && { uri: autres[0].uri, video: true, poster: vignetteOf(autres[0]) } },
    { cible: 'parole', titre: t('Avatar parlant'), texte: t('Une photo, ta voix : elle parle face caméra, lèvres calées. La pub UGC en un clic.'),
      media: autres.find(a => String(a.jobId).startsWith('parole-')) && { uri: autres.find(a => String(a.jobId).startsWith('parole-'))!.uri, video: true } },
    { cible: 'montage', titre: t('Montage'), texte: t('Coupe, fondus, texte, recadrage, musique : le reel se termine ici.'),
      media: autres[1] && { uri: autres[1].uri, video: true, poster: vignetteOf(autres[1]) } },
    { cible: 'image', titre: t('Photo'), texte: t('Ton personnage, cohérent d’une image à l’autre, en séances complètes.'),
      media: photos[0] && { uri: photos[0].uri, video: false } },
    { cible: 'video', titre: t('Vidéo'), texte: t('Image → vidéo, transfert de mouvement, prequel / sequel, retouche au pinceau suivie.'),
      media: autres[2] && { uri: autres[2].uri, video: true, poster: vignetteOf(autres[2]) } },
  ]
  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '26px 28px 40px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 22 }}>
        {/* ---------- la carte phare : le reel en un clic ---------- */}
        <button onClick={() => go('reel')} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 0, borderRadius: 22, overflow: 'hidden', border: 0, padding: 0,
          cursor: 'pointer', textAlign: 'left', color: '#fff', background: 'linear-gradient(120deg, #2a1236, #121318 60%)', minHeight: 300 }}>
          <div style={{ padding: '34px 36px', display: 'grid', alignContent: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', opacity: .7 }}>{t('Open source · modèles ouverts · sur ton GPU')}</span>
            <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{t('Un brief. Un reel.')}</span>
            <span style={{ fontSize: 14.5, opacity: .8, maxWidth: 520, lineHeight: 1.55 }}>
              {t('{nom} est photographiée plan par plan, chaque plan est animé avec le son, puis le reel est monté tout seul — fondus, accroche, musique.', { nom: s.personaName })}
            </span>
            <span className="cta" style={{ justifySelf: 'start', padding: '11px 20px', flexDirection: 'row', marginTop: 6 }}>✨ {t('Réaliser un reel')}</span>
          </div>
          <div style={{ width: 'min(260px, 34vw)', aspectRatio: '9 / 16', background: '#000' }}>
            {reel && <video src={reel.uri} poster={vignetteOf(reel)} muted loop autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {CARTES.map(c => (
            <button key={c.cible} onClick={() => go(c.cible)} style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 18, overflow: 'hidden', border: 0, padding: 0,
              cursor: 'pointer', textAlign: 'left', color: '#fff', background: 'linear-gradient(160deg, var(--lv3), var(--lv1))' }}>
              {c.media && (c.media.video
                ? <video src={c.media.uri} poster={c.media.poster} muted loop autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <img src={c.media.uri} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '50px 16px 16px', background: 'linear-gradient(transparent, rgba(0,0,0,.85))', display: 'grid', gap: 5 }}>
                <b style={{ fontSize: 17 }}>{c.titre}</b>
                <span style={{ fontSize: 12.5, opacity: .8, lineHeight: 1.45 }}>{c.texte}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

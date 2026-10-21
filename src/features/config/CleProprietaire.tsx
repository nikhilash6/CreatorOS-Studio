/* Réglage « Propriétaire » : n'apparaît que si le serveur est verrouillé. */
import { useEffect, useState } from 'react'
import { t } from '../../i18n'
import { ecrireCleProprietaire, lireCleProprietaire, useVerrou } from '../../lib/proprietaire'

export function CleProprietaire() {
  const v = useVerrou()
  const [saisie, setSaisie] = useState('')
  if (!v?.verrou) return null
  const enregistree = !!lireCleProprietaire()
  return (
    <div className="border border-border rounded-card bg-surface2 p-4 max-w-[720px] mt-4">
      <div className="font-semibold text-[13px] mb-1">{t('Propriétaire du studio')}</div>
      <p className="text-[12px] text-muted mb-3" style={{ lineHeight: 1.5 }}>
        {t('Ce studio est verrouillé : la page Créateur, les personnages, la garde-robe, les recettes et les prompts ne se modifient qu’avec la clé du propriétaire.')}
      </p>
      {v.proprietaire ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px]">🔓 {t('Clé du propriétaire reconnue dans ce navigateur')}</span>
          <button className="pill" onClick={() => ecrireCleProprietaire(null)}>{t('Oublier la clé')}</button>
          <Visites />
        </div>
      ) : (
        <form className="flex items-center gap-2 flex-wrap" onSubmit={e => { e.preventDefault(); const k = saisie.trim(); if (k) { ecrireCleProprietaire(k); setSaisie('') } }}>
          <input type="password" autoComplete="off" spellCheck={false} value={saisie} onChange={e => setSaisie(e.target.value)}
            className="bg-surface3 border border-border rounded px-2 py-1 text-[12px]" style={{ minWidth: 260 }} />
          <button className="pill" type="submit" disabled={!saisie.trim()}>{t('Déverrouiller')}</button>
          {enregistree && <span className="text-[11.5px] text-muted">{t('clé enregistrée refusée par le serveur')}</span>}
        </form>
      )}
    </div>
  )
}

/** Visiteurs par jour (comptés sans rien garder de personnel, cf. server/visites.js). */
function Visites() {
  const [d, setD] = useState<{ jours: { jour: string; visiteurs: number; pages: number; rendus: number; rendusProprietaire?: number; refuses: number; tailnet: number }[] } | null>(null)
  useEffect(() => { void fetch('/api/visites').then(r => r.ok ? r.json() : null).then(setD).catch(() => {}) }, [])
  if (!d) return null
  return (
    <table className="text-[12px] mt-3 w-full" style={{ borderCollapse: 'collapse' }}>
      <thead><tr className="text-muted text-left">
        <th>{t('Jour')}</th><th>{t('Visiteurs')}</th><th>{t('Pages vues')}</th><th>{t('Rendus visiteurs')}</th><th>{t('Rendus propriétaire')}</th><th>{t('Refusés (limite)')}</th><th>{t('Pages tailnet')}</th>
      </tr></thead>
      <tbody>{d.jours.slice(0, 14).map(j => (
        <tr key={j.jour}><td>{j.jour}</td><td><b>{j.visiteurs}</b></td><td>{j.pages}</td><td><b>{j.rendus}</b></td><td>{j.rendusProprietaire ?? '—'}</td><td>{j.refuses}</td><td>{j.tailnet}</td></tr>
      ))}</tbody>
    </table>
  )
}

/** Ligne affichée à la place d'un bouton d'édition, pour le visiteur. */
export function Verrouille({ style }: { style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11.5, opacity: 0.6, ...style }}>🔒 {t('Réglé par le propriétaire du studio')}</div>
}

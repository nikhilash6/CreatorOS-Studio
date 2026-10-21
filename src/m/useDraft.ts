/* ============================================================
   Persistance du brouillon de création.

   Sur mobile l'application est déchargée par l'OS dès que l'écran
   s'éteint : sans ce hook, un prompt en cours de rédaction disparaît
   entre deux consultations. Le store Zustand ne persiste, lui, que les
   préférences d'affichage — c'est volontaire côté desktop.

   Ce qui est conservé : mode, prompt, réglages photo ET vidéo
   (les deux coexistent dans le store, donc chaque opération garde son
   brouillon), quantité et seed.

   Ce qui ne l'est JAMAIS : les URL `blob:` des fichiers choisis sur le
   téléphone. Elles ne survivent pas au rechargement ; les rendre après
   coup afficherait une vignette morte. Le NOM de fichier serveur, lui,
   reste valide et est conservé — la source déjà transférée est donc
   toujours là au retour.
   ============================================================ */
import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { loadDraft, saveDraft, saveDraftSoon } from './draft'

const KEY = 'default:create'

interface Snapshot {
  mode: unknown
  userPrompt: string
  promptTouched: boolean
  photo: Record<string, unknown>
  video: Record<string, unknown>
  batchCount: number
  seedMode: unknown
  seedValue: unknown
}

/** Retire les URL locales (blob:) d'un objet de sélections : elles sont
 *  mortes après un rechargement. Les champs `*File` (noms côté serveur) et
 *  `*AssetId` survivent, eux. */
function stripBlobs<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = { ...o }
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.startsWith('blob:')) out[k] = ''
  }
  return out as T
}

export function useDraftPersistence() {
  const restored = useRef(false)

  // ---- restauration, une seule fois au montage ----
  useEffect(() => {
    void (async () => {
      const d = await loadDraft<Snapshot>(KEY)
      if (d) {
        const st = useAppStore.getState()
        useAppStore.setState({
          mode: (d.mode as typeof st.mode) ?? st.mode,
          userPrompt: d.userPrompt ?? '',
          promptTouched: !!d.promptTouched,
          photo: { ...st.photo, ...stripBlobs(d.photo ?? {}) } as typeof st.photo,
          video: { ...st.video, ...stripBlobs(d.video ?? {}) } as typeof st.video,
          batchCount: d.batchCount ?? st.batchCount,
          seedMode: (d.seedMode as typeof st.seedMode) ?? st.seedMode,
          seedValue: (d.seedValue as typeof st.seedValue) ?? st.seedValue,
        })
      }
      restored.current = true
    })()
  }, [])

  // ---- sauvegarde différée à chaque changement ----
  useEffect(() => useAppStore.subscribe(st => {
    // Ne jamais écrire AVANT d'avoir restauré : on écraserait le brouillon
    // enregistré avec l'état par défaut du store.
    if (!restored.current) return
    const snap: Snapshot = {
      mode: st.mode,
      userPrompt: st.userPrompt, promptTouched: st.promptTouched,
      photo: stripBlobs(st.photo as unknown as Record<string, unknown>),
      video: stripBlobs(st.video as unknown as Record<string, unknown>),
      batchCount: st.batchCount, seedMode: st.seedMode, seedValue: st.seedValue,
    }
    saveDraftSoon(KEY, 'default', snap)
  }), [])

  // ---- écriture IMMÉDIATE quand la page passe en arrière-plan ----
  useEffect(() => {
    const flush = () => {
      if (!restored.current) return
      const st = useAppStore.getState()
      void saveDraft(KEY, 'default', {
        mode: st.mode,
        userPrompt: st.userPrompt, promptTouched: st.promptTouched,
        photo: stripBlobs(st.photo as unknown as Record<string, unknown>),
        video: stripBlobs(st.video as unknown as Record<string, unknown>),
        batchCount: st.batchCount, seedMode: st.seedMode, seedValue: st.seedValue,
      } satisfies Snapshot)
    }
    /* `visibilitychange` plutôt que `beforeunload` : sur iOS, l'application
       est souvent suspendue sans jamais déclencher `beforeunload`. */
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])
}

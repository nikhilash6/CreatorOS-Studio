/* Exemples de la démo — mêmes scènes, même graine, pour chaque personnage :
   ce qui change d'une image à l'autre, c'est le personnage, pas la scène.

   node scripts/demo/photos.mjs [url du studio] [personnage,personnage…] [krea|klein]

   Les rendus partent dans la file du studio avec `personaId` : le personnage
   actif de l'interface ne change pas. Aucun mot déclencheur ici — la recette
   l'ajoute selon le personnage. */
const BASE = process.argv[2] || 'http://127.0.0.1:8787'
const QUI = process.argv[3]?.split(',')
const MOTEUR = process.argv[4] === 'klein' ? 'klein' : 'krea'

import { SCENES } from './scenes.mjs'

const { personas } = await (await fetch(`${BASE}/api/personas`)).json()
const cibles = personas.filter(p => !QUI || QUI.includes(p.id))
if (!cibles.length) throw new Error('aucun personnage')

for (const p of cibles) {
  for (const s of SCENES) {
    const job = {
      mode: 'photo', purpose: 'creative', op: 'generate', recipeId: 'sfw@v1',
      photoEngine: MOTEUR, personaId: p.id,
      seed: s.seed, width: 768, height: 1344,
      userPrompt: s.prompt, userDirectives: '', composedPositive: s.prompt, composedNegative: '',
      selections: { task: 'generate' }, loras: [], videoLoras: [],
      requestId: `demo-${p.id}-${s.cle}-${s.seed}-${MOTEUR}-${process.env.DEMO_PASSE ?? 1}`,
    }
    const r = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) })
    const d = await r.json().catch(() => ({}))
    console.log(`${p.name.padEnd(12)} ${MOTEUR.padEnd(6)} ${s.cle.padEnd(9)} → ${r.status} ${d.id ?? d.error ?? ''}`)
  }
}

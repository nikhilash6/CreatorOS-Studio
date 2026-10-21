# Textes de façonnage

Les textes que le serveur relit **à chaque job** : system prompts du réécriveur
(intention + consignes moteur), étalon du carrousel, consigne des captions.
Par défaut le serveur lit ce dossier-ci (`CREATOROS_PROMPTS` pour en pointer un
autre). Une modification prend effet au job suivant, sans redémarrage.
Éditables depuis le Workbench (⚙ → Textes) ; chaque écriture garde une copie
horodatée dans `.backups/`.

| fichier | pilote |
|---|---|
| `intent_sfw.txt` | intention globale du réécriveur (sujet, limites SFW) |
| `engine_klein.txt` | consignes d'écriture — photo Klein |
| `engine_wan.txt` | consignes d'écriture — vidéo Wan (muet) |
| `engine_ltx.txt` | consignes d'écriture — vidéo LTX (avec son) |
| `engine_motion.txt` | consignes d'écriture — motion control Wan Animate 2 |
| `engine_edit.txt` | instruction de retouche (Qwen-Image-Edit) |
| `rewrite_sfw.txt`, `rewrite_video_sfw.txt` | réécriveurs de repli si un fichier ci-dessus manque |
| `shoot_sfw.txt` | plans d'étalonnage du carrousel |
| `caption.txt` | consigne du rédacteur de captions des reels |
| `mood_golden_playful.txt` | couche d'ambiance optionnelle |

Fichiers optionnels reconnus : `examples_sfw.txt` (exemples de style photo),
`soul_<nom>.txt` / `mood_<nom>.txt` (couches additives), `poses_sfw.txt`
(postures du carrousel, une par ligne), `engine_krea.txt` (moteur Krea).

`server/prompts.seed.js` en porte une graine, écrite sur le disque **seulement
si le fichier manque**.

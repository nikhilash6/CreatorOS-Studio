# Workflows

Recettes ComfyUI au **format API** (export « Save (API) »), lues par le serveur
à chaque job (`CREATOROS_WORKFLOWS`, par défaut ce dossier). Aucune recette ne
dépend d'une LoRA de persona : le serveur empile celles déclarées dans
`persona.json` au moment du job (après la dernière `LoraLoaderModelOnly` de la
recette, sinon sur l'`UNETLoader`).

Une recette peut déclarer dans un fichier voisin `<recette>.pilotage.json` quelle
entrée de quel nœud reçoit `prompt`, `negative`, `seed`, `width`, `height`,
`sourceImage` — la déclaration l'emporte sur la détection par le câblage.

## Recettes attendues

| fichier | présent | rôle | ce que le serveur écrit |
|---|---|---|---|
| `PROD_gen_sfw.json` | oui | photo, FLUX.2 Klein 9B | prompt (`CLIPTextEncode` remonté depuis le `positive` du `KSampler`), seed, dimensions (`Empty*Latent*`), `SaveImage.filename_prefix`. Sert aussi au **pinceau photo** : il faut exactement un `KSampler`, un `VAEDecode`, au moins un `SaveImage`, un `CLIPTextEncode` sur le `positive` ; le serveur ajoute `LoadImage`, `ImageToMask`, `GrowMaskWithBlur` (KJNodes), `VAEEncode`, `SetLatentNoiseMask`, `ImageCompositeMasked` |
| `PROD_gen_krea_sfw.json` | non | photo, Krea 2 (si `CREATOROS_PHOTO_ENGINE=krea`) | idem ; latent `EmptySD3LatentImage`/`EmptyLatentImage` agrandi à 2 MP |
| `PROD_edit.json` | non | retouche par instruction, Qwen-Image-Edit 2511 | un seul `LoadImage` (image source) ; instruction ajoutée au `prompt` du `TextEncodeQwenImageEdit*` branché sur le `positive` du `KSampler` |
| `PROD_photo_hd.json` | non | « Passer en HD » photo | nœuds **nommés** : `10` LoadImage (`image`), `30` encodeur texte (`text`), `40` sampler (`denoise`, `seed`), `SaveImage` |
| `PROD_video_wan.json`, `PROD_video_wan_ctx.json` | ctx : oui | i2v Wan 2.2 (direct ≤ 8 s, fenêtres de contexte au-delà) | prompt remonté depuis `KSamplerAdvanced` → `WanImageToVideo.positive` ; `LoadImage` (still) ; `WanImageToVideo.length/width/height` ; `steps` ; `CreateVideo`/`SaveVideo` |
| `PROD_video_wan_t2v.json` | oui | texte → vidéo Wan 2.2 T2V-A14B avec un personnage à LoRA Wan haut / bas bruit (Aisha) | prompt remonté depuis `KSamplerAdvanced` → `WanImageToVideo.positive` (sans `start_image` : latent vide) ; `WanImageToVideo.length/width/height` ; `noise_seed` ; LoRA du personnage routées par nom (`…high_noise…` / `…low_noise…`) sur la chaîne de leur étage ; RIFE ×2 au harvest |
| `PROD_video_ltx_hq.json` | non | i2v LTX-2.5 avec son | prompt (via `LTXVDualCFGGuider`/`LTXVConditioning`), durée (`EmptyLTXVLatentVideo.length` ← primitives), `ResolutionSelector` (format, mégapixels du brouillon), étage audio retirable |
| `PROD_motion_480.json`, `PROD_motion_720.json` | oui | motion control Wan Animate 2 (prévisu / final) | nœuds **nommés** : `189` LoadImage (still), `240` LoadVideo (driver), `261:247` WanAnimate2ToVideo (`length`, `pose_strength`, `reference_image_strength`), `261:3` et `261:222` CLIPTextEncode (scène, mouvement), `261:19` SamplerCustom (`noise_seed`), `246` SaveVideo, `261:257` ContextWindowsManual, `261:258` ComfySwitchNode ; pour les clips longs `261:6`, `261:223`, `261:298`, `261:299`, `245` |
| `PROD_v2v_refine.json` | non | refine V2V (agrandissement d'un brouillon) | nœuds **nommés** : `20` VHS_LoadVideo (`video`, `custom_width`, `custom_height`, `force_rate`), `12` KSampler (`denoise`, `seed`), `14` VAEDecode, `15` CreateVideo (`audio` optionnel), `SaveVideo` ; le serveur ajoute un nœud `RIFE VFI` |
| `PROD_v2v_refine_masked.json` | non | pinceau vidéo | nœuds **nommés** : `20` VHS_LoadVideo, `12` KSampler, `8` CLIPTextEncode, `14` VAEDecode, `15` CreateVideo, `16` SaveVideo, `trk` SAM3_VideoTrack (`initial_mask`, `max_objects`), `m0` (masque issu du suivi), `mg` (agrandissement de masque : `mask`, `expand`) ; `cface`/`sam3` supprimés par le serveur |

Les fichiers `VB_*.json` sont des variantes de banc du motion control : le
serveur ne les sert pas.

Le diagnostic (`/api/diagnostic`) vérifie que chaque nœud et chaque fichier de
modèle nommé par une recette servie existe dans ComfyUI.

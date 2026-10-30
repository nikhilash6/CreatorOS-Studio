# Lab: real render times and peak VRAM

Every recipe rendered once with the same prompt and seed (2026-10-30, NVIDIA GeForce RTX 5090, 32607 MiB). Before each run ComfyUI unloads every model, so the peak is the recipe alone. On a large card ComfyUI keeps the text encoder and the model resident together, so these peaks are higher than what the recipe strictly needs.

The "12 GB card" rows replay the exact same graph with the light weights on a second ComfyUI started with `--vram-headroom 18.5` on the 32 GB card, so it only has about 11.5 GB of VRAM to work with (`scripts/bancs/labo-petite-carte.mjs`). Finishing there means the recipe runs on a 12 GB card.

Prompt: *A woman in a mustard raincoat crossing a rainy city street at dusk, neon reflections on wet asphalt, candid street photo, 35mm*. Videos start from the Krea 2 photo, 4 s: *she walks forward under the rain and glances to the side, slow tracking shot*.

| Recipe | Render time | Peak VRAM | Result |
|---|---|---|---|
| Photo · Krea 2 | 18.6 s | 19.3 GB | <img src="lab/photo_krea.jpg" width="160"> |
| Photo · FLUX.2 Klein 9B | 7.2 s | 17.8 GB | <img src="lab/photo_klein9.jpg" width="160"> |
| Image to video · Wan 2.2 A14B fp8 | 224.7 s | 25.3 GB | <img src="lab/video_wan.jpg" width="160"> |
| Image to video + sound · LTX-2.5 22B | 110.2 s | 29.6 GB | <img src="lab/video_ltx.jpg" width="160"> |
| Photo · FLUX.2 Klein 4B (12 GB card) | 6.4 s | 10.7 GB | <img src="lab/photo_klein9_12go.jpg" width="160"> |

Reproduce: `node scripts/bancs/labo.mjs` with the studio running. The 12 GB rows use the light weights the setup wizard installs for small cards (`npm run setup -- --vram 12`), which the studio swaps in automatically on a small card.

#!/usr/bin/env python
"""Mix (remplacement WanAnimate) : les points SAM2 qui désignent le sujet du driver.
   args : driver_path gen_w gen_h [sujet]
   sortie stdout : JSON {"positive": [{x, y}, ...], "frame": [w, h]}
   GroundingDINO trouve la plus grande boîte du sujet sur une image nette (~1 s) ;
   trois points sur son axe vertical, en espace génération (gen_w × gen_h).
   Lancé avec le Python de ComfyUI (COMFY_DIR), qui porte comfyui_segment_anything."""
import sys, os, json, subprocess, tempfile, warnings
warnings.filterwarnings("ignore")
COMFY = os.environ.get("COMFY_DIR") or os.path.join(os.path.expanduser("~"), "ComfyUI")
sys.path.insert(0, COMFY)
sys.path.insert(0, os.path.join(COMFY, "custom_nodes", "comfyui_segment_anything"))
from PIL import Image

driver, GW, GH = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
sujet = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4].strip() else "woman"

fd, tmp = tempfile.mkstemp(suffix=".png"); os.close(fd)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "1", "-i", driver, "-frames:v", "1", tmp], check=True)
img = Image.open(tmp).convert("RGB"); W, H = img.size
os.remove(tmp)

import node as sa
dino = sa.load_groundingdino_model("GroundingDINO_SwinT_OGC (694MB)")
b = sa.groundingdino_predict(dino, img, sujet, 0.30)
bs = [] if b is None else b.cpu().numpy().tolist()
x0, y0, x1, y1 = max(bs, key=lambda r: (r[2] - r[0]) * (r[3] - r[1])) if bs else (0, 0, W, H)

sx, sy = GW / W, GH / H
cx = (x0 + x1) / 2
pos = [{"x": int(round(cx * sx)), "y": int(round((y0 + (y1 - y0) * f) * sy))} for f in (0.22, 0.42, 0.6)]
print(json.dumps({"positive": pos, "frame": [W, H]}))

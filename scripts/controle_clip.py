#!/usr/bin/env python3
"""Contrôle d'un clip rendu, en mesures (pas de modèle de langue) : une à deux secondes par clip.

  python3 scripts/controle_clip.py CLIP.mp4 [--ref IMAGE] [--modeles DOSSIER]

Rend un JSON sur la sortie standard :
  { "duree": s, "images": n, "problemes": [{type, debut, fin, detail, grave}], "visage": {...} | null }

Défauts cherchés :
  noir    — images presque noires pendant au moins 0,3 s
  fige    — l'image ne bouge plus pendant au moins 1 s
  saute   — un changement brutal d'une image à la suivante (une coupe au milieu du plan)
  flou    — la netteté s'effondre pendant au moins 0,5 s (bouillie, image étalée)
  visage  — le visage ne ressemble plus à la référence (SFace, distance cosinus)

Le visage demande les modèles OpenCV (Apache-2.0) face_detection_yunet_2023mar.onnx et
face_recognition_sface_2021dec.onnx dans --modeles ; sans eux, ce contrôle est sauté.
"""
import argparse, json, os, sys

import cv2
import numpy as np

SEUIL_SFACE = 0.363          # seuil « même personne » publié pour SFace (cosinus)


def lire(chemin, largeur=256):
    cap = cv2.VideoCapture(chemin)
    fps = cap.get(cv2.CAP_PROP_FPS) or 16.0
    petites, pleines = [], []
    while True:
        ok, im = cap.read()
        if not ok:
            break
        h, w = im.shape[:2]
        g = cv2.cvtColor(cv2.resize(im, (largeur, max(1, int(h * largeur / w)))), cv2.COLOR_BGR2GRAY)
        petites.append(g)
        pleines.append(im)
    cap.release()
    return fps, petites, pleines


def plages(drapeaux, fps, min_s):
    """Suites d'images marquées, d'au moins min_s secondes → [(debut_s, fin_s)]."""
    out, debut = [], None
    for i, d in enumerate(list(drapeaux) + [False]):
        if d and debut is None:
            debut = i
        elif not d and debut is not None:
            if (i - debut) / fps >= min_s:
                out.append((round(debut / fps, 2), round(i / fps, 2)))
            debut = None
    return out


def controler(chemin, ref=None, modeles=None):
    fps, g, pleines = lire(chemin)
    if len(g) < 4:                      # lecture ratée de temps en temps : on relit une fois
        fps, g, pleines = lire(chemin)
    n = len(g)
    res = {'duree': round(n / fps, 2), 'images': n, 'fps': round(fps, 2), 'problemes': [], 'visage': None}
    if n < 4:
        res['problemes'].append({'type': 'illisible', 'debut': 0, 'fin': 0, 'detail': 'moins de 4 images', 'grave': False})
        return res
    luma = np.array([x.mean() for x in g])
    diffs = np.array([0.0] + [float(np.abs(g[i].astype(np.int16) - g[i - 1]).mean()) for i in range(1, n)])
    nettete = np.array([cv2.Laplacian(x, cv2.CV_64F).var() for x in g])

    for a, b in plages(luma < 12, fps, 0.3):
        res['problemes'].append({'type': 'noir', 'debut': a, 'fin': b, 'detail': f'noir pendant {b - a:.1f} s', 'grave': True})
    # figé : quasi aucune variation d'une image à l'autre (un plan fixe garde toujours un peu de vie)
    for a, b in plages(diffs[1:] < 0.35, fps, 1.0):
        res['problemes'].append({'type': 'fige', 'debut': a, 'fin': b, 'detail': f'figé pendant {b - a:.1f} s', 'grave': True})
    # saute : une différence isolée, très au-dessus du mouvement habituel du clip
    med = float(np.median(diffs[1:])) or 0.01
    for i in range(1, n):
        if diffs[i] > max(28.0, 8 * med):
            t = round(i / fps, 2)
            res['problemes'].append({'type': 'saute', 'debut': t, 'fin': t, 'detail': f'saute à {t:.1f} s', 'grave': True})
    # flou : netteté sous 35 % de la médiane du clip, assez longtemps pour se voir
    medn = float(np.median(nettete)) or 1.0
    for a, b in plages(nettete < 0.35 * medn, fps, 0.5):
        res['problemes'].append({'type': 'flou', 'debut': a, 'fin': b, 'detail': f'image floue ou étalée pendant {b - a:.1f} s', 'grave': (b - a) >= 1.5})

    if ref and modeles:
        res['visage'] = visage(pleines, fps, ref, modeles)
        v = res['visage']
        if v and v.get('score') is not None and v['score'] < SEUIL_SFACE:
            res['problemes'].append({'type': 'visage', 'debut': 0, 'fin': res['duree'],
                                     'detail': f"visage peu ressemblant (score {v['score']:.2f}, seuil {SEUIL_SFACE})", 'grave': False})
        elif v and v.get('plage_basse'):
            a, b = v['plage_basse']
            res['problemes'].append({'type': 'visage', 'debut': a, 'fin': b,
                                     'detail': f'le visage s’éloigne de la référence de {a:.1f} à {b:.1f} s', 'grave': False})
    return res


def visage(pleines, fps, ref, modeles):
    det_p = os.path.join(modeles, 'face_detection_yunet_2023mar.onnx')
    rec_p = os.path.join(modeles, 'face_recognition_sface_2021dec.onnx')
    if not (os.path.exists(det_p) and os.path.exists(rec_p)):
        return None
    det = cv2.FaceDetectorYN.create(det_p, '', (320, 320), 0.8)
    rec = cv2.FaceRecognizerSF.create(rec_p, '')

    def empreinte(im):
        h, w = im.shape[:2]
        det.setInputSize((w, h))
        _, faces = det.detect(im)
        if faces is None or not len(faces):
            return None
        f = max(faces, key=lambda x: x[2] * x[3])          # le plus grand visage
        # un visage trop petit ou mal vu est souvent quelqu'un en arrière-plan, ou le
        # personnage de profil et coupé : on ne le compare pas (« non mesurable »)
        if f[2] < 0.06 * w or f[-1] < 0.9:
            return None
        return rec.feature(rec.alignCrop(im, f))

    imref = cv2.imread(ref)
    if imref is None:
        return {'erreur': 'référence illisible'}
    eref = empreinte(imref)
    if eref is None:
        return {'erreur': 'aucun visage dans la référence'}
    pas = max(1, int(round(fps / 2)))          # deux mesures par seconde
    scores, temps = [], []
    for i in range(0, len(pleines), pas):
        e = empreinte(pleines[i])
        if e is not None:
            scores.append(float(rec.match(eref, e, cv2.FaceRecognizerSF_FR_COSINE)))
            temps.append(round(i / fps, 2))
    if len(scores) < 3:
        return {'score': None, 'mesures': len(scores), 'detail': 'visage trop peu visible pour être mesuré'}
    s = np.array(scores)
    out = {'score': round(float(np.median(s)), 3), 'min': round(float(s.min()), 3), 'mesures': len(s)}
    bas = [t for t, x in zip(temps, scores) if x < SEUIL_SFACE]
    if bas and len(bas) >= max(2, len(s) // 4):
        out['plage_basse'] = (bas[0], bas[-1])
    return out


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('clip')
    p.add_argument('--ref')
    p.add_argument('--modeles')
    a = p.parse_args()
    try:
        print(json.dumps(controler(a.clip, a.ref, a.modeles), ensure_ascii=False))
    except Exception as e:      # le contrôle ne doit jamais casser un rendu
        print(json.dumps({'erreur': str(e)[:300]}, ensure_ascii=False))
        sys.exit(0)

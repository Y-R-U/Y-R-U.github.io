#!/usr/bin/env python3
"""Classic posters/covers pilot, step 2: hide every bit of text on the PD files picked by tools/pd_survey.mjs.
OCR (macOS Vision, tools/pd_ocr.swift) -> fill each padded text box with the median colour of its surroundings ->
OCR again (up to 3 passes, so text found only once the bigger letters are gone is caught too).
Writes media/cand/classic-posters/<hash>.jpg and data/candidates/classic-posters.json (never loaded by the game).
Usage: python3 tools/pd_mask.py   (needs: swiftc -O tools/pd_ocr.swift -o tools/pd_cache/pd_ocr)
"""
import hashlib, json, os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'tools/pd_cache')
OCR = os.path.join(CACHE, 'pd_ocr')
OUTDIR = os.path.join(ROOT, 'media/cand/classic-posters')
os.makedirs(OUTDIR, exist_ok=True)

def ocr(path):
    r = subprocess.run([OCR, path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)[0].get('boxes', [])

def mask(im, boxes):
    W, H = im.size
    d = ImageDraw.Draw(im)
    for b in boxes:
        x0, y0, w, h = b['x'] * W, b['y'] * H, b['w'] * W, b['h'] * H
        pad = max(4, h * 0.45)
        box = [max(0, x0 - pad), max(0, y0 - pad), min(W, x0 + w + pad), min(H, y0 + h + pad)]
        # median colour of the box and its surroundings
        crop = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad))).convert('RGB')
        px = sorted(crop.getdata(), key=lambda p: sum(p))
        col = px[len(px) // 2]
        d.rounded_rectangle(box, radius=int(pad), fill=col)
    return im

def main():
    picked = json.load(open(os.path.join(CACHE, 'picked.json')))
    items, report = [], []
    for x in picked:
        src = os.path.join(CACHE, f"{x['kind']}-{x['id']}.jpg")
        im = Image.open(src).convert('RGB')
        found = []
        tmp = os.path.join(CACHE, f"_tmp-{x['kind']}-{x['id']}.png")
        for _ in range(3):
            im.save(tmp)
            boxes = [b for b in ocr(tmp) if b['text'].strip()]
            if not boxes:
                break
            found += boxes
            im = mask(im, boxes)
        im.save(tmp)
        left = [b['text'] for b in ocr(tmp) if b['text'].strip()]
        os.remove(tmp)
        name = hashlib.sha1(f"clued-poster:{x['kind']}/{x['id']}".encode()).hexdigest()[:12] + '.jpg'
        im.thumbnail((900, 900))
        im.save(os.path.join(OUTDIR, name), quality=84)
        covered = sum(b['w'] * b['h'] for b in found)
        report.append({'id': f"{x['kind']}/{x['id']}", 'boxes': len(found), 'covered': round(covered, 3), 'ocrLeft': left})
        items.append({'id': x['id'], 'name': x['name'], 'kind': x['kind'], 'facts': {'year': x['year'], **({'by': x['by']} if x.get('by') else {})},
                      'media': {'img': [{'src': f'media/cand/classic-posters/{name}', 'w': im.size[0], 'h': im.size[1],
                                         'credit': x.get('artist') or 'Unknown', 'license': x['license'], 'page': x['page'],
                                         'caption': f"{'Poster' if x['kind'] == 'film' else 'Cover'}, text hidden",
                                         'key': f"{x['kind']}-{x['id']}", 'ref': f"classic-posters:new/{x['kind']}-{x['id']}",
                                         'textBoxes': len(found), 'textArea': round(covered, 3), 'ocrLeft': left}]}})
        print(f"{x['kind']}/{x['id']}: {len(found)} text boxes masked ({covered:.0%} of the picture), OCR after: {left or 'none'}")
    os.makedirs(os.path.join(ROOT, 'data/candidates'), exist_ok=True)
    pack = {'id': 'classic-posters-candidates', 'title': 'Classic posters: pilot', 'candidate': True, 'pilot': True,
            'notice': 'Public-domain posters and covers from Wikimedia Commons with all text hidden. Pilot only, not in the game.',
            'items': items}
    json.dump(pack, open(os.path.join(ROOT, 'data/candidates/classic-posters.json'), 'w'), indent=1)
    json.dump(report, open(os.path.join(CACHE, 'mask_report.json'), 'w'), indent=1)

main()

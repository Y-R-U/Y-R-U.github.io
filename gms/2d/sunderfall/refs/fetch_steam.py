#!/usr/bin/env python3
"""Pull candidate level-design screenshots from the Steam store API."""
import json, os, urllib.request, sys

GAMES = {
    "deadcells": 588650,
    "hollowknight": 367520,
    "ori_wotw": 1057090,
    "blasphemous2": 2114740,
    "ninesols": 1809540,
    "pop_lostcrown": 1918010,
    "roguelegacy2": 1253920,
    "skul": 1147560,
    "noita": 881100,
    "haveanicedeath": 1288420,
    "astralascent": 1280930,
    "enderlilies": 1369630,
    "grime": 1123050,
    "huntdown": 1017180,
    "katanazero": 460950,
    "aeternanoctis": 1517970,
    "sundered": 445980,
    "moonscars": 1668610,
    "thelastfaith": 1274600,
    "afterimage": 1785030,
    "broforce": 274190,
    "trine4": 690640,
    "ori_blindforest": 387290,
    "blazingchrome": 1029780,
}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cand")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0"}

for name, appid in GAMES.items():
    url = f"https://store.steampowered.com/api/appdetails?appids={appid}&filters=screenshots"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            data = json.load(r)
        shots = data[str(appid)]["data"]["screenshots"]
    except Exception as e:
        print(f"!! {name}: {e}")
        continue
    for i, s in enumerate(shots[:8]):
        dst = os.path.join(OUT, f"{name}_{i:02d}.jpg")
        if os.path.exists(dst):
            continue
        try:
            with urllib.request.urlopen(urllib.request.Request(s["path_full"], headers=UA), timeout=60) as r:
                open(dst, "wb").write(r.read())
        except Exception as e:
            print(f"!! {name}[{i}]: {e}")
    print(f"ok {name}: {min(len(shots),8)}")

#!/usr/bin/env python3
"""Pull candidate spritesheet / sprite-animation references off the itch.io CDN.

URLs were collected from each pack's public page; only the CDN preview images
are fetched. Everything lands in _cand/ for curation, reference use only.
"""
import os, urllib.request

B = "https://img.itch.zone/"

PACKS = {
    "luizmelo_heroknight": [
        "aW1hZ2UvNTgxMTI4LzMwNzY5NjcuZ2lm/original/p6b8z7.gif",
        "aW1hZ2UvNTgxMTI4LzMwNzY5NTguZ2lm/original/mdaU5F.gif",
    ],
    "luizmelo_evilwizard": [
        "aW1nLzI4Mjk2MzA3LnBuZw==/original/NC8nCw.png",
        "aW1hZ2UvNDcwNTc1Ny8yODExMTYyNi5naWY=/original/vLTGhE.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODIuZ2lm/original/tc%2FXFz.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODQuZ2lm/original/tb5mDO.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODYuZ2lm/original/G%2Fi0ln.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODMuZ2lm/original/tOUiJo.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODEuZ2lm/original/bDfFgM.gif",
        "aW1hZ2UvNzMyODA0LzQxMzUxODUuZ2lm/original/YfhlgU.gif",
    ],
    "luizmelo_huntress": [
        "aW1hZ2UvOTA5MDAyLzUxNTIwMTAuZ2lm/original/uvdmad.gif",
        "aW1hZ2UvOTA5MDAyLzUxNTIwMTIuZ2lm/original/ODnCz4.gif",
        "aW1hZ2UvOTA5MDAyLzUxNTIwMTEuZ2lm/original/Om%2FEVX.gif",
        "aW1hZ2UvOTA5MDAyLzUxNTIwMDguZ2lm/original/DcsdyZ.gif",
        "aW1hZ2UvOTA5MDAyLzUxNTIwMDkuZ2lm/original/Bumkpr.gif",
    ],
    "chierit_demonslime": [
        "aW1nLzYxODY5MjEuZ2lm/original/aLmlzQ.gif",
        "aW1nLzYxODkzMTYuZ2lm/original/OJXrfq.gif",
        "aW1nLzYxODkzMTkuZ2lm/original/hC1sYk.gif",
        "aW1nLzYxODkzMjEuZ2lm/original/xgH8qY.gif",
        "aW1nLzYxODkzMjMuZ2lm/original/tMy%2BVm.gif",
        "aW1nLzYxODkzMjcuZ2lm/original/xDnnD7.gif",
        "aW1nLzYxODkzMjkuZ2lm/original/yka%2BfY.gif",
        "aW1nLzYxODkzMzIuZ2lm/original/VocfTk.gif",
        "aW1nLzYxODkzMzUuZ2lm/original/%2FVjpDZ.gif",
        "aW1nLzYxODkzMzcuZ2lm/original/VV1Rot.gif",
        "aW1nLzYxODkzNDEuZ2lm/original/1TvheP.gif",
        "aW1nLzYxODkzNDUuZ2lm/original/z2SurR.gif",
        "aW1nLzYxODkzNDYuZ2lm/original/KyeKxJ.gif",
        "aW1nLzk3MDQ5MzMuZ2lm/original/%2FJqBre.gif",
        "aW1nLzI4Mjk0NzE3LnBuZw==/original/b3KwUR.png",
    ],
    "chierit_fireknight": [
        "aW1nLzg3MjU3NTIuZ2lm/original/RXy9CZ.gif",
        "aW1nLzIyNzE4MjgxLnBuZw==/original/NFmz3W.png",
        "aW1nLzcwMzM3MjcuZ2lm/original/03hMDn.gif",
        "aW1nLzcwMzM3MzAuZ2lm/original/6VKIcU.gif",
        "aW1nLzcwMzM3MzEuZ2lm/original/hamsPG.gif",
        "aW1nLzg3MjU3MDEuZ2lm/original/x%2BfCFV.gif",
        "aW1nLzcwMzM3MzYuZ2lm/original/dk%2FykB.gif",
        "aW1nLzcwMzM3NDMuZ2lm/original/jTpkYv.gif",
        "aW1nLzcwMzM3NDUuZ2lm/original/i8JrIU.gif",
        "aW1nLzcwMzM3NDYuZ2lm/original/VWHGC2.gif",
        "aW1nLzcwMzM3NDguZ2lm/original/ILmFnV.gif",
        "aW1nLzcwMzM3NTIuZ2lm/original/%2BdN%2Feh.gif",
        "aW1nLzcwMzM3NTMuZ2lm/original/yvxEsE.gif",
        "aW1nLzcwMzM3NTQuZ2lm/original/GXvYCp.gif",
        "aW1nLzg3MjU3MzMuZ2lm/original/yrKNSn.gif",
    ],
    "chierit_frostguardian": [
        "aW1nLzkzMzM5MjcucG5n/original/VkexfI.png",
        "aW1nLzkzMzQ3MTMucG5n/original/sR7k82.png",
        "aW1nLzk3MDQ5NDQuZ2lm/original/acJf0f.gif",
        "aW1nLzkzMjIzNTIuanBn/original/Ci%2BoBy.jpg",
        "aW1nLzkzMjcyMDQuZ2lm/original/j%2Bojpm.gif",
    ],
    "chierit_minotaur": [
        "aW1nLzIwNDc3MzYyLmdpZg==/original/KQmIrL.gif",
        "aW1nLzEzMjk3NjIxLmdpZg==/original/lFtuzH.gif",
        "aW1nLzIxOTkwNTgyLnBuZw==/original/U9iATQ.png",
        "aW1nLzIxMDU5NjExLnBuZw==/original/B11Bep.png",
        "aW1hZ2UvMzQzMTU1Ny8yMDQ3OTI5Mi5naWY=/original/zpMmY5.gif",
    ],
    "ansimuz_gothicvania_town": [
        "aW1hZ2UvMTc2NzYzLzgyNTI4Ni5wbmc=/original/ap%2BfUp.png",
        "aW1nLzI2OTE2MDYzLnBuZw==/original/NHJS9r.png",
        "aW1nLzI2NjA1NjI3LmdpZg==/original/ap67cJ.gif",
    ],
    "ansimuz_explosions": [
        "aW1nLzI2MTYyMjA1LnBuZw==/original/w0GAWM.png",
        "aW1hZ2UvMTMzODMxLzI2MDY0NTgwLmdpZg==/original/U%2Bm%2F5t.gif",
        "aW1hZ2UvMTMzODMxLzI2MTYyMjc2LmdpZg==/original/%2BYf1a5.gif",
    ],
    "ansimuz_warped_caves": [
        "aW1hZ2UvMTU3Nzg5LzcyNDI4MS5wbmc=/original/r0j3%2Fj.png",
        "aW1nLzI2OTE2MjI0LnBuZw==/original/W2m0QQ.png",
    ],
    "ansimuz_gothicvania_cemetery": [
        "aW1nLzEyODMxMzEucG5n/original/HzypcY.png",
        "aW1nLzI2OTE2MTE4LnBuZw==/original/r5WsNR.png",
        "aW1nLzI2ODI5MjEucG5n/original/wHr5OB.png",
        "aW1hZ2UvMjY2MTUyLzI2MTI0ODM3LmdpZg==/original/dHFohK.gif",
        "aW1hZ2UvMjY2MTUyLzI2MTI0ODYyLmdpZg==/original/RB8VED.gif",
        "aW1hZ2UvMjY2MTUyLzI2MTI0OTc0LmdpZg==/original/SB0k44.gif",
        "aW1hZ2UvMjY2MTUyLzI2MTI0OTM1LmdpZg==/original/Ri3B06.gif",
    ],
    "ansimuz_gothicvania_collection": [
        "aW1nLzE1ODg2MzU2LnBuZw==/original/aJTcDP.png",
        "aW1nLzI2NjE0MDI3LnBuZw==/original/QNKRE8.png",
        "aW1nLzI3MzU0NzUwLnBuZw==/original/paGU0X.png",
        "aW1nLzI3Nzg5NjIzLnBuZw==/original/ZSQ8%2BT.png",
        "aW1nLzE3MTI0NjI1LnBuZw==/original/V1Qa0k.png",
        "aW1nLzI2Mjk3MzM1LnBuZw==/original/FCvYnS.png",
    ],
    "ansimuz_grotto_escape": [
        "aW1nLzE1NTQyMzgyLnBuZw==/original/5VydUt.png",
        "aW1nLzI2OTE2MDQwLnBuZw==/original/40fwef.png",
        "aW1nLzI2NjA1NTU2LmdpZg==/original/KPs8H4.gif",
    ],
    "ansimuz_warped_city": [
        "aW1nLzE4MDU5NTAucG5n/original/aX4NRT.png",
        "aW1nLzI2OTE2MjA0LnBuZw==/original/9P29xk.png",
        "aW1nLzI2NjA1ODE4LmdpZg==/original/sy3WqX.gif",
    ],
    "fga_boss_sheets": [
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDU3LmpwZw==/original/HPAMoT.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDU2LmpwZw==/original/EHTMkl.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDU4LmpwZw==/original/p5XrCB.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDU5LmpwZw==/original/WZ5oE%2F.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDYxLmpwZw==/original/DvH9sL.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDYyLmpwZw==/original/MNTKxq.jpg",
        "aW1hZ2UvMTQ3NDMzNy84NTk5MDYzLmpwZw==/original/XBTY5F.jpg",
    ],
    "fga_explosion_sheets": [
        "aW1hZ2UvMTQ4NzI1MS84NjcwNjE1LmpwZw==/original/Dj0WhY.jpg",
        "aW1hZ2UvMTQ4NzI1MS84NjcwNjE2LmpwZw==/original/GoxKHc.jpg",
        "aW1hZ2UvMTQ4NzI1MS84NjcwNjE3LmpwZw==/original/OgQVUQ.jpg",
        "aW1hZ2UvMTQ4NzI1MS84NjcwNjE4LmpwZw==/original/0mUsRg.jpg",
    ],
    "fga_castle_interiors": [
        "aW1hZ2UvMzExODI2MC8xODYzNjA4OC5qcGc=/original/1%2Fg4QH.jpg",
        "aW1hZ2UvMzExODI2MC8xODYzNjA3OS5qcGc=/original/lh25EJ.jpg",
        "aW1hZ2UvMzExODI2MC8xODYzNjA4MC5qcGc=/original/vSkwX1.jpg",
        "aW1hZ2UvMzExODI2MC8xODYzNjA4Mi5qcGc=/original/hKTs68.jpg",
        "aW1hZ2UvMzExODI2MC8xODYzNjA4MS5qcGc=/original/r7SzWW.jpg",
    ],
}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cand")
os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0", "Referer": "https://itch.io/"}

for pack, paths in PACKS.items():
    for i, p in enumerate(paths):
        ext = p.rsplit(".", 1)[-1]
        dst = os.path.join(OUT, f"z_{pack}_{i:02d}.{ext}")
        if os.path.exists(dst):
            continue
        try:
            req = urllib.request.Request(B + p, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                open(dst, "wb").write(r.read())
        except Exception as e:
            print(f"!! {pack}[{i}]: {e}")
    print(f"ok {pack}")

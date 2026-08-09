#!/usr/bin/env python3
"""Build contact-sheet pages of the raw candidates so they can be eyeballed and culled."""
import os, subprocess, sys, math

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, "_cand")
SHEET = os.path.join(HERE, "_sheets")
os.makedirs(SHEET, exist_ok=True)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

kind = sys.argv[1]            # "steam" or "sprite"
per = int(sys.argv[2])
cols = int(sys.argv[3])

files = sorted(f for f in os.listdir(CAND) if not f.startswith("."))
files = [f for f in files if (f.startswith("z_") == (kind == "sprite"))]

pages = math.ceil(len(files) / per)
for p in range(pages):
    chunk = files[p * per:(p + 1) * per]
    cells = "".join(
        f'<figure><img src="../_cand/{f}"><figcaption>{i + p * per}: {f}</figcaption></figure>'
        for i, f in enumerate(chunk))
    html = f"""<meta charset=utf-8><style>
body{{margin:0;background:#111;color:#eee;font:11px/1.3 monospace}}
.g{{display:grid;grid-template-columns:repeat({cols},1fr);gap:6px;padding:6px}}
figure{{margin:0;background:#000;display:flex;flex-direction:column;align-items:center}}
img{{width:100%;height:190px;object-fit:contain;background:#1c1c22}}
figcaption{{padding:2px;color:#8f8;word-break:break-all;text-align:center}}
</style><div class=g>{cells}</div>"""
    hp = os.path.join(SHEET, f"{kind}_{p}.html")
    open(hp, "w").write(html)
    out = os.path.join(SHEET, f"{kind}_{p}.png")
    rows = math.ceil(len(chunk) / cols)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                    f"--screenshot={out}", f"--window-size=1900,{rows * 220 + 20}",
                    "--virtual-time-budget=4000", f"file://{hp}"],
                   capture_output=True)
    print(out)

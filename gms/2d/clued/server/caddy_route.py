#!/usr/bin/env python3
"""Idempotently add the clued API route to the games.br8t.com Caddy block.

Inserts `handle /gms/2d/clued/api/* { reverse_proxy 127.0.0.1:8012 }` and
wraps the block's bare `file_server` in `handle { }` so the route wins. Every
other vhost is left byte-for-byte alone. Backs up, validates, and restores the
backup if validation fails. Run as root on the box; reload Caddy afterwards.
"""
import shutil, subprocess, sys, time

PATH = sys.argv[1] if len(sys.argv) > 1 else "/etc/caddy/Caddyfile"
HOST = "games.br8t.com"
ROUTE = "/gms/2d/clued/api/*"
UPSTREAM = "127.0.0.1:8012"

src = open(PATH).read()
lines = src.split("\n")

start = next((i for i, l in enumerate(lines) if l.strip() == HOST + " {"), None)
if start is None:
    sys.exit(f"no '{HOST} {{' block found")
depth, end = 0, None
for i in range(start, len(lines)):
    depth += lines[i].count("{") - lines[i].count("}")
    if depth == 0:
        end = i
        break
if end is None:
    sys.exit("unbalanced braces in the games block")

block = lines[start:end + 1]
if any(ROUTE in l for l in block):
    print("route already present")
    sys.exit(0)

route = [f"\t# CLUED API (Go service, see gms/2d/clued/server)",
         f"\thandle {ROUTE} {{", f"\t\treverse_proxy {UPSTREAM}", "\t}"]
out = None
for j, l in enumerate(block):
    if l == "\tfile_server":
        out = block[:j] + route + ["\thandle {", "\t\tfile_server", "\t}"] + block[j + 1:]
        break
    if l == "\thandle {":
        out = block[:j] + route + block[j:]
        break
if out is None:
    sys.exit("could not find a top-level file_server or handle in the games block")

backup = f"{PATH}.bak-clued-{time.strftime('%Y%m%d-%H%M%S')}"
shutil.copy2(PATH, backup)
open(PATH, "w").write("\n".join(lines[:start] + out + lines[end + 1:]))
r = subprocess.run(["caddy", "validate", "--config", PATH, "--adapter", "caddyfile"], capture_output=True, text=True)
if r.returncode != 0:
    shutil.copy2(backup, PATH)
    sys.exit("caddy validate failed, restored backup:\n" + r.stderr[-2000:])
print(f"route added (backup {backup})")

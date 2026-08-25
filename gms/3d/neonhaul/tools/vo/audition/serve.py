#!/usr/bin/env python3
"""The audition page's server. `python3 -m http.server` cannot take the POST, which is the only
reason this exists.

    python3 tools/vo/audition/serve.py            # LAN, so a phone can reach it
    python3 tools/vo/audition/serve.py 8788 local # loopback only

**It binds to every interface, on purpose.** Aaron listens on his phone, and the first version
bound to 127.0.0.1 — which is unreachable from anything but this machine. The listening URL is
printed for each address the machine actually has, so the phone URL can be typed off the terminal
rather than guessed at.

That is a deliberate trade and it is worth naming: while this is running, anything on the same
network can read the audition clips and POST to /save. Everything it serves is a directory of
synthesised speech takes and a JSON of tick marks, it never leaves this folder, and it only runs
while somebody is auditioning. Pass `local` as the second argument for the old loopback behaviour.

Ratings are written to `votes.json` beside this file on every change, and the page also keeps a
copy in localStorage — so a server that is not running loses nothing, and Copy answers still works.
"""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import socket

HERE = os.path.dirname(os.path.abspath(__file__))
VOTES = os.path.join(HERE, 'votes.json')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
LOCAL_ONLY = len(sys.argv) > 2 and sys.argv[2].lower() in ('local', 'loopback', '127')
HOST = '127.0.0.1' if LOCAL_ONLY else '0.0.0.0'


def lan_addresses():
    """Every address this machine answers on, so the phone URL is read rather than guessed.
    `gethostbyname(gethostname())` alone returns 127.0.0.1 on a Mac often enough to be useless, so
    the real one is found by asking the routing table which source address it would use to reach
    the outside — no packet is sent by a UDP connect()."""
    found = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('192.0.2.1', 9))           # TEST-NET-1, deliberately unroutable
        found.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            a = info[4][0]
            if not a.startswith('127.') and a not in found:
                found.append(a)
    except Exception:
        pass
    return found


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def do_POST(self):
        if self.path.rstrip('/') not in ('/save', '/audition/save'):
            self.send_error(404)
            return
        n = int(self.headers.get('Content-Length') or 0)
        if n > 4_000_000:
            self.send_error(413)
            return
        try:
            body = json.loads(self.rfile.read(n) or b'{}')
        except Exception as e:
            self.send_error(400, str(e))
            return
        # ROUND STAMP. Round 1's votes were keyed by clip id, and round 2 REUSED four of those ids
        # for different audio (pc_m was recast, and the monologue's second "shit" became "crap"), so
        # a round-1 rating sitting under a round-2 id is a verdict on a take that no longer exists.
        # Clearing the file was not enough: a round-1 tab left open on Aaron's phone still held its
        # own copy in memory and posted it straight back, which is how two cleared ratings
        # reappeared. So each round writes its OWN file and a client only ever reads its own. A
        # stale tab can now only overwrite the round it belongs to.
        rnd = str(body.get('round') or 'r1')
        if not rnd.isalnum():
            self.send_error(400, 'bad round')
            return
        dest = VOTES if rnd == 'r1' else os.path.join(HERE, f'votes_{rnd}.json')
        tmp = dest + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(body, f, indent=1)
        os.replace(tmp, dest)
        v = body.get('votes') or {}
        print(f"  saved {len(v)} ratings -> {os.path.basename(dest)}", flush=True)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


if not os.path.exists(os.path.join(HERE, 'manifest.json')):
    sys.exit('manifest.json missing — run tools/vo/audition/build.py first')
n = len(json.load(open(os.path.join(HERE, 'manifest.json')))['items'])
print(f"NEONHAUL VO audition — {n} clips")
print(f"  this machine   http://127.0.0.1:{PORT}/")
if LOCAL_ONLY:
    print("  (loopback only — drop the 'local' argument to reach it from a phone)")
else:
    for a in lan_addresses():
        print(f"  ON YOUR PHONE  http://{a}:{PORT}/")
    if not lan_addresses():
        print("  no LAN address found — is this machine on a network?")
print(f"  ratings -> {VOTES}")
print("  ctrl-c to stop", flush=True)
try:
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
except KeyboardInterrupt:
    print("\n  stopped")

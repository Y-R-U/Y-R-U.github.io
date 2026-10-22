# LAN sink for ?dbg (js/core/debuglog.js): python3 tools/dbgsink.py [out.jsonl] — appends every line it receives.
import json, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
OUT = sys.argv[1] if len(sys.argv) > 1 else 'dbg.jsonl'
class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*'); self.send_header('Access-Control-Allow-Headers', '*')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        try:
            b = json.loads(body)
            with open(OUT, 'a') as f:
                for l in b.get('lines', []):
                    l['ip'] = self.client_address[0]; l['rx'] = round(time.time(), 1)
                    f.write(json.dumps(l, separators=(',', ':')) + '\n')
        except Exception as e:
            print('bad', e)
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass
ThreadingHTTPServer(('0.0.0.0', 8897), H).serve_forever()

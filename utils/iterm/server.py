#!/usr/bin/env python3
"""Local iTerm2 reminder service; standard library only, state outside the site."""
import argparse
import hmac
import ipaddress
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = Path.home() / 'Library/Application Support/YRU iTerm Scheduler'
LOCAL_NAMES = {'localhost', socket.gethostname().lower()}


def local_host(host):
    if host in LOCAL_NAMES:
        return True
    try:
        address = ipaddress.ip_address(host)
        return address.is_loopback or any(address in network for network in
            (ipaddress.ip_network('10.0.0.0/8'), ipaddress.ip_network('172.16.0.0/12'),
             ipaddress.ip_network('192.168.0.0/16')) if address.version == network.version)
    except (ValueError, TypeError):
        return False


def bridge(action, session_id='', prompt=''):
    try:
        result = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(HERE / 'bridge.js'),
                                 action, session_id, prompt], capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError('iTerm2 did not respond. Check macOS Automation permission; delivery may be uncertain.') from exc
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[:800] or 'iTerm2 automation failed.')
    return json.loads(result.stdout)


def integer(body, key, low, high):
    value = body.get(key)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{key} must be a whole number from {low} to {high}.')
    return value


def config(body):
    if not isinstance(body, dict):
        raise ValueError('Expected an object.')
    result = {'delay_seconds': integer(body, 'delay_seconds', 1, 31536000),
              'interval_seconds': integer(body, 'interval_seconds', 60, 31536000),
              'repeat_count': integer(body, 'repeat_count', 0, 1000)}
    for key in ('first_prompt', 'repeat_prompt'):
        value = body.get(key, 'continue')
        if not isinstance(value, str) or not value.strip() or len(value) > 4000:
            raise ValueError(f'{key} must contain 1–4000 characters.')
        if any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('Use a single-line prompt without terminal control characters.')
        result[key] = value
    sid = body.get('session_id')
    if not isinstance(sid, str) or not sid or len(sid) > 128:
        raise ValueError('Choose an iTerm2 session.')
    result['session_id'] = sid
    return result


class Scheduler:
    def __init__(self, directory, transport=bridge, clock=time.time):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(directory / 'schedules.sqlite3', check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.transport, self.clock = transport, clock
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY, session_id TEXT NOT NULL, session_name TEXT NOT NULL,
            first_prompt TEXT NOT NULL, repeat_prompt TEXT NOT NULL,
            delay_seconds INTEGER NOT NULL, interval_seconds INTEGER NOT NULL,
            repeat_count INTEGER NOT NULL, sent_count INTEGER NOT NULL DEFAULT 0,
            next_at REAL NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '',
            created_at REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY, schedule_id TEXT, at REAL, outcome TEXT, detail TEXT);
        ''')
        # Never silently retry a send interrupted between writing to iTerm and committing.
        self.db.execute("UPDATE schedules SET status='paused', error='Service restarted during delivery; check the terminal before resuming.' WHERE status='sending'")
        self.db.commit()

    def state(self):
        with self.lock:
            return {'schedules': [dict(r) for r in self.db.execute('SELECT * FROM schedules ORDER BY created_at DESC')],
                    'history': [dict(r) for r in self.db.execute('SELECT * FROM history ORDER BY id DESC LIMIT 100')],
                    'now': self.clock()}

    def save(self, body, schedule_id=None):
        values = config(body)
        sessions = self.transport('list')
        selected = next((s for s in sessions if s['id'] == values['session_id']), None)
        if not selected:
            raise ValueError('That session has closed. Refresh and choose a current session.')
        values.update(session_name=selected['name'], next_at=self.clock() + values['delay_seconds'])
        with self.lock, self.db:
            if schedule_id:
                row = self.db.execute('SELECT * FROM schedules WHERE id=?', (schedule_id,)).fetchone()
                if not row:
                    raise ValueError('Schedule not found.')
                if row['status'] == 'sending':
                    raise ValueError('Delivery is in progress. Try again in a moment.')
                self.db.execute('DELETE FROM schedules WHERE id=?', (schedule_id,))
            values.update(id=schedule_id or uuid.uuid4().hex, status='active', created_at=self.clock())
            keys = ','.join(values)
            self.db.execute(f'INSERT INTO schedules ({keys}) VALUES ({",".join("?" for _ in values)})', tuple(values.values()))
        return values['id']

    def action(self, schedule_id, action):
        with self.lock, self.db:
            row = self.db.execute('SELECT * FROM schedules WHERE id=?', (schedule_id,)).fetchone()
            if not row:
                raise ValueError('Schedule not found.')
            if row['status'] == 'sending':
                raise ValueError('Delivery is in progress. Try again in a moment.')
            if action == 'delete':
                self.db.execute('DELETE FROM schedules WHERE id=?', (schedule_id,))
            elif action == 'pause' and row['status'] == 'active':
                self.db.execute("UPDATE schedules SET status='paused' WHERE id=?", (schedule_id,))
            elif action == 'resume' and row['status'] == 'paused':
                # Future deadlines survive a pause; overdue reminders get a visible 1 minute grace.
                self.db.execute("UPDATE schedules SET status='active', error='', next_at=? WHERE id=?",
                                (max(row['next_at'], self.clock() + 60), schedule_id))
            else:
                raise ValueError('This action is not available for the current schedule.')

    def tick(self):
        # Claim durably before any external side effect. HTTP actions cannot change an in-flight job.
        with self.lock, self.db:
            row = self.db.execute("SELECT * FROM schedules WHERE status='active' AND next_at<=? ORDER BY next_at LIMIT 1", (self.clock(),)).fetchone()
            if row is None:
                return
            self.db.execute("UPDATE schedules SET status='sending' WHERE id=?", (row['id'],))
        try:
            prompt = row['first_prompt'] if row['sent_count'] == 0 else row['repeat_prompt']
            self.transport('send', row['session_id'], prompt)
        except Exception as exc:
            error = str(exc)[:1000]
            with self.lock, self.db:
                self.db.execute("UPDATE schedules SET status='paused', error=? WHERE id=?", (error, row['id']))
                self.db.execute('INSERT INTO history(schedule_id,at,outcome,detail) VALUES(?,?,?,?)',
                                (row['id'], self.clock(), 'paused', error))
        else:
            sent = row['sent_count'] + 1
            status = 'completed' if sent >= 1 + row['repeat_count'] else 'active'
            with self.lock, self.db:
                self.db.execute("UPDATE schedules SET status=?,sent_count=?,next_at=?,error='' WHERE id=?",
                                (status, sent, self.clock() + row['interval_seconds'], row['id']))
                self.db.execute('INSERT INTO history(schedule_id,at,outcome,detail) VALUES(?,?,?,?)',
                                (row['id'], self.clock(), 'sent', f'{row["session_name"]}: {prompt}'))
        with self.lock, self.db:
            self.db.execute('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 500)')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def allowed(self):
        try:
            host = urlsplit('http://' + self.headers.get('Host', ''))
            origin = self.headers.get('Origin')
            self.expected_origin = f'http://{host.hostname}:8888'
            return (host.port == self.server.server_port and local_host(host.hostname) and
                    origin in {self.expected_origin, None} and
                    self.headers.get('Sec-Fetch-Site') != 'cross-site')
        except ValueError:
            return False

    def respond(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        origin = self.headers.get('Origin')
        if origin and origin == getattr(self, 'expected_origin', None):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        if not self.allowed():
            return self.respond(403, {'error': 'Local YRU access only.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', 'http://localhost:8888'))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-YRU-Token')
        self.end_headers()

    def do_GET(self):
        if not self.allowed():
            return self.respond(403, {'error': 'Local YRU access only.'})
        try:
            path = urlsplit(self.path)
            if path.path == '/api/state':
                return self.respond(200, {**self.server.scheduler.state(), 'token': self.server.token})
            if path.path == '/api/sessions':
                return self.respond(200, {'sessions': self.server.scheduler.transport('list')})
            if path.path == '/api/preview':
                sid = parse_qs(path.query).get('session_id', [''])[0]
                return self.respond(200, self.server.scheduler.transport('preview', sid))
            self.respond(404, {'error': 'Not found.'})
        except Exception as exc:
            self.respond(503, {'error': str(exc)})

    def do_POST(self):
        if not self.allowed() or not hmac.compare_digest(self.headers.get('X-YRU-Token', ''), self.server.token):
            return self.respond(403, {'error': 'Reload the local scheduler page to reconnect.'})
        try:
            if self.headers.get('Content-Type') != 'application/json':
                raise ValueError('Expected application/json.')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 40000:
                raise ValueError('Invalid request size.')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('Expected an object.')
            if self.path == '/api/schedules':
                sid = body.pop('id', None)
                if sid is not None and not isinstance(sid, str):
                    raise ValueError('Invalid schedule ID.')
                return self.respond(200, {'id': self.server.scheduler.save(body, sid)})
            if self.path == '/api/action':
                if not isinstance(body.get('id'), str) or not isinstance(body.get('action'), str):
                    raise ValueError('Invalid schedule action.')
                self.server.scheduler.action(body['id'], body['action'])
                return self.respond(200, {'ok': True})
            self.respond(404, {'error': 'Not found.'})
        except (ValueError, TypeError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception as exc:
            self.respond(503, {'error': str(exc)})


def make_server(scheduler, port=8890, bind='0.0.0.0'):
    server = ThreadingHTTPServer((bind, port), Handler)
    server.scheduler, server.token = scheduler, secrets.token_hex(32)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=DEFAULT_DATA)
    parser.add_argument('--port', type=int, default=8890)
    args = parser.parse_args()
    os.umask(0o077)
    scheduler = Scheduler(args.data_dir)
    server = make_server(scheduler, args.port)
    def worker():
        while True:
            try:
                scheduler.tick()
            except Exception as exc:
                print(f'Scheduler error: {exc}', flush=True)
            time.sleep(1)
    threading.Thread(target=worker, daemon=True).start()
    print(f'iTerm scheduler listening on home network port {args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()

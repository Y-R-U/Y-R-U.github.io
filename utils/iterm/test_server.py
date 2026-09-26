import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from server import Scheduler, make_server


class Harness(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 1000
        self.sends = []
        self.failure = False
        self.scheduler = Scheduler(Path(self.tmp.name), self.transport, lambda: self.now)

    def tearDown(self):
        self.scheduler.db.close()
        self.tmp.cleanup()

    def transport(self, action, sid='', prompt=''):
        if action == 'list':
            return [{'id': 'a', 'name': 'Agent A'}, {'id': 'b', 'name': 'Agent B'}]
        if self.failure:
            raise RuntimeError('Session closed')
        self.sends.append((sid, prompt))
        return {'sent': True}

    def body(self, **changes):
        return dict(session_id='a', delay_seconds=60, interval_seconds=18120,
                    repeat_count=2, first_prompt='continue first', repeat_prompt='continue again', **changes)

    def create(self, **changes):
        body = self.body()
        body.update(changes)
        return self.scheduler.save(body)

    def row(self):
        return self.scheduler.state()['schedules'][0]


class SchedulerTests(Harness):
    def test_initial_and_exact_additional_repeats(self):
        self.create()
        self.scheduler.tick()
        self.assertEqual(self.sends, [])
        for when in (1060, 19180, 37300, 60000):
            self.now = when
            self.scheduler.tick()
        self.assertEqual(self.sends, [('a', 'continue first'), ('a', 'continue again'), ('a', 'continue again')])
        self.assertEqual(self.row()['status'], 'completed')

    def test_independent_sessions_and_one_shot(self):
        self.create(repeat_count=0)
        self.create(session_id='b', delay_seconds=120, repeat_count=0)
        self.now = 1060
        self.scheduler.tick()
        self.assertEqual(self.sends, [('a', 'continue first')])
        self.now = 1120
        self.scheduler.tick()
        self.assertEqual(self.sends[-1][0], 'b')
        self.assertTrue(all(s['status'] == 'completed' for s in self.scheduler.state()['schedules']))

    def test_wake_does_not_burst(self):
        self.create()
        self.now = 999999
        for _ in range(5):
            self.scheduler.tick()
        self.assertEqual(len(self.sends), 1)
        self.assertEqual(self.row()['next_at'], self.now + 18120)

    def test_failure_pauses_without_consuming_repeat(self):
        self.create()
        self.failure = True
        self.now = 1060
        self.scheduler.tick()
        self.assertEqual(self.row()['status'], 'paused')
        self.assertEqual(self.row()['sent_count'], 0)
        self.assertIn('Session closed', self.row()['error'])

    def test_pause_resume_and_delete(self):
        sid = self.create()
        self.scheduler.action(sid, 'pause')
        self.now = 1200
        self.scheduler.tick()
        self.assertEqual(self.sends, [])
        self.scheduler.action(sid, 'resume')
        self.assertEqual(self.row()['next_at'], 1260)
        self.scheduler.action(sid, 'delete')
        self.assertEqual(self.scheduler.state()['schedules'], [])

    def test_edit_resets_and_can_change_session(self):
        sid = self.create()
        self.now = 1060
        self.scheduler.tick()
        body = self.body(); body.update(session_id='b', delay_seconds=300)
        self.scheduler.save(body, sid)
        self.assertEqual(self.row()['sent_count'], 0)
        self.assertEqual(self.row()['next_at'], 1360)
        self.now = 1360
        self.scheduler.tick()
        self.assertEqual(self.sends[-1], ('b', 'continue first'))

    def test_persistence_and_uncertain_send_recovery(self):
        sid = self.create()
        self.scheduler.db.close()
        self.scheduler = Scheduler(Path(self.tmp.name), self.transport, lambda: self.now)
        self.assertEqual(self.row()['id'], sid)
        self.assertEqual(self.row()['status'], 'active')
        self.scheduler.db.execute("UPDATE schedules SET status='sending'")
        self.scheduler.db.commit()
        self.scheduler.db.close()
        self.scheduler = Scheduler(Path(self.tmp.name), self.transport, lambda: self.now)
        self.assertEqual(self.row()['status'], 'paused')
        self.assertIn('restarted during delivery', self.row()['error'])

    def test_input_validation(self):
        for change in ({'delay_seconds': -1}, {'repeat_count': 1.5}, {'repeat_count': True},
                       {'first_prompt': ''}, {'first_prompt': 'x\ny'}, {'first_prompt': '\x1b[A'},
                       {'first_prompt': 'x'*4001}, {'session_id': 'missing'}, {'interval_seconds': 0}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.create(**change)

    def test_inflight_mutation_blocked(self):
        sid = self.create()
        self.scheduler.db.execute("UPDATE schedules SET status='sending'")
        self.scheduler.db.commit()
        for action in ('pause', 'resume', 'delete'):
            with self.assertRaises(ValueError):
                self.scheduler.action(sid, action)
        with self.assertRaises(ValueError):
            self.scheduler.save(self.body(), sid)


class HTTPTests(Harness):
    def setUp(self):
        super().setUp()
        self.http = make_server(self.scheduler, 0, bind='127.0.0.1')
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown(); self.http.server_close(); self.thread.join()
        super().tearDown()

    def request(self, path='/api/state', body=None, **headers):
        headers = {'Origin': 'http://127.0.0.1:8888', **headers}
        request = Request(self.base+path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        return urlopen(request, timeout=3)

    def test_origin_and_host_rejection(self):
        for headers in ({'Origin': 'https://evil.example'}, {'Origin': 'null'}, {'Host': 'evil.example'},
                        {'Origin': 'http://192.168.0.99:8888'}, {'Sec-Fetch-Site': 'cross-site'}):
            with self.subTest(headers=headers), self.assertRaises(HTTPError) as error:
                self.request(**headers)
            self.assertEqual(error.exception.code, 403)

    def test_local_and_lan_origin(self):
        for host in ('127.0.0.1', 'localhost', '192.168.0.236'):
            with self.request(Host=f'{host}:{self.http.server_port}', Origin=f'http://{host}:8888') as response:
                self.assertEqual(response.headers['Access-Control-Allow-Origin'], f'http://{host}:8888')
                self.assertIn('token', json.load(response))

    def test_mutation_requires_token(self):
        with self.assertRaises(HTTPError) as error:
            self.request('/api/schedules', self.body(), **{'Content-Type':'application/json'})
        self.assertEqual(error.exception.code, 403)
        with self.request() as response:
            token = json.load(response)['token']
        with self.request('/api/schedules', self.body(), **{'Content-Type':'application/json', 'X-YRU-Token':token}) as response:
            self.assertIn('id', json.load(response))
        self.assertEqual(len(self.scheduler.state()['schedules']), 1)


if __name__ == '__main__':
    unittest.main()

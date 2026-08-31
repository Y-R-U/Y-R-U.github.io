// tools/vo/gen_lines.mjs — the encode loop and the poller, with the dev server faked out.
import { test, eq, ok } from '../../../tools/harness.mjs';
import { encodeLines } from '../../../tools/vo/gen_lines.mjs';
import { waitJob } from '../../../tools/vo/job.mjs';

const job = key => ({ key, node: 'n', i: 0, who: 'vail', text: 'hi', voice: 'bf_emma',
  speed: 1, pitch: 0, ttsSpeed: 1, hash: 'abcd1234', why: 'new' });
const okPost = async () => ({ ok: true, job: 'j1' });

async function run(jobs, results, wait) {
  const lines = {}, said = [];
  const r = await encodeLines({ jobs, results, post: okPost, wait, lines, log: m => said.push(m) });
  return { ...r, lines, said };
}

test('a tick is only ever printed for a clip that finished', async () => {
  const r = await run([job('a'), job('b')],
    [{ ok: false, error: 'kokoro refused it' }, { ok: true, seconds: 1.2 }],
    async () => ({ state: 'done', after: { bytes: 900 } }));
  eq(r.said.length, 1, 'one line for the one clip that landed');
  ok(r.said[0].includes('✓ b'), 'and it is the one that worked');
  ok(!Object.keys(r.lines).includes('a'), 'the refused take gets no ledger entry');
  eq(r.made, 1);
  eq(r.failed, [{ key: 'a', error: 'kokoro refused it' }]);
});

test('an encode that never finishes is named, not ticked', async () => {
  const r = await run([job('a')], [{ ok: true, seconds: 1 }],
    async () => ({ ok: false, state: 'error', error: 'gave up waiting for the encode job' }));
  eq(r.said, [], 'nothing is reported as made');
  eq(r.made, 0);
  ok(/gave up waiting/.test(r.failed[0].error), 'the timeout says so');
  eq(Object.keys(r.lines), [], 'and nothing enters the ledger');
});

test('waitJob polls past a minute and gives up out loud', async () => {
  let n = 0;
  const realFetch = globalThis.fetch, realSleep = globalThis.setTimeout;
  globalThis.setTimeout = fn => realSleep(fn, 0);
  globalThis.fetch = async () => ({ json: async () => (++n < 400 ? { state: 'running' } : { state: 'done', after: { bytes: 7 } }) });
  try {
    // 400 polls is past gen_lines' old 300-try, 60-second ceiling.
    const s = await waitJob('http://x', 'j1');
    eq(s.state, 'done', 'a slow encode is still waited for');
    globalThis.fetch = async () => ({ json: async () => ({ state: 'running' }) });
    const gave = await waitJob('http://x', 'j1');
    eq(gave.state, 'error', 'and an endless one ends as an error, not silence');
    ok(/gave up waiting/.test(gave.error));
  } finally { globalThis.fetch = realFetch; globalThis.setTimeout = realSleep; }
});

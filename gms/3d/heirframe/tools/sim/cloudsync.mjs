// Cloud save sync tests. node tools/sim/cloudsync.mjs
// The cloud is mocked at the module boundary: a fake server behind io.read/io.write with the same
// compare-and-swap rule as /lib/auth/cloud.js saveForUser. HF_CLOUD_SYNC=<path> tests another copy (mutation checks).
import { pathToFileURL } from 'node:url';
import { createGame } from '../../js/sim/game_state.js';
import { createSaveStore, memoryStorage, serialize } from '../../js/sim/save.js';

const modPath = process.env.HF_CLOUD_SYNC ? pathToFileURL(process.env.HF_CLOUD_SYNC).href : '../../js/cloud_sync.js';
const { createCloudSync, revOf, summarize, played, MIN_GAP, IDLE_PUSH } = await import(modPath);

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

// Real saves from the real sim, so summaries and checksums are the shipping ones.
function saveText({ seed = 7, level = 1, playSeconds = 0, credits = 0, contracts = 0 } = {}) {
  const g = createGame({ seed, store: createSaveStore(memoryStorage()) });
  Object.assign(g.state, { playSeconds, credits });
  g.state.player.level = level;
  g.state.stats.contractsDone = contracts;
  return serialize(g.state);
}

function rig({ text = null, base = null, owner = null, remote = null, live = false } = {}) {
  const env = { text, base, owner, at: 1, server: remote, offline: false, adopted: null, writes: 0, reads: 0, statuses: [], choice: null, t: 1e6, live };
  const io = {
    local: () => ({ text: env.text, base: env.base, owner: env.owner, at: env.at }),
    now: () => env.t,
    read: async () => { env.reads++; if (env.offline) throw new Error('offline'); return env.server ? structuredClone(env.server) : null; },
    write: async (uid, doc, expected) => {
      if (env.offline) throw new Error('offline');
      if ((env.server?.revision || null) !== expected) throw new Error('Cloud save changed; retry reconciliation');
      env.server = structuredClone(doc); env.writes++;
    },
    adopt: (doc, uid, chosen) => { if (env.live && !chosen) return false; env.adopted = doc; env.text = doc.text; return true; },
    setBase: (b, o) => { env.base = b; env.owner = o; },
    status: (s) => env.statuses.push(s),
    conflict: (c) => { env.choice = c; },
  };
  return { env, sync: createCloudSync(io) };
}
const doc = (text, owner = 'alice', savedAt = 5) => ({ revision: revOf(text), owner, savedAt, text });

const A = saveText({ level: 12, playSeconds: 4 * 3600, credits: 900, contracts: 30 });
const A2 = saveText({ level: 13, playSeconds: 4.2 * 3600, credits: 1200, contracts: 32 });
const B = saveText({ level: 9, playSeconds: 3 * 3600, credits: 400, contracts: 20 });
const BLANK = saveText({ playSeconds: 20 });
const NEWGAME = saveText({ seed: 99, level: 3, playSeconds: 900, contracts: 2 });

await test('summaries read the real save; a blank save is unplayed', () => {
  assert(summarize(A).level === 12 && played(summarize(A)), 'A summary');
  assert(!played(summarize(BLANK)), 'blank counts as played');
  assert(summarize('garbage') === null, 'corrupt text should not summarize');
});

await test('new device pulls the account save', async () => {
  const { env, sync } = rig({ remote: doc(A) });
  const v = await sync.connect('alice');
  assert(v === 'adopt' && env.text === A && env.writes === 0, `verdict ${v}, writes ${env.writes}`);
  assert(env.base === revOf(A) && env.owner === 'alice', 'base not recorded');
});

await test('a blank boot save on a new device never beats the account', async () => {
  const { env, sync } = rig({ text: BLANK, remote: doc(A) });
  const v = await sync.connect('alice');
  assert(v === 'adopt' && env.text === A && env.server.text === A, `verdict ${v}`);
});

await test('newer local progress pushes (fast-forward, no question)', async () => {
  const { env, sync } = rig({ text: A2, base: revOf(A), owner: 'alice', remote: doc(A) });
  const v = await sync.connect('alice');
  assert(v === 'push' && env.server.text === A2 && !env.choice, `verdict ${v}`);
  assert(env.base === revOf(A2), 'base not advanced');
});

await test('account ahead of an unchanged device adopts', async () => {
  const { env, sync } = rig({ text: A, base: revOf(A), owner: 'alice', remote: doc(A2) });
  const v = await sync.connect('alice');
  assert(v === 'adopt' && env.text === A2 && env.writes === 0, `verdict ${v}`);
});

await test('identical saves do nothing', async () => {
  const { env, sync } = rig({ text: A, remote: doc(A) });
  const v = await sync.connect('alice');
  assert(v === 'same' && env.writes === 0 && !env.adopted && sync.ready, `verdict ${v}`);
});

await test('both sides played since the last sync: asks, touches neither', async () => {
  const { env, sync } = rig({ text: B, base: revOf(saveText({ level: 5, playSeconds: 3600 })), owner: 'alice', remote: doc(A2) });
  const v = await sync.connect('alice');
  assert(v === 'conflict' && env.choice?.why === 'diverged', `verdict ${v} ${env.choice?.why}`);
  assert(env.writes === 0 && !env.adopted && env.text === B && env.server.text === A2, 'something was overwritten');
  assert(env.choice.local.sum.level === 9 && env.choice.remote.sum.level === 13, 'chooser summaries wrong');
});

await test('played offline before ever signing in: asks', async () => {
  const { env, sync } = rig({ text: B, remote: doc(A) });
  assert(await sync.connect('alice') === 'conflict' && env.writes === 0, 'should ask');
});

await test('a New Game on a synced device asks before replacing the account save', async () => {
  const { env, sync } = rig({ text: NEWGAME, base: revOf(A), owner: 'alice', remote: doc(A) });
  const v = await sync.connect('alice');
  assert(v === 'conflict' && env.choice.why === 'lineage' && env.writes === 0, `verdict ${v}`);
});

await test("another account's save on this device asks", async () => {
  const { env, sync } = rig({ text: B, base: revOf(B), owner: 'bob', remote: doc(A) });
  assert(await sync.connect('alice') === 'conflict' && env.choice.why === 'owner', 'should ask (owner)');
});

await test("a base recorded under another account never fast-forwards over this one", async () => {
  const { env, sync } = rig({ text: B, base: revOf(A), owner: 'bob', remote: doc(A) });
  assert(await sync.connect('alice') === 'conflict' && env.writes === 0, 'pushed bob\'s save over alice\'s');
});

await test('keep this device: writes it, and the account copy survives as prev', async () => {
  const { env, sync } = rig({ text: B, remote: doc(A) });
  await sync.connect('alice');
  assert(await sync.choose('local') === 'local', 'choose failed');
  assert(env.server.text === B && env.server.prev?.text === A && !env.choice && sync.ready, 'server state wrong');
});

await test('use account: adopts it', async () => {
  const { env, sync } = rig({ text: B, remote: doc(A) });
  await sync.connect('alice');
  assert(await sync.choose('remote') === 'remote' && env.text === A && env.writes === 0, 'did not adopt');
  assert(env.base === revOf(A), 'base not recorded');
});

await test('a live session never has the save swapped unasked', async () => {
  const { env, sync } = rig({ text: A, base: revOf(A), owner: 'alice', remote: doc(A2), live: true });
  const v = await sync.connect('alice');
  assert(v === 'conflict' && env.choice.why === 'newer' && env.text === A, `verdict ${v}`);
});

await test('offline: plays on locally, then syncs when back', async () => {
  const { env, sync } = rig({ text: A2, base: revOf(A), owner: 'alice', remote: doc(A) });
  env.offline = true;
  assert(await sync.connect('alice') === 'offline' && env.text === A2 && !sync.ready, 'offline handling');
  assert(await sync.flush(true) === 'idle', 'flushed while not ready');
  env.offline = false;
  assert(await sync.connect('alice') === 'push' && env.server.text === A2, 'did not catch up');
});

await test('signed out: no cloud calls at all', async () => {
  const { env, sync } = rig({ text: A });
  assert(await sync.connect(null) === 'local' && await sync.flush(true) === 'idle', 'not local-only');
  assert(env.reads === 0 && env.writes === 0, 'touched cloud');
});

await test('pushes are debounced: meaningful progress after the gap, playtime-only every 5 min', async () => {
  const { env, sync } = rig({ text: A, remote: doc(A) });
  await sync.connect('alice');
  env.text = A2;
  assert(await sync.flush() === 'pushed', 'first meaningful change not pushed');
  const A3 = saveText({ level: 14, playSeconds: 4.3 * 3600, credits: 1300, contracts: 33 });
  env.text = A3; env.t += 5000;
  assert(await sync.flush() === 'wait' && env.server.text === A2, 'wrote inside MIN_GAP');
  env.t += MIN_GAP;
  assert(await sync.flush() === 'pushed' && env.server.text === A3, 'did not push after the gap');
  const A3t = saveText({ level: 14, playSeconds: 4.3 * 3600 + 60, credits: 1300, contracts: 33 });
  env.text = A3t; env.t += MIN_GAP + 1;
  assert(await sync.flush() === 'wait', 'pushed a playtime-only change early');
  env.t += IDLE_PUSH;
  assert(await sync.flush() === 'pushed', 'playtime-only change never pushed');
  env.text = A3; env.t += 3000;
  assert(await sync.flush(true) === 'pushed', 'forced flush on hide did not push');
});

await test('another device saved meanwhile: flush reconciles instead of overwriting', async () => {
  const { env, sync } = rig({ text: A, remote: doc(A) });
  await sync.connect('alice');
  env.server = doc(B, 'alice', 9);     // the phone diverged from A
  env.text = A2; env.t += MIN_GAP + 1;
  const v = await sync.flush();
  assert(v === 'conflict' && env.server.text === B && env.writes === 0, `verdict ${v}`);
});

await test('another device fast-forwarded the account: the idle device adopts it', async () => {
  const { env, sync } = rig({ text: A, remote: doc(A) });
  await sync.connect('alice');
  env.server = doc(A2, 'alice', 9);
  const v = await sync.connect('alice');
  assert(v === 'adopt' && env.text === A2, `verdict ${v}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

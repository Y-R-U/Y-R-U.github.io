// Conversation-line clips. Barks are keyed {character, category, i} by tools/vo/gen_barks.mjs;
// a dialogue line has no answer for that, so its clip is named by the line's own `vo` basename and
// recorded in a `lines` section of the same ledger, data/vo.json. `lines` is the only key this file
// owns: the ledger is re-read at write time and folded through mergeLines, so barks generated in
// another window during a long run are not written back over. (It used to say mergeClips made this
// safe. mergeClips is gen_barks' half; nothing here ever called it.)
//
//   node tools/devserver.mjs &
//   node tools/vo/gen_lines.mjs [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashLine, speedOf, pitchOf, synthSpeed, mergeLines, CODEC, VO_DIR, RAW_DIR, INDEX_DOC }
  from '../../js/dev/chars/vo.js';
import { waitJob } from './job.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.WF_DEV || 'http://localhost:8796';
const force = process.argv.includes('--force');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const post = async (route, body) => {
  const r = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  return r.json();
};

export function planLines({ pack, cast, ledger, onDisk = null, force = false }) {
  const jobs = [], skip = [], problems = [];
  const have = ledger?.lines || {};
  for (const [nodeId, node] of Object.entries(pack || {})) {
    (node.lines || []).forEach((line, i) => {
      if (!line?.vo) return;
      const c = cast?.[line.who];
      if (!c) return problems.push(`${nodeId}[${i}]: unknown speaker "${line.who}"`);
      if (!c.voice) return problems.push(`${nodeId}[${i}]: ${line.who} has no voice`);
      const speed = speedOf(c), pitch = pitchOf(c);
      const hash = hashLine(line.text, c.voice, speed, pitch);
      const rec = have[line.vo];
      const present = onDisk ? onDisk.has(line.vo) : true;
      if (!force && rec?.hash === hash && present) return skip.push(line.vo);
      jobs.push({ key: line.vo, node: nodeId, i, who: line.who, text: line.text, voice: c.voice,
        speed, pitch, ttsSpeed: synthSpeed(speed, pitch), hash,
        why: !rec ? 'new' : !present ? 'file missing' : force ? 'forced' : 'changed' });
    });
  }
  return { jobs, skip, problems };
}

export const lineRecord = j => ({ node: j.node, i: j.i, who: j.who, text: j.text,
  file: `${VO_DIR}/${j.key}${CODEC.ext}`, raw: `${RAW_DIR}/${j.key}.wav`,
  voice: j.voice, speed: j.speed, pitch: j.pitch, ttsSpeed: j.ttsSpeed, hash: j.hash });

// Encode each take and record it. A clip only earns its ✓ — and its ledger entry — once the encode
// job says done; every other exit is a ✗ and a line the run reports as failed.
export async function encodeLines({ jobs, results, post, wait, lines, log = console.log }) {
  const failed = [];
  let made = 0;
  for (const [n, j] of jobs.entries()) {
    const r = results?.[n];
    if (!r?.ok) { failed.push({ key: j.key, error: r?.error || 'no tts result' }); continue; }
    const enc = await post('/api/encode', { src: `${RAW_DIR}/${j.key}.wav`, profile: CODEC.profile, out: j.key });
    if (!enc.ok) { failed.push({ key: j.key, error: `encode ${enc.error}` }); continue; }
    const s = await wait(enc.job);
    if (s.state !== 'done') { failed.push({ key: j.key, error: s.error || 'the encode job never finished' }); continue; }
    lines[j.key] = { ...lineRecord(j), seconds: r.seconds, rms: r.rms,
      bytes: s.after?.bytes ?? 0, encoded: true, at: Date.now() };
    made++;
    log(`  ✓ ${j.key}  ${r.seconds}s  ${lines[j.key].bytes}B  (${j.why})`);
  }
  return { made, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pack = read('data/conversations.json').nodes;
  const cast = read('data/characters.json').characters;
  const ledger = fs.existsSync(path.join(ROOT, INDEX_DOC)) ? read(INDEX_DOC) : { version: 1, clips: {} };
  const onDisk = new Set(fs.readdirSync(path.join(ROOT, VO_DIR))
    .filter(f => f.endsWith(CODEC.ext)).map(f => f.slice(0, -CODEC.ext.length)));

  const { jobs, skip, problems } = planLines({ pack, cast, ledger, onDisk, force });
  for (const p of problems) console.warn(`! ${p}`);
  console.log(`${jobs.length} to make, ${skip.length} unchanged`);
  if (!jobs.length) process.exit(problems.length ? 1 : 0);

  const tts = await post('/api/tts/batch', { jobs: jobs.map(j => ({ voice: j.voice, text: j.text,
    speed: j.ttsSpeed, out: `raw/${j.key}` })) });
  if (!tts.results) { console.error('tts failed:', tts.error || JSON.stringify(tts).slice(0, 300)); process.exit(1); }

  const lines = { ...(ledger.lines || {}) };
  const { made, failed } = await encodeLines({ jobs, results: tts.results,
    post, wait: id => waitJob(BASE, id), lines });
  for (const f of failed) console.error(`  ✗ ${f.key}: ${f.error}`);

  // Re-read: a bark run in another window may have written `clips` since this one started.
  const onDiskNow = fs.existsSync(path.join(ROOT, INDEX_DOC)) ? read(INDEX_DOC) : null;
  fs.writeFileSync(path.join(ROOT, INDEX_DOC), JSON.stringify(mergeLines(onDiskNow, lines), null, 2) + '\n');
  console.log(`${made}/${jobs.length} clips, ledger written`);
  process.exit(failed.length ? 1 : 0);
}

// Gate: every map-tower line (farm C-Tower 2, palace C-Tower 3, airbase C-Tower 4), every scold_nudge line and every story line that is
// not textOnly (data/story/lines.js -> audio/story/<id>.mp3 + narration.json) resolves to a clip on disk, including the
// callsign/runway splices the radio adds. --audio also measures each clip with ffmpeg: duration,
// loudness (-16 LUFS like the rest), true peak, and long internal silences (a runaway or broken take).
//   node data/barks/check_towers.mjs [--audio]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FARM_LINES } from '../airports/farm-lines.js';
import { AIRBASE_LINES } from '../airports/airbase-lines.js';
import { PALACE_LINES } from '../airports/palace-lines.js';
import palace from '../airports/palace.js';
import airbase from '../airports/airbase.js';
import farm from '../airports/farm.js';
import { BRIEF_LINES, RADIO_LINES } from '../story/lines.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VOICES = ROOT + 'audio/voices/';
const B = JSON.parse(readFileSync(VOICES + 'barks.json', 'utf8'));
const script = JSON.parse(readFileSync(ROOT + 'data/barks/script.json', 'utf8')).lines;
const TITLES = ['baron', 'baroness', 'viscount', 'viscountess', 'earl', 'countess', 'marquess', 'marchioness', 'duke', 'duchess',
  'archduke', 'archduchess', 'prince', 'princess', 'crown_prince', 'crown_princess', 'king', 'queen', 'emperor', 'empress',
  'majesty', 'highness', 'grace'];
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];

const want = [];   // [voice, id, kind]
const add = (v, id, kind) => want.push([v, id, kind]);
for (const l of [...FARM_LINES, ...AIRBASE_LINES, ...PALACE_LINES]) add(l.voice, l.id, l.intent.startsWith('splice') ? 'splice' : 'line');
for (const [def, lines] of [[farm, FARM_LINES], [airbase, AIRBASE_LINES], [palace, PALACE_LINES]]) {
  const v = lines[0].voice;
  if (def.towerLines !== lines) add(v, `${def.id}.towerLines`, 'wiring');
  if (lines.some((l) => l.callsign === 'pre')) {
    for (const t of TITLES) add(v, `${v}.cs_title_${t}`, 'splice');
    for (const d of DIGITS) add(v, `${v}.cs_digit_${d}`, 'splice');
  }
  if (lines.some((l) => l.rwy === 'post')) for (const r of def.runways.flatMap((rw) => rw.ends)) add(v, `${v}.rwy_${r}`, 'splice');
}
for (const l of script) if (l.intent === 'scold_nudge') add(l.voice, l.id, 'line');

const STORY = JSON.parse(readFileSync(ROOT + 'audio/story/narration.json', 'utf8')).lines || {};
const words = (t) => t.split(/\s+/).length;
let textOnly = 0;
for (const l of [...BRIEF_LINES, ...RADIO_LINES]) {
  if (l.textOnly) { textOnly++; continue; }
  // story clips have no maxSeconds; a runaway take is one far slower than ~2 words/s
  want.push([l.voice, l.id, 'story', { file: `../story/${l.id}.mp3`, meta: STORY[l.id], maxSeconds: 1.5 + words(l.text) / 1.8, text: l.text }]);
}

const fails = [], rows = [];
for (const [v, id, kind, st] of want) {
  if (kind === 'wiring') { fails.push(`${id}: airport def does not load its lines`); continue; }
  if (kind === 'story' && !st.meta) { fails.push(`story ${id}: not in audio/story/narration.json`); continue; }
  const e = kind === 'story' ? { file: st.file, maxSeconds: st.maxSeconds, wer: st.meta.wer, asr: st.meta.asr } : B[v]?.[id];
  if (!e) { fails.push(`${v}/${id}: not in barks.json`); continue; }
  const f = VOICES + e.file;
  if (!existsSync(f)) { fails.push(`${v}/${id}: ${e.file} missing`); continue; }
  if (statSync(f).size < 2000) fails.push(`${v}/${id}: ${statSync(f).size} bytes`);
  rows.push({ v, id, kind, e, f });
}

const audio = process.argv.includes('--audio');
const warn = [];
if (audio) {
  for (const r of rows) {
    const err = execFileSync('sh', ['-c', `ffmpeg -nostats -i "${r.f}" -af "silencedetect=noise=-40dB:d=0.7,ebur128=peak=true" -f null - 2>&1`], { encoding: 'utf8' });
    const I = +(err.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? -70);
    const P = +(err.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop()?.match(/-?[\d.]+/)?.[0] ?? -70);
    const D = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.f], { encoding: 'utf8' });
    const gaps = [...err.matchAll(/silence_duration: ([\d.]+)/g)].map((m) => +m[1]);
    const id = `${r.v}/${r.id}`;
    const lo = r.kind === 'splice' ? 0.15 : 0.6;
    if (D < lo) fails.push(`${id}: ${D.toFixed(2)} s, too short`);
    if (D > (r.e.maxSeconds || 4) * 1.35 + 0.3) fails.push(`${id}: ${D.toFixed(2)} s against ${r.e.maxSeconds} s (runaway?)`);
    if (r.kind !== 'splice' && (I < -19.5 || I > -13)) fails.push(`${id}: ${I} LUFS`);
    if (P > -0.5) fails.push(`${id}: peak ${P} dBFS`);
    if (gaps.some((g) => g > 1.0)) fails.push(`${id}: ${Math.max(...gaps).toFixed(2)} s silence inside`);
    if ((r.e.wer ?? 0) > 0.5) warn.push(`${id}: wer ${r.e.wer} heard "${r.e.asr}"`);
    r.stats = { D, I, P };
  }
}
const n = (k) => rows.filter((r) => r.kind === k).length;
console.log(`${want.length} required, ${rows.length} resolved (${n('line')} lines, ${n('splice')} splices, ${n('story')} story lines; ${textOnly} story lines still textOnly)${audio ? ', audio measured' : ''}`);
if (audio && rows.length) {
  const L = rows.filter((r) => r.kind !== 'splice').map((r) => r.stats.I);
  console.log(`line loudness ${Math.min(...L).toFixed(1)} .. ${Math.max(...L).toFixed(1)} LUFS`);
}
for (const w of warn) console.log('WARN', w);
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? `RED: ${fails.length} failures` : 'GREEN');
process.exit(fails.length ? 1 : 0);

#!/usr/bin/env node
/**
 * Builds js/data/music.js from assets/audio/music/tracks.json + whatever mp3s actually exist.
 *
 * The music agent writes tracks.json (metadata only a human knows: name, context, intensity,
 * bpm, key, plus optional playback overrides). This walks the real files, drops any entry whose
 * file is missing, MEASURES each one with ffmpeg, and emits the manifest the game and the
 * settings screen read. Regenerate after every music batch.
 *
 *   node tools/build_music_manifest.mjs [--check] [--report]
 *
 * Measured per file, in one ffmpeg pass (volumedetect + silencedetect + ebur128):
 *   seconds, meanDb, peakDb, lufs (integrated), truePeak
 *   head silence  -> default `startAt`   (never start a track on dead air)
 *   tail silence  -> default `loopEnd`   (never loop through dead air)
 *   lufs          -> `gainTrim`          (linear multiplier that levels every track to TARGET_LUFS)
 *
 * Any of `startAt` / `loopEnd` / `loopFadeS` / `gainTrim` / `loop` in tracks.json overrides the
 * measurement. core/audio.js honours all of them.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'assets/audio/music');
const META = join(DIR, 'tracks.json');
const OUT = join(ROOT, 'js/data/music.js');
const check = process.argv.includes('--check');
const report = process.argv.includes('--report');

const CONTEXTS = ['title', 'battle', 'boss', 'hangar', 'sting_win', 'sting_lose'];

/** Every track is levelled to this. Median of the 22 Suno tracks as generated, so trims stay small. */
const TARGET_LUFS = -17.5;
const TRIM_MIN = 0.5, TRIM_MAX = 2.0;      // -6 dB .. +6 dB, a hard fence against a bad measurement
const HEAD_SIL_MIN = 0.15;                 // ignore anything shorter — it is an attack transient
const TAIL_SIL_MIN = 0.25;
const DEFAULT_LOOP_FADE = 2.0;

const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith('.mp3') && !f.startsWith('probe_')).sort()
  : [];

const round = (v, n) => Number(v.toFixed(n));

/** One ffmpeg pass per file. Everything below is parsed out of its stderr. */
function measure(f) {
  // ffmpeg puts every one of these measurements on STDERR and exits 0, so this has to be
  // spawnSync — execFileSync only ever hands stderr back when the child throws.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f,
    '-af', 'volumedetect,silencedetect=noise=-45dB:d=0.2,ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = String(r.stderr || '') + String(r.stdout || '');

  const num = (re) => {
    const all = [...out.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
    return all.length ? Number(all[all.length - 1][1]) : null;
  };
  const seconds = (() => {
    try {
      return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
    } catch { return 0; }
  })();

  // silencedetect prints pairs in time order; head silence is a start at ~0, tail is a start
  // whose matching end is the end of the file.
  const marks = [...out.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)].map((m) => [m[1], Number(m[2])]);
  let headSil = 0, tailSil = seconds;
  for (let i = 0; i < marks.length; i++) {
    const [kind, t] = marks[i];
    if (kind === 'start' && t < 0.05) {
      const nxt = marks[i + 1];
      if (nxt && nxt[0] === 'end') headSil = Math.max(headSil, nxt[1]);
    }
    if (kind === 'start' && t > 0.05 && seconds - t > 0.05) {
      const nxt = marks[i + 1];
      // trailing silence = a silence that runs to (within 0.1 s of) the end of the file
      if (!nxt || (nxt[0] === 'end' && seconds - nxt[1] < 0.15)) tailSil = Math.min(tailSil, t);
    }
  }

  return {
    seconds: round(seconds, 2),
    meanDb: num(/mean_volume:\s*(-?[\d.]+)/),
    peakDb: num(/max_volume:\s*(-?[\d.]+)/),
    lufs: num(/\n\s*I:\s*(-?[\d.]+)\s*LUFS/),
    truePeak: num(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+)/),
    headSil: round(headSil, 3),
    tailSil: round(tailSil, 3),
  };
}

const rows = [];
const problems = [];
for (const f of files) {
  const id = f.replace(/\.mp3$/, '');
  const path = join(DIR, f);
  const m = meta[id] || {};
  const mm = measure(path);
  const kb = Math.round(statSync(path).size / 1024);

  // A silent or truncated download looks perfectly fine in a directory listing. Catch it here.
  if (mm.seconds < 4) problems.push(`${id}: only ${mm.seconds}s — truncated?`);
  if (mm.meanDb !== null && mm.meanDb < -60) problems.push(`${id}: mean volume ${mm.meanDb} dB — silent?`);
  if (mm.lufs === null) problems.push(`${id}: no loudness measurement — is ffmpeg's ebur128 filter present?`);
  const ctx = m.context || guessContext(id);
  if (!CONTEXTS.includes(ctx)) problems.push(`${id}: unknown context ${JSON.stringify(ctx)}`);

  const loop = m.loop !== undefined ? !!m.loop : !/^sting_/.test(ctx);

  const startAt = m.startAt !== undefined ? Number(m.startAt)
    : (mm.headSil >= HEAD_SIL_MIN ? round(Math.max(0, mm.headSil - 0.02), 2) : 0);

  const loopEnd = m.loopEnd !== undefined ? Number(m.loopEnd)
    : (mm.seconds - mm.tailSil >= TAIL_SIL_MIN ? round(mm.tailSil, 2) : round(mm.seconds - 0.02, 2));

  const body = Math.max(0.5, loopEnd - startAt);
  const loopFadeS = m.loopFadeS !== undefined ? Number(m.loopFadeS)
    : round(Math.min(DEFAULT_LOOP_FADE, body * 0.25), 2);

  const gainTrim = m.gainTrim !== undefined ? Number(m.gainTrim)
    : (mm.lufs === null ? 1
      : round(Math.min(TRIM_MAX, Math.max(TRIM_MIN, Math.pow(10, (TARGET_LUFS - mm.lufs) / 20))), 3));

  if (startAt >= loopEnd) problems.push(`${id}: startAt ${startAt} >= loopEnd ${loopEnd} — nothing would play`);
  if (loop && body < 2 * loopFadeS) problems.push(`${id}: body ${round(body, 2)}s is under two loop fades (${loopFadeS}s)`);
  if (mm.truePeak !== null && mm.truePeak + 20 * Math.log10(gainTrim) > 3)
    problems.push(`${id}: trimmed true peak ${round(mm.truePeak + 20 * Math.log10(gainTrim), 1)} dBTP — too hot`);

  rows.push({
    id, file: f, name: m.name || prettify(id), context: ctx,
    intensity: m.intensity || (/heavy/.test(id) ? 'heavy' : 'march'),
    acts: m.acts || [], bpm: m.bpm || 0, key: m.key || '', pairId: m.pairId || '',
    seconds: Math.round(mm.seconds), kb,
    loop, startAt, loopEnd, loopFadeS, gainTrim,
    lufs: mm.lufs, truePeak: mm.truePeak,
  });
}

function guessContext(id) {
  if (/^title/.test(id)) return 'title';
  if (/^boss/.test(id)) return 'boss';
  if (/hangar|radio|brief/.test(id)) return 'hangar';
  if (/victory|win/.test(id)) return 'sting_win';
  if (/defeat|lose|lost/.test(id)) return 'sting_lose';
  return 'battle';
}
function prettify(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const byCtx = {};
for (const r of rows) (byCtx[r.context] ||= []).push(r.id);
for (const c of ['title', 'battle', 'hangar']) {
  if (!byCtx[c]?.length) problems.push(`no track for context "${c}" — the game will be silent there`);
}

const src = `// GENERATED by tools/build_music_manifest.mjs — do not hand-edit; rerun after adding music.
// Every track the game can play. The settings screen lists these so a player can switch off any
// track they dislike; \`pickTrack\` skips disabled ids and degrades rather than going silent.
//
// Playback fields, all measured by the tool and overridable from tracks.json:
//   startAt   seconds — where the track (and every loop pass) begins; skips head dead air
//   loopEnd   seconds — where the outgoing pass begins its cross-loop; skips tail dead air
//   loopFadeS seconds — length of the cross-loop into itself
//   gainTrim  linear  — levels every track to ${TARGET_LUFS} LUFS integrated
//   loop      bool    — false for the two stings

export const MUSIC = ${JSON.stringify(rows, null, 2)};

export const MUSIC_BY_ID = Object.fromEntries(MUSIC.map((t) => [t.id, t]));

/**
 * Choose a track. \`disabled\` is the player's set of switched-off ids from settings.
 * Falls back through context -> battle -> anything, so one enabled track is enough to keep
 * the game scored. Returns null only when the player has switched everything off, which is
 * a legitimate way to ask for silence.
 */
export function pickTrack({ context = 'battle', act = 1, intensity = '', disabled = {}, rng = Math.random } = {}) {
  const live = MUSIC.filter((t) => !disabled[t.id]);
  const fits = (t) => !t.acts.length || t.acts.includes(act);
  const tiers = [
    live.filter((t) => t.context === context && fits(t) && (!intensity || t.intensity === intensity)),
    live.filter((t) => t.context === context && fits(t)),
    live.filter((t) => t.context === context),
    live.filter((t) => t.context === 'battle'),
    live,
  ];
  for (const tier of tiers) if (tier.length) return tier[Math.floor(rng() * tier.length) % tier.length];
  return null;
}

/** The other half of a march/heavy pair, for the live intensity crossfade. */
export function pairedTrack(id, intensity, disabled = {}) {
  const t = MUSIC_BY_ID[id];
  if (!t || !t.pairId) return null;
  return MUSIC.find((o) => o.pairId === t.pairId && o.intensity === intensity && !disabled[o.id]) || null;
}
`;

if (report) {
  const lufs = rows.map((r) => r.lufs).filter((v) => v !== null);
  console.log('id                         len   LUFS    TP   trim   startAt  loopEnd  fade  loop');
  for (const r of rows) {
    console.log(`${r.id.padEnd(24)} ${String(r.seconds).padStart(4)}  ${String(r.lufs).padStart(6)} ${String(r.truePeak).padStart(5)}  `
      + `${r.gainTrim.toFixed(3)}  ${String(r.startAt).padStart(6)}  ${String(r.loopEnd).padStart(7)}  ${String(r.loopFadeS).padStart(4)}  ${r.loop}`);
  }
  console.log(`\nLUFS before trim: ${Math.min(...lufs)} .. ${Math.max(...lufs)}  (spread ${round(Math.max(...lufs) - Math.min(...lufs), 1)} LU)`);
  const after = rows.map((r) => r.lufs + 20 * Math.log10(r.gainTrim));
  console.log(`LUFS after trim (predicted): ${round(Math.min(...after), 1)} .. ${round(Math.max(...after), 1)}  (spread ${round(Math.max(...after) - Math.min(...after), 1)} LU)`);
}

if (check) {
  console.log(`${rows.length} track(s):`);
  for (const c of CONTEXTS) if (byCtx[c]) console.log(`  ${c.padEnd(10)} ${byCtx[c].join(', ')}`);
  if (problems.length) { console.log('\nPROBLEMS:'); for (const p of problems) console.log('  ' + p); process.exit(1); }
  console.log('\nmanifest OK');
} else if (!report) {
  writeFileSync(OUT, src);
  console.log(`wrote js/data/music.js — ${rows.length} track(s), ${rows.reduce((s, r) => s + r.kb, 0)} KB total`);
  for (const p of problems) console.log('  WARN ' + p);
}

#!/usr/bin/env node
// Builds data/music.json (DEV_CONTRACT §9) from tools/music/jobs.json + the measured
// tools/music/results.json. `seconds` is always the ffprobe-measured value, never the request.
//
//   node tools/music/build_manifest.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const SETS = [
  { id: 'menu', label: 'Title / menu', tracks: ['menu_bed_01', 'hall_bed_02'], shuffle: false, fadeMs: 2000, volume: 0.6 },
  { id: 'academy_hall', label: 'Academy hall', tracks: ['hall_bed_01', 'hall_bed_02', 'menu_bed_01'], shuffle: true, fadeMs: 1500, volume: 0.55 },
  { id: 'outdoors', label: 'Meadows / outdoors', tracks: ['meadow_bed_01', 'meadow_bed_02', 'meadow_bed_03'], shuffle: true, fadeMs: 2000, volume: 0.55 },
  { id: 'tavern', label: 'Tavern (songs + instrumentals)', tracks: ['tavern_song_drinking_01', 'tavern_song_boast_01', 'tavern_song_jig_01', 'tavern_song_anthem_01', 'tavern_song_work_01', 'tavern_song_ballad_01', 'tavern_song_ballad_02', 'tavern_song_lament_01', 'tavern_inst_01', 'tavern_inst_02'], shuffle: true, fadeMs: 1200, volume: 0.7 },
  { id: 'tavern_songs', label: 'Tavern — sung only', tracks: ['tavern_song_drinking_01', 'tavern_song_boast_01', 'tavern_song_jig_01', 'tavern_song_anthem_01', 'tavern_song_work_01', 'tavern_song_ballad_01', 'tavern_song_ballad_02', 'tavern_song_lament_01'], shuffle: true, fadeMs: 1200, volume: 0.7 },
  { id: 'tavern_quiet', label: 'Tavern — late, no singing', tracks: ['tavern_inst_01', 'night_bed_01'], shuffle: true, fadeMs: 2500, volume: 0.5 },
  { id: 'tension', label: 'Approaching danger', tracks: ['tension_01', 'tension_02'], shuffle: true, fadeMs: 900, volume: 0.6 },
  { id: 'combat', label: 'Combat', tracks: ['combat_01', 'combat_02'], shuffle: true, fadeMs: 400, volume: 0.75 },
  { id: 'night', label: 'Night / quiet', tracks: ['night_bed_01', 'meadow_bed_03'], shuffle: true, fadeMs: 2500, volume: 0.45 },
  { id: 'stings', label: 'One-shot stings', tracks: ['victory_sting_01', 'victory_sting_02', 'defeat_sting_01', 'quest_sting_01'], shuffle: false, fadeMs: 200, volume: 0.85 },
];

const jobs = JSON.parse(await readFile(path.join(ROOT, 'tools/music/jobs.json'), 'utf8'));
const results = JSON.parse(await readFile(path.join(ROOT, 'tools/music/results.json'), 'utf8'));

// `ends` and `starts` are measured, not wished for (DEV_CONTRACT §9). They come from
// results.json, which measures the SHIPPED file — the encoder's compressor changes the tail
// envelope, so classifying the raw take gives a different (wrong) answer. A job may pin either
// by hand; the hand value wins. An earlier version of this file dropped both fields, so
// re-running it silently reverted hand edits in data/music.json.
const ENDS = new Set(['clean', 'abrupt']);
const STARTS = new Set(['clean', 'quiet']);
const pick = (set, ...vals) => vals.find(v => set.has(v)) ?? 'clean';

const tracks = [];
const missing = [];
for (const j of jobs) {
  const r = results[j.id];
  if (!r?.pass) { missing.push(j.id); continue; }
  tracks.push({
    id: j.id,
    title: j.title,
    file: `audio/music/${j.id}.mp3`,
    kind: j.kind,
    mood: j.mood,
    seconds: r.seconds,
    prompt: j.prompt,
    lyrics: j.lyrics || '',
    source: j.source || 'acestep',
    ends: pick(ENDS, j.ends, r.ends),
    starts: pick(STARTS, j.starts, r.starts),
  });
}

const have = new Set(tracks.map(t => t.id));
const sets = SETS.map(s => ({ ...s, tracks: s.tracks.filter(t => have.has(t)) }))
  .filter(s => s.tracks.length);

await writeFile(path.join(ROOT, 'data/music.json'),
  JSON.stringify({ version: 1, tracks, sets }, null, 2) + '\n');

console.log(`data/music.json — ${tracks.length} tracks, ${sets.length} sets`);
const abrupt = tracks.filter(t => t.ends === 'abrupt').map(t => t.id);
const quiet = tracks.filter(t => t.starts === 'quiet').map(t => t.id);
console.log(`  ends:abrupt   ${abrupt.length}${abrupt.length ? ' — ' + abrupt.join(', ') : ''}`);
console.log(`  starts:quiet  ${quiet.length}${quiet.length ? ' — ' + quiet.join(', ') : ''}`);
if (missing.length) console.log(`omitted (no passing take): ${missing.join(', ')}`);
for (const s of sets) console.log(`  ${s.id.padEnd(14)} ${s.tracks.length}`);

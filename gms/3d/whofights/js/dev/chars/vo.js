// Voice-over bookkeeping for the character tab and tools/vo/gen_barks.mjs. Pure — no DOM, no
// three, no fetch — so both callers share one implementation and node tools/test.mjs can cover it.
//
// DEV_CONTRACT §8: clips are audio/vo/<characterId>__<category>__<nn> + CODEC.ext (the contract
// says .wav; the compression pass moved the takes to audio/vo/raw/ and ships opus). The sidecar maps
// {characterId, category, i} → {file, text, voice, speed, hash}. `hash` is over text|voice|speed|
// pitch, which is what lets Generate-all skip a line nothing has touched.

// CODEC and pitchRate live with the decoder that applies them (js/game/clip.js), so the extension
// the tools write and the extension the game fetches cannot drift — they have three times already
// — and the pitch a take is synthesised at cannot drift from the rate it is resampled at.
import { CODEC, pitchRate } from '../../game/clip.js';
export { CODEC, pitchRate };

// The category list, the clip naming and effectiveBarks belong to js/game/barks.js — the game
// plays barks, so the names it fetches and the names this writes are one implementation.
import { BARK_CATEGORIES, VO_DIR, clipKey, clipFile, effectiveBarks } from '../../game/barks.js';
export { BARK_CATEGORIES, VO_DIR, clipKey, clipFile, effectiveBarks };
export const RAW_DIR = 'audio/vo/raw';
// The one ledger. The dev server writes only under data/ and so does the browser, so a mirror
// under audio/vo/ could only ever be the stale copy. DEV_CONTRACT §8.
export const INDEX_DOC = 'data/vo.json';

const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
export const speedOf = c => clamp(c?.voiceSpeed, 0.7, 1.3, 1);
export const pitchOf = c => clamp(c?.voicePitch, -4, 4, 0);

export const synthSpeed = (speed, pitch) =>
  Math.round(Math.min(2, Math.max(0.5, speed / pitchRate(pitch))) * 10000) / 10000;

// The raw is kept beside the shipped clip so it can be re-encoded at another bitrate without
// paying for kokoro again; audio/vo/raw/ is gitignored.
export const rawFile = key => `${RAW_DIR}/${key}.wav`;
export const rawOut = key => `raw/${key}`;

export function hashLine(text, voice, speed, pitch) {
  const s = `${String(text)}|${voice || ''}|${(+speed || 1).toFixed(3)}|${(+pitch || 0).toFixed(2)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function overriddenCategories(character) {
  const own = character?.barks || {};
  return BARK_CATEGORIES.filter(c => Array.isArray(own[c]));
}

// `onDisk` is the set of basenames api.ls/readdir found under audio/vo. Without it a deleted wav
// with a live index entry is skipped forever, which looks exactly like a working cache.
export function planJobs({ cast, barks, index, who, categories, force = false, onDisk = null }) {
  const ids = who && who.length ? who : Object.keys(cast || {});
  const cats = categories && categories.length ? categories : BARK_CATEGORIES;
  const clips = index?.clips || {};
  const jobs = [], skip = [], noVoice = [], live = new Set();

  for (const id of ids) {
    const c = cast?.[id];
    if (!c) continue;
    const lines = effectiveBarks(barks, c);
    const voice = c.voice;
    const speed = speedOf(c), pitch = pitchOf(c);
    for (const cat of cats) {
      lines[cat].forEach((text, i) => {
        const key = clipKey(id, cat, i);
        live.add(key);
        if (!voice) { noVoice.push({ key, who: id, category: cat, i, text }); return; }
        const hash = hashLine(text, voice, speed, pitch);
        const have = clips[key];
        const present = onDisk ? onDisk.has(key) : true;
        if (!force && have && have.hash === hash && present) return skip.push({ key, why: 'unchanged' });
        jobs.push({ key, out: rawOut(key), who: id, category: cat, i, text, voice, speed, pitch,
          ttsSpeed: synthSpeed(speed, pitch), hash,
          why: !have ? 'new' : !present ? 'file missing' : force ? 'forced' : 'changed' });
      });
    }
  }
  return { jobs, skip, noVoice, live };
}

export function blankIndex() { return { version: 1, clips: {} }; }

// `results` are the dev server's /api/tts/batch records, positionally matched to `jobs`.
// Everything outside `clips` is carried through untouched — the conversation tab wants a `lines`
// section in the same ledger, and rebuilding the document from scratch would delete it.
export function applyResults(index, jobs, results) {
  const next = { ...(index || {}), version: 1, clips: { ...(index?.clips || {}) } };
  const failed = [];
  jobs.forEach((j, n) => {
    const r = results?.[n];
    if (!r || r.ok === false) {
      failed.push({ ...j, error: (r && r.error) || 'no result returned' });
      delete next.clips[j.key];
      return;
    }
    // `encoded` stays false until the mp3 exists. A record that names a file nothing has written
    // is the same lie as a silent clip that "exists".
    next.clips[j.key] = { who: j.who, category: j.category, i: j.i, file: clipFile(j.key),
      raw: rawFile(j.key), encoded: false,
      text: j.text, voice: j.voice, speed: j.speed, pitch: j.pitch, ttsSpeed: j.ttsSpeed,
      hash: j.hash, seconds: r.seconds ?? null, rms: r.rms ?? null, at: Date.now() };
  });
  return { index: next, failed };
}

// Entries whose line no longer exists. The wav stays on disk — nothing here may delete files — so
// they are reported as orphans and the tab offers the list.
// What still needs an mp3. Kept out of the encoder so the CLI and the tab agree on the question.
export function needsEncoding(index, encodedOnDisk = null) {
  return Object.entries(index?.clips || {})
    .filter(([k, v]) => !v.encoded || (encodedOnDisk && !encodedOnDisk.has(k)))
    .map(([k, v]) => ({ key: k, raw: v.raw || rawFile(k), file: v.file || clipFile(k) }));
}

// The playable path: the shipped clip once it exists, the raw take before that.
export const playableFile = (rec, key) => (rec?.encoded ? (rec.file || clipFile(key))
  : (rec?.raw || rawFile(key)));

export function pruneIndex(index, live) {
  const next = { ...(index || {}), version: 1, clips: {} };
  const orphans = [];
  for (const [k, v] of Object.entries(index?.clips || {})) {
    if (live.has(k)) next.clips[k] = v;
    else orphans.push({ key: k, file: v?.file || clipFile(k) });
  }
  return { index: next, orphans };
}

// This tab's authority over the ledger is `clips` and nothing else. Re-read before every write and
// fold only that key in, so a section another tab added between our load and our save survives.
export function mergeClips(current, mine) {
  return { ...(current || {}), version: 1, clips: { ...(mine?.clips || {}) } };
}

// The other half of the same rule, for tools/vo/gen_lines.mjs: `lines` is its section and nothing
// else, so a bark run that finished mid-way through a line run keeps its clips.
export function mergeLines(current, lines) {
  return { ...(current || {}), version: 1, lines: { ...(lines || {}) } };
}

export function validateIndex(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (!doc.clips || typeof doc.clips !== 'object') return ['no clips object'];
  for (const [k, v] of Object.entries(doc.clips)) {
    if (!v || typeof v !== 'object') { e.push(`${k}: not an object`); continue; }
    if (typeof v.hash !== 'string') e.push(`${k}: no hash`);
    if (typeof v.text !== 'string' || !v.text.trim()) e.push(`${k}: no text`);
    if (v.file && v.file !== clipFile(k)) e.push(`${k}: file ${v.file} does not match its key`);
    if (v.raw && v.raw !== rawFile(k)) e.push(`${k}: raw ${v.raw} does not match its key`);
    if (!BARK_CATEGORIES.includes(v.category)) e.push(`${k}: unknown category ${v.category}`);
  }
  return e;
}

export function validateBarks(doc) {
  const e = [];
  if (!doc?.shared || typeof doc.shared !== 'object') return ['no shared object'];
  for (const [k, v] of Object.entries(doc.shared)) {
    if (!BARK_CATEGORIES.includes(k)) e.push(`unknown category ${k}`);
    else if (!Array.isArray(v)) e.push(`${k} must be an array of lines`);
    else v.forEach((l, i) => { if (typeof l !== 'string' || !l.trim()) e.push(`shared.${k}[${i}] is empty`); });
  }
  for (const k of BARK_CATEGORIES) if (!(k in doc.shared)) e.push(`shared has no ${k} list`);
  return e;
}

export function countBarks(barksDoc, cast) {
  let shared = 0, clips = 0;
  for (const c of BARK_CATEGORIES) shared += (barksDoc?.shared?.[c] || []).length;
  for (const c of Object.values(cast || {})) {
    const eff = effectiveBarks(barksDoc, c);
    for (const cat of BARK_CATEGORIES) clips += eff[cat].length;
  }
  return { shared, clips };
}

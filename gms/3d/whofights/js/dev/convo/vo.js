// Voice-over for a conversation line: what to name the clip, whether it needs regenerating, and
// where it lives.
//
// The hash, the pitch-as-speed trick and the clip ledger all come from js/dev/chars/vo.js — the
// character agent's pure module — so a clip made from either tab agrees about what is stale.
// Conversation clips are not in that ledger's `clips` though: its keys are {character, category, i},
// which a line in a node has no answer for. tools/vo/gen_lines.mjs records them in a `lines` section
// instead; this cache is what the tab uses between generations, cross-checked against what is
// actually in audio/vo/.

import { hashLine, synthSpeed, speedOf, pitchOf, clipFile, rawOut, CODEC } from '../chars/vo.js';

const KEY = 'wf.dev.convo.vohash';

export const voHash = (text, voice, speed = 1, pitch = 0) => hashLine(text, voice, speed, pitch);

export const lineHash = (line, character) =>
  hashLine(String(line?.text ?? ''), character?.voice, speedOf(character), pitchOf(character));

// `out` is the raw take, not the shipped clip: kokoro writes a wav into audio/vo/raw/ and the tab
// then runs it through /api/encode, the same two steps tools/vo/gen_lines.mjs takes. Writing
// straight to audio/vo/<name>.wav put an uncompressed take where the game looks for an .ogg, and
// nothing anywhere said so.
export function ttsJob(line, character, out) {
  if (!character?.voice) return null;
  const text = String(line?.text || '').trim();
  if (!text) return null;
  // kokoro has no pitch control: a shift is a speed change plus a resample, and synthSpeed is the
  // rate that puts the duration back afterwards.
  return { voice: character.voice, text, speed: synthSpeed(speedOf(character), pitchOf(character)),
    out: rawOut(out) };
}

export const clipURL = (name, bust = 0) =>
  new URL(`../../../${clipFile(name)}${bust ? `?v=${bust}` : ''}`, import.meta.url).href;

export function makeCache(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  let map = {};
  try { map = JSON.parse(store?.getItem(KEY) || '{}') || {}; } catch { map = {}; }
  return {
    get: name => map[name] || null,
    set(name, hash) { map[name] = hash; try { store?.setItem(KEY, JSON.stringify(map)); } catch { /* full or private */ } },
    merge(clips) {
      for (const r of Object.values(clips || {})) {
        const base = String(r?.file || '').split('/').pop()?.replace(new RegExp(`\\${CODEC.ext}$`), '');
        if (base && r.hash) map[base] = r.hash;
      }
    },
    all: () => ({ ...map }),
  };
}

// `stale` is the only interesting state: it means the clip on disk was made from different words.
export function clipState({ line, character, cache, onDisk }) {
  if (!line?.vo) return 'unnamed';
  if (!onDisk?.has(line.vo)) return 'missing';
  if (!character?.voice) return 'novoice';
  const want = lineHash(line, character);
  const got = cache?.get(line.vo);
  return got === undefined || got === null ? 'unknown' : got === want ? 'fresh' : 'stale';
}

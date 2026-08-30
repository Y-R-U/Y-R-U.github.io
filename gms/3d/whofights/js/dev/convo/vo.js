// Voice-over for a conversation line: what to name the clip, whether it needs regenerating, and
// where it lives.
//
// The hash, the pitch-as-speed trick and the clip ledger all come from js/dev/chars/vo.js — the
// character agent's pure module — so a clip made from either tab agrees about what is stale.
// Conversation clips are not in that ledger though: its keys are {character, category, i}, which a
// line in a node has no answer for. Their hashes are kept in this browser instead and cross-checked
// against what is actually in audio/vo/, because /api/save writes only under data/.

import { hashLine, synthSpeed, speedOf, pitchOf } from '../chars/vo.js';

const KEY = 'wf.dev.convo.vohash';

export const voHash = (text, voice, speed = 1, pitch = 0) => hashLine(text, voice, speed, pitch);

export const lineHash = (line, character) =>
  hashLine(String(line?.text ?? ''), character?.voice, speedOf(character), pitchOf(character));

export function ttsJob(line, character, out) {
  if (!character?.voice) return null;
  const text = String(line?.text || '').trim();
  if (!text) return null;
  // kokoro has no pitch control: a shift is a speed change plus a resample, and synthSpeed is the
  // rate that puts the duration back afterwards.
  return { voice: character.voice, text, speed: synthSpeed(speedOf(character), pitchOf(character)), out };
}

export const clipURL = (name, bust = 0) =>
  new URL(`../../../audio/vo/${name}.wav${bust ? `?v=${bust}` : ''}`, import.meta.url).href;

export function makeCache(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  let map = {};
  try { map = JSON.parse(store?.getItem(KEY) || '{}') || {}; } catch { map = {}; }
  return {
    get: name => map[name] || null,
    set(name, hash) { map[name] = hash; try { store?.setItem(KEY, JSON.stringify(map)); } catch { /* full or private */ } },
    merge(clips) {
      for (const r of Object.values(clips || {})) {
        const base = String(r?.file || '').split('/').pop()?.replace(/\.wav$/, '');
        if (base && r.hash) map[base] = r.hash;
      }
    },
    all: () => ({ ...map }),
  };
}

// `stale` is the only interesting state: it means the wav on disk was made from different words.
export function clipState({ line, character, cache, onDisk }) {
  if (!line?.vo) return 'unnamed';
  if (!onDisk?.has(line.vo)) return 'missing';
  if (!character?.voice) return 'novoice';
  const want = lineHash(line, character);
  const got = cache?.get(line.vo);
  return got === undefined || got === null ? 'unknown' : got === want ? 'fresh' : 'stale';
}

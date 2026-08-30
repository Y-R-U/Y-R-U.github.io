// Voice-over for a conversation line: what to name the clip, whether it needs regenerating, and
// where it lives. DEV_CONTRACT §8 fixes the hash over `text|voice|speed|pitch`.
//
// The hashes cannot live beside the clips: /api/save writes only under data/, so audio/vo/ is
// read-only to a tab. They are kept in this browser and cross-checked against what is actually on
// disk, and audio/vo/index.json is read when the barks agent has written one.

const KEY = 'wf.dev.convo.vohash';

export function voHash(text, voice, speed = 1, pitch = 0) {
  const s = `${String(text ?? '').trim()}|${voice || ''}|${+speed || 1}|${+pitch || 0}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const lineHash = (line, character) =>
  voHash(line?.text, character?.voice, character?.voiceSpeed ?? 1, character?.voicePitch ?? 0);

export function ttsJob(line, character, out) {
  if (!character?.voice) return null;
  const text = String(line?.text || '').trim();
  if (!text) return null;
  return { voice: character.voice, text, speed: character.voiceSpeed ?? 1, out };
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
    // audio/vo/index.json is the barks sidecar; its records carry the same hash for the same file.
    merge(index) {
      for (const r of Object.values(index || {})) {
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

/**
 * The sound bank: key -> recipe -> baked mono Float32Array variants.
 *
 * Every one-shot is baked, never synthesised live. Two reasons:
 *   1. A voice then costs one AudioBufferSourceNode instead of a 6-node graph, so a
 *      collapsing building is affordable.
 *   2. The bake is pure JS, so the same code path can be measured offline. Live node
 *      graphs cannot be inspected; arrays can.
 *
 * Baking is lazy with an idle-time warm queue. A key requested before it is baked is
 * baked on the spot (~0.3-3 ms) rather than dropped — never trade a missing sound for
 * a frame.
 */

import { makeRng, normalize, trimTail, analyse } from './dsp.js';

export const DEFAULT_SR = 32000;   // Nyquist 16 kHz; bright recipes override to 44100

export function createBank(opts = {}) {
  const recipes = new Map();
  const cache = new Map();          // "key#variant" -> { data, sr, rawPeak }
  const order = [];                 // LRU, most recent last
  let bytes = 0;
  const budget = opts.budgetBytes ?? 10 * 1024 * 1024;
  let genMs = 0, genCount = 0;

  const warm = [];
  let warmIdx = 0;

  function define(key, recipe) {
    if (!recipe.gen) throw new Error('recipe ' + key + ' has no gen()');
    recipes.set(key, {
      dur: 0.5, sr: DEFAULT_SR, variants: 2, gain: 0.7, prio: 4, send: 0.2,
      pitchVar: 0.05, rate: 0.012, max: 8, group: null, norm: 0.95, bus: 'sfx',
      ...recipe,
    });
    return key;
  }

  function defineAll(table) {
    for (const k in table) define(k, table[k]);
  }

  function evict() {
    while (bytes > budget && order.length > 8) {
      const id = order.shift();
      const e = cache.get(id);
      if (!e) continue;
      bytes -= e.data.length * 4;
      cache.delete(id);
    }
  }

  /** Bake (or fetch) one variant as a raw Float32Array. No AudioContext needed. */
  function render(key, variant = 0) {
    const rec = recipes.get(key);
    if (!rec) return null;
    const v = ((variant | 0) % rec.variants + rec.variants) % rec.variants;
    const id = key + '#' + v;
    const hit = cache.get(id);
    if (hit) {
      const at = order.indexOf(id);
      if (at >= 0 && at !== order.length - 1) { order.splice(at, 1); order.push(id); }
      return hit;
    }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const sr = rec.sr;
    const n = Math.max(16, Math.ceil(rec.dur * sr));
    let data = new Float32Array(n);
    const rng = makeRng(hashKey(key) ^ (v * 0x9e3779b1 + 17));
    try {
      const ret = rec.gen(data, sr, rng, rec);
      if (ret instanceof Float32Array) data = ret;
    } catch (e) {
      console.warn('[audio] recipe threw:', key, e);
    }
    let rawPeak = 0;
    for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > rawPeak) rawPeak = a; }
    if (rec.norm) normalize(data, rec.norm);
    if (rec.trim !== false) data = trimTail(data, 4e-4);
    const entry = { data, sr, rawPeak, key, variant: v };
    cache.set(id, entry);
    order.push(id);
    bytes += data.length * 4;
    genMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    genCount++;
    evict();
    return entry;
  }

  const abCache = new Map();   // "key#variant" -> AudioBuffer
  const abOrder = [];
  const abBudget = opts.abBudgetBytes ?? 14 * 1024 * 1024;
  let abBytes = 0;

  /**
   * AudioBuffer for playback. Buffers keep their own sample rate; the graph resamples.
   * LRU-evicted against a byte budget — 231 keys x 2-4 variants of uncompressed float
   * is ~40 MB if you keep the lot, which is not a thing to do to a phone. An evicted
   * buffer that is still playing stays alive through the source node's own reference.
   */
  function audioBuffer(actx, key, variant = 0) {
    const rec = recipes.get(key);
    if (!rec) return null;
    const v = ((variant | 0) % rec.variants + rec.variants) % rec.variants;
    const id = key + '#' + v;
    let ab = abCache.get(id);
    if (ab) {
      const at = abOrder.indexOf(id);
      if (at >= 0 && at !== abOrder.length - 1) { abOrder.splice(at, 1); abOrder.push(id); }
      return ab;
    }
    const e = render(key, v);
    if (!e) return null;
    ab = actx.createBuffer(1, e.data.length, e.sr);
    ab.copyToChannel ? ab.copyToChannel(e.data, 0) : ab.getChannelData(0).set(e.data);
    abCache.set(id, ab);
    abOrder.push(id);
    abBytes += ab.length * 4;
    while (abBytes > abBudget && abOrder.length > 16) {
      const drop = abOrder.shift();
      const old = abCache.get(drop);
      if (old) { abBytes -= old.length * 4; abCache.delete(drop); }
    }
    return ab;
  }

  /** Queue keys for background baking, most important first. */
  function warmup(keys) {
    for (const k of keys) if (recipes.has(k)) warm.push(k);
  }

  /** Bake for at most `msBudget`; call from an idle callback. Returns keys remaining. */
  function warmStep(actx, msBudget = 4) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    while (warmIdx < warm.length) {
      const key = warm[warmIdx++];
      const rec = recipes.get(key);
      for (let v = 0; v < rec.variants; v++) actx ? audioBuffer(actx, key, v) : render(key, v);
      if ((typeof performance !== 'undefined' ? performance.now() : 0) - t0 > msBudget) break;
    }
    if (warmIdx >= warm.length) { warm.length = 0; warmIdx = 0; }
    return warm.length - warmIdx;
  }

  function inspect(key, variant = 0) {
    const e = render(key, variant);
    if (!e) return null;
    const a = analyse(e.data, e.sr);
    a.key = key; a.variant = variant; a.rawPeak = e.rawPeak;
    const rec = recipes.get(key);
    a.gain = rec.gain; a.prio = rec.prio; a.bus = rec.bus;
    a.mixPeak = e.rawPeak > 0 ? a.peak * rec.gain : 0;
    return a;
  }

  return {
    define, defineAll, render, audioBuffer, warmup, warmStep, inspect,
    get(key) { return recipes.get(key); },
    has(key) { return recipes.has(key); },
    keys() { return [...recipes.keys()]; },
    get size() { return recipes.size; },
    get bytes() { return bytes + abBytes; },
    get rawBytes() { return bytes; },
    get abBytes() { return abBytes; },
    get cached() { return abCache.size; },
    get genMs() { return genMs; },
    get genCount() { return genCount; },
    clearAudioBuffers() { abCache.clear(); abOrder.length = 0; abBytes = 0; },
  };
}

function hashKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Background music: a shuffled playlist of gentle public-domain piano pieces on the sampled piano.
// Pauses (fades out, remembers the spot) whenever anything else with sound plays, resumes 1 s after; ducks under speech.
import { getCtx, buses, onBusy, busy, ducked, unlock } from './ctx.js?v=202610071336';
import * as piano from './piano.js?v=202610071336';

const LEVEL = 0.35, DUCK = 0.15, FADE_IN = 3, FADE_OUT = 1.2, GAP = 3.5, TAIL = 5;
const INDEX = new URL('../../data/music/bgm/index.json', import.meta.url);

let out = null, list = null, order = [], idx = 0, cur = null, wanted = false, timer = 0, resumeT = 0;
let pos = 0;              // seconds into the current piece when paused
let curPiece = null, curStarted = 0;
const reasons = new Map();

function node() {
  if (out) return out;
  const c = getCtx();
  out = c.createGain();
  out.gain.value = 0;
  out.connect(buses().music);
  return out;
}

const paused = () => reasons.size > 0 || busy() || (globalThis.document?.visibilityState === 'hidden');
const ducks = new Set();
const target = () => (ducks.size || ducked() ? DUCK * LEVEL : LEVEL);

function ramp(v, secs) {
  const g = node().gain, t = getCtx().currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + secs);
}

async function playlist() {
  if (list) return list;
  const r = await fetch(INDEX);
  list = (await r.json()).pieces;
  return list;
}

function shuffle() {
  order = list.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  idx = 0;
}

let starting = false;
async function startPiece(from = 0) {
  clearTimeout(timer);
  if (!wanted || paused() || starting || cur) return;
  starting = true;
  try { await begin(from); } finally { starting = false; }
}

async function begin(from) {
  await playlist();
  if (!curPiece) {
    if (idx >= order.length) shuffle();
    curPiece = await piano.loadPiece(list[order[idx++]].src);
    from = 0;
  }
  if (!wanted || paused()) return;
  const piece = curPiece;
  const h = await piano.play(piece, { from, dest: node(), bgm: true, lead: 0.1 });
  if (!wanted || paused() || piece !== curPiece) { h.stop(0.05); return; }
  cur = h; curStarted = getCtx().currentTime - from;
  ramp(target(), from ? 1.5 : FADE_IN);
  const left = piano.duration(piece) - from;
  // fade the tail (pieces are cut at ~150 s), then a quiet gap before the next one
  timer = setTimeout(() => {
    if (cur !== h) return;
    ramp(0, TAIL);
    timer = setTimeout(() => { if (cur !== h) return; h.stop(0.05); cur = null; curPiece = null; timer = setTimeout(() => startPiece(0), GAP * 1000); }, TAIL * 1000);
  }, Math.max(0, left - TAIL) * 1000);
}

function halt() {
  clearTimeout(timer);
  if (!cur) return;
  const h = cur;
  cur = null;
  pos = Math.max(0, getCtx().currentTime - curStarted - 0.5);
  ramp(0, FADE_OUT);
  setTimeout(() => h.stop(0.05), FADE_OUT * 1000 + 50);
}

function update() {
  clearTimeout(resumeT);
  if (!wanted) return;
  if (paused()) { halt(); return; }
  if (cur) { ramp(target(), 0.4); return; }
  // resume a second after the other sound ends, from where we left off
  resumeT = setTimeout(() => { if (wanted && !paused() && !cur) startPiece(curPiece ? pos : 0); }, 1000);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  onBusy(update);
  globalThis.document?.addEventListener('visibilitychange', update);
}

export async function play() {
  wire();
  wanted = true;
  await unlock();
  update();
}

export function stop() {
  wanted = false;
  clearTimeout(resumeT);
  halt();
  curPiece = null; pos = 0;
}

export function pause(reason = 'manual') { reasons.set(reason, (reasons.get(reason) || 0) + 1); update(); }
export function resume(reason = 'manual') {
  const n = (reasons.get(reason) || 0) - 1;
  n > 0 ? reasons.set(reason, n) : reasons.delete(reason);
  update();
}

export function duck(on, reason = 'manual') {
  on ? ducks.add(reason) : ducks.delete(reason);
  if (cur) ramp(target(), 0.3);
}

export const isPlaying = () => !!cur;
export const nowPlaying = () => (cur && curPiece ? { title: curPiece.title, composer: curPiece.composer } : null);
export const state = () => ({ wanted, playing: !!cur, paused: paused(), reasons: [...reasons.keys()], busy: busy(), ducked: ducked(), piece: curPiece?.title || null, gain: out ? +out.gain.value.toFixed(3) : 0 });

export default { play, stop, pause, resume, duck, isPlaying, nowPlaying, state };

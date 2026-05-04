/* Single-line text ticker for the player view.

   Server-side segments.json is sentence-level: [{start, end, text}]. We
   linearly interpolate within a segment by character offset to bold the
   current word. Exact alignment isn't possible without phoneme timestamps;
   sentence-level + char-interpolation gives a karaoke effect that's good
   enough for sync to feel "alive" without any model-side support. */

import * as api from './api.js';
import * as store from './storage.js';

const state = {
  segments: null,    // [{start, end, text, words: [{w,s,e}]}]
  jobId: null,
  enabled: true,
  paragraph: false,
  segIdx: 0,
  wordIdx: -1,
  els: null,         // {row, line, toggle}
};

export function init({ row, line, toggle }) {
  state.els = { row, line, toggle };
  toggle.addEventListener('click', () => {
    setEnabled(!state.enabled);
  });
}

export function setEnabledFromPref(on) {
  state.enabled = !!on;
  applyVisibility();
}

export function isEnabled() { return state.enabled; }
export function isParagraph() { return state.paragraph; }

export function setParagraphFromPref(on) {
  state.paragraph = !!on;
  applyVisibility();
  renderCurrent();
}

export function setParagraphMode(on) {
  state.paragraph = !!on;
  store.setPref('syncParagraph', state.paragraph).catch(() => {});
  applyVisibility();
  renderCurrent();
}

function setEnabled(on) {
  state.enabled = !!on;
  store.setPref('syncEnabled', state.enabled).catch(() => {});
  applyVisibility();
}

function applyVisibility() {
  const r = state.els?.row;
  if (!r) return;
  // Hide entire row only when there's nothing to show. The eye stays visible
  // whenever there are segments — toggling it just shows/hides the line.
  const hasSegs = !!(state.segments && state.segments.length);
  r.classList.toggle('hidden', !hasSegs);
  r.classList.toggle('paragraph', state.paragraph);
  state.els.line.classList.toggle('paragraph', state.paragraph);
  state.els.line.classList.toggle('hidden', !state.enabled);
  state.els.toggle.classList.toggle('off', !state.enabled);
}

export async function loadFor(jobId, hasSegmentsHint) {
  state.jobId = jobId;
  state.segments = null;
  state.segIdx = 0;
  state.wordIdx = -1;
  if (state.els) state.els.line.innerHTML = '';
  if (!jobId) { applyVisibility(); return; }

  // 1. Local cache first (offline + fast).
  let segs = await store.getSegments(jobId).catch(() => null);
  if (!segs && hasSegmentsHint !== false) {
    try { segs = await api.getSegments(jobId); } catch (_) { segs = null; }
    if (segs) await store.saveSegments(jobId, segs).catch(() => {});
  }
  if (!segs || !segs.length) {
    state.segments = null;
    applyVisibility();
    return;
  }
  state.segments = decorateWithWords(segs);
  applyVisibility();
  if (state.enabled) renderLine(0, -1);
}

function decorateWithWords(segs) {
  // Split each segment into words at whitespace, distributing the segment
  // duration across words proportional to their character length. This is a
  // rough mapping but sentence-aligned.
  const out = [];
  for (const s of segs) {
    const dur = Math.max(0.001, s.end - s.start);
    const text = s.text || '';
    const tokens = [];
    const re = /\S+/g;
    let m;
    let totalLen = 0;
    while ((m = re.exec(text))) {
      tokens.push({ w: m[0], offset: m.index, len: m[0].length });
      totalLen += m[0].length;
    }
    if (totalLen === 0) totalLen = 1;
    let acc = 0;
    const words = tokens.map((t) => {
      const ws = s.start + (acc / totalLen) * dur;
      acc += t.len;
      const we = s.start + (acc / totalLen) * dur;
      return { w: t.w, s: ws, e: we };
    });
    out.push({ start: s.start, end: s.end, text, words });
  }
  return out;
}

/** Call from player on every timeupdate. */
export function tick(currentSec) {
  if (!state.enabled || !state.segments || !state.segments.length) return;
  const segs = state.segments;
  let si = state.segIdx;
  // Forward / backward scan from cached index — usually we step by 0 or 1.
  if (si >= segs.length || currentSec < segs[si].start || currentSec >= segs[si].end) {
    si = findSegmentIndex(segs, currentSec);
  }
  if (si < 0) si = 0;
  const seg = segs[si];
  let wi = -1;
  if (seg && seg.words && seg.words.length) {
    for (let i = 0; i < seg.words.length; i++) {
      const w = seg.words[i];
      if (currentSec >= w.s && currentSec < w.e) { wi = i; break; }
      if (currentSec < w.s) { wi = Math.max(0, i - 1); break; }
    }
    if (wi === -1) wi = seg.words.length - 1;
  }
  if (si !== state.segIdx || wi !== state.wordIdx) {
    state.segIdx = si;
    state.wordIdx = wi;
    renderLine(si, wi);
  }
}

function findSegmentIndex(segs, t) {
  // Binary search.
  let lo = 0, hi = segs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segs[mid];
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return mid;
  }
  return Math.min(segs.length - 1, Math.max(0, lo));
}

function renderLine(segIdx, wordIdx) {
  const line = state.els?.line;
  if (!line) return;
  const seg = state.segments[segIdx];
  if (!seg) { line.innerHTML = ''; return; }
  if (state.paragraph) {
    renderParagraph(line, segIdx, wordIdx);
    return;
  }
  // Build the current line: render the full segment text, with the current
  // word wrapped in <strong>.
  if (!seg.words || seg.words.length === 0) {
    line.textContent = seg.text;
    return;
  }
  const html = seg.words.map((w, i) => {
    if (i === wordIdx) return `<strong>${escapeHtml(w.w)}</strong>`;
    return escapeHtml(w.w);
  }).join(' ');
  line.innerHTML = html;
  // Auto-scroll the strong word into the middle.
  const strong = line.querySelector('strong');
  if (strong) {
    const lineRect = line.getBoundingClientRect();
    const wordRect = strong.getBoundingClientRect();
    const centerOffset = (wordRect.left - lineRect.left) - (lineRect.width / 2 - wordRect.width / 2);
    line.scrollTo({ left: line.scrollLeft + centerOffset, behavior: 'smooth' });
  }
}

function renderParagraph(line, segIdx, wordIdx) {
  const segs = state.segments || [];
  const start = Math.max(0, segIdx - 1);
  const end = Math.min(segs.length, segIdx + 3);
  const parts = [];
  for (let i = start; i < end; i++) {
    const seg = segs[i];
    if (!seg) continue;
    if (i === segIdx && seg.words && seg.words.length) {
      parts.push(seg.words.map((w, idx) => (
        idx === wordIdx ? `<strong>${escapeHtml(w.w)}</strong>` : escapeHtml(w.w)
      )).join(' '));
    } else {
      parts.push(escapeHtml(seg.text || ''));
    }
  }
  line.innerHTML = parts.filter(Boolean).join(' ');
  const strong = line.querySelector('strong');
  if (strong) strong.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function renderCurrent() {
  if (!state.enabled || !state.segments || !state.segments.length) return;
  renderLine(state.segIdx, state.wordIdx);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function clearCache(jobId) {
  await store.deleteSegments(jobId);
}

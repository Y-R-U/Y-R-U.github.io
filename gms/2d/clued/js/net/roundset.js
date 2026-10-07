// Multi-round room helpers, pure (node-tested in tools/s_unit_test.mjs): question set fitting, format time
// scales, and where a question sits in its round given the room state's roundSizes.
export const MAX_QUESTIONS = 200;
export const MAX_SET = 500 * 1024;   // server cap is 512 KB of spec + questions

// q.tscale = the format's timeScale for this question, so rooms stretch answer time like solo play does.
export function annotateTimes(questions, getFormat) {
  for (const q of questions) {
    const f = getFormat(q.format);
    let k = 1;
    try { k = typeof f?.timeScale === 'function' ? f.timeScale(q) : f?.timeScale || 1; } catch (e) {}
    if (Number.isFinite(k) && k > 1) q.tscale = Math.round(Math.min(k, 6) * 100) / 100;
    else delete q.tscale;
  }
  return questions;
}

// Trims to the server's caps one question at a time from the end of the biggest round, so every round survives.
export function fitSet(questions, { maxN = MAX_QUESTIONS, maxBytes = MAX_SET } = {}) {
  const qs = questions.slice();
  let bytes = JSON.stringify(qs).length;
  while (qs.length > 1 && (qs.length > maxN || bytes > maxBytes)) {
    const sizes = {};
    for (const q of qs) sizes[q.round || 0] = (sizes[q.round || 0] || 0) + 1;
    const big = Object.keys(sizes).reduce((a, b) => (sizes[b] > sizes[a] ? b : a));
    let at = -1;
    for (let i = qs.length - 1; i >= 0; i--) if (String(qs[i].round || 0) === big) { at = i; break; }
    bytes -= JSON.stringify(qs[at]).length + 1;
    qs.splice(at, 1);
  }
  return qs;
}

// Question a in a multi-round room: { ord, n (rounds), pos (0-based in round), size, first, last } or null.
export function roundAt(st, a) {
  const sizes = st?.roundSizes;
  if (!Array.isArray(sizes) || sizes.length < 2 || a < 0) return null;
  let start = 0;
  for (let ord = 0; ord < sizes.length; ord++) {
    if (a < start + sizes[ord]) return { ord, n: sizes.length, pos: a - start, size: sizes[ord], first: a === start, last: a === start + sizes[ord] - 1 };
    start += sizes[ord];
  }
  return null;
}

// The spec round behind round ordinal `ord` (rounds whose media all failed are dropped, so ordinals can skip).
export const specRound = (st, ord) => st?.spec?.rounds?.[st.roundSpec?.[ord] ?? ord] || null;

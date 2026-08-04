// Every number the player reads goes through here. No DOM, no sim imports.

const WEEKS_PER_QUARTER = 13;

export function cr(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US');
}

export function credits(n) { return cr(n) + ' cr'; }

// Cash and P&L lines get compacted so a 6-digit number never pushes the HUD off a 390px screen.
export function crShort(n) {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1000000) return s + (a / 1000000).toFixed(a >= 10000000 ? 0 : 1) + 'M';
  if (a >= 10000) return s + (a / 1000).toFixed(a >= 100000 ? 0 : 1) + 'k';
  return s + a.toLocaleString('en-US');
}

export function delta(n, fmt = crShort) {
  const v = Math.round(n || 0);
  if (v === 0) return '±0';
  return (v > 0 ? '+' : '−') + fmt(Math.abs(v));
}

export function pct(f, dp = 0) { return ((f || 0) * 100).toFixed(dp) + '%'; }

// share moves are quoted in points, never as a percentage of a percentage
export function pts(f, dp = 1) {
  const v = (f || 0) * 100;
  if (Math.abs(v) < 0.05) return '±0 pts';
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(dp) + ' pts';
}

export function ago(at) {
  const s = Math.max(0, Math.round((Date.now() - (at || 0)) / 1000));
  if (s < 90) return 'a moment ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function tonnes(n, unit = 't') {
  const v = Math.round((n || 0) * 10) / 10;
  return (Number.isInteger(v) ? v : v.toFixed(1)) + ' ' + unit;
}

export function quarterOf(week) { return Math.floor(Math.max(0, week - 1) / WEEKS_PER_QUARTER) + 1; }
export function weekInQuarter(week) { return ((Math.max(1, week) - 1) % WEEKS_PER_QUARTER) + 1; }
export function quarterLabel(week) { return `Q${quarterOf(week)} · w${weekInQuarter(week)}`; }
export function weekLabel(week) { return `Week ${Math.max(0, week | 0)}`; }

export function duration(quarters) {
  if (!quarters) return 'Permanent';
  return quarters === 1 ? '1 quarter' : `${quarters} quarters`;
}

// One word for a chip, never a verdict. The story body carries the actual answer — see
// `lawStance` for the line that goes with it.
export const BAND_WORD = Object.freeze({ legal: 'Legal', grey: 'Contested', illegal: 'Illegal' });

export const BAND_STANCE = Object.freeze({
  legal: 'Lawful as it was done — which is not the same as harmless.',
  grey: 'Lawful or not depending on facts somebody has to prove in court.',
  illegal: 'Unlawful under competition law as it stands today.',
});

export function bandWord(band) { return BAND_WORD[band] || 'Unclear'; }
export function lawStance(band) { return BAND_STANCE[band] || ''; }

export function titleCase(s) { return String(s || '').replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()); }

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many || one + 's'}`; }

export function arrow(now, was) {
  if (was === undefined || was === null || Math.abs(now - was) < 1e-6) return '→';
  return now > was ? '▲' : '▼';
}

// The share line, as an SVG string. `rows` are `share` events; `marks` are the win thresholds.
// It scales to whatever box it is dropped in, so the caller sets the width and nothing else.
export function shareCurve(rows, { marks = [], w = 320, h = 104 } = {}) {
  const pts = (rows || []).filter(r => r && typeof r.player === 'number');
  if (pts.length < 2) return '';
  const w0 = pts[0].week, w1 = pts[pts.length - 1].week;
  const span = Math.max(1, w1 - w0);
  const top = Math.max(0.55, ...marks.map(m => m.at * 1.08), ...pts.map(p => Math.max(p.player, p.rival || 0) * 1.06));
  const right = w - 30, base = h - 13, head = 6;
  const X = wk => (((wk - w0) / span) * (right - 2) + 2).toFixed(1);
  const Y = v => (base - (Math.min(v, top) / top) * (base - head)).toFixed(1);
  const path = k => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.week)} ${Y(p[k] || 0)}`).join(' ');
  const last = pts[pts.length - 1];

  return `
<svg class="curve" viewBox="0 0 ${w} ${h}" role="img" aria-label="Reach share, week ${w0} to ${w1}">
  <line class="curve-axis" x1="2" x2="${right}" y1="${base}" y2="${base}"/>
  ${marks.map(m => `
    <line class="curve-mark" x1="2" x2="${right}" y1="${Y(m.at)}" y2="${Y(m.at)}"/>
    <text class="curve-tag" x="${right + 4}" y="${+Y(m.at) + 3}">${esc(m.label)}</text>`).join('')}
  <path class="curve-fill" d="${path('player')} L${X(w1)} ${base} L${X(w0)} ${base} Z"/>
  <path class="curve-them" d="${path('rival')}"/>
  <path class="curve-you" d="${path('player')}"/>
  <circle class="curve-dot" cx="${X(w1)}" cy="${Y(last.player)}" r="2.8"/>
  <text class="curve-tick" x="2" y="${h - 2}">w${w0}</text>
  <text class="curve-tick" x="${right}" y="${h - 2}" text-anchor="end">w${w1}</text>
</svg>`;
}

export default {
  cr, credits, crShort, delta, pct, pts, ago, tonnes, quarterOf, weekInQuarter, quarterLabel,
  weekLabel, duration, bandWord, lawStance, titleCase, esc, plural, arrow, shareCurve,
  BAND_WORD, BAND_STANCE, WEEKS_PER_QUARTER,
};

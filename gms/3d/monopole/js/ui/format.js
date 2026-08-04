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

export default {
  cr, credits, crShort, delta, pct, tonnes, quarterOf, weekInQuarter, quarterLabel,
  weekLabel, duration, bandWord, lawStance, titleCase, esc, plural, arrow,
  BAND_WORD, BAND_STANCE, WEEKS_PER_QUARTER,
};

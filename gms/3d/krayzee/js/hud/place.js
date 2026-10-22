// Live-measured placement for the top HUD slots (opportunity prompt card, parked difficulty/aircraft chips).

export function rects(sels, minH = 0) {
  const out = [];
  for (const sel of sels) for (const e of document.querySelectorAll(sel)) {
    if (e.hidden || e.closest('[hidden]')) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (!r.width) continue;
    out.push({ sel, left: r.left, right: r.right, top: r.top, bottom: Math.max(r.bottom, r.top + (r.height ? 0 : minH)) });
  }
  return out;
}
export const rect = (sel) => rects([sel])[0] || null;

// Leftmost x in [lo, hi - w] nearest `want` whose [x, x + w] × [y, y + h] misses every obstacle; null if none fits.
export function slotX(obs, y, w, h, want, lo, hi, pad = 6) {
  const cut = obs.filter((r) => r.top < y + h + pad && r.bottom > y - pad).map((r) => [r.left - pad, r.right + pad]).sort((a, b) => a[0] - b[0]);
  const free = [];
  let a = lo;
  for (const [l, r] of cut) { if (l > a) free.push([a, l]); a = Math.max(a, r); }
  if (hi > a) free.push([a, hi]);
  let best = null, bd = Infinity;
  for (const [l, r] of free) {
    if (r - l < w) continue;
    const x = Math.max(l, Math.min(r - w, want)), d = Math.abs(x - want);
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

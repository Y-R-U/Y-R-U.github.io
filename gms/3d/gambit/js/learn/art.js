// Learn: small inline SVG art (coach crest, piece silhouettes, stars). No images.
export function starRow(n, total = 3) {
  let s = '';
  for (let i = 0; i < total; i++) s += `<svg class="${i < n ? 'on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  return s;
}

// filled silhouettes, 24x24, currentColor
const P = {
  p: '<circle cx="12" cy="7" r="3.2"/><path d="M9.6 10.4h4.8c-.3 2.4.6 4.6 2.2 6.6H7.4c1.6-2 2.5-4.2 2.2-6.6z"/><rect x="6" y="17.6" width="12" height="2.8" rx="1.2"/>',
  n: '<path d="M7.5 20.4h10v-1.8c0-2.3-1-4-1-6.4 0-2.8 1.1-4 1.1-4-1.4-2-3.6-3-5.8-2.8L10.7 3.6 9.6 5.4C7.2 6.5 5.7 8.8 5.4 11.3l2.2.9 1.8-1.4 1.5.2c-1.1 1.6-2.7 3-3.4 5.2z"/><circle cx="12.2" cy="8.3" r=".8" fill="#141922"/>',
  b: '<circle cx="12" cy="3.6" r="1.4"/><path d="M12 5.4c3.2 2.2 4.4 4.6 4.4 6.6 0 2-1.4 3.4-2.4 4h-4c-1-.6-2.4-2-2.4-4 0-2 1.2-4.4 4.4-6.6z"/><path d="M13.8 7.6l-3 3.4" stroke="#141922" stroke-width="1.2" stroke-linecap="round"/><rect x="6" y="17.4" width="12" height="3" rx="1.2"/>',
  r: '<path d="M6.5 4h2.4v2h2v-2h2.2v2h2v-2h2.4v4.6l-1.8 1.6v6.2h-7.4v-6.2L6.5 8.6z"/><rect x="5.6" y="17.4" width="12.8" height="3" rx="1.2"/>',
  q: '<circle cx="4.6" cy="6.4" r="1.5"/><circle cx="9" cy="4.6" r="1.5"/><circle cx="15" cy="4.6" r="1.5"/><circle cx="19.4" cy="6.4" r="1.5"/><path d="M5 8.4l2.8 8h8.4l2.8-8-3.8 3.6L15 6.6 12 11.4 9 6.6l-.2 5.4z"/><rect x="6.2" y="17.2" width="11.6" height="3.2" rx="1.2"/>',
  k: '<path d="M11 2h2v2.2h2.2v2H13v2h-2v-2H8.8v-2H11z"/><path d="M12 8.6c2.6 0 6.4 1 6.4 4 0 1.8-1.6 3.2-2.4 4.2H8c-.8-1-2.4-2.4-2.4-4.2 0-3 3.8-4 6.4-4z"/><rect x="6.2" y="17.4" width="11.6" height="3" rx="1.2"/>',
  board: '<path d="M3 3h18v18H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 3h4.5v4.5H3zM12 3h4.5v4.5H12zM7.5 7.5H12V12H7.5zM16.5 7.5H21V12h-4.5zM3 12h4.5v4.5H3zM12 12h4.5v4.5H12zM7.5 16.5H12V21H7.5zM16.5 16.5H21V21h-4.5z"/>',
};
export const glyph = k => `<svg class="ln-glyph-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${P[k] || P.p}</svg>`;

/** The coach: a gold knight on a round medallion. */
export const COACH = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lncg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dfa6"/><stop offset="1" stop-color="#9c6b22"/></linearGradient>
  <radialGradient id="lncb" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#2a3246"/><stop offset="1" stop-color="#0e121a"/></radialGradient></defs>
  <circle cx="24" cy="24" r="22" fill="url(#lncb)" stroke="url(#lncg)" stroke-width="2.2"/>
  <circle cx="24" cy="24" r="17.5" fill="none" stroke="url(#lncg)" stroke-width=".8" opacity=".55"/>
  <g transform="translate(9.6 8.4) scale(1.2)"><path fill="url(#lncg)" d="M7.5 20.4h10v-1.8c0-2.3-1-4-1-6.4 0-2.8 1.1-4 1.1-4-1.4-2-3.6-3-5.8-2.8L10.7 3.6 9.6 5.4C7.2 6.5 5.7 8.8 5.4 11.3l2.2.9 1.8-1.4 1.5.2c-1.1 1.6-2.7 3-3.4 5.2z"/><circle cx="12.2" cy="8.3" r=".9" fill="#141922"/></g></svg>`;

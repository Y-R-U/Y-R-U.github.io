// Small inline SVG art for the puzzle map (no images).
const g = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const GLYPHS = {
  sprout: g('<path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6z"/><path d="M12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/><path d="M7 21h10"/>'),
  fork: g('<path d="M6 3v6a6 6 0 0 0 12 0V3"/><path d="M12 3v18"/><path d="M8 21h8"/>'),
  net: g('<path d="M3 5c6 3 12 3 18 0M3 12c6 3 12 3 18 0M3 19c6-3 12-3 18 0"/><path d="M5 3c2 6 2 12 0 18M12 3v18M19 3c-2 6-2 12 0 18"/>'),
  blade: g('<path d="M14.5 3.5L20.5 3.5 20.5 9.5 9 21l-6-6z"/><path d="M7 13l4 4M5 19l-2 2"/>'),
  flame: g('<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-2 4-2 5-1-1-3-3-3-6-3 3-5 7-5 11 0 4 3 7 7 7z"/><path d="M12 22c-2 0-3-1.5-3-3.5S11 15 12 13c1 2 3 3.5 3 5.5S14 22 12 22z"/>'),
  crown: g('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/><path d="M5 19h14"/><circle cx="12" cy="5" r=".6" fill="currentColor"/>'),
  bolt: g('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  peak: g('<path d="M2 20L9 7l4 6 3-4 6 11z"/><path d="M7.4 10l1.6 1.5L10.6 10"/>'),
};

// Decor silhouettes centred on 0,0 (~40px), filled/stroked with the region colour.
export const DECOR = {
  sprout: '<path stroke="none" d="M0,-26 L11,-6 L5,-6 L14,8 L4,8 L4,16 L-4,16 L-4,8 L-14,8 L-5,-6 L-11,-6Z"/>',
  fork: '<g fill="none" stroke-width="3" stroke-linecap="round"><path d="M-16,-16 L16,16 M16,-16 L-16,16"/><path d="M-20,-10 L-10,-20 M20,-10 L10,-20"/></g>',
  net: '<g fill="none" stroke-width="1.6"><path d="M-22,-10 Q0,0 22,-10 M-22,4 Q0,14 22,4 M-22,18 Q0,26 22,18"/><path d="M-14,-16 Q-10,4 -14,24 M0,-18 L0,26 M14,-16 Q10,4 14,24"/></g>',
  blade: '<path stroke="none" d="M0,-30 L5,-6 L5,10 L12,10 L12,14 L3,14 L3,26 L-3,26 L-3,14 L-12,14 L-12,10 L-5,10 L-5,-6Z"/>',
  flame: '<path stroke="none" d="M0,26 C14,26 18,14 14,4 C11,-4 6,-8 6,-18 C0,-12 -2,-8 -2,-4 C-5,-8 -6,-12 -6,-20 C-16,-10 -18,2 -16,10 C-14,20 -8,26 0,26Z"/>',
  crown: '<path stroke="none" d="M-18,-6 L-9,2 L0,-14 L9,2 L18,-6 L14,16 L-14,16Z"/>',
  bolt: '<path stroke="none" d="M4,-28 L-12,4 L-1,4 L-6,28 L12,-6 L1,-6Z"/>',
  peak: '<path stroke="none" d="M-30,20 L-8,-22 L4,-2 L12,-12 L30,20Z"/><path fill="#fff" stroke="none" opacity=".5" d="M-8,-22 L-2,-10 L-6,-12 L-10,-8 L-13,-12Z"/>',
};

export function starRow(n, total = 3) {
  let s = '';
  for (let i = 0; i < total; i++) s += `<svg class="${i < n ? 'on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  return s;
}

/** Gold crest medallion for the rating badge. */
export function crest() {
  return `<svg class="pz-crest" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="pzg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dfa6"/><stop offset="1" stop-color="#9c6b22"/></linearGradient></defs>
    <circle cx="20" cy="20" r="18" fill="#141922" stroke="url(#pzg)" stroke-width="2"/>
    <circle cx="20" cy="20" r="14" fill="none" stroke="url(#pzg)" stroke-width=".8" opacity=".6"/>
    <path fill="url(#pzg)" d="M15 11h4v3a2 2 0 1 0 4 0v-1h3v4h-1a2 2 0 1 0 0 4h1v6h-5v-1a2 2 0 1 0-4 0v1h-5v-5h1a2 2 0 1 0 0-4h-1v-4h3z"/></svg>`;
}

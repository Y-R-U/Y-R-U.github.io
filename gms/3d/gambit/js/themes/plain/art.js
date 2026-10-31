// Plain 2D piece art (theme2d agent). Original vector silhouettes in the familiar
// "chess site" style, authored here from scratch (NOT derived from cburnett / merida / any
// published set). 100 × 100 box, y down, base slab at y 80–90.
//
// Drawing model (see drawPiece): every `body` sub-path is first stroked at 2× outline width
// in ink, then filled with the side colour, so overlapping parts merge into ONE clean
// silhouette with an outer outline. `lines` / `dots` are drawn on top as inner detail:
// ink on white pieces, light grey on black pieces (the usual 2D convention).
// No DOM / Three.js dependency: usable for the board atlas and for any UI that wants the art
// (pieceDataURL below), e.g. a promotion picker.

const BASE = 'M24 80 L76 80 Q79 80 79 83 L79 87 Q79 90 76 90 L24 90 Q21 90 21 87 L21 83 Q21 80 24 80 Z';
const BASE_LINE = 'M25 80 L75 80';
const circle = (cx, cy, r) => `M${cx + r} ${cy} A${r} ${r} 0 1 1 ${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r} ${cy} Z`;

export const ART = {
  p: {
    body: [
      'M43.5 49 C43.5 58 40 65 34 70.5 C31 73.5 29.5 76.5 29.5 80 L70.5 80 C70.5 76.5 69 73.5 66 70.5 C60 65 56.5 58 56.5 49 Z',
      'M36 45.5 C36 41.5 42 40 50 40 C58 40 64 41.5 64 45.5 C64 49.5 58 51 50 51 C42 51 36 49.5 36 45.5 Z',
      circle(50, 29.5, 11),
      'M27 80 L73 80 Q76 80 76 83 L76 87 Q76 90 73 90 L27 90 Q24 90 24 87 L24 83 Q24 80 27 80 Z',
    ],
    lines: ['M40.5 41.6 C45.5 40.3 54.5 40.3 59.5 41.6', 'M39 49.6 C44.5 51.4 55.5 51.4 61 49.6', 'M28 80 L72 80'],
  },
  r: {
    body: [
      'M26 12 L35.5 12 L35.5 19 L44.5 19 L44.5 12 L55.5 12 L55.5 19 L64.5 19 L64.5 12 L74 12 L74 28 L26 28 Z',
      'M26 28 L74 28 L67 35 L33 35 Z',
      'M33 35 L67 35 L68.5 66 L31.5 66 Z',
      'M31.5 66 L68.5 66 L73 73 L27 73 Z',
      'M25.5 73 L74.5 73 L74.5 80 L25.5 80 Z',
      BASE,
    ],
    lines: ['M27.5 28 L72.5 28', 'M34 35 L66 35', 'M32.5 66 L67.5 66', 'M28 73 L72 73', BASE_LINE],
  },
  n: {
    body: [
      // horse head looking left: back of the neck, ear, forehead, muzzle, jaw, chest
      'M71 80 C74 64 77 46 70 32 C66 25 60 20.5 56 18.5 L55 8 L47.5 15 C39 17 31 23 27 32 L19 49 C17 54.5 19 58.5 24.5 60 C28.5 61 32.5 59 35.5 56 C39.5 53.5 44 52.5 49.5 50 C46 58.5 39 67 33 80 Z',
      BASE,
    ],
    lines: [
      'M59 22.5 C66.5 29.5 71 41 70 54 C69.5 63 68 71 67 77.5',   // mane ridge
      'M53.5 12.5 L51.5 17.5',                                     // inner ear
      'M20.6 55 C22.5 55.6 24.5 55.8 26.5 55.4',                   // mouth
      BASE_LINE,
    ],
    dots: [[40.5, 29.5, 2.9], [24.2, 50.5, 1.7]],                  // eye, nostril
  },
  b: {
    body: [
      'M42 63 C42 70 38 75 32 80 L68 80 C62 75 58 70 58 63 Z',
      'M36 57 C42 55 58 55 64 57 C65.5 59 65.5 62 64 64 C58 62 42 62 36 64 C34.5 62 34.5 59 36 57 Z',
      'M50 19 C59 26 66 35 66 44 C66 52 60 57 50 57 C40 57 34 52 34 44 C34 35 41 26 50 19 Z',
      circle(50, 13.5, 5.5),
      BASE,
    ],
    lines: ['M37.5 57.6 C43 55.8 57 55.8 62.5 57.6', 'M37.5 63.4 C43 61.6 57 61.6 62.5 63.4', BASE_LINE],
    slots: ['M56.5 30 L44.5 44.5'],                                // the mitre cut, drawn bold
  },
  q: {
    body: [
      'M31 68 C42 65.5 58 65.5 69 68 L73.5 80 L26.5 80 Z',
      'M29 61 C40 58 60 58 71 61 L69 68 C58 65.5 42 65.5 31 68 Z',
      'M22 26 L32.5 50 L35.5 21 L44 47 L50 18 L56 47 L64.5 21 L67.5 50 L78 26 L71 61 L29 61 Z',
      circle(21, 24, 4.3), circle(35.5, 17.5, 4.3), circle(50, 14, 4.6), circle(64.5, 17.5, 4.3), circle(79, 24, 4.3),
      BASE,
    ],
    lines: ['M30.5 61.4 C41 58.6 59 58.6 69.5 61.4', 'M32 67.6 C42 65.2 58 65.2 68 67.6', BASE_LINE],
  },
  k: {
    body: [
      'M30 69 L70 69 L73.5 80 L26.5 80 Z',
      'M31 63 L69 63 L70 69 L30 69 Z',
      'M50 44 C57 33 70 31 76.5 38 C83.5 47 75.5 58 69 63 L31 63 C24.5 58 16.5 47 23.5 38 C30 31 43 33 50 44 Z',
      'M45.5 34 L54.5 34 L54 46 L46 46 Z',
      'M50 21 C57 21 60.5 27 57 35.5 L43 35.5 C39.5 27 43 21 50 21 Z',
      'M47 4 L53 4 L53 22 L47 22 Z',
      'M41.5 9.5 L58.5 9.5 L58.5 15.5 L41.5 15.5 Z',
      BASE,
    ],
    lines: ['M50 45 L50 62', 'M32 63 L68 63', 'M31 69 L69 69', 'M44 35.5 L56 35.5', BASE_LINE],
  },
};

export const LOOK = {
  w: { fill: '#fbfbf8', ink: '#1c1c1c', detail: '#1c1c1c' },
  b: { fill: '#2a2a2a', ink: '#0c0c0c', detail: '#e2e2e2' },
};
const OUTLINE = 3.0, DETAIL = 2.3, SLOT = 3.4;   // stroke widths in art units (piece box = 100)

const cache = new Map();
const path = d => { let p = cache.get(d); if (!p) { p = new Path2D(d); cache.set(d, p); } return p; };

/** Draw one piece into a 2D context with its 100-unit box at (x, y), `size` px wide. */
export function drawPiece(c, type, color, x, y, size) {
  const A = ART[type], L = LOOK[color] || LOOK.w;
  if (!A) return;
  c.save();
  c.translate(x, y); c.scale(size / 100, size / 100);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = L.ink; c.lineWidth = OUTLINE * 2;
  for (const d of A.body) c.stroke(path(d));
  c.fillStyle = L.fill;
  for (const d of A.body) c.fill(path(d));
  c.strokeStyle = L.detail; c.lineWidth = DETAIL;
  for (const d of A.lines || []) c.stroke(path(d));
  c.lineWidth = SLOT;
  for (const d of A.slots || []) c.stroke(path(d));
  c.fillStyle = L.detail;
  for (const [cx, cy, r] of A.dots || []) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

/** PNG data URL of one piece (for DOM use: promotion picker, previews). */
export function pieceDataURL(type, color, px = 96) {
  const cv = document.createElement('canvas'); cv.width = cv.height = px;
  drawPiece(cv.getContext('2d'), type, color, 0, 0, px);
  return cv.toDataURL('image/png');
}

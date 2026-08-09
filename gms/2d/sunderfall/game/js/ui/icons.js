/* SUNDERFALL UI — fallback spell icons and a fallback spell table.
 *
 * `spells/registry.js` is owned by another agent and each spell there draws its own `icon(c2d,
 * size)`. Until that lands — and for any spell that ships without an icon — these stand in. They
 * are real icons, not placeholders: bold silhouettes that read at 26px, school-tinted, with a hot
 * core so they survive being drawn on a dark glass disc.
 *
 * Contract assumed for `icon(c2d, size)`: draw inside the box (0,0)-(size,size). The cache in
 * circles.js re-centres whatever comes back on its own alpha bounding box, so an icon that instead
 * draws around the origin still lands correctly — it just loses any deliberate off-centring.
 */

import { SCHOOL, A, mix, C } from './theme.js';

function setup(c, s, school) {
  const sc = SCHOOL[school] || SCHOOL.fire;
  c.save();
  c.translate(s * 0.5, s * 0.5);
  c.scale(s, s);            // work in -0.5..0.5
  c.lineCap = 'round';
  c.lineJoin = 'round';
  return sc;
}

/** Draw a path twice: a wide dark-tinted underlay for weight, then a hot core. */
function ink(c, w, deep, hot, fn) {
  c.lineWidth = w * 1.9;
  c.strokeStyle = deep;
  fn();
  c.lineWidth = w;
  c.strokeStyle = hot;
  fn();
}

function makeIcon(school, fn) {
  return function (c, size) {
    const sc = setup(c, size, school);
    const hot = mix(sc.css, '#ffffff', 0.35);
    fn(c, sc.css, hot, sc.deep, A(sc.css, 0.28));
    c.restore();
  };
}

/* ---- fire ------------------------------------------------------------ */

const emberbolt = makeIcon('fire', (c, col, hot, deep) => {
  // a comet: fat flame tail bottom-left, hard bright head top-right
  c.beginPath();
  c.moveTo(-0.42, 0.34);
  c.quadraticCurveTo(-0.06, 0.16, 0.10, -0.10);
  c.quadraticCurveTo(-0.10, 0.06, -0.42, 0.34);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.055; c.strokeStyle = A(col, 0.65); c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-0.36, 0.30); c.quadraticCurveTo(-0.10, 0.12, 0.06, -0.08); c.stroke();
  c.lineWidth = 0.028; c.strokeStyle = A(hot, 0.9);
  c.beginPath(); c.moveTo(-0.26, 0.24); c.quadraticCurveTo(-0.06, 0.10, 0.06, -0.06); c.stroke();

  c.beginPath();                                     // head — a stubby arrowhead, not a quill
  c.moveTo(0.40, -0.36);
  c.lineTo(0.10, -0.28);
  c.lineTo(0.04, 0.00);
  c.closePath();
  c.fillStyle = col; c.fill();
  c.lineWidth = 0.05; c.strokeStyle = col; c.lineJoin = 'round'; c.stroke();
  c.beginPath();
  c.moveTo(0.36, -0.32); c.lineTo(0.17, -0.26); c.lineTo(0.14, -0.12);
  c.closePath();
  c.fillStyle = '#fff2d6'; c.fill();
  for (let i = 0; i < 3; i++) {                      // trailing embers
    c.beginPath(); c.arc(-0.44 + i * 0.05, 0.40 - i * 0.05, 0.028 - i * 0.006, 0, 7);
    c.fillStyle = A(col, 0.85 - i * 0.24); c.fill();
  }
});

const cinderwake = makeIcon('fire', (c, col, hot, deep) => {
  c.lineWidth = 0.035; c.strokeStyle = A(col, 0.45);
  c.beginPath(); c.ellipse(0, 0.02, 0.32, 0.16, -0.24, 0, 7); c.stroke();
  c.beginPath(); c.arc(0, 0, 0.10, 0, 7); c.fillStyle = deep; c.fill();
  c.strokeStyle = A(col, 0.8); c.lineWidth = 0.03; c.stroke();
  const pts = [[-0.30, -0.05], [0.14, -0.14], [0.28, 0.10]];
  for (let i = 0; i < 3; i++) {
    const r = 0.085 - i * 0.012;
    c.beginPath(); c.arc(pts[i][0], pts[i][1], r, 0, 7);
    c.fillStyle = hot; c.fill();
    c.beginPath(); c.arc(pts[i][0], pts[i][1], r * 0.45, 0, 7);
    c.fillStyle = '#fff3d8'; c.fill();
  }
});

const emberstorm = makeIcon('fire', (c, col, hot, deep) => {
  for (let i = 0; i < 3; i++) {
    const x = -0.28 + i * 0.28, y = -0.34 + (i === 1 ? -0.04 : 0.06);
    ink(c, 0.05, deep, col, () => {
      c.beginPath(); c.moveTo(x - 0.10, y - 0.04); c.lineTo(x + 0.06, y + 0.26); c.stroke();
    });
    c.beginPath(); c.arc(x + 0.08, y + 0.31, 0.062, 0, 7);
    c.fillStyle = hot; c.fill();
  }
  c.lineWidth = 0.045; c.strokeStyle = A(col, 0.55);
  c.beginPath(); c.moveTo(-0.36, 0.40); c.lineTo(0.36, 0.40); c.stroke();
});

const pyreveil = makeIcon('fire', (c, col, hot, deep) => {
  c.lineWidth = 0.05; c.strokeStyle = deep;
  c.beginPath(); c.ellipse(0, 0.14, 0.34, 0.13, 0, 0, 7); c.stroke();
  c.lineWidth = 0.03; c.strokeStyle = col; c.stroke();
  for (let i = 0; i < 5; i++) {                       // tongues around the ring
    const a = -0.35 + i * 0.42, x = Math.cos(a + 2.6) * 0.30, hgt = 0.20 + (i % 2) * 0.11;
    const y = 0.14 + Math.sin(a + 2.6) * 0.11;
    c.beginPath();
    c.moveTo(x - 0.06, y);
    c.quadraticCurveTo(x - 0.03, y - hgt * 0.7, x, y - hgt);
    c.quadraticCurveTo(x + 0.04, y - hgt * 0.6, x + 0.06, y);
    c.closePath();
    c.fillStyle = i % 2 ? hot : col; c.fill();
  }
});

/* ---- storm ----------------------------------------------------------- */

const sparklash = makeIcon('storm', (c, col, hot, deep) => {
  const path = () => {
    c.beginPath();
    c.moveTo(-0.24, -0.38); c.lineTo(-0.02, -0.08); c.lineTo(-0.16, -0.04);
    c.lineTo(0.10, 0.14); c.lineTo(-0.02, 0.16); c.lineTo(0.22, 0.40);
    c.stroke();
  };
  ink(c, 0.06, deep, col, path);
  c.lineWidth = 0.024; c.strokeStyle = '#eafcff'; path();
  c.lineWidth = 0.028; c.strokeStyle = A(col, 0.55);
  c.beginPath(); c.moveTo(0.06, -0.30); c.lineTo(0.28, -0.16); c.stroke();
  c.beginPath(); c.moveTo(-0.34, 0.06); c.lineTo(-0.20, 0.24); c.stroke();
});

const stormcall = makeIcon('storm', (c, col, hot, deep) => {
  c.beginPath();                                      // cell
  c.moveTo(-0.34, -0.06);
  c.bezierCurveTo(-0.40, -0.30, -0.10, -0.40, 0.00, -0.26);
  c.bezierCurveTo(0.14, -0.42, 0.40, -0.28, 0.32, -0.06);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.032; c.strokeStyle = A(col, 0.9); c.stroke();
  const bolt = () => {
    c.beginPath(); c.moveTo(0.02, -0.04); c.lineTo(-0.10, 0.14);
    c.lineTo(0.02, 0.14); c.lineTo(-0.08, 0.40); c.stroke();
  };
  ink(c, 0.05, '#08131c', hot, bolt);
  c.lineWidth = 0.028; c.strokeStyle = A(col, 0.7);
  c.beginPath(); c.moveTo(0.18, 0.02); c.lineTo(0.12, 0.22); c.stroke();
});

const galewrench = makeIcon('storm', (c, col, hot, deep) => {
  c.lineWidth = 0.062; c.strokeStyle = deep;
  for (let i = 0; i < 3; i++) {
    const y = -0.20 + i * 0.20, len = i === 1 ? 0.34 : 0.24;
    c.beginPath(); c.moveTo(-0.36, y); c.lineTo(len - 0.06, y);
    c.quadraticCurveTo(len + 0.10, y, len + 0.02, y + 0.12);
    c.stroke();
  }
  c.lineWidth = 0.034; c.strokeStyle = col;
  for (let i = 0; i < 3; i++) {
    const y = -0.20 + i * 0.20, len = i === 1 ? 0.34 : 0.24;
    c.beginPath(); c.moveTo(-0.36, y); c.lineTo(len - 0.06, y);
    c.quadraticCurveTo(len + 0.10, y, len + 0.02, y + 0.12);
    c.stroke();
  }
  c.strokeStyle = hot; c.lineWidth = 0.022;
  c.beginPath(); c.moveTo(-0.30, -0.20); c.lineTo(-0.02, -0.20); c.stroke();
});

/* ---- earth ----------------------------------------------------------- */

const stonepin = makeIcon('earth', (c, col, hot, deep) => {
  c.beginPath();
  c.moveTo(0.06, -0.42); c.lineTo(0.26, -0.06); c.lineTo(0.02, 0.30);
  c.lineTo(-0.18, 0.02); c.lineTo(-0.10, -0.22);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.03; c.strokeStyle = col; c.stroke();
  c.beginPath();
  c.moveTo(0.06, -0.42); c.lineTo(0.02, 0.30); c.lineTo(-0.18, 0.02);
  c.closePath();
  c.fillStyle = A(col, 0.35); c.fill();
  c.lineWidth = 0.026; c.strokeStyle = A(hot, 0.9);
  c.beginPath(); c.moveTo(-0.30, 0.40); c.lineTo(0.32, 0.40); c.stroke();
  c.beginPath(); c.moveTo(-0.10, 0.40); c.lineTo(-0.20, 0.30); c.stroke();
  c.beginPath(); c.moveTo(0.14, 0.40); c.lineTo(0.24, 0.30); c.stroke();
});

const sunderquake = makeIcon('earth', (c, col, hot, deep) => {
  // a slab of ground split by one big wedge — reads as "the floor opened", not as a fence
  c.beginPath();
  c.moveTo(-0.44, -0.02); c.lineTo(-0.05, -0.02); c.lineTo(-0.14, 0.44); c.lineTo(-0.44, 0.44);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.038; c.strokeStyle = col; c.stroke();
  c.beginPath();
  c.moveTo(0.05, -0.02); c.lineTo(0.44, -0.02); c.lineTo(0.44, 0.44); c.lineTo(0.16, 0.44);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.stroke();
  c.beginPath();                                      // the fissure between them
  c.moveTo(-0.05, -0.02); c.lineTo(0.05, -0.02); c.lineTo(0.16, 0.44); c.lineTo(-0.14, 0.44);
  c.closePath();
  c.fillStyle = '#0a0705'; c.fill();
  c.lineWidth = 0.02; c.strokeStyle = A(hot, 0.85); c.stroke();
  for (let i = 0; i < 5; i++) {                       // debris thrown up out of it
    const x = -0.30 + i * 0.15, h = 0.16 + ((i * 7) % 3) * 0.08;
    c.beginPath();
    c.moveTo(x, -0.06); c.lineTo(x + 0.035, -0.06 - h); c.lineTo(x + 0.075, -0.06);
    c.closePath();
    c.fillStyle = A(i === 2 ? hot : col, 0.85); c.fill();
  }
});

const thornsurge = makeIcon('earth', (c, col, hot, deep) => {
  c.lineWidth = 0.05; c.strokeStyle = A(col, 0.8);
  c.beginPath(); c.moveTo(-0.40, 0.34); c.lineTo(0.40, 0.34); c.stroke();
  for (let i = 0; i < 3; i++) {
    const x = -0.24 + i * 0.24, h = i === 1 ? 0.62 : 0.44;
    c.beginPath();
    c.moveTo(x - 0.09, 0.34);
    c.quadraticCurveTo(x - 0.02, 0.34 - h * 0.5, x + 0.02, 0.34 - h);
    c.quadraticCurveTo(x + 0.05, 0.34 - h * 0.45, x + 0.09, 0.34);
    c.closePath();
    c.fillStyle = i === 1 ? deep : '#241a0c'; c.fill();
    c.lineWidth = 0.026; c.strokeStyle = i === 1 ? hot : col; c.stroke();
  }
});

const bulwark = makeIcon('earth', (c, col, hot, deep) => {
  c.beginPath();
  c.moveTo(-0.30, 0.36); c.lineTo(-0.26, -0.18); c.lineTo(0.00, -0.32);
  c.lineTo(0.26, -0.18); c.lineTo(0.30, 0.36);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.034; c.strokeStyle = col; c.stroke();
  c.lineWidth = 0.02; c.strokeStyle = A(col, 0.55);
  c.beginPath(); c.moveTo(-0.28, 0.02); c.lineTo(0.28, 0.02); c.stroke();
  c.beginPath(); c.moveTo(0.00, 0.02); c.lineTo(0.00, 0.36); c.stroke();
  c.beginPath(); c.moveTo(-0.14, -0.25); c.lineTo(-0.14, 0.02); c.stroke();
  c.beginPath(); c.moveTo(0.14, -0.25); c.lineTo(0.14, 0.02); c.stroke();
  c.lineWidth = 0.024; c.strokeStyle = hot;
  c.beginPath(); c.moveTo(-0.26, -0.18); c.lineTo(0.00, -0.32); c.lineTo(0.26, -0.18); c.stroke();
});

/* ---- decay ----------------------------------------------------------- */

const acidrain = makeIcon('decay', (c, col, hot, deep) => {
  for (let i = 0; i < 4; i++) {
    const x = -0.27 + i * 0.18, y = -0.34 + (i % 2) * 0.14;
    c.beginPath();
    c.moveTo(x, y); c.quadraticCurveTo(x + 0.07, y + 0.12, x, y + 0.20);
    c.quadraticCurveTo(x - 0.07, y + 0.12, x, y);
    c.closePath();
    c.fillStyle = i % 2 ? hot : col; c.fill();
  }
  c.beginPath();                                      // the pool it leaves
  c.ellipse(0, 0.28, 0.34, 0.10, 0, 0, 7);
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.026; c.strokeStyle = col; c.stroke();
  c.beginPath(); c.ellipse(-0.10, 0.26, 0.10, 0.032, 0, 0, 7);
  c.fillStyle = A(hot, 0.7); c.fill();
});

const blightbloom = makeIcon('decay', (c, col, hot, deep) => {
  c.beginPath(); c.arc(0, 0.04, 0.20, 0, 7);
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.03; c.strokeStyle = col; c.stroke();
  c.beginPath(); c.arc(-0.06, -0.02, 0.075, 0, 7);
  c.fillStyle = A(hot, 0.8); c.fill();
  for (let i = 0; i < 7; i++) {                       // spores drifting off
    const a = i * 0.9, d = 0.28 + (i % 3) * 0.07;
    c.beginPath(); c.arc(Math.cos(a) * d, 0.04 + Math.sin(a) * d * 0.85, 0.032 - (i % 3) * 0.007, 0, 7);
    c.fillStyle = A(i % 2 ? hot : col, 0.85); c.fill();
  }
});

const bloodtithe = makeIcon('decay', (c, col, hot, deep) => {
  c.beginPath();                                      // the drop
  c.moveTo(0.02, -0.36);
  c.bezierCurveTo(0.26, -0.10, 0.24, 0.16, 0.02, 0.20);
  c.bezierCurveTo(-0.20, 0.16, -0.22, -0.10, 0.02, -0.36);
  c.closePath();
  c.fillStyle = deep; c.fill();
  c.lineWidth = 0.032; c.strokeStyle = col; c.stroke();
  c.beginPath(); c.ellipse(-0.06, 0.02, 0.05, 0.08, -0.3, 0, 7);
  c.fillStyle = A(hot, 0.85); c.fill();
  c.lineWidth = 0.03; c.strokeStyle = A(col, 0.75);   // the siphon
  c.beginPath(); c.moveTo(-0.24, 0.36); c.quadraticCurveTo(-0.02, 0.36, 0.02, 0.22); c.stroke();
  c.beginPath(); c.moveTo(0.28, 0.36); c.quadraticCurveTo(0.06, 0.38, 0.03, 0.22); c.stroke();
});

/* ---- void ------------------------------------------------------------ */

const voidlash = makeIcon('void', (c, col, hot, deep) => {
  const path = () => {
    c.beginPath();
    c.moveTo(-0.36, -0.30);
    c.bezierCurveTo(0.02, -0.34, 0.26, -0.06, 0.14, 0.20);
    c.bezierCurveTo(0.06, 0.36, -0.14, 0.34, -0.16, 0.18);
    c.stroke();
  };
  ink(c, 0.055, deep, col, path);
  c.lineWidth = 0.02; c.strokeStyle = hot; path();
  c.beginPath(); c.arc(-0.36, -0.30, 0.065, 0, 7);
  c.fillStyle = hot; c.fill();
  c.beginPath();                                      // the barb
  c.moveTo(-0.16, 0.18); c.lineTo(-0.30, 0.10); c.lineTo(-0.20, 0.30);
  c.closePath(); c.fillStyle = col; c.fill();
});

const mirrorstep = makeIcon('void', (c, col, hot, deep) => {
  const fig = (x, y, s) => {
    c.beginPath();
    c.arc(x, y - 0.20 * s, 0.085 * s, 0, 7);
    c.moveTo(x - 0.10 * s, 0.06 * s + y);
    c.lineTo(x, y - 0.10 * s); c.lineTo(x + 0.10 * s, 0.06 * s + y);
    c.moveTo(x - 0.09 * s, 0.30 * s + y); c.lineTo(x, 0.06 * s + y); c.lineTo(x + 0.09 * s, 0.30 * s + y);
    c.stroke();
  };
  c.setLineDash([0.045, 0.045]);
  c.lineWidth = 0.04; c.strokeStyle = A(col, 0.55);
  fig(-0.20, 0.02, 1);
  c.setLineDash([]);
  c.lineWidth = 0.055; c.strokeStyle = deep; fig(0.18, 0.02, 1);
  c.lineWidth = 0.032; c.strokeStyle = hot; fig(0.18, 0.02, 1);
  c.beginPath(); c.arc(-0.20, 0.00, 0.20, 0, 7);
  c.strokeStyle = A(col, 0.30); c.lineWidth = 0.02; c.stroke();
});

const nullring = makeIcon('void', (c, col, hot, deep) => {
  c.beginPath(); c.arc(0, 0, 0.30, 0, 7);
  c.fillStyle = A(deep, 0.9); c.fill();
  c.lineWidth = 0.055; c.strokeStyle = deep; c.stroke();
  c.lineWidth = 0.03; c.strokeStyle = col; c.stroke();
  c.beginPath(); c.arc(0, 0, 0.17, 0, 7);
  c.strokeStyle = A(hot, 0.75); c.lineWidth = 0.02; c.stroke();
  c.lineWidth = 0.05; c.strokeStyle = deep;            // the negation slash
  c.beginPath(); c.moveTo(-0.24, 0.24); c.lineTo(0.24, -0.24); c.stroke();
  c.lineWidth = 0.028; c.strokeStyle = hot; c.stroke();
});

/* ---- life ------------------------------------------------------------ */

const gravewake = makeIcon('life', (c, col, hot, deep) => {
  c.lineWidth = 0.05; c.strokeStyle = A(col, 0.8);    // the ground it comes out of
  c.beginPath(); c.moveTo(-0.42, 0.22); c.lineTo(0.42, 0.22); c.stroke();

  c.beginPath();                                      // cranium + jaw, one silhouette
  c.moveTo(-0.19, 0.06);
  c.bezierCurveTo(-0.23, -0.30, 0.23, -0.30, 0.19, 0.06);
  c.lineTo(0.12, 0.06); c.lineTo(0.11, 0.20); c.lineTo(-0.11, 0.20); c.lineTo(-0.12, 0.06);
  c.closePath();
  c.fillStyle = col; c.fill();
  c.lineWidth = 0.03; c.strokeStyle = deep; c.stroke();

  c.fillStyle = '#120409';                            // sockets, hard black so they read at 26px
  c.beginPath(); c.ellipse(-0.085, -0.07, 0.055, 0.068, 0.12, 0, 7); c.fill();
  c.beginPath(); c.ellipse(0.085, -0.07, 0.055, 0.068, -0.12, 0, 7); c.fill();
  c.beginPath();
  c.moveTo(0, 0.005); c.lineTo(0.035, 0.065); c.lineTo(-0.035, 0.065);
  c.closePath(); c.fill();
  c.fillStyle = A(hot, 0.95);                         // it is looking at you
  c.beginPath(); c.arc(-0.075, -0.055, 0.021, 0, 7); c.fill();
  c.beginPath(); c.arc(0.095, -0.055, 0.021, 0, 7); c.fill();
  c.strokeStyle = deep; c.lineWidth = 0.018;          // teeth
  c.beginPath(); c.moveTo(-0.05, 0.13); c.lineTo(0.05, 0.13); c.stroke();

  c.lineWidth = 0.032; c.strokeStyle = A(col, 0.8);   // hands clawing out beside it
  c.beginPath(); c.moveTo(-0.30, 0.22); c.lineTo(-0.33, 0.04); c.stroke();
  c.beginPath(); c.moveTo(0.30, 0.22); c.lineTo(0.34, 0.08); c.stroke();
});

export const FALLBACK_ICONS = {
  emberbolt, cinderwake, emberstorm, pyreveil,
  sparklash, stormcall, galewrench,
  stonepin, sunderquake, thornsurge, bulwark,
  acidrain, blightbloom, bloodtithe,
  voidlash, mirrorstep, nullring,
  gravewake,
};

/** Last resort for a spell id we have never heard of. */
export function genericIcon(c, size) {
  const sc = setup(c, size, 'void');
  c.lineWidth = 0.05; c.strokeStyle = sc.deep;
  c.beginPath(); c.arc(0, 0, 0.26, 0.5, 5.9); c.stroke();
  c.lineWidth = 0.028; c.strokeStyle = A(sc.css, 0.9); c.stroke();
  c.beginPath(); c.arc(0, 0, 0.09, 0, 7); c.fillStyle = C.brassL; c.fill();
  c.restore();
}

/* ------------------------------------------------------------------ *
 * Fallback spell table — DESIGN.md §3, one line each, in the game's voice.
 * Used when `spells/registry.js` is absent, and merged under it when present so a spell that
 * ships without `desc`/`cost` still renders a complete card.
 * ------------------------------------------------------------------ */

const S = (id, name, school, unlockLevel, cost, cooldown, range, targeting, desc, r3, r5) => ({
  id, name, school, unlockLevel, cost, cooldown, range, targeting, desc, levels: 5,
  ranks: { 3: r3, 5: r5 },
  icon: FALLBACK_ICONS[id] || genericIcon,
  fallback: true,
});

export const FALLBACK_SPELLS = {
  emberbolt:  S('emberbolt', 'Emberbolt', 'fire', 1, 8, 0.65, 620, 'aim',
    'A bolt you can actually aim. It sets the wood alight whether you meant it to or not.',
    'Forks on a kill.', 'Leaves a burning trail.'),
  cinderwake: S('cinderwake', 'Cinderwake', 'fire', 5, 22, 6.0, 0, 'self',
    'Embers orbit you and burn what they brush past. Do not stand in a barn.',
    'Four embers instead of two.', 'Embers detonate when they die.'),
  emberstorm: S('emberstorm', 'Emberstorm', 'fire', 12, 46, 9.0, 900, 'area',
    'Meteors come down across the screen. Slow, ruinous, hard to explain afterwards.',
    'Wider band.', 'Craters keep burning.'),
  pyreveil:   S('pyreveil', 'Pyreveil', 'fire', 9, 26, 8.0, 220, 'self',
    'A ring of flame that burns whatever crosses it. The closest thing you have to a wall.',
    'The ring pushes outward.', 'Scorched ground stays lit.'),

  sparklash:  S('sparklash', 'Sparklash', 'storm', 3, 12, 1.1, 520, 'nearest',
    'Lightning that goes looking. Glass never survives it.',
    'Chains to six.', 'Each arc rings nearby metal.'),
  stormcall:  S('stormcall', 'Stormcall', 'storm', 8, 30, 7.5, 700, 'ground',
    'A storm cell that stays where you put it and strikes on its own schedule.',
    'Strikes twice as often.', 'Strikes ignite what they hit.'),
  galewrench: S('galewrench', 'Galewrench', 'storm', 4, 10, 1.6, 460, 'aim',
    'All shove, no damage. Trees do not care for it.',
    'Topples heavier things.', 'Blows fire sideways into them.'),

  stonepin:   S('stonepin', 'Stonepin', 'earth', 2, 14, 1.2, 560, 'aim',
    'A shard the size of your arm, thrown badly and very hard.',
    'Shatters on impact.', 'Impact cracks the ground.'),
  sunderquake: S('sunderquake', 'Sunderquake', 'earth', 6, 34, 5.5, 300, 'self',
    'You hit the ground. The ground tells everything above it.',
    'Wider fault.', 'Collapses what the fault supported.'),
  thornsurge: S('thornsurge', 'Thornsurge', 'earth', 10, 24, 4.0, 640, 'ground',
    'Roots come up in a line and hold whatever they catch.',
    'Longer line.', 'Roots crack the stone they burst through.'),
  bulwark:    S('bulwark', 'Bulwark', 'earth', 7, 20, 6.5, 420, 'ground',
    'Cover, raised out of the floor. It breaks like everything else does.',
    'Taller and tougher.', 'Shatters into shrapnel when it goes.'),

  acidrain:   S('acidrain', 'Acid Rain', 'decay', 11, 38, 8.5, 820, 'area',
    'It drips, it pools, it runs downhill, and it is still eating the bridge later.',
    'Pools last twice as long.', 'Pools ooze and spread.'),
  blightbloom: S('blightbloom', 'Blightbloom', 'decay', 6, 18, 3.4, 480, 'nearest',
    'A spore cloud that walks itself from corpse to corpse.',
    'Spreads on death.', 'Rots foliage to brittle.'),
  bloodtithe: S('bloodtithe', 'Bloodtithe', 'decay', 4, 16, 2.8, 440, 'nearest',
    'You take some back. The grass does not recover.',
    'Heals for double.', 'Overheal becomes a short ward.'),

  voidlash:   S('voidlash', 'Voidlash', 'void', 8, 20, 3.2, 600, 'nearest',
    'A tether that drags them into one convenient pile.',
    'Pulls three at once.', 'Pulls loose debris in with them.'),
  mirrorstep: S('mirrorstep', 'Mirrorstep', 'void', 5, 15, 4.0, 380, 'self',
    'You blink. Something that looked like you stays behind and objects.',
    'The decoy taunts.', 'The decoy detonates twice.'),
  nullring:   S('nullring', 'Nullring', 'void', 13, 32, 10.0, 520, 'ground',
    'A circle where nothing gets to keep its momentum. Not even the fire.',
    'Larger circle.', 'Erases projectiles outright.'),

  gravewake:  S('gravewake', 'Gravewake', 'life', 9, 36, 9.5, 560, 'ground',
    'The dead get up. They are not grateful, but they are on your side.',
    'Raises three.', 'Risen leave bone piles of their own.'),
};

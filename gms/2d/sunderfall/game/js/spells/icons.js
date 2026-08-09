/**
 * Spell icons, drawn in code. No PNGs — an icon has to survive being drawn at
 * 28px on a phone and at 96px on a level-up card, and a canvas path does that
 * for free while a sprite does not.
 *
 * Every icon draws inside a `size` × `size` box with the origin at the top-left,
 * leaves the background transparent, and restores the context state it changed.
 * These go through a normal 2D canvas, not the renderer, so colours are plain
 * sRGB — none of the squaring rules apply here.
 */

const INK = {
  fire: ['#ffb14a', '#ff6a1e', '#5a1c07'],
  storm: ['#bfe2ff', '#6fa8ff', '#1b2a5e'],
  earth: ['#d8bd8f', '#a07a4a', '#3a2a1a'],
  decay: ['#c2e86a', '#7fae2e', '#20330f'],
  void: ['#c4a6ff', '#8158e0', '#22103c'],
  life: ['#ffb3ac', '#e2645f', '#3d1114'],
};

function glow(c, x, y, r, color, alpha) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = alpha === undefined ? 0.55 : alpha;
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
}

function poly(c, pts, fill, stroke, lw) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); }
}

function ring(c, x, y, r, color, lw, from, to) {
  c.beginPath();
  c.arc(x, y, r, from === undefined ? 0 : from, to === undefined ? Math.PI * 2 : to);
  c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
}

function bolt(c, pts, color, lw) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = color; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}

/** Every icon starts from the same setup so schools read as a family. */
function frame(c, s, school) {
  c.save();
  c.clearRect(0, 0, s, s);
  const k = INK[school];
  // keep the school wash well inside the tile — a halo that reaches the corners
  // reads as a pale square behind the icon on a dark HUD
  glow(c, s * 0.5, s * 0.52, s * 0.40, k[1], 0.16);
  return k;
}

export const ICONS = {

  emberbolt(c, s) {
    const k = frame(c, s, 'fire');
    glow(c, s * 0.42, s * 0.5, s * 0.3, k[0], 0.6);
    poly(c, [s * 0.16, s * 0.5, s * 0.5, s * 0.30, s * 0.42, s * 0.48, s * 0.86, s * 0.44,
      s * 0.44, s * 0.60, s * 0.52, s * 0.62], k[0], k[2], s * 0.03);
    c.restore();
  },

  cinderwake(c, s) {
    const k = frame(c, s, 'fire');
    ring(c, s * 0.5, s * 0.5, s * 0.30, k[2], s * 0.05);
    ring(c, s * 0.5, s * 0.5, s * 0.30, k[1], s * 0.03);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09 - 0.6;
      const x = s * 0.5 + Math.cos(a) * s * 0.30, y = s * 0.5 + Math.sin(a) * s * 0.30;
      glow(c, x, y, s * 0.16, k[0], 0.9);
      c.fillStyle = '#fff3d4'; c.beginPath(); c.arc(x, y, s * 0.055, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  },

  emberstorm(c, s) {
    const k = frame(c, s, 'fire');
    c.fillStyle = k[2];
    c.beginPath(); c.ellipse(s * 0.5, s * 0.26, s * 0.34, s * 0.13, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 3; i++) {
      const x = s * (0.26 + i * 0.24);
      bolt(c, [x + s * 0.14, s * 0.34, x - s * 0.04, s * 0.82], k[1], s * 0.06);
      glow(c, x - s * 0.04, s * 0.82, s * 0.15, k[0], 0.85);
    }
    c.restore();
  },

  pyreveil(c, s) {
    const k = frame(c, s, 'fire');
    ring(c, s * 0.5, s * 0.56, s * 0.32, k[2], s * 0.09);
    ring(c, s * 0.5, s * 0.56, s * 0.32, k[1], s * 0.05);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = s * 0.5 + Math.cos(a) * s * 0.32, y = s * 0.56 + Math.sin(a) * s * 0.32;
      poly(c, [x - s * 0.05, y, x, y - s * 0.16, x + s * 0.05, y], k[0], null);
    }
    c.restore();
  },

  sparklash(c, s) {
    const k = frame(c, s, 'storm');
    bolt(c, [s * 0.20, s * 0.14, s * 0.46, s * 0.42, s * 0.32, s * 0.48, s * 0.62, s * 0.86], k[2], s * 0.16);
    bolt(c, [s * 0.20, s * 0.14, s * 0.46, s * 0.42, s * 0.32, s * 0.48, s * 0.62, s * 0.86], k[0], s * 0.07);
    bolt(c, [s * 0.52, s * 0.40, s * 0.82, s * 0.28], k[1], s * 0.05);
    glow(c, s * 0.62, s * 0.86, s * 0.16, k[0], 0.8);
    c.restore();
  },

  stormcall(c, s) {
    const k = frame(c, s, 'storm');
    c.fillStyle = '#2b3350';
    c.beginPath();
    c.ellipse(s * 0.40, s * 0.32, s * 0.22, s * 0.13, 0, 0, Math.PI * 2);
    c.ellipse(s * 0.62, s * 0.30, s * 0.18, s * 0.11, 0, 0, Math.PI * 2);
    c.fill();
    bolt(c, [s * 0.46, s * 0.44, s * 0.36, s * 0.62, s * 0.52, s * 0.60, s * 0.42, s * 0.88], k[0], s * 0.06);
    glow(c, s * 0.42, s * 0.88, s * 0.14, k[1], 0.8);
    c.restore();
  },

  galewrench(c, s) {
    const k = frame(c, s, 'storm');
    for (let i = 0; i < 3; i++) {
      const y = s * (0.32 + i * 0.18);
      c.beginPath();
      c.moveTo(s * 0.12, y);
      c.bezierCurveTo(s * 0.5, y - s * 0.10, s * 0.66, y + s * 0.10, s * 0.86, y - s * 0.04);
      c.strokeStyle = i === 1 ? k[0] : k[1];
      c.lineWidth = s * (i === 1 ? 0.07 : 0.045); c.lineCap = 'round'; c.stroke();
    }
    ring(c, s * 0.80, s * 0.36, s * 0.10, k[0], s * 0.045, -0.4, 3.6);
    c.restore();
  },

  stonepin(c, s) {
    const k = frame(c, s, 'earth');
    poly(c, [s * 0.5, s * 0.10, s * 0.66, s * 0.46, s * 0.56, s * 0.86, s * 0.44, s * 0.86, s * 0.34, s * 0.46],
      k[1], k[2], s * 0.035);
    poly(c, [s * 0.5, s * 0.12, s * 0.60, s * 0.46, s * 0.5, s * 0.80], k[0], null);
    c.fillStyle = k[2];
    c.beginPath(); c.ellipse(s * 0.5, s * 0.86, s * 0.26, s * 0.06, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  },

  sunderquake(c, s) {
    const k = frame(c, s, 'earth');
    c.fillStyle = k[2];
    c.fillRect(s * 0.08, s * 0.58, s * 0.84, s * 0.30);
    bolt(c, [s * 0.10, s * 0.62, s * 0.34, s * 0.60, s * 0.44, s * 0.80, s * 0.58, s * 0.60, s * 0.90, s * 0.63], k[1], s * 0.05);
    for (let i = 0; i < 3; i++) {
      const x = s * (0.28 + i * 0.22);
      bolt(c, [x, s * 0.56, x + (i - 1) * s * 0.06, s * 0.28], k[0], s * 0.035);
    }
    c.restore();
  },

  thornsurge(c, s) {
    const k = frame(c, s, 'earth');
    c.fillStyle = k[2]; c.fillRect(s * 0.06, s * 0.76, s * 0.88, s * 0.14);
    for (let i = 0; i < 4; i++) {
      const x = s * (0.20 + i * 0.20);
      const h = s * (0.34 + (i % 2) * 0.16);
      poly(c, [x - s * 0.055, s * 0.78, x, s * 0.78 - h, x + s * 0.055, s * 0.78], '#4d6b2a', '#20330f', s * 0.025);
      poly(c, [x, s * 0.78 - h * 0.55, x + s * 0.11, s * 0.78 - h * 0.72, x + s * 0.02, s * 0.78 - h * 0.42], '#6f9a3c', null);
    }
    c.restore();
  },

  bulwark(c, s) {
    const k = frame(c, s, 'earth');
    c.fillStyle = k[1];
    c.fillRect(s * 0.16, s * 0.36, s * 0.68, s * 0.50);
    c.fillStyle = k[2];
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        c.fillRect(s * (0.18 + i * 0.17 + (r % 2) * 0.08), s * (0.40 + r * 0.16), s * 0.13, s * 0.02);
      }
      c.fillRect(s * 0.16, s * (0.38 + r * 0.16), s * 0.68, s * 0.015);
    }
    poly(c, [s * 0.16, s * 0.36, s * 0.30, s * 0.22, s * 0.44, s * 0.36], k[0], null);
    c.restore();
  },

  acidrain(c, s) {
    const k = frame(c, s, 'decay');
    c.fillStyle = '#35431c';
    c.beginPath();
    c.ellipse(s * 0.42, s * 0.26, s * 0.26, s * 0.12, 0, 0, Math.PI * 2);
    c.ellipse(s * 0.64, s * 0.24, s * 0.20, s * 0.10, 0, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 4; i++) {
      const x = s * (0.28 + i * 0.16);
      poly(c, [x, s * (0.44 + (i % 2) * 0.08), x - s * 0.045, s * (0.62 + (i % 2) * 0.08), x + s * 0.045, s * (0.62 + (i % 2) * 0.08)], k[0], null);
    }
    c.fillStyle = k[1];
    c.beginPath(); c.ellipse(s * 0.5, s * 0.84, s * 0.34, s * 0.07, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  },

  blightbloom(c, s) {
    const k = frame(c, s, 'decay');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      glow(c, s * 0.5 + Math.cos(a) * s * 0.22, s * 0.52 + Math.sin(a) * s * 0.22, s * 0.20, k[1], 0.5);
    }
    glow(c, s * 0.5, s * 0.52, s * 0.22, k[0], 0.75);
    c.fillStyle = '#2a3a12';
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      c.beginPath();
      c.arc(s * 0.5 + Math.cos(a) * s * 0.20, s * 0.52 + Math.sin(a) * s * 0.18, s * 0.035, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  },

  bloodtithe(c, s) {
    const k = frame(c, s, 'life');
    c.beginPath();
    c.moveTo(s * 0.20, s * 0.76);
    c.bezierCurveTo(s * 0.36, s * 0.40, s * 0.64, s * 0.66, s * 0.80, s * 0.26);
    c.strokeStyle = k[1]; c.lineWidth = s * 0.075; c.lineCap = 'round'; c.stroke();
    c.strokeStyle = k[0]; c.lineWidth = s * 0.03; c.stroke();
    glow(c, s * 0.80, s * 0.26, s * 0.18, k[0], 0.85);
    poly(c, [s * 0.20, s * 0.62, s * 0.30, s * 0.80, s * 0.10, s * 0.80], k[1], null);
    c.restore();
  },

  voidlash(c, s) {
    const k = frame(c, s, 'void');
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.9;
      c.beginPath();
      c.moveTo(s * 0.5 + Math.cos(a) * s * 0.40, s * 0.5 + Math.sin(a) * s * 0.40);
      c.quadraticCurveTo(s * 0.5 + Math.cos(a) * s * 0.22, s * 0.5 + Math.sin(a) * s * 0.30, s * 0.5, s * 0.5);
      c.strokeStyle = k[1]; c.lineWidth = s * 0.045; c.lineCap = 'round'; c.stroke();
    }
    c.fillStyle = '#0b0414';
    c.beginPath(); c.arc(s * 0.5, s * 0.5, s * 0.17, 0, Math.PI * 2); c.fill();
    ring(c, s * 0.5, s * 0.5, s * 0.17, k[0], s * 0.03);
    c.restore();
  },

  mirrorstep(c, s) {
    const k = frame(c, s, 'void');
    c.globalAlpha = 0.4;
    poly(c, [s * 0.22, s * 0.28, s * 0.38, s * 0.28, s * 0.40, s * 0.82, s * 0.20, s * 0.82], k[2], k[1], s * 0.025);
    c.globalAlpha = 1;
    poly(c, [s * 0.60, s * 0.24, s * 0.80, s * 0.24, s * 0.78, s * 0.84, s * 0.58, s * 0.84], k[1], k[0], s * 0.025);
    bolt(c, [s * 0.44, s * 0.56, s * 0.56, s * 0.50], k[0], s * 0.04);
    c.restore();
  },

  nullring(c, s) {
    const k = frame(c, s, 'void');
    ring(c, s * 0.5, s * 0.5, s * 0.34, '#0d0618', s * 0.10);
    ring(c, s * 0.5, s * 0.5, s * 0.34, k[1], s * 0.045);
    ring(c, s * 0.5, s * 0.5, s * 0.20, k[0], s * 0.025);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      bolt(c, [s * 0.5 + Math.cos(a) * s * 0.22, s * 0.5 + Math.sin(a) * s * 0.22,
        s * 0.5 + Math.cos(a) * s * 0.32, s * 0.5 + Math.sin(a) * s * 0.32], k[0], s * 0.02);
    }
    c.restore();
  },

  gravewake(c, s) {
    const k = frame(c, s, 'life');
    c.fillStyle = '#2a1d16';
    c.beginPath(); c.ellipse(s * 0.5, s * 0.84, s * 0.34, s * 0.09, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ded6c0';
    c.beginPath(); c.arc(s * 0.5, s * 0.44, s * 0.19, 0, Math.PI * 2); c.fill();
    c.fillRect(s * 0.38, s * 0.52, s * 0.24, s * 0.16);
    c.fillStyle = '#1a1410';
    c.beginPath(); c.arc(s * 0.43, s * 0.42, s * 0.05, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(s * 0.57, s * 0.42, s * 0.05, 0, Math.PI * 2); c.fill();
    glow(c, s * 0.43, s * 0.42, s * 0.09, k[0], 0.9);
    glow(c, s * 0.57, s * 0.42, s * 0.09, k[0], 0.9);
    for (let i = 0; i < 3; i++) c.fillRect(s * (0.40 + i * 0.08), s * 0.54, s * 0.04, s * 0.13);
    c.restore();
  },
};

/** Attach each icon to its spell def. Keeps the drawing code out of the specs. */
export function attachIcons(list) {
  for (let i = 0; i < list.length; i++) {
    const def = list[i];
    if (ICONS[def.id]) def.icon = ICONS[def.id];
    else def.icon = fallbackIcon(def.school);
  }
  return list;
}

function fallbackIcon(school) {
  return function (c, s) {
    const k = frame(c, s, school || 'fire');
    glow(c, s * 0.5, s * 0.5, s * 0.3, k[0], 0.8);
    c.restore();
  };
}

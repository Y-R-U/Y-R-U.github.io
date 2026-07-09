// Round minimap: a pre-rendered map base (terrain + buildings) cropped
// around the player, with live blips (police, gang, pickups, hotspots) and
// a pulsing mission marker that clamps to the rim with a heading arrow.

import { TILE_COLORS } from './world.js';
import { CFG } from './config.js';

const MM_COLORS = { g: '#4c7a33', d: '#8a6533', s: '#b7a468', r: '#22262a', p: '#5c6165', w: '#215e84' };

export class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.base = null;
    this.scale = 1;      // base px per metre
    this.view = 150;     // metres across the round window
    this.t = 0;
  }

  build(level) {
    const px = 3;        // px per tile on the base map
    this.base = document.createElement('canvas');
    this.base.width = level.w * px;
    this.base.height = level.h * px;
    this.scale = px / level.tile;
    const b = this.base.getContext('2d');
    for (let r = 0; r < level.h; r++)
      for (let c = 0; c < level.w; c++) {
        b.fillStyle = MM_COLORS[level.ground[r][c]] || MM_COLORS.g;
        b.fillRect(c * px, r * px, px, px);
      }
    // buildings as blocks
    b.fillStyle = 'rgba(210,216,222,0.85)';
    for (const o of level.objects || []) {
      if (o.m.startsWith('bld_') || o.m === 'hangar' || o.m === 'ship' || o.m === 'crane' || o.m.startsWith('cont_')) {
        const s = (o.m === 'ship' ? 14 : o.m.startsWith('bld_') ? 9 : 5) * (o.s || 1);
        b.save();
        b.translate(o.x * this.scale, o.z * this.scale);
        b.rotate(-(o.rot || 0));
        b.fillRect(-s * this.scale * 2, -s * this.scale * 2, s * this.scale * 4, s * this.scale * 4);
        b.restore();
      }
    }
  }

  draw(px, pz, pyaw, { marker, police, gang, hotspots, pickups }) {
    if (!this.base) return;
    this.t += 0.032;
    const g = this.g, S = this.cv.width;
    const zoom = S / this.view;              // screen px per metre
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    // base crop
    g.fillStyle = '#0d1613'; g.fillRect(0, 0, S, S);
    const srcW = this.view * this.scale;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base,
      px * this.scale - srcW / 2, pz * this.scale - srcW / 2, srcW, srcW,
      0, 0, S, S);

    const toMap = (x, z) => [S / 2 + (x - px) * zoom, S / 2 + (z - pz) * zoom];
    const dot = (x, z, color, r = 3.5) => {
      const [mx, mz] = toMap(x, z);
      if (mx < -8 || mz < -8 || mx > S + 8 || mz > S + 8) return;
      g.fillStyle = color;
      g.beginPath(); g.arc(mx, mz, r, 0, Math.PI * 2); g.fill();
    };

    for (const h of hotspots || []) {
      const color = h.faction === 'police' ? '#4da3ff' : h.faction === 'gang' ? '#ff5f7a'
        : h.kind === 'shop' || h.kind === 'garage' ? '#8ef0b2' : '#ffd76a';
      dot(h.x, h.z, color, 4.5);
    }
    for (const p of pickups || []) if (!p.hidden) dot(p.x, p.z, '#9adfff', 2.4);
    for (const c of police || []) if (!c.dead) dot(c.x, c.z, '#ff4b3a', 3.2);
    for (const c of gang || []) if (!c.dead) dot(c.x, c.z, '#ff8a2e', 3.2);

    // mission marker: pulsing diamond, clamped to rim with arrow
    if (marker) {
      const [mx, mz] = toMap(marker.x, marker.z);
      const dx = mx - S / 2, dz = mz - S / 2;
      const d = Math.hypot(dx, dz);
      const rim = S / 2 - 12;
      const pulse = 5 + Math.sin(this.t * 4) * 1.6;
      if (d <= rim) {
        g.fillStyle = '#ffd76a';
        g.save(); g.translate(mx, mz); g.rotate(Math.PI / 4);
        g.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
        g.restore();
      } else {
        const ux = dx / d, uz = dz / d;
        const ex = S / 2 + ux * rim, ez = S / 2 + uz * rim;
        g.fillStyle = '#ffd76a';
        g.save(); g.translate(ex, ez); g.rotate(Math.atan2(uz, ux));
        g.beginPath(); g.moveTo(9, 0); g.lineTo(-4, -6); g.lineTo(-4, 6); g.closePath(); g.fill();
        g.restore();
      }
    }

    // player arrow
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.atan2(Math.sin(pyaw), Math.cos(pyaw)) * -1 + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -7.5); g.lineTo(5.5, 6.5); g.lineTo(0, 3.5); g.lineTo(-5.5, 6.5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    g.restore();
  }
}

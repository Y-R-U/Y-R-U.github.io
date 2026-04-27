// Floating neon name tags. Each tank has an HTML overlay element placed at the
// tank's projected screen position. Visual: a vertical neon line goes up from
// the tank, then bends right and continues as the underline beneath the name.

import * as THREE from 'three';

const _w = new THREE.Vector3();

export class NameTagSystem {
  constructor(layer, camera) {
    this.layer = layer;
    this.camera = camera;
    this.tags = new Map(); // tank -> { el, line, name, hp, lastVisible }
  }

  attach(tank) {
    const el = document.createElement('div');
    el.className = 'tank-tag';
    if (tank.isPlayer) el.classList.add('is-player');

    const name = document.createElement('span');
    name.className = 'tank-tag-name';
    name.textContent = tank.name.toUpperCase();

    const line = document.createElement('div');
    line.className = 'tank-tag-line';

    const hp = document.createElement('div');
    hp.className = 'tank-tag-hp';
    const hpFill = document.createElement('div');
    hpFill.style.width = '100%';
    hp.appendChild(hpFill);

    el.appendChild(line);
    el.appendChild(name);
    el.appendChild(hp);

    // Variable-driven colors
    el.style.setProperty('--tag-color', tank.color.tag);
    el.style.setProperty('--tag-glow', tank.color.glow);

    // Width based on name length (so underline matches text)
    const w = Math.max(76, 24 + tank.name.length * 9);
    el.style.setProperty('--tag-w', `${w}px`);
    el.style.setProperty('--tag-h', `${52 + Math.random() * 14 | 0}px`);

    this.layer.appendChild(el);
    this.tags.set(tank, { el, line, name, hp: hpFill, lastVisible: true });
  }

  detach(tank) {
    const t = this.tags.get(tank);
    if (!t) return;
    t.el.remove();
    this.tags.delete(tank);
  }

  detachAll() {
    for (const t of this.tags.values()) t.el.remove();
    this.tags.clear();
  }

  update() {
    const cam = this.camera;
    const W = innerWidth, H = innerHeight;
    for (const [tank, rec] of this.tags) {
      if (!tank.alive) {
        if (rec.lastVisible) {
          rec.el.style.display = 'none';
          rec.lastVisible = false;
        }
        continue;
      }
      // Get world position of tag anchor (above turret)
      tank.getTagWorld(_w);
      // Project to NDC
      _w.project(cam);
      // Behind camera?
      if (_w.z > 1) {
        if (rec.lastVisible) {
          rec.el.style.display = 'none';
          rec.lastVisible = false;
        }
        continue;
      }
      const sx = (_w.x * 0.5 + 0.5) * W;
      const sy = (-_w.y * 0.5 + 0.5) * H;
      // anchor: bottom-left of L-shape sits on tank's projected point.
      rec.el.style.left = `${sx | 0}px`;
      rec.el.style.top = `${sy | 0}px`;

      // HP fill
      const hpPct = Math.max(0, tank.health / tank.maxHealth);
      rec.hp.style.width = (hpPct * 100) + '%';
      if (hpPct <= 0.3) rec.el.classList.add('is-low-hp');
      else rec.el.classList.remove('is-low-hp');

      if (!rec.lastVisible) {
        rec.el.style.display = '';
        rec.lastVisible = true;
      }
    }
  }
}

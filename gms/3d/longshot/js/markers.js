// LONGSHOT — objective markers.
// A sniper's first problem is FINDING the mark in a city of ten thousand
// windows. Every live objective gets a screen-space diamond with its range, and
// when it's outside your view an arrow pins to the screen edge pointing at it —
// so you always know which way to turn. (Settings → Target markers turns them
// off for anyone who wants to hunt cold.)

import * as THREE from 'three';
import { $, el } from './utils.js';
import { save } from './save.js';

const T = THREE;

const ICON = { target: '◈', plate: '◎', vip: '✚', killer: '✖', car: '▣' };
const COLOR = { target: '#ff4436', plate: '#e8a33d', vip: '#37c86b', killer: '#ff4436', car: '#ff4436' };

export class Markers {
  constructor() {
    this.wrap = el('div', null, '');
    this.wrap.id = 'markers';
    $('hud').appendChild(this.wrap);
    this.pool = [];
    this.enabled = true;
  }

  _get(i) {
    if (!this.pool[i]) {
      const m = el('div', 'marker');
      m.innerHTML = '<span class="mk-ico"></span><span class="mk-dist"></span>';
      this.wrap.appendChild(m);
      this.pool[i] = m;
    }
    return this.pool[i];
  }

  hideAll() { for (const m of this.pool) m.style.display = 'none'; }

  // items: [{ pos: Vector3, kind, label }]
  update(items, camera) {
    if (!this.enabled || save.settings.markers === false || !items.length) return this.hideAll();
    const W = innerWidth, H = innerHeight;
    const pad = 46;
    const camPos = camera.getWorldPosition(new T.Vector3());
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new T.Quaternion()));
    let n = 0;
    for (const it of items) {
      const m = this._get(n++);
      const p = it.pos.clone();
      const dist = camPos.distanceTo(p);
      const rel = p.clone().sub(camPos);
      const behind = rel.dot(fwd) < 0;
      const proj = p.clone().project(camera);
      let x = (proj.x * 0.5 + 0.5) * W;
      let y = (-proj.y * 0.5 + 0.5) * H;
      const off = behind || x < pad || x > W - pad || y < pad || y > H - pad;

      m.style.display = 'flex';
      m.className = 'marker' + (off ? ' edge' : '');
      const ico = m.firstChild, lab = m.lastChild;
      ico.style.color = COLOR[it.kind] || '#ff4436';

      if (off) {
        // point at it from the screen centre, clamped to a border ellipse
        let dx = x - W / 2, dy = y - H / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const ang = Math.atan2(dy, dx);
        const rx = W / 2 - pad, ry = H / 2 - pad;
        const k = 1 / Math.max(Math.abs(Math.cos(ang)) / rx, Math.abs(Math.sin(ang)) / ry);
        x = W / 2 + Math.cos(ang) * k;
        y = H / 2 + Math.sin(ang) * k;
        ico.textContent = '➤';
        ico.style.transform = `rotate(${ang}rad)`;
        lab.textContent = Math.round(dist) + 'm';
      } else {
        ico.textContent = ICON[it.kind] || '◈';
        ico.style.transform = '';
        lab.textContent = (it.label ? it.label + ' · ' : '') + Math.round(dist) + 'm';
      }
      m.style.left = x + 'px';
      m.style.top = y + 'px';
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }

  dispose() { this.wrap.remove(); }
}

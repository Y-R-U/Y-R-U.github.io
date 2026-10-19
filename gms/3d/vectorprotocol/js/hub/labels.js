// Neon name labels with leader lines, projected from 3D anchors each frame into a DOM overlay.
import * as THREE from 'three';

const CSS = `
.vp-hub-ov{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:"Rajdhani","Orbitron","Segoe UI",sans-serif;z-index:2}
.vp-hub-ov svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.vp-hub-ov line{stroke-width:1.4;stroke-linecap:round}
.vp-hub-ov .lead-glow{stroke-width:5;opacity:.28}
.vp-hub-lab{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;white-space:nowrap;will-change:transform;transition:filter .15s}
.vp-hub-lab::after{content:"";position:absolute;left:0;right:0;top:calc(-1px * var(--hp,0));bottom:calc(-1px * var(--hp,0))}
.vp-hub-lab .b{position:relative;padding:4px 10px 5px 10px;min-width:64px;
  color:#eaffff;background:linear-gradient(180deg,rgba(6,16,34,.84),rgba(4,10,24,.72));
  border:1.5px solid var(--c);box-shadow:0 0 12px -2px var(--c),inset 0 0 10px -4px var(--c);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px)}
.vp-hub-lab .b::before{content:"";position:absolute;left:0;top:0;width:3px;height:100%;background:var(--c);box-shadow:0 0 8px var(--c)}
.vp-hub-lab .n{font-family:"Orbitron","Rajdhani",sans-serif;font-weight:800;font-size:11.5px;letter-spacing:.08em;line-height:1.15;text-shadow:0 0 8px var(--c),0 0 2px var(--c)}
.vp-hub-lab .s{font-size:10px;font-weight:600;letter-spacing:.06em;color:var(--c);opacity:.9;line-height:1.2;text-transform:uppercase}
.vp-hub-lab .badge{display:inline-block;vertical-align:1px;margin-left:6px;min-width:15px;height:15px;padding:0 4px;background:#ff3550;color:#fff;font:800 10px/16px "Rajdhani",sans-serif;text-align:center;box-shadow:0 0 8px #ff3550}
.vp-hub-lab:active,.vp-hub-lab.hot{filter:brightness(1.5)}
.vp-hub-lab.locked{--c:#6c7a90 !important}
.vp-hub-lab.locked .b{color:#9aa6b8;background:rgba(10,14,22,.78);box-shadow:none}
.vp-hub-lab.locked .n{text-shadow:none}
.vp-hub-lab.locked .s{color:#ffb547;opacity:.85}
.vp-hub-lab .lock{display:inline-block;width:9px;height:7px;margin-right:6px;border:1.5px solid currentColor;border-radius:1px;position:relative;top:0}
.vp-hub-lab .lock::before{content:"";position:absolute;left:1px;bottom:6px;width:4px;height:4px;border:1.5px solid currentColor;border-bottom:none;border-radius:4px 4px 0 0}
.vp-hub-lab .pulse{position:absolute;inset:-1px;border:1px solid var(--c);animation:vpPulse 2.6s ease-out infinite;pointer-events:none}
@keyframes vpPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.18,1.5)}}
.vp-hub-dot{position:absolute;left:0;top:0;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:var(--c);box-shadow:0 0 8px 2px var(--c);pointer-events:none}
.vp-hub-dot::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:1px solid var(--c);opacity:.6}
`;

// preferred label offset from the anchor (CSS px): x to the label centre, y to its bottom edge. Barracks hangs below-right
// over its own roof so it never covers the recruitment pad behind it.
const OFFSETS = {
  hq: [0, -44], story: [-10, -52], arena: [12, -52], recruit: [-34, -78], events: [20, -40], workshop: [-14, -44], squad: [74, 52],
};
// landscape: labels splay sideways away from the compound centre instead of stacking upward. x = gap between the anchor and
// the label's near edge (the label sits left of left-half anchors, right of right-half ones), y = to the label's bottom edge.
const OFFSETS_WIDE = { side: [64, -18], hq: [0, -40] };
const WIDE_SIDE = { story: -1, workshop: -1, recruit: -1, arena: 1, events: 1, squad: 1 };

const HIT_H = 44;
const TALL_DEF = { top: 64, bottom: 90, side: 8 };
export function createLabels(container, features, { onSelect, margins = TALL_DEF } = {}) {
  let CORNER = { w: 130, h: 52, ...(margins.corner || {}) };
  let wide = false;
  if (!document.getElementById('vp-hub-style')) { const s = document.createElement('style'); s.id = 'vp-hub-style'; s.textContent = CSS; document.head.appendChild(s); }
  const ov = document.createElement('div'); ov.className = 'vp-hub-ov';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ov.appendChild(svg); container.appendChild(ov);
  const items = features.map((f) => {
    const el = document.createElement('div'); el.className = 'vp-hub-lab'; el.style.setProperty('--c', f.color);
    el.dataset.id = f.id;
    const dot = document.createElement('div'); dot.className = 'vp-hub-dot'; dot.style.setProperty('--c', f.color);
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'line'); glow.classList.add('lead-glow');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    svg.append(glow, line); ov.append(dot, el);
    el.addEventListener('click', (e) => { e.stopPropagation(); onSelect?.(f.id); });
    const it = { f, el, dot, line, glow, w: 0, h: 0, p: 0, x: 0, y: 0, vis: true };
    return it;
  });

  function render(state) {
    for (const it of items) {
      const f = it.f, locked = !state.unlocked.has(f.id);
      it.locked = locked;
      it.el.classList.toggle('locked', locked);
      const badge = state.badges?.[f.id];
      it.el.innerHTML = `<div class="b"><div class="n">${locked ? '<span class="lock"></span>' : ''}${state.names[f.id] || f.name}${badge && !locked ? `<span class="badge">${badge}</span>` : ''}</div>`
        + `<div class="s">${locked ? (state.hints?.[f.id] || f.unlockHint || 'Locked') : (state.subs[f.id] || f.sub)}</div>`
        + (state.highlight === f.id && !locked ? '<span class="pulse"></span>' : '') + '</div>';
      const col = locked ? '#6c7a90' : f.color;
      for (const l of [it.line, it.glow]) l.setAttribute('stroke', col);
      it.dot.style.setProperty('--c', col);
      it.w = it.el.offsetWidth; it.h = it.el.offsetHeight;
      // the visual box stays 36 px; an invisible band above/below makes the tap target >= HIT_H, and layout keeps those bands apart
      it.p = Math.max(0, Math.ceil((HIT_H - it.h) / 2)); it.el.style.setProperty('--hp', it.p);
    }
  }

  const v = new THREE.Vector3();
  // push a label out of a keep-out rect along the shortest axis
  function avoidRect(it, r) {
    const ox1 = it.x + it.w - r.x, ox2 = r.x + r.w - it.x, oy1 = it.y + it.h + it.p - r.y, oy2 = r.y + r.h - it.y + it.p;
    if (ox1 <= 0 || ox2 <= 0 || oy1 <= 0 || oy2 <= 0) return;
    const m = Math.min(ox1, ox2, oy1, oy2);
    if (m === oy1) it.y -= oy1 + 4; else if (m === ox1) it.x -= ox1 + 4; else if (m === oy2) it.y += oy2 + 4; else it.x += ox2 + 4;
  }
  function update(camera, anchors, W, H) {
    const L = wide ? margins.left ?? margins.side ?? 8 : margins.side, R = wide ? margins.right ?? margins.side ?? 8 : margins.side;
    const cx = (L + W - R) / 2;
    // project + preferred placement
    for (const it of items) {
      v.copy(anchors[it.f.id]).project(camera);
      it.ax = (v.x * 0.5 + 0.5) * W; it.ay = (-v.y * 0.5 + 0.5) * H;
      it.vis = v.z < 1;
      if (wide) {
        const id = it.f.id;
        if (id === 'hq') { const [dx, dy] = OFFSETS_WIDE.hq; it.x = it.ax + dx - it.w / 2; it.y = it.ay + dy - it.h; continue; }
        const side = Math.abs(it.ax - cx) > 24 ? Math.sign(it.ax - cx) : WIDE_SIDE[id] || 1, [gap, dy] = OFFSETS_WIDE.side;
        it.x = side < 0 ? it.ax - gap - it.w : it.ax + gap; it.y = it.ay + dy - it.h;
        continue;
      }
      const [dx, dy] = OFFSETS[it.f.id] || [0, -46];
      it.x = it.ax + dx - it.w / 2; it.y = it.ay + dy - it.h;
    }
    const avoid = wide ? margins.avoid || [] : [];
    // relax overlaps (a few passes), then clamp into the safe area
    for (let pass = 0; pass < (wide ? 10 : 6); pass++) {
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 6, oy = Math.min(a.y + a.h + a.p, b.y + b.h + b.p) - Math.max(a.y - a.p, b.y - b.p) + 2;
        if (ox > 0 && oy > 0) {
          if (oy < ox) { const s = oy / 2 * (a.y < b.y ? -1 : 1); a.y += s; b.y -= s; }
          else { const s = ox / 2 * (a.x < b.x ? -1 : 1); a.x += s; b.x -= s; }
        }
      }
      for (const it of items) {
        for (const r of avoid) avoidRect(it, r);
        it.x = Math.max(L, Math.min(W - R - it.w, it.x));
        it.y = Math.max(margins.top + it.p, Math.min(H - margins.bottom - it.h - it.p, it.y));
        // top corners are reserved for the app chrome (company number badge left, login badge right)
        if (CORNER.h && it.y < margins.top + CORNER.h + it.p && (it.x < CORNER.w || it.x + it.w > W - CORNER.w)) it.y = margins.top + CORNER.h + it.p;
      }
    }
    for (const it of items) {
      const show = it.vis && it.ay > margins.top - 30 && it.ay < H + 40;
      it.el.style.display = it.dot.style.display = show ? '' : 'none';
      it.line.style.display = it.glow.style.display = show ? '' : 'none';
      if (!show) continue;
      it.el.style.transform = `translate(${it.x.toFixed(1)}px,${it.y.toFixed(1)}px)`;
      it.dot.style.transform = `translate(${it.ax.toFixed(1)}px,${it.ay.toFixed(1)}px)`;
      // leader attaches to the label edge point nearest the anchor
      const lx = Math.max(it.x + 8, Math.min(it.x + it.w - 8, it.ax));
      const ly = it.ay > it.y + it.h ? it.y + it.h : it.ay < it.y ? it.y : it.y + it.h / 2;
      for (const l of [it.line, it.glow]) { l.setAttribute('x1', it.ax); l.setAttribute('y1', it.ay); l.setAttribute('x2', lx); l.setAttribute('y2', ly); }
    }
  }

  // {top, bottom, side} (portrait) or {top, bottom, left, right, avoid: [{x, y, w, h}], wide: true}; no corner keep-out in wide
  // unless `corner` is passed (the landscape top bar is one row above `top`)
  function setMargins(m = {}) {
    wide = !!m.wide;
    margins = wide ? { top: 52, bottom: 16, ...m } : { ...TALL_DEF, ...m };
    CORNER = wide && !m.corner ? { w: 0, h: 0 } : { w: 130, h: 52, ...(m.corner || {}) };
  }

  return {
    el: ov, render, update, items, setMargins,
    get wide() { return wide; },
    hot(id) { for (const it of items) it.el.classList.toggle('hot', it.f.id === id); },
    dispose() { ov.remove(); },
  };
}

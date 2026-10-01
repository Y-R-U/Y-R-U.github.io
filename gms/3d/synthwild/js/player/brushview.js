// Brush visuals: the 3D target outline (thick edge bars + faint faces, two draws), the crosshair with the
// hologram scale readout, and the volume confirm strip.
import { fmtScale } from './brushmath.js';

export const COLORS = {
  place: 0x3ff7ff, break: 0xff8a3d, volume: 0xff4fd8, clear: 0xff5a5a, blocked: 0x8a93a6,
  hcPlace: 0xffff40, hcBreak: 0xffffff,
};

const CSS = `
.swp-cross{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none;z-index:5}
.swp-cross:before,.swp-cross:after{content:'';position:absolute;background:#f4ffff;box-shadow:0 0 0 1px rgba(0,20,40,.55),0 0 6px rgba(80,240,255,.6)}
.swp-cross:before{left:10px;top:2px;width:2px;height:18px}.swp-cross:after{top:10px;left:2px;height:2px;width:18px}
.swp-scale{position:absolute;left:calc(50% + 16px);top:calc(50% + 12px);pointer-events:auto;z-index:5;cursor:pointer;
  font:600 13px/1 ui-monospace,Menlo,Consolas,monospace;color:#bffcff;letter-spacing:.04em;white-space:nowrap;
  padding:4px 7px 4px 6px;border-radius:6px;border:1px solid rgba(120,250,255,.45);
  background:linear-gradient(180deg,rgba(40,200,255,.16),rgba(10,30,60,.28));
  text-shadow:0 0 6px rgba(60,240,255,.9);box-shadow:0 0 10px rgba(60,240,255,.25);transition:transform .12s}
.swp-scale.pop{transform:scale(1.25)}
.swp-scale.brk{color:#ffd9bf;border-color:rgba(255,160,90,.55);text-shadow:0 0 6px rgba(255,130,50,.9)}
.swp-scale small{font-size:10px;opacity:.8;margin-left:5px}
.swp-vol{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;pointer-events:auto;display:flex;gap:6px;align-items:center;
  padding:6px 8px;border-radius:14px;background:rgba(10,24,44,.55);border:1px solid rgba(255,120,230,.5);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:0 0 18px rgba(255,80,220,.3);
  font:600 13px system-ui,sans-serif;color:#fff}
.swp-vol.hide{display:none}
.swp-vol .sz{padding:0 6px;white-space:nowrap;color:#ffc6f3;font-family:ui-monospace,Menlo,monospace}
.swp-vol button{all:unset;cursor:pointer;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);touch-action:manipulation}
.swp-vol button.sel{background:rgba(255,80,220,.4);border-color:#ffb3f0}
.swp-vol button.ok{background:rgba(60,240,160,.35);border-color:#9dffd2;min-width:22px;text-align:center}
.swp-vol button.cp{background:rgba(90,190,255,.3);border-color:#a8dcff}
.swp-vol button.no{background:rgba(255,90,90,.25);border-color:#ffb0b0;min-width:22px;text-align:center}
`;

// Two draws: all 12 edge bars live in one geometry (rewritten only when the box or bar thickness changes), plus the face.
export function createOutline(THREE) {
  const group = new THREE.Group();
  group.name = 'brush-outline';
  const edgeMat = new THREE.MeshBasicMaterial({ color: COLORS.place, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false });
  const faceMat = new THREE.MeshBasicMaterial({ color: COLORS.place, toneMapped: false, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const tp = unit.attributes.position.array, ti = unit.index.array, nv = tp.length / 3;
  const pos = new Float32Array(tp.length * 12), idx = new Uint16Array(ti.length * 12);
  for (let b = 0; b < 12; b++) for (let i = 0; i < ti.length; i++) idx[b * ti.length + i] = ti[i] + b * nv;
  const barsGeo = new THREE.BufferGeometry();
  barsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  barsGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  const bars = new THREE.Mesh(barsGeo, edgeMat); bars.renderOrder = 5; group.add(bars);
  const face = new THREE.Mesh(unit, faceMat); face.renderOrder = 4; group.add(face);
  group.visible = false;
  group.traverse(o => (o.frustumCulled = false));

  let key = '';
  return {
    group,
    hide() { group.visible = false; },
    show(box, color, camDist, progress = 0, pulse = 0) {
      group.visible = true;
      edgeMat.color.setHex(color); faceMat.color.setHex(color);
      faceMat.opacity = progress > 0 ? 0.12 + progress * 0.5 : 0.08 + pulse * 0.12;
      const mn = box.min.map(v => v / 4), mx = box.max.map(v => v / 4);
      const t = Math.min(0.09, Math.max(0.014, camDist * 0.0045));
      const k = `${mn}|${mx}|${t.toFixed(3)}`;
      if (k !== key) {
        key = k;
        const e = 0.004, c = [0, 1, 2].map(i => (mn[i] + mx[i]) / 2), s = [0, 1, 2].map(i => mx[i] - mn[i] + e * 2);
        face.position.set(c[0], c[1], c[2]); face.scale.set(s[0], s[1], s[2]);
        let n = 0;
        for (let a = 0; a < 3; a++) {
          const b = (a + 1) % 3, d = (a + 2) % 3;
          for (const sb of [-1, 1]) for (const sd of [-1, 1]) {
            const p = [0, 0, 0], sc = [t, t, t];
            p[a] = c[a]; sc[a] = s[a] + t;
            p[b] = c[b] + sb * s[b] / 2; p[d] = c[d] + sd * s[d] / 2;
            const o = n++ * tp.length;
            for (let v = 0; v < tp.length; v += 3) {
              pos[o + v] = tp[v] * sc[0] + p[0]; pos[o + v + 1] = tp[v + 1] * sc[1] + p[1]; pos[o + v + 2] = tp[v + 2] * sc[2] + p[2];
            }
          }
        }
        barsGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}

export function createBrushHud(root, handlers) {
  if (!document.getElementById('swp-brush-style')) {
    const st = document.createElement('style'); st.id = 'swp-brush-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  // Lane 5's HUD draws the crosshair; this one only shows when the HUD is absent.
  const cross = document.createElement('div'); cross.className = 'swp-cross';
  const tag = document.createElement('div'); tag.className = 'swp-scale';
  const vol = document.createElement('div'); vol.className = 'swp-vol hide';
  root.append(cross, tag, vol);
  tag.addEventListener('click', e => { e.stopPropagation(); handlers.cycleScale(); });
  tag.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); handlers.cycleScale(); }, { passive: false });

  const VMODES = [['fill', 'Fill'], ['hollow', 'Hollow'], ['shell', 'Shell'], ['replace', 'Replace'], ['clear', 'Clear']];
  const press = e => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    handlers.strip(b.dataset.id);
  };
  vol.addEventListener('touchstart', press, { passive: false });
  vol.addEventListener('mousedown', press);
  let stripKey = '';
  const showStrip = (text, buttons) => {
    vol.classList.toggle('hide', !buttons);
    if (!buttons) { stripKey = ''; return; }
    const html = `<span class="sz"></span>` + buttons.map(b =>
      `<button data-id="${b.id}" class="${b.cls || ''}${b.sel ? ' sel' : ''}">${b.label}</button>`).join('');
    if (html !== stripKey) { vol.innerHTML = html; stripKey = html; }
    vol.querySelector('.sz').textContent = text;
  };

  let last = '', popT = 0;
  return {
    cross, tag, vol,
    setReadout(scale, mode, dims, breaking, build) {
      const d = dims.some(v => v !== 1) ? ` ${dims.join('×')}` : '';
      const m = build && (mode !== 'fill' || d) ? `<small>${mode}${d}</small>` : '';
      const html = `${fmtScale(scale)} ▣${m}`;
      tag.classList.toggle('brk', breaking);
      if (html !== last) {
        if (last) { tag.classList.add('pop'); clearTimeout(popT); popT = setTimeout(() => tag.classList.remove('pop'), 140); }
        last = html; tag.innerHTML = html;
      }
    },
    showStrip,
    showVolume(on, size, blocks, mode) {
      if (!on) return showStrip(null);
      showStrip(`${size.join('×')} · ${blocks < 10 ? +blocks.toFixed(2) : Math.round(blocks)}▣`, [
        ...VMODES.map(([k, n]) => ({ id: 'm:' + k, label: n, sel: k === mode })),
        { id: 'copy', label: '⧉ Copy', cls: 'cp' },
        { id: 'ok', label: '✓', cls: 'ok' }, { id: 'no', label: '✕', cls: 'no' },
      ]);
    },
    setVisible(on, hud) {
      tag.style.display = on ? '' : 'none';
      cross.style.display = on && !hud ? '' : 'none';
    },
  };
}

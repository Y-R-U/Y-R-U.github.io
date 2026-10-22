// HUD markers (D12): tags over visible planes, edge arrows for the rest, a gold diamond for the target.
// One 2D canvas, redrawn every update(); nothing is allocated per frame once labels/distances stop changing.

const KIND = {
  traffic: { size: 6, alpha: 0.6, z: 0 },
  rival: { size: 9, alpha: 1, z: 1 },
  player: { size: 9, alpha: 1, z: 1 },
  target: { size: 9, alpha: 1, z: 2 },
};
const GOLD = '#ffd25e', TRAFFIC = '#e6edf5', FONT = '700 11px system-ui, sans-serif', SMALL = '600 10px system-ui, sans-serif';
const TRAFFIC_TEXT_M = 2000;
const AVOID = ['.krz-r-btn', '.krz-r-tower', '.krz-land', '.krz-top-l', '.krz-top-r'];
const PERIM_STEP = 4;

function cssPx(cs, name, fb) { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : fb; }

export function createMarkers({ container, camera, units = 'aviation', traffic = true, getOrigin = null, avoid = AVOID, maxLabel = 14 } = {}) {
  const cv = document.createElement('canvas');
  cv.className = 'krz-mk';
  container.appendChild(cv);
  const ctx = cv.getContext('2d');
  const opt = { units, traffic, getOrigin, avoid, maxLabel, visible: true };
  const slots = [];
  let n = 0, W = 0, H = 0, dpr = 1, nextMeasure = 0;
  const safe = { l: 10, t: 10, r: 10, b: 10, perim: 0 };
  let mask = new Uint8Array(1024);
  const rects = [];
  const O = [0, 0, 0];

  function slot(i) {
    let s = slots[i];
    if (!s) s = slots[i] = { item: null, id: '', kind: 'traffic', label: '', rawLabel: '', color: TRAFFIC, sx: 0, sy: 0, off: false, drawn: false, dBucket: -1, dStr: '', bBucket: -1, bStr: '', tag: '', tagW: 0, tagOff: '', tagOffW: 0, dirty: true };
    return s;
  }

  function set(list) {
    n = 0;
    for (const it of list || []) {
      if (!it || !it.worldPos) continue;
      const s = slot(n++);
      s.item = it; s.id = it.id; s.kind = KIND[it.kind] ? it.kind : 'traffic';
      if (s.rawLabel !== (it.label || '')) {
        s.rawLabel = it.label || '';
        s.label = s.rawLabel.length > opt.maxLabel ? s.rawLabel.slice(0, opt.maxLabel - 1) + '…' : s.rawLabel;
        s.dirty = true;
      }
      s.color = s.kind === 'target' ? (it.color || GOLD) : (it.color || TRAFFIC);
    }
    // draw order: traffic, then rivals/players, target on top
    for (let i = 1; i < n; i++) {
      const t = slots[i];
      let j = i - 1;
      while (j >= 0 && KIND[slots[j].kind].z > KIND[t.kind].z) { slots[j + 1] = slots[j]; j--; }
      slots[j + 1] = t;
    }
  }

  // PERF #3: read the viewport only after a resize event, never per frame
  let vpDirty = true, blank = false;
  addEventListener('resize', () => { vpDirty = true; });
  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1); // PERF #8: a second full-screen layer; 1.5 is plenty for tags
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    nextMeasure = 0;
  }

  // Safe rectangle for edge arrows + perimeter mask of spots covered by controls/buttons (re-measured twice a second).
  function measure(now) {
    nextMeasure = now + 500;
    const cs = getComputedStyle(document.documentElement);
    const sl = cssPx(cs, '--sl', 0), sr = cssPx(cs, '--sr', 0);
    safe.l = sl + 14; safe.r = W - sr - 14;
    safe.t = cssPx(cs, '--krz-hud-top', 8) + 16;
    safe.b = H - 14;
    const ctlB = cssPx(cs, '--krz-ctl-bottom', 200), ctlL = cssPx(cs, '--krz-ctl-left', 190), ctlR = cssPx(cs, '--krz-ctl-right', 190), ctlRH = cssPx(cs, '--krz-ctl-right-h', 200);
    rects.length = 0;
    if (H >= W || ctlL + ctlR > W * 0.7) safe.b = H - ctlB - 14;
    else { rects.push([0, H - ctlB, ctlL, H], [W - ctlR, H - ctlRH, W, H]); }
    for (const sel of opt.avoid) {
      const els = document.querySelectorAll(sel);
      for (const e of els) {
        if (e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) rects.push([r.left, r.top, r.right, r.bottom]);
      }
    }
    if (safe.b < safe.t + 40) safe.b = safe.t + 40;
    const w = safe.r - safe.l, h = safe.b - safe.t;
    safe.perim = 2 * (w + h);
    const len = Math.ceil(safe.perim / PERIM_STEP) + 1;
    if (mask.length < len) mask = new Uint8Array(len * 2);
    const pad = 22;
    for (let i = 0; i < len; i++) {
      perimPoint(i * PERIM_STEP, P);
      let hit = 0;
      for (const r of rects) if (P[0] > r[0] - pad && P[0] < r[2] + pad && P[1] > r[1] - pad && P[1] < r[3] + pad) { hit = 1; break; }
      mask[i] = hit;
    }
    safe.n = len;
  }
  const P = [0, 0];
  function perimPoint(p, out) {
    const w = safe.r - safe.l, h = safe.b - safe.t;
    p = ((p % safe.perim) + safe.perim) % safe.perim;
    if (p < w) { out[0] = safe.l + p; out[1] = safe.t; return; }
    p -= w; if (p < h) { out[0] = safe.r; out[1] = safe.t + p; return; }
    p -= h; if (p < w) { out[0] = safe.r - p; out[1] = safe.b; return; }
    p -= w; out[0] = safe.l; out[1] = safe.b - p;
  }
  // ray from the screen centre (dx, dy) → free spot on the safe perimeter, written into P
  function edgePoint(dx, dy) {
    const cx = (safe.l + safe.r) / 2, cy = (safe.t + safe.b) / 2, w = safe.r - safe.l, h = safe.b - safe.t;
    const k = Math.min(dx ? (w / 2) / Math.abs(dx) : 1e9, dy ? (h / 2) / Math.abs(dy) : 1e9);
    const x = cx + dx * k, y = cy + dy * k;
    let p;
    if (Math.abs(y - safe.t) < 0.5) p = x - safe.l;
    else if (Math.abs(x - safe.r) < 0.5) p = w + (y - safe.t);
    else if (Math.abs(y - safe.b) < 0.5) p = w + h + (safe.r - x);
    else p = 2 * w + h + (safe.b - y);
    const i0 = Math.round(p / PERIM_STEP), len = safe.n;
    let i = i0;
    if (mask[((i0 % len) + len) % len]) {
      for (let d = 1; d < len / 2; d++) {
        if (!mask[(((i0 + d) % len) + len) % len]) { i = i0 + d; break; }
        if (!mask[(((i0 - d) % len) + len) % len]) { i = i0 - d; break; }
      }
      perimPoint(i * PERIM_STEP, P);
    } else { P[0] = x; P[1] = y; }
  }

  function fmtDist(s, d) {
    let b, str;
    if (opt.units === 'metric') {
      if (d < 1000) { b = Math.round(d / 10); if (b !== s.dBucket) str = b * 10 + ' m'; }
      else { b = 1000 + Math.round(d / 100); if (b !== s.dBucket) str = (d / 1000).toFixed(1) + ' km'; }
    } else {
      const nm = d / 1852;
      if (nm < 0.3) { b = Math.round(d / 0.3048 / 100); if (b !== s.dBucket) str = b * 100 + ' ft'; }
      else { b = 1000 + Math.round(nm * 10); if (b !== s.dBucket) str = nm.toFixed(1) + ' nm'; }
    }
    if (str !== undefined) { s.dBucket = b; s.dStr = str; s.dirty = true; }
    return s.dStr;
  }

  // tag strings and their widths only change when the label, distance bucket or bearing bucket changes
  function refresh(s) {
    s.dirty = false;
    ctx.font = FONT;
    if (s.kind === 'target') {
      s.tag = s.label + ' · ' + s.dStr;
      s.tagOff = s.tag + ' · ' + s.bStr;
    } else if (s.kind === 'traffic') {
      s.tag = s.dStr; s.tagOff = '';
      ctx.font = SMALL;
    } else {
      s.tag = s.label ? s.label + ' · ' + s.dStr : s.dStr;
      s.tagOff = s.tag;
    }
    s.tagW = s.tag ? ctx.measureText(s.tag).width : 0;
    ctx.font = FONT;
    s.tagOffW = s.tagOff ? ctx.measureText(s.tagOff).width : 0;
  }

  // pill with text; x is the pill centre unless align is -1 (x = right edge) / 1 (x = left edge).
  // Steps clear of the control rects and of pills already placed this frame.
  const placed = new Float32Array(4 * 64);
  let nPlaced = 0;
  function pill(str, w, x, y, align, color, border, edge) {
    const pw = w + 12, ph = 17;
    let x0 = align < 0 ? x - pw : align > 0 ? x : x - pw / 2;
    let y0 = y - ph / 2;
    if (edge) y0 = Math.max(safe.t - 14, Math.min(safe.b + 8 - ph, y0));
    for (const r of rects) {
      if (x0 < r[2] + 4 && x0 + pw > r[0] - 4 && y0 < r[3] + 4 && y0 + ph > r[1] - 4) x0 = (r[0] + r[2]) / 2 > W / 2 ? r[0] - pw - 6 : r[2] + 6;
    }
    x0 = Math.max(4, Math.min(W - pw - 4, x0));
    for (let tries = 0; tries < 4; tries++) {
      let hit = false;
      for (let i = 0; i < nPlaced; i++) {
        const j = i * 4;
        if (x0 < placed[j + 2] && x0 + pw > placed[j] && y0 < placed[j + 3] && y0 + ph > placed[j + 1]) { hit = true; y0 = edge && y < H / 2 ? placed[j + 3] + 2 : placed[j + 1] - ph - 2; break; }
      }
      if (!hit) break;
    }
    y0 = Math.max(4, Math.min(H - ph - 4, y0));
    if (nPlaced < 64) { const j = nPlaced++ * 4; placed[j] = x0; placed[j + 1] = y0; placed[j + 2] = x0 + pw; placed[j + 3] = y0 + ph; }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, pw, ph, 8.5); else ctx.rect(x0, y0, pw, ph);
    ctx.fillStyle = 'rgba(10,15,26,.66)'; ctx.fill();
    if (border) { ctx.lineWidth = 1.5; ctx.strokeStyle = border; ctx.stroke(); }
    ctx.fillStyle = color; ctx.fillText(str, x0 + pw / 2, y0 + 12.5);
  }

  // traffic distance text: steps up clear of labels already placed this frame (two "1500 ft" no longer overprint)
  function smallText(str, x, y) {
    const w = ctx.measureText(str).width + 4, h = 12;
    let y0 = y - 10;
    for (let tries = 0; tries < 4; tries++) {
      let hit = false;
      for (let i = 0; i < nPlaced; i++) {
        const j = i * 4;
        if (x - w / 2 < placed[j + 2] && x + w / 2 > placed[j] && y0 < placed[j + 3] && y0 + h > placed[j + 1]) { hit = true; y0 = placed[j + 1] - h - 1; break; }
      }
      if (!hit) break;
    }
    if (nPlaced < 64) { const j = nPlaced++ * 4; placed[j] = x - w / 2; placed[j + 1] = y0; placed[j + 2] = x + w / 2; placed[j + 3] = y0 + h; }
    ctx.fillText(str, x, y0 + 10);
  }

  function glyph(s, x, y, ang, off) {
    const z = KIND[s.kind].size;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    if (s.kind === 'target') {
      ctx.moveTo(0, -z); ctx.lineTo(z * 0.8, 0); ctx.lineTo(0, z); ctx.lineTo(-z * 0.8, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(30,22,4,.55)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = s.color; ctx.stroke();
    } else if (off) {
      ctx.moveTo(z * 1.3, 0); ctx.lineTo(-z * 0.8, -z); ctx.lineTo(-z * 0.3, 0); ctx.lineTo(-z * 0.8, z); ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,12,20,.75)'; ctx.stroke();
    } else {
      ctx.moveTo(-z, -z * 0.9); ctx.lineTo(z, -z * 0.9); ctx.lineTo(0, z * 0.5); ctx.closePath();
      if (s.kind === 'traffic') { ctx.lineWidth = 1.6; ctx.strokeStyle = s.color; ctx.stroke(); }
      else { ctx.fillStyle = s.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,12,20,.8)'; ctx.stroke(); }
      if (s.kind === 'player') { ctx.beginPath(); ctx.arc(0, -z * 0.2, z * 1.55, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.strokeStyle = s.color; ctx.stroke(); }
    }
    ctx.restore();
  }
  function targetArrow(s, x, y, ang) {
    const z = KIND.target.size;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(z * 1.2, -z * 0.6); ctx.lineTo(z * 2.1, 0); ctx.lineTo(z * 1.2, z * 0.6); ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();
    ctx.restore();
  }

  function bearing(s, deg) {
    const b = Math.round(((deg % 360) + 360) % 360 / 5) * 5 % 360;
    if (b !== s.bBucket) { s.bBucket = b; s.bStr = (b < 100 ? (b < 10 ? '00' : '0') : '') + b + '°'; s.dirty = true; }
  }

  function update() {
    if (!opt.visible) return;
    if (vpDirty) { vpDirty = false; if (W !== innerWidth || H !== innerHeight) resize(); }
    const now = performance.now();
    if (now >= nextMeasure) measure(now);
    if (!n) { if (!blank) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); blank = true; } return; }
    blank = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    camera.updateMatrixWorld();
    const m = camera.matrixWorldInverse.copy(camera.matrixWorld).invert().elements;
    const pm = camera.projectionMatrix.elements, p0 = pm[0], p5 = pm[5];
    const near = camera.near || 0.1;
    if (opt.getOrigin) { const o = opt.getOrigin(); O[0] = o.x ?? o[0]; O[1] = o.y ?? o[1]; O[2] = o.z ?? o[2]; }
    else { O[0] = camera.position.x; O[1] = camera.position.y; O[2] = camera.position.z; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    nPlaced = 0;
    const cys = (safe.t + safe.b) / 2;
    for (let i = 0; i < n; i++) {
      const s = slots[i], it = s.item, wp = it.worldPos, k = KIND[s.kind];
      s.drawn = false;
      if (s.kind === 'traffic' && !opt.traffic) continue;
      s.drawn = true;
      const x = wp.x ?? wp[0], y = wp.y ?? wp[1], z = wp.z ?? wp[2];
      const vx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const vy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const vz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const dist = it.distance ?? Math.hypot(x - O[0], y - O[1], z - O[2]);
      fmtDist(s, dist);
      if (s.kind === 'target') bearing(s, Math.atan2(x - O[0], -(z - O[2])) * 57.29578);
      if (s.dirty) refresh(s);
      ctx.globalAlpha = k.alpha;
      let sx = 0, sy = 0, on = false;
      if (vz < -near) {
        sx = (vx * p0 / -vz * 0.5 + 0.5) * W;
        sy = (0.5 - vy * p5 / -vz * 0.5) * H;
        on = sx > 4 && sx < W - 4 && sy > safe.t - 10 && sy < H - 4;
      }
      if (on) {
        const rad = s.kind === 'target' ? 0 : Math.max(10, 6 * p5 * 0.5 * H / -vz);
        const gy = s.kind === 'target' ? sy : sy - Math.min(rad, 90) - 6;
        glyph(s, sx, gy, 0, false);
        s.sx = sx; s.sy = gy; s.off = false;
        if (s.kind === 'traffic') {
          if (dist < TRAFFIC_TEXT_M) { ctx.font = SMALL; ctx.fillStyle = s.color; smallText(s.tag, sx, gy - k.size - 3); }
        } else {
          ctx.font = FONT;
          pill(s.tag, s.tagW, sx, s.kind === 'target' ? gy - k.size - 12 : gy - k.size - 11, 0, s.kind === 'target' ? s.color : '#fff', s.kind === 'target' ? null : s.color);
        }
      } else {
        let dx = vx * p0, dy = -vy * p5;
        if (vz >= -near) { if (Math.abs(dx) + Math.abs(dy) < 1e-4) dy = 1; }
        else { dx /= -vz; dy /= -vz; }
        const L = Math.hypot(dx, dy) || 1;
        edgePoint(dx / L * W, dy / L * H);
        const ex = P[0], ey = P[1];
        s.sx = ex; s.sy = ey; s.off = true;
        const ang = Math.atan2(dy, dx);
        glyph(s, ex, ey, s.kind === 'target' ? 0 : ang, true);
        if (s.kind === 'target') targetArrow(s, ex, ey, ang);
        if (s.kind === 'traffic' || !s.tagOff) continue;
        // pill inward from the arrow: beside it on the side edges, under/over it on the top/bottom edges
        const side = Math.abs(ex - safe.l) < 1 ? 1 : Math.abs(ex - safe.r) < 1 ? -1 : 0;
        ctx.font = FONT;
        const col = s.kind === 'target' ? s.color : '#fff';
        if (side) pill(s.tagOff, s.tagOffW, ex + side * 20, ey, side, col, s.kind === 'target' ? null : s.color, true);
        else pill(s.tagOff, s.tagOffW, ex, ey + (ey < cys ? 24 : -24), 0, col, s.kind === 'target' ? null : s.color, true);
      }
    }
    ctx.globalAlpha = 1;
  }

  function setVisible(v) {
    opt.visible = !!v; cv.hidden = !v;
    if (!v) ctx.clearRect(0, 0, cv.width, cv.height);
  }
  function setOptions(o = {}) {
    if (o.units && o.units !== opt.units) { opt.units = o.units; for (const s of slots) s.dBucket = -1; }
    if ('traffic' in o) opt.traffic = !!o.traffic;
    if ('getOrigin' in o) opt.getOrigin = o.getOrigin;
    if (o.avoid) opt.avoid = o.avoid;
    if (o.camera) camera = o.camera;
    nextMeasure = 0;
  }
  resize();
  return {
    el: cv, set, update, setVisible, setOptions,
    remeasure: () => { nextMeasure = 0; },
    debug: () => ({ safe: { ...safe }, rects: rects.map((r) => r.slice()), n,
      drawn: slots.slice(0, n).filter((s) => s.drawn).map((s) => ({ id: s.id, kind: s.kind, x: s.sx, y: s.sy, off: s.off })),
      pills: Array.from({ length: nPlaced }, (_, i) => Array.from(placed.slice(i * 4, i * 4 + 4))) }),
    dispose() { cv.remove(); },
  };
}

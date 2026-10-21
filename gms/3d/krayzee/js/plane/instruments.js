import * as THREE from 'three';

export const GAUGES = ['asi', 'ai', 'alt', 'tc', 'dg', 'vsi', 'tach', 'fuel'];
const COLS = 4, ROWS = 2;
const FONT = "'Helvetica Neue', 'Arial Narrow', Roboto, Arial, sans-serif";
const D2R = Math.PI / 180;

function mkCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }

// Gauge drawing works in a unit space: centre (0,0), radius 1.
function unit(ctx, C) { ctx.setTransform(C / 2, 0, 0, C / 2, C / 2, C / 2); }

function face(ctx) {
  const g = ctx.createRadialGradient(0, -0.2, 0.1, 0, 0, 1);
  g.addColorStop(0, '#1b1d20'); g.addColorStop(1, '#0a0b0c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill();
}
function ticks(ctx, a0, a1, n, r0, r1, w, col = '#f2f2ee') {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt';
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n - 90) * D2R;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
  }
}
function arc(ctx, a0, a1, r, w, col) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, r, (a0 - 90) * D2R, (a1 - 90) * D2R); ctx.stroke();
}
function label(ctx, txt, x, y, size, col = '#f2f2ee', weight = '600') {
  ctx.save(); ctx.fillStyle = col; ctx.font = `${weight} ${size * 100}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.scale(0.01, 0.01); ctx.fillText(txt, x * 100, y * 100); ctx.restore();
}
function needle(ctx, a, len, w, col = '#f4f4f0', tail = 0.18) {
  ctx.save(); ctx.rotate(a * D2R);
  ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(-w, tail); ctx.lineTo(-w * 0.75, -len * 0.82); ctx.lineTo(0, -len); ctx.lineTo(w * 0.75, -len * 0.82); ctx.lineTo(w, tail); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function hub(ctx, r = 0.09) { ctx.fillStyle = '#2c2e31'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, 7); ctx.fill(); }
function glare(ctx) {
  const g = ctx.createLinearGradient(-0.7, -1, 0.4, 0.2);
  g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(0.5, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.98, 0, 7); ctx.fill();
  const v = ctx.createRadialGradient(0, 0, 0.75, 0, 0, 1);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill();
}

const asiAng = (kt) => { const k = Math.max(0, Math.min(200, kt)); return k < 40 ? k * 0.75 : 30 + (k - 40) * 1.95; };

const STATIC = {
  asi(ctx) {
    face(ctx);
    arc(ctx, asiAng(33), asiAng(85), 0.86, 0.07, '#f2f2ee');
    arc(ctx, asiAng(48), asiAng(129), 0.78, 0.09, '#1fa64a');
    arc(ctx, asiAng(129), asiAng(163), 0.78, 0.09, '#e7c51f');
    ctx.save(); ctx.rotate(asiAng(163) * D2R); ctx.fillStyle = '#d6262a'; ctx.fillRect(-0.025, -0.92, 0.05, 0.2); ctx.restore();
    for (let k = 40; k <= 200; k += 10) {
      const a = (asiAng(k) - 90) * D2R, big = k % 20 === 0;
      ctx.strokeStyle = '#f2f2ee'; ctx.lineWidth = big ? 0.035 : 0.022;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.92, Math.sin(a) * 0.92); ctx.lineTo(Math.cos(a) * (big ? 0.74 : 0.8), Math.sin(a) * (big ? 0.74 : 0.8)); ctx.stroke();
      if (big && k <= 180) label(ctx, String(k), Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0.17);
    }
    label(ctx, 'AIRSPEED', 0, 0.3, 0.1, '#cfcfca'); label(ctx, 'KNOTS', 0, 0.44, 0.1, '#cfcfca');
  },
  alt(ctx) {
    face(ctx);
    ticks(ctx, 0, 360, 50, 0.92, 0.84, 0.02);
    ticks(ctx, 0, 360, 10, 0.92, 0.74, 0.04);
    for (let i = 0; i < 10; i++) { const a = (i * 36 - 90) * D2R; label(ctx, String(i), Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.22); }
    label(ctx, 'ALT', 0, -0.32, 0.11, '#cfcfca');
    ctx.fillStyle = '#000'; ctx.fillRect(0.3, -0.08, 0.36, 0.16);
    label(ctx, '29.92', 0.48, 0.0, 0.1, '#e8e8e2', '500');
  },
  vsi(ctx) {
    face(ctx);
    const ang = (f) => -90 + (f / 2000) * 170;
    for (let f = -2000; f <= 2000; f += 100) {
      const big = f % 500 === 0;
      ctx.save(); ctx.rotate(ang(f) * D2R);
      ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-(big ? 0.018 : 0.011), -0.93, big ? 0.036 : 0.022, big ? 0.17 : 0.09);
      ctx.restore();
      if (big && f !== 0 && Math.abs(f) !== 2000) { const r = (ang(f) - 90) * D2R; label(ctx, String(Math.abs(f / 100)), Math.cos(r) * 0.6, Math.sin(r) * 0.6, 0.18); }
    }
    label(ctx, '0', -0.6, 0, 0.18); label(ctx, '20', 0.6, 0, 0.16);
    label(ctx, 'UP', -0.3, -0.3, 0.1, '#cfcfca'); label(ctx, 'DN', -0.3, 0.3, 0.1, '#cfcfca');
    label(ctx, 'VERTICAL SPEED', 0.12, -0.12, 0.07, '#cfcfca'); label(ctx, '100 FT/MIN', 0.12, 0.12, 0.07, '#cfcfca');
  },
  tach(ctx) {
    face(ctx);
    const ang = (r) => -125 + (r / 3500) * 250;
    arc(ctx, ang(2100), ang(2700), 0.83, 0.1, '#1fa64a');
    ctx.save(); ctx.rotate(ang(2700) * D2R); ctx.fillStyle = '#d6262a'; ctx.fillRect(-0.025, -0.92, 0.05, 0.2); ctx.restore();
    for (let r = 0; r <= 3500; r += 100) {
      const big = r % 500 === 0;
      ctx.save(); ctx.rotate(ang(r) * D2R); ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-(big ? 0.018 : 0.01), -0.93, big ? 0.036 : 0.02, big ? 0.17 : 0.09); ctx.restore();
      if (big) { const a = (ang(r) - 90) * D2R; label(ctx, String(r / 100), Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.17); }
    }
    label(ctx, 'RPM', 0, 0.35, 0.11, '#cfcfca'); label(ctx, 'X100', 0, 0.5, 0.08, '#cfcfca');
    ctx.fillStyle = '#000'; ctx.fillRect(-0.24, 0.6, 0.48, 0.14);
    label(ctx, '1 8 4 7 3', 0, 0.675, 0.09, '#ddd', '500');
  },
  fuel(ctx) {
    face(ctx);
    for (const sg of [-1, 1]) {
      ctx.save(); ctx.translate(sg * 0.02, 0);
      const a0 = sg < 0 ? 210 : 30, a1 = sg < 0 ? 330 : 150;
      ticks(ctx, a0, a1, 4, 0.9, 0.76, 0.03);
      arc(ctx, sg < 0 ? 210 : 140, sg < 0 ? 220 : 150, 0.82, 0.1, '#d6262a');
      ctx.restore();
    }
    label(ctx, 'FUEL', 0, -0.38, 0.12, '#cfcfca'); label(ctx, 'L', -0.45, 0.0, 0.16); label(ctx, 'R', 0.45, 0.0, 0.16);
    label(ctx, 'E', -0.62, 0.55, 0.12); label(ctx, 'F', -0.62, -0.55, 0.12); label(ctx, 'E', 0.62, 0.55, 0.12); label(ctx, 'F', 0.62, -0.55, 0.12);
    label(ctx, 'GAL', 0, 0.42, 0.09, '#cfcfca');
  },
  tc(ctx) {
    face(ctx);
    ctx.fillStyle = '#f2f2ee';
    for (const a of [-90, -108, 90, 108]) { ctx.save(); ctx.rotate(a * D2R); ctx.fillRect(-0.02, -0.92, 0.04, 0.16); ctx.restore(); }
    label(ctx, 'L', -0.78, 0.4, 0.13); label(ctx, 'R', 0.78, 0.4, 0.13);
    label(ctx, 'TURN COORDINATOR', 0, -0.5, 0.08, '#cfcfca');
    label(ctx, '2 MIN', 0, 0.82, 0.08, '#cfcfca');
    label(ctx, 'NO PITCH', 0, -0.36, 0.06, '#9a9a96'); label(ctx, 'INFORMATION', 0, -0.27, 0.06, '#9a9a96');
  },
};

const DYN = {
  asi(ctx, v) { needle(ctx, asiAng(v.airspeed), 0.86, 0.045); hub(ctx); },
  alt(ctx, v) {
    const a = ((v.altitude % 1000) / 1000) * 360;
    const b = ((v.altitude % 10000) / 10000) * 360;
    const c = ((v.altitude % 100000) / 100000) * 360;
    ctx.save(); ctx.rotate(c * D2R); ctx.fillStyle = '#f4f4f0'; ctx.beginPath(); ctx.moveTo(-0.03, 0); ctx.lineTo(0, -0.92); ctx.lineTo(0.03, 0); ctx.fill(); ctx.restore();
    needle(ctx, b, 0.5, 0.07, '#f4f4f0', 0.1);
    needle(ctx, a, 0.86, 0.04, '#f4f4f0', 0.2);
    hub(ctx);
  },
  vsi(ctx, v) { needle(ctx, -90 + (Math.max(-2050, Math.min(2050, v.vsi)) / 2000) * 170, 0.86, 0.045); hub(ctx); },
  tach(ctx, v) { needle(ctx, -125 + (Math.max(0, Math.min(3500, v.rpm)) / 3500) * 250, 0.86, 0.045); hub(ctx); },
  fuel(ctx, v) {
    for (const [sg, q] of [[-1, v.fuelL], [1, v.fuelR]]) {
      ctx.save(); ctx.translate(sg * 0.02, 0);
      const a = sg < 0 ? 330 - q * 120 : 30 + q * 120;
      ctx.rotate(a * D2R);
      ctx.fillStyle = '#f4f4f0'; ctx.beginPath(); ctx.moveTo(-0.03, -0.05); ctx.lineTo(0, -0.88); ctx.lineTo(0.03, -0.05); ctx.fill();
      ctx.restore();
    }
    hub(ctx, 0.07);
  },
  ai(ctx, v) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.clip();
    ctx.rotate(-v.roll);
    const p = Math.max(-0.5, Math.min(0.5, v.pitch)) * 1.9;
    ctx.translate(0, p);
    ctx.fillStyle = '#2c7fd0'; ctx.fillRect(-2, -3, 4, 3);
    ctx.fillStyle = '#7a4a22'; ctx.fillRect(-2, 0, 4, 3);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.stroke();
    for (const d of [5, 10, 15, 20]) {
      const y = (d / 57.3) * 1.9, w = d % 10 === 0 ? 0.26 : 0.13;
      ctx.lineWidth = 0.018;
      ctx.beginPath(); ctx.moveTo(-w, -y); ctx.lineTo(w, -y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
      if (d % 10 === 0) { label(ctx, String(d), -w - 0.12, -y, 0.09); label(ctx, String(d), w + 0.12, -y, 0.09); }
    }
    ctx.restore();
    // bank ring (moves with roll)
    ctx.save(); ctx.rotate(-v.roll);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.13;
    ctx.beginPath(); ctx.arc(0, 0, 0.92, Math.PI, 2 * Math.PI); ctx.strokeStyle = '#2c7fd0'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.92, 0, Math.PI); ctx.strokeStyle = '#6a4020'; ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) { ctx.save(); ctx.rotate(a * D2R); ctx.fillRect(-0.012, -0.99, 0.024, Math.abs(a) % 30 === 0 ? 0.16 : 0.09); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(0, -0.84); ctx.lineTo(-0.07, -0.98); ctx.lineTo(0.07, -0.98); ctx.fill();
    ctx.restore();
    // fixed aircraft symbol and roll pointer
    ctx.fillStyle = '#f39a1b';
    ctx.fillRect(-0.62, -0.025, 0.36, 0.05); ctx.fillRect(0.26, -0.025, 0.36, 0.05);
    ctx.beginPath(); ctx.moveTo(-0.26, -0.025); ctx.lineTo(0, 0.12); ctx.lineTo(0.26, -0.025); ctx.lineTo(0.2, -0.025); ctx.lineTo(0, 0.07); ctx.lineTo(-0.2, -0.025); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 0.04, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.lineTo(-0.06, -0.68); ctx.lineTo(0.06, -0.68); ctx.fill();
  },
  dg(ctx, v, card) {
    ctx.save(); ctx.rotate(-v.heading * D2R); ctx.drawImage(card, -1, -1, 2, 2); ctx.restore();
    ctx.fillStyle = '#f39a1b';
    ctx.beginPath(); ctx.moveTo(0, -0.74); ctx.lineTo(-0.05, -0.92); ctx.lineTo(0.05, -0.92); ctx.fill();
    ctx.strokeStyle = '#f39a1b'; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -0.42); ctx.lineTo(0, 0.38); ctx.moveTo(-0.32, -0.04); ctx.lineTo(0.32, -0.04); ctx.moveTo(-0.13, 0.32); ctx.lineTo(0.13, 0.32); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let a = 45; a < 360; a += 45) { ctx.save(); ctx.rotate(a * D2R); ctx.fillRect(-0.015, -1.0, 0.03, 0.1); ctx.restore(); }
  },
  tc(ctx, v) {
    // ball in the inclinometer
    ctx.save();
    ctx.fillStyle = '#d9d2b0'; ctx.strokeStyle = '#222'; ctx.lineWidth = 0.02;
    ctx.beginPath(); ctx.ellipse(0, 0.48, 0.42, 0.11, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillRect(-0.1, 0.36, 0.014, 0.24); ctx.fillRect(0.086, 0.36, 0.014, 0.24);
    const bx = Math.max(-1, Math.min(1, v.slip)) * 0.32;
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(bx, 0.5 + Math.abs(bx) * -0.08, 0.075, 0, 7); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.rotate(Math.max(-30, Math.min(30, (v.turn / 3) * 18)) * D2R);
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(-0.72, -0.03, 1.44, 0.06);
    ctx.beginPath(); ctx.arc(0, 0, 0.11, 0, 7); ctx.fill();
    ctx.fillRect(-0.02, -0.26, 0.04, 0.16);
    ctx.fillRect(-0.18, 0.1, 0.36, 0.045);
    ctx.restore();
  },
};

function compassCard(C) {
  const c = mkCanvas(C), ctx = c.getContext('2d');
  unit(ctx, C);
  face(ctx);
  for (let d = 0; d < 360; d += 5) {
    ctx.save(); ctx.rotate(d * D2R);
    ctx.fillStyle = '#f2f2ee';
    const big = d % 10 === 0;
    ctx.fillRect(-0.012, -0.9, 0.024, big ? 0.14 : 0.08);
    if (d % 30 === 0) {
      const t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      label(ctx, t, 0, -0.62, t.length > 1 ? 0.15 : 0.2, '#f2f2ee', '700');
    }
    ctx.restore();
  }
  return c;
}

export function createInstruments({ quality }) {
  const C = quality === 'low' ? 128 : 256;
  const canvas = mkCanvas(1);
  canvas.width = C * COLS; canvas.height = C * ROWS;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const faces = {};
  for (const k of Object.keys(STATIC)) {
    const c = mkCanvas(C), x = c.getContext('2d');
    unit(x, C); STATIC[k](x);
    faces[k] = c;
  }
  const glareC = mkCanvas(C); { const x = glareC.getContext('2d'); unit(x, C); glare(x); }
  const card = compassCard(C);

  const cells = {};
  GAUGES.forEach((k, i) => {
    const cx = i % COLS, cy = Math.floor(i / COLS);
    cells[k] = [cx / COLS, 1 - (cy + 1) / ROWS, (cx + 1) / COLS, 1 - cy / ROWS];
  });

  const target = { airspeed: 0, altitude: 0, vsi: 0, heading: 0, pitch: 0, roll: 0, rpm: 0, slip: 0, flaps: 0, fuelL: 0.8, fuelR: 0.76 };
  const shown = { ...target, turn: 0 };
  let lastHeading = null, turnRate = 0, acc = 1;

  function set(s) {
    for (const k of Object.keys(target)) if (typeof s[k] === 'number' && Number.isFinite(s[k])) target[k] = s[k];
  }

  // each gauge redraws only when its quantised reading changes, into its own cell canvas; flush() uploads just those cells
  const R = Math.round;
  const KEY = {
    asi: (v) => [R(v.airspeed * 10)], alt: (v) => [R(v.altitude)], vsi: (v) => [R(v.vsi)], tach: (v) => [R(v.rpm)],
    ai: (v) => [R(v.pitch * 1000), R(v.roll * 1000)], tc: (v) => [R(v.slip * 100), R(v.turn * 10)], dg: (v) => [R(v.heading * 10)],
    fuel: (v) => [v.fuelL, v.fuelR],
  };
  const cellC = {}, keys = {}, dirty = new Set(GAUGES);
  for (const k of GAUGES) { cellC[k] = mkCanvas(C); keys[k] = []; }

  function drawCell(k) {
    const c = cellC[k], x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#000'; x.fillRect(0, 0, C, C);
    if (faces[k]) x.drawImage(faces[k], 0, 0);
    unit(x, C);
    DYN[k](x, shown, card);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(glareC, 0, 0);
    const i = GAUGES.indexOf(k);
    ctx.drawImage(c, (i % COLS) * C, Math.floor(i / COLS) * C);
  }

  function update(dt) {
    const e = (r) => 1 - Math.exp(-dt * r);
    shown.airspeed += (target.airspeed - shown.airspeed) * e(8);
    shown.altitude += (target.altitude - shown.altitude) * e(6);
    shown.vsi += (target.vsi - shown.vsi) * e(2.2);
    shown.rpm += (target.rpm - shown.rpm) * e(7);
    shown.pitch += (target.pitch - shown.pitch) * e(10);
    shown.roll += (target.roll - shown.roll) * e(10);
    shown.slip += (target.slip - shown.slip) * e(4);
    shown.fuelL = target.fuelL; shown.fuelR = target.fuelR;
    let dh = target.heading - shown.heading;
    dh = ((dh + 540) % 360) - 180;
    shown.heading = (shown.heading + dh * e(9) + 360) % 360;
    if (lastHeading !== null && dt > 0) {
      let d = target.heading - lastHeading; d = ((d + 540) % 360) - 180;
      turnRate += (d / dt - turnRate) * e(3);
    }
    lastHeading = target.heading;
    shown.turn = turnRate;
    acc += dt;
    if (!attached) flush(null);
  }

  // call when the gauges are about to be drawn (mesh.onBeforeRender): 20 Hz (slow gauges 10 Hz), changed cells only,
  // nothing while hidden
  const SLOW = new Set(['alt', 'vsi', 'tach', 'tc', 'fuel']);
  // attach(mesh): redraw/upload from that mesh's onBeforeRender only (so never while it is hidden). Unattached
  // instruments keep the old behaviour: redraw from update() and re-upload the whole canvas.
  let attached = false;
  function attach(mesh) { attached = true; mesh.onBeforeRender = (renderer) => flush(renderer); }
  let tick = 0;
  function flush(renderer) {
    if (acc < 0.05) return;
    acc = 0;
    tick++;
    for (const k of GAUGES) {
      if (tick & 1 && SLOW.has(k)) continue;
      const nk = KEY[k](shown), ok = keys[k];
      if (nk.length === ok.length && nk.every((v, i) => v === ok[i])) continue;
      keys[k] = nk; dirty.add(k);
    }
    if (!dirty.size) return;
    for (const k of dirty) drawCell(k);
    const props = renderer?.properties.get(texture);
    if (!props?.__webglTexture || props.__version !== texture.version) { texture.needsUpdate = true; dirty.clear(); return; }
    const gl = renderer.getContext();
    renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    for (const k of dirty) {
      const i = GAUGES.indexOf(k), ox = (i % COLS) * C, oy = Math.floor(i / COLS) * C;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, ox, texture.flipY ? canvas.height - oy - C : oy, gl.RGBA, gl.UNSIGNED_BYTE, cellC[k]);
    }
    if (texture.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    dirty.clear();
  }

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const k of GAUGES) drawCell(k);
  dirty.clear();
  texture.needsUpdate = true;
  return { canvas, texture, cells, set, update, attach, flush, shown, dispose() { texture.dispose(); } };
}

// Canvas-baked textures for the compound. Everything is generated once and cached.
import * as THREE from 'three';

const cache = new Map();
function once(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// calm hull plating: large panels, faint seams, a few rivet rows (no speckle, it shimmers at phone size)
export function hullTex() {
  return once('hull', () => {
    const [c, g] = canvas(256, 256), r = rng(7);
    g.fillStyle = '#c4c9d2'; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 128) {
      const v = 190 + (r() - 0.5) * 10 | 0; g.fillStyle = `rgb(${v},${v + 4},${v + 10})`; g.fillRect(x + ((y / 64) % 2) * 64 % 128, y, 128, 64);
    }
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(20,24,32,0.28)'; g.lineWidth = 2;
    for (const y of [0, 128]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    for (let row = 0; row < 2; row++) { const x = row * 128 + 40; g.beginPath(); g.moveTo(x, row * 128); g.lineTo(x, row * 128 + 128); g.stroke(); }
    g.fillStyle = 'rgba(30,34,44,0.25)';
    for (let y = 6; y < 256; y += 128) for (let x = 6; x < 256; x += 16) g.fillRect(x, y, 2, 2);
    return tex(c, { repeat: true });
  });
}

// one floor of four interior-lit window panes (neutral; tinted per panel by vertex colour): ceiling light line,
// lit room, a desk/locker silhouette, one pane with blinds and one dimmer room so a facade is calm but not uniform
export function interiorTex() {
  return once('interior', () => {
    const [c, g] = canvas(512, 128), r = rng(5);
    g.fillStyle = '#0a0c10'; g.fillRect(0, 0, 512, 128);
    const lv = [1, 0.8, 0.55, 0.22];
    for (let p = 0; p < 4; p++) {
      const x0 = p * 128 + 7, w = 114, y0 = 20, h = 92, L = lv[p];
      const gr = g.createLinearGradient(0, y0, 0, y0 + h);
      gr.addColorStop(0, `rgba(255,255,255,${L})`); gr.addColorStop(0.12, `rgba(235,235,235,${0.85 * L})`);
      gr.addColorStop(0.6, `rgba(170,170,170,${0.6 * L})`); gr.addColorStop(1, `rgba(60,60,60,${0.5 * L})`);
      g.fillStyle = gr; g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      if (p === 0) { g.fillRect(x0 + 14, y0 + 62, 46, 30); g.fillRect(x0 + 70, y0 + 52, 10, 40); }
      if (p === 1) { g.fillRect(x0 + 8, y0 + 40, 26, 52); g.fillRect(x0 + 80, y0 + 66, 30, 26); }
      if (p === 2) for (let y = y0 + 4; y < y0 + h; y += 9) g.fillRect(x0, y, w, 2);
      if (p === 3) g.fillRect(x0 + 30, y0 + 70, 60, 22);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 + w / 2 - 1.5, y0, 3, h);
    }
    void r;
    return tex(c, { repeat: true, aniso: 8 });
  });
}

// facade windows: color map (dark glass) + emissive map (lit windows) share one layout
export function windowTex(seed = 1, warm = 0.3) {
  return once('win' + seed + warm, () => {
    const [c, g] = canvas(128, 256), [ce, ge] = canvas(128, 256), r = rng(seed * 97);
    g.fillStyle = '#20283a'; g.fillRect(0, 0, 128, 256);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
    for (let y = 4; y < 256; y += 12) for (let x = 4; x < 128; x += 10) {
      g.fillStyle = '#0c1220'; g.fillRect(x, y, 7, 8);
      const floorLit = ((y / 12 | 0) * 7 + seed) % 5 < 2;
      if (r() < (floorLit ? 0.55 : 0.08)) {
        const w = r() < warm;
        ge.fillStyle = w ? `rgba(255,${170 + r() * 50 | 0},${90 + r() * 40 | 0},${0.55 + r() * 0.45})` : `rgba(${90 + r() * 60 | 0},${200 + r() * 55 | 0},255,${0.5 + r() * 0.5})`;
        ge.fillRect(x, y, 7, 8);
      }
    }
    return { map: tex(c, { repeat: true }), emissive: tex(ce, { repeat: true }) };
  });
}

// soft round glow, white -> transparent (tinted per material)
export function glowTex() {
  return once('glow', () => {
    const [c, g] = canvas(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return tex(c, { srgb: false });
  });
}

// vertical fade for light cones / beams (bright at the source, v=1)
export function beamTex() {
  return once('beam', () => {
    const [c, g] = canvas(64, 128);
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 64, 128);
    return tex(c, { srgb: false });
  });
}

export function smokeTex() {
  return once('smoke', () => {
    const [c, g] = canvas(64, 64), r = rng(3);
    for (let i = 0; i < 14; i++) {
      const x = 20 + r() * 24, y = 20 + r() * 24, rad = 10 + r() * 14;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    return tex(c, { srgb: false });
  });
}

// holo sign: text on transparent with scanlines; returns {tex, aspect}
export function holoTex(text, color = '#38e8ff', { sub = '', w = 512, h = 160, frame = true } = {}) {
  return once('holo' + text + color + sub + w + h, () => {
    const [c, g] = canvas(w, h);
    g.clearRect(0, 0, w, h);
    if (frame) {
      g.strokeStyle = color; g.lineWidth = 4; g.globalAlpha = 0.9;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.globalAlpha = 0.14; g.fillStyle = color; g.fillRect(6, 6, w - 12, h - 12);
      g.globalAlpha = 1;
    }
    g.fillStyle = '#ffffff'; g.shadowColor = color; g.shadowBlur = 18;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(h * (sub ? 0.36 : 0.5))}px "Orbitron","Rajdhani","Arial Black",sans-serif`;
    g.fillText(text, w / 2, h * (sub ? 0.4 : 0.52), w - 30);
    if (sub) { g.font = `700 ${Math.round(h * 0.17)}px "Rajdhani","Arial",sans-serif`; g.fillStyle = color; g.fillText(sub, w / 2, h * 0.74, w - 30); }
    g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
    return { tex: tex(c), aspect: w / h };
  });
}

// the logo chevron used on signs (two nested V's)
export function logoTex(color = '#38e8ff') {
  return once('logo' + color, () => {
    const [c, g] = canvas(256, 256);
    g.shadowColor = color; g.shadowBlur = 20; g.strokeStyle = '#fff'; g.lineWidth = 16; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(40, 60); g.lineTo(128, 200); g.lineTo(216, 60); g.stroke();
    g.strokeStyle = color; g.lineWidth = 10;
    g.beginPath(); g.moveTo(84, 60); g.lineTo(128, 132); g.lineTo(172, 60); g.stroke();
    return tex(c);
  });
}

// city far below the platform: street grid lights
export function cityTex() {
  return once('city', () => {
    const [c, g] = canvas(1024, 1024), r = rng(11);
    g.fillStyle = '#04060d'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 26; i++) {
      const horiz = i % 2, p = r() * 1024, col = r() < 0.6 ? '255,170,80' : r() < 0.6 ? '80,200,255' : '255,80,200';
      g.fillStyle = `rgba(${col},${0.25 + r() * 0.4})`;
      if (horiz) g.fillRect(0, p, 1024, 2 + r() * 3); else g.fillRect(p, 0, 2 + r() * 3, 1024);
    }
    for (let i = 0; i < 5000; i++) {
      const v = r(), col = v < 0.5 ? '255,190,120' : v < 0.85 ? '120,210,255' : '255,110,220';
      g.fillStyle = `rgba(${col},${0.2 + r() * 0.8})`;
      g.fillRect(r() * 1024, r() * 1024, 1 + r() * 2, 1 + r() * 2);
    }
    return tex(c, { repeat: true });
  });
}

// hex grid / circuit pattern for landing pads (emissive, additive)
export function padTex(color = '#38e8ff', label = '') {
  return once('pad' + color + label, () => {
    const [c, g] = canvas(256, 256);
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 8;
    g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 98, 0, Math.PI * 2); g.stroke();
    g.setLineDash([14, 10]); g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100); g.lineTo(128 + Math.cos(a) * 114, 128 + Math.sin(a) * 114); g.lineWidth = 6; g.stroke(); }
    if (label) { g.fillStyle = color; g.font = '900 64px "Orbitron","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 128, 132); }
    return tex(c);
  });
}

// abstract holo billboards for the skyline (no readable text)
export function adTex(k) {
  return once('ad' + k, () => {
    const [c, g] = canvas(256, 160), r = rng(31 + k * 7);
    const pal = [['#ff3fd0', '#3a0a5a'], ['#38e8ff', '#062a4a'], ['#ffb547', '#4a1a06'], ['#a070ff', '#140a40'], ['#4dffa0', '#06301e'], ['#ff4a5a', '#3a0612']][k];
    const gr = g.createLinearGradient(0, 0, 256, 160); gr.addColorStop(0, pal[1]); gr.addColorStop(1, '#05060c');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
    g.globalCompositeOperation = 'lighter';
    if (k % 3 === 0) { g.strokeStyle = pal[0]; g.lineWidth = 10; g.beginPath(); g.moveTo(60, 30); g.lineTo(128, 130); g.lineTo(196, 30); g.stroke(); }
    else if (k % 3 === 1) { const rg = g.createRadialGradient(90, 80, 4, 90, 80, 70); rg.addColorStop(0, '#fff'); rg.addColorStop(0.3, pal[0]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 256, 160); }
    else { for (let i = 0; i < 6; i++) { g.fillStyle = pal[0]; g.globalAlpha = 0.4 + r() * 0.6; g.fillRect(20 + i * 36, 140 - r() * 100, 22, 200); } g.globalAlpha = 1; }
    g.fillStyle = pal[0]; for (let i = 0; i < 4; i++) g.fillRect(150 + (k % 2) * -120, 40 + i * 22, 50 + r() * 40, 8);
    g.globalCompositeOperation = 'source-over'; g.strokeStyle = pal[0]; g.lineWidth = 4; g.strokeRect(2, 2, 252, 156);
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let y = 0; y < 160; y += 4) g.fillRect(0, y, 256, 1.5);
    return tex(c);
  });
}

// vertical hotel-style blade sign: stacked neon letters on a dark panel with a lit border; returns {tex, aspect}
export function bladeTex(text = 'NIGHTSHIFT', color = '#4f9dff') {
  return once('blade' + text + color, () => {
    const n = text.length, cw = 128, ch = 112, [c, g] = canvas(cw, ch * n + 40);
    g.fillStyle = '#060a16'; g.fillRect(0, 0, cw, c.height);
    g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 14; g.strokeRect(8, 8, cw - 16, c.height - 16);
    g.font = '900 92px "Orbitron","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      g.shadowBlur = 22; g.fillStyle = color; g.fillText(text[i], cw / 2, 20 + ch * (i + 0.5));
      g.shadowBlur = 0; g.fillStyle = '#eef6ff'; g.fillText(text[i], cw / 2, 20 + ch * (i + 0.5));
    }
    return { tex: tex(c, { aniso: 8 }), aspect: cw / c.height };
  });
}

// arena jumbotron: two rival badges, VS, a score strip; returns {tex, aspect}
export function screenTex() {
  return once('screen', () => {
    const [c, g] = canvas(512, 288);
    const gr = g.createLinearGradient(0, 0, 512, 288); gr.addColorStop(0, '#2a0838'); gr.addColorStop(1, '#06142c');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
    const badge = (x, col) => { g.save(); g.translate(x, 130); g.strokeStyle = col; g.lineWidth = 10; g.shadowColor = col; g.shadowBlur = 20; g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.lineTo(Math.cos(a) * 70, Math.sin(a) * 70); } g.closePath(); g.stroke();
      g.fillStyle = col; g.globalAlpha = 0.25; g.fill(); g.restore(); };
    badge(120, '#38e8ff'); badge(392, '#ff4a6a');
    g.fillStyle = '#fff'; g.font = '900 86px "Orbitron","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff4fd8'; g.shadowBlur = 24; g.fillText('VS', 256, 130);
    g.shadowBlur = 0; g.fillStyle = '#ff4fd8'; g.fillRect(40, 236, 432, 26); g.fillStyle = '#ffffff'; g.fillRect(40, 236, 250, 26);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 288; y += 4) g.fillRect(0, y, 512, 1.5);
    return { tex: tex(c), aspect: 512 / 288 };
  });
}

// lit hangar bay interior seen through an open door: ceiling light row, warm falloff, racks at the sides, floor line
export function bayTex() {
  return once('bay', () => {
    const [c, g] = canvas(256, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.1, '#ffffff'); gr.addColorStop(0.16, '#d0d0d0'); gr.addColorStop(0.7, '#6a6a6a'); gr.addColorStop(1, '#3a3a3a');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const x of [8, 212]) { g.fillRect(x, 70, 36, 170); for (let y = 90; y < 240; y += 30) g.fillRect(x - 4, y, 44, 4); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 236, 256, 20);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, 256, 14);
    for (let x = 20; x < 256; x += 54) { g.fillStyle = '#ffffff'; g.fillRect(x, 16, 26, 6); }
    return tex(c);
  });
}

// company banner: navy cloth, gold edging, the chevron crest and a vertical name; swallowtail cut via alpha
export function bannerTex(color = '#4f9dff', gold = '#ffc84a', text = 'NIGHTSHIFT') {
  return once('banner' + color + gold + text, () => {
    const [c, g] = canvas(128, 512);
    g.clearRect(0, 0, 128, 512);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(128, 512); g.lineTo(64, 450); g.lineTo(0, 512); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2350b8'); gr.addColorStop(1, '#122a6a');
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.strokeStyle = gold; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#38e8ff'; g.fillRect(0, 16, 128, 8); g.fillRect(0, 128, 128, 4);
    g.shadowColor = color; g.shadowBlur = 14; g.strokeStyle = '#eaf4ff'; g.lineWidth = 9; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(26, 52); g.lineTo(64, 116); g.lineTo(102, 52); g.stroke();
    g.strokeStyle = color; g.lineWidth = 6; g.beginPath(); g.moveTo(46, 52); g.lineTo(64, 84); g.lineTo(82, 52); g.stroke();
    g.shadowBlur = 0; g.fillStyle = gold; g.font = '900 30px "Orbitron","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const letters = text.split('');
    letters.forEach((ch, i) => g.fillText(ch, 64, 156 + i * (270 / letters.length)));
    g.restore();
    return tex(c, { aniso: 4 });
  });
}

// scrolling holo ticker band (repeats horizontally)
export function tickerTex(text, color = '#38e8ff') {
  return once('ticker' + text + color, () => {
    const [c, g] = canvas(1024, 64);
    g.clearRect(0, 0, 1024, 64);
    g.fillStyle = color; g.globalAlpha = 0.18; g.fillRect(0, 6, 1024, 52); g.globalAlpha = 1;
    g.fillRect(0, 4, 1024, 3); g.fillRect(0, 57, 1024, 3);
    g.fillStyle = '#ffffff'; g.shadowColor = color; g.shadowBlur = 10;
    g.font = '800 34px "Orbitron","Rajdhani","Arial Black",sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 12, 33);
    const t = tex(c, { repeat: true });
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

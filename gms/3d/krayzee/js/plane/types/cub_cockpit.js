import * as THREE from 'three';
import { Builder, srgb } from '../geom.js';
import { createInstruments } from '../instruments.js';
import { pbrMaterial, RM, M4, rod, fan, canvasTexture, noiseFill } from './kit.js';

// A flat instrument panel with live gauges from the shared atlas, a stick on the rig's stick pivot, a throttle and a
// rudder bar: the Butter Cub's and the Show-Off's cockpits. Build frame of the type (y up, z = station aft).
// spec: { PS, outline [[x,y]...], box {x0,x1,y0,y1}, paint(g, txt, W), gauges {asi:[x,y,d]..}, bezel, extras(B, n, high),
//   stick(sb, n, high), throttle { pos, len, axis, build(tb, n) }, rudder { pos, w }, openDials }
export const COL = {
  steel: srgb('#5b5f63'), black: srgb('#0f1012'), brass: srgb('#c99d48'), chrome: srgb('#d6d9dc'), leather: srgb('#4a2b18'),
  wood: srgb('#5d3018'), red: srgb('#9c1b1b'), card: srgb('#e3d9bd'), glass: srgb('#20262a'), cream: srgb('#e9e1c9'), rubber: srgb('#141416'),
};

function panelCanvas(quality, S) {
  const { x0, x1, y0, y1 } = S.box;
  const W = quality === 'low' ? 512 : 1024, H = Math.round(W * ((y1 - y0) / (x1 - x0)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const kx = W / (x1 - x0), ky = H / (y1 - y0);
  g.setTransform(kx, 0, 0, -ky, -x0 * kx, y1 * ky);
  const txt = (s, x, y, size, col = '#e6dcc0', weight = '700', fam = "Georgia, 'Times New Roman', serif") => {
    g.save(); g.translate(x, y); g.scale(1 / 1000, -1 / 1000);
    g.font = `${weight} ${size * 1000}px ${fam}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s, 0, 0); g.restore();
  };
  const hole = (x, y, d, screws = '#8a6a32') => {
    g.fillStyle = '#050505'; g.beginPath(); g.arc(x, y, d / 2 + 0.006, 0, 7); g.fill();
    g.fillStyle = screws;
    for (const a of [0.8, 2.4, 3.9, 5.5]) { g.beginPath(); g.arc(x + Math.cos(a) * (d / 2 + 0.013), y + Math.sin(a) * (d / 2 + 0.013), 0.0035, 0, 7); g.fill(); }
  };
  S.paint(g, txt, { hole, noise: (n, a, light) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); noiseFill(g, 0, 0, W, H, n * (W / 1024), a, !light); g.restore(); }, W, H });
  for (const [x, y, d] of Object.values(S.gauges)) hole(x, y, d, S.screws);
  return canvasTexture(c);
}

// static round dial (oil, clock, fuel-on-a-wire) painted on a panel canvas, metres
export function paintDial(g, kind, x, y, d) {
  const r = d / 2;
  g.save(); g.translate(x, y); g.scale(r, r);
  const light = kind === 'clock';
  g.fillStyle = light ? '#e9e1c9' : '#0f0f0f'; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
  g.strokeStyle = light ? '#222' : '#eee'; g.lineWidth = 0.06;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 0.9, Math.sin(a) * 0.9); g.lineTo(Math.cos(a) * 0.72, Math.sin(a) * 0.72); g.stroke(); }
  if (kind === 'oil') { g.strokeStyle = '#2c9a3a'; g.lineWidth = 0.12; g.beginPath(); g.arc(0, 0, 0.8, 0.3, 1.2); g.stroke(); g.strokeStyle = '#c0262b'; g.beginPath(); g.arc(0, 0, 0.8, 1.25, 1.5); g.stroke(); }
  g.lineWidth = 0.09; g.lineCap = 'round'; g.strokeStyle = light ? '#222' : '#f0f0f0';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(light ? 1.2 : 0.6) * 0.7, Math.sin(light ? 1.2 : 0.6) * 0.7); g.stroke();
  if (light) { g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.35, -0.3); g.stroke(); }
  g.fillStyle = light ? '#222' : '#f0f0f0'; g.beginPath(); g.arc(0, 0, 0.09, 0, 7); g.fill();
  g.restore();
}

export function buildPanelCockpit(quality, mats, ctx, S) {
  const high = quality === 'high';
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const group = new THREE.Group();
  group.name = 'panel-cockpit';
  const B = new Builder();
  const PS = S.PS, { x0, x1, y0, y1 } = S.box;

  const panelTex = panelCanvas(quality, S);
  const pb = new Builder();
  fan(pb, S.outline.map(([x, y]) => [x, y, PS]), [0, 0, 1], (p) => [(p[0] - x0) / (x1 - x0), (p[1] - y0) / (y1 - y0)]);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: S.panelRough ?? 0.55, metalness: 0, emissive: 0x000000, emissiveMap: panelTex, emissiveIntensity: 0 });
  const panel = new THREE.Mesh(pb.build(), panelMat);
  panel.name = 'panel';
  group.add(panel);
  const bez = S.bezel === 'chrome' ? [RM.chrome, COL.chrome] : S.bezel === 'black' ? [RM.black, COL.black] : [RM.brass, COL.brass];
  for (const [x, y, d] of Object.values(S.gauges)) B.addGeo(new THREE.TorusGeometry(d / 2 + 0.004, 0.0055, n(6), n(24)), M4(x, y, PS + 0.004), bez[0], bez[1]);
  S.extras?.(B, n, high);
  const cpMat = pbrMaterial(`${S.name}-cockpit`);
  const interior = new THREE.Mesh(B.build(), cpMat);
  interior.name = 'cockpit-detail'; interior.receiveShadow = true;
  group.add(interior);

  const inst = createInstruments({ quality });
  const gq = new Builder();
  for (const [k, [x, y, d]] of Object.entries(S.gauges)) {
    const [u0, v0, u1, v1] = inst.cells[k], r = d / 2, z = PS + 0.0015;
    const a = gq.v([x - r, y - r, z], [0, 0, 1], [u0, v0]), b = gq.v([x + r, y - r, z], [0, 0, 1], [u1, v0]);
    const c = gq.v([x + r, y + r, z], [0, 0, 1], [u1, v1]), e = gq.v([x - r, y + r, z], [0, 0, 1], [u0, v1]);
    gq.t(a, b, c); gq.t(a, c, e);
  }
  const gaugeMat = new THREE.MeshStandardMaterial({ map: inst.texture, emissiveMap: inst.texture, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0, alphaTest: 0.5 });
  {
    const m = document.createElement('canvas'); m.width = 256; m.height = 128;
    const mg = m.getContext('2d');
    mg.fillStyle = '#000'; mg.fillRect(0, 0, 256, 128); mg.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { mg.beginPath(); mg.arc(32 + i * 64, 32 + j * 64, 31.5, 0, 7); mg.fill(); }
    gaugeMat.alphaMap = new THREE.CanvasTexture(m);
  }
  const gauges = new THREE.Mesh(gq.build(), gaugeMat);
  gauges.name = 'gauges';
  group.add(gauges);
  inst.attach?.(gauges);

  const sb = new Builder();
  S.stick(sb, n, high);
  const stickMesh = new THREE.Mesh(sb.build(), cpMat);
  stickMesh.name = 'stick';
  ctx.stick.add(stickMesh);

  const T = S.throttle, throttle = new THREE.Group();
  throttle.position.set(...T.pos);
  { const tb = new Builder(); T.build(tb, n); throttle.add(new THREE.Mesh(tb.build(), cpMat)); }
  group.add(throttle);
  const rudderBar = new THREE.Group();
  rudderBar.position.set(...S.rudder.pos);
  {
    const rb = new Builder(), w = S.rudder.w ?? 0.42;
    rb.addGeo(new THREE.BoxGeometry(w, 0.025, 0.035), M4(0, 0, 0), RM.steel, COL.steel);
    for (const sg of [-1, 1]) {
      rb.addGeo(new THREE.BoxGeometry(0.08, 0.11, 0.012), M4(sg * w * 0.42, 0.05, -0.02, 1, 1, 1, -0.35, 0, 0), RM.rubber, COL.black);
      rb.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), M4(sg * w * 0.42, 0.11, -0.04, 1, 1, 1, 0, 0, Math.PI / 2), RM.steel, COL.steel);
    }
    rb.addGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), M4(0, -0.03, 0), RM.steel, COL.steel);
    rudderBar.add(new THREE.Mesh(rb.build(), cpMat));
  }
  group.add(rudderBar);

  function setNight(nn) {
    nn = Math.max(0, Math.min(1, nn));
    gaugeMat.emissiveIntensity = 0.25 + nn * 0.8;
    gaugeMat.emissive.setRGB(1, 1 - nn * 0.1, 1 - nn * 0.25);
    panelMat.emissive.setRGB(0.5, 0.42, 0.3);
    panelMat.emissiveIntensity = nn * 0.25;
  }
  const detail = S.openDials ? [throttle, rudderBar] : [throttle, rudderBar, gauges];
  function setDetail(on) { for (const o of detail) o.visible = on; }
  function update(dt, cur) {
    T.anim(throttle, cur.throttle);
    rudderBar.rotation.y = cur.rudder * 0.22;
    inst.update(dt);
  }
  return {
    group, instruments: inst, update, setNight, setDetail,
    dispose() { panelTex.dispose(); panelMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); cpMat.dispose(); inst.dispose(); stickMesh.geometry.dispose(); stickMesh.removeFromParent(); },
  };
}

// a plain light-aircraft control stick with a black rubber grip, for the stick pivot
export function stickGeom(sb, n, high, { len = 0.5, boot = true } = {}) {
  if (boot) sb.addGeo(new THREE.ConeGeometry(0.06, 0.09, n(12), 1, true), M4(0, 0.045, 0), RM.leatherWorn, COL.leather);
  sb.addGeo(new THREE.CylinderGeometry(0.011, 0.013, len - 0.1, n(8)), M4(0, (len - 0.1) / 2 + 0.03, 0), RM.steel, COL.steel);
  sb.addGeo(new THREE.CylinderGeometry(0.02, 0.019, 0.11, n(12)), M4(0, len - 0.06, 0), RM.rubber, COL.black);
  sb.addGeo(new THREE.SphereGeometry(0.02, n(10), n(6)), M4(0, len - 0.005, 0), RM.rubber, COL.black);
  if (high) sb.addGeo(new THREE.BoxGeometry(0.012, 0.03, 0.018), M4(0, len - 0.05, -0.024), RM.chrome, COL.chrome);
}
export { rod };

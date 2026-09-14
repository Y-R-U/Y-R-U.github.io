// LONGSHOT — seeded procedural Meridian City.
// Districts: downtown core (towers, neon), midtown offices, oldtown low-rise,
// park + plaza. All buildings merge into a handful of draw calls; windows come
// from generated facade atlases (albedo + emissive) with per-building UV phase
// so no two towers read identical. Returns colliders + glass + room data the
// ballistics and missions modules consume.

import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TIMES, LITE, MOVE } from './config.js';
import { rng, hash32 } from './utils.js';

const T = THREE;

// ── canvas texture helpers ───────────────────────────────────────────────────
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

// facade: tileable window grid. Returns {map, emissive} pair.
// `style.draw` picks the family — a punched grid, a horizontal glazing ribbon, a
// vertical-fin bay, an industrial sash or a near-blank party wall. Both passes
// walk the SAME window list so every lit pane lands exactly on a dark one.
// The wall greys are deliberately near-neutral: the per-building vertex tint is
// what carries a district's colour, and a coloured wall texture would fight it.
function facadeTex(r, style, litP) {
  const W = 256, H = 256;
  const cols = style.cols, rows = style.rows, cw = W / cols, ch = H / rows;
  const glassy = style.draw === 'grid' || style.draw === 'band' || style.draw === 'fin';
  const wins = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const lit = rng(r + x * 131 + y * 17)() < litP;
    const gx = x * cw, gy = y * ch;
    const full = { x: gx + cw * style.mx, y: gy + ch * style.my, w: cw * (1 - style.mx * 2), h: ch * (1 - style.my * 2), lit };
    switch (style.draw) {
      case 'band':                                   // continuous ribbon, thin mullions
        wins.push({ ...full, x: gx + 0.8, w: cw - 1.6 });
        break;
      case 'ware':                                   // sashes, one blank course in three
        if (y % 3 !== 2) wins.push({ ...full, panes: [3, 2] });
        break;
      case 'blank':                                  // mostly solid party wall
        if ((x * 3 + y * 5) % 4 === 0) wins.push({ ...full, sill: true });
        break;
      case 'punch':
        wins.push({ ...full, sill: true });
        break;
      default:
        wins.push(full);
    }
  }
  const draw = (lit) => canvasTex(W, H, (g) => {
    if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
    else {
      g.fillStyle = style.wall; g.fillRect(0, 0, W, H);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {   // panel-to-panel grain
        g.fillStyle = `rgba(0,0,0,${(rng(r + x * 53 + y * 211)() * 0.11).toFixed(3)})`;
        g.fillRect(x * cw, y * ch, cw, ch);
      }
      if (style.draw === 'punch' || style.draw === 'blank') {           // mortar courses
        g.fillStyle = 'rgba(0,0,0,0.11)';
        for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 1);
      }
      if (style.draw === 'ware') {                                      // corrugated cladding
        g.fillStyle = 'rgba(0,0,0,0.09)';
        for (let x = 0; x < W; x += 7) g.fillRect(x, 0, 2, H);
      }
      if (style.draw === 'fin') {                                       // pilasters between bays
        for (let x = 0; x < cols; x++) {
          g.fillStyle = 'rgba(255,255,255,0.11)'; g.fillRect(x * cw, 0, cw * style.mx * 0.85, H);
          g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x * cw + cw * style.mx * 0.85, 0, 2, H);
        }
      }
      if (style.draw === 'blank') {                                     // faded ghost sign
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(W * 0.12, H * 0.16, W * 0.76, H * 0.3);
      }
      if (style.draw === 'band') {                                      // spandrel shadow line
        g.fillStyle = 'rgba(0,0,0,0.14)';
        for (let y = 0; y < rows; y++) g.fillRect(0, y * ch + ch * (1 - style.my), W, 2);
      }
    }
    for (const win of wins) {
      if (lit) {
        if (!win.lit) continue;
        const warm = 30 + Math.floor(rng(r + win.x * 7 + win.y * 313)() * 40);
        g.fillStyle = `rgb(255,${170 + warm},${90 + warm})`;
        g.fillRect(win.x, win.y, win.w, win.h);
        continue;
      }
      // Glazed styles read as REFLECTIVE glass, not black holes. A curtain-wall
      // tower is nearly all window, so dark panes made every downtown block one
      // near-black mass whatever tint was under them.
      const v = (glassy ? 86 : 48) + Math.floor(rng(r + win.x * 31 + win.y * 7)() * (glassy ? 46 : 34));
      g.fillStyle = win.lit ? '#6a5a3a' : `rgb(${v},${v + 9},${v + 18})`;
      g.fillRect(win.x, win.y, win.w, win.h);
      g.fillStyle = glassy ? 'rgba(186,214,242,0.34)' : 'rgba(170,200,230,0.2)';   // sky reflection
      g.fillRect(win.x, win.y, win.w, win.h * (glassy ? 0.46 : 0.35));
      if (win.panes) {
        g.fillStyle = 'rgba(26,30,36,0.85)';
        for (let i = 1; i < win.panes[0]; i++) g.fillRect(win.x + win.w * i / win.panes[0], win.y, 1, win.h);
        for (let i = 1; i < win.panes[1]; i++) g.fillRect(win.x, win.y + win.h * i / win.panes[1], win.w, 1);
      }
      if (win.sill) {
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(win.x - 1, win.y + win.h, win.w + 2, 2);
        g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(win.x - 1, win.y - 2, win.w + 2, 2);
      }
    }
  });
  const map = draw(false), emissive = draw(true);
  for (const t of [map, emissive]) { t.wrapS = t.wrapT = T.RepeatWrapping; }
  return { map, emissive };
}

// Eight families. Each one costs a merged mesh and a draw call, so they earn
// their keep by looking structurally different, not just differently tinted.
const FACADE_STYLES = [
  { cols: 6, rows: 6, mx: 0.16, my: 0.20, wall: '#b6bac0', winW: 3.4, winH: 3.4, draw: 'grid' },   // 0 office glass
  { cols: 5, rows: 7, mx: 0.24, my: 0.26, wall: '#c0b6ac', winW: 3.8, winH: 3.1, draw: 'punch' },  // 1 masonry, sills
  { cols: 8, rows: 8, mx: 0.08, my: 0.11, wall: '#aeb6be', winW: 2.6, winH: 2.8, draw: 'grid' },   // 2 curtain-wall tower
  { cols: 4, rows: 5, mx: 0.26, my: 0.28, wall: '#c6b8a8', winW: 4.4, winH: 3.6, draw: 'punch' },  // 3 oldtown render
  { cols: 6, rows: 5, mx: 0.04, my: 0.30, wall: '#b2b7bd', winW: 3.2, winH: 3.6, draw: 'band' },   // 4 ribbon spandrel
  { cols: 7, rows: 6, mx: 0.30, my: 0.07, wall: '#acb1b8', winW: 3.0, winH: 3.2, draw: 'fin' },    // 5 vertical fins
  { cols: 4, rows: 3, mx: 0.16, my: 0.22, wall: '#aea597', winW: 5.5, winH: 4.4, draw: 'ware' },   // 6 warehouse sashes
  { cols: 5, rows: 6, mx: 0.28, my: 0.30, wall: '#bdad9d', winW: 4.0, winH: 3.4, draw: 'blank' },  // 7 party wall
];

// ── building geometry ────────────────────────────────────────────────────────
function paintGeo(g, tint) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  return g;
}
// four side planes with window-scaled UVs (+ random phase), separate roof.
// `tiers` are stacked boxes inside the SAME footprint and the SAME total height
// as the collider — a setback narrows the top, it never grows the building, so
// the sightline corridor cannot notice.
function buildingGeo(tiers, style, r, tint) {
  const geos = [];
  const ox = Math.floor(r() * 8) / style.cols, oy = Math.floor(r() * 8) / style.rows;
  for (const t of tiers) {
    const h = t.y1 - t.y0;
    const uw = t.w / style.winW / style.cols, uh = h / style.winH / style.rows, ud = t.d / style.winW / style.cols;
    const face = (fw, rotY, tx, tz, ur) => {
      const g = new T.PlaneGeometry(fw, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, ox + uv.getX(i) * ur, oy + uv.getY(i) * uh);
      g.rotateY(rotY); g.translate(tx, t.y0 + h / 2, tz);
      geos.push(g);
    };
    face(t.w, 0, 0, t.d / 2, uw); face(t.w, Math.PI, 0, -t.d / 2, uw);
    face(t.d, Math.PI / 2, t.w / 2, 0, ud); face(t.d, -Math.PI / 2, -t.w / 2, 0, ud);
  }
  return paintGeo(BGU.mergeGeometries(geos), tint);
}
function boxTinted(w, h, d, tint) { return paintGeo(new T.BoxGeometry(w, h, d), tint); }
function cylTinted(rt, rb, h, seg, tint) { return paintGeo(new T.CylinderGeometry(rt, rb, h, seg), tint); }

// ── palette ──────────────────────────────────────────────────────────────────
// Districts get an identity, not a brightness band. Each entry is a set of base
// hues plus saturation/lightness ranges; every building rolls its own hue jitter
// on top, so a street reads as a family of different buildings rather than one
// building repeated. Values are sRGB HSL — THREE converts to working space.
const _C = new T.Color();
function tintOf(rr, pal) {
  const h = (pal.hues[Math.floor(rr() * pal.hues.length)] + rr.range(-pal.hj, pal.hj) + 1) % 1;
  _C.setHSL(h, rr.range(pal.sat[0], pal.sat[1]), rr.range(pal.lum[0], pal.lum[1]));
  return { r: _C.r, g: _C.g, b: _C.b };
}
function hsl(h, s, l) { _C.setHSL((h + 1) % 1, s, l); return { r: _C.r, g: _C.g, b: _C.b }; }
function jitHSL(rr, h, s, l, jh = 0.02, js = 0.08, jl = 0.06) {
  return hsl(h + rr.range(-jh, jh), Math.max(0, s + rr.range(-js, js)), Math.max(0.03, l + rr.range(-jl, jl)));
}
function shade(tint, mul, desat = 0.5) {
  _C.setRGB(tint.r, tint.g, tint.b);
  const hs = { h: 0, s: 0, l: 0 }; _C.getHSL(hs);
  _C.setHSL(hs.h, hs.s * desat, Math.max(0.03, hs.l * mul));
  return { r: _C.r, g: _C.g, b: _C.b };
}

// How far from the centre of a `w`-square roof the shooter stands so that he is
// ~3 m from the edge ALONG HIS LINE OF SIGHT. The kill zone is usually diagonal
// from the perch, and a square roof reaches 1.41× further across its diagonal —
// get this wrong and the shooter stares across nine metres of his own gravel,
// which grazes the sightline and hides the target behind his own parapet.
export function perchReach(w, yaw) {
  const edge = (w / 2) / Math.max(Math.abs(Math.sin(yaw)), Math.abs(Math.cos(yaw)));
  return Math.max(3, edge - 3);
}

// ── the city ─────────────────────────────────────────────────────────────────
export function buildCity(scene, spec) {
  const r = rng(spec.seed || 'meridian');
  const time = TIMES[spec.time] || TIMES.dusk;
  const group = new T.Group();
  scene.add(group);

  const { block, road, grid } = CITY;
  const cell = block + road;
  const extent = grid * cell;               // ≈ 780 m
  const half = extent / 2;

  const city = {
    group, time, timeName: spec.time || 'dusk', extent, colliders: [], glass: [], rooms: [],
    holes: [],            // carved room volumes — ballistics passes through these
    benches: [],          // kill-zone (plaza) benches — where bench MARKS sit
    parkBenches: [],      // ambient park seating for civilians
    plazaPts: [], walkLoops: [], escapePts: [], neon: null,
    vantage: null, update: null, dispose: null,
  };

  // ── sky ──
  const sky = (() => {
    const g = new T.SphereGeometry(3200, 20, 12);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const top = new T.Color(time.skyTop), bot = new T.Color(time.skyBot);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, pos.getY(i) / 1500 + 0.25));
      const c = bot.clone().lerp(top, Math.pow(t, 0.75));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false }));
    group.add(m);
    return m;
  })();

  // sun / moon sprite
  const sunTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.85)');
    gr.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const sun = new T.Sprite(new T.SpriteMaterial({ map: sunTex, color: time.sun, fog: false, depthWrite: false, transparent: true }));
  sun.scale.setScalar(spec.time === 'night' ? 220 : 480);
  sun.position.set(time.sunPos[0], Math.max(0.06, time.sunPos[1]), time.sunPos[2]).normalize().multiplyScalar(2800);
  group.add(sun);

  // stars
  if (spec.time === 'night') {
    const n = 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new T.Vector3(r() * 2 - 1, r() * 0.9 + 0.12, r() * 2 - 1).normalize().multiplyScalar(3000);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    group.add(new T.Points(g, new T.PointsMaterial({ color: 0xbfd0ff, size: 3.2, fog: false, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  }

  // clouds
  const clouds = [];
  if (spec.time !== 'night') {
    const cloudTex = canvasTex(256, 128, (g) => {
      for (let i = 0; i < 16; i++) {
        const x = 30 + Math.random() * 196, y = 40 + Math.random() * 48, rr = 18 + Math.random() * 26;
        const gr = g.createRadialGradient(x, y, 2, x, y, rr);
        gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
      }
    });
    const cn = spec.time === 'rain' ? 16 : 9;
    for (let i = 0; i < cn; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false, fog: false,
        color: spec.time === 'rain' ? 0x555e66 : (spec.time === 'dusk' ? 0xe8b088 : 0xffffff),
        opacity: spec.time === 'rain' ? 0.85 : 0.5,
      }));
      s.position.set(r.range(-2200, 2200), r.range(500, 900), r.range(-2200, 2200));
      s.scale.set(r.range(500, 1100), r.range(140, 260), 1);
      group.add(s); clouds.push(s);
    }
  }

  // ── lights ──
  const hemi = new T.HemisphereLight(time.skyTop, 0x4a463e, time.ambI);
  const sunL = new T.DirectionalLight(time.sun, time.sunI);
  sunL.position.set(time.sunPos[0], time.sunPos[1], time.sunPos[2]).multiplyScalar(900);
  const ambL = new T.AmbientLight(time.amb, time.ambient ?? 0.35);
  // A second, opposing fill so the shaded faces of towers aren't pure black.
  // Day needs the most of it: the sun is high and every north face of the city
  // went to one flat navy mass, which is most of what "all the same colour" was.
  const fill = new T.DirectionalLight(time.amb, time.sunI * (spec.time === 'day' ? 0.42 : 0.3));
  fill.position.set(-time.sunPos[0], 0.45, -time.sunPos[2]).multiplyScalar(700);
  group.add(hemi, sunL, ambL, fill);
  scene.fog = new T.Fog(time.fog, 220, time.fogFar);

  // ── district map ──
  const PARKS = [];
  const kind = [];        // per block: 'down' | 'mid' | 'old' | 'park' | 'plaza'
  for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
    const dx = bx - (grid - 1) / 2, dy = by - (grid - 1) / 2;
    const d = Math.hypot(dx, dy);
    let k = d < 2.3 ? 'down' : d < 4.2 ? 'mid' : 'old';
    kind[by * grid + bx] = k;
  }
  // two parks + one plaza, deterministic
  const pk1 = [r.int(3, 5), r.int(7, 9)], pk2 = [r.int(7, 9), r.int(3, 5)];
  kind[pk1[1] * grid + pk1[0]] = 'park'; PARKS.push(pk1);
  kind[pk2[1] * grid + pk2[0]] = 'park'; PARKS.push(pk2);
  const pz = [Math.floor(grid / 2) + 1, Math.floor(grid / 2)];
  kind[pz[1] * grid + pz[0]] = 'plaza';

  const blockPos = (bx, by) => [bx * cell - half + cell / 2, by * cell - half + cell / 2];

  // ── the shooting corridor ────────────────────────────────────────────────
  // A rooftop can't see a street 300 m away through a forest of towers, so the
  // city is BUILT around the shot: pick the perch first, then cap the heights of
  // everything inside the sightline cone to the kill zone. The result reads as a
  // low-rise boulevard running from your window to the mark — and it guarantees
  // every ground contract is actually takeable.
  const [zx, zz] = blockPos(pz[0], pz[1]);
  const zone = new T.Vector3(zx, 0, zz);
  const zoneR = 56;                                  // kill-zone radius (plaza + its sidewalks)
  let perch = null;
  if (spec.vantage) {
    const want = spec.vantage.dist || 250;
    const vh = spec.vantage.height || 36;
    let bb = null, be = 1e9;
    for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
      const k = kind[by * grid + bx];
      if (k === 'park' || k === 'plaza') continue;
      const [cx, cz] = blockPos(bx, by);
      const d = Math.hypot(cx - zx, cz - zz);
      const e = Math.abs(d - want);
      if (d > zoneR + 40 && e < be) { be = e; bb = [bx, by, cx, cz, d]; }
    }
    if (bb) {
      kind[bb[1] * grid + bb[0]] = 'vantage';
      perch = { bx: bb[0], by: bb[1], cx: bb[2], cz: bb[3], h: vh, dist: bb[4] };
    }
  }
  // The eye: standing at the parapet (roof slab is 1.4 m thick, shooter is 1.62 m
  // tall, perch is 30 m square so he stands 12 m out from centre). MissionRun
  // reproduces exactly this — the corridor is cut for the eye that actually
  // exists, not an approximation of it.
  const PERCH_W = 30;
  const eye = perch
    ? (() => {
        const yaw = Math.atan2(zx - perch.cx, zz - perch.cz);
        return {
          x: perch.cx + Math.sin(yaw) * perchReach(PERCH_W, yaw),
          y: perch.h + 1.4 + 1.62,
          z: perch.cz + Math.cos(yaw) * perchReach(PERCH_W, yaw),
          yaw,
        };
      })()
    : null;
  // tallest a building at 2-D distance d (from the eye, inside the cone) may be
  // and still leave the near edge of the kill zone in view
  const Dnear = eye ? Math.max(40, Math.hypot(zx - eye.x, zz - eye.z) - zoneR) : 0;
  const capAt = (bx2, bz2, bw, bd) => {
    if (!eye || !spec.groundLOS) return Infinity;
    const ax = zx - eye.x, az = zz - eye.z;
    const L = Math.hypot(ax, az) || 1;
    const ux = ax / L, uz = az / L;
    const rx = bx2 - eye.x, rz = bz2 - eye.z;
    const along = rx * ux + rz * uz;                  // distance down the corridor
    if (along <= 4 || along >= Dnear) return Infinity; // behind us, or past the zone
    const off = Math.abs(-rx * uz + rz * ux);          // lateral offset
    const halfW = 16 + (zoneR + 14) * (along / Math.max(1, L));   // cone widens toward the zone
    const near = along - Math.hypot(bw, bd) / 2;
    if (off - Math.hypot(bw, bd) / 2 > halfW) return Infinity;     // outside the cone
    return eye.y * (1 - Math.max(0, near) / Dnear) - 4.5;          // under the sightline
  };


  // Detail budget. The player only ever looks out of one window at one kill
  // zone, and a vent on a roof 600 m behind him is a triangle nobody will ever
  // resolve — every merged mesh here is too big to frustum-cull, so distant
  // clutter is pure cost. Small props are placed only near the shot.
  const nearAction = (x, z) => {
    if (!eye) return Math.hypot(x, z) < 300;
    const ax = zx - eye.x, az = zz - eye.z, L2 = ax * ax + az * az || 1;
    const t = Math.max(0, Math.min(1, ((x - eye.x) * ax + (z - eye.z) * az) / L2));
    return Math.hypot(x - (eye.x + ax * t), z - (eye.z + az * t)) < 230;
  };

  // ── buildings (merged per facade style) ──
  const geosByStyle = FACADE_STYLES.map(() => []);
  const roofGeos = [], propGeos = [];
  // Downtown is cool glass and steel with the odd bronze tower; midtown is warm
  // stone and ochre; oldtown is brick, rust and painted render with real chroma.
  const PALETTE = {
    down: { hues: [0.55, 0.52, 0.58, 0.10, 0.09, 0.47], hj: 0.028, sat: [0.18, 0.50], lum: [0.48, 0.76] },
    mid:  { hues: [0.09, 0.11, 0.06, 0.13, 0.10, 0.08, 0.33, 0.55], hj: 0.022, sat: [0.22, 0.48], lum: [0.46, 0.76] },
    old:  { hues: [0.02, 0.05, 0.08, 0.12, 0.03, 0.07, 0.42, 0.58], hj: 0.020, sat: [0.28, 0.56], lum: [0.40, 0.68] },
  };
  // Style mix per district: the signature style appears twice in six, so a
  // district reads as a family instead of a clone. Dealt round-robin with a
  // coprime stride rather than rolled — a random draw over 35 downtown lots
  // swings past 40% on some seeds, and the whole point is a guaranteed mix.
  const STYLE_MIX = {
    down: [2, 2, 4, 0, 5, 4],
    mid:  [0, 0, 4, 5, 1, 6],
    old:  [3, 3, 1, 7, 6, 1],
  };
  const styleTurn = { down: 0, mid: 0, old: 0 };
  // Roofs are the surface this game is played across, so they carry a palette of
  // their own: tar, gravel, pale and green membrane, red-oxide and verdigris
  // metal, grey asphalt — each jittered per roof.
  const ROOF_HSL = [
    [0.07, 0.16, 0.13], [0.09, 0.15, 0.30], [0.11, 0.08, 0.42], [0.33, 0.24, 0.27],
    [0.02, 0.34, 0.28], [0.45, 0.30, 0.32], [0.58, 0.18, 0.31], [0.06, 0.30, 0.22],
    [0.10, 0.10, 0.42], [0.00, 0.02, 0.36],
  ];
  const heights = { down: [45, 125], mid: [20, 58], old: [9, 26] };
  // No roof furniture within this radius of a roof centre: `rooftop` marks spawn
  // dead centre (missions.js), and a stairwell hut on their head is a blind mark.
  const ROOF_KEEPOUT = 4.2;

  // ⚠ The block stream `rr` decides LAYOUT — which lots exist, how wide, how
  // tall — and every lot in a block draws from it in turn, so a single extra
  // rr() spent on appearance reshuffles the whole city and moves the buildings
  // the sightline audit was run against. Appearance therefore rolls on its own
  // per-lot stream, and this burns exactly the draws the pre-B2 generator spent
  // here so the layout stays bit-identical to the audited build.
  function burnLayoutStream(rr, h, noParapet) {
    if (rr.chance(0.3)) rr.int(0, 3);
    rr(); rr(); rr();
    if (h > 18 && !noParapet) {
      const n = rr.int(1, 3);
      for (let i = 0; i < n; i++) { rr(); rr(); rr(); rr(); rr(); }
      if (rr.chance(0.28)) { rr(); rr(); }
    }
  }

  function addBuilding(cx, cz, w, d, h, k, rr, opts = {}) {
    burnLayoutStream(rr, h, opts.noParapet);
    const ar = rng(spec.seed + ':f' + Math.round(cx * 4) + ',' + Math.round(cz * 4));
    const mix = STYLE_MIX[k] || STYLE_MIX.mid;
    const si = mix[(styleTurn[k] = (styleTurn[k] || 0) + 1) * 5 % mix.length];
    const style = FACADE_STYLES[si];
    const tint = tintOf(ar, PALETTE[k] || PALETTE.mid);
    // Silhouette: a tall tower steps back once or twice on its way up. The tiers
    // live INSIDE the collider box — same footprint, same total height — and the
    // lowest setback is kept well above any height a room bay can be carved at,
    // so a lit office never ends up hanging off an inset face.
    const tiers = [];
    const setbackFloor = (eye ? eye.y + 8 : 45);
    if (!opts.noSetback && h >= 55 && h > setbackFloor + 14 && ar.chance(0.62)) {
      const n = ar.chance(0.35) ? 2 : 1;
      let y = Math.max(setbackFloor, h * ar.range(0.52, 0.66)), tw = w, td = d;
      tiers.push({ w, d, y0: 0, y1: y });
      for (let i = 0; i < n; i++) {
        const f = ar.range(0.86, 0.94);
        tw *= f; td *= f;
        const y1 = i === n - 1 ? h : y + (h - y) * ar.range(0.45, 0.62);
        tiers.push({ w: tw, d: td, y0: y, y1 });
        const ledge = boxTinted(tw + 1.2, 0.5, td + 1.2, shade(tint, 0.78, 0.7));
        ledge.translate(cx, y + 0.25, cz);
        propGeos.push(ledge);
        y = y1;
      }
    } else {
      tiers.push({ w, d, y0: 0, y1: h });
    }
    const top = tiers[tiers.length - 1];
    const geo = buildingGeo(tiers, style, ar, tint);
    geo.translate(cx, 0, cz);
    geosByStyle[si].push(geo);
    // roof slab: its own material family, jittered per building
    const rh = ROOF_HSL[ar.int(0, ROOF_HSL.length - 1)];
    const roofTint = jitHSL(ar, rh[0], rh[1], rh[2], 0.025, 0.09, 0.07);
    const roof = boxTinted(top.w, 1.4, top.d, roofTint);
    roof.translate(cx, h + 0.7, cz);
    roofGeos.push(roof);
    // Parapets on every roof but the shooter's own — a 1.1 m wall three metres
    // ahead of your eye sits exactly on the line of a downward shot and fills
    // the entire scope with concrete. Tinted off the building, not off one grey.
    if (!opts.noParapet) {
      const pw = 0.5, ph = 1.1, pt = shade(tint, ar.range(0.62, 0.9), ar.range(0.35, 0.8));
      for (const [ox, oz, sw, sd] of [[0, top.d / 2, top.w, pw], [0, -top.d / 2, top.w, pw], [top.w / 2, 0, pw, top.d], [-top.w / 2, 0, pw, top.d]]) {
        const p = boxTinted(sw, ph, sd, pt);
        p.translate(cx + ox, h + 1.4 + ph / 2 - 0.7, cz + oz);
        propGeos.push(p);
      }
    }
    // Rooftop clutter (never on the shooter's own roof — city.setVantage
    // furnishes that one, relative to where he actually stands).
    // ⚠ `opts.capped` means this lot sits inside the sightline cone: its height
    // was chosen to pass under the shot, and the 4.5 m of headroom capAt leaves
    // is already partly spent on the near/far slope across the footprint. Those
    // roofs get flat dressing only — nothing that raises the silhouette.
    if (!opts.noParapet) roofClutter(cx, cz, top.w, top.d, h, k, ar, !!opts.capped);
    city.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cx, cz, w, d, k, style: si });
    return city.colliders[city.colliders.length - 1];
  }

  // a spot on the roof, in the ring between the keep-out and the parapet
  function roofSpot(rr, w, d, m) {
    for (let i = 0; i < 8; i++) {
      const x = rr.range(-w / 2 + m + 0.8, w / 2 - m - 0.8), z = rr.range(-d / 2 + m + 0.8, d / 2 - m - 0.8);
      if (Math.hypot(x, z) > ROOF_KEEPOUT + m) return [x, z];
    }
    return null;
  }

  function roofClutter(cx, cz, w, d, h, k, rr, capped) {
    const y = h + 1.4;
    const put = (g, x, z) => { g.translate(cx + x, 0, cz + z); propGeos.push(g); };
    // Flat dressing — safe on every roof including the corridor's low-rises. Two
    // triangles each: a roof is only ever seen from above in this game, so a box
    // costs six times what a lid is worth.
    const lid = (sw, sd, tint, x, z, yy) => {
      const g = paintGeo(new T.PlaneGeometry(sw, sd), tint);
      g.rotateX(-Math.PI / 2); g.translate(cx + x, yy, cz + z);
      propGeos.push(g);
    };
    const flats = rr.int(2, capped ? 5 : 4);
    for (let i = 0; i < flats; i++) {
      const p = roofSpot(rr, w, d, 2.2); if (!p) continue;
      const pick = rr();
      if (pick < 0.34) {                                   // skylight
        lid(rr.range(2.2, 4.4), rr.range(1.6, 3.2), jitHSL(rr, 0.55, 0.16, 0.62, 0.03, 0.06, 0.08), p[0], p[1], y + 0.06);
      } else if (pick < 0.62) {                            // solar array / roof garden
        lid(rr.range(3, 6), rr.range(2, 4), rr.chance(0.5)
          ? jitHSL(rr, 0.62, 0.40, 0.20, 0.03, 0.08, 0.05)
          : jitHSL(rr, 0.28, 0.35, 0.30, 0.04, 0.08, 0.06), p[0], p[1], y + 0.05);
      } else if (pick < 0.84) {                            // roof hatch
        const g = boxTinted(1.4, 0.3, 1.2, jitHSL(rr, 0.03, 0.35, 0.28));
        g.translate(cx + p[0], y + 0.15, cz + p[1]); propGeos.push(g);
      } else {                                             // patched membrane
        lid(rr.range(3, 7), rr.range(3, 6), jitHSL(rr, 0.08, 0.12, 0.24, 0.02, 0.05, 0.06), p[0], p[1], y + 0.04);
      }
    }
    if (capped || h <= 12) return;
    if (k === 'old' && rr.chance(0.45)) {                        // hipped cap on a low-rise
      const ph = rr.range(1.8, 3.2);
      const g = paintGeo(new T.ConeGeometry(1, ph, 4), jitHSL(rr, 0.04, 0.36, 0.22, 0.03, 0.10, 0.06));
      g.rotateY(Math.PI / 4); g.scale(w * 0.72, 1, d * 0.72);
      g.translate(cx, y + ph / 2, cz);
      propGeos.push(g);
    }
    if (!nearAction(cx, cz)) return;
    // anything that stands up, only on roofs the corridor cannot see and the
    // player is close enough to resolve
    const n = rr.int(1, 2);
    for (let i = 0; i < n; i++) {
      const pick = rr();
      if (pick < 0.32) {                                   // AC / plant box
        const bw = rr.range(2, 5), bh = rr.range(1.4, 2.8), bd = rr.range(2, 4.5);
        const p = roofSpot(rr, w, d, Math.max(bw, bd) / 2); if (!p) continue;
        const g = boxTinted(bw, bh, bd, jitHSL(rr, rr.chance(0.5) ? 0.58 : 0.10, 0.12, 0.42, 0.04, 0.07, 0.10));
        put(g.translate(0, y + bh / 2, 0), p[0], p[1]);
      } else if (pick < 0.52) {                            // duct run + elbow
        const L = rr.range(4, 9), dr = rr.range(0.5, 0.8);
        const p = roofSpot(rr, w, d, L / 2); if (!p) continue;
        const t = jitHSL(rr, 0.10, 0.10, 0.52, 0.03, 0.05, 0.08);
        const a = boxTinted(L, dr * 2, dr * 2, t); a.translate(cx + p[0], y + 1.1, cz + p[1]); propGeos.push(a);
        const b2 = boxTinted(dr * 2, 2.2, dr * 2, t); b2.translate(cx + p[0] + L / 2 - dr, y + 1.1, cz + p[1]); propGeos.push(b2);
      } else if (pick < 0.70) {                            // stairwell / lift hut
        const bw = rr.range(3, 5), bh = rr.range(2.4, 3.6), bd = rr.range(3, 4.5);
        const p = roofSpot(rr, w, d, Math.max(bw, bd) / 2); if (!p) continue;
        const g = boxTinted(bw, bh, bd, shade(tintOf(rr, PALETTE[k] || PALETTE.mid), 0.9, 0.8));
        put(g.translate(0, y + bh / 2, 0), p[0], p[1]);
        const cap = boxTinted(bw + 0.5, 0.25, bd + 0.5, jitHSL(rr, 0.07, 0.14, 0.18));
        cap.translate(cx + p[0], y + bh + 0.12, cz + p[1]); propGeos.push(cap);
      } else if (pick < 0.84) {                            // vent stacks
        const p = roofSpot(rr, w, d, 1.2); if (!p) continue;
        const t = jitHSL(rr, 0.08, 0.08, 0.44, 0.03, 0.05, 0.10);
        for (let j = 0; j < rr.int(2, 3); j++) {
          const vh = rr.range(1, 2.4);
          const g = cylTinted(0.22, 0.26, vh, 4, t);
          g.translate(cx + p[0] + j * 0.9 - 1, y + vh / 2, cz + p[1] + rr.range(-0.6, 0.6));
          propGeos.push(g);
        }
      } else {                                             // satellite dish
        const p = roofSpot(rr, w, d, 1.6); if (!p) continue;
        const t = jitHSL(rr, 0.10, 0.05, 0.66, 0.02, 0.04, 0.06);
        const dish = cylTinted(1.25, 1.25, 0.18, 7, t);
        dish.rotateX(rr.range(0.5, 0.9)); dish.translate(cx + p[0], y + 1.5, cz + p[1]);
        propGeos.push(dish);
        const mast = cylTinted(0.12, 0.14, 1.5, 4, t);
        mast.translate(cx + p[0], y + 0.75, cz + p[1]); propGeos.push(mast);
      }
    }
    if (h > 18 && rr.chance(0.26)) {                       // water tank on legs
      const p = roofSpot(rr, w, d, 2.2);
      if (p) {
        const t = jitHSL(rr, 0.07, 0.36, 0.26, 0.02, 0.08, 0.06);
        const tank = cylTinted(2, 2, 4, 6, t);
        tank.translate(cx + p[0], y + 3.2, cz + p[1]); propGeos.push(tank);
        const cone = paintGeo(new T.ConeGeometry(2.2, 1.1, 6), jitHSL(rr, 0.05, 0.30, 0.20));
        cone.translate(cx + p[0], y + 5.7, cz + p[1]); propGeos.push(cone);
      }
    }
    if (k === 'down' && h > 70 && rr.chance(0.5)) {              // mast + aircraft light
      const p = roofSpot(rr, w, d, 1.0);
      if (p) {
        const mh = rr.range(6, 13);
        const mast = cylTinted(0.10, 0.16, mh, 4, hsl(0.05, 0.10, 0.34));
        mast.translate(cx + p[0], y + mh / 2, cz + p[1]); propGeos.push(mast);
        const lamp = boxTinted(0.5, 0.5, 0.5, hsl(0.99, 0.75, 0.42));
        lamp.translate(cx + p[0], y + mh, cz + p[1]); propGeos.push(lamp);
      }
    }
  }

  for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
    const k = kind[by * grid + bx];
    const [cx, cz] = blockPos(bx, by);
    const rr = rng(spec.seed + ':' + bx + ':' + by);
    // walk loop around this block's sidewalk (every block, incl. the plaza)
    const s = block / 2 + CITY.sidewalk / 2;
    const loop = [
      new T.Vector3(cx - s, 0, cz - s), new T.Vector3(cx + s, 0, cz - s),
      new T.Vector3(cx + s, 0, cz + s), new T.Vector3(cx - s, 0, cz + s),
    ];
    city.walkLoops.push(loop);
    if (k === 'plaza') city.plazaLoop = loop;
    if (k === 'park' || k === 'plaza') continue;

    if (k === 'vantage') {           // the perch: one solid tower, height as briefed
      const b = addBuilding(cx, cz, PERCH_W, PERCH_W, perch.h, 'mid', rr, { noParapet: true, noSetback: true });
      city.vantageB = b;
      continue;
    }
    const [hmin, hmax] = heights[k];
    // subdivide the block 1×1, 1×2 or 2×2
    const split = k === 'old' ? 2 : rr.chance(0.4) ? 2 : 1;
    const sub = block / split;
    for (let sy = 0; sy < split; sy++) for (let sx = 0; sx < split; sx++) {
      if (k !== 'down' && rr.chance(0.08)) continue;    // gap lot
      const w = rr.range(sub * 0.55, sub * 0.86), d = rr.range(sub * 0.55, sub * 0.86);
      let h = rr.range(hmin, hmax) * (k === 'down' && bx === Math.floor(grid / 2) ? 1.15 : 1);
      const ox = (sx - (split - 1) / 2) * sub, oz = (sy - (split - 1) / 2) * sub;
      // Inside the sightline cone the block is a LOW-RISE strip, not a hole:
      // warehouses, market halls, parking decks. The city stays a city; the
      // shot stays open.
      const cap = capAt(cx + ox, cz + oz, w, d);
      if (cap < Infinity) {
        if (cap < 2.5) continue;                       // right against the zone: open lot
        h = Math.min(h, Math.max(3, cap));
      }
      addBuilding(cx + ox, cz + oz, w, d, h, k, rr, { capped: cap < Infinity });
    }
  }

  // ── ground: one painted plane ──
  // Painted AFTER the buildings so it can read `city.colliders`: forecourts and
  // parking bays go in the gaps between the towers, and every building gets a
  // contact shadow so it sits on the street instead of hovering over it.
  const roadC = (i) => i * cell - half;         // true centreline of road ring i
  const px = LITE ? 1024 : 2048;
  const groundTex = canvasTex(px, px, (g, W) => {
    const sc = W / extent;                      // px per metre
    const M = (wx) => (wx + half) * sc;
    const rg = rng(spec.seed + ':ground');
    const P = (m) => m * sc;
    g.fillStyle = '#20242a'; g.fillRect(0, 0, W, W);        // asphalt base
    // carriageway wear: a lighter worn strip down each lane, patches and repairs
    for (let i = 0; i <= grid; i++) {
      const c = roadC(i);
      for (const off of [-1.9, 1.9]) {
        g.fillStyle = 'rgba(255,250,235,0.045)';
        g.fillRect(M(c + off) - P(1.3), 0, P(2.6), W);
        g.fillRect(0, M(c + off) - P(1.3), W, P(2.6));
      }
      for (let j = 0; j < 26; j++) {                        // asphalt patches
        const t = rg.range(-half, half), sz = rg.range(2, 6);
        g.fillStyle = `rgba(0,0,0,${(0.10 + rg() * 0.14).toFixed(3)})`;
        g.fillRect(M(c - road / 2 + rg.range(0, road)) , M(t), P(sz), P(sz * 0.6));
        g.fillRect(M(t), M(c - road / 2 + rg.range(0, road)), P(sz * 0.6), P(sz));
      }
    }
    for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
      const [cx, cz] = blockPos(bx, by);
      const k = kind[by * grid + bx];
      const rb = rng(spec.seed + ':g' + bx + ':' + by);
      const x0 = M(cx - block / 2), y0 = M(cz - block / 2), s = block * sc;
      const sw = CITY.sidewalk * sc;
      // sidewalk ring — a kerb line, a darker gutter and paving that varies block
      // to block, so the street stops reading as one printed texture
      g.fillStyle = ['#3d4249', '#454a51', '#4a4740', '#383d44'][rb.int(0, 3)];
      g.fillRect(x0 - sw, y0 - sw, s + sw * 2, s + sw * 2);
      g.fillStyle = 'rgba(0,0,0,0.30)';                     // gutter
      g.fillRect(x0 - sw, y0 - sw, s + sw * 2, P(0.7));
      g.fillRect(x0 - sw, y0 + s + sw - P(0.7), s + sw * 2, P(0.7));
      g.fillRect(x0 - sw, y0 - sw, P(0.7), s + sw * 2);
      g.fillRect(x0 + s + sw - P(0.7), y0 - sw, P(0.7), s + sw * 2);
      g.fillStyle = 'rgba(230,236,244,0.13)';               // kerb highlight
      g.fillRect(x0 - sw + P(0.7), y0 - sw + P(0.7), s + sw * 2 - P(1.4), P(0.35));
      g.fillRect(x0 - sw + P(0.7), y0 + s + sw - P(1.05), s + sw * 2 - P(1.4), P(0.35));
      // paving joints
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let t = 0; t < block + CITY.sidewalk * 2; t += 3.4) {
        g.fillRect(x0 - sw + P(t), y0 - sw, 1, sw); g.fillRect(x0 - sw + P(t), y0 + s, 1, sw);
        g.fillRect(x0 - sw, y0 - sw + P(t), sw, 1); g.fillRect(x0 + s, y0 - sw + P(t), sw, 1);
      }
      // block interior
      g.fillStyle = k === 'park' ? '#2e4a30' : k === 'plaza' ? '#4a4640'
        : ['#33373d', '#383c41', '#3a3730', '#2f343a'][rb.int(0, 3)];
      g.fillRect(x0, y0, s, s);
      if (k === 'park') {                       // paths
        g.strokeStyle = '#585043'; g.lineWidth = 2.2 * sc;
        g.beginPath(); g.moveTo(x0, y0 + s / 2); g.bezierCurveTo(x0 + s / 3, y0 + s / 4, x0 + s * 2 / 3, y0 + s * 3 / 4, x0 + s, y0 + s / 2); g.stroke();
        g.beginPath(); g.moveTo(x0 + s / 2, y0); g.bezierCurveTo(x0 + s / 4, y0 + s / 3, x0 + s * 3 / 4, y0 + s * 2 / 3, x0 + s / 2, y0 + s); g.stroke();
        g.fillStyle = '#26454f';                // pond
        g.beginPath(); g.ellipse(x0 + s * 0.72, y0 + s * 0.28, P(7), P(5), 0.4, 0, 7); g.fill();
        g.fillStyle = '#4a5a34';                // beds
        for (let i = 0; i < 5; i++) g.fillRect(x0 + rb.range(0.1, 0.8) * s, y0 + rb.range(0.1, 0.8) * s, P(rb.range(4, 9)), P(rb.range(3, 6)));
      } else if (k === 'plaza') {               // paving grid + circle motif
        g.fillStyle = 'rgba(0,0,0,0.10)';
        for (let t = 0; t < block; t += 4.2) { g.fillRect(x0 + P(t), y0, 1, s); g.fillRect(x0, y0 + P(t), s, 1); }
        g.strokeStyle = '#5a544a'; g.lineWidth = 1.4 * sc;
        for (let rr = 5; rr < block / 2; rr += 7) { g.beginPath(); g.arc(x0 + s / 2, y0 + s / 2, rr * sc, 0, 7); g.stroke(); }
      } else {
        // service yard / parking apron in the open part of the lot
        const lot = rb();
        if (lot < 0.42) {                       // marked parking bays along one edge
          const vert = rb.chance(0.5), n = 7;
          g.fillStyle = 'rgba(0,0,0,0.16)';
          g.fillRect(vert ? x0 : x0, y0, vert ? P(5.4) : s, vert ? s : P(5.4));
          g.fillStyle = 'rgba(226,220,180,0.34)';
          for (let i = 0; i <= n; i++) {
            const t = i / n * block;
            if (vert) g.fillRect(x0, y0 + P(t), P(5.4), Math.max(1, P(0.22)));
            else g.fillRect(x0 + P(t), y0, Math.max(1, P(0.22)), P(5.4));
          }
        } else if (lot < 0.68) {                // concrete forecourt
          g.fillStyle = 'rgba(210,205,190,0.13)';
          g.fillRect(x0 + P(rb.range(2, 9)), y0 + P(rb.range(2, 9)), P(rb.range(10, 22)), P(rb.range(8, 18)));
        }
      }
    }
    // contact shadow + a scuffed apron under every building
    for (const c of city.colliders) {
      g.fillStyle = 'rgba(0,0,0,0.34)';
      g.fillRect(M(c.minX) - P(1.1), M(c.minZ) - P(1.1), P(c.w + 2.2), P(c.d + 2.2));
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(M(c.minX) - P(2.4), M(c.minZ) - P(2.4), P(c.w + 4.8), P(c.d + 4.8));
    }
    // lane markings, stop lines, crosswalks
    for (let i = 0; i <= grid; i++) {
      const c = roadC(i);
      g.strokeStyle = '#8a8468'; g.lineWidth = Math.max(1, P(0.3));
      g.setLineDash([P(3.2), P(4.2)]);
      g.beginPath(); g.moveTo(M(c), 0); g.lineTo(M(c), W); g.stroke();
      g.beginPath(); g.moveTo(0, M(c)); g.lineTo(W, M(c)); g.stroke();
      g.setLineDash([]);
      for (let j = 0; j <= grid; j++) {
        const c2 = roadC(j);
        const stripe = 'rgba(232,228,206,0.46)';
        // four crosswalk arms around the intersection at (c, c2)
        for (const s2 of [-1, 1]) {
          g.fillStyle = stripe;
          for (let b = -3; b <= 3; b++) {       // bars run with the traffic
            const o = b * 1.55;
            g.fillRect(M(c + o) - P(0.45), M(c2 + s2 * (road / 2 + 2.4)) - P(1.7), P(0.9), P(3.4));
            g.fillRect(M(c + s2 * (road / 2 + 2.4)) - P(1.7), M(c2 + o) - P(0.45), P(3.4), P(0.9));
          }
          g.fillStyle = 'rgba(232,228,206,0.38)';   // stop line behind each crossing
          g.fillRect(M(c + (s2 < 0 ? -road / 2 : 0.4)) , M(c2 + s2 * (road / 2 + 5.2)) - P(0.25), P(road / 2 - 0.4), P(0.5));
          g.fillRect(M(c + s2 * (road / 2 + 5.2)) - P(0.25), M(c2 + (s2 < 0 ? -road / 2 : 0.4)), P(0.5), P(road / 2 - 0.4));
        }
      }
    }
  });
  groundTex.anisotropy = 4;
  const ground = new T.Mesh(
    new T.PlaneGeometry(extent + 800, extent + 800),
    new T.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 })
  );
  // stretch the painted area only over the city; outside repeats edge pixels
  ground.rotation.x = -Math.PI / 2;
  ground.scale.setScalar(1);
  ground.geometry.attributes.uv.array.forEach((v, i, a) => {
    a[i] = (v - 0.5) * ((extent + 800) / extent) + 0.5;
  });
  groundTex.wrapS = groundTex.wrapT = T.ClampToEdgeWrapping;
  group.add(ground);

  const facadeMats = FACADE_STYLES.map((st, i) => {
    const { map, emissive } = facadeTex(i * 999 + (spec.seed ? hash32(String(spec.seed)) : 0), st, time.litP);
    return new T.MeshStandardMaterial({
      map, emissiveMap: emissive, emissive: 0xffcf9a, emissiveIntensity: time.em,
      vertexColors: true, roughness: 0.85, metalness: 0.08,
    });
  });
  geosByStyle.forEach((geos, i) => {
    if (!geos.length) return;
    const m = new T.Mesh(BGU.mergeGeometries(geos), facadeMats[i]);
    m.name = 'facade' + i;
    group.add(m);
  });
  const darkMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  if (roofGeos.length) { const m = new T.Mesh(BGU.mergeGeometries(roofGeos), darkMat); m.name = 'roofs'; group.add(m); }
  if (propGeos.length) { const m = new T.Mesh(BGU.mergeGeometries(propGeos), darkMat); m.name = 'roofprops'; group.add(m); }

  // ── park furniture ──
  const treeGeos = [], trunkGeos = [];
  for (const [pbx, pby] of PARKS) {
    const [cx, cz] = blockPos(pbx, pby);
    const rr = rng(spec.seed + ':park' + pbx + pby);
    for (let i = 0; i < 22; i++) {
      const x = cx + rr.range(-block / 2 + 3, block / 2 - 3), z = cz + rr.range(-block / 2 + 3, block / 2 - 3);
      const th = rr.range(3.5, 7);
      const crown = new T.IcosahedronGeometry(th * 0.42, 0);
      crown.scale(1, 1.25, 1); crown.translate(x, th * 0.85, z);
      const n = crown.attributes.position.count, cc = new Float32Array(n * 3);
      const gr = 0.22 + rr() * 0.2;
      for (let j = 0; j < n; j++) { cc[j * 3] = 0.14; cc[j * 3 + 1] = gr; cc[j * 3 + 2] = 0.12; }
      crown.setAttribute('color', new T.BufferAttribute(cc, 3));
      treeGeos.push(crown);
      const trunk = boxTinted(0.5, th * 0.6, 0.5, { r: 0.3, g: 0.22, b: 0.16 });
      trunk.translate(x, th * 0.3, z);
      trunkGeos.push(trunk);
    }
    for (let i = 0; i < 5; i++) {   // benches
      const x = cx + rr.range(-block / 3, block / 3), z = cz + rr.range(-block / 3, block / 3);
      const bench = boxTinted(2.2, 0.5, 0.7, { r: 0.42, g: 0.32, b: 0.2 });
      bench.translate(x, 0.25, z);
      trunkGeos.push(bench);
      city.parkBenches.push(new T.Vector3(x, 0.5, z));
    }
  }
  // plaza fountain + crowd points + benches (the kill zone furniture)
  {
    const [cx, cz] = blockPos(pz[0], pz[1]);
    const f = new T.CylinderGeometry(6, 7, 1.2, 14);
    const n = f.attributes.position.count, cc = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) { cc[j * 3] = 0.5; cc[j * 3 + 1] = 0.5; cc[j * 3 + 2] = 0.52; }
    f.setAttribute('color', new T.BufferAttribute(cc, 3));
    f.translate(cx, 0.6, cz);
    trunkGeos.push(f);
    const water = new T.Mesh(new T.CircleGeometry(5.4, 14),
      new T.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.2, metalness: 0.4 }));
    water.rotation.x = -Math.PI / 2; water.position.set(cx, 1.15, cz);
    group.add(water);
    const rp = rng(spec.seed + ':plaza');
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const rad = 12 + rp() * 8;
      city.plazaPts.push(new T.Vector3(cx + Math.cos(a) * rad, 0, cz + Math.sin(a) * rad));
    }
    for (let i = 0; i < 6; i++) {          // plaza benches — bench marks sit in view
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * 17, z = cz + Math.sin(a) * 17;
      const bench = boxTinted(2.2, 0.5, 0.7, { r: 0.42, g: 0.32, b: 0.2 });
      bench.translate(x, 0.25, z);
      trunkGeos.push(bench);
      city.benches.push(new T.Vector3(x, 0.5, z));
    }
    city.plaza = new T.Vector3(cx, 0, cz);
    city.zone = new T.Vector3(cx, 0, cz);
    city.zoneR = zoneR;
  }
  if (treeGeos.length) {
    group.add(new T.Mesh(BGU.mergeGeometries(treeGeos), new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
    group.add(new T.Mesh(BGU.mergeGeometries(trunkGeos), darkMat));
  }

  // escape points: mid-road positions at city edge
  for (let i = 0; i < grid; i++) {
    const w = i * cell - half - road / 2;
    city.escapePts.push(new T.Vector3(w, 0, -half - 20), new T.Vector3(w, 0, half + 20),
      new T.Vector3(-half - 20, 0, w), new T.Vector3(half + 20, 0, w));
  }

  // ── signage, at three depths ───────────────────────────────────────────────
  // Tower signs high on downtown, box signs on midtown offices, shopfront signs
  // over the ground floor everywhere. All sixteen words live in ONE atlas and
  // every sign in ONE merged mesh: twelve separate sign meshes used to be twelve
  // draw calls. A flicker writes that sign's vertex colours to black, which is
  // exactly what a dead tube looks like.
  const SIGN_WORDS = ['NOVA', 'VERTEX', 'HOTEL', 'ORION', 'KOI', 'BANK', 'LUX', 'ZENITH',
    'PULSE', 'ECHO', 'MERIDIAN', 'ATLAS', 'RIVIERA', 'CAFE', 'LOANS', '24H'];
  const SIGN_COLS = ['#ff4d6d', '#3dd6ff', '#ffd23d', '#7dff5a', '#c86bff', '#ff9a3d', '#ff6fae', '#5ad8c0'];
  const signAtlas = canvasTex(1024, 512, (g) => {
    for (let i = 0; i < 16; i++) {
      const ax = (i % 4) * 256, ay = Math.floor(i / 4) * 128;
      g.fillStyle = '#07080c'; g.fillRect(ax, ay, 256, 128);
      const col = SIGN_COLS[i % SIGN_COLS.length];
      g.font = 'bold 72px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = col; g.shadowBlur = 18; g.fillStyle = col;
      g.fillText(SIGN_WORDS[i], ax + 128, ay + 64, 232);
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 3;
      g.strokeRect(ax + 5, ay + 5, 246, 118);
    }
  });
  const signGeos = [];
  const addSign = (idx, x, y, z, yaw, w, h, spin) => {
    const gq = new T.PlaneGeometry(w, h);
    const uv = gq.attributes.uv;
    const u0 = (idx % 4) / 4, v0 = 1 - (Math.floor(idx / 4) + 1) / 4;
    for (let k = 0; k < uv.count; k++) {
      let u = uv.getX(k), v = uv.getY(k);
      if (spin) { const t = u; u = 1 - v; v = t; }   // stand the word on end
      uv.setXY(k, u0 + u / 4, v0 + v / 4);
    }
    gq.rotateY(yaw); gq.translate(x, y, z);
    signGeos.push(paintGeo(gq, { r: 1, g: 1, b: 1 }));
  };
  // a face of `b` that looks at open street, as [x, z, yaw]
  const faceOf = (b, side, out) => side === 0 ? [b.cx + b.w / 2 + out, b.cz, Math.PI / 2]
    : side === 1 ? [b.cx - b.w / 2 - out, b.cz, -Math.PI / 2]
      : side === 2 ? [b.cx, b.cz + b.d / 2 + out, 0] : [b.cx, b.cz - b.d / 2 - out, Math.PI];
  {
    const budget = LITE ? [6, 8, 16] : [22, 30, 62];
    const pickN = (arr, n) => { const o = []; for (let i = 0; i < n && arr.length; i++) o.push(arr[Math.floor(r() * arr.length)]); return o; };
    let w = 0;
    for (const b of pickN(city.colliders.filter(c => c.k === 'down' && c.h > 50), budget[0])) {
      const [x, z, yaw] = faceOf(b, r.int(0, 3), 0.35);
      addSign(w++ % 16, x, r.range(0.55, 0.82) * b.h, z, yaw, 4.6, 24, true);
    }
    for (const b of pickN(city.colliders.filter(c => c.h > 18 && c.h <= 50), budget[1])) {
      const [x, z, yaw] = faceOf(b, r.int(0, 3), 0.35);
      addSign(w++ % 16, x, r.range(0.55, 0.85) * b.h, z, yaw, Math.min(b.w, b.d) * 0.6, 4.2, false);
    }
    for (const b of pickN(city.colliders.filter(c => c.h > 6), budget[2])) {
      const [x, z, yaw] = faceOf(b, r.int(0, 3), 0.35);
      addSign(w++ % 16, x, 5.4, z, yaw, Math.min(b.w, b.d) * 0.5, 2.1, false);
    }
  }
  if (signGeos.length) {
    const mesh = new T.Mesh(BGU.mergeGeometries(signGeos),
      new T.MeshBasicMaterial({ map: signAtlas, fog: true, vertexColors: true }));
    group.add(mesh);
    city.neon = { mesh, n: signGeos.length };
  }

  // ── lit ground-floor retail ────────────────────────────────────────────────
  // The band that makes a street read as a street after dark: shopfront glass
  // wrapped round the base of the low and mid-rise stock.
  const retailTex = canvasTex(64, 32, (g) => {
    g.fillStyle = '#12100e'; g.fillRect(0, 0, 64, 32);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgb(${210 + i * 8},${170 + i * 10},${110 + i * 12})`;
      g.fillRect(2 + i * 16, 6, 12, 22);
    }
    g.fillStyle = '#2a2420'; g.fillRect(0, 0, 64, 5);
  });
  retailTex.wrapS = retailTex.wrapT = T.RepeatWrapping;
  {
    const bandGeos = [];
    const rb = rng(spec.seed + ':retail');
    for (const b of city.colliders) {
      if (b === city.vantageB || b.h < 8 || rb.chance(0.45)) continue;
      const sides = rb.chance(0.35) ? [0, 1, 2, 3] : [rb.int(0, 3), rb.int(0, 3)];
      const tint = jitHSL(rb, 0.09, 0.30, 0.62, 0.06, 0.12, 0.10);
      for (const s of [...new Set(sides)]) {
        const [x, z, yaw] = faceOf(b, s, 0.22);
        const wid = (s < 2 ? b.d : b.w) * 0.92;
        const gq = new T.PlaneGeometry(wid, 2.9);
        const uv = gq.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * wid / 3.6, uv.getY(k));
        gq.rotateY(yaw); gq.translate(x, 2.6, z);
        bandGeos.push(paintGeo(gq, tint));
      }
    }
    if (bandGeos.length) group.add(new T.Mesh(BGU.mergeGeometries(bandGeos),
      new T.MeshStandardMaterial({
        map: retailTex, emissiveMap: retailTex, emissive: 0xffd2a0,
        emissiveIntensity: Math.max(0.12, time.em * 1.15), vertexColors: true, roughness: 0.75,
      })));
  }

  // ── street furniture ───────────────────────────────────────────────────────
  // Lamp posts, kerbside parking, bins and planters. ⚠ Anything that stands up
  // is kept OUT of the sightline cone and away from the kill zone: a 6 m lamp
  // head on the corridor is an occluder the ballistics know nothing about.
  {
    const rs = rng(spec.seed + ':street');
    const propG = [];
    const clearOf = (x, z) => nearAction(x, z) && capAt(x, z, 0, 0) === Infinity &&
      Math.hypot(x - zx, z - zz) > zoneR + 12;
    const kerb = road / 2 - 2.7;                  // sidewalk, just behind the kerb
    for (let i = 0; i <= grid; i++) {
      const c = roadC(i);
      for (let t = -half + 24; t < half; t += 52) for (const s of [-1, 1]) {
        for (const [x, z, horiz] of [[c + s * kerb, t, false], [t, c + s * kerb, true]]) {
          if (!clearOf(x, z)) continue;
          const pole = cylTinted(0.11, 0.15, 6.2, 3, hsl(0.58, 0.07, 0.33));
          pole.translate(x, 3.1, z); propG.push(pole);
          const head = boxTinted(horiz ? 0.5 : 1.5, 0.28, horiz ? 1.5 : 0.5, hsl(0.11, 0.18, 0.52));
          head.translate(x - (horiz ? 0 : s * 0.6), 6.25, z - (horiz ? s * 0.6 : 0));
          propG.push(head);
        }
      }
      // parked cars along the kerb
      for (let t = -half + 12; t < half; t += 26) for (const s of [-1, 1]) {
        if (!rs.chance(0.5)) continue;
        for (const [x, z, horiz] of [[c + s * 2.9, t, false], [t, c + s * 2.9, true]]) {
          if (!clearOf(x, z)) continue;
          const tint = jitHSL(rs, [0.02, 0.58, 0.12, 0.33, 0.0][rs.int(0, 4)], rs.range(0.05, 0.5), rs.range(0.18, 0.62), 0.03, 0.1, 0.08);
          const body = boxTinted(horiz ? 4.4 : 1.9, 1.05, horiz ? 1.9 : 4.4, tint);
          body.translate(x, 0.7, z); propG.push(body);
          const cab = boxTinted(horiz ? 2.2 : 1.7, 0.8, horiz ? 1.7 : 2.2, shade(tint, 0.7, 0.8));
          cab.translate(x, 1.6, z); propG.push(cab);
        }
      }
    }
    // bins and planters on the sidewalk corners — low enough to stand anywhere
    for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
      const [cx, cz] = blockPos(bx, by);
      const e = block / 2 + CITY.sidewalk * 0.55;
      for (const [ox, oz] of [[-e, -e], [e, -e], [-e, e], [e, e]]) {
        if (!rs.chance(0.5) || !nearAction(cx + ox, cz + oz)) continue;
        const g2 = rs.chance(0.5)
          ? boxTinted(0.7, 0.9, 0.7, jitHSL(rs, 0.33, 0.30, 0.22))
          : cylTinted(0.55, 0.62, 0.8, 6, jitHSL(rs, 0.07, 0.30, 0.30));
        g2.translate(cx + ox, 0.45, cz + oz); propG.push(g2);
      }
    }
    if (propG.length) { const m = new T.Mesh(BGU.mergeGeometries(propG), darkMat); m.name = 'street'; group.add(m); }
  }

  // ── street lamps (night glow points) ──
  if (spec.time === 'night' || spec.time === 'dusk') {
    const pts = [];
    for (let i = 0; i <= grid; i++) {
      const w = roadC(i);
      for (let s = -half; s < half; s += 34) {
        pts.push(w - 4.3, 6.4, s, w + 4.3, 6.4, s, s, 6.4, w - 4.3, s, 6.4, w + 4.3);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pts), 3));
    const glowTex = canvasTex(64, 64, (gg) => {
      const gr = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,210,140,0.9)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
    });
    group.add(new T.Points(g, new T.PointsMaterial({
      map: glowTex, size: spec.time === 'night' ? 9 : 5, transparent: true, depthWrite: false,
      blending: T.AdditiveBlending, color: 0xffc880, opacity: spec.time === 'night' ? 0.9 : 0.4,
    })));
  }

  // ── traffic ──
  const carGeo = (() => {
    const body = new T.BoxGeometry(2, 1.1, 4.6); body.translate(0, 0.75, 0);
    const cab = new T.BoxGeometry(1.8, 0.85, 2.3); cab.translate(0, 1.65, -0.2);
    return BGU.mergeGeometries([body, cab]);
  })();
  const carN = LITE ? 24 : 64;
  const cars = new T.InstancedMesh(carGeo, new T.MeshStandardMaterial({ roughness: 0.5, metalness: 0.4 }), carN);
  const carCols = [0xb8bcc2, 0x37414e, 0x71341f, 0x2c5b38, 0x8d8339, 0x203040, 0xa04040, 0xd0d0d0];
  const carState = [];
  const dummy = new T.Object3D();
  for (let i = 0; i < carN; i++) {
    const horiz = r.chance(0.5);
    const lane = r.int(0, grid);
    const side = r.chance(0.5) ? 1.9 : -1.9;     // which half of the road
    // roadC, not `lane*cell - half - road/2`: that is the KERB line, and half the
    // traffic in the city was driving up the sidewalk and through the front lots.
    const lanePos = lane * cell - half + side;
    const dir = side > 0 ? 1 : -1;                // one way per lane, so no head-ons
    carState.push({ horiz, lanePos, dir, t: r.range(-half, half), speed: r.range(9, 16) });
    cars.setColorAt(i, new T.Color(carCols[i % carCols.length]));
  }
  cars.instanceMatrix.setUsage(T.DynamicDrawUsage);
  group.add(cars);

  // ── birds ──
  const birds = [];
  if (!LITE) {
    const btex = canvasTex(32, 32, (g) => {
      g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath();
      g.moveTo(2, 20); g.quadraticCurveTo(10, 8, 16, 18); g.quadraticCurveTo(22, 8, 30, 20); g.stroke();
    });
    for (let f = 0; f < 2; f++) {
      const cx = r.range(-200, 200), cz = r.range(-200, 200), cy = r.range(70, 130), rad = r.range(40, 90);
      for (let i = 0; i < 7; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: btex, transparent: true, depthWrite: false }));
        s.scale.set(3.4, 3.4, 1);
        birds.push({ s, cx, cz, cy, rad, a: r() * 6.28, sp: r.range(0.25, 0.4), off: i * 0.5 });
        group.add(s);
      }
    }
  }

  // ── rain ──
  let rain = null;
  if (spec.time === 'rain') {
    const n = LITE ? 500 : 1600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) p.set([r.range(-60, 60), r.range(0, 60), r.range(-60, 60)], i * 3);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    rain = new T.Points(g, new T.PointsMaterial({ color: 0x9fb4c4, size: 0.14, transparent: true, opacity: 0.65 }));
    group.add(rain);
  }

  // ── office room bays (missions carve these) ──
  const roomMats = {
    wall: new T.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.9 }),
    floor: new T.MeshStandardMaterial({ color: 0x6a5240, roughness: 0.9 }),
    desk: new T.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.8 }),
    lightOn: new T.MeshBasicMaterial({ color: 0xffe6b8 }),
    glass: new T.MeshPhysicalMaterial({
      color: 0x9fc4d8, transparent: true, opacity: 0.22, roughness: 0.05,
      metalness: 0.1, side: T.DoubleSide, depthWrite: false,
    }),
  };
  // build a lit room bay on `bld`'s face pointing toward `toward`, at height y
  city.addRoom = (bld, toward, y) => {
    const W = 7.5, H = 3.4, D = 5.5;
    const rgrp = new T.Group();
    // face direction: pick the wall (±x / ±z) most facing `toward`
    const dx = toward.x - bld.cx, dz = toward.z - bld.cz;
    let nx = 0, nz = 0, fx = bld.cx, fz = bld.cz;
    if (Math.abs(dx) * bld.d > Math.abs(dz) * bld.w) { nx = Math.sign(dx); fx += nx * bld.w / 2; }
    else { nz = Math.sign(dz); fz += nz * bld.d / 2; }
    y = Math.min(y, bld.h - H - 2);
    const yaw = Math.atan2(nx, nz);
    rgrp.position.set(fx, y, fz);
    rgrp.rotation.y = yaw;
    // shell: floor, ceiling, back wall, two side walls (opening faces +z local)
    const mk = (g, mat, x, yy, z) => { const m = new T.Mesh(g, mat); m.position.set(x, yy, z); rgrp.add(m); return m; };
    mk(new T.BoxGeometry(W, 0.25, D), roomMats.floor, 0, 0, -D / 2 + 0.4);
    mk(new T.BoxGeometry(W, 0.25, D), roomMats.wall, 0, H, -D / 2 + 0.4);
    mk(new T.BoxGeometry(W, H, 0.25), roomMats.wall, 0, H / 2, -D + 0.4);
    mk(new T.BoxGeometry(0.25, H, D), roomMats.wall, -W / 2, H / 2, -D / 2 + 0.4);
    mk(new T.BoxGeometry(0.25, H, D), roomMats.wall, W / 2, H / 2, -D / 2 + 0.4);
    mk(new T.BoxGeometry(1.6, 0.08, 1.1), roomMats.lightOn, 0, H - 0.15, -D / 2);   // ceiling light
    mk(new T.BoxGeometry(2.6, 0.12, 1.3), roomMats.desk, -1.6, 1.0, -D / 2 - 0.6);  // desk top
    mk(new T.BoxGeometry(2.4, 0.9, 1.1), roomMats.desk, -1.6, 0.5, -D / 2 - 0.6);
    mk(new T.BoxGeometry(1.1, 1.9, 0.5), roomMats.desk, 2.6, 0.95, -D + 0.85);      // cabinet
    const pl = new T.PointLight(0xffd9a0, 14, 18, 1.6);
    pl.position.set(0, H - 0.5, -D / 2); rgrp.add(pl);
    // glass pane over the opening
    const pane = new T.Mesh(new T.PlaneGeometry(W - 0.6, H - 0.5), roomMats.glass);
    pane.position.set(0, H / 2, 0.42); rgrp.add(pane);
    group.add(rgrp);
    // world-space glass record for ballistics: plane point+normal+bounds
    const nrm = new T.Vector3(nx, 0, nz);
    const centre = new T.Vector3(fx, y + H / 2, fz).addScaledVector(nrm, 0.42);
    const rec = { centre, nrm, w: W - 0.6, h: H - 0.5, yaw, pane, broken: false, group: rgrp };
    city.glass.push(rec);
    // occupant anchor (inside, on the desk side)
    const inside = new T.Vector3(fx, y, fz).addScaledVector(nrm, -D / 2 - 0.2);
    // pass-through volume so rounds reach the occupant behind the facade AABB
    const hx = fx - nrm.x * D / 2, hz = fz - nrm.z * D / 2;
    city.holes.push({
      minX: hx - (nx ? D / 2 + 0.8 : W / 2), maxX: hx + (nx ? D / 2 + 0.8 : W / 2),
      minZ: hz - (nz ? D / 2 + 0.8 : W / 2), maxZ: hz + (nz ? D / 2 + 0.8 : W / 2),
      minY: y - 0.3, maxY: y + H + 0.3,
    });
    const room = { pos: inside, yaw: yaw + Math.PI, glass: rec, group: rgrp, y };
    city.rooms.push(room);
    return room;
  };

  // ── vantage rooftop ── (`pos` = where the shooter STANDS, at roof-top height)
  // `b` = the perch collider, so the roof can be furnished to its real footprint:
  // the shooter WALKS this roof (js/walk.js), so it needs an edge to walk to.
  city.setVantage = (pos, faceYaw, b) => {
    const vg = new T.Group();
    vg.position.set(pos.x, 0, pos.z);
    const y = pos.y;
    const fx2 = Math.sin(faceYaw), fz2 = Math.cos(faceYaw);
    const mk = (g, c, x, yy, z) => {
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ color: c, roughness: 0.95 }));
      m.position.set(x, yy, z); vg.add(m); return m;
    };
    // The stand point is only ~3 m from the lip, so ANY prop placed relative to
    // it can hang out over thin air — a 9 m gravel pad centred here overhung the
    // edge by 1.5 m and sat squarely in the shooter's downward sightline once he
    // could walk out and look. Everything here is clamped inside the footprint.
    const inRoof = (wx, wz, m) => !b ? [wx, wz] : [
      Math.min(b.maxX - m, Math.max(b.minX + m, wx)),
      Math.min(b.maxZ - m, Math.max(b.minZ + m, wz)),
    ];
    const place = (mesh, m) => {                     // mesh is in vg space (vg at pos)
      const [wx, wz] = inRoof(pos.x + mesh.position.x, pos.z + mesh.position.z, m);
      mesh.position.x = wx - pos.x; mesh.position.z = wz - pos.z;
      return mesh;
    };
    // gravel roof deck — the whole roof, so it can never overhang
    if (b) {
      const deck = new T.Mesh(new T.BoxGeometry(b.w - 0.1, 0.1, b.d - 0.1),
        new T.MeshStandardMaterial({ color: 0x53565d, roughness: 0.98 }));
      deck.position.set(b.cx - pos.x, y + 0.05, b.cz - pos.z);
      vg.add(deck);
    }
    // shooting mat + sandbag rest, ankle height: put bags anywhere near the eye
    // (roof + 1.6 m) and they become a wall filling the entire scope
    const mat = mk(new T.BoxGeometry(2.2, 0.04, 2.6), 0x3c4048, 0, y + 0.12, 0);
    mat.rotation.y = faceYaw;
    place(mat, 1.5);
    const bag = mk(new T.BoxGeometry(1.6, 0.34, 0.55), 0x8a7850, fx2 * 1.7, y + 0.29, fz2 * 1.7);
    bag.rotation.y = faceYaw;
    place(bag, 1.0);
    const bag2 = mk(new T.BoxGeometry(1.2, 0.3, 0.5), 0x7d6c48, fx2 * 1.6 + fz2 * 0.75, y + 0.27, fz2 * 1.6 - fx2 * 0.75);
    bag2.rotation.y = faceYaw;
    place(bag2, 0.9);
    // A SOLID prop must sit at least its own radius (plus the walk margin) in
    // from the rim: the walker pushes out of it and is then clamped back onto
    // the roof, so a blocker that overlaps the walkable edge would trap him
    // inside itself, seeing through an AC unit.
    const AC_R = 1.9, ANT_R = 0.35, keepIn = (r) => r + MOVE.edge + 0.05;
    const ac = mk(new T.BoxGeometry(2.6, 1.6, 2.2), 0x5a5e67, -fx2 * 4.5 - 2.2, y + 0.8, -fz2 * 4.5 - 1.4);
    place(ac, keepIn(AC_R));
    const ant = mk(new T.CylinderGeometry(0.09, 0.12, 7, 6), 0x6a6e77, -fx2 * 4 + 2.6, y + 3.5, -fz2 * 4 + 1.8);
    place(ant, keepIn(ANT_R));
    // blockers are in WORLD space (vg is offset to the stand point)
    const W = (m, r, top) => ({ x: pos.x + m.position.x, z: pos.z + m.position.z, r, top });
    const blockers = [
      W(bag, 1.0, 0.34),          // step up onto the rest
      W(bag2, 0.8, 0.3),
      W(ac, AC_R, 1.6),           // walk around the AC unit
      W(ant, ANT_R, 7),
    ];

    // The coping: a low curb around the rim. It gives the roof an EDGE to toe —
    // step up onto it and there is nothing at all between you and the street
    // below. Deliberately ~0.3 m, not a 1.1 m parapet: a parapet three metres
    // ahead of the eye sits exactly on the line of a downward shot.
    // Its size comes from MOVE, because walk.js stands the shooter ON it: two
    // copies of these numbers is how the drawn roof and the walked roof drift
    // apart, which is the whole family of bugs this module keeps producing.
    if (b) {
      const cw = MOVE.copingW, ch = MOVE.coping, cy = y + ch / 2;
      const cop = new T.Group();
      const cmat = new T.MeshStandardMaterial({ color: 0x4c5057, roughness: 0.92 });
      for (const [ox, oz, sw, sd] of [
        [0, b.d / 2 - cw / 2, b.w, cw], [0, -b.d / 2 + cw / 2, b.w, cw],
        [b.w / 2 - cw / 2, 0, cw, b.d], [-b.w / 2 + cw / 2, 0, cw, b.d],
      ]) {
        const m = new T.Mesh(new T.BoxGeometry(sw, ch, sd), cmat);
        m.position.set(b.cx + ox, cy, b.cz + oz);
        cop.add(m);
      }
      group.add(cop);
    }
    group.add(vg);
    city.vantage = { pos: pos.clone(), yaw: faceYaw, group: vg, blockers, b: b || null };
  };

  // ── per-frame update ──
  let nt = 0;
  city.update = (dt, camera) => {
    // traffic
    for (let i = 0; i < carN; i++) {
      const c = carState[i];
      c.t += c.dir * c.speed * dt;
      if (c.t > half + 10) c.t = -half - 10;
      if (c.t < -half - 10) c.t = half + 10;
      if (c.horiz) { dummy.position.set(c.t, 0, c.lanePos); dummy.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { dummy.position.set(c.lanePos, 0, c.t); dummy.rotation.y = c.dir > 0 ? 0 : Math.PI; }
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
    }
    cars.instanceMatrix.needsUpdate = true;
    // birds
    for (const b of birds) {
      b.a += b.sp * dt;
      b.s.position.set(b.cx + Math.cos(b.a + b.off) * b.rad, b.cy + Math.sin(b.a * 2 + b.off) * 4, b.cz + Math.sin(b.a + b.off) * b.rad);
      const fl = 0.6 + Math.abs(Math.sin(b.a * 9 + b.off)) * 0.55;
      b.s.scale.set(3.4, 3.4 * fl, 1);
    }
    // clouds drift
    for (const c of clouds) { c.position.x += dt * 4; if (c.position.x > 2400) c.position.x = -2400; }
    // rain follows camera
    if (rain && camera) {
      rain.position.set(camera.position.x, camera.position.y - 30, camera.position.z);
      const p = rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let yy = p.getY(i) - dt * 42;
        if (yy < 0) yy = 60;
        p.setY(i, yy);
      }
      p.needsUpdate = true;
    }
    // neon flicker — one sign's four vertices go black and come back
    nt += dt;
    if (city.neon && city.neon.n && Math.random() < dt * 1.5) {
      const col = city.neon.mesh.geometry.attributes.color;
      const i = Math.floor(Math.random() * city.neon.n) * 4;
      for (let k = 0; k < 4; k++) col.setXYZ(i + k, 0.04, 0.04, 0.05);
      col.needsUpdate = true;
      setTimeout(() => {
        for (let k = 0; k < 4; k++) col.setXYZ(i + k, 1, 1, 1);
        col.needsUpdate = true;
      }, 90 + Math.random() * 150);
    }
  };

  city.dispose = () => {
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map && m.map.dispose(); m.dispose(); }); }
    });
    scene.fog = null;
  };

  return city;
}

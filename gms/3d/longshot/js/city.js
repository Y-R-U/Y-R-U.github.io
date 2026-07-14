// LONGSHOT — seeded procedural Meridian City.
// Districts: downtown core (towers, neon), midtown offices, oldtown low-rise,
// park + plaza. All buildings merge into a handful of draw calls; windows come
// from generated facade atlases (albedo + emissive) with per-building UV phase
// so no two towers read identical. Returns colliders + glass + room data the
// ballistics and missions modules consume.

import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TIMES, LITE, MOVE } from './config.js';
import { rng } from './utils.js';

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
function facadeTex(r, style, litP) {
  const W = 256, H = 256;
  const cols = style.cols, rows = style.rows;
  const draw = (lit) => canvasTex(W, H, (g) => {
    g.fillStyle = lit ? '#000' : style.wall;
    g.fillRect(0, 0, W, H);
    const cw = W / cols, ch = H / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const px = x * cw + cw * style.mx, py = y * ch + ch * style.my;
      const pw = cw * (1 - style.mx * 2), ph = ch * (1 - style.my * 2);
      const isLit = rng(r + x * 131 + y * 17)() < litP;
      if (lit) {
        if (isLit) {
          const warm = 30 + Math.floor(rng(r + x * 7 + y * 313)() * 40);
          g.fillStyle = `rgb(255,${170 + warm},${90 + warm})`;
          g.fillRect(px, py, pw, ph);
        }
      } else {
        const v = 48 + Math.floor(rng(r + x * 31 + y * 7)() * 34);
        g.fillStyle = isLit ? '#6a5a3a' : `rgb(${v},${v + 9},${v + 18})`;
        g.fillRect(px, py, pw, ph);
        // sky reflection streak
        g.fillStyle = 'rgba(170,200,230,0.2)';
        g.fillRect(px, py, pw, ph * 0.35);
      }
    }
  });
  const map = draw(false), emissive = draw(true);
  for (const t of [map, emissive]) { t.wrapS = t.wrapT = T.RepeatWrapping; }
  return { map, emissive };
}

const FACADE_STYLES = [
  { cols: 6, rows: 6, mx: 0.16, my: 0.2, wall: '#8b939c', winW: 3.4, winH: 3.4 },   // office glass
  { cols: 5, rows: 7, mx: 0.22, my: 0.24, wall: '#a08d80', winW: 3.8, winH: 3.1 },  // brick-ish
  { cols: 8, rows: 8, mx: 0.1, my: 0.14, wall: '#78828e', winW: 2.6, winH: 2.8 },   // curtain-wall tower
  { cols: 4, rows: 5, mx: 0.26, my: 0.28, wall: '#a89380', winW: 4.4, winH: 3.6 },  // oldtown
];

// ── building geometry ────────────────────────────────────────────────────────
// four side planes with window-scaled UVs (+ random phase), separate roof.
function buildingGeo(w, h, d, style, r, tint) {
  const geos = [];
  const uw = w / style.winW / style.cols, uh = h / style.winH / style.rows, ud = d / style.winW / style.cols;
  const ox = Math.floor(r() * 8) / style.cols, oy = Math.floor(r() * 8) / style.rows;
  const face = (fw, rotY, tx, tz, ur) => {
    const g = new T.PlaneGeometry(fw, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, ox + uv.getX(i) * ur, oy + uv.getY(i) * uh);
    g.rotateY(rotY); g.translate(tx, h / 2, tz);
    geos.push(g);
  };
  face(w, 0, 0, d / 2, uw); face(w, Math.PI, 0, -d / 2, uw);
  face(d, Math.PI / 2, w / 2, 0, ud); face(d, -Math.PI / 2, -w / 2, 0, ud);
  const geo = BGU.mergeGeometries(geos);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  return geo;
}
function boxTinted(w, h, d, tint) {
  const g = new T.BoxGeometry(w, h, d);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  return g;
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
    plazaPts: [], walkLoops: [], escapePts: [], neon: [],
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
  const hemi = new T.HemisphereLight(time.skyTop, 0x3a4048, time.ambI);
  const sunL = new T.DirectionalLight(time.sun, time.sunI);
  sunL.position.set(time.sunPos[0], time.sunPos[1], time.sunPos[2]).multiplyScalar(900);
  const ambL = new T.AmbientLight(time.amb, time.ambient ?? 0.35);
  // a second, opposing fill so the shaded faces of towers aren't pure black
  const fill = new T.DirectionalLight(time.amb, time.sunI * 0.28);
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

  // ── ground: one painted plane ──
  const px = LITE ? 1024 : 2048;
  const groundTex = canvasTex(px, px, (g, W) => {
    const sc = W / extent;                      // px per metre
    const M = (wx) => (wx + half) * sc;
    g.fillStyle = '#20242a'; g.fillRect(0, 0, W, W);        // asphalt base
    for (let by = 0; by < grid; by++) for (let bx = 0; bx < grid; bx++) {
      const [cx, cz] = blockPos(bx, by);
      const k = kind[by * grid + bx];
      const x0 = M(cx - block / 2), y0 = M(cz - block / 2), s = block * sc;
      // sidewalk ring
      g.fillStyle = '#3d4249';
      g.fillRect(x0 - CITY.sidewalk * sc, y0 - CITY.sidewalk * sc, s + CITY.sidewalk * 2 * sc, s + CITY.sidewalk * 2 * sc);
      // block interior
      g.fillStyle = k === 'park' ? '#2e4a30' : k === 'plaza' ? '#4a4640' : '#33373d';
      g.fillRect(x0, y0, s, s);
      if (k === 'park') {                       // paths
        g.strokeStyle = '#585043'; g.lineWidth = 2.2 * sc;
        g.beginPath(); g.moveTo(x0, y0 + s / 2); g.bezierCurveTo(x0 + s / 3, y0 + s / 4, x0 + s * 2 / 3, y0 + s * 3 / 4, x0 + s, y0 + s / 2); g.stroke();
        g.beginPath(); g.moveTo(x0 + s / 2, y0); g.bezierCurveTo(x0 + s / 4, y0 + s / 3, x0 + s * 3 / 4, y0 + s * 2 / 3, x0 + s / 2, y0 + s); g.stroke();
      }
      if (k === 'plaza') {                      // circle motif
        g.strokeStyle = '#5a544a'; g.lineWidth = 1.4 * sc;
        for (let rr = 5; rr < block / 2; rr += 7) { g.beginPath(); g.arc(x0 + s / 2, y0 + s / 2, rr * sc, 0, 7); g.stroke(); }
      }
    }
    // lane dashes
    g.strokeStyle = '#7a7460'; g.lineWidth = Math.max(1, 0.35 * sc);
    g.setLineDash([3.2 * sc, 4.2 * sc]);
    for (let i = 0; i <= grid; i++) {
      const w = i * cell - half - road / 2;
      g.beginPath(); g.moveTo(M(w), 0); g.lineTo(M(w), W); g.stroke();
      g.beginPath(); g.moveTo(0, M(w)); g.lineTo(W, M(w)); g.stroke();
    }
    g.setLineDash([]);
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

  // ── buildings (merged per facade style) ──
  const geosByStyle = FACADE_STYLES.map(() => []);
  const roofGeos = [], propGeos = [];
  const palette = {
    down: [[0.72, 0.78, 0.86], [0.62, 0.7, 0.8], [0.55, 0.6, 0.72], [0.8, 0.82, 0.85]],
    mid: [[0.75, 0.72, 0.66], [0.68, 0.66, 0.62], [0.62, 0.64, 0.66], [0.7, 0.68, 0.7]],
    old: [[0.72, 0.6, 0.5], [0.66, 0.58, 0.52], [0.6, 0.55, 0.5], [0.68, 0.64, 0.55]],
  };
  const styleFor = { down: 2, mid: 0, old: 3 };
  const heights = { down: [45, 125], mid: [20, 58], old: [9, 26] };

  function addBuilding(cx, cz, w, d, h, k, rr, opts = {}) {
    const si = rr.chance(0.3) ? rr.int(0, 3) : styleFor[k];
    const style = FACADE_STYLES[si];
    const tintA = rr.pick(palette[k]);
    const tint = { r: tintA[0], g: tintA[1], b: tintA[2] };
    const geo = buildingGeo(w, h, d, style, rr, tint);
    geo.translate(cx, 0, cz);
    geosByStyle[si].push(geo);
    // roof slab + parapet
    const roof = boxTinted(w, 1.4, d, { r: 0.16, g: 0.17, b: 0.19 });
    roof.translate(cx, h + 0.7, cz);
    roofGeos.push(roof);
    // Parapets on every roof but the shooter's own — a 1.1 m wall three metres
    // ahead of your eye sits exactly on the line of a downward shot and fills
    // the entire scope with concrete.
    if (!opts.noParapet) {
      const pw = 0.5, ph = 1.1;
      for (const [ox, oz, sw, sd] of [[0, d / 2, w, pw], [0, -d / 2, w, pw], [w / 2, 0, pw, d], [-w / 2, 0, pw, d]]) {
        const p = boxTinted(sw, ph, sd, { r: 0.2, g: 0.21, b: 0.23 });
        p.translate(cx + ox, h + 1.4 + ph / 2 - 0.7, cz + oz);
        propGeos.push(p);
      }
    }
    // rooftop clutter (never on the shooter's own roof — city.setVantage
    // furnishes that one, placed relative to where he actually stands)
    if (h > 18 && !opts.noParapet) {
      const n = rr.int(1, 3);
      for (let i = 0; i < n; i++) {
        const bw = rr.range(2, 5);
        const b = boxTinted(bw, rr.range(1.5, 3.4), rr.range(2, 4.5), { r: 0.26, g: 0.27, b: 0.3 });
        b.translate(cx + rr.range(-w / 3, w / 3), h + 2.5, cz + rr.range(-d / 3, d / 3));
        propGeos.push(b);
      }
      if (rr.chance(0.28)) {   // water tank
        const t = new T.CylinderGeometry(2, 2, 4, 8);
        const nn = t.attributes.position.count, cc = new Float32Array(nn * 3);
        for (let i = 0; i < nn; i++) { cc[i * 3] = 0.36; cc[i * 3 + 1] = 0.28; cc[i * 3 + 2] = 0.22; }
        t.setAttribute('color', new T.BufferAttribute(cc, 3));
        t.translate(cx + rr.range(-w / 4, w / 4), h + 4, cz + rr.range(-d / 4, d / 4));
        propGeos.push(t);
      }
    }
    city.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cx, cz, w, d, k });
    return city.colliders[city.colliders.length - 1];
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
      const b = addBuilding(cx, cz, PERCH_W, PERCH_W, perch.h, 'mid', rr, { noParapet: true });
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
      addBuilding(cx + ox, cz + oz, w, d, h, k, rr);
    }
  }

  const facadeMats = FACADE_STYLES.map((st, i) => {
    const { map, emissive } = facadeTex(spec.seed ? (i * 999 + (typeof spec.seed === 'string' ? spec.seed.length : spec.seed)) : i, st, time.litP);
    return new T.MeshStandardMaterial({
      map, emissiveMap: emissive, emissive: 0xffcf9a, emissiveIntensity: time.em,
      vertexColors: true, roughness: 0.85, metalness: 0.08,
    });
  });
  geosByStyle.forEach((geos, i) => {
    if (!geos.length) return;
    const m = new T.Mesh(BGU.mergeGeometries(geos), facadeMats[i]);
    group.add(m);
  });
  const darkMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  if (roofGeos.length) group.add(new T.Mesh(BGU.mergeGeometries(roofGeos), darkMat));
  if (propGeos.length) group.add(new T.Mesh(BGU.mergeGeometries(propGeos), darkMat));

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

  // ── neon signs (downtown) ──
  const NEON_WORDS = ['NOVA', 'VERTEX', 'HOTEL', 'ORION', 'KOI', 'BANK', 'LUX', 'ZENITH', 'PULSE', 'ECHO'];
  const NEON_COLS = ['#ff4d6d', '#3dd6ff', '#ffd23d', '#7dff5a', '#c86bff', '#ff9a3d'];
  const neonCount = LITE ? 5 : 12;
  const downtown = city.colliders.filter(c => c.k === 'down' && c.h > 50);
  for (let i = 0; i < Math.min(neonCount, downtown.length); i++) {
    const b = downtown[Math.floor(r() * downtown.length)];
    const word = NEON_WORDS[i % NEON_WORDS.length], colr = NEON_COLS[i % NEON_COLS.length];
    const tex = canvasTex(64, 256, (g) => {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, 64, 256);
      g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillStyle = colr;
      g.shadowColor = colr; g.shadowBlur = 12;
      [...word].forEach((ch, j) => g.fillText(ch, 32, 52 + j * 46));
    });
    const hgt = Math.min(30, word.length * 6), wid = 5;
    const m = new T.Mesh(new T.PlaneGeometry(wid, hgt),
      new T.MeshBasicMaterial({ map: tex, transparent: false, fog: true,
        color: 0xffffff }));
    const side = r.int(0, 3);
    const y = b.h * r.range(0.5, 0.8);
    if (side === 0) m.position.set(b.cx + b.w / 2 + 0.3, y, b.cz), m.rotation.y = Math.PI / 2;
    else if (side === 1) m.position.set(b.cx - b.w / 2 - 0.3, y, b.cz), m.rotation.y = -Math.PI / 2;
    else if (side === 2) m.position.set(b.cx, y, b.cz + b.d / 2 + 0.3);
    else m.position.set(b.cx, y, b.cz - b.d / 2 - 0.3);
    group.add(m);
    city.neon.push(m);
  }

  // ── street lamps (night glow points) ──
  if (spec.time === 'night' || spec.time === 'dusk') {
    const pts = [];
    for (let i = 0; i <= grid; i++) {
      const w = i * cell - half - road / 2;
      for (let s = -half; s < half; s += 34) { pts.push(w, 7, s, s, 7, w); }
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
    const lanePos = lane * cell - half - road / 2 + (r.chance(0.5) ? 2.8 : -2.8);
    const dir = (lanePos - Math.floor(lanePos)) >= 0 && r.chance(0.5) ? 1 : -1;
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
    // neon flicker
    nt += dt;
    if (city.neon.length && Math.random() < dt * 1.5) {
      const m = city.neon[Math.floor(Math.random() * city.neon.length)];
      m.visible = !m.visible;
      setTimeout(() => { m.visible = true; }, 90 + Math.random() * 150);
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

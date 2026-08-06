// The planning table — C2 owns this file.
//
// object3D's origin is the CENTRE OF THE PLOT SURFACE, y = 0 at the paper. Everything structural
// hangs below it, every marker sits just above it. main.js parents this to bridge.tableAnchor,
// which is the table top height above the bridge deck.
//
// Two coordinate domains live here and they are NOT the same type (REVIEW.md B8):
//   Cell    (r,c)  r ∈ [0,h)   c ∈ [0,w)    — the centre of a square
//   Anchor  (r,c)  domain depends on the ordnance kind, and comes from the sim's anchorDomain()
// `heavy` anchors are LATTICE points: the corner shared by four cells, r ∈ [0,h-2], c ∈ [0,w-2].
// localToAnchor() is the one tap-resolution entry point; nobody outside should be rounding
// coordinates by hand.

import * as THREE from 'three';
import { getMaterial } from './materials/index.js';
import { setChartLook, prop } from './materials/table.js';
import { TABLE } from '../config.js';
import { track } from '../engine/budget.js';
import { anchorDomain, KINDS } from '../sim/index.js';
import { contactMaterial } from './bridgeKit.js';

const PEG = { unknown: 0, miss: 1, hit: 2, sunk: 3 };

// Where the chart clutter stands, as a fraction of the chart, plus the radius of its contact
// patch. Kept next to buildClutter's put() calls — if a prop moves, this moves with it.
const CLUTTER_FEET = [
  [-0.30, 0.26, 0.30], [0.19, -0.29, 0.46], [0.34, 0.30, 0.16],
  [-0.12, -0.34, 0.30], [-0.06, 0.40, 0.34], [0.36, -0.10, 0.26], [0.40, 0.34, 0.16],
];

// Marker colours ride the `aGlow` instanced attribute straight into the emissive term (see
// materials/table.js), so these are radiances and >1 is legitimate.
const MARKER = {
  hit: [2.10, 0.34, 0.12],
  sunk: [0.80, 0.11, 0.07],
  hulk: [0.55, 0.11, 0.09],
};

const SHEEN = {
  holo: new THREE.Color(0.12, 0.26, 0.32),
  chart: new THREE.Color(0.26, 0.16, 0.065),
};

let poolTex = null;
function poolTexture() {
  if (poolTex) return poolTex;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  // Broad and weak. A tight bright core here is an area light drawn as a point, and it clips to
  // white in the middle of the chart with the map graphics inside it.
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.62)');
  grd.addColorStop(0.34, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.66, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  poolTex = new THREE.CanvasTexture(cv);
  poolTex.colorSpace = THREE.SRGBColorSpace;
  poolTex.needsUpdate = true;
  track(poolTex, { w: S, h: S, fmt: 'rgba', mips: false, label: 'table:sheen' });
  return poolTex;
}

const live = new Set();
export function pumpTables(dt) { for (const t of live) t._pump(dt); }

export function buildTable(w, h) {
  const object3D = new THREE.Group();
  object3D.name = 'table';

  const pitch = TABLE.cell + TABLE.gap;
  const size = { x: w * pitch, z: h * pitch };
  const bleed = TABLE.chartBleed * pitch;
  const chartW = size.x + bleed * 2, chartD = size.z + bleed * 2;
  const bez = TABLE.bezel;

  const board = { w, h };            // anchorDomain() only ever reads .w/.h off the game
  const colour = new THREE.Color();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  // Row 0 is the far edge (−Z) so the board reads the way the grid is written down.
  const cellToLocal = (r, c) => new THREE.Vector3(
    (c - (w - 1) / 2) * pitch,
    TABLE.pegHeight / 2,
    (r - (h - 1) / 2) * pitch,
  );

  // The corner shared by cells (r,c) (r,c+1) (r+1,c) (r+1,c+1).
  const latticeToLocal = (r, c) => new THREE.Vector3(
    (c + 0.5 - (w - 1) / 2) * pitch,
    TABLE.pegHeight / 2,
    (r + 0.5 - (h - 1) / 2) * pitch,
  );

  // ── the furniture ─────────────────────────────────────────────────────────────────────────

  // Paper, not a plane: a slow sag across the middle, the edges lifting off the metal, and one
  // dog-eared corner. It costs 400 triangles and it is the difference between printed stock and a
  // decal, because the lift is what puts a gradient and a shadow along the near rim.
  const chartGeo = new THREE.PlaneGeometry(chartW, chartD, 16, 16);
  {
    const p = chartGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i) / (chartW / 2), ny = p.getY(i) / (chartD / 2);
      const edge = Math.pow(Math.abs(nx), 10) + Math.pow(Math.abs(ny), 10);
      const ear = Math.max(0, 1 - Math.hypot(nx - 1, ny + 1) / 0.55);
      p.setZ(i, edge * 0.010 + ear * ear * 0.030
        + Math.sin(nx * 2.7) * Math.cos(ny * 2.1) * 0.0016 - 0.0016);
    }
    chartGeo.computeVertexNormals();
  }
  const chart = new THREE.Mesh(chartGeo, getMaterial('table', 'glass'));
  chart.rotation.x = -Math.PI / 2;
  chart.receiveShadow = true;
  object3D.add(chart);

  // The lamp's own pool on the surface. Both plates have one and it is the single strongest cue
  // that the table is lit rather than painted; the baked mottle alone reads flat at this size.
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(chartW * 1.15, chartD * 1.15), getMaterial('table', 'gridline').clone());
  sheen.material.map = poolTexture();
  sheen.material.color = SHEEN.holo.clone();
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.set(-chartW * 0.06, 0.0009, -chartD * 0.10);
  sheen.renderOrder = 4;
  object3D.add(sheen);

  // Bezel: four bars, top face raised above the paper so its inner edge catches the plot's own
  // light. That lit inner rim is most of what makes a plot table read as a light source.
  const bezMat = getMaterial('table', 'bezel');
  const bezGeo = new THREE.BoxGeometry(1, 1, 1);
  const bezel = new THREE.InstancedMesh(bezGeo, bezMat, 4);
  const bh = 0.052;
  const bars = [
    [0, -(chartD + bez) / 2, chartW + bez * 2, bez],
    [0, (chartD + bez) / 2, chartW + bez * 2, bez],
    [-(chartW + bez) / 2, 0, bez, chartD],
    [(chartW + bez) / 2, 0, bez, chartD],
  ];
  bars.forEach(([x, z, sx, sz], i) => {
    m.compose(v.set(x, bh / 2 - 0.006, z), q.identity(), s.set(sx, bh, sz));
    bezel.setMatrixAt(i, m);
  });
  bezel.castShadow = bezel.receiveShadow = true;
  object3D.add(bezel);

  // Plinth + pedestal + foot. One instanced box does all three.
  const body = new THREE.InstancedMesh(bezGeo, getMaterial('bridge', 'panel'), 3);
  const parts = [
    [0, -0.10, 0, chartW + bez * 2.4, 0.19, chartD + bez * 2.4],
    [0, -0.52, 0, chartW * 0.30, 0.70, chartD * 0.30],
    [0, -TABLE.height + 0.035, 0, chartW * 0.55, 0.07, chartD * 0.55],
  ];
  parts.forEach(([x, y, z, sx, sy, sz], i) => {
    m.compose(v.set(x, y, z), q.identity(), s.set(sx, sy, sz));
    body.setMatrixAt(i, m);
  });
  body.receiveShadow = true;
  object3D.add(body);

  // ── overlays, all sharing the additive gridline material ──────────────────────────────────

  const lineMat = getMaterial('table', 'gridline');
  const quad = new THREE.PlaneGeometry(1, 1);
  const overlay = (n, mat = lineMat) => {
    const im = new THREE.InstancedMesh(quad, mat, n);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    im.count = 0;
    im.renderOrder = 3;
    im.frustumCulled = false;
    object3D.add(im);
    return im;
  };

  const setQuad = (im, i, x, z, sx, sz, y, col) => {
    m.compose(v.set(x, y, z), flat, s.set(sx, sz, 1));
    im.setMatrixAt(i, m);
    im.setColorAt(i, colour.setRGB(col[0], col[1], col[2]));
  };

  const gridW = 0.0035;
  const grid = overlay((w + 1) + (h + 1));
  const gridCol = new THREE.Color();
  const paintGrid = (mul, hex = TABLE.gridColour) => {
    gridCol.set(hex);
    const col = [gridCol.r * mul, gridCol.g * mul, gridCol.b * mul];
    let i = 0;
    for (let c = 0; c <= w; c++) {
      setQuad(grid, i++, (c - w / 2) * pitch, 0, gridW, size.z, 0.0012, col);
    }
    for (let r = 0; r <= h; r++) {
      setQuad(grid, i++, 0, (r - h / 2) * pitch, size.x, gridW, 0.0012, col);
    }
    grid.count = i;
    grid.instanceMatrix.needsUpdate = true;
    grid.instanceColor.needsUpdate = true;
  };
  paintGrid(0.42);

  const ghost = overlay(w * h);
  const lattice = overlay(Math.max(1, (w - 1) * (h - 1)));
  const reticle = overlay(4);
  const missMarks = overlay(w * h, getMaterial('table', 'pegMiss'));
  const hitMarks = overlay(w * h, getMaterial('table', 'pegHit'));

  // Physical markers. Cells the player has resolved get a peg standing on the chart; unknown
  // cells get nothing, because a hundred identical pegs is a checkerboard, not a plot.
  const pegGeo = new THREE.CylinderGeometry(TABLE.cell * 0.20, TABLE.cell * 0.26, TABLE.pegHeight, 10);
  const pegMat = getMaterial('table', 'peg');
  const pegs = new THREE.InstancedMesh(pegGeo.clone(), pegMat, w * h);
  const pegGlow = new THREE.InstancedBufferAttribute(new Float32Array(w * h * 3), 3);
  pegs.geometry.setAttribute('aGlow', pegGlow);
  pegs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pegs.count = 0;
  pegs.frustumCulled = false;
  pegs.castShadow = true;
  object3D.add(pegs);

  // A sunk enemy gets a token laid over its cells — the thing a plot table is actually for.
  const hulkGeo = new THREE.BoxGeometry(1, 1, 1);
  const hulks = new THREE.InstancedMesh(hulkGeo, pegMat, 12);
  const hulkGlow = new THREE.InstancedBufferAttribute(new Float32Array(12 * 3), 3);
  hulks.geometry.setAttribute('aGlow', hulkGlow);
  hulks.count = 0;
  hulks.frustumCulled = false;
  object3D.add(hulks);

  const clutter = buildClutter(chartW, chartD);
  object3D.add(clutter);

  // Contact darkening where anything meets the chart. A cast shadow only covers the side away from
  // the lamp; without this the printed grid runs unbroken right up to and under every silhouette,
  // which is what makes a prop read as pasted on rather than standing on the paper.
  const contacts = new THREE.InstancedMesh(quad, contactMaterial(), w * h + CLUTTER_FEET.length);
  contacts.count = 0;
  contacts.renderOrder = 2;
  contacts.frustumCulled = false;
  object3D.add(contacts);
  const setContact = (i, x, z, rad) => {
    m.compose(v.set(x, 0.0008, z), flat, s.set(rad, rad, 1));
    contacts.setMatrixAt(i, m);
  };

  // ── state ─────────────────────────────────────────────────────────────────────────────────

  let aimKind = null;
  let ghostCells = null;
  const pulses = [];
  const pegCell = [];                 // instance index → {r,c}, so a pulse can find its peg

  const inDomain = (kind, r, c) => {
    const d = anchorDomain(board, KINDS.includes(kind) ? kind : 'shell');
    return r >= d.rLo && r <= d.rHi && c >= d.cLo && c <= d.cHi;
  };
  const clampTo = (kind, r, c) => {
    const d = anchorDomain(board, KINDS.includes(kind) ? kind : 'shell');
    return {
      r: Math.min(Math.max(r, d.rLo), d.rHi),
      c: Math.min(Math.max(c, d.cLo), d.cHi),
    };
  };

  function paintLattice() {
    if (aimKind !== 'heavy') { lattice.count = 0; return; }
    const d = anchorDomain(board, 'heavy');
    const col = new THREE.Color(TABLE.latticeColour);
    const dot = pitch * 0.16;
    let i = 0;
    for (let r = d.rLo; r <= d.rHi; r++) {
      for (let c = d.cLo; c <= d.cHi; c++) {
        const p = latticeToLocal(r, c);
        setQuad(lattice, i++, p.x, p.z, dot, dot, 0.0022, [col.r * 0.5, col.g * 0.5, col.b * 0.5]);
      }
    }
    lattice.count = i;
    lattice.instanceMatrix.needsUpdate = true;
    lattice.instanceColor.needsUpdate = true;
  }

  function paintReticle() {
    if (aimKind !== 'salvo' || !ghostCells?.length) { reticle.count = 0; return; }
    let r0 = Infinity, r1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (const cell of ghostCells) {
      r0 = Math.min(r0, cell.r); r1 = Math.max(r1, cell.r);
      c0 = Math.min(c0, cell.c); c1 = Math.max(c1, cell.c);
    }
    const a = cellToLocal(r0, c0), b = cellToLocal(r1, c1);
    const x0 = a.x - pitch / 2, x1 = b.x + pitch / 2, z0 = a.z - pitch / 2, z1 = b.z + pitch / 2;
    const t = 0.006;
    const col = new THREE.Color(TABLE.ghostColour);
    const c3 = [col.r * 1.1, col.g * 1.1, col.b * 1.1];
    let i = 0;
    setQuad(reticle, i++, (x0 + x1) / 2, z0, x1 - x0, t, 0.0026, c3);
    setQuad(reticle, i++, (x0 + x1) / 2, z1, x1 - x0, t, 0.0026, c3);
    setQuad(reticle, i++, x0, (z0 + z1) / 2, t, z1 - z0, 0.0026, c3);
    setQuad(reticle, i++, x1, (z0 + z1) / 2, t, z1 - z0, 0.0026, c3);
    reticle.count = i;
    reticle.instanceMatrix.needsUpdate = true;
    reticle.instanceColor.needsUpdate = true;
  }

  const api = {
    object3D, size, pitch, cellToLocal, latticeToLocal, PEG,

    localToCell(v3) {
      const c = Math.round(v3.x / pitch + (w - 1) / 2);
      const r = Math.round(v3.z / pitch + (h - 1) / 2);
      return (r >= 0 && r < h && c >= 0 && c < w) ? { r, c } : null;
    },

    // The ONE tap-resolution entry point. Returns an ANCHOR in `kind`'s domain — for `heavy` that
    // is a lattice point, r ∈ [0,h-2], and it is not a Cell. null only when the tap misses the
    // table outright; anything on the table clamps inward, exactly as sim.snapTarget does.
    localToAnchor(v3, kind = 'shell') {
      const slack = pitch * 1.2;
      if (Math.abs(v3.x) > size.x / 2 + slack || Math.abs(v3.z) > size.z / 2 + slack) return null;
      const k = KINDS.includes(kind) ? kind : 'shell';
      const r = k === 'heavy'
        ? Math.round(v3.z / pitch + h / 2 - 1)
        : Math.round(v3.z / pitch + (h - 1) / 2);
      const c = k === 'heavy'
        ? Math.round(v3.x / pitch + w / 2 - 1)
        : Math.round(v3.x / pitch + (w - 1) / 2);
      return clampTo(k, r, c);
    },

    anchorToLocal(r, c, kind = 'shell') {
      return kind === 'heavy' ? latticeToLocal(r, c) : cellToLocal(r, c);
    },

    anchorLegal(r, c, kind = 'shell') { return inDomain(kind, r, c); },

    pegWorld(r, c) { return object3D.localToWorld(cellToLocal(r, c)); },

    // Corner dots for `heavy`, a 3×3 bracket for `salvo`, nothing for `shell` or null.
    setAimMode(kind) {
      aimKind = KINDS.includes(kind) ? kind : null;
      paintLattice();
      paintReticle();
    },
    aimMode() { return aimKind; },

    // Paints the whole grid from a sim View. grid values: 0 unknown, 1 miss, 2 hit, 3 sunk.
    setState(view) {
      const g = view?.grid;
      let np = 0, nm = 0, nh = 0;
      pegCell.length = 0;
      if (g) {
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            const st = g[r * w + c] ?? 0;
            if (!st) continue;
            const p = cellToLocal(r, c);
            if (st === PEG.miss) {
              setQuad(missMarks, nm++, p.x, p.z, pitch * 0.62, pitch * 0.62, 0.0016,
                [0.20, 0.32, 0.44]);
            } else {
              const col = st === PEG.sunk ? MARKER.sunk : MARKER.hit;
              m.compose(v.set(p.x, p.y, p.z), q.identity(), s.set(1, 1, 1));
              pegs.setMatrixAt(np, m);
              pegGlow.setXYZ(np, col[0], col[1], col[2]);
              pegCell[np] = { r, c };
              np++;
              setQuad(hitMarks, nh++, p.x, p.z, pitch * 0.95, pitch * 0.95, 0.0016,
                st === PEG.sunk ? [0.30, 0.08, 0.05] : [0.85, 0.24, 0.09]);
            }
          }
        }
      }
      let nc = 0;
      for (const pc of pegCell) { if (!pc) continue; const p = cellToLocal(pc.r, pc.c); setContact(nc++, p.x, p.z, pitch * 0.92); }
      for (const [fx, fz, fr] of CLUTTER_FEET) setContact(nc++, fx * chartW, fz * chartD, fr);
      contacts.count = nc;
      contacts.instanceMatrix.needsUpdate = true;

      pegs.count = np;
      missMarks.count = nm;
      hitMarks.count = nh;
      pegs.instanceMatrix.needsUpdate = true;
      pegGlow.needsUpdate = true;
      for (const im of [missMarks, hitMarks]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }

      let nk = 0;
      for (const sh of view?.enemyShips || []) {
        if (!sh?.cells?.length || nk >= hulks.count + 12) continue;
        const a = sh.cells[0], b = sh.cells[sh.cells.length - 1];
        const pa = cellToLocal(a.r, a.c), pb = cellToLocal(b.r, b.c);
        const horiz = a.r === b.r;
        m.compose(
          v.set((pa.x + pb.x) / 2, TABLE.pegHeight * 0.42, (pa.z + pb.z) / 2),
          q.identity(),
          s.set(horiz ? Math.abs(pb.x - pa.x) + pitch * 0.7 : pitch * 0.34, TABLE.pegHeight * 0.8,
            horiz ? pitch * 0.34 : Math.abs(pb.z - pa.z) + pitch * 0.7),
        );
        hulks.setMatrixAt(nk, m);
        hulkGlow.setXYZ(nk, MARKER.hulk[0], MARKER.hulk[1], MARKER.hulk[2]);
        nk++;
      }
      hulks.count = nk;
      hulks.instanceMatrix.needsUpdate = true;
      hulkGlow.needsUpdate = true;
    },

    showGhost(cells) {
      ghostCells = cells && cells.length ? cells : null;
      if (!ghostCells) { ghost.count = 0; paintReticle(); return; }
      const col = new THREE.Color(TABLE.ghostColour);
      const c3 = [col.r * 0.62, col.g * 0.62, col.b * 0.62];
      ghostCells.forEach((cell, i) => {
        const p = cellToLocal(cell.r, cell.c);
        setQuad(ghost, i, p.x, p.z, TABLE.cell * 0.94, TABLE.cell * 0.94, 0.0020, c3);
      });
      ghost.count = ghostCells.length;
      ghost.instanceMatrix.needsUpdate = true;
      ghost.instanceColor.needsUpdate = true;
      paintReticle();
    },

    pulse(r, c, kind = 'hit') {
      pulses.push({ r, c, kind, t: 0 });
    },

    // 'holo' — cold plot glass under the bridge lamps. 'chart' — warm lit paper under a chart lamp.
    // How much of the sky's IBL the table's own materials see, the counterpart to bridge.setEnv().
    // Without it the plot bezel took the noon sky at full strength in a room graded to 0.006, and
    // the only way to reach it was for a scenario to walk this table's materials from outside —
    // which is safe only because each scored shot is its own page load. C6 escalation E6.
    setEnv(k) {
      object3D.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          if (m.envMapIntensity === undefined) continue;
          m.envMapIntensity = k;
          m.needsUpdate = true;
        }
      });
      return api;
    },

    setLook(name) {
      setChartLook(name);
      // The clutter only casts under the pendant. Twenty small meshes in a shadow pass that
      // resolves to nothing visible is twenty draw calls for no picture.
      clutter.traverse(o => { if (o.isMesh) o.castShadow = name === 'chart' && o.userData.cast !== false; });
      if (name === 'chart') paintGrid(0.13, TABLE.gridChartColour); else paintGrid(0.34);
      sheen.material.color.copy(name === 'chart' ? SHEEN.chart : SHEEN.holo);
      return api;
    },

    // Where the sheen sits, in table-local metres — a chart lamp off to one side does not put its
    // pool in the middle of the paper.
    setSheen(x, z, scale = 1, colour = null) {
      sheen.position.set(x, 0.0009, z);
      sheen.scale.setScalar(scale);
      if (colour) sheen.material.color.set(colour);
    },

    setClutter(on) { clutter.visible = on !== false; },

    _pump(dt) {
      if (!pulses.length) return;
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt;
        const u = p.t / 0.55;
        if (u >= 1) { pulses.splice(i, 1); continue; }
        const idx = pegCell.findIndex(pc => pc && pc.r === p.r && pc.c === p.c);
        if (idx < 0) continue;
        const k = 1 + Math.sin(u * Math.PI) * 1.6;
        const loc = cellToLocal(p.r, p.c);
        m.compose(v.set(loc.x, loc.y * k, loc.z), q.identity(), s.set(1, k, 1));
        pegs.setMatrixAt(idx, m);
        const col = p.kind === 'miss' ? [0.5, 0.8, 1.1] : MARKER.hit;
        const b = 1 + Math.sin(u * Math.PI) * 2.5;
        pegGlow.setXYZ(idx, col[0] * b, col[1] * b, col[2] * b);
        pegs.instanceMatrix.needsUpdate = true;
        pegGlow.needsUpdate = true;
      }
    },
  };

  live.add(api);
  return api;
}

// Chart-table clutter. It exists because every reference plate of a real plotting surface is
// covered in instruments, and an empty rectangle reads as a prototype. Everything here has a lit
// top face, a side face that falls into shade, and real thickness — a flat black bar under a hard
// downlight is the loudest possible statement that nothing in the scene is being lit.
function buildClutter(chartW, chartD) {
  const g = new THREE.Group();
  g.name = 'tableClutter';
  // Prop materials are not in SURFACES — that list is materials/index.js's and frozen. They come
  // straight from the table kit instead.
  const brass = prop('brass');
  const dark = prop('dark');
  const plastic = prop('plastic');
  const paper = prop('paper');
  const enamel = prop('enamel');
  // `cast` is a whitelist: only the props whose shadow is actually legible are in the shadow pass.
  // Twenty small meshes in there is twenty draw calls for a smudge.
  const put = (mesh, x, y, z, ry = 0, cast = true) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.traverse(c => { if (c.isMesh) { c.userData.cast = cast; c.receiveShadow = true; } });
    g.add(mesh);
    return mesh;
  };

  // bearing plotter: a graduated disc with a swinging arm, the DRT plate's centrepiece
  const disc = new THREE.Group();
  disc.add(new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.092, 0.014, 28), dark));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.028, 20), brass);
  hub.position.y = 0.015;
  disc.add(hub);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.008, 0.030), plastic);
  arm.position.set(0.09, 0.030, 0);
  arm.rotation.y = -0.5;
  disc.add(arm);
  put(disc, -chartW * 0.30, 0.008, chartD * 0.26);

  // parallel rule — two clear-plastic bars on brass links, 6 mm thick, standing off the paper
  const rule = new THREE.Group();
  for (const dz of [-0.030, 0.030]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.007, 0.032), plastic);
    bar.position.set(0, 0.0035, dz);
    rule.add(bar);
  }
  for (const dx of [-0.09, 0.09]) {
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.062), brass);
    link.position.set(dx, 0.008, 0);
    rule.add(link);
  }
  put(rule, chartW * 0.19, 0.004, -chartD * 0.29, 0.42);

  // dividers
  const div = new THREE.Group();
  for (const a of [-0.20, 0.20]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0038, 0.15, 6), brass);
    leg.position.set(Math.sin(a) * 0.075, 0.072, 0);
    leg.rotation.z = -a;
    div.add(leg);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.010, 10, 8), brass);
  head.position.y = 0.146;
  div.add(head);
  put(div, chartW * 0.34, 0.002, chartD * 0.30, 0.8, false);

  // pencil: hex body, a sharpened cone and a metal ferrule
  const pencil = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.15, 6), prop('pencil'));
  body.rotation.z = Math.PI / 2;
  pencil.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.020, 6), prop('pencil'));
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 0.085;
  pencil.add(tip);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0048, 0.012, 8), brass);
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.x = -0.078;
  pencil.add(ferrule);
  put(pencil, -chartW * 0.12, 0.0055, -chartD * 0.34, 0.3);

  // a straight-edge left lying across the near corner — the one prop whose shadow reads cleanly
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.009, 0.042), plastic);
  put(edge, -chartW * 0.06, 0.0045, chartD * 0.40, -0.22);

  // a folded signal pad, because a plot table always has paper on it
  const pad = new THREE.Group();
  pad.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.006, 0.20), paper));
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.002, 0.19), paper);
  leaf.position.set(0.008, 0.005, -0.006);
  leaf.rotation.y = 0.09;
  pad.add(leaf);
  put(pad, chartW * 0.36, 0.003, -chartD * 0.10, -0.35, false);

  // mug — white enamel with a rim highlight and a handle
  const mug = new THREE.Group();
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.033, 0.086, 18, 1, true), enamel));
  mug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.004, 16), dark)).position.y = 0.020;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0035, 6, 20), enamel);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.043;
  mug.add(lip);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 14, Math.PI * 1.3), enamel);
  handle.position.set(0.042, 0.006, 0);
  handle.rotation.set(Math.PI / 2, 0, -0.35);
  mug.add(handle);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.003, 16), enamel);
  base.position.y = -0.043;
  mug.add(base);
  put(mug, chartW * 0.40, 0.045, chartD * 0.34, 0, false);

  return g;
}

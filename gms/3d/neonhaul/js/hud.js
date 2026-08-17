// §8.1 cockpit · §8.2 dashboard · §8.3 floating holo panels. The whole diegetic HUD, in five
// draw calls.
//
// ── the draw-call architecture, which is the point ─────────────────────────
//
// §8.1/§8.2/§8.3 price this at 6 + 1 + 3 = 10 draws. P5 got the entire vehicle layer — player
// craft plus every traffic craft in the world — into five, and it did that by refusing to let
// "one object" mean "one mesh". The same rule applies here:
//
//   shell   every near-black metal part of the cabin — both A-pillars, the roof lip, the dash
//           lip, the two side consoles — merged into ONE BufferGeometry at build time. They never
//           move relative to each other, so there is nothing an object split would buy.
//   rules   every 4 mm emissive edge rule, merged the same way. One material, one district tint,
//           one red flash on contact.
//   glass   the canopy. A 4x4 grid whose VERTEX COLOURS carry the fresnel falloff, so the sheen
//           costs a colour attribute instead of a shader patch (and therefore cannot collide with
//           §2.3's program cache rules).
//   dash    §8.2's instrument plane, one CanvasTexture at 12 fps (6 on LOW).
//   holo    §8.3's THREE panels as one geometry sharing ONE 384x384 CanvasTexture with three
//           128 px bands. Their per-panel look-away fade (§8.3) is written into the same vertex
//           colour attribute the glass uses its own copy of — additive blending makes a colour
//           scale and an opacity the same thing — so three independent fades still cost one draw.
//
// ── two deviations from §8, both deliberate, both reported ─────────────────
//
// 1. **§8.1 says "parented to the camera at 0.45 m, camera near plane 0.1". `config.CAMERA.near`
//    is 0.5.** P1a chose 0.5 for depth precision against a 4,000 m far plane; dropping it to 0.1
//    would take the depth ratio from 8,000 to 40,000 and put z-fighting into the city to buy
//    nothing. The cabin is built at `HUD.CABIN_Z` (1.10 m) at a proportionally larger scale
//    instead — identical on screen, clear of the near plane, and no change to anything else.
//
// 2. **The cabin is anchored to the CRAFT, not to the camera.** §8.1 says camera; §8.3 says the
//    panels "fade to 0.35 opacity when the player is looking away from them (dot product with the
//    camera forward)". Those two cannot both be true: geometry parented to the camera holds a
//    constant dot product with the camera forward by construction, so §8.3's fade would be a
//    constant and the feature would be dead code that looks alive. Anchoring to the craft's
//    position and heading — which §6.1 already has chasing the look yaw at 2.6 rad/s — makes the
//    look-away real, makes the frame lean into a turn, and is what a cockpit is supposed to do.
//
// P11 is Aaron's art pass and it owns how this LOOKS. This owns that it exists, that it is cheap,
// and that every number on it is real.

import * as THREE from 'three';
import { HUD, ZONE_TYPES, FLIGHT as F, CAMERA } from './config.js';
import { ALT as LANE_ALT } from './traffic.js';
import { clamp } from './utils.js';

const D2R = Math.PI / 180;

// The cabin's origin in world space — the pilot's eye point. Module-scope scratch so the 4 Hz
// fade pass allocates nothing.
const _tmpEye = new THREE.Vector3();
const _eyeOf = (group, out) => out.setFromMatrixPosition(group.matrix);

// ── the cabin, as data ─────────────────────────────────────────────────────
// Every part is a box with a transform, so "no occupant, no hands, no seat" (§13) is a property a
// gate can read off this table rather than a claim in a handoff. `role` is what the part IS;
// gates_p6 asserts the set of roles present is exactly ROLES_ALLOWED.

export const ROLES_ALLOWED = ['pillar', 'roof', 'dash', 'console'];

const Z = HUD.CABIN_Z;

const PARTS = [
  // id                 role       pos                       size                 rot (deg)
  ['pillar_l',          'pillar',  [-0.62, 0.16, -Z * 0.98], [0.075, 1.05, 0.10], [0, 0, 10]],
  ['pillar_r',          'pillar',  [0.62, 0.16, -Z * 0.98],  [0.075, 1.05, 0.10], [0, 0, -10]],
  ['roof_lip',          'roof',    [0, 0.58, -Z * 0.92],     [1.38, 0.13, 0.16],  [16, 0, 0]],
  ['roof_spar',         'roof',    [0, 0.66, -Z * 0.60],     [1.10, 0.07, 0.55],  [0, 0, 0]],
  // The lip is deliberately SHALLOW and pushed back. Its first version was 0.72 m deep centred at
  // 0.66 m, so its near edge came within 0.30 m of the eye — and a horizontal surface that close
  // projects to the bottom 40 % of the frame as featureless black, which on a phone is most of the
  // screen spent on nothing. Pushed back and thinned, the visible wedge is the bottom ~18 %, and
  // §8.2's instrument plane now covers most of what is left.
  ['dash_lip',          'dash',    [0, -0.475, -Z * 0.80],   [1.50, 0.14, 0.52],  [-9, 0, 0]],
  ['dash_face',         'dash',    [0, -0.368, -Z * 0.64],   [1.24, 0.09, 0.06],  [-30, 0, 0]],
  ['console_l',         'console', [-0.60, -0.315, -Z * 0.50], [0.20, 0.13, 0.44], [-6, 0, 12]],
  ['console_r',         'console', [0.60, -0.315, -Z * 0.50],  [0.20, 0.13, 0.44], [-6, 0, -12]],
];

// The emissive edge rules — §8.1's "4 mm emissive edge rule in the district tint at 0.2".
const RULES = [
  [[-0.572, 0.16, -Z * 0.955], [0.006, 1.02, 0.004], [0, 0, 10]],
  [[0.572, 0.16, -Z * 0.955], [0.006, 1.02, 0.004], [0, 0, -10]],
  [[0, 0.508, -Z * 0.905], [1.34, 0.006, 0.004], [16, 0, 0]],
  [[0, -0.326, -Z * 0.645], [1.22, 0.006, 0.004], [-30, 0, 0]],
  [[-0.60, -0.243, -Z * 0.50], [0.19, 0.005, 0.004], [-6, 0, 12]],
  [[0.60, -0.243, -Z * 0.50], [0.19, 0.005, 0.004], [-6, 0, -12]],
];

// ── §8.3's three panels, and §8.2's dash plane, as an ASPECT-DEPENDENT layout ───────────────
//
// This is the mobile-first requirement showing up in geometry. The visible half-width at the
// cabin plane is `z · tan(fov/2) · aspect`, so a panel that sits comfortably inside a 1.6:1
// laptop frame is entirely OFF SCREEN in a 0.46:1 phone held in portrait — which is the first
// platform the brief names. The first version of this file had exactly that bug: three panels
// and a dashboard nobody on a phone would ever have seen, and every desktop screenshot would
// have looked correct.
//
// So the panel and dash quads are rebuilt on resize from the live aspect. Two arrangements:
// `wide` is §8.3's left/right/centre-low; `tall` pulls the pair in, narrows them and lifts them
// above the dash so they frame the view instead of covering it.

export function layoutFor(aspect) {
  const wide = aspect >= 1.15;
  const lat = wide ? 0.44 : 0.145;
  const pw = wide ? 0.42 : 0.235;
  const py = wide ? 0.05 : 0.22;
  const yaw = wide ? 22 : 8;
  const cw = wide ? 0.50 : 0.22;
  // The dash canvas has TWO shapes, not one scaled down. In portrait the plane is only ~0.35 m
  // across at the cabin plane, so the 512x160 landscape sheet renders into roughly 180 device
  // pixels and its 8 px labels land at three — measured on the first pass and unreadable, which is
  // the whole reason this branch exists. The portrait sheet is squarer, carries a third of the
  // information and sets it four times larger. `ar` is height/width and MUST match the quad, or
  // the type stretches.
  const dash = wide
    ? { w: 0.86, ar: HUD.DASH_H / HUD.DASH_W, cw: HUD.DASH_W, ch: HUD.DASH_H }
    : { w: 0.345, ar: HUD.DASH_TH / HUD.DASH_TW, cw: HUD.DASH_TW, ch: HUD.DASH_TH };
  return {
    wide, aspect: +aspect.toFixed(4),
    dash: { ...dash, y: -0.26, z: -Z * 0.62, pitch: -34 },
    // Every panel is h = w/3 because all three share one 384-wide, 128-tall band of the same
    // CanvasTexture. A panel quad at a different aspect from its band is stretched text.
    panels: [
      { id: 'job',   pos: [-lat, py, -Z * 0.86], rot: [-4, yaw, 0], w: pw, h: pw / 3, band: 0 },
      { id: 'zone',  pos: [lat, py, -Z * 0.86], rot: [-4, -yaw, 0], w: pw, h: pw / 3, band: 1 },
      { id: 'comms', pos: [0, wide ? -0.10 : 0.06, -Z * 0.74], rot: [-11, 0, 0],
        w: cw, h: cw / 3, band: 2 },
    ],
  };
}

// §8.2's plane. One quad, tilted `pitch` degrees back from facing the eye so it reads as an
// instrument surface lying on the dash lip rather than a poster hung in the cabin.
function dashGeo(lay) {
  const g = new THREE.PlaneGeometry(lay.dash.w, lay.dash.w * lay.dash.ar);
  g.rotateX(lay.dash.pitch * D2R);
  g.translate(0, lay.dash.y, lay.dash.z);
  g.computeBoundingSphere();
  return g;
}

export class Cockpit {
  // Live viewport aspect, floored so a 0-height frame during startup or an orientation flip cannot
  // divide by zero and hand layoutFor() a NaN.
  aspectNow() {
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    return h > 0 ? w / h : 16 / 9;
  }

  constructor(scene, Q, sky, atlas) {
    this.scene = scene;
    this.low = Q.name === 'low';
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.group.name = 'cockpit';
    this.tint = 0x35e6ff;
    this.flash = 0;
    this.bob = 0;
    this.t = 0;
    this.dashAcc = 1e9; this.holoAcc = 1e9;
    this.dashDraws = 0; this.holoDraws = 0;
    this.msTotal = 0; this.msN = 0; this.msWorst = 0;
    this.data = null;
    this.hidden = false;
    this.fade = [1, 1, 0];
    this._occupant = null;

    const geo = buildBoxes(PARTS.map(p => ({ pos: p[2], size: p[3], rot: p[4] })));
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0x0c0e12, metalness: 0.85, roughness: 0.35, fog: false,
      envMap: sky ? sky.env : null, envMapIntensity: 0.9,
    });
    this.shell = new THREE.Mesh(geo, this.shellMat);
    this.shell.name = 'cockpit.shell';
    this.shell.frustumCulled = false;
    this.shell.userData.role = 'frame';
    this.group.add(this.shell);

    const rgeo = buildBoxes(RULES.map(r => ({ pos: r[0], size: r[1], rot: r[2] })));
    this.ruleMat = new THREE.MeshBasicMaterial({ color: 0x35e6ff, fog: false, toneMapped: true });
    this.ruleMat.color.setHex(this.tint).multiplyScalar(0.2);
    this.rules = new THREE.Mesh(rgeo, this.ruleMat);
    this.rules.name = 'cockpit.rules';
    this.rules.frustumCulled = false;
    this.rules.userData.role = 'rule';
    this.group.add(this.rules);

    // ── canopy glass ─────────────────────────────────────────────────────
    // Fresnel in the vertex colours: bright at the rim, invisible dead ahead. Additive, so a dry
    // variant is a colour scale of zero and a wet one is a sheen — and `visible = false` when
    // there is neither rain nor sheen means the common dry frame pays literally nothing.
    const gg = new THREE.PlaneGeometry(3.1, 2.2, 4, 4);
    const cols = new Float32Array(gg.attributes.position.count * 3);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const u = Math.abs(gp.getX(i)) / 1.55, v = Math.abs(gp.getY(i)) / 1.1;
      const k = Math.pow(clamp(Math.max(u, v), 0, 1), 2.2);       // fresnel-ish rim falloff
      cols[i * 3] = 0.36 * k + 0.02; cols[i * 3 + 1] = 0.52 * k + 0.03; cols[i * 3 + 2] = 0.70 * k + 0.04;
    }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gg.translate(0, 0.06, -Z * 1.32);
    this.glassMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.5, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
      map: atlas ? atlas.droplets : null,
    });
    if (this.glassMat.map) {
      this.glassMat.map.wrapS = this.glassMat.map.wrapT = THREE.RepeatWrapping;
      this.glassMat.map.repeat.set(2.2, 1.6);
    }
    this.glass = new THREE.Mesh(gg, this.glassMat);
    this.glass.name = 'cockpit.glass';
    this.glass.frustumCulled = false;
    this.glass.renderOrder = 4;
    this.glass.userData.role = 'glass';
    this.group.add(this.glass);

    // ── §8.2 dash ────────────────────────────────────────────────────────
    // The canvas is SIZED by the layout, not by a constant: portrait gets a squarer sheet with
    // larger type (see layoutFor). LOW halves whichever sheet the layout picked.
    this.lay = layoutFor(this.aspectNow());
    this.dashCanvas = document.createElement('canvas');
    this.sizeDash();
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    this.dashMat = new THREE.MeshBasicMaterial({ map: this.dashTex, fog: false, transparent: false });
    this.dash = new THREE.Mesh(dashGeo(this.lay), this.dashMat);
    this.dash.name = 'cockpit.dash';
    this.dash.frustumCulled = false;
    this.dash.renderOrder = 3;
    this.dash.userData.role = 'dash';
    this.group.add(this.dash);

    // ── §8.3 holo ────────────────────────────────────────────────────────
    this.holoW = this.low ? HUD.HOLO_W / 2 : HUD.HOLO_W;
    this.holoH = this.low ? HUD.HOLO_H / 2 : HUD.HOLO_H;
    this.holoCanvas = document.createElement('canvas');
    this.holoCanvas.width = this.holoW; this.holoCanvas.height = this.holoH * 3;
    this.holoTex = new THREE.CanvasTexture(this.holoCanvas);
    this.holoTex.colorSpace = THREE.SRGBColorSpace;
    this.holo = new THREE.Mesh(buildPanels(this.lay.panels), new THREE.MeshBasicMaterial({
      map: this.holoTex, vertexColors: true, transparent: true, fog: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.holo.name = 'cockpit.holo';
    this.holo.frustumCulled = false;
    this.holo.renderOrder = 5;
    this.holo.userData.role = 'holo';
    this.group.add(this.holo);

    scene.add(this.group);
    this.drawDash({});
    this.drawHolo({});
  }

  sizeDash() {
    const k = this.low ? 0.5 : 1;
    this.dashCanvas.width = Math.round(this.lay.dash.cw * k);
    this.dashCanvas.height = Math.round(this.lay.dash.ch * k);
    return [this.dashCanvas.width, this.dashCanvas.height];
  }

  // Called from main.js' onResize. Only a change of ARRANGEMENT rebuilds anything — a window drag
  // that stays landscape costs a layout object and nothing else.
  applyLayout(aspect = this.aspectNow()) {
    const lay = layoutFor(aspect);
    const same = this.lay && lay.wide === this.lay.wide;
    this.lay = lay;
    if (same) return false;
    this.sizeDash();
    // A CanvasTexture whose canvas changed SIZE has to be replaced, not flagged: three uploads the
    // new dimensions only on a fresh texture and otherwise samples a stale allocation.
    this.dashTex.dispose();
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    this.dashMat.map = this.dashTex;
    this.dashMat.needsUpdate = true;
    this.dash.geometry.dispose();
    this.dash.geometry = dashGeo(lay);
    this.holo.geometry.dispose();
    this.holo.geometry = buildPanels(lay.panels);
    this.drawDash(this.data || {});
    this.drawHolo(this.data || {});
    return true;
  }

  // `hidden` is the GATE's override and it outranks the game's own logic. Without it the cabin
  // could not be isolated at all: `setSignVisible(false, true)` would set `group.visible = false`
  // and `updateHud()` would set it straight back on the very next frame, so obligation T7's
  // isolation would report success and measure a windscreen 1 m from the lens anyway. That is the
  // project's dominant failure mode with an extra step, and gates_p6 caught it.
  resetPerf() { this.msTotal = 0; this.msN = 0; this.msWorst = 0; return true; }
  setHidden(on) { this.hidden = !!on; if (this.hidden) this.group.visible = false; return this.hidden; }
  setVisible(on) { this.group.visible = !!on && !this.hidden; return this.group.visible; }
  get visible() { return this.group.visible; }
  setTint(hex) {
    this.tint = hex;
    if (!this.flash) this.ruleMat.color.setHex(hex).multiplyScalar(0.2);
    return hex;
  }
  // §8.1: "on collision, the frame edge rule flashes red for 0.3 s. That is the entire damage
  // feedback." No damage model, no fail state (§6.3 item 4).
  hit() { this.flash = 0.3; return this.flash; }

  // The falsification hook for the no-occupant gate. Nothing in the game calls it; gates_p6 does,
  // to show the check CAN fail — a check that has never been seen to fail is not a check.
  testOccupant(on) {
    if (on && !this._occupant) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x884422, fog: false }));
      m.position.set(0, -0.15, -0.1);
      m.name = 'cockpit.occupant';
      m.userData.role = 'occupant';
      this._occupant = m;
      this.group.add(m);
    } else if (!on && this._occupant) {
      this.group.remove(this._occupant);
      this._occupant.geometry.dispose();
      this._occupant.material.dispose();
      this._occupant = null;
    }
    return !!this._occupant;
  }

  // Every mesh in the cabin, with what it is and how big. §13's "no occupant, no hands, no seat
  // (explicit check)" reads this.
  parts() {
    const out = [];
    this.group.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry;
      g.computeBoundingBox();
      const b = g.boundingBox;
      out.push({
        name: o.name, role: o.userData.role || 'unknown',
        tris: (g.index ? g.index.count : g.attributes.position.count) / 3,
        verts: g.attributes.position.count,
        box: [+b.min.x.toFixed(3), +b.min.y.toFixed(3), +b.min.z.toFixed(3),
          +b.max.x.toFixed(3), +b.max.y.toFixed(3), +b.max.z.toFixed(3)],
        visible: o.visible,
      });
    });
    return out;
  }

  breakdown() {
    let tris = 0, draws = 0;
    for (const m of [this.shell, this.rules, this.glass, this.dash, this.holo]) {
      if (!m.visible) continue;
      draws++;
      tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    }
    return {
      draws, tris,
      rows: [
        ['cockpit.shell', 1, triCount(this.shell)],
        ['cockpit.rules', 1, triCount(this.rules)],
        ['cockpit.glass', this.glass.visible ? 1 : 0, triCount(this.glass)],
        ['cockpit.dash', 1, triCount(this.dash)],
        ['cockpit.holo', 1, triCount(this.holo)],
      ],
    };
  }

  // ── per frame ────────────────────────────────────────────────────────────
  // `ctx` carries the craft pose (NOT the camera's — see deviation 2 in the header), the camera
  // forward for the look-away fade, and the HUD data model.
  update(dt, ctx) {
    if (!this.group.visible) return false;
    const t0 = performance.now();
    this.t += dt;
    this.data = ctx.data;

    // Anchor: craft position + eye height, craft heading, cosmetic bank. `heading` and `bank` are
    // passed in rather than read off a flight model, because §12.1's `cockpit` scenario has a
    // fixed camera and NO flight model — and a cabin that silently defaulted to heading 0 there
    // would render its own back wall into the one frame this phase is scored on.
    const m = new THREE.Matrix4();
    const e = new THREE.Euler(ctx.vpitch || 0, ctx.heading || 0, (ctx.bank || 0) * F.COCKPIT.rollMul, 'YXZ');
    this.bob = Math.sin(this.t * 1.7) * 0.006;                 // §8.3's +/-6 mm
    m.compose(
      new THREE.Vector3(ctx.x, ctx.y + F.COCKPIT.height + this.bob, ctx.z),
      new THREE.Quaternion().setFromEuler(e),
      new THREE.Vector3(1, 1, 1));
    this.group.matrix.copy(m);
    this.group.matrixWorldNeedsUpdate = true;

    // Contact flash (§8.1).
    if (ctx.contact) this.flash = 0.3;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const k = this.flash / 0.3;
      this.ruleMat.color.setHex(0xff2b3a).multiplyScalar(0.16 + 0.5 * k);
    } else {
      this.ruleMat.color.setHex(this.tint).multiplyScalar(0.2);
    }

    // Canopy: droplets drift upward with speed (§8.1) and the whole plane switches off when there
    // is neither rain nor enough sheen to see — a `visible = false` mesh is not a draw call.
    const rain = ctx.rain || 0;
    const sheen = 0.10 + rain * 0.62;
    this.glassMat.opacity = sheen;
    this.glass.visible = sheen > 0.03;
    if (this.glassMat.map) {
      this.glassMat.map.offset.y += dt * (0.02 + (ctx.speed || 0) * 0.0055);
      this.glassMat.map.offset.x = Math.sin(this.t * 0.13) * 0.02;
    }

    // §8.2 — 12 fps (6 on LOW). The canvas is the cost; the plane is one quad.
    const dashHz = this.low ? HUD.DASH_HZ_LOW : HUD.DASH_HZ;
    this.dashAcc += dt;
    if (this.dashAcc >= 1 / dashHz) { this.dashAcc = 0; this.drawDash(ctx.data || {}); }

    // §8.3 — 4 fps (2 on LOW), plus the look-away fade, which runs at the same rate because it is
    // the same 12 vertex writes.
    const holoHz = this.low ? HUD.HOLO_HZ_LOW : HUD.HOLO_HZ;
    this.holoAcc += dt;
    if (this.holoAcc >= 1 / holoHz) {
      this.holoAcc = 0;
      this.drawHolo(ctx.data || {});
      this.applyFade(ctx.fwd, ctx.data || {}, ctx.eye);
    }

    const ms = performance.now() - t0;
    this.msWorst = Math.max(this.msWorst, ms);
    this.msTotal += ms; this.msN++;
    return true;
  }

  // §8.3: "panels fade to 0.35 opacity when the player is looking away from them (dot product
  // with the camera forward), so they never fight the city for attention."
  //
  // **The dot is taken against the direction from the EYE TO THE PANEL, not against the panel's
  // own normal**, and the difference is not pedantry — the first version used the normal and
  // produced the opposite behaviour: looking left faded the LEFT panel, because a left-hand panel
  // is angled inward and turning toward it turns away from its face. "Looking away from them" is
  // a statement about where the panel is in your field of view, which is exactly this quantity.
  // gates_p6 caught it by asserting which of the two panels drops.
  applyFade(fwd, data, eye) {
    const col = this.holo.geometry.attributes.color;
    const n = new THREE.Vector3();
    const panels = this.lay.panels;
    for (let p = 0; p < panels.length; p++) {
      const P = panels[p];
      // The panel's centre in world space, then the unit direction from the eye to it. The eye
      // DEFAULTS to the cabin's own origin — the pilot's eye point — rather than to the live
      // camera, because in chase view the camera is 9.5 m behind the hull and from there all three
      // panels lie in nearly the same direction, which collapses the fade to a single value. In
      // cockpit view, which is the only view the panels are drawn in, the two are the same point.
      n.set(P.pos[0], P.pos[1], P.pos[2]).applyMatrix4(this.group.matrix);
      n.sub(eye || _eyeOf(this.group, _tmpEye));
      n.normalize();
      const dot = fwd ? fwd.dot(n) : 1;
      let k = HUD.HOLO_FADE + (1 - HUD.HOLO_FADE) * clamp((dot - HUD.HOLO_FADE_DOT) / (1 - HUD.HOLO_FADE_DOT), 0, 1);
      // The comms panel is "centre-low, ONLY WHEN RELEVANT" (§8.3): no speaker, no panel.
      if (P.id === 'comms' && !data.comms) k = 0;
      this.fade[p] = +k.toFixed(4);
      for (let v = 0; v < 4; v++) {
        const i = p * 4 + v;
        col.setXYZ(i, k, k, k);
      }
    }
    col.needsUpdate = true;
    return this.fade.slice();
  }

  // ── §8.2's canvas ───────────────────────────────────────────────────────
  // Two layouts, dispatched on the arrangement the aspect chose. They are not the same drawing at
  // two scales: the portrait sheet drops the heading tape, the lane ticks and the cargo row, and
  // spends the space it wins on three numbers a player can read at arm's length. Judged on a
  // phone in portrait, which is the platform the brief names first — the landscape sheet scaled
  // into a 0.35 m plane put 8 px labels onto three device pixels.
  drawDash(d) {
    this.dashDraws++;
    const c = this.dashCanvas, g = c.getContext('2d');
    const W = this.lay.dash.cw, H = this.lay.dash.ch;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.scale(c.width / W, c.height / H);                 // LOW draws the same layout at half scale
    g.fillStyle = '#070a10';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(53,230,255,0.14)';
    g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
    if (this.lay.wide) this._dashWide(g, d, W, H);
    else this._dashTall(g, d, W, H);
    g.restore();
    this.dashTex.needsUpdate = true;
    return this.dashDraws;
  }

  // The shared pieces, so the two layouts cannot disagree about what a redline or a lane tick is.

  // §8.2's 200 deg speed arc with a thin needle, redline past 85 % of max.
  _speedArc(g, d, cx, cy, R, numSize) {
    const speed = d.speed || 0, maxSpeed = d.maxSpeed || F.MAX_FWD;
    const A0 = 170 * D2R, A1 = A0 + 200 * D2R;
    g.lineCap = 'butt';
    g.lineWidth = R * 0.13;
    g.strokeStyle = 'rgba(53,230,255,0.16)';
    g.beginPath(); g.arc(cx, cy, R, A0, A1); g.stroke();
    g.strokeStyle = 'rgba(255,43,58,0.45)';
    g.beginPath(); g.arc(cx, cy, R, A0 + (A1 - A0) * 0.85, A1); g.stroke();
    const k = clamp(speed / maxSpeed, 0, 1);
    g.strokeStyle = k > 0.85 ? '#ff5a52' : '#35e6ff';
    g.beginPath(); g.arc(cx, cy, R, A0, A0 + (A1 - A0) * k); g.stroke();
    const na = A0 + (A1 - A0) * k;
    g.strokeStyle = '#eaf6ff'; g.lineWidth = Math.max(1.6, R * 0.045);
    g.beginPath();
    g.moveTo(cx + Math.cos(na) * R * 0.28, cy + Math.sin(na) * R * 0.28);
    g.lineTo(cx + Math.cos(na) * (R + R * 0.09), cy + Math.sin(na) * (R + R * 0.09));
    g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = d.boost ? '#ffb238' : '#eaf6ff';
    g.font = `300 ${numSize}px ui-monospace, Menlo, monospace`;
    g.fillText(Math.round(speed), cx, cy + numSize * 0.12);
    g.fillStyle = 'rgba(150,170,192,0.95)';
    g.font = `600 ${Math.round(numSize * 0.34)}px ui-monospace, Menlo, monospace`;
    g.fillText('M/S', cx, cy + numSize * 0.62);
    const mode = d.boost ? 'BOOST' : d.altHold ? 'ALT HOLD' : null;
    if (mode) {
      g.fillStyle = d.boost ? '#ffb238' : 'rgba(53,230,255,0.9)';
      g.font = `700 ${Math.round(numSize * 0.32)}px ui-monospace, Menlo, monospace`;
      g.fillText(mode, cx, cy - R * 0.62);
    }
  }

  // A labelled vertical gauge with a big number beside it. `ticks` draws §8.2's lane-altitude set.
  _gauge(g, { x, y, w, h, k, label, value, color, dim, ticks, numSize, labelSize }) {
    g.fillStyle = dim; g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y + h * (1 - k), w, h * k);
    if (ticks) {
      g.strokeStyle = 'rgba(207,226,245,0.5)'; g.lineWidth = 1;
      for (const la of LANE_ALT) {
        const kk = clamp((la - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1);
        const ty = y + h * (1 - kk);
        g.beginPath(); g.moveTo(x - 3, ty); g.lineTo(x + w + 3, ty); g.stroke();
      }
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(150,170,192,0.95)';
    g.font = `600 ${labelSize}px ui-monospace, Menlo, monospace`;
    g.fillText(label, x, y - labelSize * 0.5);
    g.fillStyle = color;
    g.font = `300 ${numSize}px ui-monospace, Menlo, monospace`;
    g.fillText(value, x + w + 8, y + numSize * 0.9);
  }

  _headingTape(g, d, x, y, w, h) {
    const bearing = ((-(d.heading || 0) * 180 / Math.PI) % 360 + 360) % 360;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = 'rgba(53,230,255,0.06)'; g.fillRect(x, y, w, h);
    g.font = '700 11px ui-monospace, Menlo, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = x + w / 2, px = w / 190;
    for (let b = -95; b <= 95; b += 15) {
      const deg = bearing + b;
      const tx = cx + b * px;
      const major = ((Math.round(deg) % 45) + 45) % 45 < 8;
      g.strokeStyle = major ? 'rgba(53,230,255,0.6)' : 'rgba(53,230,255,0.24)';
      g.beginPath(); g.moveTo(tx, y + 1); g.lineTo(tx, y + (major ? h * 0.45 : h * 0.3)); g.stroke();
      if (major) { g.fillStyle = 'rgba(215,232,248,0.9)'; g.fillText(COMPASS(deg), tx, y + h * 0.72); }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,178,56,0.95)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + w / 2, y - 1); g.lineTo(x + w / 2, y + h + 1); g.stroke();
  }

  // ── landscape: the full §8.2 instrument set ─────────────────────────────
  _dashWide(g, d, W, H) {
    const alt = d.alt || 0, cell = d.cell === undefined ? 1 : d.cell;
    this._headingTape(g, d, 96, 5, 320, 21);
    this._speedArc(g, d, 62, 96, 50, 40);

    this._gauge(g, {
      x: 138, y: 42, w: 13, h: 100,
      k: clamp((alt - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1),
      label: 'ALT', value: `${Math.round(alt)} m`,
      color: alt > F.ALT_WARN ? '#ffb238' : '#35e6ff',
      dim: 'rgba(53,230,255,0.09)', ticks: true, numSize: 21, labelSize: 12,
    });
    this._gauge(g, {
      x: 246, y: 42, w: 13, h: 100, k: clamp(cell, 0, 1),
      label: 'CELL', value: `${Math.round(cell * 100)}%`,
      color: cell < 0.15 ? '#ff2b3a' : '#ffb04a',
      dim: 'rgba(255,178,56,0.10)', ticks: false, numSize: 21, labelSize: 12,
    });

    // cargo slots — N outlined squares, filled when occupied (§8.2)
    const slots = d.cargoMax || 3, cargo = d.cargo || 0;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '600 12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(150,170,192,0.95)';
    g.fillText('CARGO', 350, 36);
    for (let i = 0; i < slots; i++) {
      const x = 350 + i * 26, y = 44;
      g.strokeStyle = 'rgba(108,255,156,0.6)'; g.lineWidth = 1.4;
      g.strokeRect(x + 0.7, y + 0.7, 19, 19);
      if (i < cargo) { g.fillStyle = 'rgba(108,255,156,0.85)'; g.fillRect(x + 4, y + 4, 13, 13); }
    }

    // the one task line (§8.2)
    g.textBaseline = 'middle';
    if (d.task) {
      g.fillStyle = '#6cff9c';
      g.font = '500 19px ui-monospace, Menlo, monospace';
      g.fillText(fit(g, `→ ${d.task.name}`, W - 366), 350, 96);
      g.fillStyle = 'rgba(215,232,248,0.9)';
      g.font = '400 16px ui-monospace, Menlo, monospace';
      g.fillText(`${d.task.km.toFixed(1)} km   ⏱ ${mmss(d.task.eta)}`, 350, 121);
    } else {
      g.fillStyle = 'rgba(150,170,192,0.85)';
      g.font = '500 17px ui-monospace, Menlo, monospace';
      g.fillText('NO ACTIVE JOB', 350, 96);
      g.font = '400 13px ui-monospace, Menlo, monospace';
      // measured, not guessed — the literal "dock at a HUB pad for work" ran off the sheet
      g.fillText(fit(g, 'dock at a HUB pad', W - 358), 350, 120);
    }

    g.font = '700 12px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(53,230,255,0.62)';
    g.textAlign = 'center';
    g.fillText((d.place || '').toUpperCase(), 62, 150);
  }

  // ── portrait: three numbers, four times the size ────────────────────────
  _dashTall(g, d, W, H) {
    const alt = d.alt || 0, cell = d.cell === undefined ? 1 : d.cell;
    this._speedArc(g, d, W / 2, 74, 58, 54);

    // ALT and CELL as big paired readouts under the arc, bars as thin underlines rather than
    // columns — a 13 px column is invisible at this scale and the number is what gets read.
    const row = (x, label, value, k, color, dim) => {
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(150,170,192,0.95)';
      g.font = '700 12px ui-monospace, Menlo, monospace';
      g.fillText(label, x, 150);
      g.fillStyle = color;
      g.font = '300 30px ui-monospace, Menlo, monospace';
      g.fillText(value, x, 180);
      g.fillStyle = dim; g.fillRect(x, 188, 140, 4);
      g.fillStyle = color; g.fillRect(x, 188, 140 * clamp(k, 0, 1), 4);
    };
    row(16, 'ALT', `${Math.round(alt)}m`,
      clamp((alt - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1),
      alt > F.ALT_WARN ? '#ffb238' : '#35e6ff', 'rgba(53,230,255,0.14)');
    row(184, 'CELL', `${Math.round(cell * 100)}%`, cell,
      cell < 0.15 ? '#ff2b3a' : '#ffb04a', 'rgba(255,178,56,0.14)');

    // one task line, and cargo as pips beside it — no room for outlined squares at this width
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const slots = d.cargoMax || 3, cargo = d.cargo || 0;
    for (let i = 0; i < slots; i++) {
      g.fillStyle = i < cargo ? 'rgba(108,255,156,0.9)' : 'rgba(108,255,156,0.22)';
      g.fillRect(16 + i * 12, 122, 8, 8);
    }
    if (d.task) {
      g.fillStyle = '#6cff9c';
      g.font = '500 15px ui-monospace, Menlo, monospace';
      g.fillText(fit(g, `→ ${d.task.name}  ${d.task.km.toFixed(1)}km`, W - 76), 60, 126);
    } else {
      g.fillStyle = 'rgba(150,170,192,0.8)';
      g.font = '500 14px ui-monospace, Menlo, monospace';
      g.fillText('NO ACTIVE JOB', 60, 126);
    }
  }

  // ── §8.3's canvas — three bands in one sheet ────────────────────────────
  drawHolo(d) {
    const c = this.holoCanvas, g = c.getContext('2d');
    const W = c.width, BH = c.height / 3;
    const s = W / HUD.HOLO_W;
    this.holoDraws++;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, c.height);

    const band = (i, fn) => {
      g.save();
      g.translate(0, i * BH);
      g.beginPath(); g.rect(0, 0, W, BH); g.clip();
      g.scale(s, s);
      fn(g, HUD.HOLO_W, HUD.HOLO_H);
      g.restore();
    };
    const scan = (g2, w, h) => {
      g2.fillStyle = 'rgba(0,0,0,0.30)';
      for (let y = 0; y < h; y += 4) g2.fillRect(0, y, w, 2);     // §8.3's 2 px scanline
    };

    // left — the active job (§8.3)
    band(0, (g2, w, h) => {
      g2.fillStyle = 'rgba(10,26,34,0.55)'; g2.fillRect(0, 0, w, h);
      g2.strokeStyle = 'rgba(53,230,255,0.75)'; g2.lineWidth = 2;
      g2.strokeRect(1, 1, w - 2, h - 2);
      g2.textAlign = 'left'; g2.textBaseline = 'top';
      g2.font = '700 13px ui-monospace, Menlo, monospace';
      g2.fillStyle = '#35e6ff'; g2.fillText('ACTIVE JOB', 12, 10);
      g2.font = '400 15px ui-monospace, Menlo, monospace';
      if (d.job) {
        g2.fillStyle = '#eaf6ff'; g2.fillText(d.job.client, 12, 34);
        g2.fillStyle = 'rgba(207,226,245,0.8)'; g2.font = '400 13px ui-monospace, Menlo, monospace';
        g2.fillText(`${d.job.parcel} → ${d.job.dest}`, 12, 56);
        g2.fillStyle = '#6cff9c'; g2.fillText(`${d.job.pay} CRD`, 12, 78);
        const k = clamp(d.job.timeLeft / Math.max(1, d.job.timeTotal), 0, 1);
        g2.fillStyle = 'rgba(53,230,255,0.15)'; g2.fillRect(12, 102, w - 24, 6);
        g2.fillStyle = k < 0.25 ? '#ff2b3a' : '#35e6ff'; g2.fillRect(12, 102, (w - 24) * k, 6);
      } else {
        g2.fillStyle = 'rgba(125,142,163,0.85)';
        g2.fillText('no parcel aboard', 12, 40);
        g2.font = '400 13px ui-monospace, Menlo, monospace';
        g2.fillText(fit(g2, 'the board is at any HUB pad', w - 24), 12, 66);
      }
      scan(g2, w, h);
    });

    // right — nearest zone + the cell-range readout (§8.3; this REPLACES the heat pip row,
    // DECISIONS decision 6 — there is no heat in this game and nothing here may imply one)
    band(1, (g2, w, h) => {
      g2.fillStyle = 'rgba(10,26,34,0.55)'; g2.fillRect(0, 0, w, h);
      g2.strokeStyle = 'rgba(53,230,255,0.75)'; g2.lineWidth = 2;
      g2.strokeRect(1, 1, w - 2, h - 2);
      g2.textAlign = 'left'; g2.textBaseline = 'top';
      g2.font = '700 13px ui-monospace, Menlo, monospace';
      g2.fillStyle = '#35e6ff'; g2.fillText('NEAREST PAD', 12, 10);
      if (d.nearest) {
        const ty = ZONE_TYPES[d.nearest.type] || ZONE_TYPES.PICKUP;
        g2.font = '700 22px system-ui, sans-serif';
        g2.fillStyle = hexs(ty.color); g2.fillText(ty.glyph, 12, 32);
        g2.font = '400 15px ui-monospace, Menlo, monospace';
        g2.fillStyle = '#eaf6ff'; g2.fillText(d.nearest.name, 44, 36);
        g2.font = '400 13px ui-monospace, Menlo, monospace';
        g2.fillStyle = 'rgba(207,226,245,0.8)';
        g2.fillText(`${d.nearest.km.toFixed(2)} km`, 44, 58);
      } else {
        g2.font = '400 13px ui-monospace, Menlo, monospace';
        g2.fillStyle = 'rgba(125,142,163,0.85)'; g2.fillText('none in range', 12, 36);
      }
      // §7.4.1's number, which is what makes this panel worth its pixels: how many minutes of
      // cruise are left, and whether the nearest CHARGE pad is inside that.
      g2.font = '400 13px ui-monospace, Menlo, monospace';
      const mins = d.cellMinutes === undefined ? null : d.cellMinutes;
      g2.fillStyle = mins !== null && mins < 3 ? '#ff5a52' : '#ffb04a';
      g2.fillText(mins === null ? 'CELL —' : `CELL ${mins.toFixed(0)} MIN`, 12, 84);
      g2.fillStyle = d.chargeInRange === false ? '#ff5a52' : 'rgba(108,255,156,0.9)';
      g2.font = '400 11px ui-monospace, Menlo, monospace';
      g2.fillText(d.chargeInRange === false ? 'CHARGE PAD OUT OF RANGE'
        : d.chargeInRange === true ? 'charge pad within range' : 'charge pads unmapped', 12, 104);
      scan(g2, w, h);
    });

    // centre-low — comms, only when relevant (§8.3)
    band(2, (g2, w, h) => {
      if (!d.comms) return;
      g2.fillStyle = 'rgba(26,14,30,0.5)'; g2.fillRect(0, 0, w, h);
      g2.strokeStyle = 'rgba(255,62,165,0.7)'; g2.lineWidth = 2;
      g2.strokeRect(1, 1, w - 2, h - 2);
      g2.textAlign = 'left'; g2.textBaseline = 'middle';
      g2.font = '700 13px ui-monospace, Menlo, monospace';
      g2.fillStyle = '#ff3ea5'; g2.fillText(d.comms.speaker, 12, 26);
      const lv = clamp(d.comms.level || 0, 0, 1);
      for (let i = 0; i < 20; i++) {
        g2.fillStyle = i / 20 < lv ? 'rgba(255,62,165,0.9)' : 'rgba(255,62,165,0.16)';
        g2.fillRect(12 + i * 17, 62, 12, 26);
      }
      scan(g2, w, h);
    });

    this.holoTex.needsUpdate = true;
    return this.holoDraws;
  }

  state() {
    return {
      visible: this.group.visible, low: this.low,
      dashHz: this.low ? HUD.DASH_HZ_LOW : HUD.DASH_HZ,
      holoHz: this.low ? HUD.HOLO_HZ_LOW : HUD.HOLO_HZ,
      dashDraws: this.dashDraws, holoDraws: this.holoDraws,
      dash: [this.dashCanvas.width, this.dashCanvas.height],
      holo: [this.holoCanvas.width, this.holoCanvas.height],
      fade: this.fade.slice(), flash: +this.flash.toFixed(3), bob: +this.bob.toFixed(5),
      glass: this.glass.visible, glassOpacity: +this.glassMat.opacity.toFixed(3),
      tint: this.tint, occupant: !!this._occupant,
      ms: +(this.msN ? this.msTotal / this.msN : 0).toFixed(4), msWorst: +this.msWorst.toFixed(4),
      near: CAMERA.near, cabinZ: HUD.CABIN_Z,
    };
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of [this.shell, this.rules, this.glass, this.dash, this.holo]) {
      m.geometry.dispose(); m.material.dispose();
    }
    this.dashTex.dispose(); this.holoTex.dispose();
  }
}

// ── the chase-view instrument strip ────────────────────────────────────────
// NOT in §8. §8 assumes the player is in the cabin, but save.js ships `camera: 'chase'` (P5 set
// it so the hull is in frame and acts as one of §3.10's scale cues) — so in the DEFAULT view the
// dash is behind the camera and the player has no speed, no altitude and no cell reading at all,
// which is exactly the gap this phase exists to close. This is DOM, it is three chips and a task
// line, it costs zero draw calls, and it reads the same data model the dash does so the two can
// never disagree. It hides itself the moment the player is in the cabin.

export class ChaseStrip {
  constructor(el) { this.el = el; this.n = 0; this.shown = false; this._last = ''; }
  setVisible(on) {
    this.shown = !!on;
    this.el.classList.toggle('hidden', !on);
    return this.shown;
  }
  draw(d) {
    if (!this.shown) return false;
    const cell = d.cell === undefined ? 1 : d.cell;
    const html =
      `<div class="chip"><b>${Math.round(d.speed || 0)}</b><i>m/s</i></div>` +
      `<div class="chip"><b>${Math.round(d.alt || 0)}</b><i>m</i></div>` +
      `<div class="chip${cell < 0.15 ? ' bad' : ''}"><b>${Math.round(cell * 100)}</b><i>% cell</i></div>` +
      (d.task ? `<div class="chip task">→ ${esc(d.task.name)} · ${d.task.km.toFixed(1)} km</div>`
        : `<div class="chip task dim">no active job</div>`);
    if (html !== this._last) { this.el.innerHTML = html; this._last = html; }
    this.n++;
    return true;
  }
}

// ── geometry helpers ───────────────────────────────────────────────────────

function buildBoxes(list) {
  const pos = [], nor = [], uv = [], idx = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  for (const part of list) {
    const g = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
    m.compose(
      new THREE.Vector3(part.pos[0], part.pos[1], part.pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        part.rot[0] * D2R, part.rot[1] * D2R, part.rot[2] * D2R, 'XYZ')),
      new THREE.Vector3(1, 1, 1));
    nm.getNormalMatrix(m);
    const gp = g.attributes.position, gn = g.attributes.normal, gu = g.attributes.uv;
    const base = pos.length / 3;
    for (let i = 0; i < gp.count; i++) {
      v.fromBufferAttribute(gp, i).applyMatrix4(m);
      n.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uv.push(gu.getX(i), gu.getY(i));
    }
    const gi = g.index;
    for (let i = 0; i < gi.count; i++) idx.push(base + gi.getX(i));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

// Three quads, one geometry, three UV bands into one sheet. Vertex order is panel-major so
// `applyFade` can address panel p's four vertices as [4p, 4p+3].
function buildPanels(panels) {
  const pos = [], uv = [], col = [], idx = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  panels.forEach((P, p) => {
    m.compose(
      new THREE.Vector3(P.pos[0], P.pos[1], P.pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(P.rot[0] * D2R, P.rot[1] * D2R, P.rot[2] * D2R, 'YXZ')),
      new THREE.Vector3(1, 1, 1));
    const hw = P.w / 2, hh = P.h / 2;
    const corners = [[-hw, hh], [hw, hh], [-hw, -hh], [hw, -hh]];
    // three bands stacked top-to-bottom in the sheet; v runs 1 → 0 down the canvas
    const v0 = 1 - (P.band + 1) / 3, v1 = 1 - P.band / 3;
    const uvs = [[0, v1], [1, v1], [0, v0], [1, v0]];
    for (let i = 0; i < 4; i++) {
      v.set(corners[i][0], corners[i][1], 0).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      uv.push(uvs[i][0], uvs[i][1]);
      col.push(1, 1, 1);
    }
    const b = p * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// Truncate to a measured width. A destination name that runs off the dash is not a task line, and
// `measureText` is the only honest way to know — a character budget guesses.
function fit(g, s, w) {
  if (g.measureText(s).width <= w) return s;
  let t = s;
  while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}

const triCount = m => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const hexs = h => `#${('000000' + h.toString(16)).slice(-6)}`;
const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

function mmss(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
}

const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function COMPASS(deg) {
  const d = ((deg % 360) + 360) % 360;
  const i = Math.round(d / 45) % 8;
  return Math.abs(d - i * 45) < 8 ? CARDINAL[i] : String(Math.round(d)).padStart(3, '0');
}

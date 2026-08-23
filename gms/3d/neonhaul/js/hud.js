// §8.1 cockpit · §8.2 dashboard · §8.3 floating holo panels. The whole diegetic HUD, in five
// draw calls.
//
// ── the draw-call architecture, which is the point ─────────────────────────
//
// §8.1/§8.2/§8.3 price this at 6 + 1 + 3 = 10 draws. P5 got the entire vehicle layer — player
// craft plus every traffic craft in the world — into five, and it did that by refusing to let
// "one object" mean "one mesh". The same rule applies here:
//
//   shell   every solid part of the cabin — both A-pillars, the dash lip, the two side consoles —
//           merged into ONE BufferGeometry at build time. They never move relative to each other,
//           so there is nothing an object split would buy. §S2-L made the pillars GLASS without
//           splitting the mesh: the material is white with RGBA vertex colours, so "which parts are
//           see-through" is a per-vertex attribute rather than a second material.
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
// gate can read off this table rather than a claim in a handoff. `role` is what the part IS.
//
// This comment used to say "gates_p6 asserts the set of roles present is exactly ROLES_ALLOWED".
// **It never did.** gates_p6 asserts the MESH roles — frame / rule / glass / dash / holo — which is
// a different list on a different object, and §S2-L found that nothing in js/ or tools/ read
// ROLES_ALLOWED at all. An exported constant, a comment claiming a gate enforced it, and no gate:
// the twenty-second instance of this project's one failure mode. `Cockpit.roles()` exists now and
// gates_s2l D4 reads it.

// §S2-L. `roof` is GONE from this list, and that is the point of the phase. Aaron, on the shipped
// build: *"there is a big black bar if i look up, it doesn't look good, have it all glass, I almost
// want the exact same view as chase but dashboard instead of chasing car."* The bar was `roof_lip`
// and `roof_spar` in near-black metal, and there was nothing in them worth saving.
export const ROLES_ALLOWED = ['pillar', 'dash', 'console'];

const Z = HUD.CABIN_Z;

// Two surfaces, one merged geometry. `col` is an RGBA vertex colour and it is what lets the
// A-pillars be GLASS while the dash mouldings stay near-black metal without a second draw call:
// the shell material is white with `vertexColors`, so each part carries its own colour and its own
// alpha. SOLID reproduces the old 0x0c0e12 shell exactly (three converts a hex through sRGB, so the
// literal has to come from THREE.Color rather than from 12/255).
const SOLID = new THREE.Color(0x0c0e12);
const GLASSY = new THREE.Color(0x63879f);

const PARTS = [
  // id                 role       pos                       size                 rot (deg)   colour
  ['pillar_l',          'pillar',  [-0.62, 0.16, -Z * 0.98], [0.075, 1.05, 0.10], [0, 0, 10],  [GLASSY, 0.26]],
  ['pillar_r',          'pillar',  [0.62, 0.16, -Z * 0.98],  [0.075, 1.05, 0.10], [0, 0, -10], [GLASSY, 0.26]],
  // The lip is deliberately SHALLOW and pushed back. Its first version was 0.72 m deep centred at
  // 0.66 m, so its near edge came within 0.30 m of the eye — and a horizontal surface that close
  // projects to the bottom 40 % of the frame as featureless black, which on a phone is most of the
  // screen spent on nothing. S2 cut it again to match a halved instrument plane. As of §S2-L the
  // DOM control lip covers the band where this sits, so what it does now is give the pilot a floor
  // to see when the view is pitched down past the instrument top.
  ['dash_lip',          'dash',    [0, -0.545, -Z * 0.84],   [1.74, 0.10, 0.40],  [-9, 0, 0],  [SOLID, 1]],
  ['dash_face',         'dash',    [0, -0.455, -Z * 0.67],   [1.42, 0.06, 0.05],  [-30, 0, 0], [SOLID, 1]],
  // The two side consoles. They were the housings the floating control cluster stood over; §S2-L
  // moved the controls into a DOM lip along the bottom, so what these are now is the moulded ENDS
  // of that lip in 3D — off screen in portrait at +/-0.60 m, and the shoulders the keys sit on in
  // landscape. Kept rather than deleted: they are what stops the lip's two ends reading as painted
  // onto the glass when the pilot looks down.
  ['console_l',         'console', [-0.60, -0.415, -Z * 0.53], [0.26, 0.14, 0.38], [-8, 0, 14],  [SOLID, 1]],
  ['console_r',         'console', [0.60, -0.415, -Z * 0.53],  [0.26, 0.14, 0.38], [-8, 0, -14], [SOLID, 1]],
];

// The emissive edge rules — §8.1's "4 mm emissive edge rule in the district tint at 0.2".
const RULES = [
  [[-0.572, 0.16, -Z * 0.955], [0.006, 1.02, 0.004], [0, 0, 10]],
  [[0.572, 0.16, -Z * 0.955], [0.006, 1.02, 0.004], [0, 0, -10]],
  [[0, -0.417, -Z * 0.675], [1.40, 0.006, 0.004], [-30, 0, 0]],
  [[-0.60, -0.338, -Z * 0.53], [0.25, 0.005, 0.004], [-8, 0, 14]],
  [[0.60, -0.338, -Z * 0.53], [0.25, 0.005, 0.004], [-8, 0, -14]],
  // Two short verticals down the inboard face of each console. Small, cheap, and the thing that
  // reads as "expensive" at a glance: an unbroken run of edge light around a moulded corner.
  [[-0.485, -0.415, -Z * 0.53], [0.004, 0.12, 0.004], [-8, 0, 14]],
  [[0.485, -0.415, -Z * 0.53], [0.004, 0.12, 0.004], [-8, 0, -14]],
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

export function layoutFor(aspect, fov = CAMERA.fov, lipFrac = 0) {
  const wide = aspect >= 1.15;
  const tan = Math.tan(fov * 0.5 * D2R);
  // Half-extents of the visible frame AT a given cabin depth. Everything below is expressed as a
  // fraction of these rather than in metres, because a metre that fits at 62 deg is off screen at
  // 58 and marooned in the middle at 78 — and the FOV is a settings row the player can drag. The
  // shipped build had exactly that defect: at the default 62 the left holo panel's outer edge
  // landed on x = -0.2625 against a visible -0.2626, so it was clipped on every portrait phone.
  const hw = z => tan * z * aspect;
  const hh = z => tan * z;

  const zPanel = Z * 0.86, zDash = Z * 0.62;
  const pHW = hw(zPanel);
  // Panel width and offset as fractions of the visible half-width, so the pair always frames the
  // view with a real margin instead of sitting on the edge of it.
  // S2-D widened the portrait pair from 0.72. At 0.72 a band landed in ~140 CSS px on a 390-wide
  // phone and no type size survived the mapping; 0.80 buys 16 px each and still leaves a real gap
  // down the middle of the frame (the two panels together span 1.60 of the 2.0 half-widths).
  const pw = pHW * (wide ? 0.46 : 0.80);
  // 0.13, not 0.05. The panels are yawed toward the pilot, so their INBOARD edge is nearer the
  // camera than their centre and projects wider than the flat half-width predicts — a margin
  // computed from pw/2 alone still clipped the left panel's first character on a 390 px frame.
  // The CAP is HUD.HOLO_LAT_DEG and it is not cosmetic: §8.3's look-away fade completes at
  // HOLO_FADE_DOT (45 deg), and a panel parked further off the axis than ~25 deg is already
  // part-faded when the pilot is looking straight at the city. gates_p6 measures exactly that.
  const lat = Math.min(pHW - pw / 2 - pHW * (wide ? 0.13 : 0.09), zPanel * Math.tan(HUD.HOLO_LAT_DEG * D2R));
  const yaw = wide ? 22 : 8;
  // The comms band is §8.3's "centre-low, ONLY when relevant" and it is deliberately the SMALLEST
  // of the three: with the chatter ticker now living in the dash housing this is a transmission
  // indicator, not a second place to read the same line. Its first S2 size put a pink slab across
  // the middle of a portrait frame.
  const cw = pHW * (wide ? 0.40 : 0.52);
  const py = hh(zPanel) * (wide ? 0.12 : 0.50);

  // ── the dash plane ────────────────────────────────────────────────────────
  // S2's "reduce the dash height by almost half". The height is not a free number: the canvas
  // aspect IS the quad aspect (a mismatch stretches every glyph on it), so the height comes from
  // config's DASH_H/DASH_W pair and the only lever here is the WIDTH. It is bottom-anchored — the
  // dash grows up from the floor of the frame rather than being centred on a guess — and capped so
  // a very wide desktop frame does not hand it the whole viewport.
  // Full-bleed in both arrangements now. The quad and the DOM lip under it have to read as one
  // moulding, and a quad inset from the frame edge above a lip that runs edge to edge reads as two
  // objects however well the gradients match.
  const dsh = wide
    ? { cw: HUD.DASH_W, ch: HUD.DASH_H, frac: 1.0, cap: 1.9 }
    : { cw: HUD.DASH_TW, ch: HUD.DASH_TH, frac: 0.98, cap: 0.52 };
  const ar = dsh.ch / dsh.cw;
  const dw = Math.min(2 * hw(zDash) * dsh.frac, dsh.cap);
  const pitch = -34;
  // Seating the plane on the floor of the frame is a PERSPECTIVE problem, not a flat one. Tilting
  // it about its own centre swings the near edge toward the eye — and a nearer edge projects
  // further down — so anchoring on `y - h·cos/2` against a flat half-height put the whole bottom
  // third of the dashboard, rounded corners and chat box included, below the bottom of the screen
  // on a landscape phone. It looked plausible in a portrait screenshot, which is exactly why it
  // survived a pass. Both edges are projected properly here and the BOTTOM one is placed.
  const dh = dw * ar;
  const yc = Math.cos(pitch * D2R) * dh * 0.5, zc = Math.abs(Math.sin(pitch * D2R)) * dh * 0.5;
  // §S2-L: the plane's bottom edge lands on the TOP OF THE LIP, not on the floor of the frame.
  // `lipFrac` is the lip's share of the viewport height, measured off the DOM (see `lipFrac()`),
  // so the seam between the laid-back instrument top and the face-on control lip is a real edge
  // between two touching surfaces rather than a gap the eye has to forgive.
  const bottomN = -1 + 2 * clamp(lipFrac, 0, 0.45);
  const dashY = yc + bottomN * tan * (zDash - zc);
  const topN = (dashY + yc) / (tan * (zDash + zc));   // normalised screen y of the plane's top edge
  const projH = dw * ar * Math.cos(pitch * D2R);

  return {
    wide, aspect: +aspect.toFixed(4), fov: +fov.toFixed(2),
    // What fraction of the frame's WIDTH one holo panel covers. drawHolo picks its dense or its
    // sparse variant from this rather than from `wide`, because the thing that decides whether
    // 13 px type survives is how many device pixels the panel gets — and a landscape PHONE gives
    // it about as few as a portrait one does.
    panelFrac: +(pw / (2 * pHW)).toFixed(4),
    dash: { w: dw, ar, cw: dsh.cw, ch: dsh.ch, y: +dashY.toFixed(4), z: -zDash, pitch,
      // what the QUAD costs the frame, top edge to the floor, after the perspective divide —
      // which now INCLUDES the lip, because the quad is seated on top of it
      screenFrac: +((topN + 1) / 2).toFixed(4), projH: +projH.toFixed(4),
      lipFrac: +lipFrac.toFixed(4) },
    // Every panel is h = w/3 because all three share one 384-wide, 128-tall band of the same
    // CanvasTexture. A panel quad at a different aspect from its band is stretched text.
    panels: [
      { id: 'job',   pos: [-lat, py, -zPanel], rot: [-4, yaw, 0], w: pw, h: pw / 3, band: 0 },
      { id: 'zone',  pos: [lat, py, -zPanel], rot: [-4, -yaw, 0], w: pw, h: pw / 3, band: 1 },
      { id: 'comms', pos: [0, -hh(Z * 0.74) * (wide ? 0.34 : 0.54), -Z * 0.74], rot: [-11, 0, 0],
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

  // §8.3's two drawings. The dense one is the full four-line panel; the sparse one carries the
  // same facts in a third of the lines at twice the size, and it is the right one whenever the
  // panel lands in fewer than ~260 CSS pixels — which a landscape phone does just as surely as a
  // portrait one. Choosing on orientation instead put 13 px type onto five device pixels on
  // every 844x390 handset, which is the defect §8.2's two dash sheets exist to avoid.
  holoDense() { return this.lay.panelFrac * (window.innerWidth || 1280) >= 260; }

  // §S2-L. The control lip's share of the viewport height, MEASURED rather than assumed, because
  // the number has to include whatever safe-area inset the device adds under it. `#lipsize` is a
  // zero-width probe carrying exactly the lip's own height expression, and it lives outside
  // #controls so it is still laid out while the control layer is hidden — which it is for the
  // whole of boot and for every ?nohud shot. No probe (a bare test page) falls back to the config
  // pair, which is the same number the stylesheet uses.
  lipFrac() {
    const h = window.innerHeight || 1;
    const el = typeof document === 'undefined' ? null : document.getElementById('lipsize');
    const px = el ? el.getBoundingClientRect().height : 0;
    return clamp((px || (this.aspectNow() >= 1.15 ? HUD.LIP_H_LAND : HUD.LIP_H)) / h, 0, 0.45);
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

    const geo = buildBoxes(PARTS.map(p => ({ pos: p[2], size: p[3], rot: p[4], col: p[5] })));
    // White base, colour in the attribute. `transparent` is what the glass pillars need and it
    // costs the dash mouldings nothing: at alpha 1 the blend is the same pixel the opaque pass
    // produced. The cabin keeps renderOrder 0, so it still draws before the dash quad (3), the
    // canopy (4) and the holo panels (5), which is the near-to-far order they sit in.
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, transparent: true,
      metalness: 0.85, roughness: 0.35, fog: false,
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
    this.fov = CAMERA.fov;
    this.lay = layoutFor(this.aspectNow(), this.fov, this.lipFrac());
    this.dashCanvas = document.createElement('canvas');
    this.sizeDash();
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    // TRANSPARENT, which is what buys S2's "rounded corners, no hard rectangles": the housing is
    // painted inside a rounded path and everything outside it is left as cleared alpha, so the
    // corner is a real corner against the lip behind it rather than a black square with a curve
    // drawn on it. `depthWrite` stays on — the plane is opaque where it is painted at all.
    this.dashMat = new THREE.MeshBasicMaterial({ map: this.dashTex, fog: false, transparent: true });
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
    // ── S2-D: the panels are NORMAL-blended, and that is the fix, not a preference ─────────
    //
    // The S2-A handover called these "the least legible thing in the cabin and the two largest UI
    // objects in the view". The cause was structural rather than cosmetic. ADDITIVE blending can
    // only ever ADD to what is behind it, so a panel over a bright tower can never be darker than
    // the tower — the text had no floor to sit on and washed out exactly where the city is
    // brightest. On top of that `drawHolo` painted 30 %-black scanlines over every second pair of
    // rows, which under additive blending does not darken the CITY at all; it only subtracts from
    // the panel's own glyphs. Two mechanisms, both removing contrast, neither adding any.
    //
    // Normal blending gives the symbology a combiner to sit on: the canvas now carries a dark
    // tinted glass plate and the neon is drawn opaque over it. That is also the truer reading of
    // Aaron's own definition — a HUD reflected onto a windscreen is a semi-transparent frame with a
    // transparent background of the same colour, which is an alpha statement, not an additive one.
    //
    // Cost: nothing. Same mesh, same draw call, same texture. gates_p6 asserts the cabin is exactly
    // 5 draws and it still is.
    this.holo = new THREE.Mesh(buildPanels(this.lay.panels), new THREE.MeshBasicMaterial({
      map: this.holoTex, vertexColors: true, transparent: true, fog: false,
      blending: THREE.NormalBlending, depthWrite: false,
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

  // Called from main.js' onResize AND from the FOV settings row, because the layout is a function
  // of both: everything in `layoutFor` is a fraction of the visible frame, and the FOV is what sets
  // how wide that frame is. Two levels of rebuild, because they cost different things —
  // ARRANGEMENT (portrait ↔ landscape) swaps the canvas and its texture, while a FOV nudge only
  // re-cuts two small geometries. A drag that changes neither costs a layout object and nothing.
  applyLayout(aspect = this.aspectNow(), fov = this.fov) {
    this.fov = fov;
    const lay = layoutFor(aspect, fov, this.lipFrac());
    const arrangement = !this.lay || lay.wide !== this.lay.wide;
    const moved = arrangement || Math.abs(lay.fov - this.lay.fov) > 0.4
      || Math.abs(lay.dash.w - this.lay.dash.w) > 1e-4
      || Math.abs(lay.dash.lipFrac - this.lay.dash.lipFrac) > 1e-4;
    this.lay = lay;
    if (!moved) return false;
    if (arrangement) {
      this.sizeDash();
      // A CanvasTexture whose canvas changed SIZE has to be replaced, not flagged: three uploads
      // the new dimensions only on a fresh texture and otherwise samples a stale allocation.
      this.dashTex.dispose();
      this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
      this.dashTex.colorSpace = THREE.SRGBColorSpace;
      this.dashMat.map = this.dashTex;
      this.dashMat.needsUpdate = true;
    }
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

  // §S2-L's falsification hook, and the twin of testOccupant above: put the roof back. Nothing in
  // the game calls it. It re-uses the shell material, so a gate that forgets to take it down again
  // is visible in the draw count rather than silently absorbed.
  testRoof(on) {
    if (on && !this._roof) {
      const g = buildBoxes([
        { pos: [0, 0.58, -Z * 0.92], size: [1.38, 0.13, 0.16], rot: [16, 0, 0], col: [SOLID, 1] },
        { pos: [0, 0.66, -Z * 0.60], size: [1.10, 0.07, 0.55], rot: [0, 0, 0], col: [SOLID, 1] },
      ]);
      this._roof = new THREE.Mesh(g, this.shellMat);
      this._roof.name = 'cockpit.roof';
      this._roof.frustumCulled = false;
      this._roof.userData.role = 'roof';
      this.group.add(this._roof);
    } else if (!on && this._roof) {
      this.group.remove(this._roof);
      this._roof.geometry.dispose();
      this._roof = null;
    }
    return !!this._roof;
  }

  // The cabin's PART roles, against the list this file declares. `ROLES_ALLOWED` was exported for
  // exactly this and — found in §S2-L — nothing had ever read it, so the "roles are exactly this
  // list" claim in the header comment was a comment and not a check. gates_s2l D4 reads this.
  roles() {
    return { allowed: ROLES_ALLOWED.slice(), present: [...new Set(PARTS.map(p => p[1]))].sort(),
      parts: PARTS.map(p => ({ id: p[0], role: p[1], alpha: p[5] ? p[5][1] : 1 })) };
  }

  // How much of the FRAME the dash assembly eats, top edge down, as a fraction of frame height.
  //
  // This is the number S2's "reduce the dash height by almost half — it currently eats the bottom
  // third" is actually about, and it is not `lay.dash.screenFrac`: the player sees the instrument
  // PLANE plus the lip behind it plus the two side consoles, and in portrait the lip was the
  // larger half of that. Every box corner is projected to a normalised screen y (−1 at the bottom
  // of the frame, +1 at the top) through the same perspective the camera uses, and the answer is
  // the highest one any dash or console part reaches. A gate that measured only the quad would
  // have reported a cut the player could not see.
  cabinExtent(fov = this.fov) {
    const t = Math.tan(fov * 0.5 * D2R);
    let top = -1;
    const consider = (y, z) => {
      if (z >= -1e-3) return;                       // behind or at the eye: not on screen
      top = Math.max(top, y / (t * -z));
    };
    for (const p of PARTS) {
      if (p[1] !== 'dash' && p[1] !== 'console') continue;
      const [, py, pz] = p[2], [, sy, sz] = p[3];
      for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) {
        // the rotations here are at most 30 deg about X, which moves a corner by less than the
        // corner spacing itself — the AABB of the untransformed box is the conservative envelope
        consider(py + sy * dy + Math.abs(sz * dz * Math.sin(p[4][0] * D2R)), pz + sz * dz);
      }
    }
    // …and the instrument plane, whose top edge is a function of the live layout
    const L = this.lay.dash;
    const h = L.w * L.ar;
    const yc = h * 0.5 * Math.cos(L.pitch * D2R), zc = h * 0.5 * Math.abs(Math.sin(L.pitch * D2R));
    consider(L.y + yc, L.z - zc);
    // The plane's BOTTOM edge, reported because it is where a real defect hid: the near edge is
    // closer to the eye than the centre and projects further down, and the first S2 layout put it
    // at -1.03 — the bottom third of the dashboard, rounded corners and chat box included, was
    // below the floor of the screen on a landscape phone and looked fine in a portrait capture.
    const planeBottom = (L.y - yc) / (t * (Math.abs(L.z) - zc));
    // §S2-L: the assembly is now the quad PLUS the DOM control lip it is seated on, and `frac`
    // covers both — the quad's bottom edge is the lip's top edge, so the plane's top is still the
    // top of everything the player reads as dashboard. `lipPx` is broken out so a gate can say
    // which half is which instead of quoting one number for two surfaces.
    const H = window.innerHeight || 1;
    return { top: +top.toFixed(4), frac: +((top + 1) / 2).toFixed(4), fov: +fov.toFixed(1),
      plane: L.screenFrac, planeBottom: +planeBottom.toFixed(4),
      lipFrac: L.lipFrac, lipPx: +(L.lipFrac * H).toFixed(2),
      totalPx: +(((top + 1) / 2) * H).toFixed(2) };
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
    // PITCH is the camera's, not the craft's, and that is §S2-L's doing. The yaw already worked
    // this way — main.js clamps the cabin's heading to the camera's ± CABIN_YAW_LAG because an
    // unbounded lag slid the dash bodily off the left edge mid-turn. The vertical axis had exactly
    // the same defect and nothing bounded it: the cabin pitches with the craft while the camera
    // pitches with the LOOK, so at a 3.4 deg resting pitch the dashboard sat 57 CSS px up the
    // frame, and looking down walked it further. That was survivable while the dash floated; it is
    // not now, because the control lip is a screen-space surface and the instrument top has to
    // stay seated on it at every look angle or "one moulding" is true at exactly one of them.
    // The craft's nose attitude is not lost — camera.js already carries it as `vpitch * pitchMul`,
    // so the whole head tips with the craft and the cabin comes with it.
    const e = new THREE.Euler(ctx.pitch !== undefined ? ctx.pitch : (ctx.vpitch || 0),
      ctx.heading || 0, (ctx.bank || 0) * F.COCKPIT.rollMul, 'YXZ');
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
        // RGB *and* alpha. See the note on the material: with normal blending, brightness alone
        // fades a panel to a dark rectangle rather than out of the way.
        col.setXYZW(i, k, k, k, k);
      }
    }
    col.needsUpdate = true;
    return this.fade.slice();
  }

  // ── §8.2's canvas — S2's dashboard ──────────────────────────────────────
  //
  // Aaron's two words for two different things, and this file now holds both of them:
  //
  //   DASHBOARD — physically part of the vehicle. Opaque, moulded, lit from its own bezel, with
  //               screw bosses, a brushed sheen and rounded corners. That is THIS canvas.
  //   HUD       — a semi-transparent neon frame reflected onto the windscreen. That is the holo
  //               panels below, and the chase-view surface at the bottom of this file.
  //
  // Three rules the drawing obeys:
  //
  //  1. **It is a pure function of `d`.** Nothing here reads a clock, a random or `this.t`. The
  //     same data twice must produce byte-identical pixels or gates_p6's §8.2 falsification —
  //     which asserts exactly that, and then that changing speed/alt/cell DOES move it — cannot
  //     tell an instrument from noise.
  //  2. **Rounded, never rectangular.** The housing is a rounded path and everything outside it is
  //     cleared alpha (the material is transparent), so the corners are corners.
  //  3. **Variety of form.** A circular dial for speed, a segmented ring for the cell, a
  //     rectangular tape for altitude, pips for the hold. Aaron asked for it in those words and a
  //     panel of five identical bars is the thing he was asking not to get.
  drawDash(d) {
    this.dashDraws++;
    const c = this.dashCanvas, g = c.getContext('2d');
    const W = this.lay.dash.cw, H = this.lay.dash.ch;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.save();
    g.scale(c.width / W, c.height / H);                 // LOW draws the same layout at half scale
    const R = HUD.DASH_R;
    const S = this.dashSlots();
    this._housing(g, W, H, R);
    this._topBar(g, d, S.x0, S.iw, S.bar, R);
    g.save();
    rrect(g, 0, 0, W, H, R); g.clip();
    if (this.lay.wide) this._dashWide(g, d, S);
    else this._dashTall(g, d, S);
    g.restore();
    this._greeble(g, W, H, S.pad);
    g.restore();
    this.dashTex.needsUpdate = true;
    return this.dashDraws;
  }

  // The moulding. A vertical gradient from a lit top lip to a shadowed belly is what separates
  // "expensive" from "a black rectangle with numbers on it" — a flat fill has no surface, and a
  // surface is the whole claim the word dashboard makes.
  _housing(g, W, H, R) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1e2733');
    grad.addColorStop(0.10, '#131b26');
    grad.addColorStop(0.58, '#0c121a');
    grad.addColorStop(1, '#101822');
    g.save();
    rrect(g, 0, 0, W, H, R); g.clip();
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // a soft glow behind the instrument cluster, so the panel looks lit from within
    const spot = g.createRadialGradient(W * 0.5, H * 1.05, 0, W * 0.5, H * 1.05, W * 0.5);
    spot.addColorStop(0, 'rgba(53,230,255,0.055)');
    spot.addColorStop(1, 'rgba(53,230,255,0)');
    g.fillStyle = spot; g.fillRect(0, 0, W, H);
    // the lit top edge of the moulding. One 2 px sweep is most of what says "this is a surface
    // with a light on it" rather than "this is a dark rectangle".
    const lip = g.createLinearGradient(0, 0, W, 0);
    lip.addColorStop(0, 'rgba(190,225,245,0.04)');
    lip.addColorStop(0.5, 'rgba(190,225,245,0.22)');
    lip.addColorStop(1, 'rgba(190,225,245,0.04)');
    g.fillStyle = lip; g.fillRect(0, 0, W, 1.6);
    g.restore();
    // outer bezel: one bright hairline on the top lip, one dark one under it
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(150,205,235,0.30)';
    rrect(g, 1, 1, W - 2, H - 2, R - 1); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    rrect(g, 3, 3, W - 6, H - 6, R - 3); g.stroke();
  }

  // §8.2's thin top bar: money, the live job with its clock, and the time bonus with its own.
  // The bonus PAIR disappears the moment the bonus window is gone (S2, explicit) — a reward that
  // is no longer collectable must not keep a slot on the panel implying that it is.
  _topBar(g, d, x0, W, h, R) {
    g.save();
    // clipped to the HOUSING path, not to its own box, so the bar inherits the two rounded top
    // corners instead of squaring them off again
    rrect(g, 0, 0, this.lay.dash.cw, h * 4, R); g.clip();
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(24,34,46,0.95)');
    grad.addColorStop(1, 'rgba(9,13,19,0.95)');
    g.fillStyle = grad; g.fillRect(x0, 0, W, h);
    g.restore();
    g.strokeStyle = 'rgba(53,230,255,0.28)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + 6, h + 0.5); g.lineTo(x0 + W - 6, h + 0.5); g.stroke();
    g.save();
    g.translate(x0, 0);

    const wide = this.lay.wide;
    // The bar's height comes from the layout now rather than from a constant, so everything drawn
    // on it scales off `h`. Without this §S2-L's shorter bar drew a 16 px credit figure into a
    // 15 px band and the housing clip ate half of it.
    const fs = (wide ? 1 : 1.18) * (h / (wide ? 22 : 30));
    const cy = h / 2;
    const tape = wide ? 200 : 0;                      // landscape keeps §8.2's heading tape
    const pad = Math.round(12 * fs);
    let x = pad;

    // money
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillStyle = 'rgba(120,150,175,0.95)';
    g.font = `700 ${Math.round(8 * fs)}px ui-monospace, Menlo, monospace`;
    g.fillText('CRD', x, cy - 6 * fs);
    g.fillStyle = '#6cff9c';
    g.font = `400 ${Math.round(16 * fs)}px ui-monospace, Menlo, monospace`;
    g.fillText(commas(Math.round(d.credits || 0)), x, cy + 5 * fs);
    x += Math.max(72 * fs, g.measureText(commas(Math.round(d.credits || 0))).width + 26 * fs);
    divider(g, x - pad, h);

    // the job: name, fee, clock
    const jobW = W - tape - x - pad - (d.bonus ? Math.round((wide ? 132 : 120) * fs) : 0);
    if (d.job) {
      g.fillStyle = 'rgba(120,150,175,0.95)';
      g.font = `700 ${Math.round(8 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText(fit(g, `→ ${String(d.job.dest || '').toUpperCase()}`, jobW), x, cy - 6 * fs);
      g.fillStyle = '#eaf6ff';
      g.font = `400 ${Math.round(14 * fs)}px ui-monospace, Menlo, monospace`;
      const fee = `$${commas(d.job.pay || 0)}`;
      g.fillText(fee, x, cy + 5 * fs);
      const late = (d.job.timeLeft || 0) <= 0;
      g.fillStyle = late ? '#ff5a52' : (d.job.timeLeft < 45 ? '#ffb238' : 'rgba(207,226,245,0.9)');
      g.font = `400 ${Math.round(12 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText(`⏱ ${mmss(d.job.timeLeft)}`, x + g.measureText(fee).width + 14, cy + 4 * fs);
    } else {
      g.fillStyle = 'rgba(125,142,163,0.8)';
      g.font = `500 ${Math.round(11 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText(fit(g, 'NO JOB — dock at a HUB pad', jobW), x, cy);
    }

    // the bonus, and its own countdown. Both go together or neither is drawn.
    if (d.bonus) {
      const bx = W - tape - Math.round((wide ? 128 : 116) * fs);
      divider(g, bx - pad, h);
      g.fillStyle = 'rgba(255,178,56,0.85)';
      g.font = `700 ${Math.round(8 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText('BONUS', bx, cy - 6 * fs);
      g.fillStyle = '#ffb238';
      g.font = `400 ${Math.round(14 * fs)}px ui-monospace, Menlo, monospace`;
      const bp = `+$${commas(d.bonus.pay)}`;
      g.fillText(bp, bx, cy + 5 * fs);
      g.fillStyle = d.bonus.fading ? '#ff5a52' : 'rgba(255,178,56,0.75)';
      g.font = `400 ${Math.round(12 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText(`⏱ ${mmss(d.bonus.left)}`, bx + g.measureText(bp).width + 12, cy + 4 * fs);
    }

    if (tape) {
      divider(g, W - tape - 4, h);
      this._headingTape(g, d, W - tape + 6, 3, tape - 16, h - 6);
    }
    g.restore();
  }

  // Screw bosses in the four corners and a vent grille on the belly. Pure surface detail, drawn
  // last so it sits over everything, and the cheapest half of the gap between "good for basic"
  // and "expensive" — a moulded panel has fixings and it has air.
  _greeble(g, W, H, pad) {
    for (const [x, y] of [[pad - 2, H - 8], [W - pad + 2, H - 8]]) {
      g.beginPath(); g.arc(x, y, 3.4, 0, 6.2832);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(160,190,215,0.28)'; g.stroke();
      g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + 2, y);
      g.strokeStyle = 'rgba(160,190,215,0.22)'; g.stroke();
    }
    // vent slots, bottom centre
    const vw = Math.min(96, W * 0.16), vx = W / 2 - vw / 2, vy = H - 9;
    g.fillStyle = 'rgba(0,0,0,0.42)';
    for (let i = 0; i < 5; i++) g.fillRect(vx + i * (vw / 5), vy, vw / 5 - 3, 3.2);
  }

  // ── the shared instrument vocabulary ────────────────────────────────────
  // Written once so the two arrangements cannot disagree about what a redline, a lane tick or a
  // faded chatter line is.

  // §8.2's 200 deg speed arc with a thin needle, redline past 85 % of max. The one CIRCULAR
  // instrument with a moving pointer.
  _speedArc(g, d, cx, cy, R, numSize) {
    const speed = d.speed || 0, maxSpeed = d.maxSpeed || F.MAX_FWD;
    const A0 = 170 * D2R, A1 = A0 + 200 * D2R;
    // a recessed well behind the dial, so it reads as sunk into the moulding
    const well = g.createRadialGradient(cx, cy - R * 0.2, R * 0.2, cx, cy, R * 1.34);
    well.addColorStop(0, 'rgba(4,9,15,0.85)');
    well.addColorStop(0.75, 'rgba(10,17,26,0.55)');
    well.addColorStop(1, 'rgba(14,22,32,0.0)');
    g.fillStyle = well;
    g.beginPath(); g.arc(cx, cy, R * 1.34, 0, 6.2832); g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,200,230,0.16)';
    g.beginPath(); g.arc(cx, cy, R * 1.30, 0, 6.2832); g.stroke();

    g.lineCap = 'butt';
    g.lineWidth = R * 0.13;
    g.strokeStyle = 'rgba(53,230,255,0.24)';
    g.beginPath(); g.arc(cx, cy, R, A0, A1); g.stroke();
    g.strokeStyle = 'rgba(255,43,58,0.45)';
    g.beginPath(); g.arc(cx, cy, R, A0 + (A1 - A0) * 0.85, A1); g.stroke();
    // minor graduations, which is what makes an arc read as an instrument rather than a progress bar
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(150,190,215,0.34)';
    for (let i = 0; i <= 10; i++) {
      const a = A0 + (A1 - A0) * (i / 10), o = i % 5 === 0 ? R * 0.20 : R * 0.11;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R + R * 0.09), cy + Math.sin(a) * (R + R * 0.09));
      g.lineTo(cx + Math.cos(a) * (R + R * 0.09 + o), cy + Math.sin(a) * (R + R * 0.09 + o));
      g.stroke();
    }
    const k = clamp(speed / maxSpeed, 0, 1);
    g.lineWidth = R * 0.13;
    g.strokeStyle = k > 0.85 ? '#ff5a52' : '#35e6ff';
    g.beginPath(); g.arc(cx, cy, R, A0, A0 + (A1 - A0) * k); g.stroke();
    const na = A0 + (A1 - A0) * k;
    g.strokeStyle = '#eaf6ff'; g.lineWidth = Math.max(1.6, R * 0.045);
    g.beginPath();
    g.moveTo(cx + Math.cos(na) * R * 0.28, cy + Math.sin(na) * R * 0.28);
    g.lineTo(cx + Math.cos(na) * (R + R * 0.09), cy + Math.sin(na) * (R + R * 0.09));
    g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.10, 0, 6.2832);
    g.fillStyle = 'rgba(234,246,255,0.85)'; g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = d.boost ? '#ffb238' : '#eaf6ff';
    g.font = `300 ${numSize}px ui-monospace, Menlo, monospace`;
    g.fillText(Math.round(speed), cx, cy + numSize * 0.12);
    g.fillStyle = 'rgba(150,170,192,0.95)';
    g.font = `600 ${Math.round(numSize * 0.34)}px ui-monospace, Menlo, monospace`;
    g.fillText('M/S', cx, cy + numSize * 0.62);
  }

  // The cell, as a SEGMENTED RING — deliberately a different circular form from the speed dial's
  // swept arc and needle, so two round instruments side by side do not read as a pair of clones.
  _cellRing(g, d, cx, cy, R, numSize) {
    const cell = d.cell === undefined ? 1 : d.cell;
    const A0 = 130 * D2R, A1 = A0 + 280 * D2R;
    const N = 18, gap = (A1 - A0) / N * 0.30, seg = (A1 - A0) / N - gap;
    const col = cell < 0.15 ? '#ff2b3a' : '#ffb04a';
    g.lineCap = 'butt';
    g.lineWidth = R * 0.22;
    for (let i = 0; i < N; i++) {
      const a = A0 + i * (seg + gap);
      g.strokeStyle = (i + 0.5) / N < cell ? col : 'rgba(255,178,56,0.13)';
      g.beginPath(); g.arc(cx, cy, R, a, a + seg); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col;
    g.font = `300 ${numSize}px ui-monospace, Menlo, monospace`;
    g.fillText(`${Math.round(cell * 100)}`, cx, cy - numSize * 0.02);
    g.fillStyle = 'rgba(150,170,192,0.95)';
    g.font = `600 ${Math.round(numSize * 0.40)}px ui-monospace, Menlo, monospace`;
    g.fillText('% CELL', cx, cy + numSize * 0.58);
    // §7.4.1's minutes-of-cruise, which is the number that actually decides whether to divert
    if (d.cellMinutes !== undefined && d.cellMinutes !== null) {
      g.fillStyle = d.cellMinutes < 3 ? '#ff5a52' : 'rgba(255,178,56,0.7)';
      g.font = `400 ${Math.round(numSize * 0.36)}px ui-monospace, Menlo, monospace`;
      g.fillText(`${Math.round(d.cellMinutes)} MIN`, cx, cy + R + numSize * 0.42);
    }
  }

  // Altitude as a horizontal RECTANGULAR tape with the seven traffic-lane ticks on it. The third
  // form, and the right one for altitude: a lane is a place on a scale, not a fraction of a whole.
  _altTape(g, d, x, y, w, h, fs) {
    const alt = d.alt || 0;
    const k = clamp((alt - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1);
    const col = alt > F.ALT_WARN ? '#ffb238' : '#35e6ff';
    g.fillStyle = 'rgba(2,5,9,0.75)';
    rrect(g, x, y, w, h, h / 2); g.fill();
    g.fillStyle = col;
    g.save(); rrect(g, x, y, w, h, h / 2); g.clip();
    g.fillRect(x, y, w * k, h);
    g.restore();
    g.strokeStyle = 'rgba(207,226,245,0.45)'; g.lineWidth = 1;
    for (const la of LANE_ALT) {
      const kk = clamp((la - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1);
      g.beginPath(); g.moveTo(x + w * kk, y - 2); g.lineTo(x + w * kk, y + h + 2); g.stroke();
    }
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,200,230,0.22)';
    rrect(g, x, y, w, h, h / 2); g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(120,150,175,0.95)';
    g.font = `700 ${Math.round(9 * fs)}px ui-monospace, Menlo, monospace`;
    g.fillText('ALT', x, y - 7);
    g.textAlign = 'right';
    g.fillStyle = col;
    g.font = `300 ${Math.round(17 * fs)}px ui-monospace, Menlo, monospace`;
    g.fillText(`${Math.round(alt)} m`, x + w, y - 6);
    g.textAlign = 'left';
  }

  // The hold, as outlined pips. The fourth form and the smallest — how many slots, how many full.
  _cargoPips(g, d, x, y, s, fs) {
    const slots = d.cargoMax || 3, cargo = d.cargo || 0;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(120,150,175,0.95)';
    g.font = `700 ${Math.round(9 * fs)}px ui-monospace, Menlo, monospace`;
    g.fillText('HOLD', x, y - 5);
    for (let i = 0; i < slots; i++) {
      const px = x + i * (s + 5);
      g.strokeStyle = 'rgba(108,255,156,0.55)'; g.lineWidth = 1.2;
      rrect(g, px + 0.6, y + 0.6, s - 1.2, s - 1.2, 2.5); g.stroke();
      if (i < cargo) {
        g.fillStyle = 'rgba(108,255,156,0.85)';
        rrect(g, px + 3, y + 3, s - 6, s - 6, 1.6); g.fill();
      }
    }
  }

  // Annunciator lamps. Every one is a real state the flight model or the economy owns; there are
  // no dummies on this panel, because a lamp that never lights is a lie about the vehicle.
  _lamps(g, d, x, y, fs) {
    const set = [
      ['BOOST', !!d.boost, '#ffb238'],
      ['HOLD', !!d.altHold, '#35e6ff'],
      ['PAD', d.chargeInRange === true, '#6cff9c'],
      ['LINK', !!d.comms, '#ff3ea5'],
    ];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(8 * fs)}px ui-monospace, Menlo, monospace`;
    const w = Math.round(38 * fs);
    set.forEach(([label, on, col], i) => {
      const lx = x + i * (w + 4);
      g.fillStyle = on ? hexa(col, 0.16) : 'rgba(255,255,255,0.03)';
      rrect(g, lx, y, w, Math.round(14 * fs), 3); g.fill();
      g.strokeStyle = on ? hexa(col, 0.75) : 'rgba(150,180,205,0.14)';
      g.lineWidth = 1; rrect(g, lx, y, w, Math.round(14 * fs), 3); g.stroke();
      g.fillStyle = on ? col : 'rgba(125,142,163,0.42)';
      g.fillText(label, lx + w / 2, y + Math.round(7.5 * fs));
    });
    g.textAlign = 'left';
  }

  // §8.5's chatter, as a scrolling box INSIDE the dashboard rather than a rectangle floating over
  // the city. A recessed screen with a bezel; background lines faded, `alert` lines bright with a
  // coloured rule. The tag vocabulary is fixed at bg / info / alert (the S2 A↔B contract) and an
  // unknown or absent tag is treated as `info`.
  _chatBox(g, d, x, y, w, h, fs) {
    g.save();
    rrect(g, x, y, w, h, 6); g.clip();
    g.fillStyle = 'rgba(2,5,9,0.80)'; g.fillRect(x, y, w, h);
    // a couple of scan bands, static (this canvas must be a pure function of `d`)
    g.fillStyle = 'rgba(53,230,255,0.022)';
    for (let yy = y; yy < y + h; yy += 4) g.fillRect(x, yy, w, 2);
    const lh = Math.round(13 * fs);
    const rows = Math.max(1, Math.floor((h - 6) / lh));
    const log = Array.isArray(d.chat) ? d.chat.slice(-rows) : [];
    if (!log.length) {
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(90,110,130,0.55)';
      g.font = `400 ${Math.round(10 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillText('· net quiet ·', x + 8, y + h / 2);
    }
    // oldest at the top, newest at the bottom — the direction a ticker scrolls
    log.forEach((line, i) => {
      const ly = y + 4 + i * lh + lh * 0.5;
      const tag = TAGS[line.tag] ? line.tag : 'info';
      const T = TAGS[tag];
      g.fillStyle = T.rule;
      g.fillRect(x + 4, ly - lh * 0.36, 2, lh * 0.72);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.font = `700 ${Math.round(8 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillStyle = T.speaker;
      const sp = String(line.speaker || '').toUpperCase().slice(0, 9);
      g.fillText(sp, x + 10, ly);
      const tx = x + 10 + Math.round(52 * fs);
      g.font = `400 ${Math.round(10.5 * fs)}px ui-monospace, Menlo, monospace`;
      g.fillStyle = T.text;
      g.fillText(fit(g, String(line.text || ''), x + w - tx - 6), tx, ly);
    });
    g.restore();
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,200,230,0.18)';
    rrect(g, x, y, w, h, 6); g.stroke();
  }

  _headingTape(g, d, x, y, w, h) {
    const bearing = ((-(d.heading || 0) * 180 / Math.PI) % 360 + 360) % 360;
    g.save();
    rrect(g, x, y, w, h, 4); g.clip();
    g.fillStyle = 'rgba(53,230,255,0.05)'; g.fillRect(x, y, w, h);
    g.font = `700 ${Math.max(6, Math.round(h * 0.75))}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = x + w / 2, px = w / 150;               // +/-75 deg across the tape, not +/-95
    for (let b = -75; b <= 75; b += 15) {
      const deg = bearing + b;
      const tx = cx + b * px;
      const major = ((Math.round(deg) % 45) + 45) % 45 < 8;
      g.strokeStyle = major ? 'rgba(53,230,255,0.75)' : 'rgba(53,230,255,0.3)';
      g.beginPath(); g.moveTo(tx, y + 1); g.lineTo(tx, y + (major ? h * 0.34 : h * 0.22)); g.stroke();
      if (major) { g.fillStyle = 'rgba(225,240,252,0.95)'; g.fillText(COMPASS(deg), tx, y + h * 0.66); }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,178,56,0.95)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + w / 2, y - 1); g.lineTo(x + w / 2, y + h + 1); g.stroke();
  }

  // ── the dash layout, as DATA ────────────────────────────────────────────
  //
  // Both arrangements return the same table of named rectangles and the drawing reads it, so
  // "where is the cell ring" has one answer and a reserved bay cannot silently be drawn over.
  // That matters because two of these are RESERVED and empty on purpose:
  //
  //   `warmth`  the debt-pressure gauge S2-E will fit — a temperature that climbs when the player
  //             is behind the pace, not a countdown. It sits beside the cell ring because both
  //             answer the same question: how much runway is left.
  //   `bay`     GONE as of §S2-L, and `null` in both arrangements. It was the blank moulded column
  //             the floating control cluster stood over; the controls are now a DOM lip under the
  //             quad, so the whole canvas is instruments and nothing has to be kept clear.
  //
  // Both are drawn as empty recessed wells rather than left as bare panel: a blanking plate is
  // what a real instrument panel does with an unfitted bay, and it reads as deliberate.
  dashSlots() {
    const W = this.lay.dash.cw, H = this.lay.dash.ch;
    // `pad` is not decoration. The quad is FULL-BLEED and it is TILTED, so its near (bottom) edge
    // projects ~3 % wider than the frame while its far edge is inset by the same — measured, not
    // guessed: at 844x390 the first full-bleed layout put the speed dial's left third off the side
    // of the screen. Everything drawable lives inside `pad`, and the housing is what runs out past
    // the edge, which is exactly the right way round.
    if (this.lay.wide) {
      const bar = 17, pad = 50;
      return { W, H, bar, pad, bay: null, x0: pad - 6, iw: W - 2 * (pad - 6),
        speed: [pad, 18, 30, 30], cell: [84, 19, 26, 26], warmth: [114, 19, 26, 26],
        alt: [152, 30, 150, 7], hold: [322, 30, 46, 8],
        lamps: [388, 34, 124, 10], chat: [700, 18, W - 764, 30],
        place: [524, H - 4] };
    }
    const bar = 28, pad = 18;
    return { W, H, bar, pad, bay: null, x0: pad - 8, iw: W - 2 * (pad - 8),
      speed: [pad, 30, 58, 58], cell: [84, 32, 42, 42], warmth: [132, 32, 42, 42],
      alt: [182, 46, 140, 9], hold: [182, 74, 56, 11],
      lamps: [182, 94, 144, 12], chat: [336, 30, W - 360, 92],
      place: [pad, H - 4] };
  }

  // ── §S2-P's DEMAND gauge (the bay S2-E called `warmth`) ─────────────────
  //
  // **This instrument was replaced, and what it replaced is the reason it exists.** S2-E fitted a
  // PACE gauge here: a projection of the final balance against a 50,000 debt and an 84-minute
  // window, mapped 1 at ratio <= 0.75 and 0 at >= 1.25. That saturated. A player earning 70 % of
  // the required rate pinned the needle to MAX **on the first frame** and it never moved again for
  // the whole 84 minutes — and the thing it was pinned against was not even what fired the event,
  // which was an invisible clock. Aaron played it, watched a maxed gauge say they were coming, and
  // nothing happened for another two thousand credits.
  //
  // So the bay now draws the DEMAND, which is the same comparison the event itself makes:
  //
  //   act one     warmth = credits / SEIZE_AT  (2 500)   full = they take the craft at this pad
  //   act two     warmth = credits / SUMMONS   (10 000)  full = go and see him
  //   after that  null — a blanking plate, because there is nothing left to be short of
  //
  // It opens at 250/2500 = 0.10 on a fresh profile, it moves on every delivery, and full scale
  // means the event, so a full needle is a statement and not a saturation. The slot key stays
  // `warmth` because it is a LAYOUT name and `gates_s2a` asserts the bay's geometry by it; what
  // changed is the signal riding it.
  //
  // The two demands read in opposite directions and are coloured accordingly: climbing toward the
  // seizure is bad news and runs cold-blue to red, climbing toward the summons is progress and
  // runs blue to green. Same form, same bay, and the kicker word says which.
  //
  // It is drawn as a TEMPERATURE gauge and not as a fifth ring: a bulb, a bent capillary, a rising
  // column and graduations, with a needle riding the column. The dash already carries a swept arc,
  // a segmented ring, a linear tape and outlined pips (four different forms, deliberately), and a
  // fifth circular fill would have collapsed into the cell ring beside it.
  //
  // `d.warmth` is SMOOTHED by hudData before it arrives here. Earnings land in ~800 CRD lumps
  // every 60-90 s, so the raw signal steps rather than sweeps — real, not noise, but a needle that
  // jumps once a minute is unreadable. A temperature gauge having thermal lag is also the one kind
  // of smoothing that is diegetically honest.
  _warmthGauge(g, d, x, y, w, h) {
    const on = d.warmth !== undefined && d.warmth !== null;
    if (!on) { this._slot(g, x, y, w, h); return; }
    const k = clamp(d.warmth, 0, 1);
    const st = d.warmthState || 'call';
    const boss = st === 'summons' || st === 'ready';     // act two's demand, which is progress
    const clear = st === 'ready';
    const due = st === 'due';
    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;

    // the recess the bay always had, so a fitted gauge sits IN the panel rather than on it
    const well = g.createRadialGradient(cx, cy - R * 0.2, R * 0.2, cx, cy, R);
    well.addColorStop(0, 'rgba(4,8,13,0.62)');
    well.addColorStop(1, 'rgba(14,21,30,0.0)');
    g.fillStyle = well;
    g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fill();

    const col = clear ? '#6cff9c'
      : boss ? (k < 0.5 ? '#35e6ff' : k < 0.85 ? '#8ee6b0' : '#6cff9c')
        : k < 0.34 ? '#35e6ff' : k < 0.62 ? '#8ee6b0' : k < 0.82 ? '#ffb238' : '#ff5a52';
    // The capillary: a 250 deg arc that fills from the cold end. Cold is at the LEFT, which is
    // where every gauge in every vehicle puts it.
    const A0 = 150 * D2R, A1 = A0 + 250 * D2R;
    g.lineCap = 'round';
    g.lineWidth = Math.max(2.2, R * 0.19);
    g.strokeStyle = 'rgba(150,190,215,0.13)';
    g.beginPath(); g.arc(cx, cy, R * 0.72, A0, A1); g.stroke();
    if (k > 0.005 || clear) {
      g.strokeStyle = col;
      g.beginPath(); g.arc(cx, cy, R * 0.72, A0, A0 + (A1 - A0) * (clear ? 1 : k)); g.stroke();
    }
    // graduations — cold, the break-even mid, and the redline
    g.lineWidth = 1;
    for (const t of [0, 0.5, 0.85, 1]) {
      const a = A0 + (A1 - A0) * t;
      g.strokeStyle = t >= 0.85 ? 'rgba(255,90,82,0.75)' : 'rgba(207,226,245,0.4)';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      g.lineTo(cx + Math.cos(a) * R * 0.99, cy + Math.sin(a) * R * 0.99);
      g.stroke();
    }
    // the needle, and the bulb it hangs off
    const na = A0 + (A1 - A0) * (clear ? 1 : k);
    g.strokeStyle = '#eaf6ff'; g.lineWidth = Math.max(1.3, R * 0.075); g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(na) * R * 0.86, cy + Math.sin(na) * R * 0.86);
    g.stroke();
    g.beginPath(); g.arc(cx, cy, R * 0.16, 0, 6.2832);
    g.fillStyle = col; g.fill();

    // The legend. NEVER a time and never a number of days — the Boss has not named one and neither
    // does this. It is four words per demand, which is the whole vocabulary a bay this size can
    // carry; the ACTUAL credits still needed are printed on the chase HUD's bar, which has room.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = due ? '#ff5a52' : 'rgba(150,170,192,0.95)';
    g.font = `700 ${Math.max(6, Math.round(R * 0.30))}px ui-monospace, Menlo, monospace`;
    g.fillText(due ? 'DUE' : clear ? 'READY'
      : boss ? (k < 0.5 ? 'OWED' : k < 0.85 ? 'CLOSE' : 'NEARLY')
        : k < 0.34 ? 'QUIET' : k < 0.62 ? 'NOTED' : k < 0.82 ? 'CLOSE' : 'SOON',
    cx, cy + R * 0.52);
    // The kicker sits INSIDE the arc's ring, so it has to be brighter than a normal label to read
    // at all against the capillary behind it — measured on a 4x crop of the real dash, where the
    // first pass at 0.24 R and 85 % alpha was invisible.
    g.fillStyle = due ? 'rgba(255,140,130,0.95)' : 'rgba(150,190,215,0.95)';
    g.font = `700 ${Math.max(6, Math.round(R * 0.30))}px ui-monospace, Menlo, monospace`;
    g.fillText(boss ? 'BOSS' : 'DEBT', cx, cy - R * 0.54);
    g.lineCap = 'butt';
  }

  // An empty instrument well. A hairline ring, a shallow recess, no legend and no needle — the
  // shape of a bay that has been left for a gauge that is not fitted yet. Still reached: the bay is
  // empty in act two, when there is no debt left to be behind on.
  _slot(g, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2;
    const well = g.createRadialGradient(cx, cy - r * 0.2, r * 0.2, cx, cy, r);
    well.addColorStop(0, 'rgba(4,8,13,0.55)');
    well.addColorStop(1, 'rgba(14,21,30,0.0)');
    g.fillStyle = well;
    g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
    g.lineWidth = 1; g.strokeStyle = 'rgba(150,190,215,0.14)';
    g.beginPath(); g.arc(cx, cy, r * 0.92, 0, 6.2832); g.stroke();
  }

  // ── landscape: the wide cluster ─────────────────────────────────────────
  // 1280 x 49, full-bleed across the frame. Instruments left, chat right — a landscape frame has
  // width and no height, so the chatter goes beside the cluster rather than under it.
  _dashWide(g, d, S) {
    this._speedArc(g, d, S.speed[0] + S.speed[2] / 2, S.speed[1] + S.speed[3] / 2, S.speed[2] * 0.40, 11);
    this._cellRing(g, d, S.cell[0] + S.cell[2] / 2, S.cell[1] + S.cell[3] / 2, S.cell[2] * 0.37, 9);
    this._warmthGauge(g, d, ...S.warmth);
    this._altTape(g, d, ...S.alt, 0.8);
    this._cargoPips(g, d, S.hold[0], S.hold[1], S.hold[3], 0.8);
    this._lamps(g, d, S.lamps[0], S.lamps[1], 0.71);
    this._chatBox(g, d, ...S.chat, 0.9);

    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '700 9px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(53,230,255,0.55)';
    // 66 canvas px, not 130: the district name lives in the blank moulding between the lamps and
    // the vent grille, and a long name overrunning it would land on the chat box.
    g.fillText(fit(g, (d.place || '').toUpperCase(), 66), S.place[0], S.place[1]);
  }

  // ── portrait: the tall cluster ──────────────────────────────────────────
  // 640 x 135, the whole width of it: three round wells with the altitude tape, the hold and the
  // lamps stacked beside them, and the chat box down the right — a landscape arrangement, because
  // losing the console bay made the portrait sheet wide enough to take one.
  _dashTall(g, d, S) {
    this._speedArc(g, d, S.speed[0] + S.speed[2] / 2, S.speed[1] + S.speed[3] / 2, S.speed[2] * 0.40, 22);
    this._cellRing(g, d, S.cell[0] + S.cell[2] / 2, S.cell[1] + S.cell[3] / 2, S.cell[2] * 0.37, 14);
    this._warmthGauge(g, d, ...S.warmth);
    this._altTape(g, d, ...S.alt, 1.1);
    this._cargoPips(g, d, S.hold[0], S.hold[1], S.hold[3], 1.1);
    this._lamps(g, d, S.lamps[0], S.lamps[1], 0.85);
    this._chatBox(g, d, ...S.chat, 1.05);

    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '700 10px ui-monospace, Menlo, monospace';
    g.fillStyle = 'rgba(53,230,255,0.55)';
    g.fillText(fit(g, (d.place || '').toUpperCase(), 150), S.place[0], S.place[1]);
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
    // §8.3's scanline, inverted. It used to be a 30 %-black bar over every second pair of rows,
    // which under the old additive blend removed 30 % of the GLYPH and none of the city — the
    // single biggest contributor to "heavy scanlines over small text". A CRT's scanlines are the
    // lit lines, not the gaps, so this brightens instead, at a twelfth of the amplitude.
    const scan = (g2, w, h) => {
      g2.fillStyle = 'rgba(150,225,255,0.05)';
      for (let y = 0; y < h; y += 3) g2.fillRect(0, y, w, 1);
    };

    // left — the active job (§8.3)
    band(0, (g2, w, h) => {
      hudFrame(g2, w, h, '53,230,255');
      g2.textAlign = 'left'; g2.textBaseline = 'top';
      // PORTRAIT is a different drawing, not the same one scaled down. A 384 px band rendered into
      // a 140 px-wide panel on a phone puts 13 px type onto five device pixels — the same defect
      // §8.2's two dash sheets exist to avoid. Fewer lines, twice the size, same facts.
      // PORTRAIT — and S2-D cut it again. This band lands in about 150 CSS px on a 390-wide
      // phone, so a 384-unit canvas maps 384 units onto ~150 px: the old 26 px type arrived as
      // NINE and the 22 px kicker as eight. Three facts at nine pixels is worse than two at
      // thirteen, so the sparse drawing now carries the destination and the fee and nothing else.
      if (!this.holoDense()) {
        g2.font = '700 26px ui-monospace, Menlo, monospace';
        g2.fillStyle = '#35e6ff'; g2.fillText('JOB', 16, 6);
        if (d.job) {
          g2.font = '400 34px ui-monospace, Menlo, monospace';
          g2.fillStyle = '#ffffff'; g2.fillText(fit(g2, String(d.job.dest), w - 32), 16, 38);
          g2.font = '400 32px ui-monospace, Menlo, monospace';
          g2.fillStyle = '#7dffab'; g2.fillText(`${d.job.pay} CRD`, 16, 74);
          const k = clamp(d.job.timeLeft / Math.max(1, d.job.timeTotal), 0, 1);
          g2.fillStyle = 'rgba(53,230,255,0.18)'; g2.fillRect(16, 112, w - 32, 10);
          g2.fillStyle = k < 0.25 ? '#ff5a52' : '#35e6ff'; g2.fillRect(16, 112, (w - 32) * k, 10);
        } else {
          g2.font = '400 34px ui-monospace, Menlo, monospace';
          g2.fillStyle = 'rgba(190,208,226,0.95)'; g2.fillText('NO JOB', 16, 40);
          g2.font = '400 24px ui-monospace, Menlo, monospace';
          g2.fillStyle = 'rgba(140,158,180,0.9)';
          g2.fillText(fit(g2, 'dock at a HUB', w - 32), 16, 84);
        }
        scan(g2, w, h);
        return;
      }
      g2.font = '700 13px ui-monospace, Menlo, monospace';
      g2.fillStyle = '#35e6ff'; g2.fillText('ACTIVE JOB', 14, 11);
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
      hudFrame(g2, w, h, '53,230,255');
      g2.textAlign = 'left'; g2.textBaseline = 'top';
      const mins0 = d.cellMinutes === undefined ? null : d.cellMinutes;
      if (!this.holoDense()) {
        g2.font = '700 26px ui-monospace, Menlo, monospace';
        g2.fillStyle = '#35e6ff'; g2.fillText('PAD', 16, 6);
        if (d.nearest) {
          const ty0 = ZONE_TYPES[d.nearest.type] || ZONE_TYPES.PICKUP;
          g2.font = '700 30px system-ui, sans-serif';
          g2.fillStyle = hexs(ty0.color); g2.fillText(ty0.glyph, 16, 36);
          g2.font = '400 34px ui-monospace, Menlo, monospace';
          g2.fillStyle = '#ffffff'; g2.fillText(fit(g2, String(d.nearest.name), w - 70), 52, 38);
          g2.font = '400 26px ui-monospace, Menlo, monospace';
          g2.fillStyle = 'rgba(200,220,240,0.92)';
          g2.fillText(`${d.nearest.km.toFixed(2)} km`, 16, 76);
        } else {
          g2.font = '400 32px ui-monospace, Menlo, monospace';
          g2.fillStyle = 'rgba(190,208,226,0.9)'; g2.fillText('NO PAD', 16, 38);
        }
        // §7.4.1's number is the one that decides whether to divert, so it survives the cut.
        // Right-aligned against the km on the same baseline: two numbers, one line, both big.
        g2.textAlign = 'right';
        g2.font = '400 26px ui-monospace, Menlo, monospace';
        g2.fillStyle = mins0 !== null && mins0 < 3 ? '#ff5a52' : '#ffc26a';
        g2.fillText(mins0 === null ? 'CELL —' : `${mins0.toFixed(0)} MIN`, w - 22, 76);
        g2.textAlign = 'left';
        scan(g2, w, h);
        return;
      }
      g2.font = '700 13px ui-monospace, Menlo, monospace';
      g2.fillStyle = '#35e6ff'; g2.fillText('NEAREST PAD', 14, 11);
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
      hudFrame(g2, w, h, '255,62,165');
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

// ── the chase-view HUD ─────────────────────────────────────────────────────
//
// `ChaseStrip` — P6's row of three DOM chips — is GONE, not restyled. It was three numbers in
// three boxes with no frame, no hierarchy and nothing that read as a vehicle, and Aaron's verdict
// on it was "pretty crappy". This is its replacement, and it is a different KIND of thing.
//
// Cockpit view gets a DASHBOARD: opaque, moulded, part of the craft. Chase view gets a HUD in
// Aaron's sense of the word — **a semi-transparent neon frame with a transparent background of
// the same colour, like something reflected onto a windscreen. A futuristic floating window.**
// So: no fills that read as panels, corner brackets rather than closed boxes, one hairline of
// neon, and the city visible straight through all of it.
//
// It is DOM, so it costs zero draw calls and its type is crisp at any device pixel ratio, and it
// reads the SAME data model the dash does — the two can never disagree about the speed.
//
// It renders into `#hud-strip`, which is `pointer-events: none` all the way down: the right half
// of the screen is the look thumb and this sits in it. gates_p6 asserts that with a hit test.

export class ChaseHud {
  constructor(el) {
    this.el = el;
    this.n = 0;
    this.shown = false;
    this._last = '';
    this._built = false;
  }

  setVisible(on) {
    this.shown = !!on;
    this.el.classList.toggle('hidden', !on);
    return this.shown;
  }

  // The static skeleton is written once and only the VALUES are patched after that. A HUD that
  // rebuilds its own innerHTML at 60 fps re-parses an SVG arc every frame for no reason, and the
  // chatter rows lose their scroll position every time it happens.
  _build() {
    this.el.innerHTML = `
<div class="ch-top">
  <div class="ch-frame ch-cash"><i>CRD</i><b data-f="cash">0</b></div>
  <div class="ch-frame ch-job" data-f="jobwrap">
    <i data-f="jobdest">NO JOB</i>
    <b data-f="jobpay"></b><u data-f="jobclock"></u>
    <span class="ch-bonus" data-f="bonuswrap"><b data-f="bonuspay"></b><u data-f="bonusclock"></u></span>
  </div>
</div>
<div class="ch-bot">
  <div class="ch-frame ch-dial">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="ch-track" d="M 15.2 78.8 A 45 45 0 1 1 84.8 78.8" />
      <path class="ch-red" d="M 84.8 78.8 A 45 45 0 0 0 94.6 61.2" />
      <path class="ch-arc" data-f="arc" d="M 15.2 78.8 A 45 45 0 1 1 84.8 78.8" />
    </svg>
    <b data-f="speed">0</b><i>M/S</i>
  </div>
  <div class="ch-frame ch-bars">
    <div class="ch-bar"><i>ALT</i><span><u data-f="altfill"></u></span><b data-f="alt">0 m</b></div>
    <div class="ch-bar c"><i>CELL</i><span><u data-f="cellfill"></u></span><b data-f="cell">100%</b></div>
    <div class="ch-pips" data-f="pips"></div>
  </div>
  <div class="ch-frame ch-warm" data-f="warmwrap">
    <i data-f="warmlabel">PACE</i>
    <span><u data-f="warmfill"></u><em data-f="warmmid"></em></span>
    <b data-f="warmsub">DEBT</b>
  </div>
</div>`;
    this.f = {};
    for (const n of this.el.querySelectorAll('[data-f]')) this.f[n.dataset.f] = n;
    // The dash length of the 200 deg speed arc, measured off the live path rather than derived
    // from the `d` attribute by hand — a hand-computed length is wrong the first time somebody
    // nudges the radius and nothing about the HUD looks broken enough to notice.
    this.arcLen = this.f.arc.getTotalLength();
    this.f.arc.style.strokeDasharray = `${this.arcLen}`;
    this._built = true;
  }

  draw(d) {
    if (!this.shown) return false;
    if (!this._built) this._build();
    const f = this.f;
    const cell = d.cell === undefined ? 1 : d.cell;
    const maxSpeed = d.maxSpeed || F.MAX_FWD;
    const k = clamp((d.speed || 0) / maxSpeed, 0, 1);

    set(f.cash, commas(Math.round(d.credits || 0)));
    set(f.speed, String(Math.round(d.speed || 0)));
    f.arc.style.strokeDashoffset = `${this.arcLen * (1 - k)}`;
    f.arc.classList.toggle('hot', k > 0.85);
    set(f.alt, `${Math.round(d.alt || 0)} m`);
    f.altfill.style.width = `${clamp((d.alt - F.ALT_MIN) / (F.ALT_MAX - F.ALT_MIN), 0, 1) * 100}%`;
    f.altfill.classList.toggle('warn', (d.alt || 0) > F.ALT_WARN);
    set(f.cell, `${Math.round(cell * 100)}%`);
    f.cellfill.style.width = `${clamp(cell, 0, 1) * 100}%`;
    f.cellfill.classList.toggle('bad', cell < 0.15);

    const slots = d.cargoMax || 3, held = d.cargo || 0;
    const pipKey = `${held}/${slots}`;
    if (f.pips.dataset.k !== pipKey) {
      f.pips.dataset.k = pipKey;
      f.pips.innerHTML = Array.from({ length: slots },
        (_, i) => `<em class="${i < held ? 'on' : ''}"></em>`).join('');
    }

    if (d.job) {
      set(f.jobdest, `→ ${String(d.job.dest || '').toUpperCase()}`);
      set(f.jobpay, `$${commas(d.job.pay || 0)}`);
      set(f.jobclock, mmss(d.job.timeLeft));
      f.jobclock.className = d.job.timeLeft <= 0 ? 'late' : d.job.timeLeft < 45 ? 'soon' : '';
    } else {
      set(f.jobdest, 'NO JOB — dock at a HUB pad');
      set(f.jobpay, ''); set(f.jobclock, '');
    }
    // The bonus and its clock go together, and they GO — §S2: once the window is missed the pair
    // disappears rather than sitting there advertising money that is no longer on the table.
    f.bonuswrap.classList.toggle('off', !d.bonus);
    if (d.bonus) {
      set(f.bonuspay, `+$${commas(d.bonus.pay)}`);
      set(f.bonusclock, mmss(d.bonus.left));
      f.bonuswrap.classList.toggle('fading', !!d.bonus.fading);
    }

    // §S2-E's warmth, in the chase view's own idiom: a horizontal neon bar with the break-even
    // mark printed ON it, so the player can see which side of the pace they are on rather than
    // only how full a bar is. It is the SAME number the dash needle rides — one signal, two
    // presentations, exactly as the chatter is. It disappears entirely once the debt is behind
    // them, because a gauge with nothing to measure is a gauge that teaches the player to ignore
    // the panel it is on.
    const hasWarm = d.warmth !== undefined && d.warmth !== null;
    f.warmwrap.classList.toggle('off', !hasWarm);
    if (hasWarm) {
      const wk = clamp(d.warmth, 0, 1);
      const ws = d.warmthState || 'call';
      const boss = ws === 'summons' || ws === 'ready';
      set(f.warmlabel, ws === 'due' ? 'DUE' : ws === 'ready' ? 'READY'
        : boss ? (wk < 0.5 ? 'OWED' : wk < 0.85 ? 'CLOSE' : 'NEARLY')
          : wk < 0.34 ? 'QUIET' : wk < 0.62 ? 'NOTED' : wk < 0.82 ? 'CLOSE' : 'SOON');
      f.warmfill.style.width = `${wk * 100}%`;
      f.warmfill.className = ws === 'ready' ? 'clear'
        : boss ? (wk < 0.5 ? 'cool' : 'ok')
          : wk < 0.34 ? 'cool' : wk < 0.62 ? 'ok' : wk < 0.82 ? 'warn' : 'bad';
      // The bar has the width the dash bay does not, so it carries the ACTUAL number. "BEHIND"
      // without "by how much" is a mood; `2 250 TO GO` is something the player can act on, and it
      // is the figure the whole restructure exists to make visible.
      set(f.warmsub, d.warmthNeed === null || d.warmthNeed === undefined ? (boss ? 'BOSS' : 'DEBT')
        : d.warmthNeed <= 0 ? (boss ? 'BRING IT' : 'AT THE NEXT PAD')
          : `${commas(Math.ceil(d.warmthNeed))} TO GO`);
      f.warmwrap.classList.toggle('due', ws === 'due');
    }

    // The chatter ticker is NOT rebuilt here. It is `#chatter`, owned by ui.js, and in chase view
    // it is styled as one more floating neon window in this same language — one renderer, two
    // presentations, so the chase HUD and the dashboard can never show a different conversation.
    this.n++;
    return true;
  }
}

// ── geometry helpers ───────────────────────────────────────────────────────

function buildBoxes(list) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
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
      if (part.col) col.push(part.col[0].r, part.col[0].g, part.col[0].b, part.col[1]);
    }
    const gi = g.index;
    for (let i = 0; i < gi.count; i++) idx.push(base + gi.getX(i));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
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
      col.push(1, 1, 1, 1);
    }
    const b = p * 4;
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // itemSize 4, not 3. §8.3's fade used to ride RGB alone, which was correct while the panels
  // were ADDITIVE (darker = more transparent, for free). They are normal-blended now — see the
  // material — so a fade that only darkens turns a looked-away panel into a dark slab instead of a
  // ghost. three.js reads a 4-component `color` attribute as vColor with alpha (USE_COLOR_ALPHA),
  // so this is the whole of the change on the shader side.
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
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
const set = (n, v) => { if (n.textContent !== v) n.textContent = v; };
const commas = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const hexa = (hex, a) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

// One rounded path, used everywhere. S2 calls out "rounded corners, no hard rectangles" as an
// explicit requirement, so it is a primitive here rather than a flourish applied in three places
// and forgotten in the fourth.
function rrect(g, x, y, w, h, r) {
  const k = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

// A vertical hairline between two cells of the dash's top bar.
function divider(g, x, h) {
  g.strokeStyle = 'rgba(150,200,230,0.16)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x + 0.5, 7); g.lineTo(x + 0.5, h - 7); g.stroke();
}

// **Aaron's HUD**, as a drawing primitive: a semi-transparent neon FRAME with a transparent
// background of the same colour, plus corner brackets — a floating futuristic window, not a
// panel. The fill is deliberately weak (0.10) so the city reads straight through it; the frame
// carries the whole shape.
// The combiner plate every holo band is drawn on. S2-D rewrote it: with the panels normal-blended
// (see the material) this has to supply a DARK GROUND for the symbology, which the old
// 10 %-tint-over-nothing version never did. It is still glass — 0.62 alpha at the top falling to
// 0.50 at the bottom, so the city reads through it and Aaron's "transparent background of the same
// colour" survives — but the text now has something to be legible against.
function hudFrame(g, w, h, tint, r = 9) {
  g.save();
  rrect(g, 1.5, 1.5, w - 3, h - 3, r); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(4,10,17,0.72)');
  gr.addColorStop(0.55, 'rgba(3,7,12,0.60)');
  gr.addColorStop(1, 'rgba(3,7,12,0.52)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // the tint wash that makes it the colour of its own frame
  const tg = g.createLinearGradient(0, 0, 0, h);
  tg.addColorStop(0, `rgba(${tint},0.16)`);
  tg.addColorStop(1, `rgba(${tint},0.03)`);
  g.fillStyle = tg; g.fillRect(0, 0, w, h);
  // a lit leading edge, so the plate reads as projected onto glass rather than printed on it
  g.fillStyle = `rgba(${tint},0.55)`; g.fillRect(0, 0, w, 2);
  g.restore();
  g.lineWidth = 1.6; g.strokeStyle = `rgba(${tint},0.75)`;
  rrect(g, 1.5, 1.5, w - 3, h - 3, r); g.stroke();
  // corner brackets — brighter than the frame, which is what makes it read as projected rather
  // than printed
  g.lineWidth = 2.6; g.strokeStyle = `rgba(${tint},1)`; g.lineCap = 'round';
  const L = Math.min(22, w * 0.14);
  for (const [cx, sx] of [[6, 1], [w - 6, -1]]) {
    for (const [cy, sy] of [[6, 1], [h - 6, -1]]) {
      g.beginPath();
      g.moveTo(cx + sx * L, cy); g.lineTo(cx + sx * 5, cy);
      g.moveTo(cx, cy + sy * L); g.lineTo(cx, cy + sy * 5);
      g.stroke();
    }
  }
  g.lineCap = 'butt';
}

// The S2 A↔B contract, and the only place the three tag values are given a look. `bg` is a
// background wash the player is not being addressed by, `info` is ordinary traffic, `alert`
// matters. An unknown or missing tag is `info` — S2-B owns the manifest, this owns the rendering,
// and neither may assume the other shipped first.
const TAGS = {
  bg:    { rule: 'rgba(125,142,163,0.30)', speaker: 'rgba(125,142,163,0.45)', text: 'rgba(160,180,200,0.42)' },
  info:  { rule: 'rgba(53,230,255,0.55)',  speaker: 'rgba(53,230,255,0.75)',  text: 'rgba(212,231,247,0.88)' },
  alert: { rule: 'rgba(255,178,56,0.95)',  speaker: '#ffb238',                text: '#fff1d6' },
};

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

// Cars are built out of separable parts, because the whole point of this game
// is watching them come apart. Every panel is its own mesh with its own hit
// points; nothing is merged, so a bonnet can leave at 200km/h and the car
// carries on without it.
//
// Local space: forward is -Z, up is +Y, right is +X.
//
// THE RULE THAT SHAPES THIS FILE: a panel coming off has to CHANGE THE PICTURE.
// The old car was one painted tub with painted lids on top of it, so removing
// the bonnet revealed more paint, removing a door revealed more paint, and a car
// that had lost twenty parts still read as a car. So the painted bodywork is now
// a SKIN over a skeleton — rollcage, floorpan, chassis rails, seat, engine — in
// bare steel, primer and rust. Every panel that leaves exposes some of it, and
// the end state is a go-kart made of scrap that is still, somehow, racing.

import * as THREE from 'three';
import { quality } from './render.js';
import { CRASH } from './config.js';
import { shadeHex, rand, pick } from './utils.js';

// ---------------------------------------------------------------------------
// Body styles
// ---------------------------------------------------------------------------
// `topW`/`topD` pull the cabin roof in so the glasshouse tapers; `rake` drops
// the leading edge of the bonnet; `waist` is the shoulder crease down the
// flanks. Together they are the difference between a car and a shoebox.
export const BODY_STYLES = {
  muscle: {
    name: 'MUSCLE', len: 4.5, wide: 2.0, ride: 0.42,
    bonnet: 1.55, boot: 1.0, roofLen: 1.55, roofH: 0.52, nose: 0.06, wheel: 0.41, spoiler: 'lip',
    topW: 0.8, topD: 0.72, rake: 0.1, waist: 0.9, grille: 'slot',
  },
  wedge: {
    name: 'WEDGE', len: 4.4, wide: 2.05, ride: 0.34,
    bonnet: 1.7, boot: 0.85, roofLen: 1.35, roofH: 0.42, nose: 0.16, wheel: 0.38, spoiler: 'wing',
    topW: 0.66, topD: 0.6, rake: 0.16, waist: 0.78, grille: 'splitter',
  },
  stock: {
    name: 'STOCK', len: 4.3, wide: 1.95, ride: 0.46,
    bonnet: 1.25, boot: 1.15, roofLen: 1.7, roofH: 0.56, nose: 0.02, wheel: 0.40, spoiler: 'none',
    topW: 0.82, topD: 0.8, rake: 0.06, waist: 0.94, grille: 'mesh',
  },
  van: {
    name: 'HAULER', len: 4.7, wide: 2.15, ride: 0.56,
    bonnet: 0.85, boot: 0.5, roofLen: 2.9, roofH: 1.0, nose: 0.0, wheel: 0.45, spoiler: 'none',
    topW: 0.93, topD: 0.96, rake: 0.05, waist: 1.0, grille: 'mesh',
  },
  buggy: {
    name: 'BUGGY', len: 4.0, wide: 2.1, ride: 0.62,
    bonnet: 1.1, boot: 1.1, roofLen: 1.5, roofH: 0.55, nose: 0.0, wheel: 0.52, spoiler: 'cage', open: true,
    topW: 0.8, topD: 0.8, rake: 0.08, waist: 0.86, grille: 'bar',
  },
};

export const STYLE_IDS = Object.keys(BODY_STYLES);

// Every panel: how much punishment it takes and what it does when it goes.
// `hp` is a fraction of the car's part budget; `mass` drives debris tumble.
//
// The trim band (mirrors, arches, sills) is deliberately cheap. Ordinary racing
// — a rail scrape, a kerb, a nudge — is supposed to be constantly flicking small
// bits off the car, so that something is coming loose almost all the time, while
// the doors and the roof still take a proper hit to shift.
const PART_SPEC = {
  bonnet:     { hp: 0.55, mass: 0.9,  region: 'front' },
  boot:       { hp: 0.55, mass: 0.9,  region: 'rear' },
  roof:       { hp: 0.90, mass: 1.2,  region: 'top' },
  windscreen: { hp: 0.28, mass: 0.2,  region: 'front', glass: true },
  rearglass:  { hp: 0.26, mass: 0.2,  region: 'rear',  glass: true },
  doorL:      { hp: 0.62, mass: 0.8,  region: 'left' },
  doorR:      { hp: 0.62, mass: 0.8,  region: 'right' },
  bumperF:    { hp: 0.46, mass: 0.7,  region: 'front' },
  bumperR:    { hp: 0.46, mass: 0.7,  region: 'rear' },
  spoiler:    { hp: 0.34, mass: 0.5,  region: 'rear' },
  mirrorL:    { hp: 0.09, mass: 0.15, region: 'left' },
  mirrorR:    { hp: 0.09, mass: 0.15, region: 'right' },
  // Arches and sills: the cheap stuff that ordinary contact keeps stripping.
  wingFL:     { hp: 0.20, mass: 0.3,  region: 'left' },
  wingFR:     { hp: 0.20, mass: 0.3,  region: 'right' },
  wingRL:     { hp: 0.20, mass: 0.3,  region: 'left' },
  wingRR:     { hp: 0.20, mass: 0.3,  region: 'right' },
  sillL:      { hp: 0.24, mass: 0.35, region: 'left' },
  sillR:      { hp: 0.24, mass: 0.35, region: 'right' },
  wheelFL:    { hp: 0.78, mass: 1.0,  region: 'front', wheel: true },
  wheelFR:    { hp: 0.78, mass: 1.0,  region: 'front', wheel: true },
  wheelRL:    { hp: 0.78, mass: 1.0,  region: 'rear',  wheel: true },
  wheelRR:    { hp: 0.78, mass: 1.0,  region: 'rear',  wheel: true },
};

export const PART_IDS = Object.keys(PART_SPEC);
export const partSpec = (id) => PART_SPEC[id];

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// --- livery ----------------------------------------------------------------
// A car has to be two colours. One flat hue over the whole shell puts the body,
// the doors and the arches in the same value band, and at the size the player
// actually sees the car that collapses into a single blob — which is exactly
// what the white starter car was doing against a white sky.
//
// `body` and `trim` come from the chassis data. Where they already contrast,
// trim IS the second colour and gets a whole panel to itself. Where they do not
// (the starter car is white with pale grey trim) we take the decision here
// rather than let the car go out as one value.
const lumaOf = (hex) => (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255)
  + 0.114 * (hex & 255)) / 255;
const chromaOf = (hex) => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
};
// A CAR IS NOT ALLOWED TO BE PAPER-WHITE.
//
// The starter chassis ships at near 0xffffff, and a 0.95-albedo body in full
// sun is the one material in this game that has nowhere left to go: its lit
// up-face and its lit side-face both run off the end of the tone curve and
// arrive within a handful of levels of each other, so the largest object in the
// centre of the frame comes back with no form in it at all. The grade now has
// real headroom in it, but headroom you spend on a white that was never going
// to hold a value step is headroom wasted, so the paint itself comes down.
//
// Only the top of the range is touched — a red or a teal car is left exactly as
// its chassis data asks — and the cut is small: 0xffffff becomes a cool bone
// around 0xdfe2e8, which still reads unmistakably as "the white car" and now
// spans about thirty levels between its bonnet and its flank instead of five.
// The cool bias matters as much as the value: a white car against a cream
// grandstand needs a hue to separate on as well.
const PAINT_CEIL = 0.86;
function paintFor(hex) {
  const l = lumaOf(hex);
  if (l <= PAINT_CEIL) return hex;
  const k = PAINT_CEIL / l;
  const r = Math.round(((hex >> 16) & 255) * k * 0.955);
  const g = Math.round(((hex >> 8) & 255) * k * 0.985);
  const b = Math.round((hex & 255) * k);
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
}

function accentFor(bodyHex, trimHex) {
  const bl = lumaOf(bodyHex);
  if (Math.abs(bl - lumaOf(trimHex)) > 0.24) return trimHex;
  // Trim is not doing the job. A colourless car gets racing red; anything else
  // swings to the opposite end of the value scale.
  if (chromaOf(bodyHex) < 0.16) return 0xd8322c;
  return bl > 0.5 ? 0x1e232b : 0xeef2f6;
}

// A box whose top face is pulled in and pushed back. One helper turns every
// slab in this file into something with a shoulder line: the cabin gets a
// proper glasshouse, the body gets a waist, and none of it costs a triangle
// or breaks the "every panel is its own mesh" rule the damage model needs.
function taperedBox(w, h, d, topW = 1, topD = 1, rake = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) <= 0) continue;
    p.setX(i, p.getX(i) * topW);
    p.setZ(i, p.getZ(i) * topD + rake);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// A wedge: the front of the box is lower than the back. Bonnets and boots stop
// reading as planks the moment they have a couple of degrees of rake in them.
function rakedSlab(w, h, d, drop) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  const half = d / 2;
  for (let i = 0; i < p.count; i++) {
    const k = (half - p.getZ(i)) / d;       // 0 at the back, 1 at the front
    p.setY(i, p.getY(i) - k * drop);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function meshPart(id, geo, mat, pos, spec, partHpBudget) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = quality.shadows;
  m.name = id;
  m.userData.part = {
    id,
    hp: spec.hp * partHpBudget,
    maxHp: spec.hp * partHpBudget,
    mass: spec.mass,
    region: spec.region,
    glass: !!spec.glass,
    wheel: !!spec.wheel,
    home: new THREE.Vector3(pos[0], pos[1], pos[2]),
    dent: 0,
  };
  return m;
}

// ---------------------------------------------------------------------------
// How a panel behaves once it has torn loose but not yet left.
// ---------------------------------------------------------------------------
// Every dangler used to share one generic wobble, so a bonnet, a bumper and a
// mirror all did the same thing. Each panel now carries its own hinge: WHERE it
// pivots (in its own local space), WHICH way it folds, how far, how fast, and
// which corner of it is the one that ends up on the tarmac.
//
// car.js:updateDanglers reads this and nothing else — the numbers are worked
// out here because this is the only file that knows how big anything is.
function setFlap(obj, cfg) {
  const p = obj.userData.part;
  if (!p) return;
  p.flap = {
    style: cfg.style || 'panel',
    pivot: cfg.pivot || new THREE.Vector3(),
    drag: cfg.drag || null,             // local point that grinds on the road
    dir: cfg.dir != null ? cfg.dir : 1, // sign of the main hinge angle
    ang: cfg.ang != null ? cfg.ang : 0.7,   // radians at full flap
    ang0: cfg.ang0 != null ? cfg.ang0 : cfg.ang * 0.28,  // radians the moment it tears
    rate: cfg.rate != null ? cfg.rate : 7,  // main oscillation rad/s
    buzz: cfg.buzz != null ? cfg.buzz : 0,  // secondary high-frequency shiver
    twist: cfg.twist != null ? cfg.twist : 0,
    sag: cfg.sag != null ? cfg.sag : 0,
    slam: !!cfg.slam,                   // bangs against a hard stop each cycle
  };
}

// ---------------------------------------------------------------------------
export function buildCar(opts = {}) {
  const style = BODY_STYLES[opts.style] || BODY_STYLES.stock;
  const bodyHex = paintFor(opts.body != null ? opts.body : 0xe23c3c);
  const trimHex = opts.trim != null ? opts.trim : 0xffd166;
  const partHp = 100 * (opts.partHp || 1);

  const g = new THREE.Group();
  g.name = 'car';

  const accentHex = accentFor(bodyHex, trimHex);

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyHex });
  const bodyDark = new THREE.MeshLambertMaterial({ color: shadeHex(bodyHex, -0.35) });
  const trimMat = new THREE.MeshLambertMaterial({ color: trimHex });
  // The second colour. It owns the door skins, the boot crease and the bonnet
  // bulge — one continuous band of it down the flank, the way a two-tone works.
  const accentMat = new THREE.MeshLambertMaterial({ color: accentHex });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x4c7f99, transparent: true, opacity: 0.66,
  });
  // The glasshouse is a dark band, not a body-coloured lump with two windows in
  // it. This is most of what stops a pale car reading as a white box.
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0x252b33 });
  // The tyre and the arch liner used to be within a few levels of each other,
  // so a wheel in an arch came back as one unreadable black lump. The liner is
  // now a clear step ABOVE the rubber: dark enough to still be the occlusion
  // crescent under the flare, light enough that the tyre has something to be a
  // silhouette against.
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x15181d });
  const archMat = new THREE.MeshLambertMaterial({ color: 0x2f333b });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xc2cad4 });
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x484f58 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  // Not a lamp that comes on under braking — a tail-light BAND that is red all
  // the time. animateCarMesh still owns the colour; it just runs hot.
  const brakeMat = new THREE.MeshBasicMaterial({ color: 0xd8241c });
  // --- the skeleton palette -------------------------------------------------
  // Bare steel, primer and rust. None of these are ever tinted by the livery,
  // which is the point: whatever colour the car is painted, what comes out from
  // under the paint is always the same scrapyard grey-and-orange, so a stripped
  // car reads as stripped at a glance and at a distance.
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xa4abb4 });   // bare steel cage
  const rustMat = new THREE.MeshLambertMaterial({ color: 0x9c5c2e });    // primer / rust
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x3d434b });   // grimy floorpan
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x22252a });    // vinyl bucket
  const engineMat = new THREE.MeshLambertMaterial({ color: 0x565e68 });  // oily block
  const owned = [bodyMat, bodyDark, trimMat, accentMat, glassMat, cabinMat, tyreMat,
    rimMat, pipeMat, darkMat, lightMat, brakeMat, frameMat, rustMat, floorMat, seatMat,
    engineMat, archMat];
  for (const m of owned) m.__owned = true;

  const L = style.len, W = style.wide, R = style.ride;
  const halfL = L / 2;
  const cabinZ = (style.boot - style.bonnet) * 0.35;

  // Wheels and arches are laid out together, so both need these up front.
  const wr = style.wheel;
  const axleZ = halfL - wr - 0.32;
  const hubX = W * 0.5 + 0.07;      // outboard of every painted panel
  const tyreW = 0.40;
  const archY = wr * 2;             // the top of the tyre; the arch is built off it

  // The cabin is a HOLE in the bodywork, not a lid on top of a solid tub. Doors
  // skin the outside of it; take one off and you are looking straight into the
  // cockpit and out the other side.
  const cabLen = style.roofLen * 1.15;
  const cabF = cabinZ - cabLen / 2;
  const cabB = cabinZ + cabLen / 2;
  const frontLen = Math.max(0.34, cabF + halfL);
  const rearLen = Math.max(0.34, halfL - cabB);
  const frontZ = (-halfL + cabF) / 2;
  const rearZ = (cabB + halfL) / 2;

  const deckTop = R + 0.26;     // top of the tubs = the engine-bay / boot floor
  // The waistline. It used to be R+0.54, which put it level with the top of the
  // tyres — so there was no bodywork above a wheel for an arch to be cut into,
  // and the wheels read as boxes bolted to the side of a slab. Twelve more
  // centimetres of flank is the whole difference.
  const beltH = R + 0.66;       // the waistline the bonnet and boot sit on
  const roofY = beltH + 0.02;   // where the glasshouse starts

  // One unit cube, scaled per member. Twenty-odd structural bars for twelve
  // triangles each and a single geometry to dispose.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const bar = (mat, sx, sy, sz, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(unitBox, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, rz);
    return m;
  };

  // --- chassis: the one thing that never leaves -----------------------------
  // Two waisted tubs with an open cockpit between them. The tubs stop at the
  // belt line, so what is above them is bodywork that can leave: the bonnet over
  // the engine bay, the boot lid over the fuel cell.
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  chassis.userData.part = { id: 'chassis', hp: Infinity, maxHp: Infinity, core: true, region: 'core' };

  const frontTub = new THREE.Mesh(taperedBox(W * 0.9, 0.26, frontLen, style.waist, 0.99), bodyMat);
  frontTub.position.set(0, R + 0.13, frontZ);
  frontTub.castShadow = quality.shadows;
  chassis.add(frontTub);
  const rearTub = new THREE.Mesh(taperedBox(W * 0.9, 0.26, rearLen, style.waist, 0.99), bodyMat);
  rearTub.position.set(0, R + 0.13, rearZ);
  rearTub.castShadow = quality.shadows;
  chassis.add(rearTub);

  // Wing tops: the painted rails that carry the flank up from the tub to the
  // belt line and frame the engine bay on both sides.
  const railH = beltH - (R + 0.24);
  for (const sx of [-1, 1]) {
    chassis.add(bar(bodyMat, 0.13, railH, frontLen, sx * W * 0.40, R + 0.24 + railH / 2, frontZ));
    chassis.add(bar(bodyMat, 0.13, railH, rearLen, sx * W * 0.40, R + 0.24 + railH / 2, rearZ));
  }
  // THE TAIL PANEL. The rear of this car used to be a waisted tub with a boot
  // lid sloping away off the top of it, which from directly behind — where the
  // player spends the entire race — is one large up-facing plane with nothing
  // for the key light to break against. A flat vertical panel across the full
  // width gives the light a face to catch, gives the boot lid a shut line, and
  // gives the tail lights something to be mounted ON.
  // A shade down from the flanks, so the tail is still layered — dark panel,
  // red band, painted boot lid — on the many laps where the bumper has already
  // been knocked off and there is nothing dark down there any more.
  const endH = beltH - (R + 0.04);
  chassis.add(bar(bodyDark, W * 0.96, endH, 0.10, 0, R + 0.04 + endH / 2, halfL - 0.04));
  // The same at the nose, so the front is a face and not a wedge, and the
  // engine bay is still a bay rather than a hole you can see the road through.
  chassis.add(bar(bodyDark, W * 0.94, endH, 0.10, 0, R + 0.04 + endH / 2, -halfL + 0.04));
  // The bay floors. Without these, lifting the bonnet reveals the painted top of
  // the tub — which is exactly the "no value change for the eye" problem.
  chassis.add(bar(floorMat, W * 0.8, 0.05, frontLen * 0.98, 0, deckTop + 0.02, frontZ));
  chassis.add(bar(floorMat, W * 0.8, 0.05, rearLen * 0.98, 0, deckTop + 0.02, rearZ));

  // Firewall and rear bulkhead — dark, so a missing door shows a black cockpit
  // rather than a body-coloured wall, and you cannot see through into the bay.
  const wallH = beltH - (R + 0.02);
  chassis.add(bar(darkMat, W * 0.84, wallH, 0.08, 0, R + 0.02 + wallH / 2, cabF));
  chassis.add(bar(darkMat, W * 0.84, wallH, 0.08, 0, R + 0.02 + wallH / 2, cabB));

  // Floorpan and the two main chassis rails. The rails sit just inboard of the
  // painted flank so that losing a sill exposes bare rusted structure.
  chassis.add(bar(floorMat, W * 0.82, 0.09, cabLen + 0.1, 0, R + 0.05, cabinZ));
  for (const sx of [-1, 1]) {
    chassis.add(bar(rustMat, 0.11, 0.20, L * 0.86, sx * W * 0.43, R + 0.15, 0));
  }

  // --- THE DARK LOWER BAND --------------------------------------------------
  // Every low-poly car that reads as solid has one, and it is doing more work
  // than any other single decision on this model. A strip of near-black running
  // the whole length of the car under the doors gives the flank a hard bottom
  // edge and pins the mass to the road; without it a pale body is a slab with
  // a soft, ambiguous underside that dissolves into whatever it is parked on.
  // Critically it works on ANY livery — the white starter car and a black rival
  // both get one — so it is the one anchor that does not depend on the paint.
  //
  // It is on the CHASSIS, not on the sills, because the sills come off in the
  // first lap of ordinary contact and the anchor has to survive that. The sills
  // and both bumpers are the same near-black, so what the eye sees is one
  // continuous dark line from nose to tail, broken only by a wheel in an arch.
  const valH = 0.26;
  for (const sx of [-1, 1]) {
    chassis.add(bar(darkMat, 0.12, valH, L * 0.96, sx * W * 0.455, R - 0.01, 0));
  }

  // --- the rollcage ---------------------------------------------------------
  // Sits inside the glasshouse when the roof is on, in plain sight the moment it
  // is not, and visible through a missing door either way.
  const capH = roofY + style.roofH * 0.84;
  const hoopZ = cabB - 0.14;
  const cage = new THREE.Group();
  for (const sx of [-1, 1]) {
    cage.add(bar(frameMat, 0.09, capH - (R + 0.16), 0.09, sx * W * 0.30, (capH + R + 0.16) / 2, hoopZ));
    // A-pillar bar: down and forward to the scuttle.
    const dz = hoopZ - (cabF + 0.06), dy = capH - (beltH - 0.04);
    const len = Math.hypot(dz, dy);
    cage.add(bar(frameMat, 0.085, len, 0.085, sx * W * 0.30,
      (capH + beltH - 0.04) / 2, (hoopZ + cabF + 0.06) / 2, Math.atan2(dz, dy)));
  }
  cage.add(bar(frameMat, W * 0.63, 0.09, 0.09, 0, capH, hoopZ));
  cage.add(bar(frameMat, W * 0.58, 0.08, 0.08, 0, beltH - 0.10, cabF + 0.1));
  chassis.add(cage);

  // --- engine bay and boot --------------------------------------------------
  const engZ = cabF - Math.min(0.52, frontLen * 0.44);
  const engD = Math.min(0.7, frontLen * 0.78);
  chassis.add(bar(engineMat, 0.66, 0.34, engD, 0, deckTop + 0.21, engZ));
  chassis.add(bar(rimMat, 0.54, 0.12, engD * 0.8, 0, deckTop + 0.44, engZ));
  chassis.add(bar(rustMat, 0.28, 0.16, 0.26, 0, deckTop + 0.43, engZ - engD * 0.28));
  // exhaust header snaking down the side of the block
  chassis.add(bar(frameMat, 0.07, 0.07, engD * 0.92, 0.36, deckTop + 0.13, engZ));
  // fuel cell and the rear hoop stay in the boot
  const cellD = Math.min(0.56, rearLen * 0.64);
  chassis.add(bar(rustMat, 0.62, 0.34, cellD, 0, deckTop + 0.21, rearZ - rearLen * 0.1));
  chassis.add(bar(frameMat, W * 0.7, 0.08, 0.09, 0, deckTop + 0.42, rearZ + rearLen * 0.28));

  // --- seat and controls ----------------------------------------------------
  const seat = new THREE.Group();
  seat.add(bar(seatMat, 0.46, 0.10, 0.46, 0, R + 0.16, cabinZ + 0.12));
  seat.add(bar(seatMat, 0.46, 0.56, 0.12, 0, R + 0.44, cabinZ + 0.36, 0.16));
  seat.add(bar(seatMat, 0.30, 0.16, 0.10, 0, R + 0.76, cabinZ + 0.31));
  seat.name = 'seat';
  chassis.add(seat);
  chassis.add(bar(darkMat, 0.30, 0.05, 0.30, 0, beltH - 0.02, cabF + 0.30, -0.85));
  chassis.add(bar(darkMat, 0.05, 0.05, 0.26, 0, beltH - 0.10, cabF + 0.20, -0.85));
  g.add(chassis);

  // --- sills / rocker panels ------------------------------------------------
  // The rocker runs BETWEEN the arches, so there is a genuine gap of daylight
  // fore and aft of every wheel. It is now the same near-black as the bumpers
  // and the chassis valance behind it. A previous pass put it in body-dark to
  // stop the whole underside joining up into one dark band — but that band is
  // the point: it is the thing that anchors the car's mass to the road, and a
  // mid-grey rocker on a pale car was simply more pale car.
  const sillLen = Math.max(0.7, 2 * (axleZ - wr - 0.05));
  const sillH = 0.28;
  for (const [id, sx] of [['sillL', -1], ['sillR', 1]]) {
    const skirt = meshPart(id, box(0.13, sillH, sillLen), darkMat,
      [sx * W * 0.47, R + 0.03, 0], PART_SPEC[id], partHp);
    setFlap(skirt, {
      style: 'sill', pivot: new THREE.Vector3(0, sillH / 2, -sillLen / 2),
      drag: new THREE.Vector3(sx * 0.06, -sillH / 2, sillLen / 2),
      dir: 1, ang: 0.34, ang0: 0.06, rate: 5.5, buzz: 24, twist: 0.1,
    });
    g.add(skirt);
  }

  // --- wheel arches ---------------------------------------------------------
  // THE defect this whole file was rebuilt for. The wheels used to be dark
  // cuboids set flush with the bodyside, so there was no arch shadow, no gap
  // between tyre and body, and the wheel never broke the silhouette — the car
  // read as a white cube skidding above the road.
  //
  // Two pieces per corner, sharing one geometry each across all four:
  //   LIP    body-coloured, flared OUTBOARD past the tyre, long at the bottom
  //          and short at the top so its side profile is an arch and not a slab
  //   LINER  near-black, tucked under the lip and over the top ~15% of the tyre
  //
  // The liner is what buys the dark occlusion crescent whatever the light is
  // doing, and because the lip overhangs the tyre it drops a real cast shadow
  // on top of that. The tyre itself is outboard of every painted panel, so it
  // breaks the silhouette from any angle.
  // The lip's top face used to be as wide as its bottom (topW 1), which on a
  // near-white car put a flat, fully-lit horizontal shelf sticking twenty
  // centimetres out of the bodyside just above the rear wheel — read, correctly,
  // as "a white wedge that looks like stray geometry rather than bodywork".
  // Pulling the top in to 42% turns the same box into a flare that rolls back
  // into the flank: the outboard face is now a slope catching a value of its
  // own, and there is no lit horizontal plane detached from the body at all.
  // AND IT IS NOT PAINTED IN THE BODY COLOUR. On a pale car a body-coloured
  // flare standing proud of the flank, with a strip of dark cockpit shadow
  // between it and the door, is a bright quadrilateral floating beside the car —
  // "a white wedge above the rear arch that reads as stray geometry, not
  // bodywork". In body-dark it is an eyebrow instead: it groups with the tyre
  // and the rocker into one dark mass at the bottom of the flank, which is the
  // job an arch has always had, and it cannot go bright on any livery.
  const lipGeo = taperedBox(0.34, 0.19, wr * 2.9, 0.52, 0.64);
  const linerGeo = box(0.38, 0.26, wr * 2.2);
  for (const [id, sx, sz] of [['wingFL', -1, -1], ['wingFR', 1, -1], ['wingRL', -1, 1], ['wingRR', 1, 1]]) {
    const arch = meshPart(id, lipGeo, bodyDark,
      [sx * (W * 0.5 - 0.01), archY + 0.13, sz * axleZ], PART_SPEC[id], partHp);
    const liner = new THREE.Mesh(linerGeo, archMat);
    liner.position.set(-sx * 0.02, -0.21, 0);
    arch.add(liner);
    setFlap(arch, {
      style: 'wing', pivot: new THREE.Vector3(-sx * 0.22, 0.05, 0),
      drag: new THREE.Vector3(sx * 0.2, -0.34, 0),
      dir: sx, ang: 0.5, ang0: 0.04, rate: 9, buzz: 34, twist: 0.22,
    });
    g.add(arch);
  }

  // --- bonnet and boot -----------------------------------------------------
  // Sized to the bay they cover rather than to a style constant, so a bonnet is
  // exactly the lid of the engine bay and lifting it always reveals an engine.
  const bonnetY = beltH + 0.04 + style.rake * 0.5;
  const bonnet = meshPart('bonnet', rakedSlab(W * 0.86, 0.16, frontLen, style.rake), bodyMat,
    [0, bonnetY, frontZ], PART_SPEC.bonnet, partHp);
  setFlap(bonnet, {
    style: 'bonnet', pivot: new THREE.Vector3(0, -0.08, frontLen / 2),
    dir: 1, ang: 1.25, ang0: 0.18, rate: 4.4, buzz: 15, slam: true,
  });
  // Every bonnet gets a power bulge. It is not decoration: it buys 0.14m of
  // headroom for the engine, so when the bonnet leaves there is a tall lump of
  // machinery standing proud of the wings instead of a dark slot you have to
  // squint at. It travels with the bonnet, so it cannot be left floating.
  const bulge = new THREE.Mesh(
    taperedBox(W * 0.38, 0.15, frontLen * 0.62, 0.74, 0.82), accentMat);
  bulge.position.set(0, 0.14, -frontLen * 0.06);
  bonnet.add(bulge);
  g.add(bonnet);

  const boot = meshPart('boot', rakedSlab(W * 0.86, 0.16, rearLen, -style.rake * 0.5), bodyMat,
    [0, beltH + 0.04, rearZ], PART_SPEC.boot, partHp);
  // One horizontal crease across the boot lid. A flat lid is a plank; a lid
  // with a line across it near the tail reads as pressed steel, and the line
  // itself gives the shot a horizontal to sit against the tail-light band.
  const crease = new THREE.Mesh(box(W * 0.82, 0.06, 0.12), accentMat);
  crease.position.set(0, 0.08, rearLen * 0.26);
  boot.add(crease);
  setFlap(boot, {
    style: 'boot', pivot: new THREE.Vector3(0, -0.08, -rearLen / 2),
    dir: -1, ang: 1.0, ang0: 0.16, rate: 6.6, buzz: 18, slam: true,
  });
  g.add(boot);

  // --- cabin: roof, glass, driver ------------------------------------------
  if (!style.open) {
    const roof = new THREE.Group();
    // The glasshouse: narrower and shorter at the top than at the belt, pushed
    // back a touch so there is a windscreen rake rather than a wall.
    // The shell is the GLASSHOUSE, so it is dark. Painting it body colour put
    // the cabin in the same value band as the flanks and the sky, which is half
    // of why a pale car read as one box. A body-coloured cap sits on top of it,
    // so what you see is roof / dark band / shoulder — three values, one car.
    const shell = new THREE.Mesh(
      taperedBox(W * 0.8, style.roofH, style.roofLen, style.topW, style.topD, style.roofLen * 0.06),
      cabinMat);
    shell.position.y = style.roofH / 2;
    shell.castShadow = quality.shadows;
    roof.add(shell);
    const cap = new THREE.Mesh(
      box(W * 0.8 * style.topW + 0.03, 0.09, style.roofLen * style.topD + 0.03), accentMat);
    cap.position.set(0, style.roofH - 0.02, style.roofLen * 0.06);
    cap.castShadow = quality.shadows;
    roof.add(cap);
    // pillars — the fronts lean back with the screen, the rears stay upright.
    // Body colour, because a painted pillar against dark glass is the thing
    // that makes a glasshouse read as a glasshouse at fifty pixels.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(box(0.13, style.roofH * 1.02, 0.13), bodyMat);
        pillar.position.set(sx * W * 0.37, style.roofH / 2, sz * style.roofLen * 0.45);
        pillar.rotation.x = sz < 0 ? -0.2 : 0.12;
        roof.add(pillar);
      }
    }
    roof.position.set(0, roofY, cabinZ);
    roof.name = 'roof';
    roof.userData.part = {
      id: 'roof', hp: PART_SPEC.roof.hp * partHp, maxHp: PART_SPEC.roof.hp * partHp,
      mass: PART_SPEC.roof.mass, region: 'top',
      home: roof.position.clone(), dent: 0,
    };
    setFlap(roof, {
      style: 'roof', pivot: new THREE.Vector3(0, 0, style.roofLen * 0.5),
      dir: 1, ang: 0.95, ang0: 0.1, rate: 2.6, buzz: 9, twist: 0.16,
    });
    g.add(roof);

    const wind = meshPart('windscreen', box(W * 0.74, style.roofH * 0.95, 0.08), glassMat,
      [0, roofY + style.roofH * 0.48, cabinZ - style.roofLen * 0.5], PART_SPEC.windscreen, partHp);
    wind.rotation.x = -0.34;
    wind.userData.part.home.copy(wind.position);
    g.add(wind);

    const rearg = meshPart('rearglass', box(W * 0.72, style.roofH * 0.9, 0.08), glassMat,
      [0, roofY + style.roofH * 0.48, cabinZ + style.roofLen * 0.5], PART_SPEC.rearglass, partHp);
    rearg.rotation.x = 0.4;
    rearg.userData.part.home.copy(rearg.position);
    g.add(rearg);
  } else {
    // buggy: exposed roll cage instead of a roof
    const hoop = new THREE.Group();
    const barGeo = box(0.1, 0.1, 1.5);
    for (const sx of [-1, 1]) {
      const up = new THREE.Mesh(box(0.1, 1.0, 0.1), darkMat);
      up.position.set(sx * W * 0.36, 0.5, cabinZ + 0.4);
      hoop.add(up);
      const diag = new THREE.Mesh(barGeo, darkMat);
      diag.position.set(sx * W * 0.36, 0.85, cabinZ - 0.35);
      diag.rotation.x = 0.55;
      hoop.add(diag);
    }
    const top = new THREE.Mesh(box(W * 0.78, 0.1, 0.12), darkMat);
    top.position.set(0, 1.0, cabinZ + 0.4);
    hoop.add(top);
    hoop.position.y = beltH - 0.10;
    hoop.name = 'roof';
    hoop.userData.part = {
      id: 'roof', hp: PART_SPEC.roof.hp * partHp * 1.5, maxHp: PART_SPEC.roof.hp * partHp * 1.5,
      mass: PART_SPEC.roof.mass, region: 'top', home: hoop.position.clone(), dent: 0,
    };
    setFlap(hoop, {
      style: 'roof', pivot: new THREE.Vector3(0, 0, cabinZ + 0.4),
      dir: 1, ang: 0.8, ang0: 0.1, rate: 3.2, buzz: 12, twist: 0.2,
    });
    g.add(hoop);
  }

  // driver — a helmet you can see once the roof has gone
  const driver = new THREE.Group();
  const torso = new THREE.Mesh(box(0.42, 0.4, 0.3), new THREE.MeshLambertMaterial({ color: 0x2f3238 }));
  torso.material.__owned = true;
  torso.position.y = 0.2;
  driver.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.21, 5, 3), trimMat);
  helmet.position.y = 0.56;
  driver.add(helmet);
  const visor = new THREE.Mesh(box(0.3, 0.11, 0.06), new THREE.MeshBasicMaterial({ color: 0x101418 }));
  visor.material.__owned = true;
  visor.position.set(0, 0.58, -0.19);
  driver.add(visor);
  driver.position.set(0, R + 0.44, cabinZ + 0.1);
  driver.name = 'driver';
  g.add(driver);

  // --- doors ---------------------------------------------------------------
  // Skins on the outside of the cockpit hole. One off and you see the sill, the
  // cage, the seat and daylight through the far side.
  // They are also where the second colour lives: one contrasting slab down the
  // middle of the flank, between the body-coloured arches and the black rocker.
  for (const [id, sx] of [['doorL', -1], ['doorR', 1]]) {
    const doorH = beltH - (R + 0.16);
    const d = meshPart(id, box(0.12, doorH, cabLen), accentMat,
      [sx * W * 0.49, R + 0.16 + doorH / 2, cabinZ], PART_SPEC[id], partHp);
    setFlap(d, {
      style: 'door', pivot: new THREE.Vector3(0, doorH / 2, -cabLen / 2),
      drag: new THREE.Vector3(sx * 0.06, -doorH / 2, cabLen / 2),
      dir: sx, ang: 1.02, ang0: 0.16, rate: 3.4, buzz: 11, sag: 0.5,
    });
    g.add(d);
  }

  // --- bumpers -------------------------------------------------------------
  // Both sit LOW and stand PROUD of the tail panel, so the shut line along the
  // top of the bumper is in shadow and the lights above it are not. A bumper
  // level with the lights is just more slab.
  // They also serve as the valance: their bottom edge is well below the axle
  // line, so the body's low line runs the length of the car and the only thing
  // interrupting it is a wheel in an arch. A bumper level with the tail lights
  // was leaving a metre of daylight under the nose, which is what made the car
  // read as a box hovering over four boxes.
  // Shallower and tucked in tighter than they were: at 0.32 deep and 10cm proud
  // of the tail panel the rear bumper read as a separate black drawer hanging
  // off the back of the car rather than as the bottom of it.
  const bumpY = R + 0.02, bumpH = 0.32;
  const noseZ = -halfL - 0.06;
  const bumperF = meshPart('bumperF', box(W * 0.96, bumpH, 0.24), darkMat,
    [0, bumpY, noseZ], PART_SPEC.bumperF, partHp);
  setFlap(bumperF, {
    style: 'bumper', pivot: new THREE.Vector3(W * 0.5, 0, 0),
    drag: new THREE.Vector3(-W * 0.5, -bumpH / 2, 0),
    dir: 1, ang: 1.0, ang0: 0.14, rate: 2.9, buzz: 16, twist: 0.34,
  });
  g.add(bumperF);
  const bumperR = meshPart('bumperR', box(W * 0.96, bumpH, 0.24), darkMat,
    [0, bumpY, halfL + 0.06], PART_SPEC.bumperR, partHp);
  setFlap(bumperR, {
    style: 'bumper', pivot: new THREE.Vector3(-W * 0.5, 0, 0),
    drag: new THREE.Vector3(W * 0.5, -bumpH / 2, 0),
    dir: -1, ang: 1.0, ang0: 0.14, rate: 2.9, buzz: 16, twist: -0.34,
  });
  g.add(bumperR);

  // --- the tail-light band --------------------------------------------------
  // Two little maroon squares on a white slab is not a rear end. This is one
  // horizontal band the full width of the car at bumper-top height, sitting in
  // a black recess so the red has an outline whatever it is parked against. It
  // is the single strongest "that is the back of a car" cue there is, and at
  // the size the player sees the car it is most of the read.
  const lampY = beltH - 0.21;
  const recess = new THREE.Mesh(box(W * 0.99, 0.26, 0.05), darkMat);
  recess.position.set(0, lampY, halfL + 0.02);
  g.add(recess);
  const band = new THREE.Mesh(box(W * 0.87, 0.16, 0.05), brakeMat);
  band.position.set(0, lampY, halfL + 0.05);
  band.name = 'brakelight';
  g.add(band);

  // The nose gets the same treatment: a dark band with the lamps inside it.
  const mask = new THREE.Mesh(box(W * 0.97, 0.24, 0.05), darkMat);
  mask.position.set(0, lampY, -halfL - 0.02);
  g.add(mask);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(box(W * 0.34, 0.15, 0.05), lightMat);
    hl.position.set(sx * W * 0.29, lampY, -halfL - 0.05);
    g.add(hl);
  }

  // A face. Cheap, but a car with a grille reads as a car from the front and a
  // car without one reads as a fridge.
  // It lives in the gap between the two headlamps, because the bumper is low
  // enough now to swallow anything mounted under them.
  const face = new THREE.Group();
  if (style.grille === 'splitter') {
    // the splitter bolts to the bumper, so it goes when the bumper goes
    const lip = new THREE.Mesh(box(W * 1.0, 0.06, 0.30), darkMat);
    lip.position.set(0, -0.17, -0.1);
    bumperF.add(lip);
    const duct = new THREE.Mesh(box(W * 0.2, 0.10, 0.05), rimMat);
    duct.position.set(0, lampY, -halfL - 0.05);
    face.add(duct);
  } else if (style.grille === 'slot') {
    for (const i of [-1, 1]) {
      const b = new THREE.Mesh(box(W * 0.08, 0.17, 0.05), rimMat);
      b.position.set(i * W * 0.06, lampY, -halfL - 0.05);
      face.add(b);
    }
  } else if (style.grille === 'bar') {
    const b = new THREE.Mesh(box(W * 0.94, 0.09, 0.10), rimMat);
    b.position.set(0, beltH - 0.04, -halfL - 0.02);
    face.add(b);
  } else {
    const mesh = new THREE.Mesh(box(W * 0.22, 0.15, 0.05), rimMat);
    mesh.position.set(0, lampY, -halfL - 0.05);
    face.add(mesh);
  }
  face.name = 'face';
  g.add(face);

  // --- spoiler -------------------------------------------------------------
  if (style.spoiler !== 'none') {
    const sp = new THREE.Group();
    if (style.spoiler === 'wing') {
      const blade = new THREE.Mesh(box(W * 0.95, 0.07, 0.42), trimMat);
      blade.position.y = 0.42;
      sp.add(blade);
      for (const sx of [-1, 1]) {
        const strut = new THREE.Mesh(box(0.09, 0.42, 0.16), darkMat);
        strut.position.set(sx * W * 0.34, 0.21, 0);
        sp.add(strut);
      }
    } else if (style.spoiler === 'cage') {
      const b = new THREE.Mesh(box(W * 0.9, 0.1, 0.1), darkMat);
      b.position.y = 0.3;
      sp.add(b);
    } else {
      const lip = new THREE.Mesh(box(W * 0.85, 0.1, 0.28), trimMat);
      lip.position.y = 0.1;
      lip.rotation.x = -0.25;
      sp.add(lip);
    }
    sp.position.set(0, beltH + 0.12, halfL - 0.25);
    sp.name = 'spoiler';
    sp.userData.part = {
      id: 'spoiler', hp: PART_SPEC.spoiler.hp * partHp, maxHp: PART_SPEC.spoiler.hp * partHp,
      mass: PART_SPEC.spoiler.mass, region: 'rear', home: sp.position.clone(), dent: 0,
    };
    setFlap(sp, {
      style: 'spoiler', pivot: new THREE.Vector3(0, 0, 0),
      dir: 1, ang: 0.5, ang0: 0.08, rate: 11, buzz: 30, twist: 0.65,
    });
    g.add(sp);
  }

  // --- mirrors -------------------------------------------------------------
  for (const [id, sx] of [['mirrorL', -1], ['mirrorR', 1]]) {
    const m = meshPart(id, box(0.24, 0.12, 0.1), bodyDark,
      [sx * (W * 0.55), roofY + 0.06, cabinZ - style.roofLen * 0.5], PART_SPEC[id], partHp);
    setFlap(m, {
      style: 'mirror', pivot: new THREE.Vector3(-sx * 0.12, 0, 0),
      dir: sx, ang: 1.5, ang0: 0.4, rate: 13, buzz: 40, twist: 0.9,
    });
    g.add(m);
  }

  // --- wheels --------------------------------------------------------------
  // A tyre in a near-black and a rim in a light metal, as two separate meshes,
  // so the wheel reads as two parts at distance instead of one dark cuboid. The
  // rim is a flat disc on each face rather than a barrel: the only part of a
  // rim you ever see is the face, and a disc costs a third of the triangles.
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, tyreW, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CircleGeometry(wr * 0.64, 7);
  rimGeo.rotateY(Math.PI / 2);

  const wheels = [];
  for (const [id, sx, sz] of [['wheelFL', -1, -1], ['wheelFR', 1, -1], ['wheelRL', -1, 1], ['wheelRR', 1, 1]]) {
    const hub = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    hub.add(tyre);
    for (const f of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.x = f * (tyreW * 0.5 + 0.005);
      rim.rotation.y = f > 0 ? 0 : Math.PI;
      hub.add(rim);
    }
    hub.position.set(sx * hubX, wr, sz * axleZ);
    hub.name = id;
    hub.userData.part = {
      id, hp: PART_SPEC[id].hp * partHp, maxHp: PART_SPEC[id].hp * partHp,
      mass: PART_SPEC[id].mass, region: PART_SPEC[id].region, wheel: true,
      steer: sz < 0, home: hub.position.clone(), dent: 0, spin: 0,
    };
    setFlap(hub, {
      style: 'wheel', pivot: new THREE.Vector3(-sx * 0.2, 0, 0),
      drag: new THREE.Vector3(sx * 0.2, -wr, 0),
      dir: sx, ang: 0.55, ang0: 0.08, rate: 6, buzz: 20, twist: 0.3,
    });
    g.add(hub);
    wheels.push(hub);
  }
  // Stub axles: what is left sticking out when a wheel goes. These were in bare
  // steel (0xa4abb4) at the very bottom of the car, so on any shot from behind
  // two bright grey cubes hung below the black valance looking like unparented
  // primitives. They are a dirty hub now, tucked inboard and up, so they are
  // invisible until the wheel they belong to has actually left.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    chassis.add(bar(floorMat, 0.24, 0.11, 0.11, sx * (W * 0.40), wr * 0.86, sz * axleZ));
  }

  // --- exhaust / nose cone flourishes --------------------------------------
  if (style.nose > 0) {
    const nose = new THREE.Mesh(box(W * 0.60, 0.07, 0.34), bodyDark);
    nose.position.set(0, -bumpH * 0.5 + 0.04, -0.24);
    nose.name = 'nosecone';
    bumperF.add(nose);          // it leaves with the bumper, as it should
  }
  // Exhausts. They used to be two pale cubes on stalks hanging off the bottom
  // rear corner of the bumper — 13cm proud of it, at the very bottom edge, in a
  // light metal — and from the chase camera that is the whole read: two grey
  // boxes floating under the car. A tailpipe is a HOLE, so each one is now a
  // dark rectangular recess cut into the bumper with a short metal collar
  // barely standing out of it, mounted up off the bottom edge where a real
  // exhaust exits.
  for (const sx of [-1, 1]) {
    const cut = new THREE.Mesh(box(0.26, 0.15, 0.03), tyreMat);
    cut.position.set(sx * W * 0.26, -bumpH * 0.5 + 0.13, 0.115);
    bumperR.add(cut);
    const pipe = new THREE.Mesh(box(0.14, 0.07, 0.02), pipeMat);
    pipe.position.set(sx * W * 0.26, -bumpH * 0.5 + 0.13, 0.123);
    bumperR.add(pipe);
  }

  g.userData.style = style;
  g.userData.wheels = wheels;
  g.userData.mats = {
    bodyMat, bodyDark, trimMat, glassMat, tyreMat, darkMat, brakeMat,
    accentMat, cabinMat, rimMat, pipeMat, lightMat, frameMat, rustMat, floorMat, seatMat,
    engineMat, archMat,
  };
  g.userData.parts = {};
  g.traverse((o) => {
    if (o.userData.part && !o.userData.part.core) g.userData.parts[o.userData.part.id] = o;
  });
  g.userData.driver = driver;
  g.userData.seat = seat;
  g.userData.chassis = chassis;
  g.userData.hull = measureHull(g);
  return g;
}

// The box the rest of the game is allowed to think this car is.
//
// `CRASH.carLen/carWide` were one pair of numbers for every chassis, and they
// were the numbers the STYLE table asks for rather than the ones the factory
// then builds: a stock car is nominally 4.3 x 1.95, and the mesh that comes out
// of here is 4.96 x 2.50, because the bumpers hang off each end and the wheels
// stand proud of the bodyside. So contact was being resolved on a box a quarter
// narrower and up to 0.86m shorter than the thing on screen — two cars could
// overlap by a wheel and half a bumper with the solver seeing daylight between
// them, which is exactly "they pass right through you".
//
// Measured once, from the geometry, so a new body style cannot get this wrong.
// Trimmed a little because the extremes are a round tyre wall and a bumper
// corner, not a flat slab, and racing wheel-to-wheel has to stay possible.
function measureHull(g) {
  g.updateMatrixWorld(true);
  const b = new THREE.Box3();
  b.makeEmpty();
  const tmp = new THREE.Box3();
  g.traverse((o) => {
    if (!o.geometry || o.userData.noHull) return;
    o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    b.union(tmp);
  });
  return {
    halfLen: Math.max(-b.min.z, b.max.z) * 0.97,
    halfWide: Math.max(-b.min.x, b.max.x) * 0.95,
    high: Math.max(b.max.y, 0.9),
  };
}

// ---------------------------------------------------------------------------
// Wheels turn and steer; brake lights come on. Cheap per-frame dressing that
// makes the low-poly boxes read as a car.
// ---------------------------------------------------------------------------
export function animateCarMesh(mesh, dt, speed, steer, braking) {
  const wheels = mesh.userData.wheels;
  if (!wheels) return;
  const spin = (speed / 0.45) * dt;
  for (const w of wheels) {
    if (w.parent !== mesh) continue;   // this one is lying on the track somewhere
    const p = w.userData.part;
    p.spin = (p.spin + spin) % (Math.PI * 2);
    // A wheel hanging off its stub axle is being posed by updateDanglers; do not
    // stamp a clean spin over the top of it.
    if (p.dangling > 0) continue;
    w.rotation.set(p.spin, p.steer ? steer * 0.42 : 0, 0);
  }
  // The band is red all the time — it is the car's tail, not a warning lamp —
  // and goes white-hot under braking.
  const bl = mesh.userData.mats && mesh.userData.mats.brakeMat;
  if (bl) bl.color.setHex(braking ? 0xff6a4a : 0xd8241c);
}

// A quick colour scheme for a rival, deterministic per index.
export function liveryFor(i, palette) {
  const p = palette[i % palette.length];
  return { body: p.body, trim: p.trim, name: p.name };
}

export function randomStyle() {
  return pick(STYLE_IDS);
}

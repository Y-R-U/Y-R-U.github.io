// Bedrock geometry <-> Three.js. Shared by the Model editor, the Animator and the Test World.
//
// COORDINATES: Bedrock entity model space is LEFT-handed — +X east, +Y up, +Z **north** — while
// Three.js (like the Minecraft world) has north at -Z. So model -> scene negates Z:
//     x_three = x_model,  y_three = y_model,  z_three = -z_model,  1 unit = 1/16 block
// and a bone's rotation [rx,ry,rz] (degrees, applied X then Y then Z) becomes
//     three rotation = (-rx, -ry, +rz) with Euler order 'ZYX'
// which is the well-known "Bedrock inverts rotation X and Y" rule, and falls straight out of the
// Z mirror. Get this wrong and every mob walks backwards. See ANIM_AXIS in anim.js for the
// separate (180°-rotated) animation space.
//
// BOX UV: the classic unwrap, in pixels from the top-left of the texture:
//        [ up ][down]              (row height = depth)
//   [east][north][west][south]     (row height = height)
// Up and down are rotated 180° relative to the side faces. Get this wrong and every hat is
// on backwards, which is why it lives in exactly one function: faceRects().

import * as THREE from 'three';

export const UNIT = 1 / 16;

// ---------------------------------------------------------------- parsing ---

/** Read any .geo.json (1.12 array form or the old 1.8 object form) -> array of models. */
export function parseGeoFile(json) {
  if (!json || typeof json !== 'object') return [];
  const out = [];
  if (Array.isArray(json['minecraft:geometry'])) {
    for (const g of json['minecraft:geometry']) out.push(normalise(g.description || {}, g.bones || []));
  } else {
    for (const [k, v] of Object.entries(json)) {
      if (k === 'format_version' || !v || typeof v !== 'object') continue;
      if (!Array.isArray(v.bones)) continue;
      out.push(normalise({
        identifier: k.split(':')[0],
        texture_width: v.texturewidth || v.texture_width || 64,
        texture_height: v.textureheight || v.texture_height || 64,
        visible_bounds_width: v.visible_bounds_width,
        visible_bounds_height: v.visible_bounds_height,
        visible_bounds_offset: v.visible_bounds_offset
      }, v.bones));
    }
  }
  return out;
}

function normalise(desc, bones) {
  return {
    identifier: desc.identifier || 'geometry.unknown',
    tw: desc.texture_width || 64,
    th: desc.texture_height || 64,
    vbw: desc.visible_bounds_width ?? 2,
    vbh: desc.visible_bounds_height ?? 2,
    vbo: desc.visible_bounds_offset ? [...desc.visible_bounds_offset] : [0, 1, 0],
    bones: bones.map(b => ({
      name: b.name || 'bone',
      parent: b.parent || null,
      pivot: b.pivot ? [...b.pivot] : [0, 0, 0],
      rotation: b.rotation ? [...b.rotation] : [0, 0, 0],
      mirror: !!b.mirror,
      locators: b.locators || undefined,
      cubes: (b.cubes || []).map(c => ({
        origin: c.origin ? [...c.origin] : [0, 0, 0],
        size: c.size ? [...c.size] : [1, 1, 1],
        uv: c.uv === undefined ? [0, 0] : (Array.isArray(c.uv) ? [...c.uv] : JSON.parse(JSON.stringify(c.uv))),
        inflate: c.inflate || 0,
        mirror: c.mirror === undefined ? undefined : !!c.mirror,
        rotation: c.rotation ? [...c.rotation] : undefined,
        pivot: c.pivot ? [...c.pivot] : undefined
      }))
    }))
  };
}

/** Serialise back to a 1.12.0 .geo.json file. */
export function geoToJSON(geo, formatVersion = '1.12.0') {
  return {
    format_version: formatVersion,
    'minecraft:geometry': [{
      description: {
        identifier: geo.identifier,
        texture_width: geo.tw,
        texture_height: geo.th,
        visible_bounds_width: geo.vbw,
        visible_bounds_height: geo.vbh,
        visible_bounds_offset: geo.vbo
      },
      bones: geo.bones.map(b => {
        const o = { name: b.name };
        if (b.parent) o.parent = b.parent;
        o.pivot = b.pivot.map(r2);
        if (b.rotation && b.rotation.some(v => v)) o.rotation = b.rotation.map(r2);
        if (b.mirror) o.mirror = true;
        if (b.locators) o.locators = b.locators;
        if (b.cubes.length) o.cubes = b.cubes.map(c => {
          const cc = { origin: c.origin.map(r2), size: c.size.map(r2), uv: Array.isArray(c.uv) ? c.uv.map(r2) : c.uv };
          if (c.inflate) cc.inflate = r2(c.inflate);
          if (c.mirror) cc.mirror = true;
          if (c.rotation && c.rotation.some(v => v)) { cc.rotation = c.rotation.map(r2); cc.pivot = (c.pivot || cubeCentre(c)).map(r2); }
          return cc;
        });
        return o;
      })
    }]
  };
}
const r2 = v => Math.round(v * 1000) / 1000;
export function cubeCentre(c) { return [c.origin[0] + c.size[0] / 2, c.origin[1] + c.size[1] / 2, c.origin[2] + c.size[2] / 2]; }

export function newGeo(identifier, tw = 64, th = 64) {
  return { identifier, tw, th, vbw: 2, vbh: 2, vbo: [0, 1, 0], bones: [] };
}
export function newBone(name, pivot = [0, 0, 0], parent = null) {
  return { name, parent, pivot: [...pivot], rotation: [0, 0, 0], mirror: false, cubes: [] };
}
export function newCube(origin = [-4, 0, -4], size = [8, 8, 8], uv = [0, 0]) {
  return { origin: [...origin], size: [...size], uv: [...uv], inflate: 0 };
}

// --------------------------------------------------------------------- UV ---

/**
 * Pixel rects for the six faces of a cube, keyed by Three.js BoxGeometry material index:
 * 0:+X(east) 1:-X(west) 2:+Y(up) 3:-Y(down) 4:+Z(south) 5:-Z(north)
 * Each entry: {x0,y0,x1,y1} in texture pixels, already accounting for the 180° flip on up/down.
 */
export function faceRects(cube) {
  const [w, h, d] = cube.size.map(v => Math.abs(v));
  if (!Array.isArray(cube.uv)) return perFaceRects(cube);
  const [u, v] = cube.uv;
  const mir = !!cube.mirror;
  const east = { x0: u, y0: v + d, x1: u + d, y1: v + d + h };
  const north = { x0: u + d, y0: v + d, x1: u + d + w, y1: v + d + h };
  const west = { x0: u + d + w, y0: v + d, x1: u + d + w + d, y1: v + d + h };
  const south = { x0: u + d + w + d, y0: v + d, x1: u + d + w + d + w, y1: v + d + h };
  // up/down are rotated 180°: express that by giving x1<x0 and y1<y0
  const up = { x0: u + d + w, y0: v + d, x1: u + d, y1: v };
  const down = { x0: u + d + w + w, y0: v + d, x1: u + d + w, y1: v };
  const r = [east, west, up, down, south, north];
  if (mir) {
    // mirrored cubes swap the two side faces and read every face backwards
    const t = r[0]; r[0] = r[1]; r[1] = t;
    for (const f of r) { const x = f.x0; f.x0 = f.x1; f.x1 = x; }
  }
  return r;
}

/** A cube with its bone's mirror flag folded in. The cube's own flag wins when it has one. */
export function withBoneMirror(bone, cube) {
  return (cube.mirror === undefined && bone && bone.mirror) ? { ...cube, mirror: true } : cube;
}

const FACE_KEY = ['east', 'west', 'up', 'down', 'south', 'north'];
function perFaceRects(cube) {
  return FACE_KEY.map(k => {
    const f = cube.uv && cube.uv[k];
    if (!f || !f.uv) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const [x, y] = f.uv;
    const [sw, sh] = f.uv_size || [1, 1];
    return { x0: x, y0: y, x1: x + sw, y1: y + sh };
  });
}

/** Write UVs for a BoxGeometry from a cube's box-UV. */
export function applyCubeUV(bufferGeo, cube, tw, th) {
  const rects = faceRects(cube);
  const uv = bufferGeo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = rects[f];
    const u0 = r.x0 / tw, u1 = r.x1 / tw;
    const v0 = 1 - r.y0 / th, v1 = 1 - r.y1 / th;
    // Three's per-face vertex order is TL, TR, BL, BR in the face's own frame.
    uv.setXY(f * 4 + 0, u0, v0);
    uv.setXY(f * 4 + 1, u1, v0);
    uv.setXY(f * 4 + 2, u0, v1);
    uv.setXY(f * 4 + 3, u1, v1);
  }
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------ build ---

export function makeTexture(image) {
  const t = new THREE.Texture(image);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function makeMaterial(texture, opts = {}) {
  return new THREE.MeshLambertMaterial({
    map: texture || null,
    color: texture ? 0xffffff : (opts.color ?? 0xbfc4cf),
    transparent: true,
    alphaTest: opts.alphaTest ?? 0.02,
    side: opts.side ?? THREE.DoubleSide
  });
}

/**
 * Build a Three.js object tree from a parsed geometry.
 * @returns {{root:THREE.Group, bones:Map<string,THREE.Group>, meshes:THREE.Mesh[],
 *            base:Map<string,{pos:THREE.Vector3,rot:THREE.Euler,scale:THREE.Vector3}>, geo:Object}}
 */
export function buildGeo(geo, material, opts = {}) {
  const root = new THREE.Group();
  root.name = geo.identifier;
  const bones = new Map();
  const meshes = [];
  const base = new Map();
  const byName = new Map(geo.bones.map(b => [b.name, b]));

  // create groups first so parents exist in any file order
  for (const b of geo.bones) {
    const g = new THREE.Group();
    g.name = b.name;
    g.userData.bone = b;
    bones.set(b.name, g);
  }
  for (const b of geo.bones) {
    const g = bones.get(b.name);
    const parent = b.parent && bones.get(b.parent);
    const pp = b.parent && byName.get(b.parent) ? byName.get(b.parent).pivot : [0, 0, 0];
    g.position.set((b.pivot[0] - pp[0]) * UNIT, (b.pivot[1] - pp[1]) * UNIT, -(b.pivot[2] - pp[2]) * UNIT);
    setBoneRotation(g, b.rotation);
    (parent || root).add(g);
    base.set(b.name, { pos: g.position.clone(), rot: g.rotation.clone(), scale: g.scale.clone() });

    b.cubes.forEach((c, ci) => {
      // A cube with no "mirror" of its own inherits the bone's — Blockbench writes it that way,
      // and reading the UV off cube.mirror alone puts the left leg's texture on backwards.
      const mesh = cubeMesh(withBoneMirror(b, c), geo, material);
      mesh.userData = { bone: b.name, cubeIndex: ci, cube: c };
      const centre = cubeCentre(c);
      if (c.rotation && c.rotation.some(v => v)) {
        const piv = c.pivot || centre;
        const holder = new THREE.Group();
        holder.position.set((piv[0] - b.pivot[0]) * UNIT, (piv[1] - b.pivot[1]) * UNIT, -(piv[2] - b.pivot[2]) * UNIT);
        setBoneRotation(holder, c.rotation);
        mesh.position.set((centre[0] - piv[0]) * UNIT, (centre[1] - piv[1]) * UNIT, -(centre[2] - piv[2]) * UNIT);
        holder.add(mesh);
        g.add(holder);
        mesh.userData.holder = holder;
      } else {
        mesh.position.set((centre[0] - b.pivot[0]) * UNIT, (centre[1] - b.pivot[1]) * UNIT, -(centre[2] - b.pivot[2]) * UNIT);
        g.add(mesh);
      }
      meshes.push(mesh);
    });
  }
  if (opts.scale) root.scale.setScalar(opts.scale);
  return { root, bones, meshes, base, geo };
}

/** Bedrock bone rotations are degrees, applied Z then Y then X. */
export function setBoneRotation(obj, rot) {
  const [x, y, z] = rot || [0, 0, 0];
  obj.rotation.order = 'ZYX';
  obj.rotation.set(-x * Math.PI / 180, -y * Math.PI / 180, z * Math.PI / 180);
}

export function cubeMesh(cube, geo, material) {
  const inf = cube.inflate || 0;
  const w = Math.max(0.0001, Math.abs(cube.size[0]) + inf * 2);
  const h = Math.max(0.0001, Math.abs(cube.size[1]) + inf * 2);
  const d = Math.max(0.0001, Math.abs(cube.size[2]) + inf * 2);
  const bg = new THREE.BoxGeometry(w * UNIT, h * UNIT, d * UNIT);
  applyCubeUV(bg, cube, geo.tw, geo.th);
  const m = new THREE.Mesh(bg, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function disposeBuilt(built) {
  if (!built) return;
  built.meshes.forEach(m => m.geometry.dispose());
  built.root.parent && built.root.parent.remove(built.root);
}

/** Reset every bone to its rest pose (used before applying an animation frame). */
export function resetPose(built) {
  for (const [name, g] of built.bones) {
    const b = built.base.get(name);
    if (!b) continue;
    g.position.copy(b.pos);
    g.rotation.copy(b.rot);
    g.scale.copy(b.scale);
  }
}

/** Bounding box of the built model, in world units. */
export function measure(built) {
  const box = new THREE.Box3().setFromObject(built.root);
  const size = new THREE.Vector3(); box.getSize(size);
  const centre = new THREE.Vector3(); box.getCenter(centre);
  return { box, size, centre };
}

// Every hotspot in the level, drawn on the ground in the running world: colour-coded by the first
// verb it runs, labelled, red when something about it is broken. It outlives the dev hub — the
// game can turn it on through window.__wf.hotspots — so nothing here assumes an overlay is open.

import * as THREE from 'three';
import { centreOf, handlesOf, shapeAt, colourOf, radiusOf } from './hotspot.js';

const LIFT = 0.18;
const RING_SEGMENTS = 72;
const RECT_STEPS = 10;
const labelCache = new Map();

export class HotspotOverlay {
  constructor(app, world, { characterAt = () => null } = {}) {
    this.app = app;
    this.world = world;
    this.at = characterAt;
    this.root = new THREE.Group();
    this.root.name = 'wf-hotspot-overlay';
    this.items = [];
    this.draft = null;
    this.list = [];
    this.selected = new Set();
    this.problems = new Map();
    this.labels = true;
    app.scene.add(this.root);
    this.sys = { update: () => this.tick() };
    app.systems.push(this.sys);
  }

  groundY(x, z) {
    const t = this.world?.terrain;
    try { return (t?.surfaceY ? t.surfaceY(x, z) : 0) + LIFT; } catch { return LIFT; }
  }

  get visible() { return this.root.visible; }

  show(on = true) { this.root.visible = !!on; return this.root.visible; }
  toggle() { return this.show(!this.root.visible); }

  set(list, { selected, problems } = {}) {
    this.list = Array.isArray(list) ? list : [];
    if (selected) this.selected = selected instanceof Set ? selected : new Set(selected);
    if (problems) this.problems = problems;
    this.rebuild();
  }

  select(ids) {
    this.selected = ids instanceof Set ? ids : new Set(ids || []);
    this.rebuild();
  }

  // The shape being dragged out before it is a hotspot at all.
  setDraft(shape, colour = 0xffffff) {
    if (this.draftNode) { this.root.remove(this.draftNode); disposeTree(this.draftNode); this.draftNode = null; }
    this.draft = shape;
    if (!shape) return;
    this.draftNode = this.shapeNode(shape, colour, true);
    this.root.add(this.draftNode);
  }

  // One hotspot's geometry, without touching its label texture — this is what a handle drag calls
  // sixty times a second.
  reshape(id, shape) {
    const it = this.items.find(i => i.id === id);
    if (!it) return this.rebuild();
    this.root.remove(it.node);
    disposeTree(it.node);
    it.shape = shape;
    it.node = this.itemNode(it);
    this.root.add(it.node);
  }

  rebuild() {
    for (const it of this.items) { this.root.remove(it.node); disposeTree(it.node); }
    this.items = [];
    for (const h of this.list) {
      if (!h?.id) continue;
      const problems = this.problems.get(h.id) || [];
      const it = {
        id: h.id, h, problems,
        colour: colourOf(h, problems),
        on: this.selected.has(h.id),
        shape: h.attach ? null : h.shape,
      };
      it.node = this.itemNode(it);
      this.items.push(it);
      this.root.add(it.node);
    }
  }

  itemNode(it) {
    const g = new THREE.Group();
    const shape = it.shape || shapeAt(it.h, this.at) || { k: 'circle', x: 0, z: 0, r: it.h.r || 2.5 };
    // An attached ring rides the character, so it is built flat around the origin and moved each
    // frame; a placed one is built in world space and hugs the ground it was drawn on.
    g.add(this.shapeNode(shape, it.colour, it.on, !!it.h.attach));
    if (it.on) g.add(...this.handleNodes(shape, !!it.h.attach));
    const label = this.labelNode(it, shape);
    if (label) g.add(label);
    if (it.h.attach) {
      g.userData.follow = it.h.attach;
      g.userData.flat = true;
    }
    return g;
  }

  shapeNode(shape, colour, bright = false, flat = false) {
    const g = new THREE.Group();
    const pts = outline(shape, flat);
    const y = p => (flat ? LIFT : this.groundY(p[0], p[1]));

    const line = new Float32Array(pts.length * 3 + 3);
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      line[i * 3] = p[0]; line[i * 3 + 1] = y(p); line[i * 3 + 2] = p[1];
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(line, 3));
    g.add(mark(new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: colour, depthTest: false, toneMapped: false, fog: false,
      transparent: true, opacity: bright ? 1 : 0.85,
    }))));

    const c = centreOf(shape);
    const fan = new Float32Array((pts.length + 2) * 3);
    fan[0] = c.x; fan[1] = flat ? LIFT - 0.02 : this.groundY(c.x, c.z) - 0.02; fan[2] = c.z;
    for (let i = 0; i <= pts.length; i++) {
      const p = pts[i % pts.length];
      fan[(i + 1) * 3] = p[0]; fan[(i + 1) * 3 + 1] = y(p) - 0.02; fan[(i + 1) * 3 + 2] = p[1];
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fan, 3));
    g.add(mark(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: bright ? 0.26 : 0.11,
      depthTest: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    }))));

    if (bright) {
      const base = flat ? LIFT : this.groundY(c.x, c.z);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(
        [c.x, base, c.z, c.x, base + Math.max(2.5, radiusOf(shape) * 0.8), c.z]), 3));
      g.add(mark(new THREE.Line(pg, new THREE.LineBasicMaterial({
        color: colour, depthTest: false, toneMapped: false, fog: false }))));
    }
    return g;
  }

  handleNodes(shape, flat) {
    const geo = new THREE.OctahedronGeometry(0.45);
    return handlesOf(shape).map(h => {
      const m = mark(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: h.kind === 'move' ? 0xffffff : 0xffd48a, depthTest: false, toneMapped: false, fog: false })));
      m.position.set(h.x, (flat ? LIFT : this.groundY(h.x, h.z)) + 0.35, h.z);
      return m;
    });
  }

  labelNode(it, shape) {
    if (!this.labels) return null;
    const text = `${it.h.name || it.id}${it.problems.length ? '  ⚠' : ''}`;
    const sprite = labelSprite(text, it.problems.length ? '#ff8a8a' : '#ffffff');
    if (!sprite) return null;
    const c = centreOf(shape);
    const lift = it.h.attach ? 3.2 : Math.max(2.4, radiusOf(shape) * 0.8 + 1);
    sprite.position.set(c.x, (it.h.attach ? LIFT : this.groundY(c.x, c.z)) + lift, c.z);
    return sprite;
  }

  tick() {
    if (!this.root.visible) return;
    for (const it of this.items) {
      const who = it.node.userData.follow;
      if (!who) continue;
      const p = this.at(who);
      it.node.visible = !!p;
      if (p) it.node.position.set(p.x, this.groundY(p.x, p.z) - LIFT, p.z);
    }
  }

  dispose() {
    const i = this.app.systems.indexOf(this.sys);
    if (i >= 0) this.app.systems.splice(i, 1);
    this.setDraft(null);
    for (const it of this.items) disposeTree(it.node);
    this.items = [];
    this.app.scene.remove(this.root);
  }
}

function outline(shape, flat) {
  const pts = [];
  if (!shape) return pts;
  if (shape.k === 'circle') {
    const cx = flat ? 0 : shape.x, cz = flat ? 0 : shape.z;
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * shape.r, cz + Math.sin(a) * shape.r]);
    }
    return pts;
  }
  const corners = [[shape.x0, shape.z0], [shape.x1, shape.z0], [shape.x1, shape.z1], [shape.x0, shape.z1]];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    for (let s = 0; s < RECT_STEPS; s++) {
      const t = s / RECT_STEPS;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return pts;
}

// depthTest is off so a hotspot behind a wall is still findable; renderOrder keeps the overlay
// above the world's own transparent passes.
function mark(o) { o.renderOrder = 30; o.frustumCulled = false; return o; }

function labelSprite(text, colour) {
  if (typeof document === 'undefined') return null;
  const key = `${colour}|${text}`;
  let tex = labelCache.get(key);
  if (!tex) {
    const pad = 24, size = 52;
    const font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    g.font = font;
    // Setting width resets the context, so the font goes on again after the measure.
    c.width = Math.min(1024, Math.ceil(g.measureText(text).width) + pad * 2);
    c.height = size + pad * 2;
    g.font = font;
    g.fillStyle = 'rgba(9,12,18,0.82)';
    roundRect(g, 0, 0, c.width, c.height, 14);
    g.fillStyle = colour;
    g.textBaseline = 'middle';
    g.fillText(text, pad, c.height / 2);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, toneMapped: false, fog: false, transparent: true }));
  s.scale.set(tex.image.width / 42, tex.image.height / 42, 1);
  s.renderOrder = 31;
  s.frustumCulled = false;
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.fill();
}

function disposeTree(node) {
  node.traverse(o => {
    o.geometry?.dispose?.();
    // The label textures are shared and cached by string; only the per-sprite material goes.
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.());
  });
}

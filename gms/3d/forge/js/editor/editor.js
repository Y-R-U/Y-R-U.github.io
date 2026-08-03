// Editor controller: what is selected, what a tap means, and every mutation of the document.
// The sheet in ui.js is a view onto this and owns no state of its own.

import * as THREE from 'three';
import { footprint, tall, typeBox, makeObject, districtFor, newSeed } from './scene.js';
import { dispose } from './build.js';
import { saveScene, clearScene, saveSlot, storageHealthy, storageError } from './store.js';
import { buildSheet } from './ui.js';
import { refreshPanel } from './panel.js';
import { invalidateShadow } from '../world/lighting.js';

const UNDO_DEPTH = 24;
const MERGE_MS = 900;
// A press is a tap until the finger has travelled this far — there is deliberately no time
// limit, because a slow careful thumb tap is still a tap. A mouse is steady and gets far less.
const MOUSE_SLOP = 4;

export function buildEditor(app, demo, controls) {
  return new Editor(app, demo, controls);
}

class Editor {
  constructor(app, demo, controls) {
    this.app = app;
    this.demo = demo;
    this.controls = controls;
    this.builder = demo.builder;
    this.doc = demo.doc;
    this.on = false;
    this.selected = null;
    this.live = null;
    this.armed = null;
    this.press = null;
    this.undoStack = [];
    this.redoStack = [];
    this.saveOk = true;
    this.notice = null;
    this.question = null;
    this.brush = { type: 'house', zone: 'neutral' };
    this.ray = new THREE.Raycaster();

    this.gizmo = outline(0xffb455);
    this.ghost = outline(0x7fd6a0);
    app.scene.add(this.gizmo, this.ghost);

    app.quality.register({
      key: 'tapSlop', label: 'Tap slop', group: 'Editor',
      type: 'range', min: 6, max: 44, step: 1, default: 18,
    }, v => { this.slop = v; });
    refreshPanel();

    this.ui = buildSheet(this);
    this.bindPointer();
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    window.__forge.editor = this;
    this.reportLoad(demo.loadReport);
  }

  toggle(on = !this.on) {
    this.on = on;
    document.body.classList.toggle('editing', on);
    // the player owns the same canvas gestures the editor needs
    const player = window.__forge.player;
    if (player) {
      if (on) this.playerWas = player.enabled;
      player.enabled = on ? false : (this.playerWas ?? player.enabled);
    }
    this.abortPress();
    if (!on) { this.deselect(); this.armed = null; this.question = null; this.hideGhost(); }
    this.armNotice();
    this.syncGizmo();
    this.ui.sync();
  }

  aoOpacity() { return this.app.quality.get('groundAO') ?? 1; }
  stats() { return this.app.stats.read(); }

  reportLoad(r) {
    if (!r) return;
    if (!r.doc) return this.flash(`Saved scene not loaded — ${r.error}. Showing the demo.`);
    const bits = [];
    if (r.dropped) bits.push(`${r.dropped} object${r.dropped > 1 ? 's' : ''} dropped`);
    bits.push(...r.warnings);
    if (bits.length) this.flash(`Loaded with changes: ${bits.join('; ')}`);
  }

  flash(text) {
    this.notice = text;
    this.armNotice();
    this.ui.sync();
  }

  // The sheet is the only place a notice is visible, so a notice raised while it is shut — the
  // load report, mostly — waits instead of expiring unseen.
  armNotice() {
    clearTimeout(this.noticeTimer);
    if (!this.notice || !this.on) return;
    this.noticeTimer = setTimeout(() => { this.notice = null; this.ui.sync(); }, 8000);
  }

  ask(text, onYes, yes = 'Yes') { this.question = { text, onYes, yes }; this.ui.sync(); }

  answer(yes) {
    const q = this.question;
    this.question = null;
    this.ui.sync();
    if (yes && q) q.onYes();
  }

  select(o) {
    if (o && this.selected && o.id === this.selected.id) return;
    this.dropLive();
    this.selected = o || null;
    if (o) {
      this.builder.held = o.id;
      this.builder.district(o.dist);
      this.attachLive();
    }
    this.builder.refreshDecals(this.aoOpacity());
    this.armed = null;
    this.mergeKey = null;
    this.syncGizmo();
    this.ui.sync();
  }

  deselect() {
    if (!this.selected) return;
    this.dropLive();
    this.builder.refreshDecals(this.aoOpacity());
    this.mergeKey = null;
    this.syncGizmo();
    this.ui.sync();
  }

  dropLive() {
    if (this.live) { this.app.scene.remove(this.live); dispose(this.live); this.live = null; }
    if (!this.selected) return;
    const di = this.selected.dist;
    this.builder.held = 0;
    this.selected = null;
    this.builder.district(di);
  }

  attachLive() {
    this.live = this.builder.liveObject(this.selected);
    this.app.scene.add(this.live);
    this.placeLive();
  }

  placeLive() {
    const o = this.selected;
    if (!o || !this.live) return;
    this.live.position.set(o.x, this.builder.seat(o).hi, o.z);
    this.live.rotation.y = o.ry;
  }

  refreshLive() {
    if (!this.selected) return;
    if (this.live) { this.app.scene.remove(this.live); dispose(this.live); }
    this.attachLive();
    this.syncGizmo();
  }

  syncGizmo() {
    const o = this.selected;
    this.gizmo.visible = !!o && !!this.on;
    if (!o) return;
    const [hw, hd] = footprint(o);
    const r = this.builder.seat(o);
    const h = tall(o) + (r.hi - r.lo);
    this.gizmo.position.set(o.x, r.lo - 0.25 + h / 2, o.z);
    this.gizmo.rotation.y = o.ry;
    this.gizmo.scale.set(hw * 2, h, hd * 2);
  }

  showGhost(e) {
    const p = this.groundPoint(e);
    this.ghost.visible = !!p;
    if (!p) return;
    const [w, h, d] = typeBox(this.brush.type);
    this.ghost.position.set(p.x, p.y + h / 2, p.z);
    this.ghost.rotation.y = 0;
    this.ghost.scale.set(w, h, d);
  }

  hideGhost() { this.ghost.visible = false; }

  // Anything downstream that caches off the document — colliders, door hotspots — watches this.
  // Object count is not enough: a move or a rotate leaves it identical.
  bump() { this.doc.rev = (this.doc.rev | 0) + 1; invalidateShadow(); }

  // Snapshot before the change. `key` merges a run of the same gesture — a drag, or a slider
  // being swept — into one undo entry instead of sixty.
  mutate(key = null) {
    this.bump();
    const now = performance.now();
    if (!key || key !== this.mergeKey || now - this.mergeAt > MERGE_MS) {
      this.undoStack.push(JSON.parse(JSON.stringify(this.doc.objects)));
      if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.mergeKey = key;
    this.mergeAt = now;
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 250);
  }

  // Switching apps on a phone can end the page outright, and a debounced save is the one edit
  // that would not have landed.
  flush() { if (this.saveTimer) this.saveNow(); }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    const ok = saveScene(this.doc);
    // a failure raises the standing bar in the sheet rather than a notice, which would time out
    if (ok !== this.saveOk) { this.saveOk = ok; this.ui.sync(); }
    return ok;
  }

  undo() { this.history(this.undoStack, this.redoStack, 'undo'); }
  redo() { this.history(this.redoStack, this.undoStack, 'redo'); }

  history(from, to, what) {
    const objects = from.pop();
    if (!objects) return this.flash(`Nothing to ${what}`);
    this.bump();
    to.push(JSON.parse(JSON.stringify(this.doc.objects)));
    this.dropLive();
    this.doc.objects = objects;
    this.builder.buildAll(this.doc);
    this.builder.refreshDecals(this.aoOpacity());
    this.mergeKey = null;
    this.saveNow();
    this.syncGizmo();
    this.ui.sync();
  }

  placeAt(x, z) {
    this.mutate();
    const o = makeObject(this.doc, { type: this.brush.type, zone: this.brush.zone, x, z });
    this.doc.objects.push(o);
    this.select(o);
    this.saveNow();
  }

  // Position and rotation only change the object's own transform, so the batch it was lifted
  // out of does not need rebuilding until it lands.
  moveTo(x, z) {
    const o = this.selected;
    if (!o) return;
    this.mutate(`move${o.id}`);
    o.x = x; o.z = z;
    this.placeLive();
    this.syncGizmo();
    this.saveSoon();
  }

  rotateTo(ry) {
    const o = this.selected;
    if (!o) return;
    this.mutate(`spin${o.id}`);
    o.ry = ry;
    this.placeLive();
    this.syncGizmo();
    this.saveSoon();
    this.soon(false);
  }

  setParam(key, value) {
    const o = this.selected;
    if (!o) return;
    this.mutate(`p${o.id}.${key}`);
    o.p[key] = value;
    this.saveSoon();
    this.soon(true);
  }

  // Rebuilding the live copy costs a few ms and its contact collar about one; a slider sweep
  // asks for both sixty times a second, so they collapse to one pass per frame.
  soon(live) {
    this.wantLive = this.wantLive || live;
    if (this.pendingLive) return;
    this.pendingLive = requestAnimationFrame(() => {
      this.pendingLive = 0;
      if (this.wantLive) { this.wantLive = false; this.refreshLive(); }
      this.builder.refreshDecals(this.aoOpacity());
    });
  }

  setZone(zoneId) {
    const o = this.selected;
    if (!o) return;
    this.mutate();
    o.zone = zoneId;
    this.refreshLive();
    this.saveNow();
  }

  setRubble(on) {
    const o = this.selected;
    if (!o) return;
    this.mutate();
    if (on) { o.rubble = true; o.rubbleSeed = o.rubbleSeed || newSeed(); } else delete o.rubble;
    this.builder.district(o.dist);
    this.saveNow();
    this.ui.sync();
  }

  // Settle a drag: the object may have crossed into another district's batch.
  commit() {
    const o = this.selected;
    if (!o) return;
    const di = districtFor(this.doc, o.x);
    if (di !== o.dist) {
      const from = o.dist;
      o.dist = di;
      this.builder.district(from);
      this.builder.district(di);
      this.refreshLive();
    }
    this.builder.refreshDecals(this.aoOpacity());
    this.mergeKey = null;
    this.saveNow();
    this.ui.sync();
  }

  revert(from) {
    const o = this.selected;
    if (!o || !from) return;
    this.bump();
    o.x = from.x; o.z = from.z; o.dist = from.dist;
    this.placeLive();
    this.syncGizmo();
    this.builder.refreshDecals(this.aoOpacity());
    this.mergeKey = null;
    this.saveNow();
  }

  remove() {
    const o = this.selected;
    if (!o) return;
    this.mutate();
    if (this.live) { this.app.scene.remove(this.live); dispose(this.live); this.live = null; }
    this.builder.held = 0;
    this.selected = null;
    this.doc.objects = this.doc.objects.filter(q => q.id !== o.id);
    this.builder.district(o.dist);
    this.builder.refreshDecals(this.aoOpacity());
    this.saveNow();
    this.syncGizmo();
    this.flash('Deleted. Undo is in the Scene tab.');
  }

  duplicate() {
    const o = this.selected;
    if (!o) return;
    this.mutate();
    const off = footprint(o)[1] * 2 + 2;
    const copy = makeObject(this.doc, {
      type: o.type, zone: o.zone, ry: o.ry, p: o.p,
      x: o.x + Math.sin(o.ry) * off, z: o.z + Math.cos(o.ry) * off,
    });
    if (o.fp) copy.fp = [...o.fp];
    if (o.rubble) { copy.rubble = true; copy.rubbleSeed = newSeed(); }
    this.doc.objects.push(copy);
    this.select(copy);
    this.saveNow();
  }

  storageOK() { return this.saveOk && storageHealthy(); }

  // Roads, the creek crossing and the foliage are baked into the terrain at boot, so swapping
  // the whole scene goes through a reload rather than pretending it can be done live.
  swapScene(doc, label = 'load', force = false) {
    if (!force && !saveSlot(`Before ${label}`, this.doc)) {
      return this.ask(`The backup copy of this scene could not be saved — ${storageError()}. Continue and lose it?`,
        () => this.swapScene(doc, label, true), 'Continue');
    }
    if (!saveScene(doc)) return this.flash(`Not loaded — ${storageError()}. This scene is untouched.`);
    location.reload();
  }

  resetToDemo(force = false) {
    if (!force && !saveSlot('Before reset', this.doc)) {
      return this.ask(`The backup copy of this scene could not be saved — ${storageError()}. Reset anyway and lose it?`,
        () => this.resetToDemo(true), 'Reset anyway');
    }
    clearScene();
    location.reload();
  }

  ndc(e) {
    const r = this.app.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  groundPoint(e) {
    this.ray.setFromCamera(this.ndc(e), this.app.camera);
    const hit = this.ray.intersectObject(this.demo.terrain.ground, false)[0];
    return hit ? hit.point : null;
  }

  pick(e) {
    this.ray.setFromCamera(this.ndc(e), this.app.camera);
    const ray = this.ray.ray;
    let best = null, bestT = Infinity;
    for (const o of this.doc.objects) {
      const t = hitBox(ray, o, this.builder);
      if (t !== null && t < bestT) { bestT = t; best = o; }
    }
    return best;
  }

  setOrbit(on) { if (this.controls) this.controls.enabled = on; }

  // A gesture that was interrupted — the editor closing, iOS taking the touch for its back
  // swipe — has usually already written to the object. Putting it back is the only outcome
  // that neither loses nor invents work.
  abortPress() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    this.hideGhost();
    this.setOrbit(true);
    if (!p.drag) return;
    this.revert(p.from);
    this.undoStack.length = Math.min(this.undoStack.length, p.undoAt);
  }

  bindPointer() {
    const el = this.app.renderer.domElement;
    // Only the pointer that started the gesture may move or finish it. Without this a second
    // thumb commits the first one's drag, and an armed placement lands under the wrong finger.
    const mine = e => this.press && e.pointerId === this.press.id;
    const grab = e => { try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } };

    el.addEventListener('pointerdown', e => {
      if (!this.on || this.press || e.button > 0 || !e.isPrimary) return;
      const p = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        slop: e.pointerType === 'mouse' ? MOUSE_SLOP : this.slop,
        hit: null, held: false, drag: false, place: false,
      };
      this.press = p;

      if (this.armed) {
        p.place = true;
        this.setOrbit(false);
        this.showGhost(e);
        grab(e);
        return;
      }

      p.hit = this.pick(e);
      // Pressing the selected object only *offers* a drag: a thumb resting on a building must
      // be able to tap it without nudging it, so nothing moves until the finger passes the slop.
      // The object then rides the ground point under the pointer — grabbing a spire silhouetted
      // against the sky gives no ground point, so it simply centres on the first one it gets.
      if (p.hit && this.selected && p.hit.id === this.selected.id) {
        const g = this.groundPoint(e);
        p.held = true;
        p.from = { x: this.selected.x, z: this.selected.z, dist: this.selected.dist };
        p.off = g ? { x: this.selected.x - g.x, z: this.selected.z - g.z } : { x: 0, z: 0 };
        this.setOrbit(false);
        grab(e);
      }
    });

    el.addEventListener('pointermove', e => {
      if (!mine(e)) return;
      const p = this.press;
      if (p.place) return this.showGhost(e);
      if (!p.held || !this.selected) return;
      if (!p.drag) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < p.slop) return;
        p.drag = true;
        p.undoAt = this.undoStack.length;
        this.builder.refreshDecals(this.aoOpacity(), this.selected.id);
      }
      const g = this.groundPoint(e);
      if (g) this.moveTo(g.x + p.off.x, g.z + p.off.z);
    });

    el.addEventListener('pointerup', e => {
      if (!mine(e)) return;
      const p = this.press;
      this.press = null;
      this.setOrbit(true);
      if (p.place) {
        this.hideGhost();
        const g = this.groundPoint(e);
        if (g) this.placeAt(g.x, g.z);
        else this.flash('Nothing to stand on there — aim at the ground.');
        return;
      }
      if (p.drag) return this.commit();
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= p.slop) return;
      if (p.hit) this.select(p.hit); else this.deselect();
    });

    el.addEventListener('pointercancel', e => { if (mine(e)) this.abortPress(); });

    addEventListener('keydown', e => {
      if (!this.on || (e.target instanceof Element && e.target.matches('input, select, textarea'))) return;
      if (e.key === 'Escape') {
        if (this.question) this.answer(false);
        else if (this.armed) { this.armed = null; this.hideGhost(); this.ui.sync(); }
        else this.deselect();
      }
      if (e.key === 'Backspace' || e.key === 'Delete') this.remove();
      if (e.key.toLowerCase() === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      if (e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.duplicate(); }
    });
  }
}

function outline(color) {
  const m = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color, depthTest: false, toneMapped: false, fog: false }),
  );
  m.renderOrder = 9;
  m.visible = false;
  return m;
}

// Ray against the object's oriented footprint box. Cheap, exact enough for a tap, and it keeps
// the pickable world out of the merged geometry entirely.
function hitBox(ray, o, builder) {
  const [hw, hd] = footprint(o);
  const c = Math.cos(o.ry), s = Math.sin(o.ry);
  const px = ray.origin.x - o.x, pz = ray.origin.z - o.z;
  const ox = c * px - s * pz, oz = s * px + c * pz;
  const dx = c * ray.direction.x - s * ray.direction.z;
  const dz = s * ray.direction.x + c * ray.direction.z;
  const r = builder.seat(o);

  let t0 = 0, t1 = Infinity;
  const slab = (orig, dir, lo, hi) => {
    if (Math.abs(dir) < 1e-8) return orig >= lo && orig <= hi;
    const a = (lo - orig) / dir, b = (hi - orig) / dir;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    return t1 >= t0;
  };
  if (!slab(ox, dx, -hw, hw)) return null;
  if (!slab(oz, dz, -hd, hd)) return null;
  if (!slab(ray.origin.y, ray.direction.y, r.lo - 0.5, r.hi + tall(o))) return null;
  return t0 > 0 ? t0 : t1;
}

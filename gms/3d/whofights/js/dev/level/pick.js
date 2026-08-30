// Going out into the world and coming back with a number. The hub is put aside, the loop is
// restarted so the camera still orbits, and a slim bar says what the click will do.
//
// Ground picking reuses the world editor's own raycast (js/editor/editor.js groundPoint) so the
// point a hotspot lands on is the point a building would land on; without an editor — the dev
// selftest page has no engine — it falls back to the y = 0 plane.

import * as THREE from 'three';
import { circleFrom, rectFrom, pickHandle, dragHandle } from './hotspot.js';

const MOUSE_SLOP = 4;
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

let live = null;

export const busy = () => !!live;

export function cancelWorld() { live?.finish(null); }

// modes: 'point' (one tap, optionally a second for a facing), 'draw' (drag out a shape),
// 'edit' (drag the selected shape's handles, tap another hotspot to select it).
export function worldSession(ctx, opts = {}) {
  live?.finish(null);
  return new Promise(resolve => { live = new Session(ctx, opts, resolve); live.start(); });
}

class Session {
  constructor(ctx, opts, resolve) {
    this.ctx = ctx;
    this.o = opts;
    this.resolve = resolve;
    this.app = ctx.app;
    this.ed = window.__wf?.editor || null;
    this.canvas = this.app?.renderer?.domElement || null;
    this.press = null;
    this.points = [];
  }

  start() {
    document.getElementById('wf-dev')?.classList.add('lv-away');
    document.body.classList.add('wf-lv-picking');
    this.player = window.__wf?.player || null;
    if (this.player) { this.playerWas = this.player.enabled; this.player.enabled = false; }
    if (this.app && !this.app.raf) { this.resumed = true; this.app.start?.(); }
    this.bar = buildBar(this);
    this.bind();
    this.say(this.o.hint || 'Click the ground.');
  }

  say(text, sub = '') {
    this.bar.querySelector('[data-role=hint]').textContent = text;
    this.bar.querySelector('[data-role=sub]').textContent = sub;
  }

  finish(result) {
    if (this.done) return;
    this.done = true;
    live = null;
    this.unbind();
    this.bar?.remove();
    this.o.onDraft?.(null);
    document.getElementById('wf-dev')?.classList.remove('lv-away');
    document.body.classList.remove('wf-lv-picking');
    this.ed?.setOrbit(true);
    if (this.player) this.player.enabled = this.playerWas;
    if (this.resumed && this.app?.raf) { cancelAnimationFrame(this.app.raf); this.app.raf = null; }
    this.resolve(result);
  }

  ground(e) {
    if (this.ed) {
      const p = this.ed.groundPoint(e);
      if (p) return { x: p.x, z: p.z, y: p.y };
    }
    if (!this.canvas || !this.app?.camera) return null;
    const r = this.canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.app.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z, y: 0 } : null;
  }

  bind() {
    if (!this.canvas) return;
    this.onDown = e => this.down(e);
    this.onMove = e => this.move(e);
    this.onUp = e => this.up(e);
    this.onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.finish(null); }
      if (e.key === 'Enter') { e.preventDefault(); this.finish(this.o.mode === 'edit' ? true : null); }
    };
    this.canvas.addEventListener('pointerdown', this.onDown, true);
    addEventListener('pointermove', this.onMove, true);
    addEventListener('pointerup', this.onUp, true);
    addEventListener('keydown', this.onKey, true);
  }

  unbind() {
    if (!this.canvas) return;
    this.canvas.removeEventListener('pointerdown', this.onDown, true);
    removeEventListener('pointermove', this.onMove, true);
    removeEventListener('pointerup', this.onUp, true);
    removeEventListener('keydown', this.onKey, true);
  }

  down(e) {
    if (this.press || e.button > 0 || !e.isPrimary) return;
    const g = this.ground(e);
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, g, drag: false, handle: null };
    if (this.o.mode === 'draw' && g) { this.ed?.setOrbit(false); this.press.drawing = true; }
    if (this.o.mode === 'edit' && g) {
      const h = pickHandle(this.o.shape?.(), g.x, g.z, this.o.tol || 1.4);
      if (h) { this.press.handle = h.id; this.ed?.setOrbit(false); }
    }
  }

  move(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    const g = this.ground(e);
    if (!g) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOUSE_SLOP) p.drag = true;
    if (p.drawing && p.drag) this.o.onDraft?.(this.shapeOf(p.g, g));
    else if (p.handle) this.o.onHandle?.(p.handle, g.x, g.z);
  }

  up(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    this.ed?.setOrbit(true);
    const g = this.ground(e) || p.g;
    if (p.drawing) {
      if (!p.drag || !g) return this.say('Drag, do not tap — press and pull out the shape.', 'Esc cancels.');
      return this.finish(this.shapeOf(p.g, g));
    }
    if (p.handle) return this.o.onCommit?.(p.handle);
    if (p.drag || !g) return;
    if (this.o.mode === 'edit') {
      // The world editor's own ray against object footprints, so a tap here selects what a tap
      // in the editor sheet would.
      const o = this.o.onObject && this.ed ? this.ed.pick(e) : null;
      if (o) return this.o.onObject(o);
      return this.o.onClick?.(g.x, g.z);
    }
    this.point(g);
  }

  // A start point wants a facing too, so the second click is what the player will be looking at.
  point(g) {
    this.points.push(g);
    if (this.o.facing && this.points.length === 1) {
      this.o.onDraft?.({ k: 'circle', x: g.x, z: g.z, r: 1.2 });
      return this.say('Now click what the player should be facing.', 'Esc cancels.');
    }
    this.finish(this.o.facing ? { at: this.points[0], look: g } : g);
  }

  shapeOf(a, b) {
    return this.o.kind === 'rect' ? rectFrom(a, b) : circleFrom(a, b);
  }
}

function buildBar(s) {
  const bar = document.createElement('div');
  bar.className = 'lv-worldbar';
  bar.innerHTML = `<b data-role="hint"></b><span data-role="sub"></span>
    <span class="lv-grow"></span>
    <button data-act="done" class="lv-primary" hidden>Done</button>
    <button data-act="cancel">Cancel (Esc)</button>`;
  const done = bar.querySelector('[data-act=done]');
  done.hidden = s.o.mode !== 'edit';
  done.onclick = () => s.finish(true);
  bar.querySelector('[data-act=cancel]').onclick = () => s.finish(null);
  document.body.appendChild(bar);
  return bar;
}

export { dragHandle };

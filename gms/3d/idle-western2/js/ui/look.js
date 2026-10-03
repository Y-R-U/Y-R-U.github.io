import { el as mk } from './dom.js?v=20261004a';

const HOLD_MS = 300, SLOP = 8, YAW_PER_W = 2.3, PITCH_PER_H = 1.4;

// Hold a 3D view still for HOLD_MS, then drag to orbit (pinch to zoom). A move before that is a scroll; a short press is a tap.
export function createLook({ host, blocked = () => false, buzz = () => {} }) {
  const live = new Map();
  let g = null, swallowUntil = 0;

  host.onFrame(() => {
    for (const [viewId, v] of live) {
      if (v.orbit.busy) { host.markDirty(viewId); continue; }
      live.delete(viewId);
      if (v.lineId) { host.setViewFps(viewId, 0); host.setFocus(host.world?.heroRig?.pinned || null); }
    }
  });

  function cancel() {
    if (!g) return;
    clearTimeout(g.timer);
    g = null;
  }

  function engage() {
    const v = g;
    if (!v || blocked()) return cancel();
    v.on = true;
    v.orbit = v.getOrbit();
    v.orbit.engage();
    try { v.el.setPointerCapture(v.id); } catch {}
    v.box.classList.add('looking');
    v.ring.style.translate = `${v.x - v.rx}px ${v.y - v.ry}px`;
    buzz(8);
    live.set(v.viewId, v);
    if (v.lineId) { host.setFocus(v.lineId); host.setViewFps(v.viewId, 60); }
    host.markDirty(v.viewId);
  }

  function end() {
    if (!g) return;
    clearTimeout(g.timer);
    if (g.on) {
      g.orbit.release();
      g.box.classList.remove('looking');
      swallowUntil = performance.now() + 400;
    }
    g = null;
  }

  function attach(el, box, viewId, getOrbit, { lineId = null, allow = () => true } = {}) {
    const veil = mk('div', 'look-veil');
    const ring = mk('i', 'look-ring');
    veil.appendChild(ring);
    el.after(veil);

    el.addEventListener('pointerdown', (e) => {
      if (g && g.el === el && g.on && g.pts.size < 2) {
        g.pts.set(e.pointerId, [e.clientX, e.clientY]);
        try { el.setPointerCapture(e.pointerId); } catch {}
        g.pinch = 0;
        return;
      }
      if (g || e.button > 0 || !e.isPrimary || blocked() || !allow()) return;
      const r = box.getBoundingClientRect(), ve = el.getBoundingClientRect();
      g = {
        el, box, ring, viewId, lineId, getOrbit, id: e.pointerId, on: false, orbit: null,
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, rx: r.left, ry: r.top, w: ve.width, h: ve.height,
        pts: new Map([[e.pointerId, [e.clientX, e.clientY]]]), pinch: 0,
        timer: setTimeout(engage, HOLD_MS),
      };
    });
    el.addEventListener('pointermove', (e) => {
      if (!g || g.el !== el || !g.pts.has(e.pointerId)) return;
      if (!g.on) {
        if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SLOP) cancel();
        return;
      }
      g.pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (g.pts.size >= 2) {
        const [a, b] = g.pts.values();
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (g.pinch) g.orbit.pinch(d / g.pinch);
        g.pinch = d;
      } else if (e.pointerId === g.id) {
        g.orbit.drag(-(e.clientX - g.x) / g.w * YAW_PER_W, (e.clientY - g.y) / g.h * PITCH_PER_H);
        g.x = e.clientX; g.y = e.clientY;
        g.ring.style.translate = `${g.x - g.rx}px ${g.y - g.ry}px`;
      }
      host.markDirty(viewId);
    });
    const up = (e) => {
      if (!g || g.el !== el || !g.pts.has(e.pointerId)) return;
      g.pts.delete(e.pointerId);
      g.pinch = 0;
      if (e.pointerId === g.id && g.pts.size) {
        const [id, p] = g.pts.entries().next().value;
        g.id = id; g.x = p[0]; g.y = p[1];
      }
      if (!g.pts.size || !g.on) end();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', (e) => { if (g?.on && g.el === el && e.pointerId === g.id && !g.pts.has(e.pointerId)) end(); });
    el.addEventListener('touchmove', (e) => { if (g?.on && g.el === el) e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => { if (g && g.el === el) e.preventDefault(); });
    box.addEventListener('click', (e) => {
      if (e.target === el && performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  return {
    attach,
    get active() { return !!g?.on; },
    get busy() { return live.size > 0; },
  };
}

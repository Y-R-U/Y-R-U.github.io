import * as THREE from '../../vendor/three/three.module.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Cutscene runner. Every d.* step resolves instantly once the cutscene is skipped,
// and d.walk snaps the actor to its destination so the end state is consistent.
export function createDirector({ camera, ui, audio, world, controller, input, events, names }) {
  const tasks = new Set();
  let depth = 0, skipping = false, runId = 0;

  const director = {
    active: false,
    get skipping() { return skipping; },
    skip() { if (director.active) { skipping = true; for (const t of [...tasks]) t.finish(); audio?.stopVo?.(); ui?.say?.clear?.(); } },
    update(dt) { for (const t of [...tasks]) if (t.update(dt)) t.finish(); },
    async run(fn, opts = {}) {
      const outer = depth === 0;
      depth++;
      if (outer) {
        director.active = true; skipping = !!opts.skip; runId++;
        controller?.lock(true);
        if (input) input.enabled = false;
        if (opts.letterbox !== false) ui?.letterbox?.(true);
        ui?.skip?.show?.(true);
        events?.emit('cutscene', { on: true });
      }
      try {
        await fn(d);
      } catch (e) {
        console.error('[director]', e);
      } finally {
        depth--;
        if (depth === 0) {
          for (const t of [...tasks]) t.finish();
          director.active = false;
          skipping = false;
          if (opts.letterbox !== false) ui?.letterbox?.(false);
          ui?.skip?.show?.(false);
          if (opts.keepCamera !== true) camera.follow({ dur: opts.followDur ?? 0.6, behind: opts.behind });
          if (opts.unlock !== false) { controller?.lock(false); if (input) input.enabled = true; }
          events?.emit('cutscene', { on: false });
        }
      }
    },
  };

  function task(update, onFinish) {
    let resolve;
    const p = new Promise((r) => (resolve = r));
    const t = {
      update,
      finish() { if (!tasks.has(t)) return; tasks.delete(t); try { onFinish?.(); } catch (e) { console.error(e); } resolve(); },
    };
    tasks.add(t);
    if (skipping) t.finish();
    return p;
  }

  const anchorPos = (a) => {
    if (a?.isVector3) return a.clone();
    if (Array.isArray(a)) return new THREE.Vector3(...a);
    if (typeof a === 'string') { const an = world?.anchors?.get(a); return an ? an.pos.clone() : null; }
    if (a?.pos) return a.pos.clone?.() || new THREE.Vector3(...a.pos);
    return a ? new THREE.Vector3(a.x, a.y ?? 0, a.z) : null;
  };
  const anchorRot = (a) => (typeof a === 'string' ? world?.anchors?.get(a)?.rotY : a?.rotY);

  const d = {
    get skipping() { return skipping; },
    wait: (s) => { let t = 0; return task((dt) => (t += dt) >= s); },
    parallel: (...ps) => Promise.all(ps.flat()),
    cam: (shot, opts) => (skipping ? (camera.cut(shot), Promise.resolve()) : camera.shot(shot, opts)),
    cut: (shot) => camera.cut(shot),
    follow: (opts) => camera.follow(opts),
    letterbox: (on) => ui?.letterbox?.(on),
    fade: (toBlack, dur = 0.5) => (skipping ? (ui?.fade?.(toBlack, 0), Promise.resolve()) : Promise.resolve(ui?.fade?.(toBlack, dur))),
    sfx: (n, o) => { if (!skipping) audio?.sfx?.(n, o); },
    music: (n, o) => audio?.music?.(n, o),
    place: (actor, where, rotY) => {
      const p = anchorPos(where);
      if (p) actor.root.position.copy(p);
      const r = rotY ?? anchorRot(where);
      if (r !== undefined) actor.root.rotation.y = r;
      if (actor === controller?.actor) controller.teleport(actor.root.position, actor.root.rotation.y);
    },
    face: (actor, target, dur = 0.35) => {
      const tp = anchorPos(target) || (target?.root ? target.root.position.clone() : null);
      if (!tp) return Promise.resolve();
      const want = Math.atan2(tp.x - actor.root.position.x, tp.z - actor.root.position.z);
      const start = actor.root.rotation.y, diff = wrap(want - start);
      let t = 0;
      return task((dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        actor.root.rotation.y = start + diff * (k * k * (3 - 2 * k));
        return k >= 1;
      }, () => { actor.root.rotation.y = start + diff; });
    },
    turn: (actor, rotY, dur = 0.35) => {
      const start = actor.root.rotation.y, diff = wrap(rotY - start);
      let t = 0;
      return task((dt) => { t += dt; const k = Math.min(1, t / dur); actor.root.rotation.y = start + diff * (k * k * (3 - 2 * k)); return k >= 1; },
        () => { actor.root.rotation.y = start + diff; });
    },
    walk: (actor, target, opts = {}) => {
      const end = anchorPos(target);
      if (!end) return Promise.resolve();
      const speed = opts.speed ?? (opts.run ? 2.6 : 1.3);
      let path = null;
      try { path = world?.nav?.path?.(actor.root.position.clone(), end); } catch (e) { console.warn('[nav]', e); }
      if (!path || !path.length) path = [end];
      path = path.map((p) => p.clone());
      const endRot = opts.rotY ?? anchorRot(target);
      let i = 0;
      const pos = actor.root.position, dir = new THREE.Vector3();
      const isCat = actor === controller?.actor;
      return task((dt) => {
        let step = speed * dt;
        while (step > 0 && i < path.length) {
          dir.subVectors(path[i], pos); dir.y = 0;
          const dist = dir.length();
          if (dist <= step) { pos.x = path[i].x; pos.z = path[i].z; step -= dist; i++; continue; }
          dir.multiplyScalar(1 / dist);
          pos.x += dir.x * step; pos.z += dir.z * step; step = 0;
          const want = Math.atan2(dir.x, dir.z);
          actor.root.rotation.y = wrap(actor.root.rotation.y + wrap(want - actor.root.rotation.y) * Math.min(1, dt * 10));
        }
        const target = path[Math.min(i, path.length - 1)];
        const gy = world?.groundAt ? world.groundAt(pos.x, pos.z, pos.y + 0.35) : target.y;
        if (Number.isFinite(gy)) pos.y += (gy - pos.y) * Math.min(1, dt * 14);
        actor.setMove?.(speed);
        return i >= path.length;
      }, () => {
        pos.copy(end);
        if (world?.groundAt) { const gy = world.groundAt(end.x, end.z, end.y + 0.35); if (Number.isFinite(gy)) pos.y = gy; }
        if (endRot !== undefined && opts.faceEnd !== false) actor.root.rotation.y = endRot;
        actor.setMove?.(0);
        if (isCat) controller.teleport(pos, actor.root.rotation.y);
      });
    },
    say: async (who, key, opts = {}) => {
      if (skipping) return;
      const line = audio?.voLines?.[key];
      let text = opts.text ?? line?.text ?? key;
      text = names ? names.apply(text) : text;
      const thought = opts.thought ?? (who === 'garfield');
      const voP = Promise.resolve(audio?.vo?.(names?.voKey ? names.voKey(key) : key)).catch(() => null);
      const est = Math.max(1.6, text.split(/\s+/).length * 0.36 + 0.6);
      const dur = opts.dur ?? line?.dur ?? est;
      const uiP = Promise.resolve(ui?.say?.({ who, text, thought, dur }));
      let done = false, minT = 0;
      Promise.all([voP, uiP]).then(() => { done = true; });
      await task((dt) => (minT += dt) > 0.8 && (done || minT > dur + 4));
    },
    // Wait for an arbitrary condition (polled each frame).
    until: (fn, timeout = 30) => { let t = 0; return task((dt) => (t += dt) > timeout || !!fn()); },
    tween: (fn, dur, ease = (k) => k * k * (3 - 2 * k)) => {
      let t = 0;
      return task((dt) => { t += dt; const k = Math.min(1, t / dur); fn(ease(k)); return k >= 1; }, () => fn(1));
    },
  };
  // Skip-aware: d.play with once waits for the clip OR the skip.
  d.play = (actor, clip, opts = {}) => {
    if (skipping) { if (!opts.once) actor.play?.(clip, opts); return Promise.resolve(); }
    const p = Promise.resolve(actor.play?.(clip, opts));
    if (!opts.once) return Promise.resolve();
    let done = false, t = 0;
    p.then(() => { done = true; }, () => { done = true; });
    return task((dt) => done || (t += dt) > (opts.max ?? 8));
  };
  director.d = d;
  return director;
}

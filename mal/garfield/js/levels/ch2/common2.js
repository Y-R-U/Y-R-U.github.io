import * as THREE from '../../../vendor/three/three.module.js';
import { createHumans } from '../../game/humanAI.js';
import { createOdieAI } from '../../game/odieAI.js';
import { createBarks } from '../../game/barks.js';
import { createMarker } from '../../game/marker.js';
import { getCast } from '../../game/cast2.js';
import { LINES } from '../../game/lines.js';
import { bestShot } from '../../game/shots.js';
import { HINT_AFTER, tableBox, inBoxXZ } from '../common.js';

// Chapter Two level runtime (docs/LEVELS2.md §3): Jon + Lyman (humanAI pair), Odie (odieAI), barks, objectives,
// hints, goal marker, step helpers. spec: {id, title, objectives, hints, cast:['odie','lyman'], eats, food, music,
// intro(L, d), setup(L), start(L), update(L, dt), teardown(L)}.
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const prop = (ctx, id) => ctx.world.props?.get?.(id) || null;
export const A = (ctx, n) => ctx.world.anchors?.get?.(n) || null;
export const apos = (ctx, n, fb) => { const a = A(ctx, n); return a ? a.pos.clone() : (fb ? fb.clone() : null); };

export function defineLevel2(spec) {
  const level = {
    id: spec.id, food: spec.food || null, title: spec.title, objectives: spec.objectives, hints: spec.hints,
    eats: !!spec.eats, music: spec.music, chapter: 2, noCelebrate: spec.noCelebrate,
    async setup(ctx) {
      const L = await makeRuntime(ctx, spec);
      ctx.L = L; level.L = L;
      await spec.setup?.(L);
    },
    async intro(ctx) {
      const L = ctx.L;
      if (!L || !spec.intro) return;
      L.inIntro = true;
      try { await ctx.director.run((d) => spec.intro(L, d)); } finally { L.inIntro = false; }
    },
    update(ctx, dt) {
      const L = ctx.L;
      if (!L || L.dead) return;
      if (!L.started) { L.started = true; L.start(); }
      L.update(dt);
    },
    teardown(ctx) { ctx.L?.dispose(); ctx.L = null; },
  };
  return level;
}

async function makeRuntime(ctx, spec) {
  const barks = createBarks(ctx);
  ctx.barks = barks;
  const need = spec.cast || ['odie', 'lyman'];
  const [odie, lyman] = await Promise.all([
    need.includes('odie') ? getCast(ctx, 'odie') : null,
    need.includes('lyman') ? getCast(ctx, 'lyman') : null,
  ]);
  try { lyman?.setOutfit?.('normal'); lyman?.setFur?.(0); } catch {}
  try { odie?.setSocks?.(false); } catch {}
  const humans = createHumans(ctx, { lyman });
  ctx.humans = humans;
  ctx.jonAI = humans.jon;
  ctx.odie = odie; ctx.lyman = lyman;
  const odieAI = odie ? createOdieAI(ctx, odie) : null;
  ctx.odieAI = odieAI;
  const marker = createMarker(ctx);
  const L = {
    ctx, spec, barks, marker, humans, jon: humans.jon, ly: humans.lyman, odie, odieAI, lyman,
    flags: {}, t: 0, started: false, dead: false, won: false, hintI: 0, hintT: 0,
    objDone: (spec.objectives || []).map(() => false), offs: [],
  };
  // a restart can leave a human parented to a seat
  for (const h of humans.list) { if (h.seated()) h.leave(); }
  const js = A(ctx, 'jonSpawn');
  if (js) { ctx.jon.root.position.copy(js.pos); ctx.jon.root.rotation.set(0, js.rotY || 0, 0); }
  ctx.jon.root.visible = true;

  L.obj = (i, done = true) => {
    if (L.objDone[i] === done) return;
    L.objDone[i] = done;
    ctx.objective(i, done);
    if (done) L.progress();
  };
  L.next = () => L.objDone.findIndex((d) => !d);
  L.setObjText = (i, text) => {
    const list = (ctx.objectives || []).map((o, j) => ({ text: j === i ? text : o.text, done: L.objDone[j] }));
    ctx.objectives = list;
    ctx.ui?.hud?.set?.({ objectives: list.map((o) => ({ ...o })) });
  };
  L.progress = () => { L.hintT = 0; };
  L.say = (k, o) => barks.say(k, o);
  L.line = (k, o) => barks.line(k, o);
  L.target = (fn, o) => marker.set(fn, o);
  L.gpos = () => ctx.controller.pos;
  L.tutorial = (o) => { try { ctx.ui?.tutorial?.show?.(ctx.ui?.isTouch && o.touchText ? { ...o, text: o.touchText } : o); } catch {} };
  L.on = (ev, fn) => { const off = ctx.events.on(ev, fn); L.offs.push(off); return off; };
  L.later = (s, fn) => { const st = { left: s, fn }; (L.timers ||= []).push(st); return st; };
  L.win = async (delay = 0.8) => {
    if (L.won) return;
    L.won = true;
    marker.set(null);
    await new Promise((r) => setTimeout(r, delay * 1000));
    if (!L.dead) ctx.win();
  };
  // Cutscene mid-level: locks control, letterbox, skippable.
  L.cut = async (fn) => {
    L.inCut = true;
    try { await ctx.director.run(fn); } catch (e) { console.error('[c2 cut]', e); } finally { L.inCut = false; }
  };
  L.dsay = (d, who, key, o = {}) => d.say(who, barks.pick?.(key) && !LINES[key] && !ctx.audio?.voLines?.[key] ? barks.pick(key) : key,
    { text: o.text, thought: who === 'garfield', ...o });
  L.shot = (look, o = {}) => bestShot(ctx, look, { dist: 2.6, h: 0.7, ...o });
  L.onTable = () => { const c = ctx.controller, b = tableBox(ctx); return !c.locked && c.grounded !== false && inBoxXZ(c.pos, b, 0.05) && Math.abs(c.pos.y - b.topY) < 0.25; };
  L.tableTopY = () => tableBox(ctx).topY;

  // Interact helper (auto-cleared at teardown by ctx.interact).
  L.interact = (def) => ctx.interact.register({ radius: 0.7, heightTol: 0.6, ...def, getPos: def.getPos || ((o) => (o || V()).copy(def.pos())) });

  // An "Eat!" spot: Garfield eats in place (2.4 s, prop.eaten(t)) then onDone.
  L.eatSpot = ({ id, pos, prop: p, enabled, onDone, label = 'Eat!', radius = 0.65, heightTol = 0.5, dur = 2.4, notYet }) => {
    let eating = false;
    return L.interact({
      id, radius, heightTol, markerHeight: 0.35,
      get label() { return enabled && !enabled() ? (notYet || 'Not yet!') : label; },
      pos, enabled: () => !eating && !L.won && (!notYet || true) && (enabled ? (enabled() || !!notYet) : true),
      onInteract: async () => {
        if (enabled && !enabled()) { L.say(spec.notYetBark || 'g_guarded', { force: true }); return; }
        eating = true;
        const c = ctx.controller, g = ctx.garfield;
        c.lock(true);
        const fp = pos();
        g.root.rotation.y = Math.atan2(fp.x - c.pos.x, fp.z - c.pos.z);
        try { g.setExpression?.('chew'); } catch {}
        g.play?.('eat', { once: true });
        let t = 0;
        await new Promise((res) => { const off = ctx.every(0.05, () => {
          t += 0.05;
          try { (typeof p === 'function' ? p() : p)?.eaten?.(Math.min(1, t / dur)); } catch {}
          if (Math.floor(t / 0.45) !== Math.floor((t - 0.05) / 0.45)) ctx.audio?.sfx?.('chomp', { rate: 0.9 + Math.random() * 0.2 });
          if (t >= dur) { off(); res(); }
        }); });
        ctx.audio?.sfx?.('gulp');
        try { g.setExpression?.('happy'); } catch {}
        c.lock(false);
        L.progress();
        onDone?.();
      },
    });
  };

  // ---- hints ----
  function updateHints(dt) {
    if (ctx.director?.active || ctx.controller.locked || humans.chasing() || L.won || L.inCut) return;
    const hints = spec.hints || [];
    if (!hints.length) return;
    L.hintT += dt;
    if (L.hintT > (L.hintI === 0 ? HINT_AFTER : HINT_AFTER + 5)) {
      L.hintT = 0;
      const done = L.objDone.filter(Boolean).length;
      const n = L.objDone.length || 1;
      L.hintI = Math.max(L.hintI, Math.min(hints.length - 1, Math.floor((done / n) * hints.length)));
      const k = hints[Math.min(L.hintI, hints.length - 1)];
      L.hintI++;
      barks.say(k, { force: true });
      ctx.events.emit('hint', { key: k });
    }
  }
  // ambient barks about the newcomers
  let ambT = 18 + Math.random() * 10;
  function updateAmbient(dt) {
    if ((ambT -= dt) > 0 || ctx.director?.active) return;
    ambT = 20 + Math.random() * 15;
    const r = Math.random();
    if (odie && odie.root.visible && flat(odie.root.position, ctx.controller.pos) < 3 && r < 0.5) barks.say('g_c2_odie', { lowPri: true });
    else if (r < 0.65) barks.say('g_c2_idle', { lowPri: true });
    else if (lyman?.root.visible && r < 0.85) barks.say('l_idle', { lowPri: true });
    else if (ctx.jon.root.visible) barks.say('c2_j_idle', { lowPri: true });
  }

  L.start = () => { L.progress(); spec.start?.(L); };
  L.update = (dt) => {
    L.t += dt;
    barks.update(dt);
    humans.update(dt);
    odieAI?.update(dt);
    if (L.timers) for (let i = L.timers.length - 1; i >= 0; i--) { const st = L.timers[i]; if ((st.left -= dt) <= 0) { L.timers.splice(i, 1); try { st.fn(); } catch (e) { console.error(e); } } }
    updateHints(dt);
    updateAmbient(dt);
    spec.update?.(L, dt);
    marker.visible = !L.won && !ctx.director?.active && L.showMarker !== false;
    marker.update(dt);
  };
  L.dispose = () => {
    L.dead = true;
    try { spec.teardown?.(L); } catch (e) { console.error(e); }
    L.offs.forEach((f) => f?.());
    humans.dispose(); odieAI?.dispose(); barks.dispose(); marker.dispose();
    try { ctx.ui?.tutorial?.hide?.(); } catch {}
    try { ctx.garfield.setBald?.(false); } catch {}
    ctx.controller.animHold = false;
  };
  return L;
}

// ---------------------------------------------------------------------------
// shared Ch2 bits
export function sofaTV(L, { mug = false } = {}) {
  const { jon, ly } = L;
  jon.setHome({ type: 'custom', fn: () => jon.sitOn('sofaSeatL', 'watch_tv') });
  ly?.setHome({ type: 'custom', fn: () => ly.sitOn('sofaSeatR', mug ? 'drink_coffee' : 'watch_tv') });
  jon.sitOnNow('sofaSeatL', 'watch_tv');
  ly?.sitOnNow('sofaSeatR', mug ? 'drink_coffee' : 'watch_tv');
}
export function tableEat(L, { jonClip = 'sit_eat', lyClip = 'sit_eat' } = {}) {
  const { jon, ly } = L;
  jon.setHome({ type: 'sit' });
  jon.sitNow();
  if (jonClip !== 'sit_eat') L.ctx.jon.play?.(jonClip);
  if (ly) { ly.setHome({ type: 'sit' }); ly.sitNow(); }
}
export function hideHuman(L, h) { h.setOff(); h.leave(); h.actor.root.visible = false; h.enabled = false; }

// "Naughty Garfield!" from both, then both chase for 10 s (D18); resolves when the chase (or the catch) is over.
export function naughtyChase(L) {
  const { jon, ly, ctx } = L;
  return new Promise((res) => {
    L.say('c2_j_naughty', { force: true });
    if (ly) L.say('c2_l_naughty', { force: true, delay: 0.25 });
    for (const h of [jon, ly].filter(Boolean)) if (!h.seated()) {} // seated humans stand inside chase()
    jon.chase(10);
    let started = false;
    const off = L.on('chase', () => {});
    const poll = () => {
      if (L.dead) return res();
      const busy = L.humans.chasing() || L.humans.any((h) => h.state === 'catch');
      if (busy) started = true;
      if (started && !busy) { off(); return res(); }
      L.later(0.2, poll);
    };
    L.later(0.3, poll);
    void ctx;
  });
}

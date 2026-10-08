import { defineLevel2, V, flat, prop, A, apos, sofaTV } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { getCast } from '../../game/cast2.js';
import { LINES } from '../../game/lines.js';

// C2 L5 "Special Delivery": the new TV arrives, the old one sits on the carpet with Odie beside it. Find a mouse
// hole, get cheese from the fridge, put 3 bits around → mouse chaos → grip the carpet → the old TV flattens Odie.
const T = (k) => LINES[k]?.text;
const NEED = 3;
const holes = (ctx) => [0, 1, 2, 3].map((i) => apos(ctx, 'mouseHole' + i)).filter(Boolean);
const cheeseSpots = (ctx) => [0, 1, 2, 3, 4, 5].map((i) => apos(ctx, 'cheese' + i)).filter(Boolean);
const odieSpot = (ctx) => apos(ctx, 'oldTvSpot', V(1.17, 0, 2.75)).setY(0).add(V(0.15, 0, 0.8));

export default defineLevel2({
  id: 'c2:5', title: 'Special Delivery',
  objectives: ['Find a mouse hole', 'Grab cheese from the fridge', `Put cheese around the house (0/${NEED})`, 'Grip the carpet behind the new TV'],
  hints: ['c2_l05_hint_1', 'c2_l05_hint_2', 'c2_l05_hint_3'],
  async setup(L) {
    const { ctx } = L;
    hidePlates(L);
    L.mice = await getCast(ctx, 'mice');
    L.mice.show?.(false);
    L.flags.placed = 0;
    const fridge = () => prop(ctx, 'fridge');
    L.interact({ id: 'fridge', radius: 0.85, heightTol: 0.5, label: 'Get some cheese', pos: () => apos(ctx, 'fridgeFront', V(5.6, 0, 9.8)),
      enabled: () => L.objDone[0] && !L.objDone[1] && !L.flags.fridgeBusy,
      onInteract: async () => {
        L.flags.fridgeBusy = true;
        ctx.audio?.sfx?.('fridge');
        try { ctx.garfield.play?.('interact', { once: true }); await fridge()?.open?.(); } catch {}
        await new Promise((r) => setTimeout(r, 700));
        L.obj(1);
        L.say('c2_g_l5_cheese', { force: true });
        try { await fridge()?.close?.(); } catch {}
        L.flags.fridgeBusy = false;
      } });
    cheeseSpots(ctx).forEach((p, i) => L.interact({ id: 'cheese_' + i, radius: 0.6, heightTol: 0.5, label: 'Put the cheese down', pos: () => p.clone(),
      enabled: () => L.objDone[1] && !L.objDone[2] && !L.flags['cheese' + i],
      onInteract: () => {
        L.flags['cheese' + i] = true;
        try { ctx.garfield.play?.('interact', { once: true }); prop(ctx, 'cheese')?.put?.(i); } catch {}
        ctx.audio?.sfx?.('pop');
        const n = ++L.flags.placed;
        L.setObjText(2, `Put cheese around the house (${Math.min(n, NEED)}/${NEED})`);
        if (n === 1) L.say('c2_g_l5_place', { force: true });
        if (n >= NEED) { L.obj(2); miceChaos(L); }
      } }));
    L.interact({ id: 'carpet', radius: 0.7, heightTol: 0.5, markerHeight: 0.4,
      get label() { return L.flags.chaos ? 'Grip the carpet!' : 'Too many eyes…'; },
      pos: () => apos(ctx, 'carpetEdge', V(1.1, 0, 4.0)),
      enabled: () => !L.objDone[3] && L.objDone[0],
      onInteract: () => { if (!L.flags.chaos) { L.say('c2_g_l5_eyes', { force: true }); return; } pullCarpet(L); } });
  },
  async intro(L, d) {
    const { ctx } = L;
    const { jon } = ctx;
    sofaTV(L);
    const del = await getCast(ctx, 'delivery');
    L.del = del;
    const doorIn = apos(ctx, 'doorInside', V(7.1, 0, 1)), step = apos(ctx, 'doorStep', V(7.1, 0, -0.95));
    const fd = prop(ctx, 'frontDoor'), box = prop(ctx, 'tvBox');
    try { box?.setActive?.(true); if (box?.root) box.root.visible = false; } catch {}
    d.sfx('knock');
    await d.wait(0.7);
    L.jon.setOff(); L.jon.leave();
    const ci = A(ctx, 'cam_frontDoorIn');
    d.cut(ci ? { pos: ci.pos.clone(), look: (ci.look || doorIn).clone(), fov: ci.fov ?? 55 } : L.shot(doorIn.clone().setY(1.2), { dist: 3 }));
    jon.play?.('walk');
    await d.walk(jon, doorIn, { faceEnd: false });
    d.face(jon, step);
    try { fd?.setLocked?.(false); fd?.open?.(); } catch {}
    d.place(del, step.clone().lerp(doorIn, 0.55), Math.PI);
    del.root.visible = true;
    if (box?.root) box.root.visible = true;
    try { del.holdProp?.('box', box?.root); del.play?.('carry_box'); } catch {}
    await d.say('delivery', 'd_l5_sign', { text: T('d_l5_sign') });
    await d.play(del, 'hand_over', { once: true, max: 1.2 });
    try { del.dropProp?.(); del.holdProp?.(null); jon.holdProp?.('box', box?.root); jon.play?.('carry_box'); } catch {}
    try { jon.setExpression?.('happy'); } catch {}
    await d.say('jon', 'c2_j_l5_tv', { text: T('c2_j_l5_tv') });
    await d.say('delivery', 'd_l5_bye', { text: T('d_l5_bye') });
    del.root.visible = false;
    try { fd?.close?.(); } catch {}
    // unbox by the TV, swap them, old TV on the carpet
    const tvFront = apos(ctx, 'tvBoxSpot', V(1.6, 0, 3.6)).setY(0);
    d.cut(L.shot(tvFront.clone().setY(0.8), { dist: 3.0, h: 0.9 }));
    await d.walk(jon, tvFront.clone().add(V(0.5, 0, 0)), { faceEnd: false });
    try { jon.holdProp?.(null); if (box?.root) { ctx.world.scene.attach(box.root); box.root.position.copy(tvFront); } } catch {}
    const unbox = d.play(jon, 'unbox', { once: true, max: 2.4 });
    try { box?.open?.(); } catch {}
    await unbox;
    try { ctx.world.swapTv?.(); L.flags.swapped = true; box?.setActive?.(false); } catch {}
    await d.say('jon', 'c2_j_l5_swap', { text: T('c2_j_l5_swap') });
    L.odieAI.place(apos(ctx, 'sofaFoot', V(3, 0, 2.75)));
    L.odieAI.goTo(odieSpot(ctx), { run: true, then: 'idle_pant' });
    await d.wait(1.6);
    d.cut(L.shot(ctx.garfield.root.position.clone().setY(0.35), { dist: 1.4, h: 0.2, prefer: ctx.garfield.root.rotation.y }));
    await d.say('garfield', 'c2_g_l5_intro', { text: T('c2_g_l5_intro') });
  },
  start(L) {
    const { ctx } = L;
    if (!L.flags.swapped) { try { ctx.world.swapTv?.(); } catch {} L.flags.swapped = true; }
    try { prop(ctx, 'tvBox')?.setActive?.(false); prop(ctx, 'frontDoor')?.close?.(); prop(ctx, 'frontDoor')?.setLocked?.(true); } catch {}
    if (L.del) L.del.root.visible = false;
    sofaTV(L);
    L.odieAI.place(odieSpot(ctx), Math.PI / 2);
    L.odieAI.idle('idle_pant');
  },
  update(L, dt) {
    const { ctx, flags } = L;
    const g = ctx.controller.pos;
    if (!L.objDone[0] && g.y < 0.4) {
      const h = holes(ctx).find((p) => flat(p, g) < 0.85);
      if (h) {
        L.obj(0);
        L.say('c2_g_l5_hole', { force: true });
        ctx.audio?.sfx?.('squeak');
        try { L.mice.show?.(true); L.mice.scurry?.(h.clone(), h.clone().add(V(0.4, 0, 0.4).applyAxisAngle(V(0, 1, 0), Math.random() * 6))); } catch {}
      }
    }
    const n = L.next();
    if (n === 0) { const hs = holes(ctx); hs.sort((a, b) => flat(a, g) - flat(b, g)); if (hs[0]) L.target((o) => o.copy(hs[0]), { height: 0.3 }); }
    else if (n === 1) L.target((o) => o.copy(apos(ctx, 'fridgeFront', V())).setY(1.0), { height: 0.3 });
    else if (n === 2) {
      const free = cheeseSpots(ctx).map((p, i) => [p, i]).filter(([, i]) => !flags['cheese' + i]);
      free.sort((a, b) => flat(a[0], g) - flat(b[0], g));
      if (free[0]) L.target((o) => o.copy(free[0][0]), { height: 0.3 });
    } else if (n === 3) L.target((o) => o.copy(apos(ctx, 'carpetEdge', V())), { height: 0.35 });
    void dt;
  },
  teardown(L) {
    showPlates(L);
    try { L.mice?.stop?.(); L.mice?.show?.(false); } catch {}
    try { prop(L.ctx, 'fridge')?.close?.(); } catch {}
  },
});

// mice everywhere; Jon and Lyman run about lunging at them (the distraction lasts until the level ends)
function miceChaos(L) {
  const { ctx, jon, ly } = L;
  L.cut(async (d) => {
    try { L.mice.show?.(true); L.mice.wander?.({ min: V(0.6, 0, 0.6), max: V(8.0, 0, 10.4) }); } catch {}
    ctx.audio?.sfx?.('squeak');
    d.cut(L.shot(apos(ctx, 'livingCentre', V(5.9, 0, 2.6)).setY(0.8), { dist: 3.4, h: 1.2 }));
    startChasing(L);
    await d.say('jon', 'c2_j_l5_mice', { text: T('c2_j_l5_mice') });
    await d.say('lyman', 'c2_l_l5_mice', { text: T('c2_l_l5_mice') });
    await d.wait(2.5);
  });
  L.flags.chaos = true;
  void jon; void ly;
}

function startChasing(L) {
  const { ctx } = L;
  const pts = [V(2.0, 0, 1.5), V(5.5, 0, 1.6), V(6.0, 0, 4.4), V(3.0, 0, 4.2), V(2.2, 0, 7.0), V(6.3, 0, 7.2), V(5.0, 0, 10.0)];
  for (const [h, line] of [[L.jon, 'c2_j_l5_chase'], [L.ly, 'c2_l_l5_chase']]) {
    if (!h) continue;
    const loop = () => h.run('miceChase', async (t) => {
      await h.standUp(t);
      for (let i = 0; ; i++) {
        const p = pts[Math.floor(Math.random() * pts.length)];
        await t.walkTo(p, { speed: 2.0, arrive: 0.4 });
        await t.play('catch_mouse', 1.0, { fallback: 'investigate' });
        if (Math.random() < 0.35) t.say(line);
      }
    });
    h.setHome({ type: 'custom', fn: loop });
    loop();
  }
  void ctx;
}

function pullCarpet(L) {
  const { ctx, odieAI } = L;
  L.obj(3);
  const carpet = prop(ctx, 'carpet');
  const target = L.odie.root.position.clone().add(V(0, 0.3, 0));
  L.cut(async (d) => {
    d.cut(L.shot(target.clone().setY(0.7), { dist: 3.0, h: 0.8 }));
    try { ctx.garfield.play?.('pull', { loop: true }); } catch {}
    ctx.audio?.sfx?.('carpet');
    const p = Promise.resolve(carpet?.pull?.({ target })).catch(() => {});
    await Promise.race([p, d.wait(1.4)]);
    ctx.audio?.sfx?.('tvthud');
    ctx.camera.shake?.(0.15);
    odieAI.run('flat', async (t) => { t.loop('flattened', { fallback: 'dizzy' }); await t.wait(999); });
    odieAI.noise('o_whimper', { delay: 0.6 });
    await d.wait(1.6);
    try { ctx.garfield.play?.('idle'); } catch {}
    await d.say('garfield', 'c2_g_l5_win', { text: T('c2_g_l5_win') });
  }).then(() => L.win(0.2));
}

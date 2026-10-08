import { defineLevel2, V, flat, prop, A, apos } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { tableBox } from '../common.js';
import { LINES } from '../../game/lines.js';

// C2 L9 "Bad Mood": sit on the table → Jon sings good morning → poke him in the face → Jon + Lyman come over →
// HOLD Interact to glare → "With great, great respect." → the surprise group hug.
const T = (k) => LINES[k]?.text;
const HOLD = 1.5;

export default defineLevel2({
  id: 'c2:9', title: 'Bad Mood',
  objectives: ['Sit on the table', 'Poke Jon in the face', 'Hold Interact to glare'],
  hints: ['c2_l09_hint_1', 'c2_l09_hint_2', 'c2_l09_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    L.flags.p = 0;
    L.interact({ id: 'sit', radius: 1.0, heightTol: 0.35, label: 'Sit', pos: () => apos(ctx, 'tableTop', V(4.4, 0.76, 8.8)),
      enabled: () => L.onTable() && !L.flags.sitting && !L.objDone[1], onInteract: () => sit(L) });
    L.interact({ id: 'poke', radius: 1.6, heightTol: 1.2, label: 'Poke!', pos: () => L.jon.pos(),
      enabled: () => L.flags.sitting && L.jon.state === 'byTable' && !L.objDone[1], onInteract: () => poke(L) });
  },
  async intro(L, d) {
    const { ctx } = L;
    const g = ctx.garfield.root.position.clone();
    d.cut(L.shot(g.clone().setY(g.y + 0.35), { dist: 1.5, h: 0.25, prefer: ctx.garfield.root.rotation.y }));
    try { ctx.garfield.setExpression?.('disgust'); ctx.garfield.play?.('seethe'); ctx.garfield.setSeethe?.(0.3); } catch {}
    await d.say('garfield', 'c2_g_l9_intro', { text: T('c2_g_l9_intro') });
    try { ctx.garfield.setSeethe?.(0); ctx.garfield.play?.('idle'); } catch {}
  },
  start(L) {
    const { ctx, jon, ly } = L;
    jon.setHome({ type: 'stay' });
    jon.place(apos(ctx, 'stairsBottom', V(8.65, 0, 0.45)).add(V(-0.6, 0, 0.6)), Math.PI);
    jon.goHome();
    ly.setHome({ type: 'stay' });
    const bench = apos(ctx, 'counter', V(3.6, 0, 10.7)).setY(0); bench.z -= 0.75;
    ly.place(bench, Math.PI);
    ly.goHome();
    L.odieAI.place(apos(ctx, 'odieBowl', V(7.35, 0, 9.75)).add(V(0, 0, -0.5)), Math.PI);
    L.odieAI.sit('sit');
  },
  update(L, dt) {
    const { ctx, flags } = L;
    const c = ctx.controller;
    // sitting: any movement stands him back up (until the poke; after that the scene holds him)
    if (flags.sitting && !flags.locked && c.speed > 0.3) { flags.sitting = false; c.animHold = false; }
    if (flags.sitting && !L.objDone[1] && !flags.walkBy && L.objDone[0]) walkBy(L);
    if (flags.holdReady && !L.objDone[2]) {
      const held = !!ctx.input?.interactHeld;
      flags.p = Math.max(0, Math.min(1, flags.p + (held ? dt / HOLD : -dt / HOLD)));
      try { ctx.garfield.setSeethe?.(flags.p); } catch {}
      ctx.ui?.hud?.set?.({ hold: { p: flags.p, label: 'Hold!' }, interactLabel: 'Hold to glare!' });
      if (flags.p >= 1) glared(L);
    }
    const n = L.next();
    if (n === 0) L.target((o) => o.copy(apos(ctx, 'tableTop', V())), { height: 0.4 });
    else if (n === 1 && L.jon.state === 'byTable') L.target((o) => o.copy(L.jon.pos()).setY(1.6), { height: 0.2 });
    else L.target(null);
  },
  teardown(L) {
    showPlates(L);
    const { ctx } = L;
    ctx.ui?.hud?.set?.({ hold: null, interactLabel: null });
    ctx.controller.lock(false);
    try { ctx.garfield.setSeethe?.(0); } catch {}
  },
});

function sit(L) {
  const { ctx } = L;
  L.flags.sitting = true;
  ctx.controller.animHold = true;
  ctx.controller.vel?.set?.(0, 0, 0);
  try { ctx.garfield.play?.('sit_table'); ctx.garfield.setExpression?.('disgust'); } catch {}
  L.obj(0);
}

function besideTable(L) {
  const { ctx } = L;
  const g = ctx.controller.pos, tb = tableBox(ctx);
  // the floor point just off the nearest table edge
  const cands = [V(tb.min.x - 0.45, 0, g.z), V(tb.max.x + 0.45, 0, g.z), V(g.x, 0, tb.min.z - 0.45), V(g.x, 0, tb.max.z + 0.45)];
  cands.sort((a, b) => flat(a, g) - flat(b, g));
  return cands.find((p) => (ctx.world.groundAt?.(p.x, p.z, 0.3) ?? 0) < 0.1) || cands[0];
}

function walkBy(L) {
  const { ctx, jon } = L;
  L.flags.walkBy = true;
  jon.run('walkBy', async (t) => {
    for (;;) {
      const spot = besideTable(L);
      await t.walkTo(spot, { arrive: 0.2 });
      await t.face(ctx.controller.pos);
      jon.state = 'byTable';
      try { ctx.jon.setExpression?.('happy'); } catch {}
      t.loop('sing_morning', { fallback: 'talk' });
      t.say('c2_j_l9_morning', { force: true });
      await t.wait(5);
      jon.state = 'walkBy';
      if (!L.flags.sitting) { L.flags.walkBy = false; jon.goHome(); return; }
      await t.walkTo(apos(ctx, 'livingCentre', V(5.9, 0, 2.6)), { arrive: 0.4 });
      await t.wait(6);
    }
  });
}

function poke(L) {
  const { ctx, jon, ly } = L;
  L.obj(1);
  L.quiet = true;
  L.flags.locked = true;
  ctx.controller.lock(true);
  ctx.garfield.root.rotation.y = Math.atan2(jon.pos().x - ctx.controller.pos.x, jon.pos().z - ctx.controller.pos.z);
  try { ctx.garfield.play?.('poke', { once: true }); } catch {}
  ctx.audio?.sfx?.('hit', { vol: 0.5 });
  L.cut(async (d) => {
    const jp = jon.pos();
    jon.setOff(); ly.setOff();
    ctx.jon.play?.('poked');
    try { ctx.jon.setExpression?.('pain'); } catch {}
    await d.say('jon', 'c2_j_l9_ow', { text: T('c2_j_l9_ow') });
    try { ctx.garfield.play?.('sit_table'); } catch {}
    const lp = ctx.lyman.root.position.clone();
    const meet = lp.clone().add(V(0, 0, -0.9));
    ctx.jon.play?.('walk');
    await d.walk(ctx.jon, meet, { faceEnd: false });
    await d.face(ctx.jon, lp); await d.face(ctx.lyman, meet);
    d.cut(L.shot(meet.clone().lerp(lp, 0.5).setY(1.4), { dist: 2.6, h: 0.1 }));
    ctx.jon.play?.('talk');
    await d.say('jon', 'c2_j_l9_nasty', { text: T('c2_j_l9_nasty') });
    ctx.lyman.play?.('talk');
    await d.say('lyman', 'c2_l_l9_treat', { text: T('c2_l_l9_treat') });
    // they walk over to the cat on the table
    const g = ctx.controller.pos.clone();
    const a = besideTable(L), b = a.clone().add(V(0.8, 0, 0));
    ctx.jon.play?.('walk'); ctx.lyman.play?.('walk');
    await d.parallel(d.walk(ctx.jon, a, { faceEnd: false }), d.walk(ctx.lyman, b, { faceEnd: false }));
    d.face(ctx.jon, g); d.face(ctx.lyman, g);
    ctx.jon.play?.('idle'); ctx.lyman.play?.('idle');
    d.cut(L.shot(g.clone().setY(g.y + 0.4), { dist: 2.2, h: 0.5, prefer: Math.atan2(a.x - g.x, a.z - g.z) + 0.6 }));
    void jp;
  }).then(() => {
    L.flags.holdReady = true;
    try { ctx.garfield.play?.('seethe'); } catch {}
    L.tutorial({ id: 'hold', text: 'Hold E (or Space) to give them your meanest glare!', touchText: 'Hold the hand button to give them your meanest glare!', icon: 'hand', keys: ['E'], touch: 'interact' });
  });
}

function glared(L) {
  const { ctx, jon, ly } = L;
  L.obj(2);
  L.flags.holdReady = false;
  ctx.ui?.hud?.set?.({ hold: null, interactLabel: null });
  try { ctx.ui?.tutorial?.hide?.(); } catch {}
  L.cut(async (d) => {
    const g = ctx.controller.pos.clone();
    L.say('c2_g_l9_glare', { force: true });
    ctx.jon.play?.('frightened'); ctx.lyman.play?.('frightened');
    try { ctx.jon.setExpression?.('shock'); } catch {}
    await d.wait(0.8);
    await d.say('jon', 'c2_j_l9_respect', { text: T('c2_j_l9_respect') });
    // they back away... then sneak up behind him
    try { ctx.garfield.setSeethe?.(0); ctx.garfield.play?.('sit_table'); } catch {}
    await d.fade(true, 0.4);
    const ry = ctx.garfield.root.rotation.y, back = V(-Math.sin(ry), 0, -Math.cos(ry));
    const side = V(back.z, 0, -back.x);
    const base = g.clone().setY(0).addScaledVector(back, 1.6);
    d.place(ctx.jon, base.clone().addScaledVector(side, 0.5), ry);
    d.place(ctx.lyman, base.clone().addScaledVector(side, -0.5), ry);
    L.odieAI.place(base.clone().addScaledVector(back, -0.4), ry);
    d.cut(L.shot(g.clone().setY(g.y + 0.3), { dist: 2.4, h: 0.35, prefer: ry + 0.5 }));
    await d.fade(false, 0.4);
    ctx.jon.play?.('sneak'); ctx.lyman.play?.('sneak');
    const j0 = ctx.jon.root.position.clone(), l0 = ctx.lyman.root.position.clone(), o0 = L.odie.root.position.clone();
    await d.tween((k) => {
      ctx.jon.root.position.lerpVectors(j0, j0.clone().addScaledVector(back, -0.9), k);
      ctx.lyman.root.position.lerpVectors(l0, l0.clone().addScaledVector(back, -0.9), k);
      L.odie.root.position.lerpVectors(o0, o0.clone().addScaledVector(back, -0.9), k);
    }, 1.8, (k) => k);
    ctx.jon.play?.('jump_out'); ctx.lyman.play?.('jump_out');
    L.odie.play?.('bark');
    try { ctx.garfield.setExpression?.('shock'); ctx.garfield.play?.('startled_jump', { once: true }); } catch {}
    d.sfx('yap');
    await d.parallel(d.say('jon', 'c2_j_l9_love', { text: T('c2_j_l9_love') }), d.say('lyman', 'c2_l_l9_love', { text: T('c2_l_l9_love') }));
    ctx.jon.play?.('hug'); ctx.lyman.play?.('hug');
    L.odie.play?.('hug_pile');
    try { ctx.garfield.play?.('hug_squeezed'); } catch {}
    d.sfx('aww');
    await d.wait(1.6);
    try { ctx.garfield.setExpression?.('happy'); ctx.garfield.play?.('loved'); } catch {}
    d.cut(L.shot(g.clone().setY(g.y + 0.35), { dist: 1.4, h: 0.2, prefer: ry }));
    await d.say('garfield', 'c2_g_l9_loved', { text: T('c2_g_l9_loved') });
  }).then(() => L.win(0.2));
}

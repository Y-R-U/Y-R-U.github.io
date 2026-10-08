import { defineLevel2, V, flat, prop, A, apos, tableEat } from './common2.js';
import { LINES } from '../../game/lines.js';

// C2 L1 "Double Dinner": eat your biscuits → step in both dinners ("Ew!") → they leave for the sofa → eat both →
// scratch Odie (he flees to Lyman's room) → eat Odie's food.
const T = (k) => LINES[k]?.text;
const plateP = (ctx, id) => { const p = prop(ctx, id); return p?.pos?.lengthSq() ? p.pos.clone() : apos(ctx, id === 'plate' ? 'plateSpot' : 'plateSpot2', V(4.4, 0.76, 8.5)); };
const odieSpot = (ctx) => {
  const b = apos(ctx, 'odieBowl', V(7.6, 0, 6.5)), a = A(ctx, 'odieBowl');
  const r = a?.rotY || 0;
  return b.add(V(Math.sin(r), 0, Math.cos(r)).multiplyScalar(0.42)).setY(0);
};

export default defineLevel2({
  id: 'c2:1', title: 'Double Dinner', food: 'steak', eats: true,
  objectives: ['Eat your biscuits', "Jump on Jon and Lyman's food", 'Eat both dinners (0/2)', 'Scratch Odie', "Eat Odie's food"],
  hints: ['c2_l01_hint_1', 'c2_l01_hint_2', 'c2_l01_hint_3'],
  setup(L) {
    const { ctx } = L;
    try { prop(ctx, 'plate2')?.setActive?.(true); prop(ctx, 'plate2')?.setFood?.('steak'); prop(ctx, 'plate')?.setFood?.('steak'); } catch {}
    L.flags.ate = 0;
    L.eatSpot({ id: 'catBowl', pos: () => apos(ctx, 'catBowl', V(7.6, 0, 4.4)), prop: () => prop(ctx, 'catBowl'), radius: 0.45,
      enabled: () => !L.objDone[0], onDone: () => { L.obj(0); L.say('c2_g_l1_biscuits', { force: true }); } });
    for (const id of ['plate', 'plate2']) {
      L.eatSpot({ id: 'eat_' + id, pos: () => plateP(ctx, id), prop: () => prop(ctx, id), radius: 0.6, heightTol: 0.45,
        notYet: () => (L.objDone[0] ? "They're watching!" : 'Biscuits first!'),
        enabled: () => L.flags.left && !L.flags['ate_' + id],
        onDone: () => {
          L.flags['ate_' + id] = true;
          const n = ++L.flags.ate;
          L.setObjText(2, `Eat both dinners (${n}/2)`);
          if (n >= 2) { L.obj(2); L.say(['g_win_2', 'g_win_5', 'g_win_4'][Math.floor(Math.random() * 3)], { force: true, delay: 0.4 }); } else L.say('c2_g_l1_plate', { force: true });
        } });
    }
    L.eatSpot({ id: 'odieBowl', pos: () => apos(ctx, 'odieBowl', V(7.6, 0, 6.5)), prop: () => prop(ctx, 'odieBowl'), radius: 0.45,
      notYet: 'Odie is guarding it!',
      enabled: () => L.flags.odieGone,
      onDone: () => { L.obj(4); L.say('c2_g_l1_dogfood', { force: true }); L.win(1.6); } });

  },
  async intro(L, d) {
    const { ctx } = L;
    const { jon, garfield } = ctx, ly = ctx.lyman, odie = ctx.odie;
    const bowl = apos(ctx, 'catBowl', V(7.6, 0, 4.4)), oBowl = apos(ctx, 'odieBowl', V(7.6, 0, 6.5));
    const bowlProp = prop(ctx, 'catBowl'), oBowlProp = prop(ctx, 'odieBowl');
    if (bowlProp?.root) bowlProp.root.visible = false;
    if (oBowlProp?.root) oBowlProp.root.visible = false;
    // the bowls sit 0.65 m apart against the counter: cat and dog wait in front of their own bowls, Jon serves from
    // the left and Lyman from the right (they used to stand on each other's bowls)
    d.place(garfield, bowl.clone().add(V(-0.05, 0, -0.45)), 0);
    garfield.play?.('sit');
    d.place(odie, oBowl.clone().add(V(0.15, 0, -0.55)), 0);
    odie.play?.('sit_pant');
    d.place(jon, apos(ctx, 'jonSpawn', V(4, 0, 8)));
    d.place(ly, apos(ctx, 'jonSpawn', V(4, 0, 8)).add(V(0.7, 0, -0.3)));
    jon.holdProp?.('bowl'); ly.holdProp?.('bowl');
    d.cut(L.shot(bowl.clone().lerp(oBowl, 0.5).setY(0.7), { dist: 3.4, h: 0.9, prefer: Math.PI }));
    jon.play?.('walk'); ly.play?.('walk');
    await d.parallel(d.walk(jon, bowl.clone().add(V(-0.6, 0, -0.2)), { faceEnd: false }), d.walk(ly, oBowl.clone().add(V(0.62, 0, -0.2)), { faceEnd: false }));
    d.face(jon, bowl); d.face(ly, oBowl);
    await d.parallel(d.play(jon, 'give_bowl', { once: true, max: 1.6 }), d.say('jon', 'j_open_bowl_1', { text: T('j_open_bowl_1') }));
    jon.holdProp?.(null); if (bowlProp?.root) bowlProp.root.visible = true;
    await d.parallel(d.play(ly, 'give_bowl', { once: true, max: 1.6 }), d.say('lyman', 'c2_l_l1_bowl', { text: T('c2_l_l1_bowl') }));
    ly.holdProp?.(null); if (oBowlProp?.root) oBowlProp.root.visible = true;
    L.odieAI.place(odieSpot(ctx)); L.odieAI.face(oBowl); odie.play?.('eat');
    // he turns from the bowl to the room for his line, so the lens can see his face (the counter is behind the bowl)
    garfield.root.rotation.y = -2.5;
    d.cut(L.shot(garfield.root.position.clone().setY(0.35), { dist: 1.4, h: 0.15, prefer: -2.5 }));
    try { garfield.setExpression?.('sleepy'); } catch {}
    await d.say('garfield', 'c2_g_l1_hungry', { text: T('c2_g_l1_hungry') });
    // both sit to eat
    const tb = A(ctx, 'tableTop');
    d.cut(tb ? L.shot(tb.pos.clone().setY(0.9), { dist: 3.0, h: 0.8 }) : A(ctx, 'cam_dining'));
    tableEat(L);
    await d.say('jon', 'c2_j_l1_steak', { text: T('c2_j_l1_steak') });
    await d.say('lyman', 'c2_l_l1_steak', { text: T('c2_l_l1_steak') });
  },
  start(L) {
    const { ctx } = L;
    if (!L.jon.seated()) tableEat(L);
    L.odieAI.place(odieSpot(ctx)); L.odieAI.face(apos(ctx, 'odieBowl', V()));
    L.odieAI.idle('eat');
    L.odieAI.onScratch = () => scratchOdie(L);
    try { ctx.garfield.root.visible = true; } catch {}
    L.flags.guardT = 0;
  },
  update(L, dt) {
    const { ctx, flags } = L;
    // stepping in the dinners (on the table, by a plate)
    const nearPlate = L.onTable() && ['plate', 'plate2'].some((id) => flat(ctx.controller.pos, plateP(ctx, id)) < 0.6);
    if (!flags.left && nearPlate && !ctx.director.active) {
      if (L.objDone[0]) ew(L);
      else if (!flags.firstSaid) { flags.firstSaid = true; L.say('c2_g_l1_first', { force: true }); }
    }
    // before the trick: Ch1 guard rule on the table
    if (!flags.left && L.onTable() && ['plate', 'plate2'].some((id) => flat(ctx.controller.pos, plateP(ctx, id)) < 1.0) && !ctx.director.active) {
      flags.guardT += dt;
      if (flags.guardT > 0.6 && !flags.warned) { flags.warned = true; L.say(Math.random() < 0.5 ? 'c2_j_offtable' : 'c2_l_offtable', { force: true }); }
      if (flags.guardT > 5) { flags.guardT = 0; flags.warned = false; L.jon.catchGarfield(); }
    } else flags.guardT = Math.max(0, flags.guardT - dt * 2);
    // marker
    const n = L.next();
    if (n === 0) L.target((o) => o.copy(apos(ctx, 'catBowl', V())), { height: 0.35 });
    else if (n === 1 || n === 2) L.target((o) => o.copy(plateP(ctx, !flags.ate_plate ? 'plate' : 'plate2')), { height: 0.4 });
    else if (n === 3) L.target((o) => o.copy(L.odie.root.position).setY(0.6), { height: 0.3 });
    else if (n === 4) L.target((o) => o.copy(apos(ctx, 'odieBowl', V())), { height: 0.35 });
  },
  teardown(L) { try { prop(L.ctx, 'plate2')?.setActive?.(false); prop(L.ctx, 'lymanDoor')?.close?.(); } catch {} },
});

function ew(L) {
  const { jon, ly } = L;
  L.flags.left = true;
  L.obj(1);
  L.say('c2_j_l1_ew', { force: true });
  L.say('c2_l_l1_ew', { force: true, delay: 0.3 });
  const goSofa = (h, seat, line, delay) => {
    h.setHome({ type: 'custom', fn: () => h.sitOn(seat, 'watch_tv') });
    h.run('ew', async (t) => {
      try { h.actor.setExpression?.('shock'); } catch {}
      await h.standUp(t);
      await t.wait(delay);
      t.say(line, { force: true });
      await t.wait(1.2);
      h.goHome();
    });
  };
  goSofa(jon, 'sofaSeatL', 'c2_j_l1_nomore', 0.4);
  if (ly) goSofa(ly, 'sofaSeatR', 'c2_l_l1_nomore', 2.6);
}

function scratchOdie(L) {
  const { ctx, odieAI } = L;
  if (L.flags.odieGone || odieAI.taskName() === 'flee') return;
  if (!L.objDone[2]) {
    // not yet: a startled hop, then he trots back to his bowl
    L.say('g_c2_odie_scratch', { force: true, delay: 0.5 });
    const back = odieSpot(ctx);
    odieAI.flee(back.clone().add(V(1.6, 0, 0.8)), { then: 'idle_pant' });
    L.later(4, () => { if (!L.flags.odieGone) odieAI.goTo(back, { then: 'eat' }); });
    return;
  }
  L.flags.odieGone = true;
  L.obj(3);
  try { prop(ctx, 'lymanDoor')?.open?.(); } catch {}
  const room = apos(ctx, 'lymanInside') || apos(ctx, 'lymanRoom', V(4, 3, 9));
  odieAI.flee(room, { then: 'sit_pant' });
}

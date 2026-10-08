import { defineLevel2, V, flat, prop, A, apos, hideHuman } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { LINES } from '../../game/lines.js';

// C2 L8 "Shedding Week": shed on Jon's bed, the sofa, the armchair, then the table → his whole coat comes off.
const T = (k) => LINES[k]?.text;
const SPOTS = [
  { id: 'bed', anchor: 'shedBed', fb: V(1.05, 3.62, 3.2), name: 'bed' },
  { id: 'sofa', anchor: 'shedSofa', fb: V(3.85, 0.5, 2.75), name: 'sofa' },
  { id: 'armchair', anchor: 'shedArmchair', fb: V(4.45, 0.49, 0.95), name: 'armchair' },
  { id: 'table', anchor: 'shedTable', fb: V(4.4, 0.77, 8.8), name: 'table' },
];

export default defineLevel2({
  id: 'c2:8', title: 'Shedding Week',
  objectives: ["Shed on Jon's bed", 'Shed on the sofa', 'Shed on the armchair', 'Shed on the table'],
  hints: ['c2_l08_hint_1', 'c2_l08_hint_2', 'c2_l08_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    hideHuman(L, L.ly);
    SPOTS.forEach((s, i) => L.interact({
      id: 'shed_' + s.id, radius: 0.95, heightTol: 0.8, markerHeight: 0.4,
      get label() { return i === 3 && !L.objDone.slice(0, 3).every(Boolean) ? 'Save the table for last!' : 'Shed!'; },
      isHint: () => i === 3 && !L.objDone.slice(0, 3).every(Boolean),
      pos: () => apos(ctx, s.anchor, s.fb),
      enabled: () => !L.objDone[i] && !L.flags.shedding,
      onInteract: () => {
        if (i === 3 && !L.objDone.slice(0, 3).every(Boolean)) { L.say('c2_l08_hint_3', { force: true }); return; }
        shed(L, i);
      },
    }));
  },
  async intro(L, d) {
    const { ctx } = L;
    const g = ctx.garfield.root.position.clone();
    d.cut(L.shot(g.clone().setY(g.y + 0.35), { dist: 1.8, h: 0.4, prefer: ctx.garfield.root.rotation.y }));
    await d.play(ctx.garfield, 'shed', { once: true, max: 1.6 });
    const pile = prop(ctx, 'furPile');
    try { pile?.setActive?.(true); pile?.drop?.(g.clone().add(V(Math.sin(ctx.garfield.root.rotation.y) * -0.4, 0, Math.cos(ctx.garfield.root.rotation.y) * -0.4))); } catch {}
    d.sfx('poof');
    try { ctx.garfield.setExpression?.('happy'); } catch {}
    await d.say('garfield', 'c2_g_l8_intro', { text: T('c2_g_l8_intro') });
  },
  start(L) {
    const { ctx } = L;
    L.jon.setHome({ type: 'wander' });
    L.jon.wander();
    L.odieAI.place(apos(ctx, 'odieBowl', V(7.35, 0, 9.75)).add(V(0, 0, -0.5)), Math.PI);
    L.odieAI.sit('sit');
  },
  update(L) {
    const { ctx } = L;
    const n = L.next();
    if (n >= 0) L.target((o) => o.copy(apos(ctx, SPOTS[n].anchor, SPOTS[n].fb)), { height: 0.45 });
    if (L.flags.shedding) {
      // hold still while shedding
      ctx.controller.vel?.set?.(0, ctx.controller.vel.y, 0);
    }
  },
  teardown(L) {
    showPlates(L);
    try { prop(L.ctx, 'furPile')?.setActive?.(false); L.ctx.garfield.setBald?.(false); } catch {}
  },
});

async function shed(L, i) {
  const { ctx } = L;
  const s = SPOTS[i];
  L.flags.shedding = true;
  ctx.controller.animHold = true;
  try { ctx.garfield.play?.('shed', { once: true }); } catch {}
  ctx.audio?.sfx?.('poof');
  const decals = prop(ctx, 'shedDecals');
  if (i === 3) { L.flags.shedding = false; ctx.controller.animHold = false; return bald(L); }
  for (let k = 1; k <= 10; k++) { await new Promise((r) => setTimeout(r, 150)); try { decals?.set?.(s.name, k / 10); } catch {} }
  ctx.controller.animHold = false;
  L.flags.shedding = false;
  L.obj(i);
  L.say('c2_g_l8_shed_' + (i + 1), { force: true });
  L.later(4 + Math.random() * 3, () => L.say('c2_j_l8_hair_' + (i + 1), { force: true }));
}

function bald(L) {
  const { ctx, jon } = L;
  L.timers = [];
  L.cut(async (d) => {
    const g = ctx.garfield.root.position.clone();
    d.cut(L.shot(g.clone().setY(g.y + 0.35), { dist: 1.6, h: 0.3, prefer: ctx.garfield.root.rotation.y }));
    for (let k = 0; k < 3; k++) {
      ctx.garfield.play?.('shed', { once: true });
      d.sfx('poof');
      ctx.camera.shake?.(0.05);
      try { prop(ctx, 'shedDecals')?.set?.('table', (k + 1) / 3); } catch {}
      await d.wait(0.7);
    }
    try { prop(ctx, 'furPile')?.setActive?.(true); prop(ctx, 'furPile')?.drop?.(g.clone().add(V(0.25, 0, 0.1))); prop(ctx, 'furPile')?.puff?.(); } catch {}
    try { ctx.garfield.setBald?.(true); ctx.garfield.setExpression?.('shock'); } catch {}
    d.sfx('poof');
    L.obj(3);
    await d.wait(1.0);
    // Jon comes and looks
    jon.setOff(); jon.leave();
    const stand = g.clone().setY(0).add(V(0, 0, -1.1));
    d.place(ctx.jon, stand.clone().add(V(-1.2, 0, -0.6)));
    ctx.jon.play?.('walk');
    await d.walk(ctx.jon, stand, { faceEnd: false });
    await d.face(ctx.jon, g);
    d.cut(L.shot(g.clone().lerp(stand, 0.5).setY(1.0), { dist: 2.4, h: 0.3 }));
    try { ctx.jon.setExpression?.('sad'); } catch {}
    ctx.jon.play?.('sigh');
    await d.say('jon', 'c2_j_l8_bald', { text: T('c2_j_l8_bald') });
    d.cut(L.shot(g.clone().setY(g.y + 0.35), { dist: 1.3, h: 0.2, prefer: Math.atan2(stand.x - g.x, stand.z - g.z) }));
    await d.say('garfield', 'c2_g_l8_bald', { text: T('c2_g_l8_bald') });
  }).then(() => L.win(0.2));
}

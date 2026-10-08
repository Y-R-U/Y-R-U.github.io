import { defineLevel2, V, flat, prop, A, apos, sofaTV, naughtyChase } from './common2.js';
import { sillHelpers } from '../shared.js';
import { tableBox } from '../common.js';
import { LINES } from '../../game/lines.js';

// C2 L2 "Lights Out": scratch Odie off the table → run (10 s) → vase onto Odie from the sill → run again →
// open the under-stair cupboard → scratch the biscuit box → Odie goes in → shut the door.
const T = (k) => LINES[k]?.text;
const vasePos = (ctx) => { const v = prop(ctx, 'vase'); return v?.root ? v.root.getWorldPosition(V()) : apos(ctx, 'vase', V(2.6, 0.95, 0.3)); };
const inCupboard = (p) => p.x > 8.0 && p.z > 0.85 && p.z < 4.75 && p.y < 0.6;

export function hidePlates(L) {
  const { ctx } = L;
  L.flags.hidden = [prop(ctx, 'plate')?.root, prop(ctx, 'pan')?.root].filter(Boolean);
  L.flags.hidden.forEach((o) => (o.visible = false));
}
export function showPlates(L) { (L.flags.hidden || []).forEach((o) => (o.visible = true)); }

export default defineLevel2({
  id: 'c2:2', title: 'Lights Out',
  objectives: ['Scratch Odie off the table', 'Run from Jon and Lyman', 'Knock the vase onto Odie', 'Run from them again',
    'Open the cupboard under the stairs', 'Scratch open the dog biscuits', 'Shut Odie in the cupboard'],
  hints: ['c2_l02_hint_1', 'c2_l02_hint_2', 'c2_l02_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    L.flags.sill = sillHelpers(L);
    // vase (only from the sill)
    ctx.scratch.register({ id: 'vase', radius: 0.3, heightTol: 0.55, getPos: (o) => (o || V()).copy(vasePos(ctx)),
      enabled: () => !L.flags.vaseBroken && ctx.controller.pos.y > 0.45, onHit: () => knockVase(L) });
    // biscuit box (inside the cupboard)
    ctx.scratch.register({ id: 'biscuitBox', radius: 0.35, heightTol: 0.6, getPos: (o) => (o || V()).copy(apos(ctx, 'biscuitBox', V(8.7, 0.15, 3.1))),
      enabled: () => L.objDone[4] && !L.objDone[5], onHit: () => burstBox(L) });
    // the cupboard door: open any time; close only from outside
    const door = () => prop(ctx, 'cupboardDoor');
    L.interact({ id: 'cupboardDoor', radius: 0.9, heightTol: 0.6, markerHeight: 0.9,
      get label() { return door()?.isOpen ? 'Shut the door!' : 'Open the cupboard'; },
      pos: () => apos(ctx, 'cupboardFront', V(7.55, 0, 2.88)),
      enabled: () => !L.won && !L.flags.doorBusy && (!door()?.isOpen || !inCupboard(ctx.controller.pos)) && L.objDone[3],
      onInteract: () => toggleDoor(L) });
  },
  async intro(L, d) {
    const { ctx } = L;
    sofaTV(L);
    const tb = tableBox(ctx), y = tb.topY;
    const pts = [V(tb.min.x + 0.2, y, tb.min.z + 0.2), V(tb.max.x - 0.2, y, tb.min.z + 0.2), V(tb.max.x - 0.2, y, tb.max.z - 0.2), V(tb.min.x + 0.2, y, tb.max.z - 0.2)];
    L.odieAI.place(pts[0]);
    ctx.odie.play?.('gallop_goofy');
    d.cut(L.shot(V((tb.min.x + tb.max.x) / 2, 0.9, (tb.min.z + tb.max.z) / 2), { dist: 3.0, h: 0.9 }));
    ctx.audio?.sfx?.('pant');
    for (let lap = 0; lap < 2; lap++) for (let i = 1; i <= 4; i++) {
      const a = ctx.odie.root.position.clone(), b = pts[i % 4];
      L.odieAI.face(b);
      await d.tween((k) => ctx.odie.root.position.lerpVectors(a, b, k), flat(a, b) / 2.4, (k) => k);
    }
    const gp = ctx.garfield.root.position;
    d.cut(L.shot(gp.clone().setY(0.35), { dist: 1.4, h: 0.2, prefer: ctx.garfield.root.rotation.y }));
    try { ctx.garfield.setExpression?.('smug'); } catch {}
    await d.say('garfield', 'c2_g_l2_intro', { text: T('c2_g_l2_intro') });
  },
  start(L) {
    const { ctx } = L;
    sofaTV(L);
    L.odieAI.place('odieTableEdge');
    L.odieAI.sit('sit_pant');
    L.odieAI.onScratch = () => scratchOdie(L);
    // "always panting"
    try { L.flags.pant = ctx.audio?.sfxLoop?.('pant', { vol: 0.35, pos: L.odie.root.position }); } catch {}
  },
  update(L) {
    const { ctx } = L;
    // inside the cramped cupboard the follow cam can't fit: use the cupboard camera until he's out
    const inside = inCupboard(ctx.controller.pos);
    if (inside !== !!L.flags.cupCam) {
      L.flags.cupCam = inside;
      const a = A(ctx, 'cam_cupboard');
      if (inside && a) ctx.camera.shot({ pos: a.pos.clone(), look: (a.look || a.pos).clone(), fov: a.fov ?? 55 }, { dur: 0.4 });
      else ctx.camera.follow?.({ dur: 0.4 });
    }
    const n = L.next();
    const op = L.odie.root.position;
    if (n === 0) L.target((o) => o.copy(op).setY(op.y + 0.6), { height: 0.3 });
    else if (n === 2) L.target((o) => o.copy(L.flags.sill.isOn() ? vasePos(ctx) : L.flags.sill.pos()), { height: 0.4 });
    else if (n === 4 || n === 6) L.target((o) => o.copy(apos(ctx, 'cupboardFront', V())).setY(0.9), { height: 0.3 });
    else if (n === 5) L.target((o) => o.copy(apos(ctx, 'biscuitBox', V())), { height: 0.35 });
    else L.target(null);
  },
  teardown(L) { try { L.flags.pant?.(0.3); } catch {} showPlates(L); try { prop(L.ctx, 'cupboardDoor')?.reset?.(); prop(L.ctx, 'vase')?.reset?.(); } catch {} },
});

async function scratchOdie(L) {
  const { ctx, odieAI } = L;
  if (L.objDone[0] || L.flags.busy) return;
  if (!L.onTable()) { L.say('g_c2_odie_scratch', { force: true }); return; }
  L.flags.busy = true;
  L.obj(0);
  const tb = tableBox(ctx), op = L.odie.root.position.clone();
  const c = V((tb.min.x + tb.max.x) / 2, 0, (tb.min.z + tb.max.z) / 2);
  const away = V(op.x - c.x, 0, op.z - c.z);
  if (away.lengthSq() < 0.01) away.set(0, 0, -1);
  const land = op.clone().setY(0).addScaledVector(away.normalize(), 0.75);
  ctx.audio?.sfx?.('yip');
  odieAI.noise('o_yip_long');
  odieAI.arc(land, { h: 0.5, dur: 0.6 });
  L.later(0.65, () => {
    ctx.audio?.sfx?.('boing');
    odieAI.run('landHead', async (t) => {
      await t.play('land_head', 2.0, { fallback: 'dizzy' });
      odieAI.noise('o_yip');
      await t.walkTo(apos(ctx, 'sofaFoot', V(3, 0, 2.75)), { speed: 2.4 });
      odieAI.sit('sit_pant');
    });
  });
  await new Promise((r) => L.later(1.6, r));
  await naughtyChase(L);
  L.obj(1);
  L.say('c2_j_l2_telly', { force: true });
  // Odie trots to below the windowsill
  odieAI.goTo(apos(ctx, 'odieSill', V(2.55, 0, 0.78)), { then: 'sit_pant' });
  L.flags.busy = false;
}

async function knockVase(L) {
  const { ctx, odieAI } = L;
  if (L.flags.vaseBroken) return;
  L.flags.vaseBroken = true;
  const vase = prop(ctx, 'vase');
  const odieUnder = L.objDone[1] && !L.objDone[2] && flat(L.odie.root.position, apos(ctx, 'odieSill', V())) < 0.7;
  const head = L.odie.root.position.clone().add(V(0, 0.6, 0));
  try { await Promise.race([vase?.knock?.(odieUnder ? { target: head } : { dir: V(0, 0, 1) }), new Promise((r) => setTimeout(r, 1800))]); } catch {}
  ctx.audio?.sfx?.('crash', { vol: 0.5 });
  if (!odieUnder) {
    L.say('c2_g_l2_vase_miss', { force: true, delay: 0.5 });
    L.later(8, () => { try { vase?.reset?.(); } catch {} L.flags.vaseBroken = false; });
    return;
  }
  L.obj(2);
  odieAI.run('bonked', async (t) => {
    await t.play('hit', 0.6, { fallback: 'dizzy' });
    odieAI.noise('o_yip');
    await t.play('dizzy', 1.0, { fallback: 'idle' });
    await t.walkTo(apos(ctx, 'sofaFoot', V(3, 0, 2.75)), { speed: 2.4 });
    odieAI.sit('sit_pant');
  });
  await new Promise((r) => L.later(1.4, r));
  await naughtyChase(L);
  L.obj(3);
  L.say('c2_j_l2_telly', { force: true });
  L.later(6, () => { try { vase?.reset?.(); } catch {} });
  // Odie waits by the stairs
  const front = apos(ctx, 'cupboardFront', V(7.55, 0, 2.88));
  odieAI.goTo(front.clone().add(V(-0.9, 0, 0.6)), { then: 'sit_pant' });
}

async function toggleDoor(L) {
  const { ctx } = L;
  const door = prop(ctx, 'cupboardDoor');
  L.flags.doorBusy = true;
  ctx.audio?.sfx?.('door');
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  const wasOpen = !!door?.isOpen;
  try { await (wasOpen ? door?.close?.() : door?.open?.()); } catch {}
  L.flags.doorBusy = false;
  if (!wasOpen) { L.obj(4); return; }
  if (L.flags.odieIn) {
    L.obj(6);
    L.odieAI.noise('o_whine_muffled');
    L.say('c2_g_l2_win', { force: true, delay: 0.8 });
    L.win(2.2);
  } else if (L.objDone[5]) L.say('c2_g_l2_shut', { force: true });
}

function burstBox(L) {
  const { ctx, odieAI } = L;
  const box = prop(ctx, 'biscuitBox');
  try { box?.burst?.(); } catch {}
  ctx.audio?.sfx?.('crash', { vol: 0.3 });
  L.obj(5);
  L.say('c2_g_l2_biscuits', { force: true });
  odieAI.noise('o_bark_happy', { delay: 1.2 });
  L.later(1.5, () => {
    const heap = box?.heapPos?.() || apos(ctx, 'biscuitBox', V(8.7, 0, 3.1));
    const tgt = heap.clone().setY(0);
    const run = async () => {
      // wait for the door to be open, then dash in and eat
      odieAI.run('toBiscuits', async (t) => {
        while (!prop(ctx, 'cupboardDoor')?.isOpen) { odieAI.clip('bark', { force: true }); await t.wait(2); }
        await t.walkTo(tgt.clone().add(V(-0.3, 0, 0)), { speed: 2.4 });
        odieAI.face(tgt);
        L.flags.odieIn = true;
        t.loop('eat');
        for (;;) { await t.wait(3); if (Math.random() < 0.5) odieAI.noise('o_pant'); }
      });
    };
    run();
  });
}

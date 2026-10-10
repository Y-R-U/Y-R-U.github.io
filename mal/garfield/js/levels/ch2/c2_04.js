import { defineLevel2, V, flat, prop, A, apos, hideHuman } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { sillHelpers } from '../shared.js';
import { tableBox } from '../common.js';
import { LINES } from '../../game/lines.js';

// C2 L4 "Diet Time": the table sags under Garfield ("Diet time."), the humans leave for work. Open the window,
// scratch Odie at it (he splats on the wall below), then scratch him from the table: out of the window he goes.
const T = (k) => LINES[k]?.text;
const winPos = (ctx) => apos(ctx, 'window', V(3, 1.5, 0));
const splatSpot = (ctx) => { const w = apos(ctx, 'wallBelowWindow', V(3, 0.5, 0.52)); return V(w.x, 0, w.z + 0.22); };

export default defineLevel2({
  id: 'c2:4', title: 'Diet Time', food: 'meatloaf',
  objectives: ['Jump onto the windowsill', 'Open the window', 'Scratch Odie towards the window', 'Scratch Odie from higher up'],
  hints: ['c2_l04_hint_1', 'c2_l04_hint_2', 'c2_l04_hint_3'],
  cast: ['odie', 'lyman'],
  setup(L) {
    const { ctx } = L;
    const sill = sillHelpers(L);
    L.flags.sill = sill;
    L.interact({ id: 'window', label: 'Open the window', radius: 0.95, heightTol: 0.5, pos: () => sill.pos(),
      enabled: () => sill.isOn() && !L.flags.open,
      onInteract: () => {
        L.flags.open = true; L.obj(1);
        try { prop(ctx, 'window')?.open?.(); prop(ctx, 'curtains')?.wave?.(true); } catch {}
        ctx.audio?.sfx?.('wind', { vol: 0.7 });
      } });
    hideHuman(L, L.ly);
  },
  async intro(L, d) {
    const { ctx } = L;
    const { garfield, jon } = ctx;
    L.jon.sitNow();
    const tb = tableBox(ctx), y = tb.topY;
    const mid = V((tb.min.x + tb.max.x) / 2, y, (tb.min.z + tb.max.z) / 2);
    const start = V(tb.min.x + 0.2, y, mid.z);
    d.place(garfield, start, Math.PI / 2);
    d.cut(L.shot(mid.clone().setY(0.9), { dist: 2.8, h: 0.6, prefer: 0 }));
    garfield.play?.('walk');
    await d.tween((k) => garfield.root.position.lerpVectors(start, mid, k), 1.6, (k) => k);
    garfield.play?.('idle');
    const table = prop(ctx, 'table');
    d.sfx('creak');
    const sag = Promise.resolve(table?.warpTo ? table.warpTo(1, 0.7) : null);
    await d.tween((k) => { garfield.root.position.y = y - (y - 0.12) * k; }, 0.7);
    await sag;
    d.sfx('boing');
    ctx.camera.shake?.(0.1);
    try { jon.setExpression?.('shock'); } catch {}
    await d.play(jon, 'eyes_widen', { once: true, max: 1.0 });
    await d.say('jon', 'c2_j_l4_diet', { text: T('c2_j_l4_diet') });
    d.cut(L.shot(mid.clone().setY(0.6), { dist: 2.8, h: 0.9, prefer: 0 }));
    try { garfield.setExpression?.('disgust'); garfield.play?.('seethe'); garfield.setSeethe?.(0.5); } catch {}
    await d.say('garfield', 'c2_g_l4_cranky', { text: T('c2_g_l4_cranky') });
    try { garfield.setSeethe?.(0); } catch {}
    if (table?.warpTo) await d.parallel(table.warpTo(0, 0.6), d.tween((k) => { garfield.root.position.y = 0.12 + (y - 0.12) * k; }, 0.6));
    // off to work
    if (L.jon.seated()) { await d.play(jon, 'stand_up', { once: true, max: 1.0 }); L.jon.leave(); }
    const doorIn = apos(ctx, 'doorInside', V(7.1, 0, 1)), step = apos(ctx, 'doorStep', V(7.1, 0, -0.95));
    const fd = prop(ctx, 'frontDoor');
    const ci = A(ctx, 'cam_frontDoorIn');
    if (ci) d.cut({ pos: ci.pos.clone(), look: (ci.look || doorIn).clone(), fov: ci.fov ?? 55 });
    jon.play?.('walk');
    await d.walk(jon, doorIn, { faceEnd: false });
    // the door opens only once he's there (FEEDBACK1: it used to swing open as he left the table)
    await d.face(jon, step);
    d.sfx('door');
    try { fd?.setLocked?.(false); fd?.open?.(); } catch {}
    await d.wait(0.4);
    jon.play?.('walk_in');
    await d.say('jon', 'c2_j_l4_work', { text: T('c2_j_l4_work') });
    await d.walk(jon, step, { faceEnd: false, nav: false });
    try { fd?.close?.(); } catch {}
    d.sfx('door');
  },
  start(L) {
    const { ctx } = L;
    hideHuman(L, L.jon);
    try { const fd = prop(ctx, 'frontDoor'); fd?.close?.(); fd?.setLocked?.(true); prop(ctx, 'table')?.warp?.(0); } catch {}
    hidePlates(L);
    L.odieAI.place('odieTableSide');
    L.odieAI.face(winPos(ctx));
    L.odieAI.idle('idle_pant');
    L.odieAI.onScratch = () => scratchOdie(L);
  },
  update(L) {
    const { ctx, flags } = L;
    if (flags.sill.isOn()) L.obj(0);
    const n = L.next();
    if (n <= 1) L.target((o) => o.copy(flags.sill.pos()), { height: 0.45 });
    else L.target((o) => o.copy(L.odie.root.position).setY(L.odie.root.position.y + 0.7), { height: 0.3 });
    if (flags.onTableOdie && L.onTable() && !flags.higherSaid) { flags.higherSaid = true; L.say('c2_g_l4_higher', { force: true }); }
  },
  teardown(L) {
    showPlates(L);
    try { prop(L.ctx, 'window')?.close?.(); prop(L.ctx, 'curtains')?.wave?.(false); prop(L.ctx, 'table')?.warp?.(0); } catch {}
  },
});

function scratchOdie(L) {
  const { ctx, odieAI, flags } = L;
  if (flags.flying) return;
  if (!flags.onTableOdie) {
    // floor scratch: he flies at the window and splats on the wall below it
    flags.flying = true;
    const spot = splatSpot(ctx);
    odieAI.noise('o_yip_long');
    odieAI.arc(spot.clone(), { h: 1.0, dur: 1.1 });
    // a quick look at the splat (the window is a room away)
    L.cut(async (d) => {
      d.cut(L.shot(spot.clone().setY(0.6), { dist: 3.0, h: 0.5, prefer: 0 }));
      await d.wait(4.2);
    });
    L.later(1.15, () => {
      ctx.audio?.sfx?.('boing');
      ctx.camera.shake?.(0.08);
      odieAI.run('splat', async (t) => {
        L.odie.root.rotation.y = Math.PI;
        await t.play('stuck_wall', 3.0, { fallback: 'dizzy' });
        odieAI.noise('o_yip');
        if (flags.open) {
          L.obj(2);
          L.say('c2_g_l4_drat', { force: true });
          await t.wait(2.5);
          // up onto the table
          const tb = tableBox(ctx);
          const top = apos(ctx, 'odieTableEdge', V(4.4, tb.topY, 8.45)).setY(tb.topY);
          const near = V(top.x, 0, top.z - 0.7);
          await t.walkTo(near, { speed: 2.4 });
          odieAI.clip('jump_up', { once: true, force: true });
          const from = L.odie.root.position.clone();
          await t.tween((k) => { L.odie.root.position.lerpVectors(from, top, k); L.odie.root.position.y = top.y * k + Math.sin(k * Math.PI) * 0.35; }, 0.45);
          L.odie.root.rotation.y = Math.atan2(winPos(ctx).x - top.x, winPos(ctx).z - top.z);
          flags.onTableOdie = true;
          odieAI.clip('idle_pant', { force: true });
        } else {
          L.say('c2_g_l4_shut', { force: true });
          await t.wait(1.5);
          await t.walkTo(apos(ctx, 'odieTableSide', V(4.4, 0, 7.6)), { speed: 1.2 });
          odieAI.face(winPos(ctx));
          odieAI.clip('idle_pant', { force: true });
        }
        flags.flying = false;
      });
    });
    return;
  }
  if (!L.onTable()) { L.say('c2_g_l4_higher', { force: true }); return; }
  // from the table: out of the window!
  flags.flying = true;
  L.obj(3);
  odieAI.noise('o_yip_long');
  ctx.audio?.sfx?.('yip');
  const w = winPos(ctx), out = apos(ctx, 'outsideWindow', V(3, -0.3, -3.6));
  L.cut(async (d) => {
    d.cut(L.shot(w.clone().setY(1.2), { dist: 3.6, h: 0.3, prefer: 0 }));
    await d.wait(2.4);
  });
  odieAI.run('outTheWindow', async (t) => {
    odieAI.clip('launched', { force: true });
    const from = L.odie.root.position.clone();
    await t.tween((k) => { L.odie.root.position.lerpVectors(from, w.clone().setY(1.2), k); L.odie.root.position.y += Math.sin(k * Math.PI) * 0.6; }, 1.1);
    const f2 = L.odie.root.position.clone();
    await t.tween((k) => { L.odie.root.position.lerpVectors(f2, out, k); L.odie.root.position.y += Math.sin(k * Math.PI) * 0.5; }, 0.8);
    L.odie.root.visible = false;
    L.say('c2_g_l4_win', { force: true });
    L.win(2.2);
  });
}

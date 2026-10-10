import { defineLevel2, V, flat, prop, A, apos, sofaTV } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { insideRoom } from '../l08.js';
import { LINES } from '../../game/lines.js';
import { brawlCloud, clearSpot } from '../../game/dustcloud.js';

// C2 L6 "Spit Happens": Jon's room → scratch the drawer open → take the spit-ball launcher → fire it at Odie →
// the coffee-spill brawl. "Much better."
const T = (k) => LINES[k]?.text;
const HITS = 3;
const drawerPos = (ctx) => apos(ctx, 'breakDrawer', V(4.1, 3.12, 6.1));

export default defineLevel2({
  id: 'c2:6', title: 'Spit Happens',
  objectives: ["Go to Jon's room", "Scratch Jon's drawer open (0/3)", 'Pull out the spit-ball launcher', 'Spit-ball Odie'],
  hints: ['c2_l06_hint_1', 'c2_l06_hint_2', 'c2_l06_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    L.flags.hits = 0;
    const dresser = () => prop(ctx, 'dresser');
    ctx.scratch.register({ id: 'breakDrawer', radius: 0.4, heightTol: 0.6, getPos: (o) => (o || V()).copy(drawerPos(ctx)),
      enabled: () => L.objDone[0] && !L.objDone[1],
      onHit: () => {
        const n = ++L.flags.hits;
        try { dresser()?.breakDrawer?.scratch?.(n); } catch {}
        ctx.audio?.sfx?.(n >= HITS ? 'crack' : 'drawer');
        L.setObjText(1, `Scratch Jon's drawer open (${Math.min(n, HITS)}/${HITS})`);
        if (n >= HITS) {
          try { dresser()?.breakDrawer?.break?.(); } catch {}
          L.obj(1);
          L.say('c2_g_l6_found', { force: true, delay: 0.5 });
        }
      } });
    L.interact({ id: 'launcher', radius: 0.75, heightTol: 0.7, label: 'Pull it out!', pos: () => drawerPos(ctx).setY(drawerPos(ctx).y - 0.2),
      enabled: () => L.objDone[1] && !L.objDone[2],
      onInteract: () => takeLauncher(L) });
    L.interact({ id: 'fire', radius: 5.0, heightTol: 0.7, markerHeight: 0.6,
      get label() { return 'Fire at Odie!'; },
      pos: () => L.odie.root.position.clone(),
      enabled: () => L.objDone[2] && !L.objDone[3] && ctx.controller.pos.y < 1.2 && !L.flags.firing,
      onInteract: () => fire(L) });
  },
  async intro(L, d) {
    const { ctx } = L;
    sofaTV(L, { mug: true });
    holdMug(L);
    L.odieAI.place('sofaFoot'); L.odieAI.sit('sit_pant');
    const gp = ctx.garfield.root.position;
    d.cut(L.shot(gp.clone().setY(0.3), { dist: 1.5, h: 0.2, prefer: ctx.garfield.root.rotation.y }));
    try { ctx.garfield.play?.('sleep'); ctx.garfield.setExpression?.('sleepy'); } catch {}
    await d.say('garfield', 'c2_g_l6_intro', { text: T('c2_g_l6_intro') });
    try { ctx.garfield.play?.('idle'); } catch {}
  },
  start(L) {
    sofaTV(L, { mug: true });
    holdMug(L);
    L.odieAI.place('sofaFoot'); L.odieAI.sit('sit_pant');
  },
  update(L) {
    const { ctx } = L;
    if (!L.objDone[0] && insideRoom(ctx, ctx.controller.pos)) L.obj(0);
    const n = L.next();
    if (n === 0) L.target((o) => o.copy(apos(ctx, 'bedroomDoor', V(6.4, 3, 5.7))).setY(3.6), { height: 0.3 });
    else if (n === 1 || n === 2) L.target((o) => o.copy(drawerPos(ctx)), { height: 0.35 });
    else if (n === 3) L.target((o) => o.copy(L.odie.root.position).setY(0.6), { height: 0.3 });
    // the launcher rides in his mouth
    if (L.flags.launcher) {
      const m = ctx.garfield.sockets?.mouth || ctx.garfield.root;
      m.getWorldPosition(L.flags.launcher.position);
      L.flags.launcher.rotation.y = ctx.garfield.root.rotation.y;
    }
  },
  teardown(L) {
    showPlates(L);
    L.flags.cloud?.kill?.();
    try { L.ctx.lyman?.holdProp?.(null); prop(L.ctx, 'coffeeMug')?.setActive?.(false); prop(L.ctx, 'dresser')?.reset?.(); prop(L.ctx, 'spitballLauncher')?.reset?.(); } catch {}
  },
});

function holdMug(L) {
  const { ctx } = L;
  try { ctx.lyman.holdProp?.('mug'); } catch {}
}

function takeLauncher(L) {
  const { ctx } = L;
  const sl = prop(ctx, 'spitballLauncher');
  try { ctx.garfield.play?.('pull', { once: true }); } catch {}
  ctx.audio?.sfx?.('pop');
  if (sl?.root) {
    sl.setActive?.(true);
    ctx.world.scene.attach(sl.root);
    sl.root.scale.setScalar(0.8);
    L.flags.launcher = sl.root;
  }
  L.obj(2);
}

function fire(L) {
  const { ctx, jon, ly, odieAI } = L;
  L.flags.firing = true;
  const sl = prop(ctx, 'spitballLauncher');
  const from = ctx.garfield.root.position.clone().add(V(0, 0.35, 0));
  const to = L.odie.root.position.clone().add(V(0, 0.55, 0));
  ctx.garfield.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  L.obj(3);
  L.cut(async (d) => {
    ctx.audio?.sfx?.('thwip');
    const shotP = Promise.resolve(sl?.fire?.(from, to)).catch(() => {});
    const sofaMid = apos(ctx, 'sofaFoot', V(3, 0, 2.75)).setY(0.9);
    d.cut(L.shot(sofaMid, { dist: 2.8, h: 0.4 }));
    await Promise.race([shotP, d.wait(0.9)]);
    // Odie hit → yip → Lyman jolts, coffee over Jon
    odieAI.run('hit', async (t) => { await t.play('hit', 0.6, { fallback: 'dizzy' }); t.loop('dizzy'); });
    odieAI.noise('o_yip');
    jon.setOff(); ly.setOff();
    ctx.lyman.play?.('spill');
    try { prop(ctx, 'coffeeMug')?.spill?.(V(-1, 0, 0)); } catch {}
    await d.wait(0.5);
    ctx.jon.play?.('spilled_on');
    try { ctx.jon.setExpression?.('pain'); } catch {}
    await d.say('jon', 'c2_j_l6_coffee', { text: T('c2_j_l6_coffee') });
    // up and at it: one slap, then the three of them vanish into a cartoon dust cloud (D23)
    jon.leave(); ly.leave();
    const jp = ctx.jon.root.position, lp = ctx.lyman.root.position;
    const mid = jp.clone().lerp(lp, 0.5).setY(0);
    const dir = V(1, 0, 0);
    ctx.jon.root.position.copy(mid.clone().addScaledVector(dir, 0.45)); ctx.lyman.root.position.copy(mid.clone().addScaledVector(dir, -0.45));
    ctx.jon.root.rotation.y = -Math.PI / 2; ctx.lyman.root.rotation.y = Math.PI / 2;
    const spot = clearSpot(ctx, mid, 0.85);
    d.cut(L.shot(mid.clone().lerp(spot, 0.5).setY(0.8), { dist: 3.6, h: 0.9 }));
    try { ctx.jon.setExpression?.('angry'); ctx.lyman.setExpression?.('angry'); } catch {}
    ctx.jon.play?.('brawl_slap', { once: true });
    ctx.audio?.sfx?.('whack');
    odieAI.place(mid.clone().add(V(0, 0, 0.9)));
    await d.wait(0.55);
    L.flags.cloud = brawlCloud(ctx, spot, { jon: ctx.jon, lyman: ctx.lyman, odie: L.odie });
    d.cut(L.shot(spot.clone().setY(0.8), { dist: 3.4, h: 0.9 }));
    await d.wait(1.6);
    await d.say('lyman', 'c2_l_l6_brawl', { text: T('c2_l_l6_brawl') });
    await d.say('jon', 'c2_j_l6_brawl', { text: T('c2_j_l6_brawl') });
    await d.wait(0.6);
    const gp = ctx.garfield.root.position;
    d.cut(L.shot(gp.clone().setY(gp.y + 0.35), { dist: 1.4, h: 0.2, prefer: ctx.garfield.root.rotation.y }));
    try { ctx.garfield.setExpression?.('smug'); } catch {}
    await d.say('garfield', 'c2_g_l6_win', { text: T('c2_g_l6_win') });
  }).then(() => L.win(0.2));
}

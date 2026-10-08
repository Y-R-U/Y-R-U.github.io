import { defineLevel2, V, flat, prop, A, apos } from './common2.js';
import { hidePlates, showPlates } from './c2_02.js';
import { LINES } from '../../game/lines.js';

// C2 L3 "Disco Inferno": splash Jon's chicken soup → Lyman struts out in a white disco suit → rub his legs to shed.
const T = (k) => LINES[k]?.text;
const soupPos = (ctx) => { const s = prop(ctx, 'soupBowl'); return s?.root?.visible ? s.root.getWorldPosition(V()) : apos(ctx, 'soupSpot', V(4.4, 0.76, 8.5)); };
const SHED_TIME = 3.0;

export default defineLevel2({
  id: 'c2:3', title: 'Disco Inferno',
  objectives: ["Splash Jon's soup", "Shed all over Lyman's disco suit (0%)"],
  hints: ['c2_l03_hint_1', 'c2_l03_hint_2', 'c2_l03_hint_3'],
  setup(L) {
    const { ctx } = L;
    hidePlates(L);
    try { prop(ctx, 'soupBowl')?.setActive?.(true); } catch {}
    L.flags.fur = 0;
    L.jon.eatClip = 'eat_soup';
    L.interact({ id: 'soup', radius: 0.6, heightTol: 0.45, markerHeight: 0.3, label: 'Splash the soup!',
      pos: () => soupPos(ctx), enabled: () => !L.objDone[0] && L.onTable(), onInteract: () => splash(L) });
    // Lyman starts upstairs in his room
    hideLyman(L);
  },
  async intro(L, d) {
    const { ctx } = L;
    const { garfield } = ctx, odie = ctx.odie;
    const bowl = apos(ctx, 'catBowl', V(6.7, 0, 9.7));
    d.place(garfield, bowl.clone().add(V(-0.35, 0, -0.1)), Math.atan2(0.35, 0.1));
    garfield.play?.('eat');
    odie.root.visible = true;
    L.odieAI.place(garfield.root.position.clone().add(V(-0.9, 0, -0.5)));
    L.odieAI.face(garfield.root.position);
    d.cut(L.shot(garfield.root.position.clone().setY(0.35), { dist: 2.0, h: 0.35, prefer: -Math.PI / 2 }));
    await d.wait(1.2);
    odie.play?.('bark');
    d.sfx('bark');
    ctx.barks.say('o_bark_1', { force: true });
    await d.wait(0.35);
    try { garfield.setExpression?.('shock'); } catch {}
    await d.play(garfield, 'startled_jump', { once: true, max: 1.0 });
    d.face(garfield, odie.root.position.clone());
    try { garfield.setExpression?.('disgust'); } catch {}
    d.sfx('yowl');
    await d.play(garfield, 'meow_loud', { once: true, max: 1.0 });
    L.odieAI.flee(apos(ctx, 'lymanInside', V(7.9, 3, 8.1)), { then: 'sit_pant' });
    await d.wait(1.0);
    await d.say('garfield', 'c2_g_l3_intro', { text: T('c2_g_l3_intro') });
    d.cut(L.shot(soupPos(ctx).setY(1.0), { dist: 2.6, h: 0.6 }));
    L.jon.sitNow();
    await d.say('jon', 'c2_j_l3_soup', { text: T('c2_j_l3_soup') });
  },
  start(L) {
    const { ctx } = L;
    L.jon.setHome({ type: 'sit' });
    if (L.jon.state !== 'sitEat') L.jon.sitNow();
    L.odieAI.place(apos(ctx, 'lymanInside', V(7.9, 3, 8.1)));
    L.odieAI.sit('sit_pant');
  },
  update(L, dt) {
    const { ctx, flags } = L;
    const n = L.next();
    if (n === 0) L.target((o) => o.copy(soupPos(ctx)), { height: 0.35 });
    else if (n === 1 && flags.dancing) L.target((o) => o.copy(ctx.lyman.root.position).setY(0.9), { height: 0.3 });
    else L.target(null);
    // rub against Lyman's legs: fur builds while Garfield is right at his feet
    if (flags.dancing && !L.objDone[1]) {
      const g = ctx.controller.pos, lp = ctx.lyman.root.position;
      if (flat(g, lp) < 0.55 && g.y < lp.y + 0.3) {
        flags.fur = Math.min(1, flags.fur + dt / SHED_TIME);
        try { ctx.lyman.setFur?.(flags.fur); } catch {}
        if ((flags.puffT = (flags.puffT || 0) - dt) <= 0) {
          flags.puffT = 0.6;
          ctx.audio?.sfx?.('poof', { vol: 0.5 });
          try { ctx.garfield.play?.('shed', { once: true }); } catch {}
        }
        const pct = Math.round(flags.fur * 100);
        if (pct !== flags.pct) { flags.pct = pct; L.setObjText(1, `Shed all over Lyman's disco suit (${pct}%)`); }
        if (flags.fur >= 1) {
          L.obj(1);
          L.ly.setOff();
          ctx.lyman.play?.('eyes_widen');
          L.say('c2_l_l3_furry', { force: true });
          L.win(2.4);
        }
      }
    }
  },
  teardown(L) {
    showPlates(L);
    try { prop(L.ctx, 'soupBowl')?.setActive?.(false); prop(L.ctx, 'lymanDoor')?.close?.(); L.ctx.lyman?.setOutfit?.('normal'); L.ctx.lyman?.setFur?.(0); } catch {}
  },
});

function hideLyman(L) {
  const { ctx } = L;
  L.ly.setOff();
  L.ly.place(apos(ctx, 'lymanInside', V(7.9, 3, 8.1)), 0);
  ctx.lyman.root.visible = false;
}

async function splash(L) {
  const { ctx, jon } = L;
  L.obj(0);
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  ctx.audio?.sfx?.('splash');
  try { prop(ctx, 'soupBowl')?.splash?.(); } catch {}
  jon.run('soupSplash', async (t) => {
    t.say('c2_j_l3_splash', { force: true });
    try { ctx.jon.setExpression?.('pain'); } catch {}
    await t.play('spilled_on', 1.4, { fallback: 'sit' });
    await jon.standUp(t);
    const sink = (apos(ctx, 'counter', V(3.6, 0, 10.7))).setY(0);
    sink.z -= 0.75;
    await t.walkTo(sink, { arrive: 0.3 });
    t.say('c2_j_l3_dab', { force: true });
    await t.play('wipe', 10, { loop: true, fallback: 'scratch_head' });
    jon.goHome();
  }, { interruptible: true });
  L.later(3.5, () => discoLyman(L));
}

function discoLyman(L) {
  const { ctx, ly } = L;
  try { prop(ctx, 'lymanDoor')?.open?.(); } catch {}
  ctx.lyman.root.visible = true;
  try { ctx.lyman.setOutfit?.('disco'); ctx.lyman.setFur?.(0); } catch {}
  const spot = apos(ctx, 'livingCentre', V(4.6, 0, 2.7)).setY(0);
  const dance = () => ly.run('disco', async (t) => {
    L.flags.dancing = true;
    for (;;) {
      t.loop('dramatic', { fallback: 'idle' });
      await t.wait(6);
      if (Math.random() < 0.5) t.say('c2_l_l3_dance');
    }
  });
  ly.setHome({ type: 'custom', fn: dance });
  ly.run('strut', async (t) => {
    t.say('c2_l_l3_disco', { force: true });
    await t.walkTo(spot, { arrive: 0.3 });
    L.say('c2_g_l3_suit', { force: true, delay: 0.5 });
    dance();
  });
}

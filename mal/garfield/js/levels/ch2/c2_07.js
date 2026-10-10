import { defineLevel2, V, apos, hideHuman } from './common2.js';
import { createArena } from '../../game/arena.js';
import { LINES } from '../../game/lines.js';

// C2 L7 "Arena Unlocked": the guided arena tutorial vs a very easy Odie. Win or lose, the level is complete (D19).
const T = (k) => LINES[k]?.text;

export default defineLevel2({
  id: 'c2:7', title: 'Arena Unlocked', music: 'arena',
  objectives: [],
  hints: [],
  setup(L) {
    const { ctx } = L;
    hideHuman(L, L.jon); hideHuman(L, L.ly);
    L.showMarker = false;
    L.ar = createArena(L, { tutorial: true, onPoint: (who, ar) => tutorialStep(L, who, ar) });
    L.ar.start();
    ctx.ui?.hud?.set?.({ freePlay: 'Arena · Tutorial' });
  },
  async intro(L, d) {
    const { ctx } = L;
    const g = ctx.garfield.root.position.clone(), o = L.odie.root.position.clone();
    const mid = g.clone().lerp(o, 0.5).setY(g.y + 0.35);
    d.cut(L.shot(mid, { dist: 2.2, h: 0.15, prefer: Math.atan2(o.x - g.x, o.z - g.z) + Math.PI / 2 }));
    try { ctx.garfield.play?.('seethe'); ctx.garfield.setSeethe?.(0.7); } catch {}
    L.odie.play?.('bark');
    d.sfx('bark');
    ctx.ui?.toast?.('Arena Unlocked', { dur: 3.5 });
    ctx.audio?.sfx?.('unlock');
    await d.say('garfield', 'c2_g_l7_intro', { text: T('c2_g_l7_intro') });
    try { ctx.garfield.setSeethe?.(0); ctx.garfield.play?.('idle'); } catch {}
  },
  start(L) {
    const { ctx } = L;
    if (ctx.skip) ctx.ui?.toast?.('Arena Unlocked', { dur: 3 });
    L.tutorial({ id: 'ar1', text: 'Arena! Scratch Odie to score a point (J or click).', touchText: 'Arena! Tap the claw button next to Odie to score a point.', icon: 'claw', keys: ['J'], touch: 'scratch' });
    L.ar.done.then(async (res) => {
      L.obj(0);
      try { ctx.ui?.tutorial?.hide?.(); } catch {}
      L.say(res === 'win' ? 'c2_g_l7_win' : 'c2_g_l7_lose', { force: true });
      L.win(2.0);
    });
  },
  update(L, dt) {
    L.ar.update(dt);
  },
  teardown(L) { L.ar?.dispose(); L.ctx.ui?.hud?.set?.({ freePlay: null }); },
});

function tutorialStep(L, who) {
  const f = L.flags;
  if (who === 'g' && !f.t2) {
    f.t2 = true;
    L.tutorial({ id: 'ar2', text: 'Nice! When Odie crouches and barks he is about to lunge. Jump or run sideways to dodge!', touchText: 'Nice! When Odie crouches and barks he is about to lunge. Jump or run sideways to dodge!', icon: 'jump', keys: ['Space'], touch: 'jump', dur: 8 });
  } else if (who === 'o' && !f.t3) {
    f.t3 = true;
    L.tutorial({ id: 'ar3', text: 'Odie scored! First to 20 wins. Get him!', icon: 'paw', dur: 6 });
  }
}

import { defineLevel2, hideHuman } from './ch2/common2.js';
import { createArena, OPPONENTS } from '../game/arena.js';

// Main-menu Arena (D19, D25): replayable; the opponent comes from the menu's opponent select (no difficulty levels).
export default defineLevel2({
  id: 'arena', title: 'Arena', music: 'arena', objectives: [], hints: [],
  setup(L) {
    const { ctx } = L;
    hideHuman(L, L.jon); hideHuman(L, L.ly);
    L.showMarker = false;
    L.ar = createArena(L, { opponent: ctx.opts?.opponent || 'odie' });
    ctx.ui?.hud?.set?.({ freePlay: 'Arena · vs ' + (OPPONENTS[L.ar.opponent]?.label || 'Odie') });
  },
  start(L) {
    L.ar.start();
    L.ar.done.then(async (res) => {
      L.say(res === 'win' ? 'ar_g_win' : 'ar_g_lose', { force: true });
      await new Promise((r) => setTimeout(r, 1500));
      if (L.dead) return;
      const { ctx } = L;
      if (res === 'win') { const b = ctx.save.data.arenaBest; b[L.ar.opponent] = (b[L.ar.opponent] || 0) + 1; ctx.save.write(); }
      const v = await ctx.ui?.popup?.({ title: res === 'win' ? 'You win!' : 'Odie wins!', text: `${ctx.ui.names.get('garfield')} ${L.ar.g} – ${L.ar.o} Odie`,
        buttons: [{ label: 'Rematch', value: 'again', style: 'primary' }, { label: 'Menu', value: 'menu', style: 'cream' }], cancelValue: 'menu' });
      if (L.dead) return;
      ctx.ui?.emit?.(v === 'again' ? 'restart' : 'exit');
    });
  },
  update(L, dt) { L.ar.update(dt); },
  teardown(L) { L.ar?.dispose(); L.ctx.ui?.hud?.set?.({ freePlay: null }); },
});

import { defineLevel2, hideHuman } from './ch2/common2.js';
import { createArena, DIFFICULTY } from '../game/arena.js';

// Main-menu Arena (D19): replayable, difficulty from the menu popup (Very Easy / Easy; harder 'coming soon').
export default defineLevel2({
  id: 'arena', title: 'Arena', music: 'arena', objectives: [], hints: [],
  setup(L) {
    const { ctx } = L;
    hideHuman(L, L.jon); hideHuman(L, L.ly);
    L.showMarker = false;
    L.ar = createArena(L, { difficulty: ctx.opts?.difficulty || 'easy' });
    ctx.ui?.hud?.set?.({ freePlay: 'Arena · ' + (DIFFICULTY[L.ar.difficulty]?.label || '') });
  },
  start(L) {
    L.ar.start();
    L.ar.done.then(async (res) => {
      L.say(res === 'win' ? 'ar_g_win' : 'ar_g_lose', { force: true });
      await new Promise((r) => setTimeout(r, 1500));
      if (L.dead) return;
      const { ctx } = L;
      if (res === 'win') { const b = ctx.save.data.arenaBest; b[L.ar.difficulty] = (b[L.ar.difficulty] || 0) + 1; ctx.save.write(); }
      const v = await ctx.ui?.popup?.({ title: res === 'win' ? 'You win!' : 'Odie wins!', text: `${ctx.ui.names.get('garfield')} ${L.ar.g} – ${L.ar.o} Odie`,
        buttons: [{ label: 'Rematch', value: 'again', style: 'primary' }, { label: 'Menu', value: 'menu', style: 'cream' }], cancelValue: 'menu' });
      if (L.dead) return;
      ctx.ui?.emit?.(v === 'again' ? 'restart' : 'exit');
    });
  },
  update(L, dt) { L.ar.update(dt); },
  teardown(L) { L.ar?.dispose(); L.ctx.ui?.hud?.set?.({ freePlay: null }); },
});

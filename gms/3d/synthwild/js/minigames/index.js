// Mini-game runner. The shell starts the engine with a temp 'minigame' world, then calls begin(); ui.update drives update().
import { loadGame, recordResult, bestFor } from './registry.js';
import { createArena } from './arena.js';
import { createMgHud } from './hud.js';

let run = null;

export const minigames = {
  get running() { return run; },

  // opts: { variant, level, actions: { replay, menu, quit } }
  async begin(ctx, root, id, opts = {}) {
    const def = await loadGame(id);
    if (!def) throw new Error('No mini-game called ' + id);
    minigames.stop();
    const variant = opts.variant || def.variants?.find((v) => v.default)?.id || def.variants?.[0]?.id || null;
    const key = variant ? `${id}:${variant}` : id;
    const arena = createArena(ctx, def, variant);
    ctx.session.mgSurvival = false;
    ctx.session.mgBreak = false;
    ctx.game?.inv?.clear?.();
    def.build(arena);
    const hud = createMgHud(ctx, root);
    let done = null;
    const mg = {
      ctx, arena, hud, variant, id, key,
      level: opts.level || ctx.settings?.get?.('minigamesBots') || 'normal',
      best: bestFor(key),
      get done() { return !!done; },
      finish(res) {
        if (done) return;
        done = res;
        const info = recordResult(key, res);
        if (ctx.input) { ctx.input.enabled = false; ctx.input.releaseAll?.(); }
        ctx.audio?.sfx(res.won ? 'goal' : 'close');
        setTimeout(() => hud.results(res, opts.actions || {}, info), 700);
      },
    };
    run = { id, key, def, mg, hud, ctx };
    def.start(mg);
    return run;
  },

  update(dt) {
    if (!run) return;
    const { def, mg, hud, ctx } = run;
    if (!mg.done && !ctx.session?.paused) {
      try { def.update(dt); } catch (e) { console.error('[minigame] update', e); }
    }
    hud.update(dt);
  },

  stop() {
    if (!run) return;
    const r = run;
    run = null;
    try { r.def.end(); } catch (e) { console.error('[minigame] end', e); }
    r.hud.dispose();
    if (r.ctx.session) { r.ctx.session.mgSurvival = false; r.ctx.session.mgBreak = false; r.ctx.session.mgCountdown = false; }
  },
};

// 3-2-1-GO helper: call tick(dt) each frame; returns true while still counting.
export function countdown(mg, sec = 3.5) {
  const hud = mg.hud, session = mg.ctx.session || {};
  let t = sec, shown = null;
  session.mgCountdown = true;
  return (dt) => {
    if (t <= -1) { session.mgCountdown = false; return false; }
    t -= dt;
    const n = Math.ceil(t - 0.5);
    if (n !== shown && t > -0.5) { shown = n; hud.big(n > 0 ? String(n) : 'GO!', 0.9); mg.ctx.audio?.sfx(n > 0 ? 'tick' : 'select'); }
    if (t <= 0) { t = -1; session.mgCountdown = false; return false; }
    return true;
  };
}

export default minigames;

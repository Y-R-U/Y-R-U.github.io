// BotSquad: Rival bots (brain + body) for mini-games, taggable through game.mobs.raycast/hit.
import { Bot } from './bot.js';
import { makeGrid } from './path.js';
import { createBotView, TEAMS } from './view.js';

export { TEAMS };
export const NAMES = ['Zip', 'Bolt', 'Nova', 'Pixel', 'Rex', 'Echo', 'Fizz', 'Juno', 'Kit', 'Moss', 'Rune', 'Tiko'];

export function cellSolid(ctx) {
  return (x, y, z) => { const w = ctx.world; return w ? !!w.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2) : false; };
}

export class BotSquad {
  constructor(ctx, { level } = {}) {
    this.ctx = ctx;
    this.level = level || ctx.settings?.get?.('minigamesBots') || 'normal';
    this.grid = makeGrid(cellSolid(ctx));
    this.list = [];
    this.onTag = null;     // (bot, src) => bool: the player hit a bot
    this.nextId = 1;
  }

  add({ name, team, x, y, z, personality, taggable = true }) {
    const bot = new Bot({ id: this.nextId++, name: name || NAMES[(this.nextId - 2) % NAMES.length], team, x, y, z, grid: this.grid, level: this.level, personality });
    const view = typeof document !== 'undefined' && this.ctx.scene ? createBotView(this.ctx, bot, TEAMS[team] || TEAMS.red) : null;
    bot.view = view;
    if (taggable) {
      bot.target = {
        extraTarget: true, bot,
        get hidden() { return bot.hidden; },
        box(out) { out[0] = bot.x - 0.3; out[1] = bot.y; out[2] = bot.z - 0.3; out[3] = bot.x + 0.3; out[4] = bot.y + 1.8; out[5] = bot.z + 0.3; return out; },
        onHit: (dmg, dir, src) => { view?.flash(); return this.onTag ? this.onTag(bot, src, dir) : false; },
      };
      this.ctx.game?.mobs?.extra?.add(bot.target);
    }
    this.list.push(bot);
    return bot;
  }

  remove(bot) {
    bot.view?.dispose();
    if (bot.target) this.ctx.game?.mobs?.extra?.delete(bot.target);
    this.list = this.list.filter((b) => b !== bot);
  }
  clear() { for (const b of [...this.list]) this.remove(b); }

  update(dt) {
    const budget = { n: 3 };
    for (const b of this.list) b.update(dt, budget);
    for (const b of this.list) b.view?.update(dt);
  }

  // Line of sight between two points (eye heights included by the caller).
  los(a, b) {
    const w = this.ctx.world;
    if (!w?.raycast) return true;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
    if (d < 0.3) return true;
    const hit = w.raycast([a.x, a.y, a.z], [dx / d, dy / d, dz / d], d, { plants: false });
    return !hit || hit.dist >= d - 0.3;
  }
}

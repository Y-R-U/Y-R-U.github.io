// Farming: till loam into grow beds, plant Sun Seeds, crops grow 4 stages in light; bio-saplings grow real trees.
// Growth runs on a game clock (play time). Entries in unloaded chunks catch up from their saved `last` time on load.
import { BLOCK, BLOCKS } from '../data/blocks.js';
import { lightAt } from './env.js';

export const STAGE_TIME = 60;      // lit seconds per crop stage (3 stages → ripe in ~3 min of light)
export const SAPLING_TIME = 150;   // lit seconds until a sapling becomes a tree
export const MIN_LIGHT = 9;
const TILLABLE = new Set(['photomoss', 'loam_mesh', 'crystal_turf']);
const SOIL = new Set(['photomoss', 'loam_mesh', 'crystal_turf', 'grow_bed']);
const CATCHUP_MAX = 1800;

const id = (k) => BLOCK[k.toUpperCase()];
const keyOf = (mat) => BLOCKS[mat]?.key || '';
export const cropStage = (mat) => { const m = /^sun_crop_(\d)$/.exec(keyOf(mat)); return m ? +m[1] : -1; };

export class Farm {
  constructor(ctx, game) {
    this.ctx = ctx;
    this.game = game;
    this.map = new Map();       // "x,y,z" -> { kind: 'crop'|'sapling', g: lit seconds, last: clock }
    this.clock = 0;
    this.tickT = 0;
  }

  get world() { return this.ctx.world; }
  key(x, y, z) { return `${x},${y},${z}`; }
  setCell(x, y, z, mat) { this.world.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], mat, 'fill', { flow: false }); }

  // Secondary with a scoop or seeds. Returns true if farming took the action.
  use(hit, held) {
    const w = this.world;
    if (!hit?.sub || !w || !held?.item) return false;
    const [x, y, z] = hit.sub.map((v) => v >> 2);
    const mat = w.getCell(x, y, z);
    const above = w.getCell(x, y + 1, z);
    const it = held.item;
    if (it.tool?.type === 'hoe') {
      if (!TILLABLE.has(keyOf(mat)) || above !== 0 || id('grow_bed') == null) return false;
      this.setCell(x, y, z, id('grow_bed'));
      this.game.inv.wear(this.game.inv.sel, 1, this.ctx.settings?.get?.('toolsNeverBreak'));
      this.ctx.fx?.puff?.({ x: x + 0.5, y: y + 1, z: z + 0.5 }, 0x6b4a35);
      this.ctx.audio?.sfx?.('till');
      this.ctx.bus?.emit?.('farm:till', { pos: [x, y, z] });
      return true;
    }
    if (it.plant) {
      const crop = id(it.plant);
      if (keyOf(mat) !== 'grow_bed' || above !== 0 || crop == null) return false;
      if (!this.game.creative && !this.game.inv.consume(1)) return false;
      this.setCell(x, y + 1, z, crop);
      this.track(x, y + 1, z, 'crop');
      this.ctx.audio?.sfx?.('plant');
      this.ctx.bus?.emit?.('farm:plant', { pos: [x, y + 1, z] });
      return true;
    }
    return false;
  }

  track(x, y, z, kind) { this.map.set(this.key(x, y, z), { kind, g: 0, last: this.clock }); }

  // Saplings and crops placed with the brush (e.g. build mode) get tracked too.
  onPlace(ev) {
    if (!ev?.minSub || !ev.mat) return;
    const k = keyOf(ev.mat);
    const kind = k === 'bio_sapling' ? 'sapling' : cropStage(ev.mat) >= 0 ? 'crop' : null;
    if (!kind) return;
    const lo = ev.minSub.map((v) => v >> 2), hi = ev.maxSub.map((v) => (v - 1) >> 2);
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 256) return;
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      if (this.world.getCell(x, y, z) === ev.mat) { this.track(x, y, z, kind); if (kind === 'crop') this.map.get(this.key(x, y, z)).g = cropStage(ev.mat) * STAGE_TIME; }
    }
  }

  litAt(x, y, z) {
    const L = lightAt(this.world, x + 0.5, y + 0.5, z + 0.5);
    const sky = this.ctx.settings?.get?.('alwaysDay') ? 1 : this.ctx.sky?.daylight01 ?? 1;
    return { block: L.block >= MIN_LIGHT, sky: L.sky * sky >= MIN_LIGHT, skyRaw: L.sky >= MIN_LIGHT };
  }

  update(dt) {
    this.clock += dt;
    if ((this.tickT -= dt) > 0 || !this.world) return;
    this.tickT = 1;
    const w = this.world;
    for (const [k, e] of [...this.map]) {
      const [x, y, z] = k.split(',').map(Number);
      if (w.isChunkLoaded && !w.isChunkLoaded(x >> 4, z >> 4)) continue;
      const mat = w.getCell(x, y, z);
      const stage = cropStage(mat);
      if (e.kind === 'crop' ? stage < 0 : keyOf(mat) !== 'bio_sapling') { this.map.delete(k); continue; }
      if (!SOIL.has(keyOf(w.getCell(x, y - 1, z)))) continue;
      if (e.kind === 'crop' && keyOf(w.getCell(x, y - 1, z)) !== 'grow_bed') continue;
      const elapsed = Math.min(CATCHUP_MAX, this.clock - e.last);
      e.last = this.clock;
      const L = this.litAt(x, y, z);
      // Long gaps (chunk was unloaded) assume a day/night mix for sky-lit plants.
      const rate = L.block ? 1 : elapsed > 5 ? (L.skyRaw ? 0.6 : 0) : L.sky ? 1 : 0;
      e.g += elapsed * rate;
      if (e.kind === 'crop') {
        const want = Math.min(3, Math.floor(e.g / STAGE_TIME));
        if (want > stage) {
          this.setCell(x, y, z, id('sun_crop_' + want));
          if (want === 3) { this.ctx.fx?.spark?.({ x: x + 0.5, y: y + 0.6, z: z + 0.5 }, 0xffd23d, 10); this.ctx.bus?.emit?.('farm:ripe', { pos: [x, y, z] }); }
        }
        if (want >= 3) this.map.delete(k);
      } else if (e.g >= SAPLING_TIME) {
        if (w.growTree?.(x, y, z, undefined, this.ctx.player?.aabb?.() || null) > 0) {
          this.map.delete(k);
          this.ctx.fx?.hologram?.([x * 4 - 8, y * 4, z * 4 - 8], [x * 4 + 12, y * 4 + 32, z * 4 + 12], 0x4fe0a0);
          this.ctx.audio?.sfx?.('treeGrow');
          this.ctx.bus?.emit?.('farm:tree', { pos: [x, y, z] });
        } else e.g = SAPLING_TIME * 0.8;   // no room yet (or the player is in the way): try again a bit later
      }
    }
  }

  serialize() { return { clock: Math.round(this.clock), entries: [...this.map].map(([k, e]) => [k, e.kind, Math.round(e.g), Math.round(e.last)]) }; }
  load(d) {
    this.map.clear();
    this.clock = d?.clock || 0;
    for (const [k, kind, g, last] of d?.entries || []) this.map.set(k, { kind, g, last });
  }
  clear() { this.map.clear(); this.clock = 0; }
}

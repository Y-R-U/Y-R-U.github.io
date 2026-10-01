// ctx.brush: targeting, scale/mode/dims, break & place, volume drag → preview → confirm.
import { SCALES, MODES, placeBox, breakBox, unionBox, clampVolume, boxSize, boxVolume, costUnits,
  aabbOverlapsSubBox, SUBS_PER_BLOCK, payUnits } from './brushmath.js';
import { createOutline, createBrushHud, COLORS } from './brushview.js';
import { BLOCKS, BLOCK } from '../data/blocks.js';
import { breakTime as rulesBreakTime } from '../game/rules.js';
import { boxOf } from './physics.js';
import { createTools, ACTIONS } from './tools.js';

const VOL_CAP = 64 * 4;          // max side of a volume, in subs (64 units)
const PLACE_REPEAT = 0.25, VOL_ANGLE = 0.07, PICK_HOLD = 0.6;

const toHex = c => (c ? ((c[0] * 255) << 16) | ((c[1] * 255) << 8) | (c[2] * 255 | 0) : 0xffffff);
const centre = b => [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 8);

export const brush = {
  scale: 1, mode: 'fill', dims: [1, 1, 1],
  buildMat: BLOCK.LATTICE_PLANKS || 10,
  target: null, mobTarget: null, placeTarget: null, breakTarget: null,
  progress: 0, vol: null, credit: {},
  _ctx: null, _frame: -1, _repeat: 0, _breakKey: '', _pulse: 0,

  init(ctx) {
    this._ctx = ctx;
    const { THREE } = ctx;
    this.outline = createOutline(THREE);
    ctx.scene.add(this.outline.group);
    const root = ctx.uiRoot || document.getElementById('ui-root') || document.body;
    this.hud = createBrushHud(root, {
      cycleScale: () => this.stepScale(+1, true),
      strip: id => {
        if (this.tools.paste) return this.tools.onStrip(id);
        if (id.startsWith('m:')) { if (this.vol) { this.vol.mode = id.slice(2); this._recalcVol(); } }
        else if (id === 'copy') this.tools.copy();
        else if (id === 'ok') this.confirm();
        else this.cancel();
      },
    });
    this.tools = createTools(this, ctx);
    const inp = ctx.input;
    inp?.on?.('scale', d => this.stepScale(d));
    inp?.on?.('mode', d => this.setMode(MODES[(MODES.indexOf(this.mode) + d + MODES.length) % MODES.length]));
    inp?.on?.('confirm', () => { if (this.tools.paste) this.tools.commitPaste(); else if (this.vol?.pending) this.confirm(); });
    inp?.on?.('cancel', () => { if (this.tools.paste) this.tools.endPaste(); else if (this.vol) this.cancel(); });
    for (const a of ACTIONS) inp?.on?.(a.id, () => this.run(a.id));
    this._dir = new THREE.Vector3();
  },

  get build() { return this._ctx?.session?.mode === 'build'; },
  get maxScale() { return this.build ? 8 : 1; },
  get reach() { return this.build ? 12 + this.scale : 6; },
  effDims() { return this.build ? this.dims : [1, 1, 1]; },

  setScale(s) {
    s = SCALES.includes(s) ? s : 1;
    this.scale = Math.min(s, this.maxScale);
    this._changed();
  },
  stepScale(d, wrap = false) {
    const list = SCALES.filter(s => s <= this.maxScale);
    let i = list.indexOf(this.scale) + d;
    if (wrap) i = (i + list.length) % list.length; else i = Math.max(0, Math.min(list.length - 1, i));
    this.setScale(list[i]);
  },
  setMode(m) { if (MODES.includes(m)) { this.mode = m; this._changed(); } },
  setDims(w, h, d) { this.dims = [w, h, d].map(v => Math.max(1, Math.min(16, v | 0))); this._changed(); },
  _changed() { this._ctx?.bus?.emit?.('brush:change', { scale: this.scale, mode: this.mode, dims: this.dims.slice() }); },

  // Wheel/keys/buttons: brush.actions lists them, brush.run(id) runs one.
  get actions() { return ACTIONS.map(a => ({ id: a.id, label: a.label, icon: a.icon, key: a.key, enabled: !!a.enabled(this) })); },
  run(id) { return this.tools?.run(id); },

  held() { return this._ctx?.game?.inv?.held?.() || null; },
  bowHeld() { return this.held()?.item?.tool?.type === 'bow'; },
  // A held non-block item (food, tools, the bow) never places; lane 4 handles eating and bow charging on a held secondary.
  heldBlock() {
    const h = this.held();
    if (h) return h.block || 0;
    return this.build && !this._ctx?.game?.inv ? this.buildMat : 0;
  },

  update(dt) {
    const ctx = this._ctx, inp = ctx.input;
    if (!ctx || this._frame === inp?.frame) return;
    this._frame = inp?.frame;
    const p = ctx.player, w = ctx.world;
    if (this.scale > this.maxScale) this.setScale(this.maxScale);
    const live = w?.raycast && p && !p.dead && !ctx.session?.paused && !ctx.ui?.blocking && !ctx.game?.stations?.isOpen;
    this.hud.setVisible(!!live && inp?.enabled !== false, !!ctx.ui?.hud);
    if (!live) { this.outline.hide(); return; }
    if (!this.build && this.tools.paste) this.tools.endPaste();
    this._pulse = (this._pulse + dt * 2.5) % 1;

    // Aim from the camera (works in third person too); reach is measured from the eye.
    const cam = ctx.camera;
    cam.getWorldDirection(this._dir);
    const o = [cam.position.x, cam.position.y, cam.position.z];
    const extra = p.view === 'third' ? p.camDistance || 0 : 0;
    const maxD = this.reach + extra;
    let hit = w.raycast(o, [this._dir.x, this._dir.y, this._dir.z], maxD);
    if (!hit && this._assist()) hit = this._coneCast(w, o, maxD);
    if (hit && extra) {
      const e = p.eye();
      if (Math.hypot(hit.point[0] - e.x, hit.point[1] - e.y, hit.point[2] - e.z) > this.reach) hit = null;
    }
    const mob = ctx.game?.mobs?.raycast?.(o, [this._dir.x, this._dir.y, this._dir.z], Math.min(maxD, 4 + extra));
    this.mobTarget = mob && (!hit || mob.dist < hit.dist) ? mob : null;
    if (this.mobTarget) hit = null;
    if (hit && !(hit.normal[0] || hit.normal[1] || hit.normal[2])) hit = null;   // aim origin inside a block
    this.target = hit;

    const dims = this.effDims();
    // Plants (blooms, vines) are replaced in place, like Minecraft grass.
    const plant = hit && BLOCKS[hit.mat]?.plant;
    this.placeTarget = hit ? (plant ? breakBox(hit.sub, [0, 1, 0], this.scale, dims) : placeBox(hit.sub, hit.normal, this.scale, dims)) : null;
    this.breakTarget = hit ? breakBox(hit.sub, hit.normal, this.scale, dims) : null;
    const held = inp.held;
    const camDist = hit ? hit.dist : 4;

    if (this.vol) { this._updateVolume(inp); this._drawVolume(camDist); this._readout(false); return; }
    if (this.tools.paste) { this.tools.updatePaste(inp, hit, camDist); this._readout(false); return; }

    if (this.mobTarget && inp.pressed('primary')) {
      const mob = this.mobTarget.mob ?? this.mobTarget;
      if (ctx.game?.attack) ctx.game.attack(mob, { x: this._dir.x, y: 0, z: this._dir.z });
      else ctx.bus?.emit?.('player:attack', { mob, held: this.held() });
      p.swing?.();
    }

    // Using a station (fabricator, oven, cache…) beats placing; the rest of that secondary hold does nothing.
    if (inp.pressed('secondary') && hit && !this.bowHeld() && ctx.game?.useBlock?.(hit)) this._usedHold = true;
    if (this._usedHold && !held.secondary) this._usedHold = false;
    if (!this._usedHold) {
      if (this.build) this._buildActions(inp, dt);
      else this._survivalActions(inp, dt);
    }

    const breaking = held.primary && !held.secondary;
    if (!hit) this.outline.hide();
    else if (breaking) this.outline.show(this.breakTarget, this._col('break'), camDist, this.progress, 0);
    else {
      const ok = this.heldBlock() && this._canPlaceAt(this.placeTarget);
      this.outline.show(ok ? this.placeTarget : this.breakTarget, ok ? this._col("place") : this._col("break"), camDist, this.progress, 0.5 + 0.5 * Math.sin(this._pulse * 6.283));
    }
    this._readout(breaking);
  },

  _col(k) {
    const hc = this._ctx.settings?.get?.('highContrast');
    if (hc) return k === 'place' ? COLORS.hcPlace : COLORS.hcBreak;
    return COLORS[k];
  },
  _readout(breaking) { this.hud.setReadout(this.scale, this.mode, this.effDims(), breaking, this.build); },

  // Build: break acts on press; place acts on release so a press-and-sweep can become a volume instead.
  _buildActions(inp, dt) {
    this.progress = 0;
    if (inp.volumeDrag && !this.vol && this.target) { this._anchor = { hit: this.target }; this._startVolume('touch'); return; }
    if ((inp.pressed('primary') || (inp.pressed('secondary') && this.heldBlock())) && this.target) {
      const kind = inp.pressed('primary') ? 'break' : 'place';
      this._anchor = { kind, hit: this.target, dir: this._dir.clone(), t: 0 };
      if (kind === 'break') this._doBreak(this.breakTarget);
      return;
    }
    const a = this._anchor;
    if (!a) return;
    const holding = a.kind === 'break' ? inp.held.primary : inp.held.secondary;
    if (!holding) {
      if (a.kind === 'place' && !a.picked) this._doPlace(BLOCKS[a.hit.mat]?.plant ? breakBox(a.hit.sub, [0, 1, 0], this.scale, this.effDims())
        : placeBox(a.hit.sub, a.hit.normal, this.scale, this.effDims()), this.mode);
      this._anchor = null;
      return;
    }
    if (a.picked) return;
    if (this.target && this._dir.angleTo(a.dir) > VOL_ANGLE) { this._startVolume(a.kind); return; }
    // Holding place still on a block = eyedropper.
    if (a.kind === 'place' && (a.t += dt) > PICK_HOLD) { a.picked = this.tools.pick(a.hit) || true; this.progress = 0; }
    if (a.kind === 'place') this.progress = Math.min(1, a.t / PICK_HOLD) * 0.6;
  },

  // ---- aim assist (touch) ----
  _assist() {
    const ctx = this._ctx;
    return ctx.input?.device === 'touch' && (ctx.settings?.get?.('aimAssist') ?? true);
  },
  // Near miss: try a small cone of rays and take the closest hit, so a block edge is easy to hit on a phone.
  _coneCast(w, o, maxD) {
    const small = Math.min(innerWidth, innerHeight) < 500;
    const ang = small ? 0.045 : 0.025;
    const d = this._dir, up = this._up || (this._up = d.clone()), side = this._side || (this._side = d.clone());
    side.set(-d.z, 0, d.x).normalize();
    up.crossVectors(side, d).normalize();
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const dx = d.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * ang;
      const dy = d.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * ang;
      const dz = d.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * ang;
      const h = w.raycast(o, [dx, dy, dz], maxD);
      if (h && (!best || h.dist < best.dist)) best = h;
    }
    return best;
  },

  _survivalActions(inp, dt) {
    const t = this.target;
    if (inp.held.primary && t) {
      const box = this.breakTarget, key = box.min.join(',');
      if (key !== this._breakKey) { this._breakKey = key; this.progress = 0; this._mineT = 0; }
      const time = this._breakTime(t.mat);
      if (time === Infinity) { this.progress = 0; return; }
      this._mineT += dt;
      this.progress = Math.min(1, this._mineT / Math.max(time, 1e-3));
      if ((this._sparkT = (this._sparkT || 0) - dt) <= 0) {
        this._sparkT = 0.18;
        this._ctx.fx?.spark?.(t.point, toHex(BLOCKS[t.mat]?.color), 3);
        this._ctx.player?.swing?.();
      }
      if (this._mineT >= time) { this._doBreak(box); this._breakKey = ''; this.progress = 0; }
    } else { this.progress = 0; this._breakKey = ''; this._mineT = 0; }

    if (!this.heldBlock()) return;
    if (inp.pressed('secondary')) { this._repeat = PLACE_REPEAT; if (t) this._doPlace(this.placeTarget, 'fill'); }
    else if (inp.held.secondary && t) {
      this._repeat -= dt;
      if (this._repeat <= 0) { this._repeat = PLACE_REPEAT; this._doPlace(this.placeTarget, 'fill'); }
    }
  },

  _breakTime(mat) {
    const g = this._ctx.game, held = this.held();
    if (typeof g?.breakTime === 'function') return g.breakTime(mat, held, this.scale);
    return rulesBreakTime(BLOCKS, mat, held, { scale: this.scale });
  },

  _canPlaceAt(box) {
    if (!box) return false;
    const p = this._ctx.player;
    if (p && aabbOverlapsSubBox(boxOf({ x: p.pos.x, y: p.pos.y, z: p.pos.z, h: p.h }), box)) return false;
    const mobs = this._ctx.game?.mobs;
    if (mobs?.list && mobs.box) {
      const b = [];
      for (const m of mobs.list) if (!m.dying && aabbOverlapsSubBox(mobs.box(m, b), box)) return false;
    }
    return true;
  },

  _doPlace(box, mode) {
    const ctx = this._ctx;
    if (!box || !this._canPlaceAt(box)) return false;
    const mat = this.heldBlock();
    if (!mat || !BLOCKS[mat]) return false;
    const inv = ctx.game?.inv;
    let units = 0;
    if (!this.build) {
      units = costUnits(box, mode, this.scale * 4);
      if (!this._canAfford(inv, units)) { ctx.bus?.emit?.('player:cantPlace', { reason: 'items' }); return false; }
    }
    const r = this.tools.edit(box.min, box.max, mat, mode, { wall: this.scale * 4 });
    if (!r?.changed) return false;
    if (!this.build) this._pay(inv, Math.min(units, r.changed));
    ctx.bus?.emit?.('block:place', { minSub: box.min.slice(), maxSub: box.max.slice(), mat, mode, changed: r.changed });
    ctx.fx?.hologram?.(box.min, box.max, toHex(BLOCKS[mat].color));
    ctx.player?.swing?.();
    return true;
  },

  _doBreak(box, silent = false) {
    const ctx = this._ctx;
    if (!box) return false;
    const r = this.tools.edit(box.min, box.max, 0, 'fill');
    if (!r?.changed) return false;
    const pos = centre(box);
    ctx.bus?.emit?.('block:break', { minSub: box.min.slice(), maxSub: box.max.slice(), removed: r.removed || [], pos });
    if (!silent) {
      const m = r.removed?.[0]?.mat;
      ctx.fx?.spark?.(pos, toHex(BLOCKS[m]?.color), Math.min(40, 10 + (r.changed >> 3)));
      ctx.player?.swing?.();
    }
    return true;
  },

  // Survival cost: the inventory stores 64ths of an item (lane 4), so fractions go straight through.
  // Fallback for an integer-only inventory: payUnits() with a per-block credit ledger.
  _canAfford(inv, units) {
    if (!inv) return true;
    const h = inv.held?.();
    if (!h?.block) return false;
    if (inv.canAfford) return inv.canAfford(units / SUBS_PER_BLOCK);
    return (this.credit[h.id] || 0) >= units || (h.n || 0) * SUBS_PER_BLOCK >= units;
  },
  _pay(inv, units) {
    if (!inv || !units) return;
    if (inv.canAfford) { inv.consume(units / SUBS_PER_BLOCK); return; }
    const h = inv.held?.();
    const r = payUnits(this.credit[h.id] || 0, units, h.n | 0);
    if (r.ok) { if (r.blocks) inv.consume(r.blocks); this.credit[h.id] = r.credit; }
  },

  // ---- volume ----
  _startVolume(kind) {
    const a = this._anchor || { hit: this.target };
    this.vol = {
      kind: kind === 'touch' ? 'place' : kind, src: kind, anchorHit: a.hit, endHit: this.target,
      mode: kind === 'break' ? 'clear' : this.mode, pending: false, box: null,
    };
    this._anchor = null;
    this._ctx.input.modal = true;
    this._recalcVol();
  },
  _updateVolume(inp) {
    const v = this.vol;
    if (!v.pending) {
      if (this.target) v.endHit = this.target;
      const stillHeld = v.src === 'touch' ? inp.volumeDrag : v.src === 'break' ? inp.held.primary : inp.held.secondary;
      if (!stillHeld) v.pending = true;
      this._recalcVol();
    }
  },
  _recalcVol() {
    const v = this.vol;
    if (!v) return;
    const brk = v.mode === 'clear' || v.mode === 'replace';
    const f = brk ? breakBox : placeBox;
    const a = f(v.anchorHit.sub, v.anchorHit.normal, this.scale);
    const b = f(v.endHit.sub, v.endHit.normal, this.scale);
    v.box = clampVolume(unionBox(a, b), a, VOL_CAP);
    const size = boxSize(v.box).map(s => s / 4);
    this.hud.showVolume(true, size, (v.mode === 'clear' ? boxVolume(v.box) : costUnits(v.box, v.mode, this.scale * 4)) / SUBS_PER_BLOCK, v.mode);
  },
  _drawVolume(camDist) {
    const v = this.vol;
    if (!v?.box) return;
    const ok = v.mode === 'clear' || !this._overlapsPlayer(v.box) || v.mode === 'shell' || v.mode === 'replace';
    const col = !ok ? COLORS.blocked : v.mode === 'clear' ? COLORS.clear : COLORS.volume;
    this.outline.show(v.box, col, Math.max(camDist, 6), 0, this._pulse);
  },
  _overlapsPlayer(box) {
    const p = this._ctx.player;
    return p && aabbOverlapsSubBox(boxOf({ x: p.pos.x, y: p.pos.y, z: p.pos.z, h: p.h }), box);
  },
  confirm() {
    const v = this.vol, ctx = this._ctx;
    if (!v?.box) return this.cancel();
    if (v.mode === 'clear') this._doBreak(v.box);
    else {
      const mat = this.heldBlock();
      const fillsPlayer = (v.mode === 'fill' || v.mode === 'hollow') && this._overlapsPlayer(v.box);
      if (mat && !fillsPlayer) {
        const r = this.tools.edit(v.box.min, v.box.max, mat, v.mode, { wall: this.scale * 4 });
        if (r?.changed) {
          ctx.bus?.emit?.('block:place', { minSub: v.box.min.slice(), maxSub: v.box.max.slice(), mat, mode: v.mode, changed: r.changed, removed: r.removed });
          ctx.fx?.hologram?.(v.box.min, v.box.max, COLORS.volume);
        }
      } else ctx.bus?.emit?.('player:cantPlace', { reason: mat ? 'player' : 'items' });
    }
    this.cancel();
  },
  cancel() {
    this.vol = null;
    this._anchor = null;
    if (this._ctx?.input) this._ctx.input.modal = false;
    this.hud.showVolume(false);
  },
};

export default brush;

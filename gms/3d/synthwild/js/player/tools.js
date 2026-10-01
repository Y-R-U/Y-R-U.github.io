// Build-mode power tools on top of the brush: undo/redo, copy → paste stamp (rotate/mirror, ghost preview), eyedropper.
import { createHistory, readBox, writeBox, rotateY, mirrorX, stampBox, sizeOf, MAX_BOX_SUBS } from './edits.js';
import { BLOCKS } from '../data/blocks.js';
import { COLORS } from './brushview.js';

// Entries lane 5's wheel can show. enabled(brush) tells it whether to grey the entry out.
export const ACTIONS = [
  { id: 'undo', label: 'Undo', icon: 'undo', key: 'Ctrl+Z', enabled: b => b.build && b.tools.history.canUndo },
  { id: 'redo', label: 'Redo', icon: 'redo', key: 'Ctrl+Y', enabled: b => b.build && b.tools.history.canRedo },
  { id: 'copy', label: 'Copy', icon: 'copy', key: 'Ctrl+C', enabled: b => b.build && !!b.vol?.box },
  { id: 'paste', label: 'Paste', icon: 'paste', key: 'Ctrl+V', enabled: b => b.build && !!b.tools.clip },
  { id: 'rotate', label: 'Rotate', icon: 'rotate', key: 'R', enabled: b => b.build && !!b.tools.clip },
  { id: 'mirror', label: 'Mirror', icon: 'mirror', key: 'M', enabled: b => b.build && !!b.tools.clip },
  { id: 'pick', label: 'Pick block', icon: 'pick', key: 'Middle click', enabled: b => !!b.target },
];

const GHOST_MAX = 24000;

export function createTools(brush, ctx) {
  const { THREE } = ctx;
  const history = createHistory();
  const bus = ctx.bus;

  const ghostGeo = new THREE.BoxGeometry(1, 1, 1);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  let ghost = null;
  const ghostGroup = new THREE.Group();
  ghostGroup.name = 'paste-ghost';
  ghostGroup.visible = false;
  ctx.scene.add(ghostGroup);

  function buildGhost(clip) {
    if (ghost) { ghostGroup.remove(ghost); ghost.dispose(); ghost = null; }
    const [sx, sy, sz] = clip.size, d = clip.data;
    const fine = d.length <= GHOST_MAX * 2;
    const step = fine ? 1 : 4;
    const pts = [];
    for (let y = 0; y < sy && pts.length < GHOST_MAX; y += step) for (let z = 0; z < sz; z += step) for (let x = 0; x < sx; x += step) {
      let m = 0;
      for (let k = 0; k < (fine ? 1 : 8) && !m; k++) {
        const xx = Math.min(sx - 1, x + (k & 1) * 2), yy = Math.min(sy - 1, y + ((k >> 1) & 1) * 2), zz = Math.min(sz - 1, z + (k >> 2) * 2);
        m = d[xx + zz * sx + yy * sx * sz];
      }
      if (m && !BLOCKS[m]?.liquid) pts.push(x, y, z, m);
    }
    const n = pts.length / 4;
    if (!n) return;
    ghost = new THREE.InstancedMesh(ghostGeo, ghostMat, n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), s = step / 4;
    for (let i = 0; i < n; i++) {
      const [x, y, z, mat] = pts.slice(i * 4, i * 4 + 4);
      m4.makeScale(s * 0.96, s * 0.96, s * 0.96).setPosition((x + step / 2) / 4, (y + step / 2) / 4, (z + step / 2) / 4);
      ghost.setMatrixAt(i, m4);
      const col = BLOCKS[mat]?.color || [1, 1, 1];
      ghost.setColorAt(i, c.setRGB(col[0], col[1], col[2]));
    }
    ghost.renderOrder = 6;
    ghost.frustumCulled = false;
    ghostGroup.add(ghost);
  }

  const T = {
    history, clip: null, paste: null,

    // Wraps every build-mode world edit so it can be undone.
    edit(min, max, mat, mode, opts) {
      if (brush.build) {
        if (!history.record(ctx.world, min, max)) bus?.emit?.('brush:notUndoable', { size: sizeOf(min, max) });
      }
      return ctx.world.setBox(min, max, mat, mode, opts);
    },

    run(id) {
      if (id === 'pick') return T.pick(brush.target);
      if (!brush.build) return false;
      if (id === 'undo' || id === 'redo') {
        const e = id === 'undo' ? history.undo(ctx.world) : history.redo(ctx.world);
        if (e) { ctx.fx?.hologram?.(e.min, e.max, id === 'undo' ? 0xffd34d : 0x7dff9a); bus?.emit?.('brush:' + id, { minSub: e.min, maxSub: e.max }); }
        return !!e;
      }
      if (id === 'copy') return T.copy();
      if (id === 'paste') return T.startPaste();
      if (id === 'rotate' || id === 'mirror') return T.transform(id);
      return false;
    },

    copy(box = brush.vol?.box) {
      if (!box) return false;
      const size = sizeOf(box.min, box.max);
      if (size[0] * size[1] * size[2] > MAX_BOX_SUBS) { bus?.emit?.('brush:notUndoable', { size }); return false; }
      T.clip = { size, data: readBox(ctx.world, box.min, box.max) };
      ctx.fx?.hologram?.(box.min, box.max, 0x7dd8ff);
      bus?.emit?.('brush:copy', { size });
      brush.cancel();
      T.startPaste();
      return true;
    },

    startPaste() {
      if (!T.clip) return false;
      brush.cancel();
      T.paste = { box: null };
      buildGhost(T.clip);
      ctx.input.modal = true;
      T.showStrip();
      return true;
    },
    endPaste() {
      T.paste = null;
      ghostGroup.visible = false;
      ctx.input.modal = false;
      brush.hud.showStrip(null);
    },

    transform(kind) {
      if (!T.clip) return false;
      T.clip = kind === 'rotate' ? rotateY(T.clip.data, T.clip.size) : mirrorX(T.clip.data, T.clip.size);
      if (T.paste) { buildGhost(T.clip); T.showStrip(); }
      return true;
    },

    showStrip() {
      const s = T.clip.size.map(v => v / 4);
      brush.hud.showStrip(`${s.join('×')}`, [
        { id: 'rotate', label: '⟳ Rotate' }, { id: 'mirror', label: '⇋ Mirror' },
        { id: 'ok', label: '✓ Stamp', cls: 'ok' }, { id: 'no', label: '✕', cls: 'no' },
      ]);
    },
    onStrip(id) {
      if (id === 'ok') T.commitPaste();
      else if (id === 'no') T.endPaste();
      else T.transform(id);
    },

    commitPaste() {
      const p = T.paste, clip = T.clip;
      if (!p?.box || !clip) return false;
      if (brush._overlapsPlayer(p.box)) { bus?.emit?.('player:cantPlace', { reason: 'player' }); return false; }
      if (!history.record(ctx.world, p.box.min, p.box.max)) bus?.emit?.('brush:notUndoable', { size: clip.size });
      const r = writeBox(ctx.world, p.box.min, p.box.max, clip.data, { keepAir: true });
      ctx.fx?.hologram?.(p.box.min, p.box.max, COLORS.volume);
      bus?.emit?.('block:place', { minSub: p.box.min.slice(), maxSub: p.box.max.slice(), mat: 0, mode: 'stamp', changed: r?.changed || 0 });
      ctx.player?.swing?.();
      return true;
    },

    // Called by brush.update while pasting; the place button stamps (repeatable), break does nothing.
    updatePaste(inp, hit, camDist) {
      const p = T.paste;
      p.box = hit ? stampBox(hit.sub, hit.normal, T.clip.size, brush.scale * 4) : null;
      if (!p.box) { ghostGroup.visible = false; brush.outline.hide(); return; }
      ghostGroup.visible = !!ghost;
      ghostGroup.position.set(p.box.min[0] / 4, p.box.min[1] / 4, p.box.min[2] / 4);
      const blocked = brush._overlapsPlayer(p.box);
      brush.outline.show(p.box, blocked ? COLORS.blocked : COLORS.volume, Math.max(camDist, 6), 0, 0.5);
      if (inp.pressed('secondary')) T.commitPaste();
    },

    // Eyedropper: build mode puts the block in the held slot; survival selects a hotbar slot that has it.
    pick(hit) {
      const mat = hit?.mat;
      if (!mat || !BLOCKS[mat] || BLOCKS[mat].liquid) return false;
      const inv = ctx.game?.inv;
      if (!inv) { brush.buildMat = mat; return true; }
      const slot = inv.slots.slice(0, 9).findIndex(s => s && s.id === mat);
      if (slot >= 0) inv.select(slot);
      else if (brush.build && inv.setSlot) inv.setSlot(inv.sel, mat, 64);
      else { bus?.emit?.('brush:pick', { mat, found: false }); return false; }
      bus?.emit?.('brush:pick', { mat, found: true });
      ctx.fx?.hologram?.(brush.breakTarget?.min || hit.sub, brush.breakTarget?.max || hit.sub.map(v => v + 1), 0xffffff);
      return true;
    },
  };
  return T;
}

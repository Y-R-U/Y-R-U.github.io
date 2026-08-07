// The in-play fleet layout editor — the panel the own-grid box opens (D33).
//
// New file. It is not `showPlace()`: that is a tap-to-place tray for a fleet that is not on the
// board yet, and this is a drag editor for a fleet that already is. They share the geometry
// (`scatterFleet`, `freeAt`, `cellsOf` in setup.js) and nothing else.
//
// Ships are absolutely positioned in percent inside a CSS-grid board, so the whole thing rescales
// with the viewport and a drag is arithmetic on cell fractions rather than on pixels.

import { scatterFleet, freeAt, cellsOf } from './setup.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const copy = ships => ships.map(s => ({ ...s }));

// Overlap is illegal and blocks Save. Touching is legal under the sim's rules — Aaron asked to see
// it, so it is a note, never a block.
function analyse(ships, w, h) {
  const cells = ships.map(cellsOf);
  const bad = new Set();
  const touch = new Set();
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      let over = false, near = false;
      for (const a of cells[i]) {
        for (const b of cells[j]) {
          if (a.r === b.r && a.c === b.c) over = true;
          else if (Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1) near = true;
        }
      }
      if (over) { bad.add(i); bad.add(j); }
      else if (near) { touch.add(i); touch.add(j); }
    }
  }
  const off = new Set();
  ships.forEach((s, i) => {
    for (const { r, c } of cells[i]) if (r < 0 || c < 0 || r >= h || c >= w) off.add(i);
  });
  return { bad, touch, off };
}

export function buildLayoutPanel(mount) {
  const root = document.createElement('div');
  root.className = 'screen screen-layout';
  root.hidden = true;
  mount.appendChild(root);

  let st = null;

  const q = s => root.querySelector(s);

  function close(reason) {
    if (!st) return;
    const done = st.onClose;
    st = null;
    drag = null;
    root.hidden = true;
    root.innerHTML = '';
    done?.(reason);
  }

  function open(opts) {
    st = {
      w: opts.w, h: opts.h, fleet: [...opts.fleet],
      ships: copy(opts.ships),
      grid: opts.grid || null,        // the sim's own board: what the enemy has resolved on you
      undo: [],
      sel: -1,
      editable: !!opts.editable,
      reason: opts.reason || '',
      onSave: opts.onSave,
      onClose: opts.onClose,
    };
    render();
    root.hidden = false;
  }

  function render() {
    const ro = !st.editable;
    root.innerHTML = `
      <div class="lay${ro ? ' ro' : ''}">
        <div class="lay-head">
          <h1>Your fleet</h1>
          <p class="lay-note">${ro ? st.reason : 'Drag a ship to move it. Tap it to rotate.'}</p>
        </div>
        <div class="lay-wrap">
          <div class="lay-grid" data-grid>
            <div class="lay-cells" data-cells></div>
            <div class="lay-ships" data-ships></div>
          </div>
        </div>
        <p class="lay-status" data-status></p>
        <div class="lay-acts">
          ${ro ? '' : `
            <button data-act="shuffle">Shuffle</button>
            <button data-act="undo" disabled>Undo</button>`}
          <button class="link" data-act="cancel">${ro ? 'Close' : 'Cancel'}</button>
          ${ro ? '' : '<button class="big" data-act="save">Save changes</button>'}
        </div>
      </div>`;

    const grid = q('[data-grid]');
    grid.style.setProperty('--cols', st.w);
    grid.style.setProperty('--rows', st.h);
    const MARK = ['', 'miss', 'hit', 'sunk'];
    q('[data-cells]').innerHTML = Array.from({ length: st.w * st.h },
      (_, i) => `<i class="${MARK[st.grid?.[i] ?? 0] || ''}"></i>`).join('');
    q('[data-act="cancel"]').onclick = () => cancel();
    if (!ro) {
      q('[data-act="shuffle"]').onclick = () => mutate(() => { st.ships = shuffled(); st.sel = -1; });
      q('[data-act="undo"]').onclick = () => undo();
      q('[data-act="save"]').onclick = () => save();
    }
    paint();
  }

  const shuffled = () => scatterFleet(st.w, st.h, st.fleet)
    .map((p, i) => ({ ...st.ships[i], r: p.r, c: p.c, dir: p.dir }));

  function push(snapshot) {
    st.undo.push(snapshot);
    if (st.undo.length > 40) st.undo.shift();
  }

  function mutate(fn) {
    push(copy(st.ships));
    fn();
    paint();
  }

  function undo() {
    if (!st.undo.length) return;
    st.ships = st.undo.pop();
    st.sel = -1;
    paint();
  }

  function cancel() { close('cancel'); }

  function save() {
    const { bad, off } = analyse(st.ships, st.w, st.h);
    if (bad.size || off.size) return;
    st.onSave?.(st.ships.map(s => ({ r: s.r, c: s.c, dir: s.dir, len: s.len })));
    close('save');
  }

  // ── painting ──────────────────────────────────────────────────────────────────────────────

  const LETTER = c => String.fromCharCode(65 + c);

  function paint() {
    const host = q('[data-ships]');
    const { bad, touch, off } = analyse(st.ships, st.w, st.h);
    host.innerHTML = st.ships.map((s, i) => {
      const cls = ['lay-ship', s.dir === 'h' ? 'h' : 'v'];
      if (bad.has(i) || off.has(i)) cls.push('bad');
      else if (touch.has(i) && st.editable) cls.push('touch');
      if (i === st.sel) cls.push('sel');
      if (drag && drag.i === i) cls.push('held');
      return `<div class="${cls.join(' ')}" data-ship="${i}" role="button" tabindex="${st.editable ? 0 : -1}"
        aria-label="Ship of ${s.len}, ${LETTER(s.c)}${s.r + 1}, ${s.dir === 'h' ? 'across' : 'down'}"
        style="left:${(s.c / st.w) * 100}%;top:${(s.r / st.h) * 100}%;
               width:${((s.dir === 'h' ? s.len : 1) / st.w) * 100}%;
               height:${((s.dir === 'h' ? 1 : s.len) / st.h) * 100}%"><b>${s.len}</b></div>`;
    }).join('');

    if (st.editable) {
      host.querySelectorAll('[data-ship]').forEach(el => {
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          const i = +el.dataset.ship;
          if (st.sel === i) mutate(() => rotate(i)); else { st.sel = i; paint(); }
        });
      });
      if (st.sel >= 0) addRotate(host, st.sel);
    }

    const bar = q('[data-status]');
    bar.className = 'lay-status';
    if (!st.editable) {
      // The layout is fixed, so what is worth saying here is the damage, not advice.
      let hit = 0, miss = 0;
      for (const x of st.grid || []) { if (x === 2 || x === 3) hit++; else if (x === 1) miss++; }
      const sunk = st.ships.filter((s, i) => cellsOf(s).every(({ r, c }) => st.grid?.[r * st.w + c] === 3)).length;
      bar.textContent = hit || miss
        ? `${hit} cell${hit === 1 ? '' : 's'} hit · ${miss} into open water · ${sunk} lost`
        : '';
    } else if (bad.size || off.size) {
      bar.textContent = off.size ? 'A ship is off the board.' : 'Two ships are on the same water — move one.';
      bar.classList.add('bad');
    } else if (touch.size) {
      bar.textContent = 'Ships are touching. That is allowed, and it makes them easier to find.';
      bar.classList.add('warn');
    } else {
      bar.textContent = 'Shuffle deals a fresh fleet. Cancel puts back what you came in with.';
    }
    const saveBtn = q('[data-act="save"]');
    if (saveBtn) saveBtn.disabled = !!(bad.size || off.size);
    const undoBtn = q('[data-act="undo"]');
    if (undoBtn) undoBtn.disabled = !st.undo.length;
  }

  // The rotate control lives at the ship's far end — the one place on a phone that a thumb holding
  // the ship is not already covering.
  function addRotate(host, i) {
    const s = st.ships[i];
    const b = document.createElement('button');
    b.className = 'lay-rot';
    b.dataset.rot = '1';
    b.setAttribute('aria-label', `Turn the ship of ${s.len}`);
    b.textContent = '⟳';
    const cx = s.dir === 'h' ? s.c + s.len : s.c + 0.5;
    const cy = s.dir === 'h' ? s.r + 0.5 : s.r + s.len;
    b.style.left = `${(clamp(cx, 0.3, st.w - 0.3) / st.w) * 100}%`;
    b.style.top = `${(clamp(cy, 0.3, st.h - 0.3) / st.h) * 100}%`;
    b.onclick = e => { e.stopPropagation(); mutate(() => rotate(i)); };
    b.addEventListener('pointerdown', e => e.stopPropagation());
    host.appendChild(b);
  }

  // Turned about her own anchor. If that runs her off the board she is walked back along the new
  // axis until she fits; landing on another ship is left to show as a conflict, exactly as a drag
  // that lands on one does.
  function rotate(i) {
    const s = st.ships[i];
    const dir = s.dir === 'h' ? 'v' : 'h';
    const room = dir === 'h' ? st.w : st.h;
    if (s.len > room) { flash(); return; }
    s.dir = dir;
    if (dir === 'h') s.c = clamp(s.c, 0, st.w - s.len);
    else s.r = clamp(s.r, 0, st.h - s.len);
    st.sel = i;
  }

  function flash() {
    const g = q('[data-grid]');
    g.classList.remove('nope');
    void g.offsetWidth;
    g.classList.add('nope');
  }

  // ── dragging ──────────────────────────────────────────────────────────────────────────────

  let drag = null;

  function onDown(e) {
    if (!st?.editable) return;
    const el = e.currentTarget;
    const i = +el.dataset.ship;
    const grid = q('[data-grid]');
    const box = grid.getBoundingClientRect();
    const cw = box.width / st.w;
    const ch = box.height / st.h;
    const s = st.ships[i];
    drag = {
      i, moved: false, box, cw, ch,
      // where in the ship the finger landed, in cells, so she does not jump under the thumb
      gc: (e.clientX - box.left) / cw - s.c,
      gr: (e.clientY - box.top) / ch - s.r,
      from: copy(st.ships),
      x: e.clientX, y: e.clientY,
    };
    // captured on the GRID, not on the ship: paint() rewrites the ship elements on every cell the
    // drag crosses, and a capture on one of those dies with it halfway through the gesture
    grid.setPointerCapture?.(e.pointerId);
    el.classList.add('held');
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (!drag.moved) { drag.moved = true; push(drag.from); }
    const s = st.ships[drag.i];
    const len = s.dir === 'h' ? s.len : 1;
    const tall = s.dir === 'h' ? 1 : s.len;
    const c = clamp(Math.round((e.clientX - drag.box.left) / drag.cw - drag.gc), 0, st.w - len);
    const r = clamp(Math.round((e.clientY - drag.box.top) / drag.ch - drag.gr), 0, st.h - tall);
    if (r === s.r && c === s.c) return;
    s.r = r; s.c = c;
    st.sel = drag.i;
    paint();
  }

  function onUp() {
    if (!drag) return;
    const { i, moved } = drag;
    drag = null;
    if (!st) return;
    // a tap on the ship already selected is the rotate — Aaron's "tap again to rotate"
    if (!moved && st.sel === i) mutate(() => rotate(i));
    else { st.sel = i; paint(); }
  }

  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  return {
    root,
    open,
    close: () => close('closed'),
    isOpen: () => !!st,
  };
}

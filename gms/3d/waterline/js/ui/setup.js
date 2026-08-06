// Title, custom-game builder, fleet placement — C7 owns this file.
//
// D7: the player places their own fleet, with auto-place as the prominent default. So the title
// screen's big button starts a match in one tap with an auto-placed fleet, and the line under it
// goes to the placement screen. Neither is buried in a settings menu.
//
// The custom builder asks `fleetLegal(w, h, lengths)` on every keystroke rather than on submit —
// the sim exports it precisely so a player is told their fleet will not fit before they commit.

import * as sim from '../sim/index.js';
import { MODES, BOARD } from '../config.js';
import { register } from './flow.js';

const TIERS = sim.TIER_NAMES;

// Stepping the grid used to leave the builder in a state that could not be started: 6×6 with the
// classic fleet is over the occupancy cap, 16×16 with it is under the minimum, and both arrive by
// tapping one button. So the fleet follows the grid — drop the smallest ship while it is too full,
// add one while it is too empty. Ships the player added by hand are the last to go.
function fitFleet(w, h, wanted) {
  const max = Math.min(w, h);
  let fleet = wanted.filter(l => l <= max).sort((a, z) => z - a);
  for (let i = 0; i < 40 && sim.fleetLegal(w, h, fleet); i++) {
    const cells = fleet.reduce((a, b) => a + b, 0);
    if (cells / (w * h) > BOARD.occupancy || fleet.length > BOARD.maxShips) fleet.pop();
    else if (fleet.length < BOARD.maxShips) fleet = [...fleet, Math.max(2, Math.min(max, fleet[0] ?? max))].sort((a, z) => z - a);
    else break;
    if (!fleet.length) return [max];
  }
  return fleet;
}

export function buildSetup(mount, opts = {}) {
  const root = document.createElement('div');
  root.className = 'screen screen-setup';
  root.hidden = true;
  mount.appendChild(root);

  let handlers = { onStart: opts.onStart };
  let cfg = { ...MODES.classic, mode: 'classic' };
  let placing = null;

  const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const show = node => { root.innerHTML = ''; root.appendChild(node); root.hidden = false; };

  // ── title ───────────────────────────────────────────────────────────────────────────────────

  function showTitle({ ladder, stats, multiplayer, resume }) {
    root.className = 'screen screen-setup screen-title';
    const rung = ladder?.rung || 1;
    // The resume sits above Battle because it is what the player was doing, and it says where the
    // match stands so that "carry on" is a decision and not a shrug.
    const resumeHtml = resume ? `
          <button class="big" data-go="resume">Carry on</button>
          <div class="resume-line">
            <span>${resume.name} · ${resume.turns} shot${resume.turns === 1 ? '' : 's'} in ·
              you ${resume.yours}/${resume.fleet}, them ${resume.theirs}/${resume.fleet}</span>
            <button class="link" data-go="discard">Discard</button>
          </div>` : '';
    const node = el(`
      <div class="sheet">
        <div class="brand"><h1>WATERLINE</h1><p>Naval gunnery on a plotting table</p></div>
        <div class="menu">
          ${resumeHtml}
          <button class="${resume ? '' : 'big'}" data-go="quick">${resume ? '<b>New battle</b><s>Classic 10×10</s>' : 'Battle'}</button>
          <button class="link" data-go="place">Place your own fleet</button>
          <button data-go="tournament">
            <b>Tournament</b>
            <s>${ladder?.complete ? 'Complete · ' : ''}Rung ${rung} · ${sim.rungConfig(rung).name}</s>
          </button>
          <button data-go="custom"><b>Custom game</b><s>Your grid, your fleet</s></button>
          <button data-go="mp" class="off" ${multiplayer.available ? '' : 'aria-disabled="true"'}>
            <b>Multiplayer</b><s>Not in this build</s>
          </button>
        </div>
        <div class="foot">
          <button class="link" data-go="settings">Settings</button>
          ${stats?.games ? `<span>${stats.wins || 0} won · ${stats.losses || 0} lost</span>` : ''}
        </div>
      </div>`);
    node.querySelector('[data-go="resume"]')?.addEventListener('click', () => handlers.onResume?.());
    node.querySelector('[data-go="discard"]')?.addEventListener('click', () => handlers.onDiscard?.());
    node.querySelector('[data-go="quick"]').onclick = () => handlers.onQuick?.(false);
    node.querySelector('[data-go="place"]').onclick = () => handlers.onQuick?.(true);
    node.querySelector('[data-go="tournament"]').onclick = () => handlers.onTournament?.();
    node.querySelector('[data-go="custom"]').onclick = () => handlers.onCustom?.();
    node.querySelector('[data-go="mp"]').onclick = () => handlers.onMultiplayer?.();
    node.querySelector('[data-go="settings"]').onclick = () => handlers.onSettings?.();
    show(node);
  }

  // ── custom builder ──────────────────────────────────────────────────────────────────────────

  function showCustom(start) {
    root.className = 'screen screen-setup screen-custom';
    cfg = { mode: 'custom', w: start.w, h: start.h, fleet: fitFleet(start.w, start.h, start.fleet), tier: start.tier ?? 2, manual: !!start.manual };
    const node = el(`
      <div class="sheet wide">
        <h1>Custom game</h1>
        <div class="row">
          <label>Grid</label>
          <div class="stepper"><button data-d="w-">−</button><b data-w></b><span>wide</span><button data-d="w+">+</button></div>
          <div class="stepper"><button data-d="h-">−</button><b data-h></b><span>tall</span><button data-d="h+">+</button></div>
        </div>
        <div class="row">
          <label>Fleet</label>
          <div class="ships" data-ships></div>
        </div>
        <div class="row">
          <label>Add</label>
          <div class="lengths" data-lengths></div>
        </div>
        <div class="row">
          <label>Opponent</label>
          <div class="tiers" data-tiers></div>
        </div>
        <div class="row">
          <label>Your fleet</label>
          <div class="tiers" data-place>
            <button data-p="auto">Auto-place</button>
            <button data-p="manual">Place it myself</button>
          </div>
        </div>
        <p class="why" data-why></p>
        <div class="actions">
          <button class="link" data-back>Back</button>
          <button class="big" data-start disabled>Start</button>
        </div>
      </div>`);
    show(node);

    const q = s => node.querySelector(s);
    node.querySelectorAll('[data-d]').forEach(b => {
      b.onclick = () => {
        const [k, dir] = [b.dataset.d[0], b.dataset.d[1]];
        const next = cfg[k] + (dir === '+' ? 1 : -1);
        cfg[k] = Math.max(BOARD.min, Math.min(BOARD.max, next));
        cfg.fleet = fitFleet(cfg.w, cfg.h, cfg.fleet);
        paint();
      };
    });
    node.querySelectorAll('[data-p]').forEach(b => {
      b.onclick = () => { cfg.manual = b.dataset.p === 'manual'; paint(); };
    });
    q('[data-back]').onclick = () => handlers.onBack?.();
    q('[data-start]').onclick = () => handlers.onCustomStart?.(cfg, cfg.manual);

    function paint() {
      q('[data-w]').textContent = cfg.w;
      q('[data-h]').textContent = cfg.h;
      const max = Math.min(cfg.w, cfg.h);
      q('[data-ships]').innerHTML = cfg.fleet.length
        ? cfg.fleet.map((l, i) => `<button data-rm="${i}"><i>${'▪'.repeat(l)}</i><u>${l}</u></button>`).join('')
        : '<em>No ships</em>';
      q('[data-ships]').querySelectorAll('[data-rm]').forEach(b => {
        b.onclick = () => { cfg.fleet.splice(+b.dataset.rm, 1); paint(); };
      });
      q('[data-lengths]').innerHTML = Array.from({ length: max }, (_, i) => i + 1)
        .map(l => `<button data-add="${l}">${l}</button>`).join('');
      q('[data-lengths]').querySelectorAll('[data-add]').forEach(b => {
        b.onclick = () => {
          cfg.fleet = [...cfg.fleet, +b.dataset.add].sort((a, z) => z - a);
          paint();
        };
      });
      q('[data-tiers]').innerHTML = TIERS.map((t, i) =>
        `<button data-tier="${i}" class="${i === cfg.tier ? 'on' : ''}">${t}</button>`).join('');
      q('[data-tiers]').querySelectorAll('[data-tier]').forEach(b => {
        b.onclick = () => { cfg.tier = +b.dataset.tier; paint(); };
      });
      node.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('on', (b.dataset.p === 'manual') === !!cfg.manual));

      // The live legality check. `fleetLegal` is a constructive proof (§3.1), so a null here means a
      // legal placement provably exists — not that one probably does.
      const why = sim.fleetLegal(cfg.w, cfg.h, cfg.fleet);
      const cells = cfg.fleet.reduce((a, b) => a + b, 0);
      q('[data-why]').textContent = why || `${cfg.fleet.length} ships · ${cells} cells · ${Math.round((cells / (cfg.w * cfg.h)) * 100)}% of the grid`;
      q('[data-why]').classList.toggle('bad', !!why);
      q('[data-start]').disabled = !!why;
    }
    paint();
  }

  // ── placement ───────────────────────────────────────────────────────────────────────────────

  function showPlace(match) {
    root.className = 'screen screen-setup screen-place';
    placing = {
      w: match.w, h: match.h, fleet: [...match.fleet],
      ships: match.fleet.map(len => ({ len, r: null, c: null, dir: 'h' })),
      sel: 0, dir: 'h',
    };
    const node = el(`
      <div class="sheet wide">
        <h1>Place your fleet</h1>
        <p class="hint" data-hint></p>
        <div class="board" data-board></div>
        <div class="tray" data-tray></div>
        <div class="actions">
          <button class="link" data-back>Back</button>
          <button data-rotate>Rotate</button>
          <button class="big" data-auto>Auto-place</button>
          <button class="big" data-ready disabled>Ready</button>
        </div>
      </div>`);
    show(node);

    const q = s => node.querySelector(s);
    const board = q('[data-board]');
    board.style.setProperty('--cols', placing.w);
    board.innerHTML = Array.from({ length: placing.w * placing.h }, (_, i) =>
      `<button data-cell="${i}"></button>`).join('');

    board.onclick = e => {
      const b = e.target.closest('[data-cell]');
      if (!b) return;
      const i = +b.dataset.cell;
      tapCell(Math.floor(i / placing.w), i % placing.w);
    };
    board.onpointermove = e => {
      const b = e.target.closest?.('[data-cell]');
      if (!b) return;
      const i = +b.dataset.cell;
      preview(Math.floor(i / placing.w), i % placing.w);
    };
    board.onpointerleave = () => paint();

    q('[data-rotate]').onclick = () => { placing.dir = placing.dir === 'h' ? 'v' : 'h'; paint(); };
    q('[data-auto]').onclick = () => auto();
    q('[data-back]').onclick = () => handlers.onBack?.();
    q('[data-ready]').onclick = () => {
      const list = placing.ships.map(s => ({ r: s.r, c: s.c, dir: s.dir, len: s.len }));
      handlers.onPlaced?.(list);
    };

    function occupancy(skip = -1) {
      const occ = new Int8Array(placing.w * placing.h).fill(-1);
      placing.ships.forEach((s, i) => {
        if (i === skip || s.r == null) return;
        for (let k = 0; k < s.len; k++) {
          const r = s.dir === 'h' ? s.r : s.r + k;
          const c = s.dir === 'h' ? s.c + k : s.c;
          occ[r * placing.w + c] = i;
        }
      });
      return occ;
    }

    function fits(len, r, c, dir, occ) {
      for (let k = 0; k < len; k++) {
        const rr = dir === 'h' ? r : r + k;
        const cc = dir === 'h' ? c + k : c;
        if (rr < 0 || cc < 0 || rr >= placing.h || cc >= placing.w) return false;
        if (occ[rr * placing.w + cc] >= 0) return false;
      }
      return true;
    }

    function tapCell(r, c) {
      const occ = occupancy();
      const on = occ[r * placing.w + c];
      if (on >= 0) {                                   // tap a placed ship to pick it up again
        placing.ships[on].r = placing.ships[on].c = null;
        placing.sel = on;
        placing.dir = placing.ships[on].dir;
        paint();
        return;
      }
      const i = placing.sel;
      const s = placing.ships[i];
      if (!s || s.r != null) { paint(); return; }
      if (!fits(s.len, r, c, placing.dir, occ)) { flash(); return; }
      s.r = r; s.c = c; s.dir = placing.dir;
      placing.sel = placing.ships.findIndex(x => x.r == null);
      paint();
    }

    function flash() {
      board.classList.remove('nope');
      void board.offsetWidth;
      board.classList.add('nope');
    }

    // Rejection sampling, longest ship first, falling back to the sim's guaranteed-legal packing.
    // The packing alone is what `placeFleet(…, null)` falls back to and it lays every ship out in
    // rows or, rotated, in columns — as an auto-place preview that reads as a bug rather than as a
    // fleet. `randomPlacement` itself is internal to js/sim/, so the scatter is done here.
    function auto() {
      const order = placing.fleet.map((len, i) => ({ len, i })).sort((a, b) => b.len - a.len);
      const out = new Array(placing.fleet.length);
      const occ = new Int8Array(placing.w * placing.h).fill(-1);
      const stamp = (s, id) => {
        for (let k = 0; k < s.len; k++) {
          occ[(s.dir === 'h' ? s.r : s.r + k) * placing.w + (s.dir === 'h' ? s.c + k : s.c)] = id;
        }
      };
      for (const { len, i } of order) {
        let placed = null;
        for (let t = 0; t < 400 && !placed; t++) {
          const dir = Math.random() < 0.5 ? 'h' : 'v';
          const r = Math.floor(Math.random() * (dir === 'h' ? placing.h : placing.h - len + 1));
          const c = Math.floor(Math.random() * (dir === 'h' ? placing.w - len + 1 : placing.w));
          if (fits(len, r, c, dir, occ)) placed = { len, r, c, dir };
        }
        if (!placed) { fallback(); return; }
        out[i] = placed;
        stamp(placed, i);
      }
      placing.ships = out;
      placing.sel = -1;
      paint();
    }

    // placeFleet checks placements[i].len against fleet[i] and packedPlacement emits its own order,
    // so the result is matched back to the fleet slot by length rather than by position.
    function fallback() {
      const pool = sim.packedPlacement(sim.makeRng((Math.random() * 1e9) | 0), placing.w, placing.h, placing.fleet);
      placing.ships = placing.fleet.map(len => {
        const i = pool.findIndex(p => p.len === len);
        const p = pool.splice(i < 0 ? 0 : i, 1)[0];
        return { len, r: p.r, c: p.c, dir: p.dir };
      });
      placing.sel = -1;
      paint();
    }

    // Board only: paint() rewrites the tray's innerHTML, and doing that on every pointermove
    // rebuilds a dozen buttons and their handlers for a hover highlight.
    function preview(r, c) {
      paintBoard();
      const i = placing.sel;
      const s = placing.ships[i];
      if (!s || s.r != null) return;
      const occ = occupancy();
      const ok = fits(s.len, r, c, placing.dir, occ);
      for (let k = 0; k < s.len; k++) {
        const rr = placing.dir === 'h' ? r : r + k;
        const cc = placing.dir === 'h' ? c + k : c;
        if (rr >= placing.h || cc >= placing.w) break;
        board.children[rr * placing.w + cc].classList.add(ok ? 'ghost' : 'bad');
      }
    }

    function paintBoard() {
      const occ = occupancy();
      for (let i = 0; i < board.children.length; i++) {
        const on = occ[i];
        board.children[i].className = on >= 0 ? (on === placing.sel ? 'ship sel' : 'ship') : '';
      }
    }

    function paint() {
      paintBoard();
      q('[data-tray]').innerHTML = placing.ships.map((s, i) =>
        `<button data-ship="${i}" class="${s.r != null ? 'done' : ''}${i === placing.sel ? ' on' : ''}">
           <i>${'▬'.repeat(s.len)}</i><u>${s.len}</u></button>`).join('');
      q('[data-tray]').querySelectorAll('[data-ship]').forEach(b => {
        b.onclick = () => {
          const i = +b.dataset.ship;
          const s = placing.ships[i];
          if (s.r != null) { s.r = s.c = null; }
          placing.sel = i;
          paint();
        };
      });
      const left = placing.ships.filter(s => s.r == null).length;
      q('[data-ready]').disabled = left > 0;
      q('[data-hint]').textContent = left
        ? `${left} to place — tap the grid, or take the auto-place`
        : 'Fleet ready. Tap a ship to move it.';
    }

    paint();
  }

  const api = {
    root,
    get config() { return cfg; },
    set(next) { cfg = { ...cfg, ...next }; return cfg; },
    bind(h) { handlers = { ...handlers, ...h }; },

    // Kept from W0: occupancy and count caps are playability limits, legality is packRows' job.
    valid(c = cfg) { return !sim.fleetLegal(c.w, c.h, c.fleet); },

    showTitle, showCustom, showPlace,
    show() { root.hidden = false; },
    hide() { root.hidden = true; },
    hideAll() { root.hidden = true; },
    start() { handlers.onStart?.(cfg); },
  };

  register('setup', api);
  return api;
}

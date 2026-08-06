// In-play HUD: whose turn, ordnance, what is under the ghost, and your own board — C7 owns this.
//
// Writes only inside #ui; index.html is frozen. The `[data-fire]` and `[data-kind]` hooks are kept
// because main.js's `hook.ui.arm` / `hook.ui.confirm` reach for them by name.
//
// Your own board is here as DOM rather than in the scene: the plotting table shows the ENEMY grid,
// so without this panel the enemy's turn is invisible, and DOM costs nothing against a texture
// budget that is the binding constraint (D16).

import { ORDNANCE } from '../config.js';
import { register } from './flow.js';

const KIND_LABEL = { shell: 'Shell', heavy: 'Heavy', salvo: 'Salvo' };
const STATE = ['', 'miss', 'hit', 'sunk'];

export function buildHUD(mount, opts = {}) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.hidden = true;
  root.innerHTML = `
    <div class="hud-top">
      <button class="hud-pause" data-pause aria-label="Pause">❚❚</button>
      <div class="hud-who">
        <b data-turn>—</b>
        <s data-opponent></s>
      </div>
      <div class="hud-own">
        <div class="hud-own-grid" data-own></div>
        <div class="hud-roster" data-roster></div>
      </div>
    </div>
    <div class="hud-bar">
      <div class="hud-read"><b data-target>—</b><s data-hint>Tap the chart to aim</s></div>
      <div class="hud-ord">
        ${Object.keys(ORDNANCE).map(k => `
          <button data-kind="${k}"><i>${KIND_LABEL[k] || k}</i><u data-charge="${k}"></u></button>`).join('')}
      </div>
      <button class="hud-fire" data-fire disabled>FIRE</button>
    </div>`;
  mount.appendChild(root);

  const q = sel => root.querySelector(sel);
  const ownEl = q('[data-own]');
  const rosterEl = q('[data-roster]');
  const fireEl = q('[data-fire]');

  let handlers = { onArm: opts.onArm, onConfirm: opts.onConfirm, onPause: opts.onPause };
  let kind = 'shell';
  let armed = null;
  let yours = false;
  let busy = false;
  let dims = '';

  root.querySelectorAll('[data-kind]').forEach(b => {
    b.onclick = () => {
      if (b.disabled) return;
      const next = b.dataset.kind;
      if (handlers.onArm?.(next) === false) return;
      kind = next;
      sync();
    };
  });
  fireEl.onclick = () => handlers.onConfirm?.(armed, kind);
  q('[data-pause]').onclick = () => handlers.onPause?.();

  function sync() {
    root.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    fireEl.disabled = !armed || !yours || busy;
    root.classList.toggle('waiting', !yours || busy);
  }

  function drawOwn(v) {
    const key = `${v.w}x${v.h}`;
    if (dims !== key) {
      dims = key;
      ownEl.style.setProperty('--cols', v.w);
      ownEl.innerHTML = Array.from({ length: v.w * v.h }, () => '<i></i>').join('');
    }
    const own = new Uint8Array(v.w * v.h);
    for (const s of v.ships) for (const c of s.cells || []) own[c.r * v.w + c.c] = 1;
    const cells = ownEl.children;
    for (let i = 0; i < cells.length; i++) {
      cells[i].className = (own[i] ? 'ship ' : '') + (STATE[v.ownGrid[i]] || '');
    }
  }

  // Sunk lengths are legal information under fog — a ship's cells become known the moment it goes
  // down (D6) — and without them a player who sank a 3 twenty turns ago has no way to remember it.
  const lens = ships => ships.filter(s => s.sunk).map(s => s.len).sort((a, b) => b - a);

  function drawRoster(v) {
    const mine = v.ships.filter(s => !s.sunk).length;
    const theirs = v.enemyShips.length ? v.enemyShips.filter(s => !s.sunk).length : v.fleet.length;
    const chips = list => (list.length ? list.map(l => `<u>${l}</u>`).join('') : '<u class="none">—</u>');
    rosterEl.innerHTML =
      `<span>You <b>${mine}</b>/${v.fleet.length}</span>`
      + `<span>Enemy <b>${theirs}</b>/${v.fleet.length}</span>`
      + `<i>lost ${chips(lens(v.ships))}</i>`
      + `<i>sunk ${chips(lens(v.enemyShips))}</i>`;
  }

  const api = {
    root,
    get kind() { return kind; },
    bind(h) { handlers = { ...handlers, ...h }; },
    show(on) { root.hidden = !on; },
    arm(k) { kind = k; handlers.onArm?.(k); sync(); },

    // `note` is the warning about what is under the ghost — firing into already-resolved cells is
    // legal and wasted, and nothing else in the game says so.
    setArmed(cells, text, note) {
      armed = cells && cells.length ? cells : null;
      q('[data-target]').textContent = armed ? text || `${armed.length} cells` : '—';
      const hint = q('[data-hint]');
      hint.textContent = armed ? note || 'Tap again on the chart, or FIRE' : 'Tap the chart to aim';
      hint.classList.toggle('warn', !!(armed && note));
      sync();
    },

    setTurn(text) { q('[data-turn]').textContent = text; },
    setOpponent(name) { q('[data-opponent]').textContent = name || ''; },
    setBusy(on) { busy = on; sync(); },

    setCharges(kinds) {
      for (const k of kinds || []) {
        const b = root.querySelector(`[data-kind="${k.kind}"]`);
        const u = root.querySelector(`[data-charge="${k.kind}"]`);
        if (!b) continue;
        b.disabled = !k.enabled;
        if (u) u.textContent = Number.isFinite(k.charges) ? `${k.charges}` : '∞';
      }
      sync();
    },

    setState(v, meta = {}) {
      yours = !!meta.yours;
      busy = !!meta.busy;
      this.setCharges(meta.kinds);
      this.setTurn(v.phase === 'OVER'
        ? (v.winner === 0 ? 'Enemy fleet destroyed' : 'Fleet lost')
        : meta.busy ? 'Shot away' : meta.yours ? 'Your move' : 'Enemy is firing');
      drawOwn(v);
      drawRoster(v);
      sync();
    },
  };

  // main.js builds the four UI modules independently and never introduces them; flow.js is where
  // they find each other.
  register('hud', api);
  return api;
}

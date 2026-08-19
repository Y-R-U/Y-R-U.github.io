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

// The eye is always drawn; hiding adds the bar through it. Two different glyphs at 17 px read as
// two different controls rather than as one control in two states.
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M1.6 12S5.5 5.5 12 5.5 22.4 12 22.4 12 18.5 18.5 12 18.5 1.6 12 1.6 12Z"/>'
  + '<circle cx="12" cy="12" r="3.1"/>'
  + '<path class="eye-bar" d="M3.4 20.6 20.6 3.4"/></svg>';
const STATE = ['', 'miss', 'hit', 'sunk'];

export function buildHUD(mount, opts = {}) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.hidden = true;
  root.innerHTML = `
    <div class="hud-note" data-note>
      <button data-note-open aria-label="What the sea view shows">
        <i>?</i><span>Sea view is a mock-up. The chart is the real board.</span>
      </button>
      <p data-note-long hidden>Where the ships sit on the sea, and where the shells land on it, are
      drawn for effect and are not the real positions. Everything true about this battle is on the
      chart: your fleet in the box below, the enemy's on the plotting table.</p>
    </div>
    <div class="hud-top">
      <button class="hud-pause" data-pause aria-label="Pause">❚❚</button>
      <div class="hud-who">
        <b data-turn>—</b>
        <s data-opponent></s>
      </div>
      <div class="hud-own-slot">
        <div class="hud-own">
          <div class="hud-own-head">
            <span>Your fleet</span>
            <button class="hud-own-eye" data-private aria-pressed="false" aria-label="Hide your fleet">${EYE}</button>
          </div>
          <button class="hud-own-open" data-fleet aria-label="Your fleet — open the layout">
            <div class="hud-own-plot">
              <div class="hud-own-grid" data-own></div>
              <div class="hud-own-blank"><b>Hidden</b></div>
            </div>
            <div class="hud-roster" data-roster></div>
          </button>
        </div>
        <div class="hud-cue" data-cue hidden aria-hidden="true"><i></i><span>Your fleet — tap to change it</span></div>
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

  let handlers = {
    onArm: opts.onArm, onConfirm: opts.onConfirm, onPause: opts.onPause,
    onFleet: opts.onFleet, onPrivate: opts.onPrivate,
  };
  let hidden = false;
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
  q('[data-fleet]').onclick = () => handlers.onFleet?.();
  // A sibling of the box's own button, never nested inside it: a button in a button is invalid and
  // the inner one's tap would still have run the outer handler.
  q('[data-private]').onclick = () => { api.setPrivate(!hidden); handlers.onPrivate?.(hidden); };
  q('[data-note-open]').onclick = () => {
    const long = q('[data-note-long]');
    long.hidden = !long.hidden;
    root.querySelector('[data-note]').classList.toggle('open', !long.hidden);
  };

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
    // `mine` is blanked with the grid: a count of your surviving ships and the lengths you have
    // already lost is a readout of your own fleet, and hiding the grid beside it would hide nothing.
    // The enemy's two figures are about the enemy and stay.
    rosterEl.innerHTML =
      `<span class="mine">You <b>${mine}</b>/${v.fleet.length}</span>`
      + `<span>Enemy <b>${theirs}</b>/${v.fleet.length}</span>`
      + `<i class="mine">lost ${chips(lens(v.ships))}</i>`
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

    // The first-time callout on the own-grid box. It has `pointer-events: none` and sits clear of
    // the box, so it can never eat the tap it is asking for.
    cue(on, text) {
      const el = q('[data-cue]');
      if (text) el.querySelector('span').textContent = text;
      el.hidden = !on;
      el.classList.toggle('on', !!on);
    },

    // The privacy blank. Two people on one phone: the box shows YOUR board, which is the one thing
    // the other player must not read over your shoulder. A class on the box, so it survives every
    // repaint — drawOwn() only ever rewrites the cells inside it — and flow.js stores it so it
    // survives a resume as well. It is a comfort control, not a lock.
    setPrivate(on) {
      hidden = !!on;
      root.querySelector('.hud-own').classList.toggle('private', hidden);
      const btn = q('[data-private]');
      btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      btn.setAttribute('aria-label', hidden ? 'Show your fleet' : 'Hide your fleet');
    },
    get private() { return hidden; },

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

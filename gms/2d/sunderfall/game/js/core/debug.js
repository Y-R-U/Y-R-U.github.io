/* SUNDERFALL — the review panel.
 *
 *   import { createDebug } from './core/debug.js';
 *   createDebug(ctx);            // hidden unless ?debug, or Backquote on a keyboard
 *
 * Built because reviewing this game meant playing it. Aaron could not look at the
 * fire scene without surviving the vigil first, could not judge the boss without
 * the twenty minutes in front of it, and could not feel a level-12 loadout without
 * earning one. His words: *"once I can easily review each section more thoroughly
 * with debug tools I can give more feedback"* — so this is a feedback instrument,
 * not a cheat menu, and everything in it goes through the game's own seams rather
 * than reaching into state:
 *
 *   act.set(state)             the same call `?act=` makes
 *   spellSystem.setLevel(n)    levelling UP runs the real addXp path, offer included
 *   bus.emit('boss:dead')      the same event the fight emits
 *
 * Three things about it are deliberate:
 *
 * 1. **It never blocks the world.** It is not part of `ui/overlays.js` and never
 *    sets `ui.blocked` — `ui.blocked` halts `scenes.update`, so a panel that
 *    paused the sim could not be used to watch anything.
 * 2. **Replaying a cutscene clears its `seen` flag first.** A scene watched to the
 *    end is retired forever (`core/progress.js`), so without that the button would
 *    silently do nothing the second time — the same trap that lost the fire scene.
 * 3. **It is off unless asked for.** No build step means the code ships either
 *    way; what must not ship is a panel a player can open by accident.
 */

import { ACT_STATES } from '../sim/act.js';

/* Which act state plays each scene. `after` has no state that plays it cold —
   `won` entered cold takes the "you already closed it" branch by design (§3.6) —
   so the ending is reached the way the game reaches it: stand in the arena and
   kill the boss. */
const SCENES = [
  { id: 'stones', label: 'Stones', hint: 'Ostrick at the ruins', state: 'stones' },
  { id: 'fire', label: 'Fire', hint: 'the brazier goes out', state: 'fire' },
  { id: 'glade', label: 'Glade', hint: 'the Seam in Vayne\'s voice', state: 'glade' },
  { id: 'after', label: 'Ending', hint: 'kills the boss to reach it', state: 'boss', kill: true },
];

const CSS = `
.sf-dbg{position:fixed;left:0;bottom:0;z-index:60;font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:#cfd3dd;-webkit-user-select:none;user-select:none;pointer-events:none}
.sf-dbg[hidden]{display:none}
.sf-dbg *{pointer-events:auto;box-sizing:border-box}
.sf-dbg-tab{display:block;margin:0 0 6px 6px;padding:7px 11px;border:1px solid #4a4460;border-radius:3px;
  background:rgba(14,13,20,.86);color:#c8a86a;font:inherit;letter-spacing:.14em;cursor:pointer}
.sf-dbg-tab:hover{border-color:#c8a86a}
.sf-dbg-panel{margin:0 0 6px 6px;width:min(340px,calc(100vw - 12px));max-height:min(70vh,560px);overflow-y:auto;
  padding:10px;border:1px solid #4a4460;border-radius:3px;background:rgba(11,10,16,.95);
  box-shadow:0 10px 40px rgba(0,0,0,.6)}
.sf-dbg-panel[hidden]{display:none}
.sf-dbg h4{margin:11px 0 5px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#8b849c;font-weight:700}
.sf-dbg h4:first-of-type{margin-top:0}
.sf-dbg-row{display:flex;flex-wrap:wrap;gap:4px}
.sf-dbg button{padding:6px 8px;border:1px solid #3b3650;border-radius:2px;background:#1a1826;color:#cfd3dd;
  font:inherit;cursor:pointer;min-height:30px}
.sf-dbg button:hover{border-color:#c8a86a;color:#fff}
.sf-dbg button.on{border-color:#c8a86a;background:#2b2436;color:#e8c98a}
.sf-dbg button.wide{width:100%;justify-content:center;text-align:center}
.sf-dbg .read{width:100%;color:#8b849c;padding:5px 0 0}
.sf-dbg .read b{color:#e8c98a;font-weight:400}
`;

export function createDebug(ctx) {
  if (typeof document === 'undefined') return null;
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const bus = ctx.bus;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'sf-dbg');
  const panel = el('div', 'sf-dbg-panel');
  const tab = el('button', 'sf-dbg-tab', 'DEBUG');
  panel.hidden = true;
  root.appendChild(panel);
  root.appendChild(tab);
  root.hidden = !q.has('debug');
  document.body.appendChild(root);

  let open = false;
  tab.onclick = () => {
    open = !open;
    panel.hidden = !open;
    tab.textContent = open ? 'CLOSE' : 'DEBUG';
    if (open) refresh();
  };
  /* Backquote toggles the whole thing, so a session that did not start with
     ?debug can still reach it without losing its progress to a reload. */
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.metaKey || e.ctrlKey || e.altKey) return;
    root.hidden = !root.hidden;
    if (!root.hidden && !open) tab.click();
  });

  /* Every seam is read lazily. This is built before the play scene exists, so a
     handle grabbed now is null for the life of the session — the same trap that
     cost sim/act.js every one of its persistence guarantees. */
  const act = () => ctx.act || null;
  const sys = () => ctx.spellSystem || null;
  const world = () => ctx.world || null;
  const prog = () => ctx.progress || null;
  const player = () => { const w = world(); return w && w.player; };
  const note = (text, value) => bus.emit('hint:tip', { text, value: value || 'DEBUG', life: 5 });
  const boss = () => {
    const w = world();
    if (!w || !w.ents) return null;
    for (const e of w.ents.live) if (e.alive && !e.dead && e.data && e.data.boss) return e;
    return null;
  };

  let god = false;

  const sections = [];
  const lvlRead = el('div', 'read');
  const stateRead = el('div', 'read');

  section('Jump to', () => ACT_STATES.map((s) => btn(s, () => {
    const A = act();
    if (!A) return note('No act machine yet');
    A.set(s, { place: true });        // `place` so `road` moves him too
    note('Jumped to ' + s, s.toUpperCase().slice(0, 8));
  }, () => !!act() && act().state === s)));

  section('Replay a cutscene', () => SCENES.map((sc) => btn(sc.label, () => {
    const A = act();
    if (!A) return note('No act machine yet');
    const P = prog();
    if (P && P.act && P.act.seen) delete P.act.seen[sc.id];
    A.set(sc.state, { place: true });
    if (sc.kill) setTimeout(() => bus.emit('boss:dead', { debug: true }), 300);
    note(sc.label + ' — ' + sc.hint, 'SCENE');
  })));

  section('Level', () => [
    btn('− level', () => stepLevel(-1)),
    btn('+ level', () => stepLevel(1)),
    btn('+5', () => stepLevel(5)),
    btn('max', () => { const S = sys(); if (S) { S.setLevel(S.maxLevel || 24); note('Level ' + S.level, 'LV ' + S.level); } }),
    lvlRead,
  ]);

  section('Rook', () => [
    btn('heal', () => { const p = player(); if (p) { p.hp = p.maxHp; note('Healed', 'HP'); } }),
    btn('refill focus', () => { const S = sys(); if (S) S.focus = S.focusMax; }),
    btn('godmode', () => { god = !god; note(god ? 'Godmode on' : 'Godmode off', god ? 'GOD' : 'MORTAL'); }, () => god),
    /* Levelling alone opens empty circles. In play the every-other-level offer
       fills them, but that is a modal you have to answer — and a reviewer who
       jumps to level 12 to see what the loadout feels like wants the loadout,
       not five stacked prompts. */
    btn('learn a spell', () => {
      const S = sys();
      if (!S) return note('No spell system');
      const pool = S.spells.filter((d) => !S.known.has(d.id));
      if (!pool.length) return note('He knows them all', 'SPELL');
      const def = pool[(Math.random() * pool.length) | 0];
      S.learn(def.id, 1);
      note('Learned ' + def.name, 'SPELL');
    }),
    btn('kill me', () => { const w = world(), p = player(); if (w && p) w.damage(p, 99999, 0, { ignoreInvuln: true }); }),
  ]);

  section('The Seam', () => [
    btn('beam now', () => forceAction('lash')),
    btn('grasp now', () => forceAction('grasp')),
    btn('kill boss', () => { bus.emit('boss:dead', { debug: true }); note('Boss killed', 'BOSS'); }),
    btn('50%', () => setBossHp(0.5)),
    btn('30%', () => setBossHp(0.3)),
    btn('10%', () => setBossHp(0.1)),
  ]);

  section('Save', () => [
    btn('wipe the save and reload', () => {
      const P = prog();
      if (P && P.clear) P.clear();
      location.reload();
    }, null, 'wide'),
  ]);

  panel.appendChild(stateRead);

  function stepLevel(d) {
    const S = sys();
    if (!S || !S.setLevel) return note('No spell system');
    const was = S.level;
    const now = S.setLevel(S.level + d);
    note(now === was ? 'Already at ' + now : 'Level ' + was + ' → ' + now, 'LV ' + now);
  }

  /* Imported on demand: `enemies/` is an optional module and the panel has to
     work in a build that never loaded it. */
  async function forceAction(name) {
    const e = boss();
    if (!e) return note('No boss in the world', 'BOSS');
    try {
      const m = await import('../enemies/base.js');
      e.data.cd = 0;
      m.cancelAction(e, e.data);
      m.startAction(e, e.data, name);
      note('Seam: ' + name, 'BOSS');
    } catch (err) { note('enemies/base.js not loaded'); }
  }

  function setBossHp(k) {
    const e = boss();
    if (!e) return note('No boss in the world', 'BOSS');
    e.hp = Math.max(1, Math.round((e.maxHp || e.hp) * k));
    note('Boss at ' + Math.round(k * 100) + '%', 'BOSS');
  }

  /* Godmode tops him up rather than reaching into the damage pipeline, because
     several sources bypass it (burn ticks with ignoreInvuln, the pit) and a
     half-invulnerable player is a worse review instrument than none. */
  setInterval(() => {
    if (god) { const p = player(); if (p && p.alive) { p.hp = p.maxHp; p.invuln = Math.max(p.invuln, 1); } }
    if (open && !root.hidden) refresh();
  }, 200);

  /* ---- plumbing ---- */

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, onClick, isOn, cls) {
    const b = el('button', cls || '', label);
    b.onclick = () => { onClick(); refresh(); };
    if (isOn && isOn()) b.classList.add('on');
    return b;
  }
  function section(title, build) {
    panel.appendChild(el('h4', '', title));
    const row = el('div', 'sf-dbg-row');
    panel.appendChild(row);
    sections.push({ row, build });
  }
  function refresh() {
    // rebuilt rather than diffed: a dozen buttons on a click costs nothing, and
    // the "which state am I in" highlight is then never stale
    for (const s of sections) s.row.replaceChildren(...s.build());
    const S = sys(), A = act(), p = player();
    lvlRead.textContent = S ? `level ${S.level} · xp ${Math.round(S.xp)}/${S.xpToNext}` : 'no spell system';
    stateRead.innerHTML = 'act <b>' + (A ? A.state : '?') + '</b> · x <b>'
      + (p ? Math.round(p.x) : '?') + '</b> · hp <b>' + (p ? Math.round(p.hp) : '?') + '</b>'
      + (god ? ' · <b>GOD</b>' : '');
  }
  refresh();

  const api = {
    root,
    refresh,
    get god() { return god; },
    show() { root.hidden = false; if (!open) tab.click(); },
  };
  ctx.debug = api;
  return api;
}

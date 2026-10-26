// Pre-battle formation: drag units onto the 2x3 hex board, see synergies / position bonuses / power vs the enemy.
import { h, fmt } from './dom.js';
import { icon, roleBadge } from './icons.js';
import { levelById, unitDef, wavePower, synergies, rules, data } from '../app/data.js';
import { btn, header, unitCard } from './components.js';
import { hint } from './tutorial.js';
import { orient } from '../app/orient.js';
import { featureOpen } from './scr_hub.js';
import { load } from '../app/modules.js';

const SLOT_NAMES = ['Front · Near', 'Front · Mid', 'Front · Far', 'Back · Near', 'Back · Mid', 'Back · Far'];
const idx = (s) => s.col * 3 + s.lane;
const slotOf = (i) => ({ col: Math.floor(i / 3), lane: i % 3 });

// position bonus keys for a role at a slot (mirrors sim makeUnit)
export function posBonus(role, slot) {
  const pos = rules().position?.[role] || {};
  const out = [];
  if (slot.col === 0 && pos.front) out.push(['front', pos.front]);
  if (slot.col === 1 && pos.back) out.push(['back', pos.back]);
  if (slot.lane !== 1 && pos.side) out.push(['side', pos.side]);
  return out;
}
export function modsText(m = {}) {
  const L = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', crit: 'CRIT', critDmg: 'CRIT DMG', dr: 'DMG RED', dmg: 'DMG', heal: 'HEAL', charge: 'OD CHARGE' };
  return Object.entries(m).filter(([k, v]) => typeof v === 'number' && v).map(([k, v]) => (v > 0 ? '+' : '') + Math.round(v * 100) + '% ' + (L[k] || k)).join(' · ');
}

export async function mount(root, ctx, route) {
  const { store, router, portraits } = ctx;
  const T = target(ctx, route);
  if (!T) { router.go('/hub', { replace: true }); return {}; }
  // battle-10: build the arena's procedural textures in idle time while the player arranges the squad (fire and forget)
  if (ctx.engine) load('battle').then((m) => m.prewarmBattle?.(ctx.engine, { theme: T.session?.theme || 'scifi' })).catch(() => {});
  const level = { waves: T.waves };
  const maxUnits = store.state.slots;

  // working copy: slotIndex -> uid
  const board = Array(6).fill(null);
  for (const e of store.state.squad) if (store.unit(e.uid)) board[idx(e.slot)] = e.uid;
  trimToSlots();
  let waveView = 0;
  let cancelDrag = null;   // rotating mid-drag drops the drag cleanly (no stuck ghost)

  function trimToSlots() { let n = 0; for (let i = 0; i < 6; i++) if (board[i]) { if (++n > maxUnits) board[i] = null; } }
  const deployed = () => board.map((uid, i) => uid && { uid, slot: slotOf(i) }).filter(Boolean);

  const boardEl = h('div.fm-board.mine');
  const enemyEl = h('div.fm-board.enemy');
  const synEl = h('div.fm-syn');
  const powEl = h('div.fm-pow');
  const benchEl = h('div.fm-bench.scroll-x');
  const countEl = h('span.fm-count');
  const buffEl = h('div.fm-buffs');
  const waveTabs = h('div.fm-wtabs');
  const goalsEl = h('div.fm-goals');
  // a locked contract still shows its intel, but ENGAGE says why it can't start
  const lock = T.locked?.() || null;
  const engageBtn = lock ? btn('Locked', () => blocked({ ok: false, reason: 'locked' }), { cls: 'big locked', icon: 'lock', id: 'fm-engage' })
    : btn('Engage', engage, { cls: 'primary big', icon: 'play', id: 'fm-engage' });
  if (lock) engageBtn.title = lock;

  root.append(
    header('Deployment', () => router.go(T.back), h('div.fm-lvl', h('small', T.kicker), h('b', T.title))),
    // header + ENGAGE stay pinned; everything between scrolls when the visible height is short (mobile URL bar)
    h('div.fm-body.scroll',
      h('div.fm-field',
        h('div.fm-side', h('div.fm-lbl.t-cyan', 'Your squad ', countEl), boardEl),
        h('div.fm-mid'),
        h('div.fm-side', h('div.fm-lbl.t-red', 'Hostiles ', waveTabs), enemyEl)),
      goalsEl, powEl, synEl, buffEl),
    // the roster is pinned with ENGAGE (never inside the scroller): on a short phone the middle scrolls, the cards stay (Aaron's S22)
    h('div.fm-bench-wrap', h('div.vp-kicker', 'Roster — drag onto a hex, tap to auto-place'), benchEl),
    h('div.fm-go', engageBtn));

  // ---- my board (back column on the left, front next to the centre line, far lane on top)
  function hexCell(i, side) {
    const s = slotOf(i);
    const cell = h('div.fm-hex', { dataset: { slot: i, side }, style: { gridColumn: side === 'mine' ? (s.col === 0 ? 2 : 1) : (s.col === 0 ? 1 : 2), gridRow: 3 - s.lane } });
    return cell;
  }
  function renderBoard() {
    boardEl.replaceChildren();
    for (let i = 0; i < 6; i++) {
      const s = slotOf(i);
      const cell = hexCell(i, 'mine');
      const uid = board[i];
      if (uid) {
        const v = store.view(uid);
        const bonus = posBonus(v.role, s);
        cell.classList.add('filled');
        cell.dataset.faction = v.rarity === 'legendary' ? 'legendary' : v.faction;
        const art = h('div.fm-art', h('div.ph', icon(v.role)));
        portraits.fill(art, v);
        cell.append(art, h('div.fm-u', roleBadge(v.role), h('b', 'Lv' + v.level)),
          bonus.length ? h('div.fm-bonus', icon('up'), bonus.map(([k]) => k).join('+')) : null);
        dragSource(cell, uid, i);
        cell.addEventListener('click', () => { if (dragMoved) return; board[i] = null; refresh(); });
      } else {
        // hint: which roles like this slot
        const likes = ['tank', 'archer', 'mage'].filter((r) => posBonus(r, s).length);
        cell.append(h('div.fm-hint', likes.map((r) => icon(r)), h('small', s.col === 0 ? 'Front' : 'Back')));
      }
      boardEl.appendChild(cell);
    }
    countEl.textContent = deployed().length + '/' + maxUnits;
    countEl.classList.toggle('t-gold', deployed().length < maxUnits);
  }

  function renderEnemy() {
    const waves = level.waves;
    waveTabs.replaceChildren(...waves.map((w, wi) => h('button.fm-wtab' + (wi === waveView ? '.on' : ''), { type: 'button', onclick: () => { waveView = wi; renderEnemy(); } }, 'W' + (wi + 1))));
    enemyEl.replaceChildren();
    const occ = {};
    for (const u of waves[waveView].units) occ[idx(u.slot)] = u;
    for (let i = 0; i < 6; i++) {
      const cell = hexCell(i, 'enemy');
      const u = occ[i];
      if (u) {
        const d = unitDef(u.def);
        cell.classList.add('filled', 'foe');
        const art = h('div.fm-art', h('div.ph', icon(d?.role || 'hex')));
        if (d) portraits.fill(art, { ...d, model: d.model });
        cell.append(art, h('div.fm-u', roleBadge(d?.role, true), h('b', 'Lv' + (u.level || 1))));
        cell.addEventListener('click', () => ctx.toast((d?.name || u.def) + ' · ' + (d?.role || '').toUpperCase()));
      }
      enemyEl.appendChild(cell);
    }
  }

  function renderPower() {
    const mine = deployed().length ? store.powerOf(deployed()) : 0;
    const theirs = Math.max(...level.waves.map(wavePower));
    const r = mine / (mine + theirs || 1);
    powEl.replaceChildren(h('div.row.between', h('b.t-cyan', fmt(mine)), h('span.vp-kicker', 'Power'), h('b.t-red', fmt(theirs))),
      h('div.fm-powbar', h('i', { style: { width: (r * 100).toFixed(1) + '%' } })));
  }

  function renderSyn() {
    const defs = deployed().map((e) => unitDef(store.unit(e.uid).def));
    const act = synergies(defs);
    const all = data().synergies || [];
    const fCount = {};
    for (const d of defs) fCount[d.faction] = (fCount[d.faction] || 0) + 1;
    const chips = all.map((s) => {
      const a = act.find((x) => x.id === s.id);
      let prog = '';
      if (s.kind === 'faction') { const next = s.tiers.find((t) => (fCount[s.faction] || 0) < t.count); prog = (fCount[s.faction] || 0) + '/' + (a && !next ? s.tiers[s.tiers.length - 1].count : (next || s.tiers[0]).count); }
      else if (s.kind === 'roles') prog = Object.keys(s.need || {}).map((r) => defs.some((d) => d.role === r) ? '●' : '○').join('');
      return h('div.syn-chip' + (a ? '.on' : ''), { dataset: { faction: s.faction || '' }, onclick: () => ctx.toast(s.name + ' — ' + (s.desc || (a ? modsText(a.mods) : 'inactive')), '', 3.5) },
        h('b', s.name), h('small', prog));
    }).filter((c, i) => c.classList.contains('on') || (all[i].kind === 'faction' && fCount[all[i].faction]) || (all[i].kind === 'roles' && defs.length >= 2));
    synEl.replaceChildren(h('div.vp-kicker', 'Synergies'), h('div.syn-row', chips.length ? chips : h('small.t-muted', 'Deploy units to see synergies')));
  }

  function renderBuffs() {
    const shop = Object.values(data().buffs || {}).filter((b) => store.isUnlocked(b.unlock) || store.state.buffs?.[b.id] > 0);
    if (!shop.length) { buffEl.replaceChildren(); return; }
    const sel = store.state.selectedBuff;
    // quick buy stays here; the full fabrication bay is the Workshop (D28)
    const wsLink = featureOpen(store, 'workshop') ? h('button.fm-wslink', { type: 'button', onclick: () => router.go('/workshop') }, icon('wrench'), h('span', 'Workshop')) : null;
    buffEl.replaceChildren(h('div.fm-buffh', h('div.vp-kicker', 'Combat buff · one per battle'), wsLink), h('div.buff-row.scroll-x', shop.map((b) => {
      const n = store.state.buffs?.[b.id] || 0;
      const on = sel === b.id;
      return h('button.buff' + (on ? '.on' : '') + (n ? '' : '.empty'), { type: 'button', title: b.desc, onclick: async () => {
        if (on) { store.selectBuff(null); return renderBuffs(); }
        if (!n) {
          const [cur, cost] = Object.entries(b.cost || {})[0] || [];
          if (!cur) return ctx.toast(b.name + ' — earned from operations', 'err');
          const ok = await ctx.modal({ title: b.name, body: (b.desc || '') + '. Buy one for ' + fmt(cost) + ' ' + cur + '?', actions: [{ label: 'Cancel', value: false }, { label: 'Buy', value: true, cls: 'primary' }] });
          if (!ok) return;
          const r = store.buyBuff(b.id);
          if (!r.ok) return ctx.toast(r.why, 'err');
        }
        const r = store.selectBuff(b.id);
        if (!r.ok) ctx.toast(r.why, 'err');
        renderBuffs(); renderPower();
      } }, icon(b.mods?.hp || b.mods?.dr ? 'shield' : b.mods?.charge ? 'overdrive' : b.mods?.heal ? 'heal' : 'up'), h('b', b.name), h('small', n ? '×' + n : 'Buy')); })));
  }

  function renderBench() {
    benchEl.replaceChildren(...store.roster().sort((a, b) => b.power - a.power).map((v) => {
      const on = board.includes(v.uid);
      const c = unitCard(v, { portraits });
      if (on) c.classList.add('used');
      c.appendChild(h('div.pw', fmt(v.power)));
      dragSource(c, v.uid, -1);
      c.addEventListener('click', () => { if (dragMoved) return; on ? remove(v.uid) : autoPlace(v.uid); });
      return c;
    }));
  }

  function remove(uid) { const i = board.indexOf(uid); if (i >= 0) board[i] = null; refresh(); }
  function autoPlace(uid) {
    if (deployed().length >= maxUnits) return ctx.toast('All ' + maxUnits + ' squad slots used — clear story to unlock more', 'err');
    const v = store.view(uid);
    const pref = v.role === 'tank' ? [1, 0, 2, 4, 3, 5] : v.role === 'archer' ? [4, 3, 5, 1, 0, 2] : [3, 5, 4, 0, 2, 1];
    const i = pref.find((p) => !board[p]);
    board[i] = uid; refresh();
  }
  function drop(uid, from, to) {
    if (to === from) return;
    if (from < 0 && !board[to] && deployed().length >= maxUnits) { ctx.toast('Squad full (' + maxUnits + ')', 'err'); return; }
    const prev = board[to];
    if (from >= 0) board[from] = prev; else { const j = board.indexOf(uid); if (j >= 0) board[j] = prev; }
    board[to] = uid;
    refresh();
  }

  // ---- drag & drop (pointer events; bench scrolls horizontally, so a bench drag starts on an upward pull)
  let dragMoved = false;
  function dragSource(el, uid, from) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      dragMoved = false;
      const sx = e.clientX, sy = e.clientY;
      let ghost = null, over = null;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!ghost) {
          if (Math.hypot(dx, dy) < 8) return;
          // along the bench = scroll it (a row in portrait, a column in landscape); across it = drag toward the board
          const along = orient.landscape ? Math.abs(dy) > Math.abs(dx) * 1.2 : Math.abs(dx) > Math.abs(dy) * 1.2;
          if (from < 0 && along) { cleanup(); return; }
          dragMoved = true;
          const v = store.view(uid);
          ghost = h('div.fm-ghost', { dataset: { faction: v.rarity === 'legendary' ? 'legendary' : v.faction } }, roleBadge(v.role), h('b', v.name));
          document.getElementById('overlay-root').appendChild(ghost);
          root.classList.add('dragging');
        }
        ev.preventDefault();
        const ar = document.getElementById('app').getBoundingClientRect();
        ghost.style.transform = `translate(${ev.clientX - ar.left}px, ${ev.clientY - ar.top}px)`;
        // short screens: a drag near the scroller's top/bottom edge scrolls it so every hex is reachable
        const body = root.querySelector('.fm-body'), br = body?.getBoundingClientRect();
        if (br) { const e1 = ev.clientY - br.top, e2 = br.bottom - ev.clientY; if (e1 < 48) body.scrollTop -= (48 - e1) / 3; else if (e2 < 48) body.scrollTop += (48 - e2) / 3; }
        const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.fm-hex[data-side="mine"]');
        if (t !== over) { over?.classList.remove('over'); over = t; over?.classList.add('over'); }
      };
      const up = (ev) => {
        // pointercancel = the browser took the gesture (scroll); never read it as "dragged off the board"
        if (ghost && ev.type === 'pointercancel') { cleanup(); return; }
        if (ghost) {
          if (over) drop(uid, from, +over.dataset.slot);
          else if (from >= 0) { board[from] = null; refresh(); }   // dragged off the board = bench it
        }
        cleanup();
        // the synthetic click after a touch drag lands on the re-rendered hex under the finger: swallow it
        setTimeout(() => { dragMoved = false; }, 400);
      };
      const cleanup = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        ghost?.remove(); over?.classList.remove('over'); root.classList.remove('dragging');
        if (cancelDrag === cleanup) cancelDrag = null;
      };
      cancelDrag = cleanup;
      addEventListener('pointermove', move, { passive: false });
      addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }

  // star goals still open on this level; squad rules are checked live against the board
  function squadOk(rule) {
    if (!rule) return null;
    const vs = deployed().map((e) => store.view(e.uid));
    if (rule.maxUnits != null && vs.length > rule.maxUnits) return false;
    if (rule.excludeRoles && vs.some((v) => rule.excludeRoles.includes(v.role))) return false;
    for (const [r, n] of Object.entries(rule.minRole || {})) if (vs.filter((v) => v.role === r).length < n) return false;
    for (const [f, n] of Object.entries(rule.minFaction || {})) if (vs.filter((v) => v.faction === f).length < n) return false;
    return true;
  }
  function renderGoals() {
    const open = T.levelId ? store.goals(T.levelId).filter((g) => !g.done && g.index > 0) : [];
    if (!open.length) { goalsEl.replaceChildren(); goalsEl.classList.add('hide'); return; }
    goalsEl.classList.remove('hide');
    const hasRule = open.some((g) => g.squad);
    goalsEl.replaceChildren(h('div.fm-glist', open.map((g) => {
      const ok = squadOk(g.squad);
      return h('span.fm-goal' + (ok === true ? '.ok' : ok === false ? '.bad' : ''), icon(ok === true ? 'check' : ok === false ? 'close' : 'starO'), g.text);
    })), !hasRule ? '' : btn('Fit goals', () => {
      const r = store.goalFormation(T.levelId);
      if (!r.ok || !r.formation?.length) return ctx.toast(r.why || 'No squad fits these goals', 'err');
      board.fill(null);
      for (const e of r.formation.slice(0, maxUnits)) board[idx(e.slot)] = e.uid;
      refresh();
      // QA Q2: a goal squad can be much weaker than the contract (m1_l1: "1 unit or fewer"); say so before ENGAGE
      const mine = deployed().length ? store.powerOf(deployed()) : 0, theirs = Math.max(...level.waves.map(wavePower));
      if (mine < theirs * 0.95) ctx.toast('Goal squad is under-powered', 'err', 4.5, { sub: fmt(mine) + ' vs ' + fmt(theirs) + ' power. Win first; goals can be earned on a replay.', icon: 'star' });
      else ctx.toast('Squad set for the open star goals');
    }, { cls: 'sm', icon: 'star', id: 'fm-goalsquad' }));
    goalsEl.lastChild?.setAttribute?.('title', 'Build a squad that meets the open star goals');
  }

  function refresh() { renderBoard(); renderPower(); renderSyn(); renderBench(); renderGoals(); if (deployed().length) store.setFormation(deployed()); }

  // every {ok:false, reason} from the sim gets a titled notice with the concrete fix
  function blocked(r) {
    const why = {
      locked: ['Contract locked', lock || 'Clear the earlier contracts first.'],
      empty_squad: ['Squad empty', 'Drag a robot onto a hex, or tap a roster card to auto-place it.'],
      too_many_units: ['Too many units', 'Only ' + maxUnits + ' squad slots are unlocked. Story milestones open more.'],
      not_active: ['Operation offline', 'This special op is not running today. Check Special Ops for the live rotation.'],
      unknown_unit: ['Squad out of date', 'A deployed unit is no longer in your roster. Re-place your squad.'],
      bad_slot: ['Invalid formation', 'Re-place your squad on the hexes.'], duplicate: ['Invalid formation', 'Two units share a hex. Re-place your squad.'],
      unknown_level: ['Contract not found', 'This contract no longer exists. Pick another from the map.'],
    }[r.reason] || ['Cannot deploy', r.why || r.reason || 'Not possible right now.'];
    ctx.toast(why[0], 'err', 3.2, { sub: why[1] });
  }

  function engage() {
    const sq = deployed();
    if (!sq.length) return blocked({ reason: 'empty_squad' });
    const f = store.setFormation(sq);
    if (!f.ok) return blocked(f);
    const cfg = T.start();
    if (!cfg.ok) return blocked(cfg);
    ctx.session.battle = { ...cfg, ...T.session };
    router.go('/battle');
  }

  renderEnemy(); renderBuffs(); refresh();
  hint(store, 'formation', boardEl, 'Drag robots from the roster onto your hexes, or tap a card to auto-place. Tanks hold the FRONT column; archers hit harder from the BACK.', { place: 'below', delay: 600 });
  const offOrient = orient.on(() => cancelDrag?.());
  return { topbar: false, bg: 'on', unmount() { offOrient(); cancelDrag?.(); } };
}

// What the squad is being deployed against. Routes: #/formation/<levelId> | #/formation/arena/<rivalIndex> | #/formation/event/<eventId>/<tierId>
function target(ctx, route) {
  const { store } = ctx;
  const [a, b, c] = route.args;
  if (a === 'arena') {
    const i = +b || 0, rv = store.arenaRivals()[i];
    if (!rv) return null;
    return { kicker: 'Vector Arena', title: 'VS ' + rv.name, back: '/arena', waves: [{ units: rv.units }],
      locked: () => (store.isUnlocked('arena') ? null : 'Unlocks after ' + unlockName(store, 'arena') + '.'),
      start: () => store.startArena(i), session: { kind: 'arena', title: 'VS ' + rv.name } };
  }
  if (a === 'event') {
    const ev = data().events?.[b], tier = ev?.tiers?.find((t) => t.id === c);
    if (!tier) return null;
    const ti = ev.tiers.indexOf(tier);
    const title = ev.name + ' · ' + (tier.name || 'T' + (ti + 1));
    return { kicker: 'Special Ops', title: tier.name || 'Tier ' + (ti + 1), back: '/events', waves: tier.waves,
      start: () => store.startEvent(ev.id, tier.id), session: { kind: 'event', title } };
  }
  const levelId = a || ctx.session.battle?.levelId;
  const found = levelById(levelId);
  if (!found) return null;
  const { map, level } = found;
  return { kicker: map.name, title: level.name, back: '/map/' + (map.order || 1) + '?level=' + levelId, waves: level.waves,
    levelId, locked: () => (store.isLevelOpen(levelId) ? null : lockedWhy(store, levelId)), start: () => store.startLevel(levelId), session: { kind: 'story', levelId, mapIndex: map.order || 1, title: level.name, theme: level.realm || map.realm } };
}

function unlockName(store, key) { const l = levelById(store.unlockLevelFor(key)); return l ? l.map.name + ' · ' + l.level.name : 'more story progress'; }
// the first uncleared contract before this one is what's in the way
function lockedWhy(store, levelId) {
  const L = store.game?.levels?.() || [];
  const i = L.findIndex((l) => l.id === levelId);
  const gate = L.slice(0, Math.max(0, i)).find((l) => !l.stars);
  if (!gate) return 'Clear the earlier contracts first.';
  const f = levelById(gate.id);
  return 'Clear ' + (f ? f.map.name + ' · ' + f.level.name : gate.id) + ' first.';
}

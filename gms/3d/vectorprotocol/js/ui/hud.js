// Battle HUD (refs/ref_battle_01.png): top integrity bars + round, left menu/squad/info, right speed/auto,
// bottom portrait strip with level, HP, ability icons and Overdrive charge (tap a charged card to fire).
// update(state) takes the sim's state shape (js/sim/battle.js: state.player/enemy.{integrity,units[]}, wave, waves, auto).
import { h, fmt } from './dom.js';
import { icon, roleBadge, abilityIcon } from './icons.js';
import { bar, setBar, ibtn } from './components.js';
import { fullscreenButton } from './fullscreen.js';

const STATUS_ICON = { burn: 'flame', shock: 'bolt', stun: 'spiral', slow: 'slow', weaken: 'down', expose: 'crack', marked: 'target', emp: 'emp',
  fortify: 'shield', haste: 'ffwd', overclock: 'overdrive', regen: 'heal', taunt: 'taunt', stealth: 'eyeoff', shield: 'shield' };

export function createHud(root, { portraits, onSpeed, onAuto, onFire, onMenu, onSquad, onInfo, speed = 1, auto = true, speeds = [1, 2, 4], slots = 6, theme = 'scifi' } = {}) {
  const pBar = bar(1), eBar = bar(1, 'red');
  const pPct = h('b.pct', '100%'), ePct = h('b.pct', '100%');
  const roundN = h('b', '1/1');
  const roundLbl = h('small', 'Round');
  const roundEl = h('div.hud-round.vp-panel.c4', roundLbl, roundN);
  let otOn = false;
  const setSpeed = (s) => { curSpeed = s; speedBtn.querySelector('span:last-child').textContent = '×' + curSpeed; speedBtn.classList.toggle('on', curSpeed > 1); onSpeed?.(curSpeed); };
  const speedBtn = ibtn('ffwd', '×' + speed, () => { const i = speeds.indexOf(curSpeed); setSpeed(speeds[(i + 1) % speeds.length]); }, speed > 1 ? 'on' : '');
  const autoBtn = ibtn('auto', 'Auto', () => { curAuto = !curAuto; autoBtn.classList.toggle('on', curAuto); autoBtn.classList.toggle('off', !curAuto); onAuto?.(curAuto); }, auto ? 'on' : 'off');
  let curSpeed = speed, curAuto = auto;
  const strip = h('div.hud-strip');
  const cheatEl = h('div.hud-cheats.hide');   // dev: sim state.cheats (god / one-hit) so a cheated run is obvious
  const banner = h('div.hud-banner');
  const el = h('div.hud' + (theme === 'fantasy' ? '.fantasy' : ''), { dataset: { theme } },
    h('div.hud-top',
      h('div.hud-menu', ibtn('menu', '', onMenu)),
      h('div.hud-integ.vp-panel.mine', h('div.lbl', theme === 'fantasy' ? 'Your squad' : 'Your squad integrity'), h('div.row', pBar, pPct)),
      roundEl,
      h('div.hud-integ.vp-panel.red.foe', h('div.lbl', theme === 'fantasy' ? 'Enemy forces' : 'Enemy squad integrity'), h('div.row', eBar, ePct))),
    h('div.hud-left.vp-panel', ibtn('squad', '', onSquad), ibtn('info', '', onInfo), fullscreenButton('hud-fs')),
    h('div.hud-right', speedBtn, autoBtn),
    banner, cheatEl,
    strip);
  root.appendChild(el);
  const top = el.querySelector('.hud-top'), left = el.querySelector('.hud-left'), right = el.querySelector('.hud-right');
  const sideBtns = [...left.children];   // squad, info, fullscreen: the left rail in portrait; moved (never rebuilt) in landscape
  const slotCap = h('div.hud-slots', icon('lock'), h('span'));   // landscape: "2/6 slots" (story-locked slots have no board position)

  const cards = new Map();   // unit id -> refs
  let lastWave = 0, banners = true;

  function buildCard(u) {
    const art = h('div.pc-art', h('div.ph', icon(u.role)));
    portraits?.fill(art, u);
    const hpBar = bar(u.hpPct ?? 1, 'hp');
    const hpTxt = h('div.pc-hptxt', fmt(u.hp) + '/' + fmt(u.maxHp));
    const od = h('div.pc-od', h('i'));
    const st = h('div.pc-st');
    const abs = ['attack', 'passive', 'overdrive'].map((k) => {
      const a = u.abilities?.[k];
      return h('div.pc-ab' + (k === 'overdrive' ? '.od' : ''), { title: a?.name || k }, icon(abilityIcon(a)));
    });
    const card = h('button.pc', { type: 'button', dataset: { id: u.id, rarity: u.rarity, faction: u.rarity === 'legendary' ? 'legendary' : u.faction },
      onclick: () => { if (card.classList.contains('ready')) onFire?.(u.id, u); } },
      art, h('div.pc-role', roleBadge(u.role)), h('div.pc-lv', 'Lv.' + u.level), od, st,
      h('div.pc-hp', hpBar, hpTxt), h('div.pc-abs', abs), h('div.pc-fire', 'OVERDRIVE'));
    strip.appendChild(card);
    return { card, hpBar, hpTxt, od: od.firstChild, st, stKey: '', hp: -1, ready: null, alive: true };
  }

  function update(s) {
    if (!s) return;
    const pi = s.player?.integrity ?? 1, ei = s.enemy?.integrity ?? 1;
    setBar(pBar, pi); setBar(eBar, ei);
    pPct.textContent = Math.ceil(pi * 100) + '%'; ePct.textContent = Math.ceil(ei * 100) + '%';
    roundN.textContent = (s.wave || 1) + '/' + (s.waves || 1);
    const ch = s.cheats ? ['invulnerable', 'oneHit'].filter((k) => s.cheats[k]).map((k) => (k === 'oneHit' ? 'one-hit' : 'god')).join(' · ') : '';
    if (ch !== cheatEl.dataset.k) { cheatEl.dataset.k = ch; cheatEl.textContent = ch ? 'Cheats: ' + ch : ''; cheatEl.classList.toggle('hide', !ch); }
    // OVERTIME: the 3D overlay draws its own plate under the bar, so this stays a tint + tag on the round box
    const ot = !!s.overtime && !s.done;
    if (ot !== otOn) { otOn = ot; roundEl.classList.toggle('ot', ot); if (!ot) roundLbl.textContent = 'Round'; }
    if (ot) roundLbl.textContent = 'OT ×' + (s.overtimeMult || 1).toFixed(1);
    if (s.wave !== lastWave) { if (lastWave && banners) flash('Round ' + s.wave); lastWave = s.wave; }
    const list = (s.player?.units || []).slice().sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
    for (const u of list) {
      let c = cards.get(u.id);
      if (!c) { c = buildCard(u); cards.set(u.id, c); strip.dataset.n = Math.min(6, cards.size); stripDirty = true; }
      if (u.hp !== c.hp) { setBar(c.hpBar, u.hpPct ?? u.hp / u.maxHp); c.hpTxt.textContent = fmt(u.hp) + '/' + fmt(u.maxHp); if (c.hp >= 0 && u.hp < c.hp) hitPulse(c.card); c.hp = u.hp; }
      c.od.style.transform = 'scaleY(' + Math.min(1, u.chargePct ?? 0).toFixed(3) + ')';
      const ready = !!u.overdriveReady && u.alive;
      if (ready !== c.ready) { c.card.classList.toggle('ready', ready); c.ready = ready; }
      if (u.alive !== c.alive) { c.card.classList.toggle('dead', !u.alive); c.alive = u.alive; }
      c.card.classList.toggle('stunned', !!u.stunned);
      statuses(c, u);
    }
    if (stripDirty) layoutStrip(list);
  }

  // the strip always reads as a full row of 6 (like the ref): the squad sits in the middle, flanked by empty
  // frames for open-but-unused slots and locked frames for slots the story hasn't unlocked yet
  let stripDirty = false, mode = 'portrait', lastList = [];
  function layoutStrip(list) {
    stripDirty = false;
    lastList = list;
    if (mode === 'landscape') return layoutGrid(list);
    const n = cards.size, open = Math.max(n, Math.min(6, slots));
    const frame = (locked) => h('div.pc-empty' + (locked ? '.locked' : ''), { 'aria-hidden': 'true' }, icon(locked ? 'lock' : 'hex'));
    const pads = [...Array(Math.max(0, open - n)).fill(false), ...Array(Math.max(0, 6 - open)).fill(true)];
    // alternate right/left so locked frames end up at the outer edges
    const left = [], right = [];
    pads.forEach((locked, i) => (i % 2 ? left.unshift(frame(locked)) : right.push(frame(locked))));
    const ordered = list.map((u) => cards.get(u.id)?.card).filter(Boolean);
    for (const [, c] of cards) if (!ordered.includes(c.card)) ordered.push(c.card);
    strip.replaceChildren(...left, ...ordered, ...right);
  }
  // landscape (docs/LANDSCAPE.md §2.1): a 2x3 grid mirroring the formation (back column left, far lane on top), same
  // mapping as scr_formation; open positions get empty frames, and story-locked slots become a "2/6 slots" caption
  function layoutGrid(list) {
    const taken = new Set(), kids = [];
    for (const u of list) {
      const c = cards.get(u.id)?.card; if (!c) continue;
      const col = u.slot?.col ?? Math.floor((u.slotIndex ?? 0) / 3), lane = u.slot?.lane ?? (u.slotIndex ?? 0) % 3;
      c.style.gridColumn = col === 0 ? 2 : 1; c.style.gridRow = 3 - lane;
      taken.add(col + ':' + lane); kids.push(c);
    }
    // the caption rides in the lowest empty frame (there always is one while slots < 6), so it costs no card height
    const cap = Math.min(6, Math.max(slots, cards.size));
    let capped = cap >= 6;
    for (let lane = 0; lane < 3; lane++) for (let col = 1; col >= 0; col--) {
      if (taken.has(col + ':' + lane)) continue;
      const withCap = !capped; capped = true;
      if (withCap) slotCap.lastChild.textContent = cap + '/6 slots';
      kids.push(h('div.pc-empty' + (withCap ? '.cap' : ''), { 'aria-hidden': 'true', style: { gridColumn: col === 0 ? 2 : 1, gridRow: 3 - lane } },
        withCap ? slotCap : icon('hex')));
    }
    strip.replaceChildren(...kids);
  }
  function setMode(m) {
    m = m === 'landscape' ? 'landscape' : 'portrait';
    if (m === mode) return;
    mode = m;
    el.dataset.mode = m;
    if (m === 'landscape') { right.append(...sideBtns.slice(0, 2)); if (sideBtns[2]) top.append(sideBtns[2]); }
    else { left.append(...sideBtns); for (const [, c] of cards) { c.card.style.gridColumn = ''; c.card.style.gridRow = ''; } }
    layoutStrip(lastList);
  }

  // up to 3 status chips on the portrait (debuffs first, then buffs, then a shield chip)
  function statuses(c, u) {
    const list = u.alive ? (u.statuses || []).slice().sort((a, b) => (a.kind === 'debuff' ? 0 : 1) - (b.kind === 'debuff' ? 0 : 1)) : [];
    if (u.alive && u.shield > 0 && list.length < 3) list.push({ id: 'shield', kind: 'buff' });
    const key = list.slice(0, 3).map((x) => x.id + (x.stacks > 1 ? x.stacks : '')).join(',');
    if (key === c.stKey) return;
    c.stKey = key;
    c.st.replaceChildren(...list.slice(0, 3).map((x) => h('span.pc-sti.' + (x.kind === 'debuff' ? 'bad' : 'good'), { title: x.id },
      icon(STATUS_ICON[x.id] || (x.kind === 'debuff' ? 'down' : 'up')), x.stacks > 1 ? h('b', x.stacks) : null)));
  }

  // CSS px the 3D board must keep clear: bottom of the top bar row, and the strip's top edge
  // landscape: the board sits between the card grid (left) and the rail (right), under the top cluster
  function margins() {
    const r = root.getBoundingClientRect();
    if (!r.height) return null;
    const t = top.getBoundingClientRect().bottom - r.top;
    const sr = strip.getBoundingClientRect();
    if (mode === 'landscape') {
      const rr = right.getBoundingClientRect();
      return { top: Math.round(t + 4), bottom: Math.max(4, Math.round(r.bottom - sr.bottom - 2)),
        left: Math.round(sr.right - r.left + 10), right: Math.round(rr.width ? r.right - rr.left + 10 : 0) };
    }
    const bottom = sr.height ? r.bottom - sr.top : 150;
    return { top: Math.round(t + 4), bottom: Math.round(bottom + 6), left: 0, right: 0 };
  }

  function hitPulse(card) { card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit'); }
  function flash(text, cls = '') {
    banner.className = 'hud-banner ' + cls; banner.textContent = text;
    void banner.offsetWidth; banner.classList.add('show');
  }
  function fired(id) { const c = cards.get(id); if (c) { c.card.classList.add('firing'); setTimeout(() => c.card.classList.remove('firing'), 600); } }

  return { el, strip, rail: right, update, flash, fired, margins, setSpeed, setMode, get mode() { return mode; }, setBanners(b) { banners = !!b; }, get speed() { return curSpeed; }, get auto() { return curAuto; }, dispose() { el.remove(); } };
}

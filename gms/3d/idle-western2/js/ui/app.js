import { el, btn, show, setText } from './dom.js?v=20261004a';
import { createHud } from './hud.js?v=20261004a';
import { createLineCard, STAGE_LABEL } from './linecard.js?v=20261004a';
import { createSheets } from './sheets.js?v=20261004a';
import { createToasts } from './toast.js?v=20261004a';
import { createJuice } from './juice.js?v=20261004a';
import { createAudio, haptic } from './audio.js?v=20261004a';
import { createModel } from './model.js?v=20261004a';
import { createReveal, createCoach } from './reveal.js?v=20261004a';
import { createEvents } from './events.js?v=20261004a';
import { createTown } from './town.js?v=20261004a';
import { createOffline } from './offline.js?v=20261004a';
import { createTabs } from './tabs.js?v=20261004a';
import { fillLineInfo } from './lineinfo.js?v=20261004a';
import { fillManager } from './manager.js?v=20261004a';
import { fillSettings } from './settings.js?v=20261004a';
import { fillCrew } from './crew.js?v=20261004a';
import { fillGoals } from './goals.js?v=20261004a';
import { fillBootHill, takePoster } from './boothill.js?v=20261004a';
import { fillSeason, createGhosts } from './season.js?v=20261004a';
import { createGate } from './gate.js?v=20261004a';
import { createLook } from './look.js?v=20261004a';
import { createSpectacle } from './pick.js?v=20261004a';
import { createBarks } from './barks.js?v=20261004a';
import { createCaptions, SCRIPTS } from './captions.js?v=20261004a';
import { createHats } from './hats.js?v=20261004a';
import { createFling } from './fling.js?v=20261004a';
import { createSpecials } from './specials.js?v=20261004a';
import { createBoxes, BOX_INFO } from './boxes.js?v=20261004a';
import { HUB } from '../data/plots.js?v=20261004a';

const ACQ_SCRIPT = { poker: 'poker', takeover: 'takeover', rebrand: 'rebrand' };

export function createUI({ game, host, bus }) {
  const model = createModel(game);
  const data = model.data;
  const cards = new Map();
  const visibleCards = new Set();
  const doc = document.documentElement;
  let root, look, sheets, toasts, juice, hud, coach, reveal, events, town, offline, tabs, hats, barks, captions, fling, specials, ghosts, boxes;
  let heroWrap, heroView, tapzone, qtyBar, qtyBtns, list, gate, pinChip, focusChip, tipChip, gfxChip, pianoBtn, posterChip;
  let lastFrame = 0, combo = 0, lastTapAt = 0, desktop = false, heroOn = true, docH = 0, ceremony = false;
  let qty = model.setting('qty', 1);
  const audio = createAudio({ settings: () => game.state.settings });
  const spectacle = createSpectacle({ host, game });
  const R = {};
  // Layout cache: filled by ResizeObservers, never read from the DOM in rAF.
  const geo = { viewW: 0, viewH: 0, get heroH() { return this.viewH; } };

  const rig = () => host.world.heroRig;
  const lineById = model.lineById;
  const heroVisible = () => (heroOn || desktop) && !town?.active && !(sheets?.isOpen && !desktop);

  function applyCalm() {
    const pref = model.setting('reducedMotion', null);
    doc.classList.toggle('calm', pref == null ? matchMedia('(prefers-reduced-motion: reduce)').matches : !!pref);
  }

  function buzz(ms) { if (model.setting('haptics', true) !== false) haptic(ms); }

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    requestAnimationFrame(() => {
      node.classList.add(cls);
      const off = (e) => { if (e.target === node) { node.classList.remove(cls); node.removeEventListener('animationend', off); } };
      node.addEventListener('animationend', off);
    });
  }

  function themedToast(kind, after, n, q) {
    if (kind === 'level') return n > 1 ? `⬆ +${n} levels · Lv ${after.level}` : `⬆ Level ${after.level}`;
    if (kind === 'throughput') return `${q.glyph} ${q.name} · sells ${Math.round(q.sigma * 100)}%`;
    if (kind === 'boost') return `${q.glyph} ${q.name} · ×${q.mult}`;
    if (kind === 'hire') return `🕴 ${model.mgrById[q.managerId].name} ${q.owned ? 'is back' : 'hired'}`;
    return '';
  }

  function onAct(act, lineId, node, held = false) {
    const lv0 = game.state.lines[lineId].lv;
    const payload = act === 'level' ? { lineId, qty } : { lineId };
    const quote = act === 'unlock' || act === 'level' ? null : model.q(act, payload);
    const r = game.act(act, payload);
    if (!r.ok) {
      if (r.code === 'funds' && !held) { restartAnim(node, 'nope'); audio.sfx.nope(); }
      else if (r.msg && !held) toasts.toast(r.msg);
      return false;
    }
    const c = cards.get(lineId);
    if (act === 'unlock') {
      audio.sfx.kaching();
      buzz(15);
      coach.done('buy');
      c.setMode('build');
      restartAnim(c.card, 'popin');
    } else {
      const after = model.stats(lineId);
      const text = themedToast(act, after, after.level - lv0, quote);
      if (text) toasts.cardToast(c.card, text);
      if (!held) juice.ring(node);
      audio.sfx.pop();
      buzz(8);
      if (act === 'hire') coach.done('mgr');
      if (act === 'level') coach.done('level');
    }
    c.want(5000);
    c.at = 0;
    textNow();
    return true;
  }

  function onHurry(lineId, e, node, box = cards.get(lineId)?.card || heroWrap) {
    const r = game.act('build:hurry', { lineId, x: e?.clientX, y: e?.clientY });
    if (!r.ok) return false;
    const c = cards.get(lineId);
    const p = e ? localXY(box, e) : { x: geo.viewW / 2, y: geo.heroH / 2 };
    if (r.delta?.cash > 0) juice.float(box, p.x, p.y, r.delta.cash);
    else if (r.delta?.hat) juice.coins(e.clientX, e.clientY, 1, { step: 2, to: hats.mud });
    else juice.float(box, p.x, p.y, 0, { label: '🔨 −0.5s', cls: 'dim' });
    audio.sfx.hammer();
    if (Math.random() < 0.35) barks.wordless('mulligan');
    if (node) juice.ring(node);
    buzz(6);
    coach.done('hurry');
    coach.done('hurry-hero');
    if (c) { c.want(4000); c.at = 0; }
    return true;
  }

  function celebrateOpen(lineId) {
    const c = cards.get(lineId);
    c.setMode('full');
    c.at = 0;
    restartAnim(c.card, 'popin');
    audio.stinger('st_sign');
    buzz(20);
    juice.stamp(c.card, 'OPEN FOR BUSINESS', 'open');
    if (heroVisible() && !captions.active) juice.stamp(heroWrap, 'OPEN FOR BUSINESS', 'open');
    bus.emit('ui:unlocked', { lineId });
    scrollToCard(lineId, true);
  }

  function scrollToCard(lineId, onlyIfHidden = false) {
    const c = cards.get(lineId);
    if (!c || c.card.hidden) return;
    requestAnimationFrame(() => {
      if (onlyIfHidden) {
        const r = c.card.getBoundingClientRect();
        if (r.top >= 54 && r.bottom <= innerHeight - 70) return;
      }
      c.card.scrollIntoView({ behavior: doc.classList.contains('calm') ? 'auto' : 'smooth', block: 'center' });
    });
  }

  function flyTo(lineId) {
    rig().flyTo(lineId);
    audio.sfx.whoosh();
    scrollToCard(lineId, true);
  }

  function onInfo(lineId) {
    sheets.open({ id: 'line:' + lineId, title: lineById[lineId].emoji + ' ' + model.lineName(lineId), fill: (b) => fillLineInfo(b, ctx, lineId) });
  }

  function openManager(managerId, push = false) {
    const d = model.mgrById[managerId];
    const spec = { id: 'mgr:' + managerId, title: d.emoji + ' ' + d.name, fill: (b) => fillManager(b, ctx, managerId) };
    push ? sheets.push(spec) : sheets.open(spec);
  }

  function onPin(lineId) {
    const g = rig();
    if (g.pinned === lineId) { g.unpin(); toasts.toast('🎬 Tour resumed'); }
    else { g.pin(lineId); toasts.toast(`📌 Watching ${lineById[lineId].emoji} ${model.lineName(lineId)}`); }
    host.setFocus(g.pinned || null);
    coach.done('pin');
    textNow();
  }

  function onExpand(lineId) {
    const c = cards.get(lineId);
    c.want(15000);
    c.at = 0;
    c.setMode('full');
    syncFps(c);
  }

  function localXY(container, e) {
    const r = container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function tipCourier(hit, container, e) {
    const r = game.act('courierTap', { lineId: hit.lineId, shipmentId: hit.shipmentId });
    if (!r.ok) return false;
    const p = localXY(container, e);
    juice.float(container, p.x, p.y, r.delta.cash, { cls: 'gold' });
    juice.coins(e.clientX, e.clientY, 4, { step: 6 });
    audio.sfx.kaching();
    buzz(10);
    return true;
  }

  function onViewTap(lineId, e) {
    const c = cards.get(lineId);
    if (c.mode === 'build') { e.stopPropagation(); onHurry(lineId, e, null, c.card); return; }
    if (c.mode !== 'full') return;
    e.stopPropagation();
    const hit = host.pick('line:' + lineId, e.clientX, e.clientY);
    if (hit?.kind === 'event' && events.tryClaimHit(hit, { x: e.clientX, y: e.clientY })) return;
    if (hit?.kind === 'courier' && tipCourier(hit, c.card, e)) return;
    if (hit?.kind === 'target' && hit.id === 'piano') { playPiano(c.card, e); return; }
    const p = localXY(c.card, e);
    const r = game.act('tapPile', { lineId });
    if (r.ok) {
      const cash = r.delta.cash;
      juice.float(c.card, p.x, p.y, cash, { cls: r.harvest ? 'gold' : '' });
      juice.coins(e.clientX, e.clientY, Math.min(6, 2 + Math.floor(Math.log10(cash + 1))), { step: 4 });
      audio.sfx.kaching();
      buzz(10);
      coach.done('pile');
      c.at = 0;
    } else juice.float(c.card, p.x, p.y, 0, { label: '💰 0', cls: 'dim' });
  }

  function playPiano(box, e) {
    const r = game.act('piano', { x: e?.clientX, y: e?.clientY });
    if (!r.ok) return;
    const len = audio.piano.play({ tempo: r.tempo, wrong: r.wrong, frenzy: r.frenzy });
    try { host.world.plots.get('saloon')?.piano?.(r.tempo || 1); } catch (err) { console.error(err); }
    bus.emit('ui:piano', { tempo: r.tempo, wrong: r.wrong, frenzy: r.frenzy, sec: len });
    const p = e ? localXY(box, e) : { x: geo.viewW / 2, y: geo.heroH / 2 };
    juice.float(box, p.x, p.y, r.delta?.cash || 0, { label: r.delta?.cash > 0 ? null : r.wrong ? '🎹 CLANG' : '🎵', cls: r.wrong ? 'dim' : '' });
    if (r.frenzy) { toasts.toast('🎶 PIANO FRENZY!', { cls: 'gold' }); juice.shake(heroWrap); buzz(30); }
    coach.done('piano');
    pianoBtn?.classList.remove('glint');
  }

  function mudTap(e, p) {
    const r = game.act('tap', { x: e.clientX, y: e.clientY });
    if (!r.ok) return;
    juice.float(heroWrap, p.x, p.y, 0, { label: '🪙 +$' + (r.delta?.hat || 2), cls: 'coinf' });
    juice.coins(e.clientX, e.clientY, 1, { step: 2, to: hats.mud });
    audio.sfx.coin(Math.min(10, game.state.stats.bootTaps % 10));
    coach.done('mud');
    textNow();
  }

  function onHat(e) {
    const r = game.act('hat', {});
    if (!r.ok) { audio.sfx.nope(); restartAnim(hats.mud, 'nope'); return; }
    const b = hats.mud.getBoundingClientRect();
    juice.coins(b.left + b.width / 2, b.top + b.height / 2, Math.min(10, 2 + Math.round(r.delta.cash / 6)), { big: true, step: 5 });
    audio.sfx.kaching();
    buzz(15);
    coach.done('hat');
    textNow();
  }

  // W7 tap priority: mini-game > event actor > fling grab > piano > character > construction > street.
  function onHeroTap(e) {
    if (town.active) {
      const hit = host.pick('hero', e.clientX, e.clientY);
      const id = hit?.lineId && hit.lineId !== HUB ? hit.lineId : hit?.point ? rig().nearestPlot(hit.point) : null;
      if (id && id !== HUB) { town.close(); flyTo(id); }
      return;
    }
    const p = localXY(heroWrap, e);
    const hit = spectacle.pickHero(e.clientX, e.clientY, e.timeStamp) || { kind: 'street' };
    if (specials.active && specials.heroHit(hit, p.x, p.y)) return;
    if (hit.kind === 'minigame') return;
    if (hit.kind === 'event' && events.tryClaimHit(hit.hit || hit, { x: e.clientX, y: e.clientY })) return;
    if (hit.kind === 'courier' && tipCourier(hit.hit, heroWrap, e)) return;
    if (hit.kind === 'ghost' && ghosts.tap(hit.id)) return;
    if (hit.kind === 'fling') { toasts.toast('👆 Swipe to fling him!'); return; }
    if (hit.kind === 'piano') { playPiano(heroWrap, e); return; }
    if (hit.kind === 'hat') { onHat(e); return; }
    if (hit.kind === 'char' && hit.char && !(hit.char === 'stranger' && model.bootstrapping())) { barks.tap(hit.char); return; }
    if (hit.kind === 'build' && hit.lineId) { onHurry(hit.lineId, e, null, heroWrap); return; }
    if (model.bootstrapping()) {
      const b = Object.keys(game.state.build || {})[0];
      if (b) onHurry(b, e, null, heroWrap); else mudTap(e, p);
      return;
    }
    if (hit.kind === 'pile' && hit.lineId && hit.lineId !== HUB) {
      const r = game.act('tapPile', { lineId: hit.lineId });
      if (r.ok) {
        coach.done('pile');
        juice.float(heroWrap, p.x, p.y, r.delta.cash, { cls: r.harvest ? 'gold' : '' });
        juice.coins(e.clientX, e.clientY, 4, { step: 5 });
        audio.sfx.kaching();
        return;
      }
    }
    const now = performance.now();
    combo = now - lastTapAt < 450 ? combo + 1 : 0;
    lastTapAt = now;
    const r = game.act('tap', { x: e.clientX, y: e.clientY });
    if (r.ok && !r.capped) {
      juice.float(heroWrap, p.x, p.y, r.delta.cash, { cls: r.crit ? 'gold' : '' });
      juice.coins(e.clientX, e.clientY, r.crit ? 4 : 1, { big: r.crit, step: combo });
      if (r.crit) { juice.shake(heroWrap); audio.sfx.gun(); buzz(15); }
      else audio.sfx.plink(combo);
    }
  }

  function setQty(v) {
    qty = v;
    game.act('setting', { key: 'qty', value: v });
    qtyBtns.forEach((x) => x.classList.toggle('on', x.dataset.q === String(v)));
    coach.done('qty');
    textNow();
  }

  function nextGhostId() {
    for (const l of data.lines) if (game.state.lines[l.id].lv <= 0 && !game.state.build?.[l.id]) return l.id;
    return null;
  }

  function revealGlyphFn(lineId) {
    return (kind, quote) => {
      const id = 'g:' + lineId + ':' + kind;
      if (reveal.is('r:' + id)) return true;
      if (!quote.affordable) return false;
      reveal.check(id, true);
      const g = cards.get(lineId).glyphs[kind === 'thr' ? 'throughput' : kind === 'boost' ? 'boost' : 'hire'];
      coach.show(kind, g.b, kind === 'mgr' ? 'Hire' : '');
      return true;
    };
  }

  function computeReveals() {
    const started = model.started();
    const st = game.state;
    R.gear = reveal.check('gear', started);
    R.pin = reveal.check('pin', () => model.ownedCount() >= 2);
    R.qty = reveal.check('qty', () => started && model.owned().some((l) => model.q('level', { lineId: l.id, qty: 10 }).affordable));
    R.town = reveal.check('town', () => model.ownedCount() >= 3 || data.districts.some((d) => d.permitCost > 0 && !model.districtOpen(d.id) && model.cash() >= d.permitCost * 0.3));
    R.crew = reveal.check('crew', () => model.owned().some((l) => st.lines[l.id].mgr) || (st.items || []).length > 0 || model.boxCount() > 0);
    R.goals = reveal.check('goals', () => model.ownedCount() >= 2 || model.contracts().some((c) => c.done && c.visible));
    R.boothill = reveal.check('boothill', () => model.districtOpen('bankblock') || model.graves().length > 0);
    R.season = started && model.ownedCount() >= 1 && !!model.season();
  }

  function cardCtx() {
    const ev = model.events();
    const evLines = ev.length ? new Set(ev.map((e) => e.lineId).filter(Boolean)) : null;
    return { nextGhost: nextGhostId(), pinned: rig().pinned, compactOn: model.setting('compact', false) === true, evLines, started: model.started() };
  }

  function syncFps(c) {
    const fps = c.mode === 'compact' ? 4 : 0;
    if (fps !== c.fps) { c.fps = fps; host.setViewFps('line:' + c.line.id, fps); }
  }

  function updateCard(c, cc, now) {
    c.at = now;
    const id = c.line.id;
    c.rename(model.lineName(id));
    if (game.state.build?.[id]) {
      c.setMode('build');
      c.update(model, { qty });
      syncFps(c);
      return;
    }
    if (game.state.lines[id].lv <= 0) {
      const ghost = id === cc.nextGhost && (cc.started || c.line.order === 0) && model.districtOpen(c.line.district);
      c.setMode(ghost ? 'ghost' : 'hidden');
      if (ghost) c.update(model, { qty });
      return;
    }
    if (c.mode === 'build') { celebrateOpen(id); }
    c.update(model, { qty, pinOK: R.pin, pinned: cc.pinned, revealGlyph: revealGlyphFn(id), eventOn: !!cc.evLines?.has(id) });
    if (cc.compactOn && !c.wantsAttention && !c.wanted && cc.pinned !== id) c.setMode('compact');
    else { if (c.wantsAttention) c.want(4000); c.setMode('full'); }
    syncFps(c);
  }

  function updateAllCards(now) {
    const cc = cardCtx();
    for (const c of cards.values()) updateCard(c, cc, now);
  }

  // Visible cards refresh at 4 Hz, the rest at 1 Hz, at most 3 per slice.
  let cardCursor = 0;
  const cardList = [];
  function cardsJob(now) {
    let cc = null, n = 0;
    for (let i = 0; i < cardList.length && n < 3; i++) {
      const c = cardList[(cardCursor + i) % cardList.length];
      if (now - c.at < (visibleCards.has(c) ? 250 : 1000)) continue;
      cc ||= cardCtx();
      updateCard(c, cc, now);
      n++;
      cardCursor = (cardCursor + i + 1) % cardList.length;
    }
  }

  function updateGate() { gate.update(model.started(), R); }

  function focusLabel() {
    const id = rig().current;
    const on = model.started() && !town.active && !!id && id[0] !== '@' && !specials?.active;
    show(focusChip, on);
    if (!on) return false;
    const l = lineById[id];
    const text = l ? l.emoji + ' ' + model.lineName(id) + ' ›' : '🌵 Main Street';
    if (text === focusChip.textContent) return false;
    focusChip.textContent = text;
    focusChip.dataset.line = l ? id : '';
    return true;
  }

  let pianoCheckAt = -1e9, pianoTarget = false;
  function hasPianoTarget() {
    const now = performance.now();
    if (now - pianoCheckAt > 4000) {
      pianoCheckAt = now;
      pianoTarget = spectacle.has('piano');
      if (!pianoTarget) for (const p of host.world.plots.values()) if ((p.tapTargets || []).some((t) => t.id === 'piano')) { pianoTarget = true; break; }
    }
    return pianoTarget;
  }

  function updateHeroChrome() {
    focusLabel();
    const pinned = rig().pinned;
    show(pinChip, !!pinned && !town.active);
    if (pinned) setText(pinChip, '📌 ' + lineById[pinned].emoji + ' ✕');
    show(qtyBar, R.qty && !specials.active);
    show(pianoBtn, !hasPianoTarget() && !town.active && !specials.active);
    hats.update(R);
    syncJump();
  }

  function hints() {
    const st = game.state;
    if (model.bootstrapping()) {
      if (st.stats.bootTaps === 0 && !model.anyBuilding()) coach.show('mud', tapzone, '👆 Tap the mud', { ms: Infinity });
      else coach.done('mud');
      if (model.hatCoins() >= 6 && !hats.mud.hidden) coach.show('hat', hats.mud, '🎩 Tap your hat', { ms: Infinity, at: 'above' });
      const first = data.lines[0];
      const c = cards.get(first.id);
      if (c.mode === 'ghost' && model.q('unlock', { lineId: first.id }).affordable) coach.show('buy', c.card, '🥾 Buy it!', { ms: Infinity, at: 'inside' });
      if (c.mode === 'build') {
        const r = c.glyphs.hurry.b.getBoundingClientRect();
        const seen = r.top > 0 && r.bottom < innerHeight - 4;
        coach.show(seen ? 'hurry' : 'hurry-hero', seen ? c.glyphs.hurry.b : tapzone, '🔨 Tap to hurry', { ms: Infinity });
      }
      coach.tick();
      return;
    }
    for (const id of ['mud', 'hat', 'buy']) if (coach.current === id) coach.done(id);
    const first = model.owned()[0];
    if (first) {
      const c = cards.get(first.id);
      const s1 = model.stats(first.id);
      if (s1.managed) { if (coach.current === 'pile') coach.done('pile'); }
      else if (c.mode === 'full' && s1.stockRatio > 0.15) coach.show('pile', c.view, '👆 Tap to sell', { ms: Infinity, at: 'inside' });
      if (reveal.is('h:pile') && c.mode === 'full' && c.glyphs.level.b.classList.contains('can')) coach.show('level', c.glyphs.level.b, '⬆ Level up');
      if (s1.full && reveal.mark('h:full')) toasts.cardToast(c.card, '💰 Takings full · tap to bank');
    }
    for (const [id] of Object.entries(game.state.build || {})) {
      const c = cards.get(id);
      if (c?.mode === 'build' && visibleCards.has(c)) { coach.show('hurry', c.glyphs.hurry.b, '🔨 Tap to hurry', { ms: 7000 }); break; }
    }
    if (!pianoBtn.hidden && model.ownedCount() >= 1 && !reveal.is('h:piano')) { pianoBtn.classList.add('glint'); }
    if (R.qty) coach.show('qty', qtyBar, '');
    if (R.pin) { const c = cards.get(model.owned()[1]?.id); if (c?.mode === 'full') coach.show('pin', c.card.querySelector('.pin'), ''); }
    if (R.crew && model.boxCount() > 0) coach.show('boxes', tabs.tab('crew'), '🧰 Open it!');
    tabs.hintNew(coach);
    coach.tick();
  }

  function coreJob() {
    computeReveals();
    hud.update(model, R);
    updateHeroChrome();
    tabs.update(R, model.started());
  }

  // Music cue (W10/AUDIO.md): beds own the stream during their special; saloon when it has focus; build hoedown
  // while anything is going up; night (or Ghost Town in season) 18:00–06:00; main otherwise.
  function musicJob() {
    const h = new Date().getHours();
    const night = h >= 18 || h < 6;
    const sp = specials.active;
    let cue = 'main';
    if (ceremony) cue = 'fakedeath';
    else if (sp === 'robbery') cue = 'robbery';
    else if (sp === 'duel') cue = 'duel';
    else if (sp === 'brawl' || rig().current === 'saloon' || rig().pinned === 'saloon') cue = 'saloon';
    else if (model.anyBuilding()) cue = 'build';
    else if (night) cue = model.season() ? 'ghost' : 'night';
    audio.music.want(cue, { now: !!sp || ceremony });
  }

  const jobs = [
    { ms: 60, fn: cardsJob },
    { ms: 250, fn: coreJob },
    { ms: 160, fn: () => { events.update(); specials.update(); } },
    { ms: 250, fn: () => sheets.update() },
    { ms: 500, fn: updateGate },
    { ms: 400, fn: hints },
    { ms: 700, fn: musicJob },
  ];
  for (const j of jobs) j.at = 0;
  let jobCursor = 0;
  // Round-robin slices: at least one due job per frame, more only while under ~0.8 ms.
  function runJobs(now) {
    const t0 = performance.now();
    for (let i = 0; i < jobs.length; i++) {
      const k = (jobCursor + i) % jobs.length, j = jobs[k];
      if (now - j.at < j.ms) continue;
      j.at = now;
      j.fn(now);
      jobCursor = (k + 1) % jobs.length;
      if (performance.now() - t0 > 0.8) return;
    }
  }

  // Immediate full refresh after player input (outside rAF).
  function textNow() {
    const now = performance.now();
    coreJob();
    updateAllCards(now);
    updateGate();
    events.update();
    sheets.update();
    hints();
  }

  const smooth = () => (doc.classList.contains('calm') ? 'auto' : 'smooth');
  function toTop() { scrollTo({ top: 0, behavior: smooth() }); }
  function toBottom() { scrollTo({ top: doc.scrollHeight, behavior: smooth() }); }

  function syncJump() {
    if (!tabs) return;
    const y = scrollY, vh = innerHeight;
    const up = !desktop && !heroOn && !town?.active;
    const down = !desktop && !town?.active && docH - y - vh > vh * 0.6 && model.started();
    tabs.jump({ up, down, qty: up && !!R.qty, qtyText: qty === 'max' ? 'MAX' : '×' + qty });
  }

  function layoutMode() {
    desktop = innerWidth >= 900;
    syncJump();
  }

  const ctx = {
    game, host, bus, data, model, audio, buzz, geo, spectacle,
    get qty() { return qty; },
    toast: (t, o) => toasts.toast(t, o),
    get sheets() { return sheets; },
    get juice() { return juice; },
    get barks() { return barks; },
    get coach() { return coach; },
    get captions() { return captions; },
    openManager, openLine: onInfo, flyTo, openTab: (id) => openTab(id),
    openBox: (k) => boxes.show(k),
    onBox: () => { if (R.crew) coach.show('boxes', tabs.tab('crew'), '🧰 Open it!'); },
    onHat: (e) => onHat(e),
    fakeDeath: () => fakeDeath(),
    textNow, cards, rig,
    townActive: () => !!town?.active,
    heroView: () => heroView,
    releaseEvent: (id) => events.release(id),
    celebrate: (text) => { juice.stamp(heroVisible() ? heroWrap : root, text); audio.sfx.chime(); },
    heroTip: (...a) => heroTip(...a),
  };

  function openTab(id) {
    if (id === 'lines') { if (tabs.current === 'lines' && !town.active) toTop(); sheets.close(); town.close(); tabs.set('lines'); return; }
    if (id === 'town') { sheets.close(); town.open(); tabs.set('town'); coach.done('tab:town'); return; }
    const specs = {
      crew: { id: 'crew', title: 'The Crew', cls: 'poster', fill: (b) => fillCrew(b, ctx) },
      goals: { id: 'goals', title: 'Town Council Demands', cls: 'poster', fill: (b) => fillGoals(b, ctx) },
      boothill: { id: 'boothill', title: 'Boot Hill', cls: 'poster', fill: (b) => fillBootHill(b, ctx) },
      season: { id: 'season', title: 'Ghost Town', cls: 'spooky', fill: (b) => fillSeason(b, ctx) },
    };
    if (!specs[id]) return;
    town.close();
    sheets.open(specs[id]);
    tabs.set(id);
    coach.done('tab:' + id);
    if (id === 'crew') coach.done('boxes');
  }

  let tipTimer = 0;
  function heroTip(id, text, { once = true, ms = 5200 } = {}) {
    if (once && !reveal.mark('h:' + id)) return;
    setText(tipChip, text);
    show(tipChip, true);
    restartAnim(tipChip, 'pop');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => show(tipChip, false), ms);
  }

  // Fake Your Death (W2): the state resets at once (safe if the tab closes); the ceremony is captions over the hero.
  function fakeDeath() {
    const first = model.graves().length === 0;
    const r = game.act('prestige', {});
    if (!r.ok) { toasts.toast('🔒 ' + (r.msg || 'Not yet')); return; }
    sheets.close();
    toTop();
    ceremony = true;
    musicJob();
    const lines = SCRIPTS.fakeDeath.slice();
    if (r.disguise) lines.push([`Your new name: ${r.disguise.name}. ${r.disguise.moustache[0].toUpperCase() + r.disguise.moustache.slice(1)} moustache.`, 2600]);
    lines.push([`💀 Bounty +${r.bounty} · income ×${Math.round((r.mult || 1) * 100) / 100}`, 2400]);
    captions.play({
      lines, skippable: !first, dark: true,
      onEnd: () => {
        ceremony = false;
        musicJob();
        show(posterChip, true);
        restartAnim(posterChip, 'pop');
        setTimeout(() => show(posterChip, false), 12000);
        textNow();
      },
    });
    for (const c of cards.values()) c.at = 0;
    textNow();
  }

  function onGameEvents() {
    game.on('milestone', ({ lineId }) => {
      const c = cards.get(lineId);
      c.milestone();
      juice.stamp(c.card, '×2');
      buzz(20);
    });
    game.on('harvest', ({ lineId }) => toasts.cardToast(cards.get(lineId).card, '🌙 Welcome back · ×1.5'));
    game.on('build:start', ({ lineId, acq, T }) => {
      const c = cards.get(lineId);
      if (c) { c.at = 0; if (c.mode !== 'build') c.setMode('build'); }
      const script = acq === 'bought' ? lineId : ACQ_SCRIPT[acq];
      if (script && SCRIPTS[script]) {
        if (heroVisible()) captions.fit(script, T);
        else toasts.toast(SCRIPTS[script][0][0], { ms: 2600 });
      }
    });
    game.on('build:stage', ({ lineId, name }) => {
      const c = cards.get(lineId);
      if (c && visibleCards.has(c)) toasts.cardToast(c.card, (STAGE_LABEL[name] || '🔨') + ' up!');
      audio.sfx.hammer();
      if (name === 'frame' || name === 'sign') barks.wordless('mulligan');
    });
    game.on('unlocked', ({ lineId }) => { const c = cards.get(lineId); if (c && (c.mode === 'ghost' || c.mode === 'build')) celebrateOpen(lineId); });
    game.on('hat:promo', (p) => hats.promo(p));
    game.on('half_town', () => { if (heroVisible()) captions.script('halfTown'); juice.stamp(heroWrap, 'HALF THE TOWN', 'open'); });
    game.on('deed', ({ reopen }) => { if (!reopen && heroVisible()) captions.script('deed'); });
    game.on('bark', ({ char, trig, prio }) => barks.say(char, trig, prio));
    bus.on('bark', (b) => { if (b?.src === 'spectacle') barks.say(b.char, b.trig, false, { gated: true }); });
    game.on('box', ({ kind, n, source }) => {
      if (source === 'cheat') return;
      toasts.toast(`${BOX_INFO[kind]?.e || '📦'} ${BOX_INFO[kind]?.n || 'Strongbox'}${n > 1 ? ' ×' + n : ''}!`, { cls: 'gold' });
      ctx.onBox();
    });
    game.on('achievement', ({ achievement: a }) => toasts.toast(`🏅 ${a.emoji} ${a.name} · +1%`, { cls: 'gold', ms: 2600 }));
    game.on('link', ({ from, to }) => toasts.toast(`🔗 ${lineById[from]?.emoji} → ${lineById[to]?.emoji} gag link · +5%`, { ms: 2600 }));
    game.on('season', ({ kind, rank }) => { if (kind === 'rank') toasts.toast(`👻 Ghost Town rank ${rank}! A keepsake hat`, { cls: 'gold', ms: 2800 }); });
    game.on('piano:frenzy', () => bus.emit('ui:frenzy', {}));
    game.on('offline', ({ report }) => offline.show(report));
    game.on('district', () => { for (const c of cards.values()) c.at = 0; });
    game.on('pileSold', ({ auto }) => { if (!auto) coach.done('pile'); });
    game.on('sunday', () => { for (const c of cards.values()) c.at = 0; textNow(); });
    game.on('courier:spawn', () => heroTip('courier', '💸 Tap glinting riders for tips'));
    game.on('event:spawn', ({ event: ev }) => { if (!ev.special) heroTip('ev:' + ev.kind, `${ev.emoji} ${ev.name}! Tap it`); });
    game.on('brawl:hit', () => barks.wordless('pickles'));
    bus.on('graphics:paused', () => show(gfxChip, true));
    bus.on('graphics:resumed', () => show(gfxChip, false));
  }

  const ui = {
    mount(r) {
      root = r;
      root.replaceChildren();
      root.classList.add('iw2');
      applyCalm();
      const app = el('div', 'app');
      hud = createHud({
        onSettings: () => sheets.open({ id: 'settings', title: 'Settings', cls: 'poster', fill: (b) => fillSettings(b, ctx) }),
        onTeeth: () => openTab('crew'),
      });
      heroWrap = el('section', 'hero');
      heroView = el('div', 'hero-view');
      tapzone = el('div', 'hero-tapzone');
      heroView.addEventListener('click', onHeroTap);
      pinChip = btn('hero-chip pin-chip', '', (e) => { e.stopPropagation(); const g = rig(); if (g.pinned) onPin(g.pinned); }, 'Resume tour');
      pinChip.hidden = true;
      focusChip = btn('hero-chip focus-chip', '', (e) => { e.stopPropagation(); const id = focusChip.dataset.line; if (id) scrollToCard(id); }, 'Show this business');
      focusChip.hidden = true;
      tipChip = btn('hero-chip hero-tip', '', (e) => { e.stopPropagation(); show(tipChip, false); }, 'Dismiss tip');
      tipChip.hidden = true;
      gfxChip = btn('hero-chip gfx-chip', '⚠️ Graphics paused · tap to restart', (e) => {
        e.stopPropagation();
        if (host.restart()) { show(gfxChip, false); toasts.toast('✨ Graphics back'); }
        else location.replace(location.pathname + '?v=' + Date.now());
      }, 'Restart graphics');
      gfxChip.hidden = true;
      pianoBtn = btn('hero-btn piano', '🎹', (e) => { e.stopPropagation(); playPiano(heroWrap, e); }, "Fingers's piano");
      pianoBtn.hidden = true;
      posterChip = btn('hero-chip poster-chip', '🖼️ Your new Wanted Poster', async (e) => { e.stopPropagation(); show(posterChip, false); await takePoster(ctx); }, 'Save Wanted Poster');
      posterChip.hidden = true;
      qtyBar = el('div', 'qty');
      qtyBar.hidden = true;
      qtyBtns = [1, 10, 'max'].map((v) => {
        const b = btn('qty-btn', v === 'max' ? 'MAX' : '×' + v, (e) => { e.stopPropagation(); setQty(v); });
        b.dataset.q = String(v);
        b.classList.toggle('on', String(v) === String(qty));
        return b;
      });
      qtyBar.append(...qtyBtns);
      heroWrap.append(heroView, tapzone, pinChip, focusChip, tipChip, gfxChip, pianoBtn, posterChip, qtyBar);
      hud.root.querySelector('.hud-money').addEventListener('click', (e) => { if (!e.target.closest('button')) toTop(); });

      const side = el('div', 'side');
      list = el('main', 'lines');
      gate = createGate(ctx);
      side.append(list, gate.root, el('div', 'list-end'));
      app.append(hud.root, heroWrap, side);
      root.append(app);

      toasts = createToasts(root);
      juice = createJuice({ root, target: () => hud.cashEl, audio });
      sheets = createSheets(root, { onChange: (id) => { root.classList.toggle('sheet-open', !!id); if (!id && !town?.active) tabs?.set('lines'); } });
      reveal = createReveal({ game, onReveal: (id) => root.classList.add('rv-' + id) });
      coach = createCoach({ reveal });
      tabs = createTabs(root, { onTab: openTab, model, onJump: (k) => { if (k === 'up') toTop(); else if (k === 'down') toBottom(); else { const vals = [1, 10, 'max']; setQty(vals[(vals.indexOf(qty) + 1) % 3]); } } });
      hats = createHats(heroWrap, ctx);
      barks = createBarks({ game, audio, hero: heroWrap, anchorOf: (c) => spectacle.bubbleAnchor(c), geo, sunday: () => model.sunday(), busy: () => !!specials?.active && specials.active !== 'brawl' });
      captions = createCaptions(heroWrap, { sfx: audio.sfx });
      town = createTown(heroWrap, ctx, { onClose: () => { root.classList.remove('town'); tabs.set('lines'); syncJump(); }, onOpen: () => { root.classList.add('town'); scrollTo({ top: 0 }); syncJump(); } });
      events = createEvents(heroWrap, ctx, { heroOn: () => heroOn || desktop, toHero: (id) => { toTop(); rig().cut(id); } });
      specials = createSpecials(heroWrap, ctx, {
        heroVisible, spectacle, toHero: toTop,
        cardFor: (id) => { const c = cards.get(id); return c && c.mode === 'full' && visibleCards.has(c) ? c.card : null; },
      });
      fling = createFling(heroWrap, heroView, ctx, { spectacle, canShow: () => heroVisible() && !specials.active && !captions.active });
      ghosts = createGhosts(heroWrap, ctx, { spectacle, canShow: () => heroVisible() && !specials.active });
      offline = createOffline(root, ctx);
      boxes = createBoxes(root, ctx);

      host.addView('hero', heroView, { kind: 'hero', priority: 10 });
      look = createLook({ host, buzz, blocked: () => town.active || !!specials.active || !!fling.held });
      look.attach(heroView, heroWrap, 'hero', () => rig().orbit);
      const io = new IntersectionObserver((es) => {
        for (const e of es) {
          const c = e.target.__card;
          if (e.isIntersecting) { visibleCards.add(c); if (performance.now() - c.at > 250) c.at = 0; } else visibleCards.delete(c);
        }
      });
      for (const line of data.lines) {
        const c = createLineCard(line, { onAct, onInfo, onPin, onViewTap, onExpand, onHurry });
        c.card.__card = c;
        list.appendChild(c.card);
        cards.set(line.id, c);
        cardList.push(c);
        host.addView('line:' + line.id, c.view, { kind: 'line', lineId: line.id });
        look.attach(c.view, c.card, 'line:' + line.id, () => host.world.cardRig(line.id).orbit, { lineId: line.id, allow: () => c.mode === 'full' });
        io.observe(c.card);
      }
      const ro = new ResizeObserver((es) => {
        for (const e of es) {
          if (e.target === heroView) { geo.viewW = e.contentRect.width; geo.viewH = e.contentRect.height; }
          else docH = e.contentRect.height;
        }
        syncJump();
      });
      ro.observe(heroView);
      ro.observe(app);
      new IntersectionObserver(([e]) => { heroOn = e.isIntersecting; syncJump(); }, { rootMargin: '-80px 0px 0px 0px', threshold: 0.25 }).observe(heroWrap);
      const hr = heroView.getBoundingClientRect();
      geo.viewW = hr.width; geo.viewH = hr.height; docH = app.offsetHeight;
      rig().onChange(() => { if (focusLabel()) restartAnim(focusChip, 'pop'); });
      onGameEvents();
      addEventListener('scroll', syncJump, { passive: true });
      addEventListener('resize', layoutMode);
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyCalm);
      layoutMode();
      const tier = model.setting('tier', 'auto');
      if (tier !== 'auto' && !new URLSearchParams(location.search).has('tier')) host.setTier(tier === 'low' ? 'battery' : tier);
      if (/[?&]reset=1/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])reset=1&?/, '$1').replace(/[?&]$/, ''));
      if (host.paused) show(gfxChip, true);
      textNow();
      window.__iw2ui = ui;
    },
    update(now) {
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      const st = game.state;
      hud.frame(dt, st.cash);
      for (const c of visibleCards) {
        if (c.mode === 'full' || c.mode === 'compact') c.progress(st.lines[c.line.id].cyc);
        else if (c.mode === 'build') { const b = st.build?.[c.line.id]; if (b) c.buildProgress(Math.min(1, b.t / b.T)); }
      }
      town.frame(now);
      barks.frame(now);
      fling.frame(now);
      specials.frame(now);
      ghosts.frame(now);
      runJobs(now);
    },
    showOffline(report) { offline.show(report); },
    toast(text, opts) { toasts.toast(text, opts); },
    openTab,
    get debug() { return { model, look, reveal, R, cards, events, town, sheets, coach, openManager, audio, geo, jobs, barks, captions, fling, specials, ghosts, boxes, hats, spectacle, fakeDeath, heroVisible, playPiano: () => playPiano(heroWrap, null), onHeroTap }; },
  };
  return ui;
}

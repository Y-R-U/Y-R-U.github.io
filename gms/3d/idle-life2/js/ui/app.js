import { el, btn, show, setText } from './dom.js?v=20261004b';
import { createHud } from './hud.js?v=20261004b';
import { createLineCard } from './linecard.js?v=20261004b';
import { createSheets } from './sheets.js?v=20261004b';
import { createToasts } from './toast.js?v=20261004b';
import { createJuice } from './juice.js?v=20261004b';
import { createAudio, haptic } from './audio.js?v=20261004b';
import { createModel } from './model.js?v=20261004b';
import { createReveal, createCoach } from './reveal.js?v=20261004b';
import { createEvents } from './events.js?v=20261004b';
import { createMinigames } from './minigames.js?v=20261004b';
import { createTown } from './town.js?v=20261004b';
import { createOffline } from './offline.js?v=20261004b';
import { createPostcard } from './postcard.js?v=20261004b';
import { createTabs } from './tabs.js?v=20261004b';
import { fillLineInfo } from './lineinfo.js?v=20261004b';
import { fillManager } from './manager.js?v=20261004b';
import { fillCrew } from './crew.js?v=20261004b';
import { fillLife, kin } from './life.js?v=20261004b';
import { fillGoals } from './goals.js?v=20261004b';
import { fillSettings } from './settings.js?v=20261004b';
import { fillSeason, createSeasonCards } from './season.js?v=20261004b';
import { createGate } from './gate.js?v=20261004b';
import { fmtCash, fmtNum } from '../state/format.js?v=20261004b';

const BEAT = { move: '🏠 New home', partner: '💑 Together', dog: '🐕 New friend', birth: '👶 Welcome!', retire: '🌅 Passed on' };

export function createUI({ game, host, bus }) {
  const model = createModel(game);
  const data = model.data;
  const cards = new Map();
  const visibleCards = new Set();
  const doc = document.documentElement;
  let root, sheets, toasts, juice, hud, coach, reveal, events, minis, town, offline, postcard, tabs, seasonCards;
  let heroWrap, heroView, jump, jumpUp, jumpDown, jumpQty, evFloat, qtyBar, qtyBtns, list, gate, pinChip, focusChip, tipChip, binAnchor, canChip, camBtn, gfxChip;
  let lastFrame = 0, combo = 0, lastTapAt = 0, desktop = false, heroOn = true, docH = 0;
  let qty = model.setting('qty', 1);
  const audio = createAudio({ enabled: model.setting('sound', true) !== false });
  const R = {};
  // Layout cache: filled by ResizeObservers, never read from the DOM in rAF.
  const geo = { viewW: 0, viewH: 0, get heroH() { return this.viewH; } };

  const rig = () => host.world.heroRig;
  const lineById = model.lineById;

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
    if (kind === 'boost') return `${q.glyph} ${q.name} · income ×${q.mult}`;
    if (kind === 'hire') return `🕴 ${model.mgrById[q.managerId].name} ${q.owned ? 'is back' : 'hired · sells more'}`;
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
    if (act !== 'unlock') {
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

  function celebrateUnlock(lineId) {
    const c = cards.get(lineId);
    c.setMode('full');
    restartAnim(c.card, 'popin');
    audio.sfx.kaching();
    buzz(20);
    juice.stamp(c.card, lineById[lineId].emoji + ' Open!');
    rig().cut(lineId);
    bus.emit('ui:unlocked', { lineId });
    coach.done('buy');
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
    sheets.open({ id: 'line:' + lineId, title: lineById[lineId].emoji + ' ' + lineById[lineId].name, fill: (b) => fillLineInfo(b, ctx, lineId) });
  }

  function openManager(managerId, push = false) {
    const d = model.mgrById[managerId];
    const spec = { id: 'mgr:' + managerId, title: '🕴 ' + d.name, fill: (b) => fillManager(b, ctx, managerId) };
    push ? sheets.push(spec) : sheets.open(spec);
  }

  function onPin(lineId) {
    const g = rig();
    if (g.pinned === lineId) { g.unpin(); toasts.toast('🎬 Tour resumed'); }
    else { g.pin(lineId); toasts.toast(`📌 Watching ${lineById[lineId].emoji} ${lineById[lineId].name}`); }
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
    if (c.mode !== 'full') return;
    e.stopPropagation();
    const hit = host.pick('line:' + lineId, e.clientX, e.clientY);
    if (hit?.kind === 'event' && events.tryClaimHit(hit, { x: e.clientX, y: e.clientY })) return;
    if (hit?.kind === 'courier' && tipCourier(hit, c.card, e)) return;
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
    } else juice.float(c.card, p.x, p.y, 0, { label: '📦 0', cls: 'dim' });
  }

  function onHeroTap(e) {
    const hit = host.pick('hero', e.clientX, e.clientY);
    if (town.active) {
      const id = hit?.lineId && hit.lineId !== 'home' ? hit.lineId : hit?.point ? rig().nearestPlot(hit.point) : null;
      if (id && id !== 'home') { town.close(); flyTo(id); }
      return;
    }
    const st = game.state;
    const p = localXY(heroWrap, e);
    if (hit?.kind === 'event' && events.tryClaimHit(hit, { x: e.clientX, y: e.clientY })) return;
    if (hit?.kind === 'courier' && tipCourier(hit, heroWrap, e)) return;
    if (!st.bootstrap.done) {
      if (hit?.id === 'bin' || nearBin(e)) return cashIn(e);
      if (game.act('tap', { x: e.clientX, y: e.clientY }).ok) {
        juice.float(heroWrap, p.x, p.y, 0, { label: '+1 🥫', cls: 'cans' });
        audio.sfx.tink(Math.min(10, st.bootstrap.cans));
        coach.done('tap');
      }
      return;
    }
    if (hit?.kind === 'pile' && hit.lineId !== 'home') {
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
    if (r.ok) {
      juice.float(heroWrap, p.x, p.y, r.delta.cash, { cls: r.crit ? 'gold' : '' });
      juice.coins(e.clientX, e.clientY, r.crit ? 4 : 1, { big: r.crit, step: combo });
      if (r.crit) { juice.shake(heroWrap); audio.sfx.clunk(); buzz(15); }
      else audio.sfx.plink(combo);
    }
    const c = hit?.lineId && cards.get(hit.lineId);
    if (c && c.mode !== 'hidden' && combo === 0) restartAnim(c.card, 'card-flash');
  }

  function nearBin(e) {
    if (binAnchor.hidden || game.state.bootstrap.cans <= 0) return false;
    const b = binAnchor.getBoundingClientRect();
    return Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2)) < 72;
  }

  function cashIn(e) {
    const r = game.act('cashCans');
    if (!r.ok) return;
    const p = e ? localXY(heroWrap, e) : { x: geo.viewW / 2, y: geo.heroH / 2 };
    juice.float(heroWrap, p.x, p.y, r.delta.cash, { label: '♻️ +' + fmtCash(r.delta.cash) });
    const b = binAnchor.getBoundingClientRect();
    juice.coins(e ? e.clientX : b.left + b.width / 2, e ? e.clientY : b.top + b.height / 2, 5, { step: 3 });
    audio.sfx.kaching();
    buzz(12);
    coach.done('bin');
    textNow();
  }

  const binPos = [0, 0, 0];
  let binXY = '';
  function placeBin() {
    const home = host.world.plots.get('home');
    const t = home?.tapTargets?.find((x) => x.id === 'bin');
    if (!t) { show(binAnchor, false); return; }
    home.group.updateMatrixWorld();
    const m = home.group.matrixWorld.elements, [x, y, z] = t.pos;
    binPos[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    binPos[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    binPos[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    const pr = host.project('hero', binPos);
    show(binAnchor, pr.visible);
    if (!pr.visible) return;
    const xy = `${pr.x | 0}px ${pr.y | 0}px`;
    if (xy !== binXY) { binXY = xy; binAnchor.style.translate = xy; }
  }

  function setQty(v) {
    qty = v;
    game.act('setting', { key: 'qty', value: v });
    qtyBtns.forEach((x) => x.classList.toggle('on', x.dataset.q === String(v)));
    coach.done('qty');
    textNow();
  }

  function nextGhostId() {
    for (const l of data.lines) if (game.state.lines[l.id].lv <= 0) return l.id;
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
    R.age = reveal.check('age', started);
    R.gear = reveal.check('gear', started);
    R.pin = reveal.check('pin', () => model.ownedCount() >= 2);
    R.qty = reveal.check('qty', () => started && model.owned().some((l) => model.q('level', { lineId: l.id, qty: 10 }).affordable));
    R.life = reveal.check('life', () => started && (model.housingTier() > 0 || model.cash() >= (model.nextHome()?.cost ?? Infinity) * 0.5));
    R.crew = reveal.check('crew', () => game.state.items.length > 0 || model.owned().some((l) => game.state.lines[l.id].mgr));
    R.town = reveal.check('town', () => model.ownedCount() >= 3 || data.districts.some((d) => d.permitCost > 0 && !model.districtOpen(d.id) && model.cash() >= d.permitCost * 0.3));
    R.goals = reveal.check('goals', () => model.ownedCount() >= 3 || model.contracts().some((c) => c.done));
    const ssn = model.season();
    R.season = !!ssn && reveal.check('season', () => model.ownedCount() >= 3);
    R.postcard = reveal.check('postcard', () => model.housingTier() > 0 || model.ownedCount() >= 4);
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
    if (game.state.lines[id].lv <= 0) {
      const ghost = id === cc.nextGhost && (cc.started || c.line.order === 0) && model.districtOpen(c.line.district);
      c.setMode(ghost ? 'ghost' : 'hidden');
      if (ghost) c.update(model, { qty });
      return;
    }
    c.update(model, { qty, pinOK: R.pin, pinned: cc.pinned, revealGlyph: revealGlyphFn(id), eventOn: !!cc.evLines?.has(id) });
    if (cc.compactOn && !c.wantsAttention && !c.wanted && cc.pinned !== id) c.setMode('compact');
    else { if (c.wantsAttention) c.want(4000); c.setMode('full'); }
    syncFps(c);
  }

  function updateAllCards(now) {
    if (seasonCards.on) { for (const c of cards.values()) c.setMode('hidden'); gate.root.hidden = true; return; }
    const cc = cardCtx();
    for (const c of cards.values()) updateCard(c, cc, now);
  }

  // Visible cards refresh at 4 Hz, the rest at 1 Hz, at most 3 per slice.
  let cardCursor = 0;
  const cardList = [];
  function cardsJob(now) {
    if (seasonCards.on) return;
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

  function updateGate() {
    if (seasonCards.on) { gate.root.hidden = true; return; }
    gate.update(model.started(), R);
  }

  function focusLabel() {
    const id = rig().current;
    const on = model.started() && !town.active && !!id && id[0] !== '@';
    show(focusChip, on);
    if (!on) return false;
    const h = model.home();
    const l = lineById[id];
    const sv = model.season()?.active && model.season().def.lines.find((x) => x.basePlot === id);
    const text = sv ? sv.emoji + ' ' + sv.name : l ? l.emoji + ' ' + l.name : `${h.emoji} ${model.housingTier() ? 'Home · ' + h.name : 'Your bench'}`;
    if (text === focusChip.textContent) return false;
    focusChip.textContent = text;
    return true;
  }

  function updateHeroChrome() {
    focusLabel();
    const pinned = rig().pinned;
    show(pinChip, !!pinned && !town.active);
    if (pinned) setText(pinChip, '📌 ' + lineById[pinned].emoji + ' ✕');
    show(qtyBar, R.qty);
    show(camBtn, R.postcard);
    syncJump();
  }

  function hints() {
    const st = game.state;
    if (!st.bootstrap.done) {
      if (st.bootstrap.cans === 0 && game.state.cash < 50) coach.show('tap', heroWrap.querySelector('.hero-tapzone'), '👆', { ms: Infinity });
      if (st.bootstrap.cans >= 3 && !binAnchor.hidden) coach.show('bin', binAnchor, '♻️', { ms: Infinity });
      coach.tick();
      return;
    }
    if (coach.current === 'tap' || coach.current === 'bin') { coach.done('tap'); coach.done('bin'); }
    const first = model.owned()[0];
    if (first) {
      const c = cards.get(first.id);
      const s1 = model.stats(first.id);
      if (s1.managed) { if (coach.current === 'pile') coach.done('pile'); }
      else if (c.mode === 'full' && s1.stockRatio > 0) coach.show('pile', c.view, '👆 Tap to sell stock', { ms: Infinity, at: 'inside' });
      if (reveal.is('h:pile')) {
        if (c.mode === 'full') coach.show('shelf', c.card.querySelector('.badge'), '📦 Unsold stock', { ms: 6000, at: innerWidth < 640 ? 'below' : 'above' });
        if (c.glyphs.level.b.classList.contains('can')) coach.show('level', c.glyphs.level.b, '⬆ Level up');
      }
      if (s1.full && reveal.mark('h:full')) toasts.cardToast(c.card, '📦 Shelf full · tap to sell');
    }
    const tab = (id) => tabs.el.querySelector(`[data-tab="${id}"]`);
    const nh = R.life && model.nextHome();
    if (nh && model.q('housing', { tier: model.housingTier() + 1 }).affordable) coach.show('home:' + nh.id, tab('life'), nh.emoji + ' Move in!', { ms: 15000 });
    if (R.crew && model.tickets() > 0) coach.show('tickets', tab('crew'), '🎟️ Level up crew');
    if (R.crew && model.freeItemCount() > 0) coach.show('gear', tab('crew'), '🎁 Equip gear');
    if (R.qty) coach.show('qty', qtyBar, '');
    if (R.pin) { const c = cards.get(model.owned()[1]?.id); if (c?.mode === 'full') coach.show('pin', c.card.querySelector('.pin'), ''); }
    tabs.hintNew(coach);
    if (R.season) coach.show('season', hud.seasonBtn, '', { at: 'below' });
    if (R.postcard) coach.show('postcard', camBtn, '📷 Postcard', { at: 'below' });
    coach.tick();
  }

  function coreJob() {
    computeReveals();
    hud.update(model, R);
    root.classList.toggle('in-season', !!model.season()?.active);
    updateHeroChrome();
    tabs.update(R);
  }

  const jobs = [
    { ms: 60, fn: cardsJob },
    { ms: 250, fn: coreJob },
    { ms: 160, fn: () => events.update() },
    { ms: 250, fn: () => sheets.update() },
    { ms: 250, fn: () => seasonCards.update() },
    { ms: 500, fn: updateGate },
    { ms: 400, fn: hints },
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
    seasonCards.update();
    updateAllCards(now);
    updateGate();
    events.update();
    sheets.update();
    hints();
  }

  const smooth = () => (doc.classList.contains('calm') ? 'auto' : 'smooth');
  function toTop() { scrollTo({ top: 0, behavior: smooth() }); }
  function toBottom() { scrollTo({ top: doc.scrollHeight, behavior: smooth() }); }
  function heroInView() { if (!heroOn) scrollTo({ top: 0, behavior: 'auto' }); }

  let jumpKey = '';
  function syncJump() {
    if (!jump) return;
    const y = scrollY, vh = innerHeight;
    const up = !desktop && !heroOn && !town?.active, down = !town?.active && docH - y - vh > vh * 0.6 && model.started();
    const q = up && R.qty;
    const key = +up + '' + +down + +q + qty;
    if (key === jumpKey) return;
    jumpKey = key;
    show(jumpUp, up);
    show(jumpDown, down);
    show(jumpQty, q);
    if (q) setText(jumpQty, qty === 'max' ? 'MAX' : '×' + qty);
    show(jump, up || down);
  }

  function onScroll() { syncJump(); }

  function layoutMode() {
    desktop = innerWidth >= 900;
    syncJump();
  }

  function showGfxChip(on) {
    show(gfxChip, on);
  }

  const ctx = {
    game, host, bus, data, model, audio, buzz, geo,
    get qty() { return qty; },
    toast: (t, o) => toasts.toast(t, o),
    get sheets() { return sheets; },
    get juice() { return juice; },
    openManager, openLine: onInfo, flyTo,
    openLife: () => openTab('life'),
    textNow, cards, rig,
    townActive: () => !!town?.active,
    heroView: () => heroView,
    postcard: () => postcard.take(),
    releaseEvent: (id) => events.release(id),
    celebrate: (text) => { juice.stamp(heroWrap, text); audio.sfx.chime(); },
    gearText, onGear: () => onGear(), heroTip: (...a) => heroTip(...a),
  };

  function openTab(id) {
    if (id === 'lines') { if (tabs.current === 'lines' && !town.active) toTop(); sheets.close(); town.close(); tabs.set('lines'); return; }
    if (id === 'town') { sheets.close(); town.open(); tabs.set('town'); coach.done('tab:town'); return; }
    town.close();
    const specs = {
      life: { id: 'life', title: '🏠 Life', fill: (b) => fillLife(b, ctx) },
      crew: { id: 'crew', title: '🕴 Crew', fill: (b) => fillCrew(b, ctx) },
      goals: { id: 'goals', title: '🏆 Goals', fill: (b) => fillGoals(b, ctx) },
    };
    sheets.open(specs[id]);
    tabs.set(id);
    coach.done('tab:' + id);
    const nh = model.nextHome();
    const done = id === 'crew' ? ['gear', 'tickets', 'merge'] : id === 'life' ? ['offer:partner', 'offer:dog', nh ? 'home:' + nh.id : ''] : [];
    for (const h of done) if (h && coach.current === h) coach.done(h);
  }

  function gearText(items) {
    if (!items?.length) return '';
    if (items.length > 1) return `🎁 ${items.length} new gear · Crew`;
    const it = items[0], d = model.itemById[it.def];
    return `${d?.emoji || '🎁'} ${it.rarity === 2 ? 'Epic ' : it.rarity === 1 ? 'Rare ' : 'New: '}${d?.name || 'gear'}`;
  }

  function mergeable() {
    const n = {};
    for (const it of game.state.items) { const k = it.def + ':' + it.rarity; n[k] = (n[k] || 0) + 1; if (n[k] >= 3 && it.rarity < 2) return true; }
    return false;
  }

  function onGear() {
    computeReveals();
    tabs.update(R);
    const crewTab = tabs.el.querySelector('[data-tab="crew"]');
    if (!R.crew) return;
    if (mergeable()) coach.show('merge', crewTab, '✨ Merge 3 alike');
    coach.show('gear', crewTab, '🎁 Equip gear');
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

  // Toast items that arrive outside a flow that already shows them (crates from goals, season, orders).
  let itemBuf = [], itemTimer = 0;
  function itemToast({ item, source }) {
    if (source === 'rush' || source === 'lucky' || source === 'merge') return;
    itemBuf.push(item);
    clearTimeout(itemTimer);
    itemTimer = setTimeout(() => {
      toasts.toast(gearText(itemBuf), { cls: 'gold', ms: 2600 });
      onGear();
      itemBuf = [];
    }, 250);
  }

  function onGameEvents() {
    game.on('milestone', ({ lineId }) => {
      const c = cards.get(lineId);
      c.milestone();
      juice.stamp(c.card, '×2');
      buzz(20);
    });
    game.on('life:beat', (b) => {
      if (b.kind === 'heir') {
        const msg = `🧑‍🎓 Your ${kin(b.name)} ${b.name} wants to learn the trade`;
        audio.sfx.chime();
        setTimeout(() => toasts.toast(msg, { ms: 5000, cls: 'beat' }), 600);
        if (R.life) coach.show('heirtab:' + b.kidId, tabs.el.querySelector('[data-tab="life"]'), '🌅 An heir', { ms: 12000 });
        textNow();
        return;
      }
      const text = BEAT[b.kind] || (b.kind === 'grow' ? `🎂 ${b.name} · ${b.stage}` : null);
      if (text) {
        audio.sfx.chime();
        toasts.toast(text, { ms: 2600, cls: 'beat' });
        if (BEAT[b.kind]) {
          if (R.postcard) restartAnim(camBtn, 'offer');
          else { postcard.offer(); coach.show('postcard-offer', postcard.chip, '📷 Snap a postcard', { ms: 8000 }); }
        }
      }
      textNow();
    });
    game.on('life:offer', ({ kind }) => {
      toasts.toast(kind === 'partner' ? '💞 Someone likes you · Life' : '🐕 A stray pup · Life', { ms: 3200, cls: 'beat' });
      if (R.life) coach.show('offer:' + kind, tabs.el.querySelector('[data-tab="life"]'), kind === 'partner' ? '💞 Meet them' : '🐕 Adopt?');
    });
    game.on('harvest', ({ lineId }) => toasts.cardToast(cards.get(lineId).card, '🌙 Welcome back · ×1.5'));
    game.on('unlocked', ({ lineId }) => { const c = cards.get(lineId); if (c.mode === 'ghost') celebrateUnlock(lineId); });
    game.on('offline', ({ report }) => offline.show(report));
    game.on('item', itemToast);
    game.on('achievement', ({ achievement: a }) => toasts.toast(`🏅 ${a.emoji} ${a.name} · +1%`, { ms: 2600, cls: 'gold' }));
    game.on('order:done', ({ order, cash }) => {
      const c = cards.get(order.lineId);
      toasts.cardToast(c.card, `📦 Order filled · +${fmtCash(cash)}`);
      audio.sfx.kaching();
    });
    game.on('event:claim', ({ event, reward, by }) => {
      if (by === 'dog') toasts.toast(`🐕 ${game.state.life.dog.name} fetched ${event.emoji} +${fmtCash(reward.cash)}`, { cls: 'gold' });
    });
    game.on('season', (e) => {
      model.seasonDirty();
      if (e.kind !== 'rank') return;
      const w = e.reward;
      const k = w.keepsake && data.keepsakes[w.keepsake], m = w.manager && model.mgrById[w.manager];
      const what = k ? `${k.emoji} ${k.name}` : m ? `${m.emoji} ${m.name} joins` : w.tickets ? `+${w.tickets} 🎟️ tickets` : '🎁 Gear';
      toasts.toast(`🎃 Rank ${e.rank}: ${what}`, { ms: 3000, cls: 'gold' });
    });
    game.on('district', () => { for (const c of cards.values()) c.at = 0; });
    game.on('pileSold', ({ auto }) => { if (!auto) coach.done('pile'); });
    game.on('courier:spawn', () => heroTip('courier', '🛵 Tap couriers for tips'));
    game.on('event:spawn', ({ event: ev }) => {
      if (ev.kind === 'rush' && !minis.active) heroTip('rush', '⏰ Rush Hour! Tap the clock', { once: false, ms: 4500 });
      else if (ev.kind === 'lucky' && !minis.active) heroTip('lucky', '🎁 Runaway parcel! Tap it', { once: false, ms: 4000 });
      else if (ev.kind === 'pigeon') heroTip('pigeon', '🕊️ Catch the golden pigeon');
    });
    bus.on('graphics:paused', () => showGfxChip(true));
    bus.on('graphics:resumed', () => showGfxChip(false));
  }

  const ui = {
    mount(r) {
      root = r;
      root.replaceChildren();
      root.classList.add('il2');
      applyCalm();
      const app = el('div', 'app');
      hud = createHud({
        onSettings: () => sheets.open({ id: 'settings', title: '⚙️ Settings', fill: (b) => fillSettings(b, ctx) }),
        onLife: () => (R.life ? openTab('life') : null),
        onTickets: () => (R.crew ? openTab('crew') : toasts.toast('🎟️ Tickets level up managers')),
        onSeason: () => sheets.open({ id: 'season', title: "🎃 Hollow's Eve", cls: 'spooky', fill: (b) => fillSeason(b, ctx) }),
      });
      heroWrap = el('section', 'hero');
      heroView = el('div', 'hero-view');
      const tapzone = el('div', 'hero-tapzone');
      heroView.addEventListener('click', onHeroTap);
      binAnchor = btn('bin-anchor', '', (e) => { e.stopPropagation(); cashIn(e); }, 'Recycling bin');
      binAnchor.hidden = true;
      canChip = el('div', 'can-chip');
      canChip.hidden = true;
      binAnchor.appendChild(canChip);
      pinChip = btn('hero-chip pin-chip', '', (e) => { e.stopPropagation(); const g = rig(); if (g.pinned) onPin(g.pinned); }, 'Resume tour');
      pinChip.hidden = true;
      focusChip = el('div', 'hero-chip focus-chip');
      focusChip.hidden = true;
      tipChip = btn('hero-chip hero-tip', '', (e) => { e.stopPropagation(); show(tipChip, false); }, 'Dismiss tip');
      tipChip.hidden = true;
      camBtn = btn('hero-btn cam', '📷', (e) => { e.stopPropagation(); coach.done('postcard'); postcard.take(); }, 'Postcard');
      camBtn.hidden = true;
      gfxChip = btn('hero-chip gfx-chip', '⚠️ Graphics paused · tap to restart', (e) => {
        e.stopPropagation();
        if (host.restart()) { showGfxChip(false); toasts.toast('✨ Graphics back'); }
        else location.replace(location.pathname + '?v=' + Date.now());
      }, 'Restart graphics');
      gfxChip.hidden = true;
      qtyBar = el('div', 'qty');
      qtyBar.hidden = true;
      qtyBtns = [1, 10, 'max'].map((v) => {
        const b = btn('qty-btn', v === 'max' ? 'MAX' : '×' + v, (e) => {
          e.stopPropagation();
          setQty(v);
        });
        b.dataset.q = String(v);
        b.classList.toggle('on', String(v) === String(qty));
        return b;
      });
      qtyBar.append(...qtyBtns);
      heroWrap.append(heroView, tapzone, binAnchor, pinChip, focusChip, tipChip, camBtn, gfxChip, qtyBar);
      jump = el('div', 'jump');
      jumpQty = btn('jump-btn qty-mini', '', () => { const vals = [1, 10, 'max']; setQty(vals[(vals.indexOf(qty) + 1) % 3]); }, 'Buy amount');
      jumpUp = btn('jump-btn', '⤒', toTop, 'Jump to top');
      jumpDown = btn('jump-btn', '⤓', toBottom, 'Jump to newest');
      jump.append(jumpQty, jumpUp, jumpDown);
      jump.hidden = jumpQty.hidden = jumpUp.hidden = jumpDown.hidden = true;
      hud.root.querySelector('.hud-money').addEventListener('click', (e) => { if (!e.target.closest('button')) toTop(); });

      const side = el('div', 'side');
      list = el('main', 'lines');
      gate = createGate(ctx);
      seasonCards = createSeasonCards(list, ctx);
      side.append(list, gate.root, el('div', 'list-end'));
      app.append(hud.root, heroWrap, side);
      root.append(app, jump);

      toasts = createToasts(root);
      juice = createJuice({ root, target: () => hud.cashEl, audio });
      sheets = createSheets(root, { onChange: (id) => { root.classList.toggle('sheet-open', !!id); if (!id && !town?.active) tabs?.set('lines'); } });
      reveal = createReveal({ game, onReveal: (id) => root.classList.add('rv-' + id) });
      coach = createCoach({ reveal });
      tabs = createTabs(root, { onTab: openTab, model });
      town = createTown(heroWrap, ctx, { onClose: () => { root.classList.remove('town'); tabs.set('lines'); onScroll(); }, onOpen: () => { root.classList.add('town'); scrollTo({ top: 0 }); onScroll(); } });
      events = createEvents(heroWrap, ctx, { onMini: (kind, ev) => { heroInView(); minis.start(kind, ev); }, heroOn: () => heroOn || desktop, toHero: (id) => { toTop(); rig().cut(id); } });
      minis = createMinigames(heroWrap, ctx);
      offline = createOffline(root, ctx);
      postcard = createPostcard(heroWrap, ctx);

      host.addView('hero', heroView, { kind: 'hero', priority: 10 });
      const io = new IntersectionObserver((es) => {
        for (const e of es) {
          const c = e.target.__card;
          if (e.isIntersecting) { visibleCards.add(c); if (performance.now() - c.at > 250) c.at = 0; } else visibleCards.delete(c);
        }
      });
      for (const line of data.lines) {
        const c = createLineCard(line, { onAct, onInfo, onPin, onViewTap, onExpand });
        c.card.__card = c;
        list.appendChild(c.card);
        cards.set(line.id, c);
        cardList.push(c);
        host.addView('line:' + line.id, c.view, { kind: 'line', lineId: line.id });
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
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', layoutMode);
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyCalm);
      layoutMode();
      const tier = model.setting('tier', 'auto');
      if (tier !== 'auto' && !new URLSearchParams(location.search).has('tier')) host.setTier(tier === 'low' ? 'battery' : tier);
      if (/[?&]reset=1/.test(location.search)) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])reset=1&?/, '$1').replace(/[?&]$/, ''));
      if (host.paused) showGfxChip(true);
      textNow();
      window.__il2ui = ui;
    },
    update(now) {
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
      lastFrame = now;
      const st = game.state;
      hud.frame(dt, st.cash);
      for (const c of visibleCards) if (c.mode === 'full' || c.mode === 'compact') c.progress(st.lines[c.line.id].cyc);
      if (!st.bootstrap.done) placeBin();
      else if (!binAnchor.hidden) binAnchor.hidden = true;
      if (!st.bootstrap.done) { show(canChip, st.bootstrap.cans > 0); setText(canChip, '🥫 ' + st.bootstrap.cans); }
      minis.frame(now);
      town.frame(now);
      runJobs(now);
    },
    showOffline(report) { offline.show(report); },
    toast(text, opts) { toasts.toast(text, opts); },
    openTab,
    get debug() { return { model, reveal, R, cards, minis, events, town, postcard, sheets, coach, cashIn, openManager, audio, geo, jobs }; },
  };
  return ui;
}

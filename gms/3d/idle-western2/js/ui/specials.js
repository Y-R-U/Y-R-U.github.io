import { el, btn, setText } from './dom.js?v=20261004b';
import { fmtCash } from '../state/format.js?v=20261004b';

// W8/W9 specials. The state spawns a special in wind-up (`special:wind`): we ring the bell, show a chip, and call
// `special:begin` once the hero (or, for a brawl, the Saloon card) has been on screen for WIND_MS. Never begun, it
// expires gracefully. Whoever begins it, `special:start` opens our overlay. With Spectacle live (lane S) the 3D scene
// owns the timeline and the actors: we draw the letterbox, DRAW!, score and result, and route taps to its picks.
// Without it, DOM stand-ins run the whole thing.
const BOX = { gold: '💰 Gold strongbox', silver: '🧰 Silver strongbox', basic: '📦 Strongbox' };
const TIER = { gold: 'GOLD', silver: 'SILVER', basic: 'BASIC' };
const WIND_MS = 1700;
const SPOILERS = [['🐴', 'A horse wanders into the line of fire…'], ['🥴', 'Pickles staggers between you…'], ['🪰', 'A fly lands on his nose…']];
const OPPONENTS = ['Black Bart', "Pomfrey's hired gun", 'Mortimer’s “nephew”', 'A nun (it’s Bart)', 'Slick Vinnie'];
const HEAD = { brawl: '🍺 Tap the flying bodies!', robbery: '💰 Grab the money bags!', stagecoach: '🐎 Stagecoach! Pick a passenger' };

export function createSpecials(hero, ctx, { heroVisible, cardFor, toHero, spectacle }) {
  const { game, audio, model } = ctx;
  const chip = btn('sp-chip', '', (e) => { e.stopPropagation(); if (pending && !heroVisible()) { toHero(); audio.sfx.whoosh(); } }, 'Special event');
  chip.hidden = true;
  (hero.closest('.iw2') || document.body).appendChild(chip);
  const layer = el('div', 'mini-layer');
  layer.hidden = true;
  layer.addEventListener('pointerdown', (e) => duelTap(e), true);
  let pending = null, cur = null;

  game.on('special:wind', ({ event }) => {
    pending = { ev: event, at: performance.now(), ready: 0 };
    audio.sfx.bell();
    setTimeout(() => audio.sfx.bell(), 900);
    paintChip();
  });
  // The wind-up chip goes the moment the special opens, so it never sits over the duel title or the timer (B9).
  game.on('special:start', ({ event }) => {
    if (pending?.ev.id === event.id) {
      pending = null;
      chip.classList.add('fade');
      setTimeout(() => { if (!pending) { chip.hidden = true; chip.classList.remove('fade'); } }, 220);
    }
    if (!cur) open(event);
  });
  game.on('special:end', ({ event, expired, reward }) => {
    if (pending?.ev.id === event.id) {
      pending = null;
      chip.classList.add('fade');
      setTimeout(() => { chip.hidden = true; chip.classList.remove('fade'); }, 600);
      if (expired) ctx.toast(`${event.emoji} The ${event.name.toLowerCase()} wandered off`, { ms: 1800, cls: 'soft' });
    }
    if (cur?.ev.id === event.id && !cur.done) finish(reward, true);
  });
  game.on('brawl:hit', ({ n }) => { if (cur?.kind === 'brawl') score(n, `🍺 ${n}/${cur.max} flattened`); });
  game.on('robbery:hit', ({ n }) => { if (cur?.kind === 'robbery') score(n, `💰 ${n}/${cur.max}`); });

  function paintChip() {
    if (!pending) return;
    const e = pending.ev;
    const vis = heroVisible();
    const key = e.id + vis;
    if (chip.dataset.k === key && !chip.hidden) return;
    chip.dataset.k = key;
    chip.replaceChildren(el('span', 'sp-bell', '🔔'), el('b', '', `${e.emoji} ${e.name}!`), el('small', '', vis ? 'Get ready…' : '⤒ Watch'));
    chip.hidden = false;
    chip.classList.toggle('away', !vis);
  }

  function where(kind) {
    if (heroVisible()) return { box: hero, inHero: true };
    if (kind === 'brawl') { const c = cardFor('saloon'); if (c) return { box: c, inHero: false }; }
    return null;
  }

  function begin() {
    const e = pending.ev;
    if (cur || ctx.captions.active || ctx.townActive() || !where(e.kind)) return;
    game.act('special:begin', { id: e.id });
  }

  function open(e) {
    const w = where(e.kind) || { box: hero, inHero: true };
    const follow = spectacle.has(e.kind) && w.inHero;
    cur = { ev: e, kind: e.kind, box: w.box, inHero: w.inHero, follow, t0: performance.now(), hits: 0, done: false, targets: [], max: e.game?.max || 0, sec: e.game?.sec || 20 };
    w.box.appendChild(layer);
    layer.hidden = false;
    layer.replaceChildren();
    layer.className = 'mini-layer ' + e.kind + (follow ? ' follow' : '');
    w.box.classList.add('mini-on');
    ctx.bus.emit('ui:special', { kind: e.kind, phase: 'start', id: e.id, inHero: w.inHero });
    if (w.inHero && !follow) ctx.rig().cutIn(e.lineId || 'hub', cur.sec + 2, 'special');
    if (e.kind === 'duel') startDuel();
    else {
      head(HEAD[e.kind] || e.name);
      cur.dom = !follow;
      cur.spawnAt = 0;
      if (e.kind === 'brawl') audio.music.want('saloon', { now: true });
      if (e.kind === 'robbery') audio.music.want('robbery', { now: true });
      if (e.kind === 'stagecoach') { audio.stinger('st_coach'); if (!follow) passengers(); }
    }
  }

  function head(text) {
    const h = el('div', 'mini-head');
    const s = el('div', 'mini-score', text);
    const timer = el('div', 'mini-timer');
    timer.appendChild(el('i'));
    h.append(s, timer);
    layer.appendChild(h);
    cur.ui = { score: s, fill: timer.firstChild, lastP: '' };
  }
  function score(n, text) {
    cur.hits = n;
    if (cur.ui) setText(cur.ui.score, text);
  }

  function finish(reward, fromState = false) {
    if (!cur || cur.done) return;
    const g = cur;
    g.done = true;
    if (!fromState && g.kind !== 'duel') {
      const r = game.act('claimEvent', { eventId: g.ev.id, score: g.hits, lineId: g.lineId });
      reward = r.reward || reward;
    }
    resultCard(g, reward || {});
    ctx.bus.emit('ui:special', { kind: g.kind, phase: 'end', id: g.ev.id, reward });
    setTimeout(() => {
      if (cur !== g) return;
      cur = null;
      layer.hidden = true;
      layer.replaceChildren();
      g.box.classList.remove('mini-on', 'duel-on', 'duel-eyes');
      ctx.textNow();
    }, g.kind === 'duel' ? 2800 : 1900);
  }

  function resultCard(g, rw) {
    let line;
    if (g.kind === 'duel') {
      if (rw.early) line = '🦶 You shot your own boot!';
      else line = rw.ms != null && rw.ms < 9000 ? `${Math.round(rw.ms)} ms · ${TIER[rw.tier] || ''}` : 'Too slow. He fainted anyway.';
    } else if (g.kind === 'brawl') line = `🍺 ${rw.score ?? g.hits} knocked flat`;
    else if (g.kind === 'robbery') line = rw.caught ? `🐎 Bart caught! +🦷${rw.teeth || 2}` : '🐎 Bart hit a low sign. Again.';
    else if (g.kind === 'stagecoach') line = rw.lineId ? `🐎 ${model.line(rw.lineId)?.emoji || ''} ×${rw.mult} for ${rw.sec}s` : '🐎 Passengers delivered';
    const loot = [];
    if (rw.cash > 0) loot.push('+' + fmtCash(rw.cash));
    for (const b of rw.boxes || []) loot.push(BOX[b] || '📦');
    const card = el('div', 'mini-result ' + (rw.tier || ''));
    card.append(el('b', '', line || '✨'), el('small', '', loot.join(' · ')));
    layer.appendChild(card);
    if ((rw.boxes || []).length) { audio.stinger('st_box'); ctx.onBox?.(); }
    else audio.sfx.chime();
    ctx.buzz(20);
  }

  // ---- duel (W8: over the shoulder → eyes → DRAW; Gold < 380 ms, Silver < 550 ms from the DRAW frame) ----
  function startDuel() {
    const g = cur;
    g.box.classList.add('duel-on');
    const bars = el('div', 'duel-bars');
    const title = el('div', 'duel-title', 'HIGH NOON');
    const sub = el('div', 'duel-sub', OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)]);
    const draw = el('div', 'duel-draw', 'DRAW!');
    const pace = el('div', 'duel-pace', '');
    layer.append(bars, title, sub, pace, draw);
    g.ui = { title, sub, draw, pace };
    g.phase = 'paces';
    audio.music.want('duel', { now: true });
    ctx.barks.wordless('stranger', { force: true });
    if (!g.follow) ownTimeline(g);
  }
  function ownTimeline(g) {
    let n = 0;
    const step = () => {
      if (cur !== g || g.phase !== 'paces') return;
      n++;
      paceTick(n);
      if (n < 10) g.timer = setTimeout(step, 260);
      else eyes();
    };
    g.timer = setTimeout(step, 900);
    function eyes() {
      setPhase('eyes');
      let wait = 1200 + Math.random() * 2000;
      if (Math.random() < 0.3) {
        const [e, t] = SPOILERS[Math.floor(Math.random() * SPOILERS.length)];
        setTimeout(() => { if (cur === g && g.phase === 'eyes') g.ui.sub.textContent = e + ' ' + t; }, wait * 0.5);
        wait += 1600;
      }
      g.timer = setTimeout(() => {
        if (cur !== g || g.phase !== 'eyes') return;
        requestAnimationFrame((t) => { g.drawAt = t; setPhase('draw'); });
        g.timer = setTimeout(() => { if (cur === g && g.phase === 'draw') shoot(null); }, 2600);
      }, wait);
    }
  }
  function paceTick(n) {
    const g = cur;
    setText(g.ui.pace, String(n));
    g.ui.pace.classList.remove('tick'); void g.ui.pace.offsetWidth; g.ui.pace.classList.add('tick');
    audio.sfx.tick();
  }
  function setPhase(ph) {
    const g = cur;
    if (!g || g.phase === ph) return;
    g.phase = ph;
    if (ph === 'eyes') {
      g.ui.pace.textContent = '';
      g.ui.title.textContent = '';
      g.ui.sub.textContent = 'Steady…';
      g.box.classList.add('duel-eyes');
    } else if (ph === 'draw') {
      g.ui.sub.textContent = '';
      g.box.classList.remove('duel-eyes');
      g.ui.draw.classList.add('on');
      audio.sfx.gun();
    }
    ctx.bus.emit('ui:duel', { phase: ph, id: g.ev.id });
  }

  function duelTap(e) {
    const g = cur;
    if (!g || g.kind !== 'duel' || g.done) return;
    e.stopPropagation();
    e.preventDefault();
    if (g.phase === 'over') return;
    const sd0 = g.follow ? spectacle.duel() : null;
    const sd = sd0 && sd0.id === g.ev.id ? sd0 : null;
    const drawAt = sd?.drawAt || g.drawAt;
    if (drawAt && e.timeStamp >= drawAt) shoot(Math.max(0, e.timeStamp - drawAt));
    else shoot('early');
  }

  function shoot(ms) {
    const g = cur;
    if (!g || g.phase === 'over') return;
    clearTimeout(g.timer);
    g.phase = 'over';
    g.box.classList.remove('duel-eyes');
    audio.sfx.gun();
    setTimeout(() => audio.sfx.ricochet(), 120);
    const payload = ms === 'early' ? { id: g.ev.id, early: true } : ms == null ? { id: g.ev.id, ms: 9999 } : { id: g.ev.id, ms: Math.round(ms) };
    const r = game.act('duel:result', payload);
    if (ms === 'early') { setTimeout(() => audio.sfx.tuba(), 300); ctx.barks.wordless('stranger', { force: true }); }
    ctx.bus.emit('ui:duel', { phase: 'result', id: g.ev.id, ...payload, tier: r.reward?.tier });
    finish({ ...(r.reward || {}), ms: ms === 'early' || ms == null ? null : ms, early: ms === 'early' }, true);
  }

  // Follow Spectacle's duel timeline: paces → standoff/ECU (eyes) → draw.
  function followDuel() {
    const g = cur, sd0 = spectacle.duel(), sd = sd0 && sd0.id === g.ev.id ? sd0 : null;
    if (!sd && performance.now() - g.t0 > 1500 && g.phase === 'paces' && !g.pn) { g.follow = false; ownTimeline(g); return; }
    if (!sd || g.phase === 'over') return;
    if (sd.phase === 'paces') {
      const n = Math.min(10, 1 + Math.floor((performance.now() - g.t0) / 300) - 3);
      if (n > 0 && n !== g.pn) { g.pn = n; paceTick(n); }
    } else if (sd.phase === 'standoff' || sd.phase === 'ecu') setPhase('eyes');
    else if (sd.phase === 'draw' && sd.drawAt) setPhase('draw');
  }

  // DOM stagecoach passengers (Spectacle draws real ones when live).
  function passengers() {
    const g = cur;
    const owned = model.owned().slice().sort(() => Math.random() - 0.5).slice(0, 4);
    const hats = ['🎩', '👒', '🤠', '🧢'];
    const row = el('div', 'coach-row');
    owned.forEach((l, i) => {
      const b = btn('passenger', '', (e) => { e.stopPropagation(); g.lineId = l.id; audio.sfx.pop(); finish(null, false); }, 'Send to ' + l.name);
      b.append(el('span', 'ps-hat', hats[i % hats.length]), el('small', '', '→ ' + l.emoji));
      row.appendChild(b);
    });
    layer.appendChild(row);
  }

  // DOM stand-ins for flying brawlers and money bags.
  function hitDom(x, y) {
    const g = cur;
    const r = game.act(g.kind === 'brawl' ? 'brawl:hit' : 'robbery:hit', { id: g.ev.id });
    if (!r.ok) return false;
    feedback(x, y, r);
    return true;
  }
  function feedback(x, y, r) {
    const g = cur;
    if (g.kind === 'brawl') { audio.sfx.punch(); ctx.barks.wordless(['mabel', 'pickles', 'stranger'][(r.n || 0) % 3]); }
    else audio.sfx.coin((r.n || 0) % 10);
    if (r.delta?.cash > 0) ctx.juice.float(g.box, x, y, r.delta.cash, { cls: 'gold' });
    ctx.buzz(8);
    if (g.max && r.n >= g.max) finish(null, false);
  }
  function spawnTarget(now) {
    const g = cur;
    const W = g.inHero ? ctx.geo.viewW : g.box.clientWidth, H = g.inHero ? ctx.geo.heroH : g.box.clientHeight;
    const a = g.inHero ? spectacle.anchor('saloonDoors', g.kind === 'brawl' ? 'saloon' : 'bank') : null;
    const ox = a?.visible ? a.x : W * 0.5, oy = a?.visible ? a.y : H * 0.6;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const em = g.kind === 'brawl' ? ['🤠', '🥴', '🪑', '🧔', '🍾'][Math.floor(Math.random() * 5)] : Math.random() < 0.75 ? '💰' : '🏇';
    const t = btn('mini-target ' + g.kind, em, (e) => {
      e.stopPropagation();
      if (t.dataset.hit) return;
      t.dataset.hit = '1';
      if (hitDom(t._x, t._y)) t.classList.add('hit');
      setTimeout(() => t.remove(), 220);
    }, g.kind === 'brawl' ? 'Flying brawler' : 'Money bag');
    layer.appendChild(t);
    const life = g.kind === 'brawl' ? 1500 + Math.random() * 500 : 1900 + Math.random() * 700;
    const spec = g.kind === 'brawl'
      ? { x0: ox, y0: oy, vx: dir * (W * (0.25 + Math.random() * 0.3)), peak: H * (0.3 + Math.random() * 0.2) }
      : { x0: dir > 0 ? -30 : W + 30, y0: H * (0.45 + Math.random() * 0.35), vx: dir * (W + 60), peak: H * 0.05 };
    g.targets.push({ node: t, born: now, life, spec });
  }

  return {
    get active() { return cur ? cur.kind : null; },
    get pending() { return pending; },
    // A hero tap while a special is live. Spectacle picks carry {act, payload}; we run them and add the juice.
    heroHit(hit, x, y) {
      const g = cur;
      if (!g || g.done) return false;
      if (g.kind === 'duel') return true;
      if (hit?.kind === 'minigame' && hit.act) {
        const r = game.act(hit.act, hit.payload || {});
        if (!r.ok) return true;
        if (hit.act === 'claimEvent') { finish(r.reward, true); return true; }
        feedback(x, y, r);
        return true;
      }
      return false;
    },
    update() {
      if (!pending) return;
      paintChip();
      if (!pending.ready && heroVisible()) pending.ready = performance.now();
      const brawlCard = pending.ev.kind === 'brawl' && !heroVisible() && cardFor('saloon');
      if ((pending.ready && performance.now() - pending.ready > WIND_MS) || brawlCard) begin();
    },
    frame(now) {
      const g = cur;
      if (!g || g.done) return;
      if (g.kind === 'duel') { if (g.follow) followDuel(); return; }
      const left = Math.max(0, 1 - (now - g.t0) / 1000 / g.sec);
      const lp = left.toFixed(2);
      if (g.ui && lp !== g.ui.lastP) { g.ui.lastP = lp; g.ui.fill.style.setProperty('--p', lp); }
      if (left <= 0) { finish(null, false); return; }
      if (!g.dom || g.kind === 'stagecoach') return;
      let alive = 0;
      for (const x of g.targets) {
        if (!x.node.isConnected) continue;
        const u = (now - x.born) / x.life;
        if (u >= 1) { x.node.remove(); continue; }
        alive++;
        if (x.node.dataset.hit) continue;
        const s = x.spec;
        const px = s.x0 + s.vx * u, py = s.y0 - Math.sin(Math.PI * u) * s.peak;
        x.node._x = px; x.node._y = py;
        x.node.style.transform = `translate(${px | 0}px, ${py | 0}px) rotate(${(u * 540 * Math.sign(s.vx)) | 0}deg)`;
      }
      if (now >= g.spawnAt && alive < (g.kind === 'brawl' ? 3 : 5)) { spawnTarget(now); g.spawnAt = now + (g.kind === 'brawl' ? 520 : 300) + Math.random() * 300; }
      if (g.targets.length > 16) g.targets = g.targets.filter((x) => x.node.isConnected);
    },
    debug: { finish: (s) => { if (cur) { cur.hits = s ?? cur.hits; finish(null, false); } }, shoot, get cur() { return cur; } },
  };
}

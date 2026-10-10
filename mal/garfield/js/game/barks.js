import { LINES } from './lines.js';

// Speech + thought bubbles with VO. say(keyOrPrefix): an exact key plays that line; a prefix ('g_idle') draws
// from a shuffled bag of keys sharing it (no repeats until the bag empties, never the same line twice running).

const GAP = 3.5;          // global seconds between non-forced barks
const IDLE_GAP = 14;

export function createBarks(ctx) {
  const bags = new Map();
  const lastPerPrefix = new Map();
  let lastAt = -99, lastKey = null, idleAt = -99, now = 0;
  const pending = [];
  let busyUntil = { jon: 0, garfield: 0 };
  const offs = [];
  // D27: while Jon/Lyman chase him, Garfield's only thought is "Run Now, Nap Later." on repeat
  const RUN_KEY = 'g_runnap', RUN_EVERY = 3.2;
  let runNext = 0, wasChasing = false;
  const chasing = () => {
    const h = ctx.humans?.chasing?.();
    if (h != null) return h;
    const s = ctx.jonAI?.state;
    return s === 'chase' || s === 'glare';
  };

  const names = () => ctx.save?.data?.names || ctx.save?.get?.()?.names || ctx.save?.names || {};
  const manifest = () => ctx.audio?.voLines || {};
  const exists = (k) => !!(LINES[k] || manifest()[k]);
  function lineFor(key) {
    const man = manifest()[key];
    const L = LINES[key];
    if (!L && !man) return null;
    return { who: man?.who || L?.who, text: man?.text || L?.text };
  }
  // A family is every key `prefix_<n>` (LINES ∪ the VO manifest, which media extends), plus `prefix` itself.
  function keysFor(prefix) {
    const re = new RegExp('^' + prefix + '_\\d+$');
    const set = new Set();
    if (exists(prefix)) set.add(prefix);
    for (const k of Object.keys(LINES)) if (re.test(k)) set.add(k);
    for (const k of Object.keys(manifest())) if (re.test(k)) set.add(k);
    return [...set];
  }
  function pick(prefix) {
    const keys = keysFor(prefix);
    if (keys.length <= 1) return keys[0] || null;
    let bag = bags.get(prefix);
    if (!bag || !bag.length) {
      bag = keys.slice().sort(() => Math.random() - 0.5);
      if (bag[bag.length - 1] === lastPerPrefix.get(prefix)) bag.unshift(bag.pop());
      bags.set(prefix, bag);
    }
    const k = bag.pop();
    lastPerPrefix.set(prefix, k);
    return k;
  }
  function customNames() {
    const n = names();
    return !!((n.jon && n.jon !== 'Jon') || (n.garfield && n.garfield !== 'Garfield'));
  }
  // audio.vo plays the _nn take itself when custom names are set; we only need the right subtitle text.
  function resolveName(key) { return customNames() && exists(key + '_nn') ? key + '_nn' : key; }
  function subst(text) {
    const n = names();
    let t = text;
    if (n.garfield && n.garfield !== 'Garfield') t = t.replace(/Garfield/g, n.garfield).replace(/GARFIELD/g, n.garfield.toUpperCase());
    if (n.jon && n.jon !== 'Jon') t = t.replace(/\bJons\b/g, n.jon + 's').replace(/\bJon\b/g, n.jon);
    return t;
  }

  // opts: force (ignore gaps), delay (s), chance (0..1), lowPri (skip if anything said recently), dur override
  function say(keyOrPrefix, opts = {}) {
    if (opts.chance != null && Math.random() > opts.chance) return null;
    if (opts.delay) { pending.push({ at: now + opts.delay, key: keyOrPrefix, opts: { ...opts, delay: 0 } }); return null; }
    const key0 = pick(keyOrPrefix);
    if (!key0) return null;
    const key = resolveName(key0);
    const L = lineFor(key);
    if (!L) return null;
    if (L.who === 'garfield' && !key.startsWith(RUN_KEY) && chasing()) return null;
    if (!opts.force) {
      if (now - lastAt < (opts.lowPri ? GAP * 2.5 : GAP)) return null;
      if (key === lastKey) return null;
      if (busyUntil[L.who] > now && !opts.interrupt) return null;
    }
    lastAt = now; lastKey = key;
    const text = subst(L.text);
    const dur = opts.dur || Math.max(1.6, Math.min(5.5, 0.9 + text.length * 0.055));
    busyUntil[L.who] = now + dur;
    let p;
    try {
      p = ctx.ui?.say?.({ who: L.who, text, thought: L.who === 'garfield', dur });
    } catch (e) { console.warn('[barks] ui.say', e); }
    try {
      const vo = ctx.audio?.vo?.(key);
      vo?.then?.((r) => { if (r?.dur) busyUntil[L.who] = Math.max(busyUntil[L.who], now + 0.1); }).catch?.(() => {});
    } catch (e) { /* audio not ready */ }
    ctx.events?.emit?.('bark', { key, who: L.who, text });
    barks.log.push({ t: now, key });
    if (barks.log.length > 200) barks.log.shift();
    return p || Promise.resolve();
  }

  // Cutscene helper: plays exactly this key (with name alt) and resolves after its duration.
  async function line(key, opts = {}) {
    const k = resolveName(key);
    const L = lineFor(k);
    if (!L) return;
    const text = subst(L.text);
    const dur = opts.dur || Math.max(1.4, Math.min(6, 0.9 + text.length * 0.055));
    lastAt = now; lastKey = k;
    let voP = null;
    try { voP = ctx.audio?.vo?.(k); } catch {}
    try { ctx.ui?.say?.({ who: L.who, text, thought: L.who === 'garfield', dur }); } catch {}
    barks.log.push({ t: now, key: k });
    ctx.events?.emit?.('bark', { key: k, who: L.who, text });
    let vd = 0;
    try { const r = await Promise.race([voP, new Promise((r) => setTimeout(r, 200))]); vd = r?.dur || 0; } catch {}
    await new Promise((r) => setTimeout(r, Math.max(dur, vd) * 1000 - 200));
  }

  function update(dt) {
    now += dt;
    const ch = chasing();
    if (ch && !wasChasing) runNext = now + 0.7;
    wasChasing = ch;
    if (ch && now >= runNext && !ctx.director?.active) { runNext = now + RUN_EVERY; say(RUN_KEY, { force: true }); }
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= now) { const p = pending.splice(i, 1)[0]; say(p.key, p.opts); }
    }
  }

  // ---- automatic context barks ----
  const ev = ctx.events;
  const g = () => ctx.controller;
  let jumpY = null, nearFoodAt = -99, scratchMissAt = -99, jumpFailAt = -99;
  if (ev) {
    offs.push(ev.on('idle', () => {
      if (ctx.director?.active || barks.muted) return;
      if (now - idleAt < IDLE_GAP) return;
      idleAt = now;
      say('g_idle');
    }));
    offs.push(ev.on('jump', () => { jumpY = g()?.pos?.y ?? null; }));
    offs.push(ev.on('land', (d) => {
      if (jumpY == null) return;
      const y = d?.y ?? g()?.pos?.y;
      if (y != null && y <= jumpY + 0.05 && now - jumpFailAt > 25 && Math.random() < 0.35) { jumpFailAt = now; say('g_jumpfail'); }
      jumpY = null;
    }));
    offs.push(ev.on('scratch', (d) => {
      if (barks.muted) return;
      if (d?.hit === 'jon') say('g_scratch_hit', { delay: 2.4, chance: 0.6 });
      else if (!d?.hit && now - scratchMissAt > 20 && Math.random() < 0.25) { scratchMissAt = now; say('g_scratch_miss'); }
    }));
  }

  const barks = {
    say, line, pick, update, log: [], muted: false, chasing,
    lineText: (key) => { const L = lineFor(resolveName(key)); return L ? subst(L.text) : ''; },
    near(foodKind) {
      if (now - nearFoodAt < 30) return;
      nearFoodAt = now;
      say(Math.random() < 0.6 ? 'g_near_' + foodKind : 'g_near');
    },
    get now() { return now; },
    dispose() { offs.forEach((f) => f?.()); pending.length = 0; },
  };
  return barks;
}

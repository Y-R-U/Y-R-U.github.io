import { el } from './dom.js?v=20261004h';

// W5 bark layer. The state picks speakers and emits `bark {char, trig, prio}`; this layer owns the one global sentence
// budget (PT2#4): ambient sentences (state idle/event barks, Spectacle's gags) one per 30–45 s and one per character
// per 90 s, player-caused fling payoffs ≥ 12 s apart, taps ≥ 10 s apart, priority beats always. No line repeats
// within 10 min (silence/wordless instead), unplayed lines first. Wordless clips fill the gaps, bubble-free.
// Priority barks wait until the manifest is indexed and audio runs (PT2#5: the opening "And STAY out!").
const NO_REPEAT_MS = 10 * 60e3, TAP_COOLDOWN = 20e3, WORDLESS_GAP = 3000, ANCHOR_HZ = 33;
const GAP_MIN = 30e3, GAP_MAX = 45e3, CHAR_GAP = 90e3, REACT_GAP = 12e3, TAP_GAP = 10e3, PEND_TTL = 60e3;
const REACT = new Set(['fling', 'fling_trough', 'fling_dentist', 'fling_jail', 'fling_pomfrey']);
const PLAYED_KEY = 'iw2.barks.played';
const NAMES = { mabel: 'Mabel', pickles: 'Pickles', pomfrey: 'Pomfrey', wendell: 'Wendell', mortimer: 'Mortimer', lulu: 'Lulu', pete: 'Pete', nubbin: 'Nubbin', hortense: 'Hortense', thrupp: 'Thrupp', bart: 'Bart', fingers: 'Fingers', mulligan: 'Mick', stranger: 'You', hank: 'Hank' };

export function createBarks({ game, audio, hero, anchorOf, geo, sunday, busy = () => false, avoid = () => null }) {
  let chars = null, skew = 0;
  const clock = () => performance.now() + skew;
  const said = new Map(), tapAt = new Map(), charAt = new Map(), log = [];
  let wordAt = -1e9, lastWord = '', showing = null, queued = null, anchorAt = 0, sentenceAt = -1e9, gapNext = GAP_MIN, unlockAt = 0;
  let pend = [], rect = null, holding = false;
  const played = new Set();
  try { for (const id of JSON.parse(localStorage.getItem(PLAYED_KEY) || '[]')) played.add(id); } catch {}
  audio.onUnlock?.(() => { unlockAt = clock(); });

  const bubble = el('div', 'bubble');
  const box = el('div', 'bubble-box');
  const who = el('b', 'bubble-who');
  const txt = el('span', 'bubble-t');
  box.append(who, txt);
  bubble.appendChild(box);
  bubble.hidden = true;
  hero.appendChild(bubble);

  function index(man, script) {
    const out = {};
    if (man?.vo) {
      for (const [k, c] of Object.entries(man.vo)) out[k] = { name: c.name, lines: c.lines || [], wordless: c.wordless || [] };
    } else if (script?.chars) {
      for (const [k, c] of Object.entries(script.chars)) out[k] = { name: c.name, lines: (c.lines || []).map((l) => ({ ...l, file: null })), wordless: (c.wordless || []).map((w) => ({ ...w, file: null })) };
    }
    chars = out;
  }
  audio.onManifest.push(index);
  if (audio.manifestDone) index(audio.manifest, audio.script);

  const onceDone = (id) => !!game.state.barks?.once?.[id];
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];

  // strict: nothing fresh → null (silence). Priority beats fall back to the least recently said line.
  function pickLine(char, trig, strict) {
    const c = chars?.[char];
    if (!c) return null;
    const now = clock();
    const of = (t) => c.lines.filter((l) => (l.trig || []).includes(t) && !(l.once && onceDone(l.id)) && !(l.rude && sunday()));
    const pool = of(trig);
    const firsts = pool.filter((l) => l.once);
    if (firsts.length) return rnd(firsts);
    const fresh = (p) => p.filter((l) => now - (said.get(l.id) ?? -Infinity) > NO_REPEAT_MS);
    let f = fresh(pool);
    if (!f.length && trig === 'idle') f = fresh(of('tap'));
    if (!f.length) return strict || !pool.length ? null : pool.sort((a, b) => (said.get(a.id) || 0) - (said.get(b.id) || 0))[0];
    const unplayed = f.filter((l) => !played.has(l.id));
    return rnd(unplayed.length ? unplayed : f);
  }

  function wordless(char, { force = false } = {}) {
    const now = clock();
    if (!force && now - wordAt < WORDLESS_GAP) return false;
    const c = chars?.[char];
    const list = (c?.wordless || []).filter((w) => w.file && w.id !== lastWord);
    if (!list.length) return false;
    const w = rnd(list);
    wordAt = now;
    lastWord = w.id;
    audio.voice(w.file, { delayMax: 400 });
    return true;
  }

  function show(char, line, ms) {
    showing = { char, line, until: performance.now() + ms };
    who.textContent = c_name(char);
    txt.textContent = line.text;
    bubble.hidden = false;
    box.classList.remove('in');
    void box.offsetWidth;
    box.classList.add('in');
    showing.w = box.offsetWidth;
    showing.h = box.offsetHeight;
    anchorAt = 0;
    place(true);
  }
  const c_name = (char) => NAMES[char] || chars?.[char]?.name?.split(' ')[0] || char;

  function hide() {
    showing = null;
    rect = null;
    bubble.hidden = true;
    if (queued) { const q = queued; queued = null; say(q.char, q.trig, q.prio); }
  }

  const ready = () => !!chars && (audio.running || (unlockAt > 0 && clock() - unlockAt > 1500));
  const kindOf = (trig, prio, tap) => (tap ? 'tap' : prio ? 'prio' : REACT.has(trig) ? 'react' : 'ambient');

  // gated (Spectacle's gags) is kept for callers; every non-priority sentence goes through the same budget now.
  // staged: Spectacle's own opening (Mabel at the doors) replaces the state's randomly picked opening speaker.
  async function say(char, trig, prio = false, { gated = false, tap = false, staged = false, late = false } = {}) {
    const now = clock();
    if (!ready()) {
      if (prio && !tap) {
        const i = pend.findIndex((p) => p.trig === trig);
        if (i >= 0) { if (staged) pend[i] = { char, trig, at: now }; }
        else if (pend.length < 3) pend.push({ char, trig, at: now });
      }
      return false;
    }
    if (showing || holding) {
      if (prio && !tap) queued = { char, trig, prio };
      return false;
    }
    const kind = kindOf(trig, prio, tap);
    if (busy() && kind !== 'prio') return false;
    const since = now - sentenceAt;
    if (kind === 'ambient' && (since < gapNext || now - (charAt.get(char) ?? -Infinity) < CHAR_GAP)) return wordless(char) && false;
    if (kind === 'react' && since < REACT_GAP) return wordless(char) && false;
    if (kind === 'tap' && since < TAP_GAP) return false;
    const line = pickLine(char, trig, kind !== 'prio');
    if (!line) { if (kind !== 'tap') wordless(char); return false; }
    said.set(line.id, now);
    sentenceAt = now;
    gapNext = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    charAt.set(char, now);
    log.push({ t: now, char, trig, id: line.id, kind });
    if (log.length > 200) log.shift();
    if (!played.has(line.id)) {
      played.add(line.id);
      try { localStorage.setItem(PLAYED_KEY, JSON.stringify([...played])); } catch {}
    }
    if (line.once) game.act('barkOnce', { id: line.id });
    const words = line.text.split(/\s+/).length;
    const ms = Math.max(1800, Math.min(5200, (line.dur ? line.dur * 1000 : 0) + 900, 900 + words * 360));
    const T = Math.max(ms, (line.dur || 0) * 1000 + 600);
    // A queued beat right after the unlock waits (≤ 4 s) for its clip to decode so voice and bubble land together.
    if (late && line.file) {
      holding = true;
      Promise.race([audio.voice(line.file, { delayMax: 4000 }), new Promise((r) => setTimeout(r, 4200))]).finally(() => { holding = false; show(char, line, T); });
      return true;
    }
    show(char, line, T);
    if (line.file) audio.voice(line.file);
    return true;
  }

  function flushPending() {
    if (!pend.length || showing || holding || !ready()) return;
    const now = clock();
    pend = pend.filter((p) => now - p.at < PEND_TTL);
    const p = pend.shift();
    if (p) say(p.char, p.trig, true, { late: true });
  }

  // Clamped by the bubble's measured size so it never clips the viewport edge (PT2#10) or sits under the ribbon.
  function place(force) {
    if (!showing) return;
    const now = performance.now();
    if (!force && now - anchorAt < 1000 / ANCHOR_HZ) return;
    anchorAt = now;
    const a = anchorOf(showing.char);
    const W = geo.viewW || 400, H = geo.heroH || 400;
    const bw = Math.min(showing.w || 140, W - 16), bh = showing.h || 50;
    let x = W / 2, y = 62, pinned = true;
    if (a && a.visible) { x = a.x; y = a.y; pinned = false; }
    x = Math.max(8 + bw / 2, Math.min(W - 8 - bw / 2, x));
    if (pinned) y = Math.max(56, Math.min(H - 64 - bh, y));
    else y = Math.max(56 + bh + 14, Math.min(H - 8, y));
    // Steer under a card that owns the top of the hero (the hat promotion), never behind it.
    const o = avoid();
    if (o) {
      const top = pinned ? y : y - 14 - bh;
      if (x - bw / 2 < o.r + 6 && x + bw / 2 > o.l - 6 && top < o.b + 6 && top + bh > o.t - 6) y = pinned ? o.b + 10 : o.b + 10 + bh + 14;
    }
    bubble.classList.toggle('pinned', pinned);
    bubble.style.transform = `translate3d(${x | 0}px, ${y | 0}px, 0)`;
    const top = pinned ? y : y - 14 - bh;
    rect = { l: x - bw / 2, r: x + bw / 2, t: top, b: top + bh };
  }

  return {
    say,
    wordless,
    // Player tapped a character (W7 #5): a sentence if off cooldown and no bubble is up, else a grunt. Pays nothing.
    tap(char) {
      const now = clock();
      if (now - (tapAt.get(char) ?? -Infinity) >= TAP_COOLDOWN && !showing) {
        tapAt.set(char, now);
        say(char, 'tap', true, { tap: true }).then((ok) => { if (!ok) wordless(char, { force: true }); });
        return true;
      }
      return wordless(char, { force: true });
    },
    frame() {
      if (!showing) { flushPending(); return; }
      if (performance.now() > showing.until) { hide(); return; }
      place(false);
    },
    get showing() { return showing; },
    get ready() { return !!chars; },
    // Hero-px rect of the visible bubble box (null when none), for toasts and floats to steer around.
    get rect() { return showing ? rect : null; },
    hide,
    debug: { said, tapAt, charAt, log, get pend() { return pend; }, get chars() { return chars; }, skew(ms) { skew += ms; }, get clock() { return clock(); } },
  };
}

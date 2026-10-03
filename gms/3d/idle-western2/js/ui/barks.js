import { el } from './dom.js?v=20261004e';

// W5 bark layer. The state gates sentence barks (one per 30–45 s, priority triggers always) and emits `bark {char, trig}`;
// this picks the line (once-ever, 10 min no-repeat, Sunday School), plays it and shows ONE bubble, positioned by
// transform only from Spectacle's anchors. Wordless clips (grunts, hics) are a separate, frequent, bubble-free layer.
const NO_REPEAT_MS = 10 * 60e3, TAP_COOLDOWN = 20e3, WORDLESS_GAP = 3000, ANCHOR_HZ = 33, SENTENCE_GAP = 30e3;
const NAMES = { mabel: 'Mabel', pickles: 'Pickles', pomfrey: 'Pomfrey', wendell: 'Wendell', mortimer: 'Mortimer', lulu: 'Lulu', pete: 'Pete', nubbin: 'Nubbin', hortense: 'Hortense', thrupp: 'Thrupp', bart: 'Bart', fingers: 'Fingers', mulligan: 'Mick', stranger: 'You', hank: 'Hank' };

export function createBarks({ game, audio, hero, anchorOf, geo, sunday, busy = () => false }) {
  let chars = null;
  const said = new Map(), tapAt = new Map();
  let wordAt = 0, lastWord = '', showing = null, queued = null, anchorAt = 0, sentenceAt = -1e9;

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

  function pickLine(char, trig) {
    const c = chars?.[char];
    if (!c) return null;
    const now = performance.now();
    let pool = c.lines.filter((l) => (l.trig || []).includes(trig) && !(l.once && onceDone(l.id)) && !(l.rude && sunday()));
    if (!pool.length) return null;
    const firsts = pool.filter((l) => l.once);
    if (firsts.length) return firsts[Math.floor(Math.random() * firsts.length)];
    const fresh = pool.filter((l) => now - (said.get(l.id) || -Infinity) > NO_REPEAT_MS);
    pool = fresh.length ? fresh : pool.sort((a, b) => (said.get(a.id) || 0) - (said.get(b.id) || 0)).slice(0, 2);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function wordless(char, { force = false } = {}) {
    const now = performance.now();
    if (!force && now - wordAt < WORDLESS_GAP) return false;
    const c = chars?.[char];
    const list = (c?.wordless || []).filter((w) => w.file && w.id !== lastWord);
    if (!list.length) return false;
    const w = list[Math.floor(Math.random() * list.length)];
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
    anchorAt = 0;
    place(true);
  }
  const c_name = (char) => NAMES[char] || chars?.[char]?.name?.split(' ')[0] || char;

  function hide() {
    showing = null;
    bubble.hidden = true;
    if (queued) { const q = queued; queued = null; say(q.char, q.trig, q.prio); }
  }

  // gated: barks from outside the state (Spectacle's gags) keep the W5 one-sentence-per-30-s budget here.
  async function say(char, trig, prio = false, { gated = false } = {}) {
    if (!chars) return false;
    if (gated && performance.now() - sentenceAt < SENTENCE_GAP) return wordless(char);
    if (showing) {
      if (prio) queued = { char, trig, prio };
      return false;
    }
    if (busy() && !prio) return false;
    const line = pickLine(char, trig);
    if (!line) return false;
    said.set(line.id, performance.now());
    sentenceAt = performance.now();
    if (line.once) game.act('barkOnce', { id: line.id });
    const words = line.text.split(/\s+/).length;
    const ms = Math.max(1800, Math.min(5200, (line.dur ? line.dur * 1000 : 0) + 900, 900 + words * 360));
    show(char, line, Math.max(ms, (line.dur || 0) * 1000 + 600));
    if (line.file) audio.voice(line.file);
    return true;
  }

  function place(force) {
    if (!showing) return;
    const now = performance.now();
    if (!force && now - anchorAt < 1000 / ANCHOR_HZ) return;
    anchorAt = now;
    const a = anchorOf(showing.char);
    const W = geo.viewW || 400, H = geo.heroH || 400;
    let x = W / 2, y = 78, pinned = true;
    if (a && a.visible) { x = a.x; y = a.y; pinned = false; }
    x = Math.max(70, Math.min(W - 70, x));
    y = Math.max(62, Math.min(H - 20, y));
    bubble.classList.toggle('pinned', pinned);
    bubble.style.transform = `translate3d(${x | 0}px, ${y | 0}px, 0)`;
  }

  return {
    say,
    wordless,
    // Player tapped a character (W7 #5): a sentence if off cooldown and no bubble is up, else a grunt. Pays nothing.
    tap(char) {
      const now = performance.now();
      if (now - (tapAt.get(char) || -Infinity) >= TAP_COOLDOWN && !showing) {
        tapAt.set(char, now);
        say(char, 'tap', true).then((ok) => { if (!ok) wordless(char, { force: true }); });
        return true;
      }
      return wordless(char, { force: true });
    },
    frame() {
      if (!showing) return;
      if (performance.now() > showing.until) { hide(); return; }
      place(false);
    },
    get showing() { return showing; },
    get ready() { return !!chars; },
    hide,
    debug: { said, tapAt, get chars() { return chars; } },
  };
}

// §8.4 toasts and §8.5 the chatter popup. DOM, not WebGL — both are text a player reads, and text
// on a CanvasTexture at a phone's pixel ratio is either blurry or expensive. Zero draw calls.
//
// P0 kept a four-line `toast()` in main.js marked "P6's hud.js takes this over". This file is that
// takeover: main.js now imports from here and the placeholder is gone, rather than both existing
// (obligation T3's lesson — a placeholder left beside its replacement is a bug waiting for the
// first caller that picks the wrong one).
//
// **Never alert/confirm/prompt** (brief, hard rule). Everything a player is told arrives here.
//
// ── the read-time rule (§8.5), and why it is a pure function ────────────────
//
//   hold = 1.8 + 0.085 * chars          ~12 chars/s ≈ 150 wpm, a slow-reader pace
//   hold = clamp(hold, 3.5, 13.0)
//   if (audioDuration) hold = max(hold, audioDuration + 1.2)
//   hold *= settings.chatterHold        normal 1.0 · long 1.35 · very long 1.75
//
// `holdFor()` is exported and takes no DOM, so §13's "assert the computed hold for a 60-char line
// is 6.9 s" is one call rather than a timing measurement of an animation. A gate that has to time
// a fade to check arithmetic is measuring the fade.

import { clamp, accentOf } from './utils.js';
import * as E from './economy.js';
import { ZONE_TYPES } from './config.js';
import { mediaFor, initialsOf } from './dock.js';
import { rankState, COURIER_RANKS, STANDING_RANKS, SHADY_RANKS, SHADY_TIERS, shadyState,
  ASSET_RECOVERY } from './ranks.js';

export const TOAST_MS = 2600;          // §8.4 hold
export const TOAST_FADE = 350;         // §8.4 in/out
export const TOAST_MAX = 4;            // §8.4 "max 4 stacked; the fifth replaces the oldest"
export const CHATTER_WAIT = 6.0;       // §8.5 a queued line waits this long, then is dropped

export const CHATTER_MULT = { normal: 1.0, long: 1.35, 'very long': 1.75 };

// §S2 — the chat ticker's scrollback. The chatter surface is no longer a floating rectangle that
// shows one line and vanishes: it is a scrolling box (embedded in the dashboard in cockpit view,
// a floating neon window in chase view) that keeps what was said. The read-time rule is unchanged
// — one LIVE line at a time, a second waits, and after CHATTER_WAIT it is dropped — because that
// rule is about the line being read aloud, not about how much history is on screen.
export const CHAT_ROWS = 12;

// The S2-A ↔ S2-B contract: priority travels in the EXISTING `tag` field and the vocabulary is
// exactly three values. This normaliser is the only place that is enforced.
//
//   bg     background wash, not addressed to the player   faded
//   info   ordinary traffic                               normal
//   alert  dispatch, police, distress — it matters        bright
//
// The four legacy values below are what today's manifest ships (`pay`/`warn`/`bad` plus a bare
// `info`); S2-B is relabelling every entry and this alias exists only so the two phases can land
// in either order without a run of unstyled lines in between. Anything unrecognised is `info`.
const TAG_ALIAS = { pay: 'alert', warn: 'alert', bad: 'alert' };
export const normTag = t => (t === 'bg' || t === 'alert' || t === 'info' ? t : (TAG_ALIAS[t] || 'info'));

export function holdFor(chars, audioDuration = 0, mult = 1) {
  let hold = 1.8 + 0.085 * chars;
  hold = clamp(hold, 3.5, 13.0);
  if (audioDuration) hold = Math.max(hold, audioDuration + 1.2);
  return hold * mult;
}

const KINDS = new Set(['pay', 'info', 'warn', 'bad']);

export class UI {
  // `root` is #hud's DOM layer; the toast rail and the chatter line are its only children that
  // are not the minimap.
  constructor({ toasts, chatter }, opts = {}) {
    this.toastEl = toasts;
    this.chatEl = chatter;
    this.settings = opts.settings || (() => ({ chatterHold: 'normal' }));
    this.now = opts.now || (() => performance.now() / 1000);

    this.toasts = [];              // { el, kind, msg, at, timer }
    this.toastSeq = 0;
    this.dropped = 0;              // toasts pushed out by the max-4 rule

    this.line = null;              // { speaker, text, tag, hold, at, chars }
    this.queued = null;            // { …, queuedAt } — at most one, §8.5
    this.chatterShown = 0;
    this.chatterDropped = 0;
    this._bar = null;
    // The scrollback both chat surfaces render from. `k` is a stable per-line key so a DOM
    // renderer can tell "the log changed" from "the log was re-read" without diffing strings.
    this.log = [];
    this._seq = 0;
  }

  // What the dash canvas and the chase HUD both draw. Oldest first, newest last — the direction a
  // ticker scrolls.
  chatLog() { return this.log; }

  // ── §8.4 ────────────────────────────────────────────────────────────────
  toast(msg, kind = 'info', ms = TOAST_MS) {
    if (!this.toastEl) return null;
    // A number in the second slot is the old P0 signature `toast(msg, ms)`. Accept it rather than
    // silently treating 2600 as a kind name and rendering an unstyled toast.
    if (typeof kind === 'number') { ms = kind; kind = 'info'; }
    if (!KINDS.has(kind)) kind = 'info';

    const el = document.createElement('div');
    el.className = `toast t-${kind}`;
    el.textContent = msg;
    this.toastEl.appendChild(el);
    const rec = { el, kind, msg: String(msg), at: this.now(), id: ++this.toastSeq, timer: 0 };
    rec.timer = setTimeout(() => this._retire(rec), ms);
    this.toasts.push(rec);

    // §8.4: "never queues longer than 4 — the fifth replaces the oldest". Replace, not refuse:
    // the newest message is always the one on screen.
    while (this.toasts.length > TOAST_MAX) { this.dropped++; this._retire(this.toasts[0], true); }
    this._reserve();
    return rec.id;
  }

  // ── the toast rail must not sit ON TOP of an open panel ───────────────────
  // The rail is `position: fixed` at z-index 45, above `#ui` (35) and `#dock` (36). The first
  // browser run caught the consequence on the first screen of the game: the boot two-thumb hint
  // covered the board's sticky header for its five seconds — the credits readout and the pad name,
  // the two things the header exists to show.
  //
  // The fix is a MEASURED reservation, not a magic offset: the rail's real height goes into
  // `--toast-h`, and the panel layers add it to their top padding. One toast or four, the header
  // starts below the rail, and when the rail empties the panel takes the space back. A fixed
  // number would have been wrong for every count except the one it was tuned on.
  _reserve() {
    if (!this.toastEl || typeof document === 'undefined') return 0;
    // The rail's BOTTOM edge in viewport pixels, not its height: the rail is offset from the top
    // by the safe area plus 10 px, and reserving only the height leaves the panel's header
    // starting two pixels above where the rail ends. The CSS takes the max of this and its own
    // safe-area padding, so an empty rail costs nothing.
    const b = this.toasts.length ? this.toastEl.getBoundingClientRect().bottom : 0;
    document.documentElement.style.setProperty('--toast-h', `${Math.ceil(Math.max(0, b))}px`);
    return b;
  }

  _retire(rec, now = false) {
    const i = this.toasts.indexOf(rec);
    if (i < 0) return;
    this.toasts.splice(i, 1);
    clearTimeout(rec.timer);
    rec.el.classList.add('out');
    if (now) rec.el.remove();
    else setTimeout(() => { rec.el.remove(); this._reserve(); }, TOAST_FADE + 50);
    this._reserve();
  }

  clearToasts() {
    for (const r of this.toasts.slice()) this._retire(r, true);
    this.toasts.length = 0;
    return true;
  }

  // ── §8.5 ────────────────────────────────────────────────────────────────
  // One line on screen at a time. A new foreground line waits for the current hold to finish, up
  // to CHATTER_WAIT, then the QUEUED line is dropped — the line already being read is never cut
  // short, which is the whole point of a read-time rule.
  chatter({ speaker = 'RADIO', text = '', tag = 'info', audio = 0 } = {}) {
    const mult = CHATTER_MULT[this.settings().chatterHold] || 1;
    const rec = { speaker, text: String(text), tag: normTag(tag), chars: String(text).length,
      hold: holdFor(String(text).length, audio, mult), audio, at: this.now() };
    if (this.line) { this.queued = Object.assign(rec, { queuedAt: this.now() }); return { queued: true, hold: rec.hold }; }
    this._show(rec);
    return { queued: false, hold: rec.hold };
  }

  // The ticker gains a row. The LIVE row is the only one that carries the class `chat-line` — a
  // retired row keeps its text and its tag but becomes `chat-past`, because "how many lines are
  // being read at once" and "how much history is on screen" are two different questions and only
  // the first one is what §8.5's one-line rule is about. gates_p6 asks the first one.
  _show(rec) {
    this.line = rec;
    rec.at = this.now();
    rec.k = ++this._seq;
    this.chatterShown++;
    this.log.push({ k: rec.k, speaker: rec.speaker, text: rec.text, tag: rec.tag });
    while (this.log.length > CHAT_ROWS) this.log.shift();
    if (!this.chatEl) return;
    const wrap = document.createElement('div');
    wrap.className = `chat-line k-${rec.tag}`;
    const sp = document.createElement('div');
    sp.className = 'chat-speaker';
    sp.textContent = rec.speaker;
    const tx = document.createElement('div');
    tx.className = 'chat-text';
    tx.textContent = rec.text;
    const bar = document.createElement('div');
    bar.className = 'chat-bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    wrap.appendChild(sp); wrap.appendChild(tx); wrap.appendChild(bar);
    this.chatEl.appendChild(wrap);
    while (this.chatEl.children.length > CHAT_ROWS) this.chatEl.removeChild(this.chatEl.firstChild);
    this.chatEl.classList.remove('hidden');
    this._live = wrap;
    this._bar = fill;
  }

  _hide() {
    this.line = null;
    this._bar = null;
    if (this._live) {
      this._live.className = this._live.className.replace('chat-line', 'chat-past');
      this._live = null;
    }
  }

  // Driven from the master loop's dt, not from setTimeout: the hairline progress bar has to agree
  // with the hold, and a parked tab freezes rAF while timers keep firing.
  update() {
    const t = this.now();
    if (this.line) {
      const k = (t - this.line.at) / this.line.hold;
      if (this._bar) this._bar.style.width = `${clamp(1 - k, 0, 1) * 100}%`;
      if (k >= 1) {
        this._hide();
        if (this.queued) {
          const q = this.queued; this.queued = null;
          this._show(q);
        }
      }
    }
    if (this.queued && t - this.queued.queuedAt > CHATTER_WAIT) {
      this.chatterDropped++;
      this.queued = null;
    }
  }

  state() {
    return {
      toasts: this.toasts.length, toastDropped: this.dropped,
      kinds: this.toasts.map(t => t.kind),
      chatter: this.line ? { speaker: this.line.speaker, chars: this.line.chars,
        hold: +this.line.hold.toFixed(3), left: +Math.max(0, this.line.hold - (this.now() - this.line.at)).toFixed(3) } : null,
      queued: this.queued ? this.queued.chars : null,
      shown: this.chatterShown, dropped: this.chatterDropped,
      mult: CHATTER_MULT[this.settings().chatterHold] || 1,
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// CabinPanel — the ONE in-cabin panel shell, in Aaron's HUD idiom.
//
// A hire panel, an earnings screen and a company screen are all coming (S2-D/E and the company
// layer), and Aaron's note on the surface those replace was "it looks fine if it was a web form".
// So the shell is a class rather than markup inside settings.js: a semi-transparent neon FRAME
// over a transparent background of the same colour, corner brackets, a kicker, a title and a
// close — a futuristic floating window, not a card.
//
// It owns four things and deliberately nothing else:
//   · the frame markup and the `.hud-panel` look
//   · show / hide / toggle, and dismissal by tapping the backdrop
//   · a `body` element a caller fills with whatever it likes
//   · the guarantee that there is never an alert(), confirm() or prompt() anywhere near it
//
// A later phase writes:  const p = new CabinPanel(el, { kicker: 'CONTRACT', title: 'EXTEND HIRE' });
// then fills `p.body`. Nothing else about that phase has to know how a NEONHAUL panel looks.
// ───────────────────────────────────────────────────────────────────────────

export class CabinPanel {
  // `host` is the full-screen layer this renders into (#settings, and later #hire / #earnings).
  constructor(host, opts = {}) {
    this.host = host;
    this.open = false;
    this.onHide = opts.onHide || null;
    this.dismissable = opts.dismissable !== false;
    host.innerHTML = '';
    host.classList.add('cabin-layer');
    this.panel = document.createElement('div');
    this.panel.className = `hud-panel${opts.wide ? ' wide' : ''}`;
    const head = document.createElement('div');
    head.className = 'hp-head';
    if (opts.kicker) {
      const k = document.createElement('span');
      k.className = 'hp-kicker';
      k.textContent = opts.kicker;
      head.appendChild(k);
    }
    const t = document.createElement('h2');
    t.className = 'hp-title';
    t.textContent = opts.title || '';
    head.appendChild(t);
    this.body = document.createElement('div');
    this.body.className = 'hp-body';
    this.foot = document.createElement('div');
    this.foot.className = 'hp-foot';
    const close = document.createElement('button');
    close.className = 'hp-close';
    close.textContent = opts.closeLabel || 'CLOSE';
    close.addEventListener('click', () => this.hide());
    this.foot.appendChild(close);
    this.panel.appendChild(head);
    this.panel.appendChild(this.body);
    this.panel.appendChild(this.foot);
    host.appendChild(this.panel);
    // Tapping the dark outside dismisses. Never a confirm() — the brief's hard rule, and the
    // reason every refusal in this game is a greyed row with its reason on it instead.
    host.addEventListener('click', e => { if (this.dismissable && e.target === host) this.hide(); });
  }

  setTitle(t) { this.panel.querySelector('.hp-title').textContent = t; return t; }
  show() { this.open = true; this.host.classList.remove('hidden'); return true; }
  hide() { this.open = false; this.host.classList.add('hidden'); this.onHide && this.onHide(); return false; }
  toggle() { return this.open ? this.hide() : this.show(); }
}

// ───────────────────────────────────────────────────────────────────────────
// §13 puts "the job board and shop in `ui.js`" in P7a's scope; S2-D rebuilt what it looks like.
// It is still a pure renderer over what `missions.board()` and `economy.js` already return, with
// every action handed back out through injected callbacks so this file knows nothing about main.js.
//
// ── why it was rebuilt ─────────────────────────────────────────────────────
//
// Aaron, on the shipped board: ***"I mean it looks fine if it was a web form."*** He is right. The
// before-shot is `shots/s2d/before_board_jobs.png`, which is NOT in the repo — `shots/*/` is
// gitignored, so it is a local artefact of `node tools/cap_s2d.mjs --tag=before` and anyone can
// regenerate it. It shows an opaque grey sheet of rounded cards with two pale rectangular buttons
// under each one. The company layer in pass 2-B is
// nothing but screens (earnings, wages, driver lists, legit/shady tabs), so the idiom gets settled
// HERE, once, rather than retrofitted across a dozen surfaces later.
//
// The idiom is Aaron's own word, used exactly as he defines it:
//
//   HUD — a semi-transparent neon FRAME with a transparent background of the same colour, like
//         something reflected onto a windscreen. A futuristic floating window.
//
// Which cashes out as five rules every screen in this file obeys, and `gates_s2d` measures each:
//
//   1. **The sheet is glass, not paper.** The city behind it stays visible. It was
//      `rgba(8,10,15,.96)`; it is now a tinted plate you can see the world through.
//   2. **Nothing is a rounded rectangle.** Corners are CHAMFERED with `clip-path`, which is the
//      single strongest signal that a surface is machined rather than typeset.
//   3. **Every panel is bracketed.** Corner ticks in the zone tint, brighter than the frame —
//      the same trick `hudFrame()` uses on the in-cabin holo panels, so the DOM screens and the
//      WebGL ones speak one language.
//   4. **Data is monospaced and labelled like an instrument**, not like a form field: a kicker in
//      letterspaced small caps above the value, never a "Label:" beside it.
//   5. **A row is a rail, not a box.** Rows carry a lit left spine and a slot ordinal instead of a
//      border on four sides.
//
// It is NOT §7.3's docking panel. That is P7b's `dock.js`, and it renders into `#dock`; this
// renders into `#ui`.
//
// **Never alert/confirm/prompt.** Every refusal is a greyed row with its reason on it — which is
// why `canBuyCraft` returns `{ok:false, why, short}` instead of just failing.
// ───────────────────────────────────────────────────────────────────────────

export const mmss = s => {
  const t = Math.max(0, Math.round(s));
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
};
export const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};
// Thin-space groups, so 44000 reads as 44 000 on an instrument rather than as a phone number.
// ` ` and not a comma: a comma in a monospace column looks like punctuation in a sentence.
export const crd = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// The one screen-chrome builder. Every surface in this file is assembled through it, which is what
// makes "settle the idiom once" true in code rather than in a comment: a company earnings screen in
// pass 2-B calls `screen('EARNINGS', '…')` and inherits the frame, the brackets and the ident.
//
// §S2-I took that promise up: `screen`, `readout`, `meter`, `el`, `crd` and `mmss` are EXPORTED and
// `js/companyui.js` assembles the whole company layer out of them. They were `const`s in this file
// only because nothing outside it existed yet — exporting them is the difference between one idiom
// and two that drift, which is the complaint S2-D was created by.
export function screen(cls, kicker, title, sub) {
  const s = el('div', `dk-screen ${cls}`);
  const h = el('div', 'dk-shead');
  h.appendChild(el('span', 'dk-skick', kicker));
  h.appendChild(el('span', 'dk-stitle', title));
  if (sub) h.appendChild(el('span', 'dk-ssub', sub));
  s.appendChild(h);
  const body = el('div', 'dk-sbody');
  s.appendChild(body);
  s.body = body;
  return s;
}

// A labelled instrument readout: kicker above, value below. The board's numbers used to be
// sentences ("100 / 100 units · full costs 0 CRD"); this is what makes them read as gauges.
export function readout(label, value, cls) {
  const r = el('div', `dk-ro${cls ? ' ' + cls : ''}`);
  r.appendChild(el('i', null, label));
  r.appendChild(el('b', null, value));
  return r;
}

// A segmented bar. `n` of `of` segments lit — deliberately SEGMENTED and not a smooth fill,
// because a continuous bar is the single most web-like element a UI can carry and a segmented one
// is the most instrument-like.
export function meter(frac, segs = 16, cls) {
  const m = el('div', `dk-meter${cls ? ' ' + cls : ''}`);
  const lit = Math.round(clamp(frac, 0, 1) * segs);
  for (let i = 0; i < segs; i++) m.appendChild(el('i', i < lit ? 'on' : null));
  return m;
}

export class DockUI {
  // `hooks` is the whole coupling: { accept, haggle, decline, charge, buyCraft, buyUpgrade,
  // buyRepair, undock } — each returns the fresh state and this repaints from it.
  constructor(root, hooks = {}, opts = {}) {
    this.root = root;
    this.hooks = hooks;
    // `data/clients.json`'s own `paths` block. The board uses the 96 px THUMB and nothing else
    // (§9.1) — it never touches the 384 still and never touches the mp4, which is what makes
    // §13's "zero .mp4 fetched from the job board" true by construction.
    this.paths = opts.paths || null;
    this.open = false;
    this.tab = 'jobs';
    this.pad = null;
    this.jobs = [];
    this.state = null;
    this.note = '';
    this.opens = 0;
    this.actions = 0;
    this._prompt = null;             // §7.2's DOCK button, shown while inside a zone
    this._promptKey = null;
    this.fleetLabel = null;          // §S2-I — null until the company layer opens
    this.company = null;
    // §S2-J. The whole group, and the state of the shady thread. Both are read ONLY by the RECORD
    // tab, and both default to null so a dock that nobody has told about a company behaves exactly
    // as it did before this phase.
    this.group = null;
    this.thread = null;
    this._blur = '';
  }

  // §7.3's static blurred still of the city behind the sheet, so the panel feels IN the world.
  // main.js captures it in the rAF callback right after `composer.render()`; see js/dock.js.
  setBackdrop(url) {
    this._blur = url || '';
    const sheet = this.root.querySelector('.dk-sheet');
    if (sheet) sheet.style.backgroundImage = this._blur ? `url(${this._blur})` : 'none';
    return !!this._blur;
  }

  // §S2-E — what the HIRE key says under its label: the time on the meter, or GROUNDED. Set by
  // main.js before every paint so the key is never showing a stale clock.
  setHire(label) { this.hireLabel = label || ''; if (this.open) this.paint(); return this.hireLabel; }

  // §S2-I — `null` HIDES the FLEET key (there is no company yet); a string shows it with that
  // string under the label. `''` is a live key with no caption, which is a different thing from
  // no key at all, so the two states cannot collapse into one falsy test.
  setFleet(label, company = null, extra = null) {
    this.fleetLabel = label;
    this.company = company;
    if (extra) { this.group = extra.group || null; this.thread = extra.thread || null; }
    if (this.open) this.paint();
    return this.fleetLabel;
  }

  show(pad, jobs, state) {
    this.pad = pad; this.jobs = jobs || []; this.state = state;
    this.tab = this.jobs.length ? 'jobs' : (pad && pad.charge ? 'shop' : 'jobs');
    this.note = '';
    this.open = true;
    this.opens++;
    this._prompt = null; this._promptKey = null;
    this.root.classList.remove('hidden', 'chip');
    this.paint();
    return true;
  }

  hide() {
    this.open = false;
    this._prompt = null; this._promptKey = null;
    this.root.classList.add('hidden');
    this.root.classList.remove('chip');
    this.root.innerHTML = '';
    return true;
  }

  // §7.2: "There is also a DOCK button that appears in the HUD whenever you are inside a zone, for
  // players who would rather press a thing. Both paths run the same code." It is also what makes
  // the spawn work: the craft starts parked ON the HUB deck, and automatic docking deliberately
  // does not arm until it has been outside a cylinder — otherwise `?auto=1` would dock on its
  // first second and never fly, taking four gate suites with it.
  //
  // While only the prompt is up, `#ui` is `pointer-events: none` and only the button itself is
  // live, so the control layer underneath keeps every pixel it had.
  setPrompt(pad) {
    if (this.open || !pad) {
      if (this._prompt) {
        this._prompt = null; this._promptKey = null;
        if (!this.open) { this.root.innerHTML = ''; this.root.classList.add('hidden'); }
        this.root.classList.remove('chip');
      }
      return false;
    }
    if (this._promptKey === pad.key) return true;
    this._promptKey = pad.key;
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.root.classList.add('chip');
    const b = el('button', 'dk-prompt');
    b.appendChild(el('span', 'dkp-glyph', (ZONE_TYPES[pad.displayType || 'PICKUP'] || ZONE_TYPES.PICKUP).glyph || '◇'));
    b.appendChild(el('span', 'dkp-label', 'DOCK'));
    b.appendChild(el('span', 'dkp-name', pad.name || pad.key));
    b.addEventListener('click', () => this.hooks.dock && this.hooks.dock(pad.key));
    this.root.appendChild(b);
    this._prompt = b;
    return true;
  }

  // Called after every action so the panel is always drawn from the state that action produced,
  // never from a copy taken before it.
  refresh(jobs, state, note) {
    if (jobs) this.jobs = jobs;
    if (state) this.state = state;
    if (note !== undefined) this.note = note;
    if (this.open) this.paint();
  }

  _act(fn, ...args) {
    this.actions++;
    const r = fn ? fn(...args) : null;
    if (r) this.refresh(r.jobs, r.state, r.note);
    return r;
  }

  paint() {
    const r = this.root, pad = this.pad, st = this.state;
    if (!pad || !st) return;
    const scrollTop = (r.querySelector('.dk-sheet') || {}).scrollTop || 0;
    r.innerHTML = '';
    const sheet = el('div', 'dk-sheet');
    const type = pad.displayType || 'PICKUP';
    const tint = (ZONE_TYPES[type] || ZONE_TYPES.PICKUP).color;
    sheet.style.setProperty('--tint', accentOf(tint));

    // ── header ────────────────────────────────────────────────────────────
    const head = el('div', 'dk-head');
    const ttl = el('div', 'dk-title');
    ttl.appendChild(el('span', 'dk-kicker', `${(ZONE_TYPES[type] || {}).glyph || ''} ${type}`));
    ttl.appendChild(el('span', 'dk-pad', pad.name || pad.key));
    ttl.appendChild(el('span', 'dk-dist', pad.districtName || ''));
    head.appendChild(ttl);
    const purse = el('div', 'dk-purse');
    purse.appendChild(el('b', null, `${crd(st.credits)} CRD`));
    // The second line used to be a sentence of facts. It is three gauges now, because a docked
    // player is deciding whether they can afford the next leg and a sentence does not answer that.
    const gauges = el('div', 'dk-gauges');
    const cellF = E.cellFrac(st);
    const held = E.occupiedSlots(st), slots = E.cargoSlots(st);
    gauges.appendChild(this._gauge('CELL', `${Math.round(cellF * 100)}%`, cellF, cellF < 0.2 ? 'bad' : cellF < 0.4 ? 'warn' : ''));
    gauges.appendChild(this._gauge('HOLD', `${held}/${slots}`, slots ? held / slots : 0, ''));
    purse.appendChild(gauges);
    head.appendChild(purse);
    sheet.appendChild(head);

    // ── the rank rail ─────────────────────────────────────────────────────
    // Both ladders, on every screen, above the tabs. They are the two numbers that say what the
    // player is allowed to do and what the city thinks of them, and burying them behind a tab
    // would mean most players never learn there are two.
    sheet.appendChild(this._rankRail(st));

    // ── tabs ──────────────────────────────────────────────────────────────
    // ORDER IS LOAD-BEARING: gates_wire presses `.dk-tab` index 2 and requires the SHOP. RECORD
    // therefore goes last, and never in front of it.
    const tabs = el('div', 'dk-tabs');
    const mk = (id, label, sub) => {
      const b = el('button', 'dk-tab' + (this.tab === id ? ' on' : ''));
      b.appendChild(el('span', 'dkt-l', label));
      if (sub !== undefined) b.appendChild(el('span', 'dkt-n', String(sub)));
      b.addEventListener('click', () => { this.tab = id; this.note = ''; this.paint(); });
      tabs.appendChild(b);
    };
    mk('jobs', 'JOBS', this.jobs.length);
    mk('hold', 'HOLD', st.cargo.length);
    if (pad.charge) mk('shop', 'SHOP');
    mk('record', 'RECORD');
    // §S2-E's HIRE key. It sits in the tab strip and it is deliberately **not** a `.dk-tab`:
    // gates_wire does `clickSel('.dk-tab', 2)` and requires the SHOP, and gates_s2d B6 asserts
    // RECORD is the LAST `.dk-tab`. Both of those are contracts about a collection, and adding a
    // fifth member to it broke the second one on the first run. `.dk-key` keeps the look and
    // leaves the collection alone.
    //
    // It is a key, not a tab body — it hands off to the HirePanel, which is the same surface the
    // cabin's HIRE button opens, so there is one hire screen in the game and not two that drift.
    if (this.hooks.hire) {
      const b = el('button', 'dk-key hire');
      b.appendChild(el('span', 'dkt-l', 'HIRE'));
      b.appendChild(el('span', 'dkt-n', this.hireLabel || ''));
      b.addEventListener('click', () => this.hooks.hire());
      tabs.appendChild(b);
    }
    // §S2-I's FLEET key. A `.dk-key` for the same reason HIRE is one — `.dk-tab` is a collection
    // two suites hold contracts about — and it is only present once the company layer is open,
    // which is after act one. It hands off to `companyui.js`'s FleetPanel: the roster, the agency
    // list and the books are one screen, not three doors.
    if (this.hooks.fleet && this.fleetLabel !== null) {
      const b = el('button', 'dk-key fleet');
      b.appendChild(el('span', 'dkt-l', 'FLEET'));
      b.appendChild(el('span', 'dkt-n', this.fleetLabel || ''));
      b.addEventListener('click', () => this.hooks.fleet());
      tabs.appendChild(b);
    }
    sheet.appendChild(tabs);

    const body = el('div', 'dk-body');
    if (this.tab === 'jobs') this._jobs(body, st);
    else if (this.tab === 'hold') this._hold(body, st);
    else if (this.tab === 'record') this._record(body, st);
    else this._shop(body, st);
    sheet.appendChild(body);

    if (this.note) {
      const n = el('div', 'dk-note');
      n.appendChild(el('span', 'dkn-mark', '!'));
      n.appendChild(el('span', null, this.note));
      sheet.appendChild(n);
    }

    const undock = el('button', 'dk-undock', 'UNDOCK');
    undock.addEventListener('click', () => this._act(this.hooks.undock));
    sheet.appendChild(undock);

    // The corner brackets, last so they sit over everything and outside the scroll.
    sheet.appendChild(el('div', 'dk-brk'));

    if (this._blur) sheet.style.backgroundImage = `url(${this._blur})`;
    r.appendChild(sheet);
    // A repaint must not throw the player back to the top of a board they were half way down.
    if (scrollTop) sheet.scrollTop = scrollTop;
  }

  _gauge(label, value, frac, tone) {
    const g = el('div', `dk-gauge${tone ? ' ' + tone : ''}`);
    g.appendChild(el('i', null, label));
    g.appendChild(meter(frac, 10));
    g.appendChild(el('b', null, value));
    return g;
  }

  // Both ladders as one strip: name, rung, and how far through the current rung you are.
  //
  // §S2-I — it reads the COMPANY too, for the same reason `_record` does. Without it the rail said
  // HAULMASTER while the ladder six centimetres below it said SPIRE HAULIER, which is one screen
  // disagreeing with itself about the player's own rank. Caught by looking at the capture.
  _rankRail(st) {
    const R = rankState(st, this.company);
    const rail = el('div', 'dk-rail');
    const one = (cls, kick, name, sub, frac) => {
      const c = el('div', `dk-rank ${cls}`);
      c.appendChild(el('span', 'dkr-kick', kick));
      c.appendChild(el('span', 'dkr-name', name));
      c.appendChild(meter(frac, 12, 'thin'));
      c.appendChild(el('span', 'dkr-sub', sub));
      return c;
    };
    rail.appendChild(one('lic', `LICENCE ${R.licence.tier}`, R.licence.name,
      R.licence.next ? `${crd(R.licence.next.need)} to ${R.licence.next.name}` : 'top of the ladder',
      R.licence.frac));
    rail.appendChild(one('std', `STANDING ${R.standing.rung}`, R.standing.name,
      R.standing.next ? `${crd(R.standing.next.need)} to ${R.standing.next.name}` : 'nothing above this',
      R.standing.frac));
    return rail;
  }

  // §7.3's information order: who is this, what do they want, do I take it.
  _jobs(body, st) {
    if (!this.jobs.length) {
      body.appendChild(this._empty('NO CONTRACTS POSTED', 'This pad runs services only. Boards sit at HUB and PICKUP pads.'));
      return;
    }
    this.jobs.forEach((job, i) => {
      const row = el('div', 'dk-job' + (job.rush ? ' rush' : ''));
      row.appendChild(el('span', 'dk-slot', String(i + 1).padStart(2, '0')));

      // The client block is a BUTTON. Pressing it opens §7.3's docking panel for this job, which
      // is where the portrait loop, the reliability meter and the full deal live. The board stays
      // a list — it is the thing you scan — and the panel is the thing you read.
      const who = el('button', 'dk-who');
      who.appendChild(this._thumb(job));
      const txt = el('div', 'dk-whotx');
      txt.appendChild(el('span', 'dk-client', job.client ? job.client.name : 'UNLISTED'));
      txt.appendChild(el('span', 'dk-fac', job.client ? job.client.faction : ''));
      if (job.client && job.client.line) txt.appendChild(el('span', 'dk-line', `“${job.client.line}”`));
      who.appendChild(txt);
      who.appendChild(el('span', 'dk-more', '▸'));
      who.addEventListener('click', () => { this.actions++; this.hooks.openClient && this.hooks.openClient(job); });
      row.appendChild(who);

      // The manifest line, drawn as a route rather than written as two sentences: what is in the
      // box on the left, a lit lane across the middle carrying the distance, the drop on the right.
      const route = el('div', 'dk-route');
      const from = el('div', 'dk-parcel');
      from.appendChild(el('span', 'dkp-icon', job.parcel.icon));
      from.appendChild(el('span', 'dkp-name', job.parcel.name));
      from.appendChild(el('span', 'dkp-slots', `${job.parcel.slots} SLOT${job.parcel.slots > 1 ? 'S' : ''}`));
      route.appendChild(from);
      const lane = el('div', 'dk-lane');
      lane.appendChild(el('span', 'dkl-km', `${job.km.toFixed(1)} km`));
      route.appendChild(lane);
      const to = el('div', 'dk-dest');
      to.appendChild(el('span', 'dkd-name', job.dest.name));
      to.appendChild(el('span', 'dkd-dist', job.dest.districtName));
      route.appendChild(to);
      row.appendChild(route);

      const chips = el('div', 'dk-chips');
      chips.appendChild(el('span', 'dk-chip', `⏱ ${mmss(job.limit)}`));
      chips.appendChild(el('span', 'dk-chip risk r' + job.risk, `⚠ ${job.riskLabel}`));
      if (job.rush) chips.appendChild(el('span', 'dk-chip hot', `⚡ RUSH ×${job.rushMul}`));
      row.appendChild(chips);

      const pay = el('div', 'dk-pay');
      pay.appendChild(el('span', 'dk-payl', 'PAYMENT'));
      const b = el('b');
      b.appendChild(el('span', 'dkv-n', crd(job.base + Math.round(job.base * job.haggleGain))));
      b.appendChild(el('span', 'dkv-u', 'CRD'));
      pay.appendChild(b);
      row.appendChild(pay);
      const bon = el('div', 'dk-bonuses');
      const bline = (l, v) => {
        const d = el('div', 'dk-bonus');
        d.appendChild(el('span', null, l));
        d.appendChild(el('b', null, v));
        return d;
      };
      bon.appendChild(bline(`under ${mmss(job.bonus.saturateAt)}`, `+${Math.round(job.bonus.maxTime * 100)}%`));
      bon.appendChild(bline('per extra parcel', `+${Math.round(job.bonus.chain * 100)}%`));
      row.appendChild(bon);

      const chk = this.hooks.canAccept ? this.hooks.canAccept(job) : { ok: true };
      const acts = el('div', 'dk-acts');
      const acc = el('button', 'dk-accept', chk.ok ? 'ACCEPT'
        : chk.why === 'slots' ? `NO ROOM (${chk.free}/${job.parcel.slots})`
          : chk.why === 'cooldown' ? 'CLIENT COOLED OFF' : 'LICENCE TOO LOW');
      acc.disabled = !chk.ok;
      acc.addEventListener('click', () => this._act(this.hooks.accept, job));
      acts.appendChild(acc);
      if (!job.haggled) {
        const hg = el('button', 'dk-ghost', 'HAGGLE');
        hg.addEventListener('click', () => this._act(this.hooks.haggle, job));
        acts.appendChild(hg);
      }
      row.appendChild(acts);
      body.appendChild(row);
    });
  }

  _empty(title, sub) {
    const e = el('div', 'dk-empty');
    e.appendChild(el('span', 'dke-t', title));
    if (sub) e.appendChild(el('span', 'dke-s', sub));
    return e;
  }

  // §9.1: "the job board uses ONLY the 96x96 thumb". A missing file degrades to the same generated
  // hex-and-initials placeholder the panel uses — never a broken-image icon, never a fetch the
  // board blocks on.
  _thumb(job) {
    const wrap = el('div', 'dk-thumb');
    const id = job.client ? job.client.id : null;
    if (!id) { wrap.appendChild(el('span', 'dk-ph', '?')); return wrap; }
    const img = el('img');
    img.loading = 'lazy';
    img.width = 48; img.height = 48; img.alt = '';
    img.src = mediaFor(this.paths, id, 'thumb');
    img.addEventListener('error', () => {
      img.replaceWith(el('span', 'dk-ph', initialsOf(job.client.name)));
    }, { once: true });
    wrap.appendChild(img);
    return wrap;
  }

  _hold(body, st) {
    if (!st.cargo.length) {
      body.appendChild(this._empty('HOLD EMPTY', `${E.cargoSlots(st)} slots available.`));
      return;
    }
    st.cargo.forEach((p, i) => {
      const row = el('div', 'dk-held');
      row.appendChild(el('span', 'dk-slot', String(i + 1).padStart(2, '0')));
      const route = el('div', 'dk-route');
      const from = el('div', 'dk-parcel');
      from.appendChild(el('span', 'dkp-icon', p.parcel.icon));
      from.appendChild(el('span', 'dkp-name', p.parcel.name));
      from.appendChild(el('span', 'dkp-slots', `${p.parcel.slots} SLOT${p.parcel.slots > 1 ? 'S' : ''}`));
      route.appendChild(from);
      const lane = el('div', 'dk-lane');
      lane.appendChild(el('span', 'dkl-km', `${p.km.toFixed(1)} km`));
      route.appendChild(lane);
      const to = el('div', 'dk-dest');
      to.appendChild(el('span', 'dkd-name', p.dest.name));
      to.appendChild(el('span', 'dkd-dist', p.dest.districtName));
      route.appendChild(to);
      row.appendChild(route);
      const chips = el('div', 'dk-chips');
      chips.appendChild(el('span', 'dk-chip', `⏱ ${mmss(p.limit)}`));
      chips.appendChild(el('span', 'dk-chip', `${crd(p.base)} CRD`));
      row.appendChild(chips);
      body.appendChild(row);
    });
  }

  // ── the shop ─────────────────────────────────────────────────────────────
  // Three MODULES, not three lists of buttons. Every purchasable line shows what it is, what state
  // it is in and what it costs, in that order, in three columns that line up down the screen.
  _shop(body, st) {
    // ── the cell ──────────────────────────────────────────────────────────
    const room = Math.round(E.cellMax(st) - st.cellUnits);
    const chg = screen('dk-sect', 'SERVICE', 'CHARGE CELL', `${E.FUEL.PRICE} CRD / UNIT`);
    const cellF = E.cellFrac(st);
    const bank = el('div', 'dk-cellbank');
    bank.appendChild(meter(cellF, 24, 'tall' + (cellF < 0.2 ? ' bad' : cellF < 0.4 ? ' warn' : '')));
    const nums = el('div', 'dk-cellnums');
    nums.appendChild(readout('CHARGE', `${Math.round(st.cellUnits)}/${Math.round(E.cellMax(st))}`));
    nums.appendChild(readout('TO FILL', room > 0 ? `${crd(E.chargeCost(room))} CRD` : '—'));
    bank.appendChild(nums);
    chg.body.appendChild(bank);
    // Its own class, not `dk-accept`. They look identical and they are NOT the same action: a
    // selector that matches both makes "press the first enabled ACCEPT on the board" quietly press
    // FILL when the board happens to be a service pad, which is what a browser gate found it doing.
    const fill = el('button', 'dk-fill', room > 0 ? `FILL · ${crd(E.chargeCost(room))} CRD` : 'CELL FULL');
    fill.disabled = room <= 0;
    fill.addEventListener('click', () => this._act(this.hooks.charge, Infinity));
    chg.body.appendChild(fill);
    body.appendChild(chg);

    // ── upgrades ──────────────────────────────────────────────────────────
    const up = screen('dk-sect', 'FITTING', 'HULL MODULES', 'L0 — L3');
    for (const line of Object.keys(E.UPGRADES)) {
      const lv = st.upgrades[line] || 0;
      const price = E.upgradePrice(st, line);
      const b = el('button', 'dk-shop mod');
      b.appendChild(el('span', 'dkm-name', E.UPGRADES[line].label));
      const pips = el('span', 'dkm-pips');
      for (let i = 0; i < 3; i++) pips.appendChild(el('i', i < lv ? 'on' : null));
      b.appendChild(pips);
      b.appendChild(el('span', 'dkm-price', price === null ? 'MAX'
        : st.credits < price ? `SHORT ${crd(price - st.credits)}` : `${crd(price)} CRD`));
      b.disabled = price === null || st.credits < price;
      b.addEventListener('click', () => this._act(this.hooks.buyUpgrade, line));
      up.body.appendChild(b);
    }
    body.appendChild(up);

    // ── hulls ─────────────────────────────────────────────────────────────
    const cr = screen('dk-sect', 'REGISTRY', 'HULLS', `LICENCE ${st.tier}`);
    for (const id of Object.keys(E.CRAFT)) {
      const chk = E.canBuyCraft(st, id);
      const c = E.CRAFT[id];
      const b = el('button', 'dk-shop hull' + (st.craft === id ? ' own' : ''));
      const nm = el('span', 'dkh-name', id.toUpperCase());
      b.appendChild(nm);
      const pips = el('span', 'dkh-slots');
      for (let i = 0; i < c.slots; i++) pips.appendChild(el('i'));
      b.appendChild(pips);
      b.appendChild(el('span', 'dkh-state', chk.ok ? `${crd(c.price)} CRD`
        : chk.why === 'owned' ? 'IN SERVICE'
          : chk.why === 'licence' ? `TIER ${this._tierFor(id)}` : `SHORT ${crd(chk.short)}`));
      b.disabled = !chk.ok;
      b.addEventListener('click', () => this._act(this.hooks.buyCraft, id));
      cr.body.appendChild(b);
    }
    const rep = el('button', 'dk-shop mod');
    rep.appendChild(el('span', 'dkm-name', 'COSMETIC REPAIR'));
    rep.appendChild(el('span', 'dkm-pips'));
    rep.appendChild(el('span', 'dkm-price', `${crd(E.REPAIR_PRICE)} CRD`));
    rep.disabled = st.credits < E.REPAIR_PRICE;
    rep.addEventListener('click', () => this._act(this.hooks.buyRepair));
    cr.body.appendChild(rep);
    body.appendChild(cr);
  }

  // Which licence tier unlocks a hull. Read off LADDER, never restated — a locked row that names
  // the wrong tier is worse than one that names none.
  _tierFor(id) {
    const row = E.LADDER.find(r => r.craft === id);
    return row ? row.tier : 1;
  }

  // ── the RECORD tab — both ladders in full ────────────────────────────────
  // Aaron's design note is that the two move independently, so they are drawn as two ladders side
  // by side and never as one score. The shady ladder is shown as a sealed strip: it exists, it is
  // not yours, and pass 2-B is where a door into it opens.
  _record(body, st) {
    const co = this.company;
    const R = rankState(st, co);
    // §S2-I. The top two rungs are on a DIFFERENT AXIS — fleet gross, not lifetime — so the
    // subtitle, the thresholds and the "done" test all have to change with it. Printing a fleet
    // threshold in a column headed "CRD HAULED" would be the surface lying about which number the
    // promotion is waiting on, which is the failure S2-D's blurbFor() exists to prevent.
    const fleetGross = co ? Math.round(co.gross || 0) : 0;
    const lic = screen('dk-sect lad', 'LICENCE', R.licence.name,
      R.licence.axis === 'fleet'
        ? `TIER ${R.licence.tier} · ${crd(fleetGross)} CRD FLEET GROSS`
        : `TIER ${R.licence.tier} · ${crd(R.licence.at)} CRD HAULED`);
    lic.body.appendChild(this._ladder(COURIER_RANKS.map(r => ({
      key: r.tier, name: r.name,
      at: r.opens ? r.fleet : r.lifetime,
      blurb: r.blurb,
      // A company rung is LOCKED until there is a company at all. Once there is one it is a real
      // rung with a real threshold and it stops reading SEALED.
      locked: !!r.opens && !co,
      here: r.tier === R.licence.tier,
      // A company rung is DONE only when BOTH conditions hold: the fleet has hauled the gross AND
      // the player is already at the top of the lifetime ladder. `courierRank` refuses to hand out
      // rung 7 to anybody below HAULMASTER — a fleet cannot buy you the sixth rung, only the
      // seventh and eighth — so a fleet-gross-only test drew a LANEWRIGHT a ladder with two rungs
      // ABOVE their own position ticked off. Which is the surface disagreeing with the function
      // that decides the rank, and is exactly what blurbFor() exists to stop happening to blurbs.
      done: r.opens
        ? (!!co && r.fleet !== null && fleetGross >= r.fleet && st.tier >= E.LADDER.length)
        : (r.lifetime !== null && r.lifetime <= st.lifetime),
    })), R.licence.frac, co
      ? 'the first six rungs count what YOU hauled; the last two count what your FLEET hauled'
      : 'lifetime gross — it counts what you have hauled and it can never fall'));
    body.appendChild(lic);

    const std = screen('dk-sect lad', 'STANDING', R.standing.name, `RUNG ${R.standing.rung} · ${crd(R.worth)} CRD NET`);
    const worth = el('div', 'dk-worth');
    worth.appendChild(readout('LIQUID', `${crd(st.credits)}`));
    worth.appendChild(readout('ASSETS', `${crd(R.assets)}`, 'sub'));
    worth.appendChild(readout('NET WORTH', `${crd(R.worth)}`, 'big'));
    std.body.appendChild(worth);
    std.body.appendChild(this._ladder(STANDING_RANKS.map(r => ({
      key: r.rung, name: r.name, at: r.worth, blurb: r.blurb, locked: false,
      here: r.rung === R.standing.rung, done: r.worth <= R.worth,
    })), R.standing.frac, 'net worth — what you keep, at ' + Math.round(ASSET_RECOVERY * 100) + '% on the hull'));
    body.appendChild(std);

    // ── §S2-J — the other side ──────────────────────────────────────────
    //
    // Three states, and the middle one is the point of the whole design. SEALED is what S2-D
    // shipped: the ladder exists, it is not yours. OPEN is the real ladder with a rung on it. And
    // between them is CUE — the thread is live because the player NOTICED something, and the only
    // thing on the screen is one row they can pull.
    //
    // The brief is explicit that the remarks themselves must not be gated behind a menu, and they
    // are not: they arrive on the chatter ticker among two hundred ordinary lines. This row exists
    // only because two of them landed and the player was listening. Aaron: *"a player who is not
    // paying attention simply never notices, and one who is feels clever."*
    const th = this.thread || null;
    const door = th ? th.door : null;
    // WHERE it goes matters as much as what it says, and it depends on the state — which is why
    // this is a function and not a position.
    //
    //   sealed   last, where S2-D put it: a rumour at the bottom of your own record
    //   CUE      FIRST. This is the one state with something to DO in it, it is easy to miss by
    //            design, and a key the player has to scroll past two full ladders to reach is a key
    //            most players never reach.
    //   open     last again. Once the door is open it is simply a third ladder, and LICENCE is
    //            still the ladder this screen is primarily about — `gates_s2i` F1 reads the FIRST
    //            `.dk-sect.lad` on this tab and asserts it is the licence one, which is a contract
    //            worth keeping and which caught this being got wrong.
    const lead = el => (door === 'cue' ? body.insertBefore(el, body.firstChild) : body.appendChild(el));
    if (door === 'asked' || door === 'seized') {
      const total = th && th.shadyGross !== undefined ? th.shadyGross : 0;
      const R = shadyState(total, true);
      const sh = screen('dk-sect lad other', 'THE OTHER SIDE', R.name,
        `RUNG ${R.rung} · ${crd(R.at)} CRD OFF THE BOOKS`);
      sh.body.appendChild(this._ladder(SHADY_TIERS.map(t => ({
        key: t.rung, name: t.name, at: t.at, blurb: t.blurb, locked: false,
        here: t.rung === R.rung, done: R.at >= t.at,
      })), R.frac, 'off-book gross, across every charter you hold — the desk knows who you are'));
      lead(sh);
    } else if (door === 'cue') {
      const sh = screen('dk-sect lad sealed cue', 'THE OTHER SIDE', 'A NAME KEEPS COMING UP',
        `${th.remarks} TIMES NOW`);
      const strip = el('div', 'dk-sealed');
      for (const n of SHADY_RANKS) strip.appendChild(el('span', 'dks-rung', n));
      sh.body.appendChild(strip);
      sh.body.appendChild(el('div', 'dk-ladnote',
        'Somebody said your father’s name on the open channel. Twice. He is home, he is fine, and '
        + 'he still has not told you who he borrowed from.'));
      const k = el('button', 'dk-key ask');
      k.appendChild(el('span', 'dkt-l', 'ASK HIM'));
      k.appendChild(el('span', 'dkt-n', 'and do not take the first answer'));
      k.addEventListener('click', () => this._act(this.hooks.askDad));
      sh.body.appendChild(k);
      lead(sh);
    } else {
      const sh = screen('dk-sect lad sealed', 'THE OTHER SIDE', 'SEALED', 'NO RECORD');
      const strip = el('div', 'dk-sealed');
      for (const n of SHADY_RANKS) strip.appendChild(el('span', 'dks-rung', n));
      sh.body.appendChild(strip);
      sh.body.appendChild(el('div', 'dk-ladnote', 'There is a second ledger. You are not on it.'));
      body.appendChild(sh);
    }
  }

  _ladder(rows, frac, note) {
    const l = el('div', 'dk-ladder');
    for (const r of rows) {
      const d = el('div', `dk-rung${r.here ? ' here' : ''}${r.done && !r.here ? ' done' : ''}${r.locked ? ' locked' : ''}`);
      d.appendChild(el('span', 'dkg-i', String(r.key).padStart(2, '0')));
      const tx = el('span', 'dkg-tx');
      tx.appendChild(el('span', 'dkg-name', r.name));
      tx.appendChild(el('span', 'dkg-blurb', r.blurb));
      d.appendChild(tx);
      d.appendChild(el('span', 'dkg-at', r.locked || r.at === null || r.at === undefined ? 'SEALED' : crd(r.at)));
      if (r.here) d.appendChild(meter(frac, 20, 'thin here'));
      l.appendChild(d);
    }
    if (note) l.appendChild(el('div', 'dk-ladnote', note));
    return l;
  }

  stateOf() {
    return { open: this.open, tab: this.tab, hire: this.hireLabel || null, jobs: this.jobs.length,
      pad: this.pad ? this.pad.key : null, opens: this.opens, actions: this.actions,
      prompt: this._promptKey,
      // S2-D: the two ladders, so a gate can read what the surface is claiming rather than OCR it.
      fleet: this.fleetLabel,
      // §S2-J. What the RECORD tab is claiming about the other side, so a gate reads the surface's
      // own answer instead of inferring it from the story state it is supposed to be rendering.
      thread: this.thread ? { door: this.thread.door, remarks: this.thread.remarks } : null,
      ranks: this.state ? rankState(this.state, this.company) : null };
  }
}

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

import { clamp } from './utils.js';
import * as E from './economy.js';
import { ZONE_TYPES } from './config.js';
import { mediaFor, initialsOf } from './dock.js';

export const TOAST_MS = 2600;          // §8.4 hold
export const TOAST_FADE = 350;         // §8.4 in/out
export const TOAST_MAX = 4;            // §8.4 "max 4 stacked; the fifth replaces the oldest"
export const CHATTER_WAIT = 6.0;       // §8.5 a queued line waits this long, then is dropped

export const CHATTER_MULT = { normal: 1.0, long: 1.35, 'very long': 1.75 };

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
  }

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
    const rec = { speaker, text: String(text), tag, chars: String(text).length,
      hold: holdFor(String(text).length, audio, mult), audio, at: this.now() };
    if (this.line) { this.queued = Object.assign(rec, { queuedAt: this.now() }); return { queued: true, hold: rec.hold }; }
    this._show(rec);
    return { queued: false, hold: rec.hold };
  }

  _show(rec) {
    this.line = rec;
    rec.at = this.now();
    this.chatterShown++;
    if (!this.chatEl) return;
    this.chatEl.innerHTML = '';
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
    this.chatEl.classList.remove('hidden');
    this._bar = fill;
  }

  _hide() {
    this.line = null;
    this._bar = null;
    if (this.chatEl) { this.chatEl.classList.add('hidden'); this.chatEl.innerHTML = ''; }
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
// §13 puts "the job board and shop in `ui.js`" in P7a's scope. This is that: a pure renderer over
// what `missions.board()` and `economy.js` already return, with every action handed back out
// through injected callbacks so this file knows nothing about main.js.
//
// It is NOT §7.3's docking panel. That is P7b's `dock.js`, a phase of its own, and it renders into
// `#dock`; this renders into `#ui` so the two can coexist and P7b can take the client media, the
// hex portrait frame and the static-blur background over without unpicking the board.
//
// **Never alert/confirm/prompt.** Every refusal is a greyed row with its reason on it — which is
// why `canBuyCraft` returns `{ok:false, why, short}` instead of just failing.
// ───────────────────────────────────────────────────────────────────────────

const mmss = s => {
  const t = Math.max(0, Math.round(s));
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
};
const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};

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
    const b = el('button', 'dk-prompt', `DOCK · ${pad.name}`);
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
    r.innerHTML = '';
    const sheet = el('div', 'dk-sheet');
    const type = pad.displayType || 'PICKUP';
    const tint = (ZONE_TYPES[type] || ZONE_TYPES.PICKUP).color;
    sheet.style.setProperty('--tint', '#' + tint.toString(16).padStart(6, '0'));

    // ── header ────────────────────────────────────────────────────────────
    const head = el('div', 'dk-head');
    const ttl = el('div', 'dk-title');
    ttl.appendChild(el('span', 'dk-kicker', `${(ZONE_TYPES[type] || {}).glyph || ''} ${type}`));
    ttl.appendChild(el('span', 'dk-pad', pad.name || pad.key));
    ttl.appendChild(el('span', 'dk-dist', pad.districtName || ''));
    head.appendChild(ttl);
    const purse = el('div', 'dk-purse');
    purse.appendChild(el('b', null, `${st.credits} CRD`));
    purse.appendChild(el('span', null, `TIER ${st.tier} · CELL ${Math.round(E.cellFrac(st) * 100)}%`
      + ` · HOLD ${E.occupiedSlots(st)}/${E.cargoSlots(st)}`));
    head.appendChild(purse);
    sheet.appendChild(head);

    // ── tabs ──────────────────────────────────────────────────────────────
    const tabs = el('div', 'dk-tabs');
    const mk = (id, label) => {
      const b = el('button', 'dk-tab' + (this.tab === id ? ' on' : ''), label);
      b.addEventListener('click', () => { this.tab = id; this.note = ''; this.paint(); });
      tabs.appendChild(b);
    };
    mk('jobs', `JOBS ${this.jobs.length}`);
    mk('hold', `HOLD ${st.cargo.length}`);
    if (pad.charge) mk('shop', 'CHARGE · SHOP');
    sheet.appendChild(tabs);

    const body = el('div', 'dk-body');
    if (this.tab === 'jobs') this._jobs(body, st);
    else if (this.tab === 'hold') this._hold(body, st);
    else this._shop(body, st);
    sheet.appendChild(body);

    if (this.note) sheet.appendChild(el('div', 'dk-note', this.note));

    const undock = el('button', 'dk-undock', 'UNDOCK');
    undock.addEventListener('click', () => this._act(this.hooks.undock));
    sheet.appendChild(undock);

    if (this._blur) sheet.style.backgroundImage = `url(${this._blur})`;
    r.appendChild(sheet);
  }

  // §7.3's information order: who is this, what do they want, do I take it.
  _jobs(body, st) {
    if (!this.jobs.length) {
      body.appendChild(el('div', 'dk-empty', 'No jobs posted here. Services only.'));
      return;
    }
    for (const job of this.jobs) {
      const row = el('div', 'dk-job' + (job.rush ? ' rush' : ''));

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

      row.appendChild(el('div', 'dk-parcel',
        `${job.parcel.icon} ${job.parcel.name} — ${job.parcel.slots} slot${job.parcel.slots > 1 ? 's' : ''}`));
      row.appendChild(el('div', 'dk-dest', `→ ${job.dest.districtName} · ${job.dest.name}`));

      const chips = el('div', 'dk-chips');
      chips.appendChild(el('span', 'dk-chip', `${job.km.toFixed(1)} km`));
      chips.appendChild(el('span', 'dk-chip', `⏱ ${mmss(job.limit)}`));
      chips.appendChild(el('span', 'dk-chip risk r' + job.risk, `⚠ ${job.riskLabel}`));
      if (job.rush) chips.appendChild(el('span', 'dk-chip hot', `⚡ RUSH ×${job.rushMul}`));
      row.appendChild(chips);

      const pay = el('div', 'dk-pay');
      pay.appendChild(el('span', 'dk-payl', 'PAYMENT'));
      pay.appendChild(el('b', null, `${job.base + Math.round(job.base * job.haggleGain)} CRD`));
      row.appendChild(pay);
      row.appendChild(el('div', 'dk-bonus',
        `+ under ${mmss(job.bonus.saturateAt)}   +${Math.round(job.bonus.maxTime * 100)}%`));
      row.appendChild(el('div', 'dk-bonus',
        `+ chain, per extra parcel   +${Math.round(job.bonus.chain * 100)}%`));

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
    }
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
    if (!st.cargo.length) { body.appendChild(el('div', 'dk-empty', 'Hold is empty.')); return; }
    for (const p of st.cargo) {
      const row = el('div', 'dk-held');
      row.appendChild(el('div', 'dk-parcel', `${p.parcel.icon} ${p.parcel.name}`));
      row.appendChild(el('div', 'dk-dest', `→ ${p.dest.districtName} · ${p.dest.name}`));
      row.appendChild(el('div', 'dk-chips', `${p.km.toFixed(1)} km · ⏱ ${mmss(p.limit)} · ${p.base} CRD`));
      body.appendChild(row);
    }
  }

  _shop(body, st) {
    // charge
    const room = Math.round(E.cellMax(st) - st.cellUnits);
    const chg = el('div', 'dk-sect');
    chg.appendChild(el('h4', null, `CHARGE — ${E.FUEL.PRICE} CRD/unit`));
    chg.appendChild(el('div', 'dk-chips',
      `${Math.round(st.cellUnits)} / ${Math.round(E.cellMax(st))} units · full costs ${E.chargeCost(room)} CRD`));
    // Its own class, not `dk-accept`. They look identical and they are NOT the same action: a
    // selector that matches both makes "press the first enabled ACCEPT on the board" quietly press
    // FILL when the board happens to be a service pad, which is what a browser gate found it doing.
    const fill = el('button', 'dk-fill', room > 0 ? `FILL (${E.chargeCost(room)} CRD)` : 'CELL FULL');
    fill.disabled = room <= 0;
    fill.addEventListener('click', () => this._act(this.hooks.charge, Infinity));
    chg.appendChild(fill);
    body.appendChild(chg);

    // upgrades
    const up = el('div', 'dk-sect');
    up.appendChild(el('h4', null, 'UPGRADES'));
    for (const line of Object.keys(E.UPGRADES)) {
      const lv = st.upgrades[line] || 0;
      const price = E.upgradePrice(st, line);
      const b = el('button', 'dk-shop',
        `${E.UPGRADES[line].label}  L${lv}/3   ${price === null ? 'MAX' : price + ' CRD'}`);
      b.disabled = price === null || st.credits < price;
      b.addEventListener('click', () => this._act(this.hooks.buyUpgrade, line));
      up.appendChild(b);
    }
    body.appendChild(up);

    // hulls
    const cr = el('div', 'dk-sect');
    cr.appendChild(el('h4', null, 'HULLS'));
    for (const id of Object.keys(E.CRAFT)) {
      const chk = E.canBuyCraft(st, id);
      const c = E.CRAFT[id];
      const why = chk.ok ? `${c.price} CRD`
        : chk.why === 'owned' ? 'IN SERVICE'
          : chk.why === 'licence' ? 'LICENCE' : `SHORT ${chk.short}`;
      const b = el('button', 'dk-shop', `${id.toUpperCase()}  ${c.slots} slots   ${why}`);
      b.disabled = !chk.ok;
      b.addEventListener('click', () => this._act(this.hooks.buyCraft, id));
      cr.appendChild(b);
    }
    const rep = el('button', 'dk-shop', `COSMETIC REPAIR   ${E.REPAIR_PRICE} CRD`);
    rep.disabled = st.credits < E.REPAIR_PRICE;
    rep.addEventListener('click', () => this._act(this.hooks.buyRepair));
    cr.appendChild(rep);
    body.appendChild(cr);
  }

  stateOf() {
    return { open: this.open, tab: this.tab, jobs: this.jobs.length,
      pad: this.pad ? this.pad.key : null, opens: this.opens, actions: this.actions,
      prompt: this._promptKey };
  }
}

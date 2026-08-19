// §S2-E's surfaces: the intro cutscene, the hire panel, the act-one ending, and the story voice.
//
// Everything here renders. The arc itself — the debt, the pace, the escalation, the endings, the
// hire arithmetic — is in `js/story.js` and is pure, so this file makes no decisions: it shows what
// story.js says and hands presses back through injected callbacks, the way `ui.js` does.
//
// **No alert / confirm / prompt anywhere in this file.** Aaron dislikes modals; every refusal is a
// disabled row with its reason printed on it, and every question is a styled in-game panel.
//
// ── the cutscene's speech is drawn in the world, not typeset over it ────────
//
// Aaron's spec: *"A neon line grows up and out of the craft"*, *"A line extends from one of them
// into a speech rectangle"*. So a bubble is anchored to a WORLD POINT and re-projected every frame,
// with an SVG leader drawn from the anchor to the box. That is why this is DOM+SVG over the canvas
// rather than three.js geometry: the text has to be crisp at any dpr and it has to reflow on a
// 390 px phone, and a texture-mapped quad does neither.

import * as Story from './story.js';
import * as E from './economy.js';
import { CabinPanel } from './ui.js';

const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};
const crd = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const mmss = s => {
  const t = Math.max(0, Math.round(s));
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`;
};

// ── the script ─────────────────────────────────────────────────────────────
//
// The Boss does nearly all the talking and the player is talked over — that is the scene, and it
// is why the player's lines are `cut: true`: they appear, and the Boss's next line starts while
// they are still on screen rather than after them. A polite conversation would be a different
// scene.
//
// `voice` is the clip slot in assets/audio/story/. The Boss's lines are GENDER-INVARIANT and
// generated once; the player's take is chosen at play time from the gender pick, which is why the
// player rows carry a slot STEM and the Boss's carry a whole slot.
export const SCRIPT = [
  { who: 'boss', voice: 'boss_01', hold: 3.2,
    text: 'Don’t get out. Don’t touch the stick. Just listen.' },
  { who: 'boss', voice: 'boss_02', hold: 4.4,
    text: 'That is a very nice craft you are flying. Insured to somebody else, I notice.' },
  { who: 'boss', voice: 'boss_03', hold: 4.6,
    text: 'Your father owes us fifty thousand. He has owed us fifty thousand for a while now.' },
  { who: 'pc', voice: 'int1', hold: 1.0, cut: true, text: 'But—' },
  { who: 'boss', voice: 'boss_04', hold: 3.4,
    text: 'He is away. You are here. That makes it yours.' },
  { who: 'pc', voice: 'int2', hold: 1.0, cut: true, text: 'Wait—' },
  { who: 'boss', voice: 'boss_05', hold: 4.8,
    text: 'Fifty thousand credits. We will come for it, and I would not make us look for you.' },
  { who: 'pc', voice: 'int3', hold: 1.2, cut: true, text: 'Just wait—' },
  { who: 'boss', voice: 'boss_06', hold: 7.2,
    text: 'If it is not ready we take the craft and sell it. Then we break an arm. Then, if I am in a mood, we sell whoever was driving to whoever is buying.' },
  { who: 'boss', voice: 'boss_07', hold: 2.6, text: 'Make the money. Soon.' },
];

// Aaron's line, verbatim. It is the whole point of the scene's last beat: the player has to know
// where they stand, and the reason the borrowed hull is above their licence is so that
// *"I shouldn't even be flying this"* is literally true when they look at the dash.
export const MONOLOGUE = {
  who: 'pc', voice: 'close', hold: 11.0,
  text: 'Shit — they wouldn’t let me get a word in. What sort of shit has my Dad got himself into? '
    + 'I shouldn’t even be flying this, but now I’m going to have to. I need to make that money fast.',
};

// Auto-names, offered rather than imposed. A player who wants to be called something else types it;
// a player who wants to start flying presses SKIP and gets one of these.
const AUTO_NAMES = ['KESTREL', 'VANE', 'SOOT', 'HALLOW', 'MERIDIAN', 'CASS', 'RIVET', 'OKONKWO',
  'DRAY', 'LANTERN', 'NIX', 'BRAE', 'TOLL', 'ASHER', 'QUAY', 'MARLOW'];

export const GENDERS = [
  { id: 'm', label: 'MALE' },
  { id: 'f', label: 'FEMALE' },
  { id: 'n', label: 'NEITHER' },
];

// ── the story voice ────────────────────────────────────────────────────────
//
// Deliberately NOT js/radio.js. Every clip radio.js plays goes out through the radio bus, which
// band-limits to 300-3400 Hz and adds squelch — and **the Boss is in the room**, not on a radio. A
// band-limited Boss would sound like dispatch, which is the one thing this scene must not sound
// like. So the story pool is its own tiny loader and it plays through the SFX bus with the squelch
// off, and the assets themselves skip `tools/radio_fx.sh` (see tools/vo/gen_story.py).
export class StoryVoice {
  constructor({ audio = null, base = './', onError = () => {} } = {}) {
    this.audio = audio;
    this.base = base.endsWith('/') ? base : base + '/';
    this.onError = onError;
    this.buffers = new Map();
    this.absent = new Set();
    this.playing = null;
    this.stats = { fetched: 0, played: 0, absent: 0, bytes: 0 };
  }

  // The gender pick chooses between three takes of the SAME line; the Boss has one take.
  slotFor(row, gender) {
    return row.who === 'boss' ? row.voice : `pc_${gender || 'n'}_${row.voice}`;
  }

  async load(slot) {
    if (this.buffers.has(slot)) return this.buffers.get(slot);
    if (this.absent.has(slot)) return null;
    const ctx = this.audio && this.audio.ctx;
    if (!ctx || typeof fetch !== 'function') return null;
    try {
      const r = await fetch(`${this.base}assets/audio/story/${slot}.mp3`, { cache: 'force-cache' });
      if (!r.ok) { this.absent.add(slot); this.stats.absent++; return null; }
      const bytes = await r.arrayBuffer();
      this.stats.fetched++; this.stats.bytes += bytes.byteLength;
      const buf = await ctx.decodeAudioData(bytes);
      this.buffers.set(slot, buf);
      return buf;
    } catch (e) {
      this.absent.add(slot);
      this.stats.absent++;
      this.onError('story-vo', `${slot}: ${e && e.message}`);
      return null;
    }
  }

  // Fire and forget. A line NEVER waits on the network: if the clip is not decoded yet the bubble
  // goes up on its written hold and the fetch is started for next time — the same rule radio.js
  // follows, and for the same reason.
  play(slot) {
    const buf = this.buffers.get(slot);
    if (!buf) { this.load(slot); return null; }
    if (!this.audio) return null;
    // `bus: 'sfx'` is the whole point: no band limit, no squelch. He is standing in your cabin.
    const p = this.audio.playClip(buf, { gain: 1.0, squelch: false, bus: 'sfx' });
    if (p) { this.stats.played++; this.playing = p; }
    return p;
  }

  stop() {
    if (this.playing && this.playing.src) { try { this.playing.src.stop(); } catch { /* already ended */ } }
    this.playing = null;
  }

  // Everything the scene will need, warmed while the camera is still on the parked craft.
  preload(gender) {
    const want = SCRIPT.concat([MONOLOGUE]).map(r => this.slotFor(r, gender));
    return Promise.all(want.map(s => this.load(s)));
  }

  state() {
    return { ...this.stats, decoded: this.buffers.size, missing: [...this.absent] };
  }
}

// ── the intro cutscene ─────────────────────────────────────────────────────
//
// Six beats, driven off a sim clock and NOT off wall time, so a slow phone sees the same scene as a
// fast one and a gate can step it deterministically:
//
//   park      the parked craft, docking cylinder dimmed almost out (Aaron asked for this by name)
//   name      the neon line grows out of the hull into the name / gender panel
//   pullout   the camera rises and backs off, revealing the mob craft that were behind it
//   boss      the Boss talks, the player is talked over
//   leave     the mob break formation and go
//   close     the player's own line, and then the game
//
// `hooks.setZoneDim(k)`, `hooks.done(pick)` and `hooks.camera` are the whole coupling to main.js.
export class IntroScene {
  constructor(host, three, camera, hooks = {}) {
    this.host = host;
    this.THREE = three;
    this.camera = camera;
    this.hooks = hooks;
    this.active = false;
    this.phase = 'park';
    this.t = 0;
    this.beat = 0;
    this.beatT = 0;
    this.pick = { name: '', gender: 'n' };
    this.autoName = AUTO_NAMES[(Math.random() * AUTO_NAMES.length) | 0];
    this.anchor = { x: 0, y: 0, z: 0 };     // the parked craft, world space
    this.mob = [];
    this.bubbles = [];
    this._v = new three.Vector3();
    this.skipped = false;
    this.build();
  }

  build() {
    const h = this.host;
    h.innerHTML = '';
    h.classList.add('intro-layer');
    // The leader lines. One SVG for the whole layer: a line per live bubble, redrawn each frame.
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'iv-lines');
    h.appendChild(this.svg);
    this.stage = el('div', 'iv-stage');
    h.appendChild(this.stage);

    // The one control that is always available. A cutscene you cannot leave is a cutscene the
    // player resents on the second run, and this one runs on every fresh profile.
    this.skipBtn = el('button', 'iv-skip', 'SKIP');
    this.skipBtn.addEventListener('click', () => this.skip());
    h.appendChild(this.skipBtn);
    this.title = el('div', 'iv-title');
    this.title.appendChild(el('span', 'ivt-k', 'NEONHAUL'));
    this.title.appendChild(el('span', 'ivt-s', 'act one · the borrowed car'));
    h.appendChild(this.title);
  }

  // main.js hands over the parked pose and the ring of mob craft it wants drawn. Built here rather
  // than in main.js so the geometry of the scene lives beside the script that plays over it.
  start({ x, y, z, yaw, def, mobDefs = [] }) {
    this.active = true;
    this.phase = 'park';
    this.t = 0; this.beat = 0; this.beatT = 0;
    this.anchor = { x, y, z };
    this.playerPose = { def, x, y, z, yaw, pitch: 0, roll: 0, throttle: 0, t: 0 };
    // Six craft in a ring, at mixed radii and heights so it reads as a crew arriving rather than
    // as a parade. The one at index 0 is the Boss's and it is the closest and the lowest; every
    // speech line is anchored to it.
    const R = 26;
    this.mob = mobDefs.map((def2, i) => {
      const a = (i / Math.max(1, mobDefs.length)) * Math.PI * 2 + 0.55;
      const rr = R * (i === 0 ? 0.62 : 0.9 + 0.24 * Math.sin(i * 2.7));
      return {
        def: def2,
        // `home` is where they hover; `x/y/z` is where they are, so `leave` can move them.
        home: { x: x + Math.cos(a) * rr, y: y + (i === 0 ? 2.2 : 5 + 4.5 * Math.sin(i * 1.9)),
          z: z + Math.sin(a) * rr },
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, throttle: 0.12, t: 0,
        // Approaching from outside and settling in over the pull-out, which is what makes the
        // reveal a reveal: they are not simply already there when the camera turns round.
        away: 1,
        tint: 0x0b0d12, trim: i === 0 ? 0xff2b3a : 0xff2f6d, run: i % 4, edge: (i % 6),
        bob: 0.5 + 0.4 * Math.sin(i * 3.1),
        phase: i * 1.31,
      };
    });
    // 0.03, not 0.06. The pull-out ends OUTSIDE the cylinder, and zones.js only skips the near
    // wall when the camera is inside one — so from out there both walls draw and an additive
    // material contributes twice. The first capture read as a solid grey drum at 0.06.
    this.hooks.setZoneDim && this.hooks.setZoneDim(0.03);
    this.host.classList.remove('hidden');
    this.showName();
    return true;
  }

  // ── the name / gender panel ─────────────────────────────────────────────
  showName() {
    this.phase = 'name';
    this.clearBubbles();
    const b = this.bubble('form', { at: 'player', cls: 'iv-form' });
    const body = b.body;
    body.appendChild(el('div', 'ivf-kick', 'HAUL CONTROL · OPERATOR RECORD'));
    const row = el('div', 'ivf-row');
    const input = el('input', 'ivf-name');
    input.type = 'text';
    input.maxLength = 14;
    input.placeholder = this.autoName;
    input.setAttribute('aria-label', 'pilot name');
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this.confirmName(); });
    row.appendChild(input);
    body.appendChild(row);
    this.nameInput = input;

    body.appendChild(el('div', 'ivf-kick', 'ON THE RECORD AS'));
    const gs = el('div', 'ivf-gender');
    this.genderBtns = GENDERS.map(g => {
      const btn = el('button', 'ivf-g' + (g.id === this.pick.gender ? ' on' : ''), g.label);
      btn.addEventListener('click', () => {
        this.pick.gender = g.id;
        this.genderBtns.forEach((bb, i) => bb.classList.toggle('on', GENDERS[i].id === g.id));
        this.hooks.gender && this.hooks.gender(g.id);
      });
      gs.appendChild(btn);
      return btn;
    });
    body.appendChild(gs);

    const foot = el('div', 'ivf-foot');
    const go = el('button', 'ivf-go', 'CONFIRM');
    go.addEventListener('click', () => this.confirmName());
    const auto = el('button', 'ivf-auto', `USE ${this.autoName}`);
    auto.addEventListener('click', () => { input.value = this.autoName; this.confirmName(); });
    foot.appendChild(auto);
    foot.appendChild(go);
    body.appendChild(foot);
  }

  confirmName() {
    if (this.phase !== 'name') return false;
    const raw = (this.nameInput && this.nameInput.value || '').trim();
    this.pick.name = (raw || this.autoName).slice(0, 14).toUpperCase();
    this.clearBubbles();
    this.phase = 'pullout';
    this.beatT = 0;
    this.hooks.picked && this.hooks.picked({ ...this.pick });
    return true;
  }

  // ── bubbles ─────────────────────────────────────────────────────────────
  // `at` is 'player' or 'boss'; the anchor is looked up at paint time, so a bubble stays attached
  // to a craft that is moving during the pull-out.
  bubble(id, { at = 'boss', cls = '', text = '', who = '' } = {}) {
    const box = el('div', `iv-bubble ${cls}`);
    if (who) box.appendChild(el('span', 'ivb-who', who));
    const body = el('div', 'ivb-body');
    if (text) body.textContent = text;
    box.appendChild(body);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('class', 'iv-lead');
    this.svg.appendChild(line);
    this.stage.appendChild(box);
    const rec = { id, at, box, body, line, born: this.t };
    this.bubbles.push(rec);
    return rec;
  }

  // `only` narrows it to one anchor class, which is what makes the overlap above possible.
  clearBubbles(only) {
    const keep = [];
    for (const b of this.bubbles) {
      if (only && b.at !== (only === 'boss' ? 'boss' : 'player')) { keep.push(b); continue; }
      b.box.remove(); b.line.remove();
    }
    this.bubbles = keep;
  }

  dropBubble(rec) {
    rec.box.remove(); rec.line.remove();
    this.bubbles = this.bubbles.filter(b => b !== rec);
  }

  // ── the beat machine ────────────────────────────────────────────────────
  update(dt) {
    if (!this.active) return null;
    this.t += dt;
    this.beatT += dt;
    if (this.phase === 'pullout') {
      // 3.4 s of camera move, then the Boss starts. The mob settle over the same window.
      if (this.beatT >= 3.4) { this.phase = 'boss'; this.beat = 0; this.beatT = 0; this.sayBeat(); }
    } else if (this.phase === 'boss') {
      const row = SCRIPT[this.beat];
      if (row && this.beatT >= row.hold) {
        this.beat++;
        this.beatT = 0;
        if (this.beat >= SCRIPT.length) { this.phase = 'leave'; this.clearBubbles(); }
        else this.sayBeat();
      }
    } else if (this.phase === 'leave') {
      if (this.beatT >= 2.6) {
        this.phase = 'close'; this.beatT = 0;
        this.say(MONOLOGUE, 'player');
      }
    } else if (this.phase === 'close') {
      if (this.beatT >= MONOLOGUE.hold) return this.finish();
    }
    // Retire an interjection on its own clock rather than on the Boss's.
    for (const b of this.bubbles.slice()) {
      if (b.cut && this.t - b.born > IntroScene.CUT_LIFE) this.dropBubble(b);
    }
    this.paint();
    return null;
  }

  // How long a cut-off interjection stays on screen. LONGER than its `hold`, deliberately: `hold`
  // is when the Boss starts talking again and the bubble's life is how long you can still read it.
  // The gap between the two IS the "talked over" — for 1.4 s both boxes are up and his is the one
  // still going. The first capture pass had them equal, so his next line cleared the interjection
  // on the frame it appeared and the scene read as a polite conversation.
  static CUT_LIFE = 2.4;

  sayBeat() {
    const row = SCRIPT[this.beat];
    if (!row) return;
    if (row.who === 'pc') this.say(row, 'player', true);
    // A Boss line clears the previous BOSS line and leaves a live interjection standing. `keep` is
    // load-bearing: `say()` clears EVERYTHING when it is false, so passing it here would undo the
    // narrowed clear on the line above. The first capture pass did exactly that and the
    // interjections were gone within a frame of appearing — invisible in play, and invisible in a
    // screenshot taken at the right moment, which is why this was found by tracing the DOM rather
    // than by looking at a picture.
    else { this.clearBubbles('boss'); this.say(row, 'boss', true); }
  }

  say(row, at, keep = false) {
    if (!keep) this.clearBubbles();
    const who = row.who === 'boss' ? 'THE BOSS' : (this.pick.name || 'YOU');
    const rec = this.bubble(`b${this.beat}`, { at, text: row.text, who,
      cls: row.who === 'boss' ? 'boss' : 'pc' });
    rec.cut = !!row.cut;
    this.hooks.voice && this.hooks.voice(row, this.pick.gender);
    return rec;
  }

  // Where the camera should be this frame. Returned rather than applied, so main.js owns the one
  // write to `camera.position` — two places moving a camera is how a cutscene starts fighting a rig.
  cameraFor() {
    const a = this.anchor;
    const k = this.phase === 'park' || this.phase === 'name' ? 0
      : this.phase === 'pullout' ? ease(Math.min(1, this.beatT / 3.4)) : 1;
    // Near framing: over the right shoulder of the parked craft, low, so the hull fills the frame.
    const n = { r: 11, h: 3.4, ang: 0.72 };
    // Wide framing: high and back, far enough that all six mob craft are in shot. Measured off
    // the first capture pass — r 46 / h 17 put two of the six behind the camera, which is a reveal
    // that does not reveal.
    const w = { r: 62, h: 26, ang: 1.05 };
    const r = n.r + (w.r - n.r) * k, hh = n.h + (w.h - n.h) * k, ang = n.ang + (w.ang - n.ang) * k;
    // A slow orbit under everything, so even the static beats are not a locked-off tripod. 0.035
    // rad/s was the first pass and it swung 1.6 rad over the 47 s scene, which put the Boss off
    // frame by his fourth line and took his own leader line with him. 0.012 is a quarter of that.
    const th = ang + this.t * 0.012;
    return {
      x: a.x + Math.sin(th) * r, y: a.y + hh, z: a.z + Math.cos(th) * r,
      look: { x: a.x, y: a.y + 1.2 + 2.0 * k, z: a.z },
    };
  }

  // The poses main.js writes into the craft fields: the parked hull, plus the crew once they are
  // on their way in.
  poses(t) {
    const out = [];
    this.playerPose.t = t;
    out.push(this.playerPose);
    if (this.phase === 'park' || this.phase === 'name') return out;
    const settle = this.phase === 'pullout' ? 1 - ease(Math.min(1, this.beatT / 3.4)) : 0;
    const gone = this.phase === 'leave' ? Math.min(1, this.beatT / 2.6)
      : this.phase === 'close' ? 1 : 0;
    for (const m of this.mob) {
      m.away = settle;
      const outK = gone * gone;                     // accelerating away, not a linear slide
      const dx = m.home.x - this.anchor.x, dz = m.home.z - this.anchor.z;
      m.x = m.home.x + dx * (settle * 2.2 + outK * 9);
      m.z = m.home.z + dz * (settle * 2.2 + outK * 9);
      m.y = m.home.y + settle * 26 + outK * 70 + Math.sin(t * 0.9 + m.phase) * m.bob;
      m.yaw = Math.atan2(this.anchor.x - m.x, this.anchor.z - m.z);
      m.throttle = 0.1 + outK * 0.9;
      m.t = t;
      out.push(m);
    }
    return out;
  }

  // The world point a bubble hangs off.
  anchorOf(at) {
    if (at === 'player' || !this.mob.length) {
      return { x: this.anchor.x, y: this.anchor.y + 2.6, z: this.anchor.z };
    }
    const m = this.mob[0];
    return { x: m.x, y: m.y + 1.8, z: m.z };
  }

  // Project, place, and draw the leader. Runs every frame while the scene is up; it is DOM writes
  // on at most three elements, which is why the scene costs nothing measurable.
  paint() {
    const W = this.host.clientWidth || window.innerWidth;
    const H = this.host.clientHeight || window.innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const b of this.bubbles) {
      const a = this.anchorOf(b.at);
      this._v.set(a.x, a.y, a.z).project(this.camera);
      const sx = (this._v.x * 0.5 + 0.5) * W;
      const sy = (-this._v.y * 0.5 + 0.5) * H;
      const behind = this._v.z > 1;
      b.box.classList.toggle('offscreen', behind);
      // The box is placed by CSS class (boss high, player low) and only nudged horizontally, so a
      // long line never lands half off a 390 px screen chasing an anchor near the edge.
      const bw = b.box.offsetWidth || 240;
      const bx = clamp(sx - bw / 2, 10, Math.max(10, W - bw - 10));
      b.box.style.left = `${Math.round(bx)}px`;
      const by = b.box.offsetTop;
      // The leader grows out of the anchor over 0.45 s — Aaron's "a neon line grows up and out of
      // the craft" — and then holds.
      const grow = clamp((this.t - b.born) / 0.45, 0, 1);
      const tx = bx + bw / 2, ty = by + (b.at === 'player' ? 0 : b.box.offsetHeight);
      const mx = sx + (tx - sx) * grow, my = sy + (ty - sy) * grow;
      b.line.setAttribute('d', `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${mx.toFixed(1)} ${my.toFixed(1)}`);
      b.line.style.opacity = behind ? '0' : '1';
    }
  }

  skip() {
    this.skipped = true;
    if (this.phase === 'name') { this.confirmName(); this.phase = 'leave'; this.beatT = 2.6; }
    return this.finish();
  }

  finish() {
    if (!this.active) return null;
    this.active = false;
    this.clearBubbles();
    this.host.classList.add('hidden');
    this.hooks.setZoneDim && this.hooks.setZoneDim(1);
    const pick = { ...this.pick, name: this.pick.name || this.autoName };
    this.hooks.done && this.hooks.done(pick);
    return pick;
  }

  stateOf() {
    return { active: this.active, phase: this.phase, beat: this.beat, t: +this.t.toFixed(2),
      bubbles: this.bubbles.length, mob: this.mob.length, pick: { ...this.pick },
      skipped: this.skipped };
  }
}

// ── the hire panel ─────────────────────────────────────────────────────────
//
// Two jobs, one surface, because they are the same transaction:
//
//   EXTEND   from inside the cabin, off `#btn-hire`. Aaron: *"The player must never have to fly
//            somewhere to keep the meter running."* +1 block, or as many as they can afford.
//   HIRE     from a dock, when they have no craft at all — which is where every player is the
//            moment act one ends, in both branches.
//
// It is a CabinPanel, so it inherits the neon frame, the corner brackets and the guarantee that
// there is no alert() anywhere near it.
export class HirePanel {
  constructor(host, hooks = {}) {
    this.hooks = hooks;                       // { state, hire, now, close }
    this.panel = new CabinPanel(host, { kicker: 'VEHICLE HIRE', title: 'EXTEND HIRE', wide: true });
    this.sel = null;
    this.blocks = 1;
    this.note = '';
    this.opens = 0;
    this.actions = 0;
  }

  get open() { return this.panel.open; }

  show(mode = 'extend') {
    this.mode = mode;
    this.note = '';
    this.opens++;
    const st = this.hooks.state ? this.hooks.state() : null;
    // The default selection is what you are already in when extending, and the cheapest thing you
    // can actually afford when you are standing on a pad with nothing.
    this.sel = st && st.story && st.story.hire ? st.story.hire.craft : null;
    this.blocks = 1;
    this.panel.setTitle(mode === 'ground' ? 'HIRE A CRAFT' : 'EXTEND HIRE');
    this.panel.show();
    this.paint();
    return true;
  }

  hide() { return this.panel.hide(); }
  toggle(mode) { return this.panel.open ? this.hide() : this.show(mode); }

  _act(craft, blocks) {
    this.actions++;
    const r = this.hooks.hire ? this.hooks.hire(craft, blocks) : null;
    if (r && r.note !== undefined) this.note = r.note;
    if (r && r.ok && this.mode === 'ground') { this.hide(); return r; }
    this.paint();
    return r;
  }

  paint() {
    const body = this.panel.body;
    body.innerHTML = '';
    const st = this.hooks.state ? this.hooks.state() : null;
    if (!st) return;
    const { econ, story, now } = st;
    const left = Story.hireLeft(story, now);

    // ── the meter ───────────────────────────────────────────────────────
    const head = el('div', 'hr-head');
    const meterWrap = el('div', 'hr-meter');
    if (left === null) {
      meterWrap.appendChild(el('span', 'hrm-k', 'NO HIRE'));
      meterWrap.appendChild(el('span', 'hrm-v', story && story.stage === Story.STAGE.ACT2
        ? 'grounded — nothing on the pad is yours' : 'you are flying your own hull'));
    } else {
      const frac = clamp(left / Story.HIRE.BLOCK_S, 0, 1);
      meterWrap.appendChild(el('span', 'hrm-k', left <= 0 ? 'LAPSED' : 'TIME ON THE METER'));
      const v = el('span', `hrm-v${left <= 0 ? ' bad' : left < Story.HIRE.WARN_S ? ' warn' : ''}`,
        left <= 0 ? 'RECALLED — the hull is limping' : mmss(left));
      meterWrap.appendChild(v);
      const bar = el('div', 'hr-bar');
      for (let i = 0; i < 20; i++) bar.appendChild(el('i', i < Math.round(frac * 20) ? 'on' : null));
      meterWrap.appendChild(bar);
    }
    head.appendChild(meterWrap);
    const purse = el('div', 'hr-purse');
    purse.appendChild(el('span', 'hrp-k', 'BALANCE'));
    purse.appendChild(el('span', 'hrp-v', `${crd(econ.credits)} CRD`));
    head.appendChild(purse);
    body.appendChild(head);

    // ── how many blocks ─────────────────────────────────────────────────
    // Aaron: *"+5 minutes, or as many blocks as the player can currently afford"*. So the row is
    // the block count, and every count the balance cannot cover is disabled with its price still
    // printed on it — a greyed row with a reason, never a hidden option.
    const craft = this.sel || (story && story.hire ? story.hire.craft : 'wisp');
    const bl = el('div', 'hr-blocks');
    bl.appendChild(el('span', 'hrb-k', 'BLOCKS'));
    const opts = [1, 2, 4, 8, 12];
    const wreck = Story.wreckAvailable(story, craft);
    for (const n of opts) {
      const q = Story.hireCost(story, craft, n);
      // While the wreck is on the lot `hireCost` answers 90 for every block count, because it is
      // one vehicle and not a rate — so the multi-block keys would all have read "90" beside a
      // disabled button. They show the MARKET price they will cost once the wreck is gone, which
      // is also the most useful thing the player can be told at that moment.
      const market = Story.round5Blocks(craft, n);
      const shown = q.wreck && n > 1 ? market : q.price;
      const afford = econ.credits >= shown && !(q.wreck && n > 1);
      const b = el('button', 'hrb' + (this.blocks === n ? ' on' : '') + (afford ? '' : ' no'));
      b.appendChild(el('b', null, `+${(n * Story.HIRE.BLOCK_S / 60) | 0}`));
      b.appendChild(el('i', null, `${crd(shown)}`));
      if (q.discount < 1) b.appendChild(el('u', null, `-${Math.round((1 - q.discount) * 100)}%`));
      b.disabled = !afford;
      b.addEventListener('click', () => { this.blocks = n; this.paint(); });
      bl.appendChild(b);
    }
    body.appendChild(bl);
    if (wreck) {
      body.appendChild(el('div', 'hr-wreck',
        'One wreck on the lot at ninety credits. Nobody else wants it. One block, no extensions.'));
    }

    // ── the fleet ───────────────────────────────────────────────────────
    const fleet = el('div', 'hr-fleet');
    for (const id of Object.keys(E.CRAFT)) {
      const licensed = E.unlockedCraft(econ.tier).includes(id);
      const q = Story.hireCost(story, id, this.blocks);
      const afford = econ.credits >= q.price;
      const row = el('button', 'hr-row'
        + (this.sel === id ? ' on' : '')
        + (afford && licensed ? '' : ' no'));
      row.appendChild(el('span', 'hrr-id', id.toUpperCase()));
      const spec = el('span', 'hrr-spec');
      spec.textContent = `${E.CRAFT[id].slots} slot${E.CRAFT[id].slots === 1 ? '' : 's'}`
        + (E.CRAFT[id].effMul < 1 ? ' · long range' : '');
      row.appendChild(spec);
      row.appendChild(el('span', 'hrr-price', `${crd(q.price)} CRD`));
      // A hire above your licence is refused for the SAME reason a purchase above it is. Hiring is
      // a way past a capital wall, not past the ladder.
      row.appendChild(el('span', 'hrr-why', !licensed ? 'licence too low'
        : !afford ? `short ${crd(q.price - econ.credits)}` : `${(q.blocks * Story.HIRE.BLOCK_S / 60) | 0} min`));
      row.disabled = !licensed;
      row.addEventListener('click', () => {
        if (this.sel !== id) { this.sel = id; this.blocks = 1; this.paint(); return; }
        this._act(id, this.blocks);
      });
      fleet.appendChild(row);
    }
    body.appendChild(fleet);

    const foot = el('div', 'hr-foot');
    const q = Story.hireCost(story, craft, this.blocks);
    const take = el('button', 'hr-take',
      `${story && story.hire && story.hire.craft === craft ? 'EXTEND' : 'HIRE'} ${craft.toUpperCase()} · ${crd(q.price)} CRD`);
    take.disabled = econ.credits < q.price || !E.unlockedCraft(econ.tier).includes(craft);
    take.addEventListener('click', () => this._act(craft, this.blocks));
    foot.appendChild(take);
    body.appendChild(foot);

    if (this.note) {
      const n = el('div', 'hr-note');
      n.appendChild(el('span', 'hrn-mark', '!'));
      n.appendChild(el('span', null, this.note));
      body.appendChild(n);
    }
  }

  stateOf() {
    return { open: this.panel.open, mode: this.mode, sel: this.sel, blocks: this.blocks,
      opens: this.opens, actions: this.actions, note: this.note };
  }
}

// ── the act-one ending ─────────────────────────────────────────────────────
//
// **Both branches lose the car**, which is Aaron's call and is structural rather than flavour: the
// hire loop is the spine of the game, so it gets built once and properly and every player arrives
// in it. What differs is the capital you arrive with and what is on your record.
export class EndingPanel {
  constructor(host, hooks = {}) {
    this.hooks = hooks;                        // { close }
    this.panel = new CabinPanel(host, { kicker: 'ACT ONE', title: '', closeLabel: 'GO ON' },
      );
    this.result = null;
    this.opens = 0;
  }

  get open() { return this.panel.open; }

  show(result, econ) {
    this.result = result;
    this.opens++;
    this.panel.setTitle(result.title);
    const body = this.panel.body;
    body.innerHTML = '';
    body.appendChild(el('div', `en-kick ${result.branch}`, result.kicker));

    const lines = result.paid ? [
      'They land on the pad while you are still shutting down. Nobody says anything for a while.',
      `You transfer fifty thousand credits. He counts it in front of you, which is the point of `
      + `counting it in front of you.`,
      // NO DAYS. Aaron: *"i actually like the idea of no days in the game."* The first draft of this
      // paragraph opened "Two days later" and the seized one said "a decision he made today", which
      // would have been the only place in the entire game that counted one.
      'Your parents come home sooner than they said they would. Your father does not look at the '
      + 'craft when he takes the keys back, and he does not look at you either. Your mother thanks '
      + 'you about six times.',
      'You are standing on a pad with no vehicle and whatever is left in your account. '
      + 'Your father owes you, and he knows it.',
    ] : [
      'They are waiting on the pad. They were always going to be waiting on the pad.',
      'He does not raise his voice. Somebody else flies the craft away while he is still talking, '
      + 'and the account goes to ninety credits in front of you.',
      'Nobody breaks an arm. He wants you to understand that this was a decision, that he made it, '
      + 'and that he could have made a different one.',
      'You are standing on a pad with ninety credits and a crew who now know your name.',
    ];
    for (const t of lines) body.appendChild(el('p', 'en-p', t));

    const grid = el('div', 'en-grid');
    const cell = (k, v, cls) => {
      const c = el('div', `en-cell${cls ? ' ' + cls : ''}`);
      c.appendChild(el('i', null, k));
      c.appendChild(el('b', null, v));
      return c;
    };
    grid.appendChild(cell('THEY TOOK', `${crd(result.took)} CRD`, 'bad'));
    grid.appendChild(cell('YOU KEEP', `${crd(result.kept)} CRD`, result.paid ? 'good' : 'bad'));
    grid.appendChild(cell('THE CRAFT', 'gone', 'bad'));
    grid.appendChild(cell('ON YOUR RECORD', result.flags.map(f => f.replace(/_/g, ' ')).join(' · '),
      result.paid ? 'good' : ''));
    body.appendChild(grid);

    body.appendChild(el('div', 'en-next', result.paid
      ? 'Act two: you hire what you fly, by the block, until you can buy a hull that is yours.'
      : 'Act two: you hire what you fly, by the block. There is one wreck on the lot at ninety '
        + 'credits and it is exactly as good as it sounds.'));
    this.panel.onHide = () => { this.hooks.close && this.hooks.close(result); };
    this.panel.show();
    void econ;
    return true;
  }

  hide() { return this.panel.hide(); }
  stateOf() { return { open: this.panel.open, opens: this.opens,
    branch: this.result ? this.result.branch : null }; }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Smoothstep. The camera move has to start and stop at rest or the reveal reads as a jump cut.
const ease = k => k * k * (3 - 2 * k);

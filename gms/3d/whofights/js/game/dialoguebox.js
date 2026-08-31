// The dialogue presentation. Non-modal: movement is off, look-drag stays live, the clock keeps
// running.
//
// A line is DEV_CONTRACT §6 — `{who, text, vo}`. This adapter was lifted from FORGE, where a line
// was the array `[who, text, aside]`, and read `line[0]` off an object until it threw inside draw()
// and runActions swallowed it. That is why talking to Vail did nothing at all.
//
// Two places a line can appear. A speaker with a body on screen gets the bubble over their head;
// a narrator, or a speaker who has walked behind the camera, gets the same bottom band the box has
// always used. Choices stay in the band either way — they are the thing a thumb has to hit.

import { open, current, advance, visibleChoices, choose, effectsOf, lineCount, speakersIn } from './dialogue.js';
import { place } from './place.js';
import { el, clear } from './ui.js';

const CAM = { close: 2.4, two: 4.0, wide: 7.0, none: null };
const LOOK_CLAMP = Math.PI * 50 / 180;
const HOLD_SKIP = 0.6;
const TAP_MS = 450, TAP_PX = 18;
const EDGE = 10;

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export class DialogueBox {
  constructor({ host, player, names = {}, ctx = () => ({}), effects = () => {}, done = () => {},
    line = () => {}, anchors = null, voice = null, stage = null } = {}) {
    this.host = host;
    this.player = player;
    this.names = names;
    this.ctx = ctx;
    this.sink = effects;
    this.onDone = done;
    this.onLine = line;
    this.anchors = anchors;
    this.voice = voice;
    this.stage = stage || (typeof document !== 'undefined' ? document.getElementById('stage') : null);
    this.pack = {};
    this.scene = null;
    this.seen = [];
    this.nodes = [];
    this.root = el('div', 'g-scene');
    this.world = el('div', 'g-world');
    this.held = 0;
    this.frameYaw = 0;
    // What the conversation borrowed from the player, captured once when it opens. Its presence is
    // what says a conversation is holding player state — not `scene`, which goes null and comes
    // back between two nodes of the same conversation.
    this.saved = null;
    this.shown = false;
    this.mode = null;
    this.spoke = null;
    this.installStageTap();
  }

  load(pack) { this.pack = pack; }

  get active() { return !!this.scene; }

  // Who this conversation is holding still — js/world/people.js stops them wandering off mid
  // sentence. Derived from the live scene every time it is asked, so a conversation that ends by
  // any path at all, including close() out of tick() or a throw out of draw(), lets them go again
  // on the very next frame. A latch here would be the frozen-NPC twin of the peek that pinned
  // `indoor` for the session.
  talkers() { return this.scene ? speakersIn(this.pack, this.nodes) : []; }

  play(nodeId) {
    const scene = open(this.pack, nodeId, { ...this.ctx(), seen: this.seen });
    if (!scene) return false;
    this.begin();
    this.scene = scene;
    this.nodes.push(nodeId);
    if (!this.seen.includes(nodeId)) this.seen.push(nodeId);
    // A throw out of draw() used to leave `scene` set behind an empty overlay, and runActions
    // swallows it, so the look stayed clamped with nothing on screen until a refresh.
    try {
      this.frame(scene.node.cam);
      this.draw();
    } catch (e) {
      this.close();
      throw e;
    }
    return true;
  }

  // Idempotent: pick() and finish() null `scene` before playing the node they jump to, so this
  // runs again mid-conversation. Re-capturing there is what ratcheted the arm down a step per
  // node and re-based the look clamp on wherever the player had turned to.
  begin() {
    if (this.saved) return;
    this.saved = { arm: this.player?.dist ?? null, yaw: this.player?.camYaw ?? 0 };
    this.nodes = [];
    this.frameYaw = this.saved.yaw;
    this.host.append(this.world, this.root);
  }

  frame(cam) {
    const arm = CAM[cam];
    if (arm !== null && arm !== undefined && this.player) this.wantArm = arm;
  }

  // A tap on the world advances too. Without it the only target is the bubble itself, which on a
  // phone is a strip of text a thumb has to find while the camera is moving.
  installStageTap() {
    if (!this.stage?.addEventListener) return;
    let p = null;
    this.stage.addEventListener('pointerdown', e => {
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    });
    this.stage.addEventListener('pointermove', e => {
      if (p?.id !== e.pointerId) return;
      p.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = e => {
      const was = p;
      if (was?.id !== e.pointerId) return;
      p = null;
      if (!this.scene || this.scene.choosing) return;
      if (performance.now() - was.t < TAP_MS && was.moved < TAP_PX) this.next();
    };
    this.stage.addEventListener('pointerup', up);
    this.stage.addEventListener('pointercancel', () => { p = null; });
  }

  tick(dt) {
    if (!this.scene) return;
    // The clamp costs the player the thing they notice first, so it is spent only on a scene that
    // is really on screen. draw() sets `shown`; a scene it drew nothing for is a state no path
    // reaches on purpose, so tear it down rather than hold the camera for it.
    if (!this.shown) return this.close();
    const p = this.player;
    if (p) {
      if (this.wantArm) p.dist += (this.wantArm - p.dist) * (1 - Math.exp(-4 * dt));
      // Look stays live but cannot turn away from the scene.
      const off = wrapPi(p.camYaw - this.frameYaw);
      if (Math.abs(off) > LOOK_CLAMP) p.camYaw = this.frameYaw + Math.sign(off) * LOOK_CLAMP;
    }
    if (this.held > 0) {
      this.held += dt;
      if (this.held > HOLD_SKIP) { this.held = 0; this.skipScene(); }
    }
    this.follow(dt);
  }

  // Re-places the floating bubble each frame, and drops it into the band the moment its speaker
  // stops being somewhere a bubble can point at.
  follow(dt) {
    const b = this.bubble;
    if (!b || !this.anchors || !this.speaker) return;
    const pt = this.anchors.screen(this.speaker);
    const r = b.getBoundingClientRect();
    const box = { x: EDGE, y: EDGE, w: innerWidth - EDGE * 2, h: innerHeight - EDGE * 2 };
    const at = pt && r.width ? place({ pt, w: r.width, h: r.height, box }) : null;
    this.setMode(at ? 'float' : 'dock');
    if (!at) return;
    b.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    b.style.setProperty('--tail', `${(at.tail * 100).toFixed(1)}%`);
    b.classList.toggle('g-below', at.below);
    b.classList.toggle('g-behind', this.anchors.sampleOcclusion(dt, pt.world));
  }

  setMode(mode) {
    if (mode === this.mode || !this.bubble) return;
    this.mode = mode;
    const b = this.bubble;
    b.classList.toggle('g-at', mode === 'float');
    if (mode === 'float') { b.style.transform = ''; this.world.append(b); }
    else { b.style.transform = ''; b.classList.remove('g-below', 'g-behind'); this.root.append(b); }
  }

  next() {
    if (!this.scene || this.scene.choosing) return;
    const line = current(this.scene);
    if (line) this.record(line);
    const s = advance(this.scene, this.ctx());
    this.scene = s;
    if (s.done) return this.finish();
    this.draw();
  }

  skipScene() {
    if (!this.scene) return;
    let s = this.scene;
    while (!s.done && !s.choosing) {
      const line = current(s);
      if (line) this.record(line);
      s = advance(s, this.ctx());
    }
    this.scene = s;
    if (s.done) return this.finish();
    this.draw();
  }

  pick(i) {
    if (!this.scene?.choosing) return;
    const r = choose(this.scene, i, this.ctx());
    this.emit(effectsOf(this.scene.node));
    this.emit(r.effects);
    const node = this.scene.node;
    this.scene = null;
    if (r.goto && this.play(r.goto)) return;
    this.end(node);
  }

  finish() {
    const node = this.scene.node;
    this.emit(effectsOf(node));
    const goto = this.scene.goto;
    this.scene = null;
    if (goto && this.play(goto)) return;
    this.end(node);
  }

  end(node) {
    const speaker = node.lines.find(l => l?.who !== 'player')?.who || null;
    const nodes = this.nodes.slice();
    this.close();
    this.onDone({ node: node.id, nodes: nodes.length ? nodes : [node.id], npc: speaker });
  }

  close() {
    this.scene = null;
    this.shown = false;
    this.held = 0;
    this.wantArm = null;
    this.mode = null;
    this.bubble = null;
    this.speaker = null;
    this.spoke = null;
    this.voice?.stop();
    if (this.saved?.arm != null && this.player) this.player.dist = this.saved.arm;
    this.saved = null;
    this.root.remove();
    this.world.remove();
    clear(this.root);
    clear(this.world);
  }

  // The whole list, not one action at a time: the sink is runActions, which iterates arrays and
  // silently returns [] for anything else. Emitting singly meant every authored effect in the
  // game — the flags gating Vail's own branches included — ran nowhere and said nothing.
  emit(list) { if (list?.length) this.sink(list); }

  record(line) { this.onLine(this.scene.id, line); }

  nameOf(id) {
    if (!id) return '';
    if (id === 'player') return this.names.player || 'You';
    return this.names[id] || id.replace(/_.*$/, '').replace(/^./, c => c.toUpperCase());
  }

  // One clip per line, not one per redraw: draw() runs again whenever the mode flips or a choice
  // list is rebuilt, and re-issuing the take would restart it from the top mid-sentence.
  speak(line) {
    const key = `${this.scene.id}:${this.scene.i}`;
    if (this.spoke === key) return;
    this.spoke = key;
    this.voice?.say(line);
  }

  draw() {
    const s = this.scene;
    clear(this.root);
    clear(this.world);
    this.bubble = null;
    this.mode = null;
    this.shown = false;
    if (!s) return;

    // Choices first, and independent of the line: DEV_CONTRACT §6 allows a node that is nothing
    // but a branch point, and returning early on its absent line drew an empty overlay.
    if (s.choosing) {
      const box = el('div', 'g-choices');
      visibleChoices(s.node, this.ctx()).forEach((c, i) => {
        const b = el('button', null, c.say);
        b.onclick = () => this.pick(i);
        box.append(b);
      });
      this.root.append(box);
      this.shown = true;
    }

    const line = current(s) || s.node.lines[s.node.lines.length - 1];
    if (line && !s.choosing) this.speak(line);
    if (!line) return;

    const bubble = el('div', 'g-bubble g-say');
    const head = el('header');
    head.append(el('span', null, this.nameOf(line.who).toUpperCase()));
    if (!s.choosing) head.append(el('i', null, `${Math.min(s.i + 1, lineCount(s))}/${lineCount(s)}`));
    bubble.append(head);
    const p = el('p', null, line.text || '');
    if (!s.choosing) p.append(el('span', 'g-next', ' ▸'));
    bubble.append(p);

    bubble.onpointerdown = () => { this.held = 1e-6; };
    bubble.onpointerup = () => { if (this.held) { this.held = 0; this.next(); } };
    bubble.onpointercancel = () => { this.held = 0; };

    // Appended after the choices, so that docking puts the line under them and nearest the thumb.
    this.bubble = bubble;
    this.shown = true;
    this.speaker = line.who && line.who !== 'player' && this.anchors?.worldOf(line.who) ? line.who : null;
    this.setMode(this.speaker ? 'float' : 'dock');
  }
}

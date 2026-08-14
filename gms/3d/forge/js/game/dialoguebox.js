// The dialogue bubble. Non-modal: movement is off, look-drag stays live, the clock keeps running.

import { open, current, advance, skip, visibleChoices, choose, effectsOf, lineCount } from './dialogue.js';
import { el, clear } from './ui.js';

const CAM = { close: 2.4, two: 4.0, wide: 7.0, none: null };
const LOOK_CLAMP = Math.PI * 50 / 180;
const HOLD_SKIP = 0.6;

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export class DialogueBox {
  constructor({ host, player, names = {}, ctx = () => ({}), effects = () => {}, done = () => {}, line = () => {} }) {
    this.host = host;
    this.player = player;
    this.names = names;
    this.ctx = ctx;
    this.sink = effects;
    this.onDone = done;
    this.onLine = line;
    this.pack = {};
    this.scene = null;
    this.seen = [];
    this.nodes = [];
    this.root = el('div', 'g-scene');
    this.held = 0;
    this.frameYaw = 0;
    this.armWas = null;
  }

  load(pack) { this.pack = pack; }

  get active() { return !!this.scene; }

  play(nodeId) {
    const scene = open(this.pack, nodeId, { ...this.ctx(), seen: this.seen });
    if (!scene) return false;
    if (!this.scene) { this.begin(scene); this.nodes = []; }
    this.scene = scene;
    this.nodes.push(nodeId);
    if (!this.seen.includes(nodeId)) this.seen.push(nodeId);
    this.frame(scene.node.cam);
    this.draw();
    return true;
  }

  begin(scene) {
    this.host.append(this.root);
    this.frameYaw = this.player?.camYaw ?? 0;
    this.armWas = this.player?.dist ?? null;
  }

  frame(cam) {
    const arm = CAM[cam];
    if (arm !== null && arm !== undefined && this.player) this.wantArm = arm;
  }

  tick(dt) {
    if (!this.scene) return;
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
    const speaker = node.lines.find(l => l[0] !== 'player')?.[0] || null;
    this.close();
    this.onDone({ node: node.id, nodes: this.nodes || [node.id], npc: speaker });
  }

  close() {
    this.scene = null;
    this.held = 0;
    this.wantArm = null;
    if (this.armWas !== null && this.player) this.player.dist = this.armWas;
    this.armWas = null;
    this.root.remove();
    clear(this.root);
  }

  emit(list) { for (const e of list || []) this.sink(e); }

  record(line) { this.onLine(this.scene.id, line); }

  nameOf(id) {
    if (id === 'player') return this.names.player || 'You';
    return this.names[id] || id.replace(/_.*$/, '').replace(/^./, c => c.toUpperCase());
  }

  draw() {
    const s = this.scene;
    clear(this.root);
    if (!s) return;

    if (s.choosing) {
      const box = el('div', 'g-choices');
      visibleChoices(s.node, this.ctx()).forEach((c, i) => {
        const b = el('button', null, c.say);
        b.onclick = () => this.pick(i);
        box.append(b);
      });
      this.root.append(box);
    }

    const line = current(s) || s.node.lines[s.node.lines.length - 1];
    if (!line) return;
    const bubble = el('div', 'g-bubble');
    const head = el('header');
    head.append(el('span', null, this.nameOf(line[0]).toUpperCase()));
    head.append(el('i', null, `${Math.min(s.i + 1, lineCount(s))}/${lineCount(s)}`));
    bubble.append(head);
    bubble.append(el('p', null, line[1]));
    const second = el('p', null, line[2] || '');
    if (!s.choosing) second.append(el('span', 'g-next', ' ▸'));
    bubble.append(second);

    bubble.onpointerdown = () => { this.held = 1e-6; };
    bubble.onpointerup = () => { if (this.held) { this.held = 0; this.next(); } };
    bubble.onpointercancel = () => { this.held = 0; };
    this.root.append(bubble);
  }
}

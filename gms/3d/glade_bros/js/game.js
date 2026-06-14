// Glade Bros 3D — a dollhouse "fart & seek" prank between two brothers.
// Phases: prank → hide (cougher frozen, prankster hides) → seek → result.
import * as THREE from 'three';
import { CFG, BROS, SHOT, AUTO, LITE, other } from './config.js';
import { SPOTS, START_ROOM, worldToTile } from './grid.js';
import { buildHouse } from './house.js';
import { Brother } from './characters.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Controls } from './input.js';
import { initFx, updateFx, fart, lookPuff, burst, pop, makeEmojiSprite } from './fx.js';
import { pick, rand, unlockAudio, razz, blip } from './utils.js';

window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    if (!LITE) { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    document.getElementById('game-container').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 400);
    initFx(this.scene);
    const house = buildHouse(this.scene);
    this.spots = SPOTS;
    this.spotWorld = new Map(house.spotsWorld.map(sw => [sw.spot, sw]));

    this.controls = new Controls(this.renderer.domElement, this.camera, this);
    this.ui = new UI();
    this.ui.onStart = (b, r) => this.startRound(b, r);
    this.ui.onFart = () => { if (this.human && this.human.role === 'p1') this.triggerFart(this.human); };
    this.ui.onAgain = () => { this.ui.hideResult(); this.ui.showMenu(); this.phase = 'menu'; };

    // tuck markers for hidden brothers
    this.tuck = { p1: makeEmojiSprite('🙈', 0.9), p2: makeEmojiSprite('🙈', 0.9) };
    for (const k in this.tuck) { this.tuck[k].visible = false; this.scene.add(this.tuck[k]); }

    this.phase = 'menu';
    this.stats = { rounds: 0, p1wins: 0, p2wins: 0 };
    this._screen = new THREE.Vector3();

    addEventListener('resize', () => this.resize());
    this.resize();

    if (SHOT) this.stageShot();
    else if (AUTO) this.startRound(pick(['older', 'younger']), pick(['p1', 'p2']), true);

    this.last = performance.now();
    this.frame = 0;
    requestAnimationFrame(t => this.loop(t));
    this.exposeHooks();
  }

  idOf(br) { return br === this.p1 ? 'p1' : 'p2'; }
  foeOf(br) { return br === this.p1 ? this.p2 : this.p1; }
  nameOf(br) { return br.bro.label; }

  startRound(broKey, roleKey, auto = false) {
    this.ui.hideMenu(); this.ui.hideResult(); this.ui.showHUD();
    this.ui.clearAllBubbles();
    for (const s of this.spots) s.checked = false;

    if (this.brothers) for (const b of this.brothers) this.scene.remove(b.group);

    const a = new Brother(BROS[broKey], roleKey, !auto);
    const b = new Brother(BROS[other(broKey)], other(roleKey), false);
    this.p1 = a.role === 'p1' ? a : b;
    this.p2 = a.role === 'p2' ? a : b;
    this.brothers = [this.p1, this.p2];
    for (const br of this.brothers) this.scene.add(br.group);

    this.human = auto ? null : a;
    this.aiList = this.brothers.filter(br => br !== this.human).map(br => new AI(br, this));

    this.p2.setTile(3, 2);
    this.p1.setTile(4, 4);
    this.p1.angle = Math.PI; this.p1.group.rotation.y = Math.PI;

    this.farted = false; this.found = null;
    this.coughT = 0; this.coughBubbleT = 0;
    this.timeLeft = CFG.seekTime; this.introT = 0.9; this.prankWatch = 0; this.resultT = 0;
    this.phase = 'prank';
    this.updateBanner();
  }

  triggerFart(by) {
    if (this.phase !== 'prank' || this.farted) return;
    this.farted = true;
    const victim = this.foeOf(by);
    by.stop();
    by.angle = Math.atan2(victim.pos.x - by.pos.x, victim.pos.z - by.pos.z);
    const mx = (by.pos.x + victim.pos.x) / 2, mz = (by.pos.z + victim.pos.z) / 2;
    unlockAudio(); razz();
    fart(mx, 0.9, mz); pop(mx, 1.3, mz, '💨');
    this.ui.say(this.idOf(by), 'Pffft! 😈', 2.2);
    this.ui.showFart(false);
    setTimeout(() => { if (this.phase !== 'menu') this.ui.say(this.idOf(by), 'Hehehe! 🤣'); }, 900);
    setTimeout(() => { if (this.phase !== 'menu') this.ui.say(this.idOf(victim), 'EWW! 🤢'); }, 600);

    this.phase = 'hide'; this.coughT = 0;
    victim.frozen = true; by.speed = CFG.runSpeed;
    this.updateBanner();
  }

  markHidden(br, spot) {
    if (br.hidden) return;
    br.hidden = true; br.spot = spot; br.stop();
    this.ui.clearBubble(this.idOf(br));
    blip(660, 0.14, 'sine', 0.08);
    if (br.isHuman) this.ui.hint(`Hidden in ${spot.name}! 🙈`);
  }

  tryHumanHide(dt) {
    const p1 = this.p1;
    if (!(p1.isHuman && !p1.hidden)) return;
    const t = p1.tile;
    const spot = this.spots.find(s => s.c === t.c && s.r === t.r);
    if (spot) { p1._dwell = (p1._dwell || 0) + dt; if (p1._dwell > 0.3) this.markHidden(p1, spot); }
    else { p1._dwell = 0; this.ui.hint('Stand on furniture to hide! 🪑'); }
  }

  think(br, text) { if (!br.hidden) this.ui.say(this.idOf(br), text, 2.0); }
  giggle(br) { this.ui.say(this.idOf(br), 'hehe… 🙈', 2.4); }

  handleTap(wx, wz) {
    const h = this.human;
    if (!h || h.frozen || h.hidden) return;
    if (['prank', 'hide', 'seek'].includes(this.phase)) {
      const t = worldToTile(wx, wz); h.goTo(t.c, t.r);
    }
  }

  // ── update ──
  update(dt) {
    if (this.phase === 'menu' || this.phase === 'shot') return;
    if (this.introT > 0) this.introT -= dt;
    if (this.introT <= 0) for (const ai of this.aiList) ai.update(dt);

    if (this.human && !this.human.frozen && !this.human.hidden) this.human.nudgeDir = this.controls.keyDir();
    else if (this.human) this.human.nudgeDir = null;
    for (const br of this.brothers) br.update(dt);

    if (this.phase === 'prank') this.updatePrank(dt);
    else if (this.phase === 'hide') this.updateHide(dt);
    else if (this.phase === 'seek') this.updateSeek(dt);
    else if (this.phase === 'result') this.updateResult(dt);

    updateFx(dt);
    this.ui.tickBubbles(dt);
  }

  updatePrank(dt) {
    if (this.introT > 0) return;
    this.prankWatch += dt;
    const h = this.human;
    if (h && h.role === 'p1') {
      const foe = this.foeOf(h);
      const near = Math.hypot(foe.pos.x - h.pos.x, foe.pos.z - h.pos.z) <= CFG.fartReach;
      this.ui.showFart(near);
    }
    if (this.prankWatch > 18 && !this.farted) this.triggerFart(this.p1);
  }

  updateHide(dt) {
    this.coughT += dt;
    this.ui.setTimer(Math.max(0, CFG.coughTime - this.coughT));
    this.coughBubbleT -= dt;
    if (this.coughBubbleT <= 0) {
      this.coughBubbleT = 0.95;
      this.ui.say('p2', pick(['*cough!* 🤢', '*hack!* 😵', '*gasp!* 😮‍💨']), 0.9);
      const hp = this.p2.headWorld();
      lookPuff(hp.x + rand(-0.2, 0.2), hp.y - 0.6, hp.z);
      blip(180 + rand(-20, 20), 0.18, 'sawtooth', 0.05);
    }
    this.tryHumanHide(dt);
    if (this.coughT >= CFG.coughTime) {
      this.p2.frozen = false; this.p2.speed = CFG.runSpeed * 0.95;
      this.ui.hideHint();
      this.phase = 'seek'; this.timeLeft = CFG.seekTime;
      this.ui.say('p2', pick(['Right! 😤', 'Found yet… 👀', "You're dead! 😤"]), 1.6);
    }
    this.updateBanner();
  }

  updateSeek(dt) {
    this.timeLeft -= dt;
    this.ui.setTimer(Math.max(0, this.timeLeft));
    this.tryHumanHide(dt);
    const seeker = this.p2, prankster = this.p1;
    for (const s of this.spots) {
      if (s.checked) continue;
      const sw = this.spotWorld.get(s);
      if (Math.hypot(seeker.pos.x - sw.x, seeker.pos.z - sw.z) <= CFG.searchDist) {
        s.checked = true;
        lookPuff(sw.x, 0.6, sw.z); blip(520, 0.1, 'triangle', 0.05);
        if (prankster.hidden && prankster.spot === s) return this.endRound('p2');
      }
    }
    if (!prankster.hidden && Math.hypot(seeker.pos.x - prankster.pos.x, seeker.pos.z - prankster.pos.z) <= CFG.exposeDist)
      return this.endRound('p2');
    if (this.timeLeft <= 0) return this.endRound('p1');
    this.updateBanner();
  }

  endRound(winner) {
    if (this.phase === 'result') return;
    this.phase = 'result'; this.found = winner; this.resultT = 0;
    this.ui.showFart(false); this.ui.setTimer(null);
    this.stats.rounds++; this.stats[winner + 'wins']++;
    const p1 = this.p1, p2 = this.p2;
    p1.hidden = false; p1.frozen = false; p1.stop(); p2.stop();
    this.ui.clearAllBubbles();

    if (winner === 'p2') {
      const mx = (p1.pos.x + p2.pos.x) / 2, mz = (p1.pos.z + p2.pos.z) / 2;
      p2.angle = Math.atan2(p1.pos.x - p2.pos.x, p1.pos.z - p2.pos.z);
      unlockAudio(); razz(); fart(mx, 0.9, mz); burst(mx, 1.2, mz, 0x9bd06a);
      this.ui.say('p2', 'REVENGE! 💨', 2.6);
      setTimeout(() => { if (this.phase === 'result') this.ui.say('p1', 'NOOO! 🤢'); }, 700);
    } else {
      burst(p1.pos.x, 1.3, p1.pos.z, 0xffd95e);
      this.ui.say('p1', pick(["Can't catch me! 😎", 'Too slow! 😏', 'Perfect crime! 🤭']), 2.6);
      setTimeout(() => { if (this.phase === 'result') this.ui.say('p2', 'ARGH! 😤'); }, 700);
    }
    this.ui.setBanner(winner === 'p2'
      ? `${this.nameOf(p2)} sniffed out ${this.nameOf(p1)}!`
      : `${this.nameOf(p1)} got away clean!`);
  }

  updateResult(dt) {
    this.resultT += dt;
    if (AUTO && this.resultT > 1.0) return this.startRound(pick(['older', 'younger']), pick(['p1', 'p2']), true);
    if (this.resultT > 1.6 && this.ui.result.classList.contains('hide')) {
      const win = this.found, p1 = this.p1, p2 = this.p2;
      const humanWon = this.human && this.human.role === win;
      const out = win === 'p2'
        ? { emoji: '💨', title: `${this.nameOf(p2)} got revenge!`, sub: `${this.nameOf(p2)} found ${this.nameOf(p1)} and farted right back. Fair's fair!` }
        : { emoji: '😎', title: `${this.nameOf(p1)} pulled it off!`, sub: `${this.nameOf(p1)} hid too well — ${this.nameOf(p2)} ran out of time. The perfect crime.` };
      this.ui.showResult({ ...out, verdict: this.human ? (humanWon ? 'You win! 🎉' : 'You lose 😅') : 'Computer vs computer', win: !!humanWon });
    }
  }

  updateBanner() {
    const ui = this.ui, h = this.human;
    if (this.phase === 'prank') {
      if (this.introT > 0) { ui.setBanner('Ready…'); ui.setTimer(null); return; }
      ui.setTimer(null);
      if (!h) ui.setBanner(`${this.nameOf(this.p1)} is sneaking up… 😏`);
      else if (h.role === 'p1') ui.setBanner(`Creep up on ${this.nameOf(this.p2)} and let one rip! 💨`);
      else ui.setBanner('Something smells fishy… 😬');
    } else if (this.phase === 'hide') {
      if (!h) ui.setBanner(`${this.nameOf(this.p1)} is hiding! 🏃`);
      else if (h.role === 'p1') ui.setBanner('RUN &amp; HIDE before he recovers! 🙈');
      else ui.setBanner("*cough!* You can't move yet… 😵");
    } else if (this.phase === 'seek') {
      if (!h) ui.setBanner(`${this.nameOf(this.p2)} is hunting for revenge! 🔎`);
      else if (h.role === 'p2') ui.setBanner('FIND your brother — get him! 🔎');
      else ui.setBanner("Stay hidden… he's looking! 🤫");
    }
  }

  // ── render ──
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.controls.updateCamera();
    if (this.brothers) {
      for (const br of this.brothers) {
        const id = this.idOf(br), tk = this.tuck[id];
        if (br.hidden) {
          br.group.visible = false;
          const show = br.isHuman || !this.human;
          if (show) { const sw = this.spotWorld.get(br.spot); tk.position.set(sw.x, 0.95, sw.z); tk.visible = true; }
          else tk.visible = false;
        } else { br.group.visible = true; tk.visible = false; }
      }
      // project speech bubbles to screen
      for (const br of this.brothers) {
        const id = this.idOf(br);
        if (!this.ui.hasBubble(id)) continue;
        this._screen.copy(br.headWorld()).project(this.camera);
        const onScreen = this._screen.z < 1;
        const x = (this._screen.x * 0.5 + 0.5) * innerWidth;
        const y = (-this._screen.y * 0.5 + 0.5) * innerHeight;
        this.ui.placeBubble(id, x, y, onScreen);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  loop(t) {
    let dt = (t - this.last) / 1000; this.last = t;
    if (dt > 0.05) dt = 0.05;
    try { this.update(dt); this.render(); } catch (e) { window.__errors.push(String(e && e.stack || e)); }
    this.frame++;
    if (SHOT && this.frame === 10) window.__shotReady = true;
    requestAnimationFrame(tt => this.loop(tt));
  }

  stageShot() {
    this.ui.hideMenu(); this.ui.showHUD(); this.ui.setTimer(null);
    this.startRound('older', 'p1', true);
    this.phase = 'shot'; this.introT = 0;
    this.p2.setTile(3, 3); this.p2.angle = 0.6; this.p2.group.rotation.y = 0.6;
    this.p1.setTile(4, 4); this.p1.angle = Math.PI * 0.85; this.p1.group.rotation.y = Math.PI * 0.85;
    const mx = (this.p1.pos.x + this.p2.pos.x) / 2, mz = (this.p1.pos.z + this.p2.pos.z) / 2;
    fart(mx, 0.9, mz); pop(mx, 1.3, mz, '💨');
    this.ui.say('p1', 'Pffft! 😈', 60); this.ui.say('p2', 'EWW! 🤢', 60);
    this.ui.tickBubbles(0.2);   // fade the bubbles in (update() is skipped in 'shot')
    for (let i = 0; i < 6; i++) { updateFx(0.03); for (const b of this.brothers) b.update(0.001); }
    this.controls.yaw = 0.5; this.controls.pitch = 0.95; this.controls.dist = 25;
    this.controls.target.set(0, 0.5, 0);
    this.ui.setBanner('💨 Fart &amp; Seek — sneak, hide, get revenge!');
  }

  exposeHooks() {
    window.__game = this;
    window.__state = {
      get phase() { return game.phase; },
      get timeLeft() { return +(game.timeLeft || 0).toFixed(1); },
      get p1hidden() { return !!(game.p1 && game.p1.hidden); },
      get p1spot() { return game.p1 && game.p1.spot ? game.p1.spot.name : null; },
      get checked() { return game.spots.filter(s => s.checked).length; },
      get stats() { return { ...game.stats }; },
      get errors() { return window.__errors; },
    };
  }
}

const game = new Game();

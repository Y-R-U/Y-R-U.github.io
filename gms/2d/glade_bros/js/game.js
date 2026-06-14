// Glade Bros — top-down "fart & seek" between two brothers.
// Phases: prank → hide (cougher frozen, prankster hides) → seek → result.
import { CFG, BROS, ROLES, SHOT, AUTO, other } from './config.js';
import { MAP_W, MAP_H, TILE } from './config.js';
import { drawHouse, SPOTS, ROOMS, START_ROOM, tileCenter, worldToTile } from './map.js';
import { Brother, drawTucked } from './characters.js';
import { AI } from './ai.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { say, fart, lookPuff, pop, updateFx, drawFx, clearBubble, clearAllBubbles } from './fx.js';
import { pick, rand } from './utils.js';

window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

class Game {
  constructor() {
    this.ui = new UI();
    this.input = new Input(canvas, this);
    this.spots = SPOTS;
    this.phase = 'menu';
    this.view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
    this.stats = { rounds: 0, p1wins: 0, p2wins: 0 };

    this.ui.onStart = (bro, role) => this.startRound(bro, role);
    this.ui.onFart = () => { if (this.human && this.human.role === 'p1') this.triggerFart(this.human); };
    this.ui.onAgain = () => { this.ui.hideResult(); this.ui.showMenu(); this.phase = 'menu'; };

    addEventListener('resize', () => this.resize());
    this.resize();

    if (SHOT) this.stageShot();
    else if (AUTO) this.startRound(pick(['older', 'younger']), pick(['p1', 'p2']), true);

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.exposeHooks();
  }

  // ── round setup ──
  startRound(broKey, roleKey, auto = false) {
    this.ui.hideMenu(); this.ui.hideResult(); this.ui.showHUD();
    clearAllBubbles();
    for (const s of this.spots) s.checked = false;

    const humanBro = broKey, humanRole = roleKey;
    const aiBro = other(broKey), aiRole = other(roleKey);

    const mk = (broK, role, isHuman) => new Brother(BROS[broK], role, isHuman);
    const a = mk(humanBro, humanRole, !auto);
    const b = mk(aiBro, aiRole, false);
    this.p1 = a.role === 'p1' ? a : b;
    this.p2 = a.role === 'p2' ? a : b;
    this.brothers = [this.p1, this.p2];

    this.human = auto ? null : a;
    this.aiList = this.brothers.filter(br => br !== this.human).map(br => new AI(br, this));

    // both spawn in the living room (the prankster a step behind the victim)
    this.p2.setTile(3, 2); this.p2.facing = { x: 0, y: 1 };
    this.p1.setTile(4, 4); this.p1.facing = { x: 0, y: -1 };

    this.farted = false;
    this.found = null;
    this.coughT = 0;
    this.coughBubbleT = 0;
    this.timeLeft = CFG.seekTime;
    this.introT = 0.9;
    this.prankWatch = 0;
    this.resultT = 0;
    this.phase = 'prank';
    this.updateBanner();
  }

  foeOf(br) { return br === this.p1 ? this.p2 : this.p1; }
  nameOf(br) { return br.bro.label; }

  // ── the fart ──
  triggerFart(by) {
    if (this.phase !== 'prank' || this.farted) return;
    this.farted = true;
    const victim = this.foeOf(by);
    by.stop(); by.facing = { x: Math.sign(victim.pos.x - by.pos.x) || 0, y: Math.sign(victim.pos.y - by.pos.y) || 0 };
    fart((by.pos.x + victim.pos.x) / 2, (by.pos.y + victim.pos.y) / 2);
    say(by, 'Pffft! 😈', 2.2);
    this.ui.showFart(false);
    setTimeout(() => { if (this.phase !== 'menu') say(by, 'Hehehe! 🤣'); }, 900);
    setTimeout(() => { if (this.phase !== 'menu') say(victim, 'EWW! 🤢'); }, 600);

    // → hide phase: victim is frozen coughing, prankster bolts
    this.phase = 'hide';
    this.coughT = 0;
    victim.frozen = true;
    by.speed = CFG.runSpeed;
    this.updateBanner();
  }

  markHidden(br, spot) {
    if (br.hidden) return;
    br.hidden = true; br.spot = spot; br.stop();
    clearBubble(br);
    if (br.isHuman) this.ui.hint(`Hidden in ${spot.name}! 🙈`);
  }

  // human prankster tucks in after dwelling briefly on a furniture tile
  tryHumanHide(dt) {
    const p1 = this.p1;
    if (!(p1.isHuman && !p1.hidden)) return;
    const t = p1.tile;
    const spot = this.spots.find(s => s.c === t.c && s.r === t.r);
    if (spot) { p1._dwell = (p1._dwell || 0) + dt; if (p1._dwell > 0.3) this.markHidden(p1, spot); }
    else { p1._dwell = 0; this.ui.hint('Stand on furniture to hide! 🪑'); }
  }

  // helpers the AI calls
  think(br, text) { if (!br.hidden) say(br, text, 2.0); }
  giggle(br) { say(br, 'hehe… 🙈', 2.4); pop(br.pos.x, br.pos.y - TILE * 0.7, '😶‍🌫️', 1.4); }

  // ── input ──
  handleTap(wx, wy) {
    const h = this.human;
    if (!h || h.frozen || h.hidden) return;
    if (this.phase === 'prank' || this.phase === 'hide' || this.phase === 'seek') {
      const t = worldToTile(wx, wy);
      h.goTo(t.c, t.r);
    }
  }

  // ── per-phase update ──
  update(dt) {
    if (this.phase === 'menu' || this.phase === 'shot') return;

    if (this.introT > 0) { this.introT -= dt; }

    // drive AI then integrate movement
    if (this.introT <= 0) for (const ai of this.aiList) ai.update(dt);
    this.moveBrothers(dt);

    if (this.phase === 'prank') this.updatePrank(dt);
    else if (this.phase === 'hide') this.updateHide(dt);
    else if (this.phase === 'seek') this.updateSeek(dt);
    else if (this.phase === 'result') this.updateResult(dt);

    updateFx(dt);
  }

  moveBrothers(dt) {
    for (const br of this.brothers) {
      if (br === this.human && !br.frozen && !br.hidden) {
        const kd = this.input.keyDir();
        if (kd.x || kd.y) br.nudge(kd.x, kd.y, dt);
        else br.update(dt);
      } else br.update(dt);
    }
  }

  updatePrank(dt) {
    if (this.introT > 0) return;
    this.prankWatch += dt;
    const h = this.human;
    if (h && h.role === 'p1') {
      const foe = this.foeOf(h);
      const near = Math.hypot(foe.pos.x - h.pos.x, foe.pos.y - h.pos.y) <= CFG.fartReach;
      this.ui.showFart(near);
    }
    // safety: never let the prank stall forever
    if (this.prankWatch > 18 && !this.farted) this.triggerFart(this.p1);
  }

  updateHide(dt) {
    this.coughT += dt;
    const left = Math.max(0, CFG.coughTime - this.coughT);
    this.ui.setTimer(left);

    // victim cough loop
    this.coughBubbleT -= dt;
    if (this.coughBubbleT <= 0) {
      this.coughBubbleT = 0.95;
      say(this.p2, pick(['*cough!* 🤢', '*hack!* 😵', '*gasp!* 😮‍💨']), 0.9);
      lookPuff(this.p2.pos.x + rand(-6, 6), this.p2.pos.y - TILE * 0.2);
    }

    this.tryHumanHide(dt);

    if (this.coughT >= CFG.coughTime) {
      this.p2.frozen = false;
      this.p2.speed = CFG.runSpeed * 0.95;
      this.ui.hideHint();
      this.phase = 'seek';
      this.timeLeft = CFG.seekTime;
      say(this.p2, pick(['Right! 😤', 'Found yet… 👀', "You're dead! 😤"]), 1.6);
      this.updateBanner();
    }
    this.updateBanner();
  }

  updateSeek(dt) {
    this.timeLeft -= dt;
    this.ui.setTimer(Math.max(0, this.timeLeft));
    this.tryHumanHide(dt);     // still allow a late tuck-in if they didn't make it

    const seeker = this.p2, prankster = this.p1;
    // check hiding spots the seeker is near
    for (const s of this.spots) {
      if (s.checked) continue;
      const sc = tileCenter(s.c, s.r);
      if (Math.hypot(seeker.pos.x - sc.x, seeker.pos.y - sc.y) <= CFG.searchDist) {
        s.checked = true;
        lookPuff(sc.x, sc.y - TILE * 0.1);
        if (prankster.hidden && prankster.spot === s) return this.endRound('p2');
      }
    }
    // caught out in the open (not on a spot)
    if (!prankster.hidden) {
      if (Math.hypot(seeker.pos.x - prankster.pos.x, seeker.pos.y - prankster.pos.y) <= CFG.exposeDist)
        return this.endRound('p2');
    }
    if (this.timeLeft <= 0) return this.endRound('p1');
    this.updateBanner();
  }

  endRound(winner) {
    if (this.phase === 'result') return;
    this.phase = 'result';
    this.found = winner;
    this.resultT = 0;
    this.ui.showFart(false);
    this.ui.setTimer(null);
    this.stats.rounds++;
    this.stats[winner + 'wins']++;

    const p1 = this.p1, p2 = this.p2;
    p1.hidden = false; p1.frozen = false; p1.stop(); p2.stop();
    clearAllBubbles();

    if (winner === 'p2') {
      // revenge: avenger farts back
      p2.facing = { x: Math.sign(p1.pos.x - p2.pos.x) || 0, y: Math.sign(p1.pos.y - p2.pos.y) || 1 };
      fart((p1.pos.x + p2.pos.x) / 2, (p1.pos.y + p2.pos.y) / 2);
      say(p2, 'REVENGE! 💨', 2.6);
      setTimeout(() => { if (this.phase === 'result') say(p1, 'NOOO! 🤢'); }, 700);
    } else {
      say(p1, pick(["Can't catch me! 😎", 'Too slow! 😏', 'Perfect crime! 🤭']), 2.6);
      setTimeout(() => { if (this.phase === 'result') say(p2, 'ARGH! 😤'); }, 700);
    }
    this.ui.setBanner(winner === 'p2'
      ? `${this.nameOf(p2)} sniffed out ${this.nameOf(p1)}!`
      : `${this.nameOf(p1)} got away clean!`);
  }

  updateResult(dt) {
    this.resultT += dt;
    if (AUTO && this.resultT > 1.0) {              // soak mode → loop forever
      return this.startRound(pick(['older', 'younger']), pick(['p1', 'p2']), true);
    }
    if (this.resultT > 1.5 && this.ui.result.classList.contains('hide')) {
      const win = this.found;
      const p1 = this.p1, p2 = this.p2;
      const humanWon = this.human && this.human.role === win;
      const out = win === 'p2'
        ? { emoji: '💨', title: `${this.nameOf(p2)} got revenge!`,
            sub: `${this.nameOf(p2)} found ${this.nameOf(p1)} and farted right back. Fair's fair!` }
        : { emoji: '😎', title: `${this.nameOf(p1)} pulled it off!`,
            sub: `${this.nameOf(p1)} hid too well — ${this.nameOf(p2)} ran out of time. The perfect crime.` };
      this.ui.showResult({
        ...out,
        verdict: this.human ? (humanWon ? 'You win! 🎉' : 'You lose 😅') : 'Computer vs computer',
        win: !!humanWon,
      });
    }
  }

  updateBanner() {
    const ui = this.ui, h = this.human;
    if (this.phase === 'prank') {
      if (this.introT > 0) { ui.setBanner('Ready…'); ui.setTimer(null); return; }
      ui.setTimer(null);
      if (!h) ui.setBanner(`${this.nameOf(this.p1)} is sneaking up… 😏`);
      else if (h.role === 'p1') ui.setBanner(`Creep up on ${this.nameOf(this.p2)} and let one rip! 💨`);
      else ui.setBanner(`Something smells fishy… 😬`);
    } else if (this.phase === 'hide') {
      if (!h) ui.setBanner(`${this.nameOf(this.p1)} is hiding! 🏃`);
      else if (h.role === 'p1') ui.setBanner('RUN &amp; HIDE before he recovers! 🙈');
      else ui.setBanner("*cough!* You can't move yet… 😵");
    } else if (this.phase === 'seek') {
      if (!h) ui.setBanner(`${this.nameOf(this.p2)} is hunting for revenge! 🔎`);
      else if (h.role === 'p2') ui.setBanner('FIND your brother — get him! 🔎');
      else ui.setBanner('Stay hidden… he\'s looking! 🤫');
    }
  }

  // ── rendering ──
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cssW = innerWidth, cssH = innerHeight;
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    const pad = 14;
    const scale = Math.min((cssW - pad) / MAP_W, (cssH - pad) / MAP_H);
    this.view = { dpr, scale, ox: (cssW - MAP_W * scale) / 2, oy: (cssH - MAP_H * scale) / 2, cssW, cssH };
  }

  screenToWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const v = this.view;
    return { x: (clientX - r.left - v.ox) / v.scale, y: (clientY - r.top - v.oy) / v.scale };
  }

  render() {
    const v = this.view;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.cssW, v.cssH);
    ctx.save();
    ctx.translate(v.ox, v.oy);
    ctx.scale(v.scale, v.scale);

    // soft drop shadow behind the whole house
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(8, 12, MAP_W, MAP_H);

    drawHouse(ctx);

    if (this.brothers) {
      const order = [...this.brothers].sort((a, b) => a.pos.y - b.pos.y);
      for (const br of order) {
        if (br.hidden) {
          if (br.isHuman || !this.human) drawTucked(ctx, br); // hide the AI from a human seeker
        } else {
          // tint the cougher green while frozen
          if (br.frozen) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#8ad06a';
            ctx.beginPath(); ctx.ellipse(br.pos.x, br.pos.y, TILE * 0.5, TILE * 0.5, 0, 0, 7); ctx.fill();
            ctx.restore();
          }
          br.draw(ctx);
        }
      }
    }

    drawFx(ctx);
    ctx.restore();
  }

  loop(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.05) dt = 0.05;
    try { this.update(dt); this.render(); } catch (e) { window.__errors.push(String(e && e.stack || e)); }
    this.frame = (this.frame || 0) + 1;
    if (SHOT && this.frame === 8) window.__shotReady = true;
    requestAnimationFrame((tt) => this.loop(tt));
  }

  // ── thumbnail staging ──
  stageShot() {
    this.ui.hideMenu(); this.ui.showHUD(); this.ui.setTimer(null);
    this.startRound('older', 'p1', true);
    this.phase = 'shot';
    this.introT = 0;
    this.p2.setTile(3, 3); this.p2.facing = { x: 0.5, y: 0.85 };   // victim, reacting
    this.p1.setTile(4, 4); this.p1.facing = { x: -0.6, y: -0.8 };  // prankster, smug
    fart((this.p1.pos.x + this.p2.pos.x) / 2, (this.p1.pos.y + this.p2.pos.y) / 2);
    say(this.p1, 'Pffft! 😈', 30);
    say(this.p2, 'EWW! 🤢', 30);
    for (let i = 0; i < 6; i++) updateFx(0.03);   // fade the bubbles in + a light spread
    this.ui.setBanner('💨 Fart &amp; Seek — sneak, hide, get revenge!');
  }

  exposeHooks() {
    window.__game = this;
    window.__state = {
      get phase() { return game.phase; },
      get timeLeft() { return +(game.timeLeft || 0).toFixed(1); },
      get coughLeft() { return +Math.max(0, CFG.coughTime - (game.coughT || 0)).toFixed(1); },
      get p1hidden() { return !!(game.p1 && game.p1.hidden); },
      get p1spot() { return game.p1 && game.p1.spot ? game.p1.spot.name : null; },
      get checked() { return game.spots.filter(s => s.checked).length; },
      get stats() { return { ...game.stats }; },
      get errors() { return window.__errors; },
    };
  }
}

const game = new Game();

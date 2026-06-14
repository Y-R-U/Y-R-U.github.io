// Drives whichever brother the human didn't pick.
// Prankster (p1): sneak up → fart → run to a far hiding spot.
// Seeker   (p2): after the cough, sweep hiding spots hunting the prankster.
import { CFG } from './config.js';
import { tileDist } from './pathfind.js';
import { pick } from './utils.js';

const SEEK_THOUGHTS = ['Where are you?!', 'Hmm…', 'You smell guilty!', 'Come out!', 'I can smell ya!', 'Gotcha?… nope.'];

export class AI {
  constructor(brother, game) {
    this.b = brother; this.g = game;
    this.chosenSpot = null; this.cur = null;
    this.repathT = 0; this.thinkT = 1.5; this.pauseT = 0; this.giggled = false;
  }

  update(dt) {
    if (this.b.role === 'p1') this.prankster(dt);
    else this.seeker(dt);
  }

  dist(a, b) { return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); }

  prankster(dt) {
    const g = this.g, b = this.b;
    if (g.phase === 'prank') {
      const foe = g.foeOf(b);
      if (this.dist(b, foe) <= CFG.fartReach) { b.stop(); g.triggerFart(b); return; }
      this.repathT -= dt;
      if (this.repathT <= 0 || b.arrived) {
        this.repathT = 0.4; b.speed = CFG.walkSpeed * 1.2;
        const ft = foe.tile; b.goTo(ft.c, ft.r);
      }
    } else if (g.phase === 'hide' || g.phase === 'seek') {
      if (!b.hidden) {
        if (!this.chosenSpot) { this.chosenSpot = this.pickHideSpot(); b.speed = CFG.runSpeed; b.goToSpot(this.chosenSpot); }
        if (b.arrived) {
          if (b.atTile(this.chosenSpot.c, this.chosenSpot.r)) g.markHidden(b, this.chosenSpot);
          else b.goToSpot(this.chosenSpot);
        }
      } else if (g.phase === 'seek') {
        if (!this.giggled && g.human && g.human.role === 'p2' && g.timeLeft < 7) { this.giggled = true; g.giggle(b); }
      }
    }
  }

  pickHideSpot() {
    const ft = this.g.foeOf(this.b).tile;
    const ranked = this.g.spots
      .map(s => ({ s, d: tileDist(ft.c, ft.r, s.c, s.r) }))
      .sort((a, b) => b.d - a.d);
    const pool = Math.max(3, Math.ceil(ranked.length * 0.6));
    return pick(ranked.slice(0, pool)).s;
  }

  seeker(dt) {
    const g = this.g, b = this.b;
    if (g.phase !== 'seek') return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 2.8 + Math.random() * 2.4; g.think(b, pick(SEEK_THOUGHTS)); }
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (b.arrived) {
      if (this.cur) { this.pauseT = 0.35; this.cur = null; return; }
      const next = this.nextSpot();
      if (next) { this.cur = next; b.speed = CFG.runSpeed * 0.95; b.goToSpot(next); }
      else { const any = pick(g.spots); this.cur = any; b.goToSpot(any); }
    }
  }

  nextSpot() {
    const t = this.b.tile;
    const open = this.g.spots.filter(s => !s.checked);
    if (!open.length) return null;
    open.sort((a, b2) => tileDist(t.c, t.r, a.c, a.r) - tileDist(t.c, t.r, b2.c, b2.r));
    if (open.length > 2 && Math.random() < 0.2) return pick(open.slice(1, Math.min(4, open.length)));
    return open[0];
  }
}

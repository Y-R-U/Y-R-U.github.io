// events4: EventRound — the Round an event plays (js/app/main.js playEvent). A plain Round plus:
//  * the taster rule (./access.js): a hole the player hasn't unlocked is played and scored, but keeps no
//    record and unlocks nothing (keepsProgress → false), with a note on the hole card;
//  * the event's `twist` (data/*.js, data/weekends.js):
//      helpers: 'off'        no helpers, tray hidden (Pure Putt)
//      collide: true         ball hits on whatever the setting says (Battle Royale Cup)
//      rivals: n             every ghost with shots shares the hole (allGhosts)
//      bonus.bumper + bumperCap   a bumper bounce off your own shot pays event currency, at most cap a hole (Bumper Bash)
//  * battle stats for the screen: `bumpers` (paid bounces), `hits` (rivals your shots struck) and
//    `knockouts` (rivals knocked out of bounds by your shot, directly or by the rival you hit).
import { Round } from '../game/play.js';
import { makeInventory } from '../net/rooms.js';
import { MAT, BALL_R } from '../engine/constants.js';
import { tasterCourse } from './access.js';

export class EventRound extends Round {
  constructor(app, course, startIndex = 0, opts = {}) {
    const tw = opts.twist || {};
    super(app, course, startIndex, {
      ...opts,
      inventory: opts.inventory || (tw.helpers === 'off' ? makeInventory({ mode: 'off' }) : null),
      collide: tw.collide ? true : (opts.collide ?? null),
      allGhosts: !!tw.rivals,
    });
    this.twist = tw;
    this.helpersOff = tw.helpers === 'off';
    if (this.helpersOff) { app.hud.el.tray.hidden = true; this.refreshHelpers(); }
  }

  loadHole(i) {
    this.holeBumps = 0;
    this.marked = new Set();   // ghosts my current shot has struck (a knock-out while marked is mine)
    super.loadHole(i);
  }
  get bumpers() { return this._bumpers | 0; }
  get hits() { return this._hits | 0; }
  get knockouts() { return this._kos | 0; }

  tapHelper(id) { if (!this.helpersOff) super.tapHelper(id); }

  keepsProgress(def) {
    const c = tasterCourse(this.app.store, def.id);
    if (!c) return true;
    this.tasters = (this.tasters | 0) + 1;
    this.holeNotes.push(c.holes.some(h => h.id === def.id)
      ? `Taster: ${c.name} is still locked, so this hole keeps no record`
      : `Taster: this hole opens ${c.name}, so it only counts once you reach it on the map`);
    return false;
  }

  // a shot of mine is in play: my ball rolling, or the knock it started still settling
  myShot() { return this.state === 'rolling' || this.ball.state === 'moving' || this._settle.length > 0; }

  onEvents(evs) {
    const pay = this.twist.bonus?.bumper, cap = this.twist.bumperCap ?? 3;
    if (pay && this.state === 'rolling') {
      for (const e of evs) {
        if (e.type !== 'obstacle' || e.mat !== MAT.BUMPER || this.holeBumps >= cap) continue;
        this.holeBumps++; this._bumpers = this.bumpers + 1;
        this.app.hud.banner(`Bonk! <small>+${pay} ${this.currency?.icon || ''} · ${this.holeBumps}/${cap} this hole</small>`, 'good', 800);
      }
    }
    super.onEvents(evs);
  }

  onGhostEvents(G) {
    const b = this.ball, gb = G.sim.ball;
    for (const e of G.sim.events) {
      if (e.type === 'diverge' || e.type === 'knocked') {
        // struck by me: my ball is in play and touching it (collideBalls separates to exactly 2R)
        if (this.myShot() && Math.hypot(b.px - gb.px, b.py - gb.py, b.pz - gb.pz) < 2 * BALL_R + 0.02) {
          this._hits = this.hits + 1; this.marked.add(G);
        } else if (e.type === 'knocked' && [...this.marked].some(M => M !== G && M.sim.ball.state === 'moving'
          && Math.hypot(M.sim.ball.px - gb.px, M.sim.ball.py - gb.py, M.sim.ball.pz - gb.pz) < 2 * BALL_R + 0.02)) {
          this.marked.add(G);   // a rival I hit ran into this one (chain)
        }
      } else if (e.type === 'oob' && this.marked.has(G)) {   // (mid-roll when hit counts too: it's still +1 to them)
        this._kos = this.knockouts + 1;
        const pay = this.twist.bonus?.knockout;
        this.holeNotes.push(`You knocked ${G.name} out`);
        this.app.hud.banner(`Knock-out! <small>${G.name} +1${pay ? ` · +${pay} ${this.currency?.icon || ''}` : ''}</small>`, 'ace', 1600);
        this.marked.delete(G);
        G.sim.events = G.sim.events.filter(x => x !== e);   // (our banner replaces the generic one)
        super.onGhostEvents(G);
        return;
      } else if (e.type === 'rest' || e.type === 'shot' || e.type === 'cup') this.marked.delete(G);
    }
    super.onGhostEvents(G);
  }

  result() { return { ...super.result(), bumpers: this.bumpers, hits: this.hits, knockouts: this.knockouts, tasters: this.tasters | 0 }; }

  dispose() {
    super.dispose();
    if (this.helpersOff) this.app.hud.el.tray.hidden = false;
  }
}

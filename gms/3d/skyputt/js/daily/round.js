// DailyRound: one try at the Daily Challenge hole. A normal Round (so stars, coins, ladder points
// and chests flow through the usual meta hooks) plus the day's twist:
//   helpers 'off'  → no helpers (tray hidden) · 'kit' → one of each, your own saved ones untouched
//   clock          → a shot clock (auto putt of zero power = +1 stroke when it runs out, like online)
//   goal crystals  → a fresh pickup ledger, so every crystal is on the hole and none pay coins twice
// No Restart in the menu: a try is a try (quit = the try is spent).
import { Round } from '../game/play.js';
import { makeInventory } from '../net/rooms.js';
import { sfx } from '../game/sfxbus.js';
import { keepsProgress } from '../events/access.js';

const memLedger = () => {
  const o = {};
  return {
    has: (hole, i) => (o[hole] || []).includes(i),
    add: (hole, i) => { (o[hole] || (o[hole] = [])).includes(i) || o[hole].push(i); },
    count: () => Object.values(o).reduce((a, l) => a + l.length, 0),
  };
};

export class DailyRound extends Round {
  // ch: dailyFor(...) challenge · tryNo: 1-based, for the banner
  constructor(app, ch, { tryNo = 1, tries = 3, onComplete, onExit }) {
    const tw = ch.twist, sweep = tw.goal === 'crystals';
    const inventory = tw.helpers === 'off' ? makeInventory({ mode: 'off' }) : tw.helpers === 'kit' ? makeInventory({ mode: 'fixed', n: 1 }) : null;
    const course = { id: 'daily', name: `Daily #${ch.n}`, holes: [ch.hole] };
    super(app, course, 0, {
      mode: 'round', onComplete, onExit, inventory, doneLabel: 'Back to the daily', label: `Daily #${ch.n} · try ${tryNo}/${tries}`,
      tips: [`${tw.icon} ${tw.text(ch.hole)}`],
      ledger: sweep ? memLedger() : null, currency: sweep ? { icon: '💎', name: 'Crystals' } : null,
    });
    this.helpersOff = tw.helpers === 'off';
    if (this.helpersOff) app.hud.el.tray.hidden = true;
    this.clockLim = tw.clock || 0;
    this.clockLeft = null;
    if (this.clockLim) {
      const el = this.clockEl = document.createElement('div');
      el.id = 'daily-ov';
      el.innerHTML = '<div class="net-clock" hidden></div>';
      document.body.appendChild(el);
    }
  }

  tapHelper(id) { if (!this.helpersOff) super.tapHelper(id); }
  // events4 taster rule (js/events/access.js): a daily on a gate hole you haven't reached (e.g. sky9)
  // must not open the course behind it; it is scored for the daily but keeps no record.
  keepsProgress(def) { return keepsProgress(this.app.store, def.id); }

  pause() {
    if (this.paused || this.state === 'done') return;
    this.paused = true;
    this.app.hud.pause({
      note: 'Quitting uses up this try.', onRestart: null, quitLabel: 'Quit try',
      onResume: () => { this.paused = false; },
      onQuit: () => { this.paused = false; this.exit(); },
      onSettings: () => this.app.openSettings(() => { this.aim.lookSens = this.app.store.settings().camSens ?? 1; this.paused = false; this.pause(); }),
      fsButton: this.app.fullscreen,
    });
  }

  update(dt, t) {
    super.update(dt, t);
    // the frame dt is capped at 0.1 s (main.js), so a slow device would get a slow clock: use wall time
    const now = performance.now(), wall = this._clockT ? Math.min(1, (now - this._clockT) / 1000) : 0;
    this._clockT = now;
    if (this.clockLim) this.shotClock(wall);
  }

  // Counts down (in real seconds) only while the ball is waiting for a putt and the menu is closed.
  shotClock(dt) {
    const el = this.clockEl?.firstChild;
    if (!el) return;
    if (this.state !== 'ready') { this.clockLeft = null; el.hidden = true; return; }
    if (this.clockLeft == null) { this.clockLeft = this.clockLim; this.clockWarned = false; }
    if (!this.paused) this.clockLeft -= dt;
    const left = this.clockLeft, s = Math.max(0, Math.ceil(left));
    el.hidden = false;
    if (el._s !== s) { el._s = s; el.innerHTML = `<i style="--k:${Math.max(0, left / this.clockLim).toFixed(3)}"></i><b>${s}</b>`; el.classList.toggle('low', s <= 5); }
    if (left <= 5 && !this.clockWarned) { this.clockWarned = true; sfx.emit('aimTick', { power: 1 }); }
    if (left <= 0) {
      this.clockLeft = null;
      this.app.hud.banner('Shot clock! <small>+1 stroke</small>', 'bad', 1400);
      this.aim.guide.hide();
      this.shoot(0, 0, 0);
    }
  }

  dispose() {
    super.dispose();
    this.clockEl?.remove(); this.clockEl = null;
    this.app.hud.el.tray.hidden = false;
  }
}

// The game's clock. Time is spent, not burned.
//
// A week goes by when the fleet is under way, when a batch of orders goes out, or when the player
// asks to wait — never because they were reading. Standing in your quarters or sitting at the
// terminal stops it dead, which is the whole reason this is not a free-running timer any more.
//
// Orders still land on one tick the way they always did: `queued` debounces, so three taps in one
// visit to the terminal cost the same single week that one tap does.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createClock({ sim, scene, onState = null }) {
  const B = sim.content.balance.tick;
  let acc = 0;
  let ff = null;
  let commitTimer = 0;
  let note = '';

  // `null` means the clock is free to run. Anything else is the reason it is not, and the HUD
  // turns that into a line the player can act on.
  function held() {
    if (sim.over) return 'over';
    const b = document.body.classList;
    if (b.contains('front')) return 'front';
    if (b.contains('in-quarters')) return 'ashore';
    // Reading a sheet is reading, not doing. This is the same rule as the quarters, and it is the
    // one that stops a long sit with the Tactics panel open costing a month.
    if (b.contains('sheet-open')) return 'reading';
    if (sim.speed <= 0) return 'paused';
    if (!sim.work().busy) return 'idle';
    return null;
  }

  function announce() {
    const n = ff ? `ff:${ff.left}:${ff.label}` : (held() || 'run');
    if (n === note) return;
    note = n;
    onState?.(clock);
  }

  function tick() {
    sim.tick();
    return sim.over || sim.held !== null;
  }

  function runFf(dt) {
    ff.acc += dt;
    while (ff.acc >= ff.gap && ff.left > 0) {
      ff.acc -= ff.gap;
      ff.left -= 1;
      const stop = tick();
      if (stop) { ff.left = 0; break; }
    }
    const s = scene();
    if (s) s.setTickPhase(ff.left > 0 ? clamp(ff.acc / ff.gap, 0, 1) : 0);
    if (ff.left <= 0) {
      const done = ff.resolve;
      ff = null;
      done?.();
    }
    announce();
  }

  const clock = {
    get ff() { return ff && { label: ff.label, left: ff.left, of: ff.of }; },
    get holding() { return ff ? null : held(); },
    get busy() { return sim.work(); },

    update(dt) {
      const s = scene();
      if (!s) return;
      s.setAmbientRate(sim.speed > 0 ? Math.min(2.2, 0.8 + sim.speed * 0.35) : 1);
      if (ff) return runFf(dt);

      // the week resumes where it was held — zeroing here snaps every ship in transit back to the
      // start of its leg the moment a panel closes
      if (held()) { s.setTickPhase(s.phase || 0); announce(); return; }

      const gap = B.tickSeconds / sim.speed;
      acc += dt;
      // a backgrounded tab must not dump twenty weeks into one frame
      let budget = 2;
      while (acc >= gap && budget-- > 0) { acc -= gap; if (tick()) { acc = 0; break; } }
      if (acc >= gap) acc = 0;
      const f = clamp(acc / gap, 0, 1);
      s.setTickPhase(f);
      onState?.(clock, f);
      announce();
    },

    // Push time forward with a readout over the top of whatever is on screen. Anything queued
    // lands on the first of the weeks; the rest is the order taking as long as it takes.
    spend(weeks, label) {
      if (sim.over || weeks <= 0) return Promise.resolve();
      if (ff) {
        ff.left = Math.max(ff.left, weeks);
        ff.of = Math.max(ff.of, ff.left);
        ff.label = label;
        announce();
        return Promise.resolve();
      }
      return new Promise(resolve => {
        ff = { left: weeks, of: weeks, gap: B.ffSeconds, acc: 0, label, resolve };
        acc = 0;
        announce();
      });
    },

    // The one button that always does the useful thing: run to the next arrival if the fleet is
    // out, and hold position for a week if it is not.
    skip() {
      const w = sim.work();
      if (w.busy && w.next) {
        return clock.spend(Math.min(w.next, B.skipCap), 'Running to the next arrival');
      }
      return clock.spend(1, w.busy ? 'Working' : 'Holding position');
    },

    queued() {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(clock.send, B.commitMs);
      announce();
    },

    send() {
      clearTimeout(commitTimer);
      if (!sim.queued().length) return Promise.resolve();
      return clock.spend(B.orderLead, sim.queued().length === 1 ? 'Your order goes out' : 'Your orders go out');
    },

    // a run that ends mid-fast-forward must still settle the promise it handed out
    reset() { const done = ff?.resolve; acc = 0; ff = null; clearTimeout(commitTimer); note = ''; done?.(); },
  };

  sim.on((kind, payload) => {
    if (kind === 'act' && payload) clock.queued();
    else if (kind === 'reset') clock.reset();
  });

  return clock;
}

export default createClock;

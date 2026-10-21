// Reference wiring between ATC and FLIGHT's Traffic/Autopilot (js/flight). Pure; no three.js.
//   const link = linkTraffic(atc, traffic, { playerId: 'player' });
//   each frame (game time): link.update(dt)       // feeds states, applies commands to autopilots
//   atc.on('radio', (ev) => radio.handleEvent(ev));
// Hooks marked "optional" are called only if the Autopilot implements them (see docs/ATC.md §Integration).

export function linkTraffic(atc, traffic, { playerId = 'player', intentOf = null, runwayIntentOf = null } = {}) {
  const ids = new WeakMap();
  const applied = new Map(); // `${id}|${type}` -> seq
  const pendingGA = new Map(); // a go-around given on base waits for the approach leg
  let n = 0;

  const idOf = (e) => {
    if (e.player) return playerId;
    let id = ids.get(e);
    if (!id) { id = e.ac.id || `ai${++n}`; ids.set(e, id); }
    return id;
  };
  const intentFor = (e) => {
    if (intentOf) return intentOf(e);
    const name = e.ap?.route?.name || '';
    if (name.startsWith('circuits')) return 'circuits';
    if (name.startsWith('departure')) return 'depart';
    if (name.startsWith('arrival')) return 'fullStop';
    return e.player ? 'circuits' : 'park';
  };
  const fresh = (id, cmd) => {
    if (!cmd) return false;
    const k = `${id}|${cmd.type}`;
    if (applied.get(k) === cmd.seq) return false;
    applied.set(k, cmd.seq);
    return true;
  };

  function states() {
    return traffic.list.map((e) => {
      const ac = e.ac;
      return {
        id: idOf(e), callsign: e.name || idOf(e), isPlayer: !!e.player, remote: !!e.remote,
        pos: ac.pos, vel: ac.vel, heading: ac.heading, onGround: ac.onGround, agl: ac.agl, crashed: ac.crashed,
        apOverridden: traffic.modeOf ? traffic.modeOf(e) !== 'AUTOPILOT' : false,
        intent: intentFor(e), runwayIntent: runwayIntentOf ? runwayIntentOf(e) : null,
        touchdownFpm: ac.lastTouchdown && ac.time - ac.lastTouchdown.t < 0.05 ? ac.lastTouchdown.fpm : undefined,
      };
    });
  }

  function attach(e) {
    if (!e.ap || e.ap.__atcGate) return;
    const id = idOf(e);
    const prev = e.ap.gate;
    e.ap.gate = (leg, ap) => {
      if (prev && !prev(leg, ap)) return false;
      if (leg.kind !== 'hold') return true;
      return !!atc.command(id, 'clearedTakeoff') && !atc.command(id, 'cancelTakeoff');
    };
    e.ap.__atcGate = true;
  }

  function apply(e) {
    const ap = e.ap;
    if (!ap || e.remote) return;
    const id = idOf(e);
    const c = (t) => atc.command(id, t);
    const ga = c('goAround');
    if (fresh(id, ga)) pendingGA.set(id, ga.seq);
    if (pendingGA.has(id)) {
      if (!ga || ga.seq !== pendingGA.get(id)) pendingGA.delete(id);
      else if (ap.leg?.kind === 'approach' && !e.ac.onGround) {
        if (ap.sub !== 'goaround') ap._goAround(`ATC: ${ga.reason}`);
        pendingGA.delete(id);
      }
    }
    const ext = c('extendDownwind');
    if (fresh(id, ext)) ap.extendDownwind?.(ext.metres, ext.runwayEnd);   // optional
    const cancel = c('cancelTakeoff');
    if (fresh(id, cancel)) ap.rejectTakeoff?.(cancel.reason);             // optional
    const hold = c('holdPosition');
    if (fresh(id, hold)) ap.holdPosition?.(hold.reason);                  // optional
    const taxi = c('taxi');
    if (fresh(id, taxi)) ap.setTaxiRoute?.(taxi);                         // optional: ATC route + holdShort list
    const cross = c('crossRunway');
    if (fresh(id, cross)) ap.clearCrossing?.(cross.runway);               // optional
  }

  return {
    states,
    update(dt) {
      for (const e of traffic.list) attach(e);
      const evs = atc.update(dt, states());
      for (const e of traffic.list) apply(e);
      return evs;
    },
    idOf,
  };
}

// Reference wiring between ATC and FLIGHT's Traffic/Autopilot (js/flight). Pure; no three.js.
//   const link = linkTraffic(atc, traffic, { playerId: 'player' });
//   each frame (game time): link.update(dt)       // feeds states, applies commands to autopilots
//   atc.on('radio', (ev) => radio.handleEvent(ev));
// Hooks marked "optional" are called only if the Autopilot implements them (see docs/ATC.md §Integration).

const REFUSE_GA_SECS = 60;
const GA_TEXT = { spacing: 'too close behind traffic', runwayOccupied: 'runway occupied', traffic: 'traffic ahead on final', crossingTraffic: 'runway not clear', runwayClosed: 'runway closed', runwayChange: 'runway change' };

// aiMischief: chance per taxi / landing that a rival royal misbehaves (mildly: taxi speeding, a low pass instead of landing).
export const MISCHIEF = { off: 0, low: 0.12, high: 0.4 };

export function linkTraffic(atc, traffic, { playerId = 'player', intentOf = null, runwayIntentOf = null, touchAndGoPlayer = false, reroutePlayer = true, mischief = 0, rnd = Math.random } = {}) {
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
    if (name.startsWith('arrival')) {
      const legs = e.ap.route.legs, pk = legs.findIndex((l) => l.kind === 'park');
      return pk >= 0 && e.ap.i > pk && legs.slice(pk).some((l) => l.kind === 'takeoff') ? 'depart' : 'fullStop';
    }
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
        impact: ac._lastImpact != null && ac.time - ac._lastImpact < 1.5,
        landing: e.ap?.landing?.runway ? { end: e.ap.landing.runway, remaining: landRemaining(e) } : null,
        type: ac.type, vrKt: ac.P?.vr ? ac.P.vr / 0.514444 : undefined, speedScale: ac.P?.vcruise ? ac.P.vcruise / (95 * 0.514444) : undefined,
      };
    });
  }

  // LAND plan: metres still to fly along the plan (remaining fly legs, the final approach fix) to the threshold
  function landRemaining(e) {
    const ap = e.ap, P = ap.landing, legs = ap.route?.legs || [];
    let x = e.ac.pos.x, z = e.ac.pos.z, d = 0;
    const go = (px, pz) => { d += Math.hypot(px - x, pz - z); x = px; z = pz; };
    if (ap.route === P.route) for (let k = Math.max(0, ap.i); k < legs.length; k++) {
      const l = legs[k];
      if (l.kind === 'fly' && l.to) go(l.to[0], l.to[2]);
      else if (l.kind === 'approach' && k > ap.i && l.fafDist && P.end?.u) go(P.end.thr[0] - P.end.u[0] * l.fafDist, P.end.thr[1] - P.end.u[1] * l.fafDist);
    }
    if (P.end?.thr) go(P.end.thr[0], P.end.thr[1]);
    return Math.round(d);
  }

  function attach(e) {
    if (!e.ap || e.ap.__atcGate) return;
    const id = idOf(e);
    const prev = e.ap.gate;
    e.ap.gate = (leg, ap) => {
      if (prev && !prev(leg, ap)) return false;
      if (leg.kind !== 'hold') return true;
      if (atc.command(id, 'cancelTakeoff')) return false;
      if (atc.command(id, 'clearedTakeoff')) return true;
      return !leg.roll && !!atc.command(id, 'lineUpWait');   // line up and wait: onto the runway, no roll
    };
    e.ap.__atcGate = true;
  }

  // One roll per taxi leg / approach: taxi speeding on the next long straight, or a low pass instead of the landing.
  function naughty(e) {
    const ap = e.ap, k = ap.leg?.kind;
    const taxiing = k === 'taxi' || (k === 'takeoff' && ap.sub === 'taxi');
    const key = taxiing ? `t${ap.i}|${ap.route?.name}` : k === 'approach' && !e.ac.onGround && ap.sub === 'final' ? `a${ap.i}|${ap.route?.name}` : null;
    if (!key || e.__mKey === key) return;
    e.__mKey = key;
    const lvl = typeof mischief === 'string' ? MISCHIEF[mischief] ?? 0 : mischief;
    ap.mischief = lvl > 0 && rnd() < lvl ? (taxiing ? 'speed' : intentFor(e) === 'fullStop' ? 'lowpass' : null) : null;
  }

  function apply(e) {
    const ap = e.ap;
    if (!ap || e.remote) return;
    if (!e.player) naughty(e);
    const id = idOf(e);
    const c = (t) => atc.command(id, t);
    const ga = c('goAround');
    if (fresh(id, ga)) pendingGA.set(id, ga.seq);
    if (pendingGA.has(id)) {
      if (!ga || ga.seq !== pendingGA.get(id)) pendingGA.delete(id);
      else if (e.player && ap.lastOverride != null && e.ac.time - ap.lastOverride < REFUSE_GA_SECS) pendingGA.delete(id); // a royal who just took the controls lands anyway
      else if (ap.leg?.kind === 'approach' && !e.ac.onGround) {
        if (ap.sub !== 'goaround') {
          ap._goAround(`Tower: ${GA_TEXT[ga.reason] || 'go around'}`);
          const last = ap.events?.[ap.events.length - 1];
          if (last?.type === 'goaroundrefused') atc.noteGoAroundRefused?.(id, last.reason);
        }
        pendingGA.delete(id);
      }
    }
    const tg = c('clearedTouchAndGo'), cl = c('clearedLand');
    if (fresh(id, tg) && (!e.player || touchAndGoPlayer)) ap.touchAndGo?.(true);
    if (fresh(id, cl)) ap.touchAndGo?.(false);
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

  // Active runway changed: every autopilot on a standard route re-plans for the new end (the player only while on AP).
  atc.on('runwayChange', (ev) => {
    for (const e of traffic.list) {
      if (!e.ap || e.remote || (e.player && (!reroutePlayer || (traffic.modeOf && traffic.modeOf(e) !== 'AUTOPILOT')))) continue;
      e.ap.changeRunway?.(ev.to, ev.from);
    }
  });

  return {
    states,
    update(dt) {
      for (const e of traffic.list) attach(e);
      const evs = atc.update(dt, states());
      for (const e of traffic.list) apply(e);
      return evs;
    },
    idOf,
    setMischief(v) { mischief = v; },
    // D22: lined up on the active runway at once; ATC forgets the old ground state and gives it line-up-and-wait.
    skipToRunway(e, end = atc.activeRunway().end) {
      e.ap?.skipToRunway(end);
      atc.resetStrip(idOf(e), { lineUp: end, grace: 10 });
      return end;
    },
    // D21: taxi straight to the nearest open runway start and go. ATC is NOT told: it sees the crimes as they happen.
    demandTakeoff(e) {
      const a = atc.activeRunway();
      const ends = Object.entries(a.open).filter(([, o]) => o).flatMap(([rw]) => atc.geo?.runwayById(rw)?.ends ?? rw.split('/'));
      return e.ap?.demandTakeoff({ ends, prefer: a.end });
    },
    // spawn/respawn/teleport: no crimes for a few seconds, ATC state reset; lined up on a departure end = first in line
    placed(e, secs = 8) {
      const ac = e.ac, G = atc.geo, p = [ac.pos.x, ac.pos.z];
      let lineUp = null;
      const rw = ac.onGround && G ? G.runwayAt(p, 0) : null;
      if (rw) for (const end of rw.ends) {
        const inf = G.endInfo(end), a = G.toEnd(inf, p).a;
        if (Math.abs(G.angDiff(ac.heading, inf.heading)) < 20 && a > -20 && a < 250 && G.departurePoint(end)) lineUp = end;
      }
      atc.resetStrip(idOf(e), { grace: secs, lineUp });
      return lineUp;
    },
  };
}

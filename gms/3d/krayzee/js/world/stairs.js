// A6 (STAIRS) the Jumbo boarding moment's state machine (no THREE; visuals in js/world/boarding.js).
// idle → (stopped on a stand stopFor s) roll → door → parade → close → away → done; moving off at any point = away (quick).
export const STAIRS = { stopFor: 1.5, roll: 0.9, door: 0.5, parade: 3.6, close: 0.4, away: 0.9, quick: 0.35, moveGs: 0.3, rearmGs: 1.5, standR: 12, aiStopFor: 3 };

export const newStairs = () => ({ phase: 'idle', t: 0, stopT: 0, armed: true, dur: 0, out: { visible: false, stairs: 0, door: 0, carpet: 0, parade: -1 } });

// inp: { onGround, gs (m/s), atStand, crashed }. Returns st.out.
export function stairsStep(st, inp, dt) {
  const still = inp.onGround && !inp.crashed && inp.atStand && inp.gs <= STAIRS.moveGs;
  if (!inp.onGround || inp.crashed || !inp.atStand || inp.gs > STAIRS.rearmGs) st.armed = true;
  const go = (p, d) => { st.phase = p; st.t = 0; st.dur = d; };
  if (st.phase === 'idle' || st.phase === 'done') {
    if (st.phase === 'done' && st.armed) st.phase = 'idle';
    st.stopT = still && st.phase === 'idle' ? st.stopT + dt : 0;
    if (st.stopT >= STAIRS.stopFor) { st.armed = false; st.stopT = 0; go('roll', STAIRS.roll); }
  } else {
    st.t += dt;
    if (!still && st.phase !== 'away') { const k = st.out.stairs; go('away', STAIRS.quick); st.t = (1 - k) * STAIRS.quick; }
    else if (!still && st.dur > STAIRS.quick) { const f = st.t / st.dur; st.dur = STAIRS.quick; st.t = f * STAIRS.quick; }
    if (st.t >= st.dur) {
      const next = { roll: ['door', STAIRS.door], door: ['parade', STAIRS.parade], parade: ['close', STAIRS.close], close: ['away', STAIRS.away] }[st.phase];
      if (next) go(...next); else { st.phase = 'done'; st.t = 0; }
    }
  }
  const f = st.dur ? Math.min(1, st.t / st.dur) : 0, o = st.out, ease = (x) => x * x * (3 - 2 * x);
  o.parade = -1;
  switch (st.phase) {
    case 'roll': o.stairs = ease(f); o.door = 0; o.carpet = 0; break;
    case 'door': o.stairs = 1; o.door = f; o.carpet = f; break;
    case 'parade': o.stairs = 1; o.door = 1; o.carpet = 1; o.parade = f; break;
    case 'close': o.stairs = 1; o.door = 1 - f; o.carpet = 1; break;
    case 'away': o.stairs = Math.min(o.stairs, 1 - ease(f)); o.door = Math.min(o.door, 1 - f); o.carpet = Math.min(o.carpet, 1 - f); break;
    default: o.stairs = 0; o.door = 0; o.carpet = 0;
  }
  o.visible = o.stairs > 0.001;
  return o;
}

export const nearStand = (stands, x, z, r = STAIRS.standR) => !!stands?.some((s) => Math.hypot(x - s.position[0], z - s.position[2]) < r);

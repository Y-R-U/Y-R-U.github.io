// The earth elemental, as arithmetic. js/world/elemental.js gives it a body; everything it decides
// it decides here, so the fight can be played out in node a thousand times without a renderer.
//
// It is a weak one, which is not the same as an easy one. It is slower than you, it does not
// think, and it cannot be outrun — but it mends itself off bare earth faster than a proving knife
// takes it apart, so the fight is not about damage. It is about where the fight happens. Stand on
// the flagstones and make it come to you across them.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export const EARTH = {
  hp: 78,
  radius: 0.85,
  speed: 2.35,          // slower than the player's 5.0, so the stone is always reachable
  reach: 2.5,
  arc: 1.5,
  damage: 11,
  notice: 26,
  windup: 0.62,         // the tell: long enough to read, short enough to punish standing still
  strike: 0.16,
  recover: 1.05,
  // Measured against the proving knife, which is 9 a swing on a 0.75 s cooldown — 12 a second.
  // `regenDelay` has to be well under that cooldown or the mending never starts between cuts and
  // the dirt does nothing at all: at 0.9 s the elemental died on soil in under seven seconds and
  // the room stopped teaching anything. At 0.3 s it mends for 0.45 s of every 0.75 s cycle, which
  // is 10.8 hp against the knife's 9 — so on earth it very slowly gains, and on stone it loses.
  regen: 24,            // hp per second while it is standing on dirt
  regenDelay: 0.3,      // and how long after being cut before that starts again
  stagger: 0.22,        // how long a hit interrupts it for
  turn: 3.4,            // rad/s — it turns slowly enough that circling it is a real answer
};

export const STATES = ['idle', 'chase', 'windup', 'strike', 'recover', 'stagger', 'dead'];

export function spawn(at, tuning = EARTH) {
  return {
    x: at.x, z: at.z, yaw: at.yaw ?? 0,
    hp: tuning.hp, max: tuning.hp,
    state: 'idle', t: 0, since: 0, hitId: 0, struck: false,
    onDirt: false, mended: 0,
  };
}

// One frame. `w` is the world it can see: where the player is, whether that player is alive, and
// what the floor is made of under a point. Returns a new record — nothing here mutates.
export function step(f, dt, w, tuning = EARTH) {
  if (f.state === 'dead') return { ...f, t: f.t + dt, struck: false };

  const T = tuning;
  const p = w.player;
  const d = p ? Math.hypot(p.x - f.x, p.z - f.z) : Infinity;
  const alive = !!p && p.alive !== false;

  let { x, z, yaw, hp, state, t, since } = f;
  t += dt;
  since += dt;
  let struck = false;

  // Standing on soil is the whole of the fight. It mends whatever state it is in — including mid
  // windup — but not for `regenDelay` after being cut, or a knife can never get ahead of it.
  const onDirt = !!w.onDirt?.(x, z);
  let mended = 0;
  if (onDirt && since >= T.regenDelay && hp < f.max) {
    mended = Math.min(T.regen * dt, f.max - hp);
    hp += mended;
  }

  // It always turns toward you, in every state but death. A windup you can walk behind is a
  // windup with no threat in it.
  if (alive) {
    const want = Math.atan2(p.x - x, p.z - z);
    yaw += clamp(wrapPi(want - yaw), -T.turn * dt, T.turn * dt);
  }

  switch (state) {
    case 'idle':
      if (alive && d < T.notice) { state = 'chase'; t = 0; }
      break;

    case 'chase': {
      if (!alive) { state = 'idle'; t = 0; break; }
      if (d <= T.reach * 0.82) { state = 'windup'; t = 0; break; }
      const k = Math.min(1, T.speed * dt / Math.max(d, 1e-4));
      x += (p.x - x) * k;
      z += (p.z - z) * k;
      break;
    }

    case 'windup':
      if (t >= T.windup) { state = 'strike'; t = 0; }
      break;

    case 'strike':
      if (t >= T.strike) { state = 'recover'; t = 0; }
      break;

    // Being cut interrupts it. Briefly — a stagger you can chain into a stun-lock turns the fight
    // back into a damage race, which is the one thing the dirt exists to stop.
    case 'stagger':
      if (t >= T.stagger) { state = alive && d < T.notice ? 'chase' : 'idle'; t = 0; }
      break;

    case 'recover':
      if (t >= T.recover) { state = alive && d < T.notice ? 'chase' : 'idle'; t = 0; }
      break;

    default:
      break;
  }

  // Entering `strike` is the frame the blow is thrown. Reporting the transition rather than the
  // state means a long frame cannot throw two and a stalled one cannot throw none.
  struck = state === 'strike' && f.state !== 'strike';

  return { ...f, x, z, yaw, hp, state, t, since, struck, onDirt, mended };
}

// A hit from the player. `id` is the swing's own number so one swing cannot land twice, which is
// what an attack that is a state rather than an event otherwise does every frame it is held.
export function wound(f, amount, id = 0) {
  if (f.state === 'dead' || (id && id === f.hitId)) return f;
  const hp = Math.max(0, f.hp - Math.max(0, amount));
  // A hit during the windup takes the blow off it; a hit at any other point does not reset a
  // state that was already going to end. `since` restarts either way — that is the regeneration
  // delay, and it is the only thing that lets a knife get ahead of eight and a half a second.
  const state = hp <= 0 ? 'dead' : (f.state === 'windup' ? 'stagger' : f.state);
  return { ...f, hp, hitId: id || f.hitId, since: 0, state, t: state === f.state ? f.t : 0, struck: false };
}

export const fraction = f => (f.max > 0 ? f.hp / f.max : 0);
export const isDead = f => f.state === 'dead' || f.hp <= 0;

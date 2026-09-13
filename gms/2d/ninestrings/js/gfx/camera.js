// The camera is most of "game feel". Three independent springs stacked on one
// another: a soft follow spring for position, a stiff spring for shake and
// kick, and a slow one for the zoom punch. Nothing here uses a fixed lerp
// factor — a 0.1-per-frame lerp is a different camera at 120fps than at 45fps,
// and this game is allowed to drop frames on purpose (adaptive quality).

const TAU = Math.PI * 2;

// Stable implicit critically-damped spring. Unconditionally stable at any dt,
// which a naive `v += (target-x)*k*dt; x += v*dt` is not — that one explodes
// the first time the tab stalls for 200ms.
function spring(x, v, target, omega, dt, out) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  out[0] = (f * x + dt * v + hhoo * target) * det;
  out[1] = (v + hoo * (target - x)) * det;
}

// Smooth value noise. A fresh random number per frame reads as television
// static; interpolating between hashed integers reads as a camera being
// shoved, which is the whole point.
function hash1(i) {
  i = (i << 13) ^ i;
  return 1 - ((i * (i * i * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824;
}
function noise1(t) {
  const i = Math.floor(t), f = t - i;
  const a = hash1(i), b = hash1(i + 1);
  return a + (b - a) * (f * f * (3 - 2 * f));
}

export function makeCamera() {
  const o = [0, 0];          // spring scratch, reused

  let cx = 0, cy = 0;        // smoothed centre, before shake
  let cvx = 0, cvy = 0;
  let sx = 0, sy = 0, svx = 0, svy = 0;   // shake offset + velocity
  let kx = 0, ky = 0, kvx = 0, kvy = 0;   // directional kick
  let zo = 0, zv = 0;                     // zoom offset from 1
  let mag = 0;                            // current shake magnitude
  let t = 0;
  let placed = false;
  let bounds = null;

  const cam = {
    x: 0, y: 0, zoom: 1,
    trauma: 0,               // 0..1 shake, for scenefx to drive chroma with

    // --- tunables (data, so the feel pass is edits here and nowhere else)
    followHz: 2.6,           // follow spring frequency
    lead: 0.26,              // seconds of velocity lead-ahead
    // The visible field is 420 units wide and ~900 tall in portrait, so the
    // HORIZONTAL axis is the short one and wants the bigger lead. Vertical lead
    // is kept smaller or the player's own sprite drifts off the thumb.
    leadX: 1.15, leadY: 0.85,
    maxLead: 52,
    shakeHz: 27,             // buzz frequency for a small hit
    shakeBigHz: 11,          // ...and for a big one: low and heavy
    shakeAmp: 13.0,          // world units per unit of magnitude
    shakeDecay: 3.4,
    // The offset spring has to be stiff enough to actually follow a 27Hz noise
    // target; at a lower omega it low-passes the buzz away and every hit feels
    // identically soft.
    shakeOmega: 190,
    kickOmega: 22,
    zoomOmega: 11,
    maxMag: 3.5,

    follow(target, dt) {
      if (!target) return;
      if (dt > 0.05) dt = 0.05;

      const tvx = target.vx || 0, tvy = target.vy || 0;
      let lx = tvx * cam.lead * cam.leadX, ly = tvy * cam.lead * cam.leadY;
      const ll = Math.hypot(lx, ly);
      if (ll > cam.maxLead) { const k = cam.maxLead / ll; lx *= k; ly *= k; }

      const tx = target.x + lx, ty = target.y + ly;

      if (!placed) { cx = tx; cy = ty; cvx = cvy = 0; placed = true; return; }

      const w = TAU * cam.followHz;
      spring(cx, cvx, tx, w, dt, o); cx = o[0]; cvx = o[1];
      spring(cy, cvy, ty, w, dt, o); cy = o[0]; cvy = o[1];
    },

    // Big hits kick, small hits buzz: magnitude drives both amplitude and the
    // noise frequency, so a Conductor death is felt as a different event from
    // a shambler landing a hit rather than just a louder one.
    shake(amount) {
      if (!(amount > 0)) return;
      mag = Math.min(cam.maxMag, mag + amount);
      if (amount >= 1.2) cam.punch(Math.min(0.09, amount * 0.035));
    },

    kick(x, y) {
      const l = Math.hypot(x, y);
      if (!l) return;
      const p = Math.min(1, l) * 480;
      kvx += (x / l) * p;
      kvy += (y / l) * p;
    },

    // Zoom punch. Positive pushes IN (the world gets bigger) and settles back.
    punch(amount) { zo += amount; },

    setBounds(minX, minY, maxX, maxY) {
      if (minX === null || minX === undefined) { bounds = null; return; }
      bounds = bounds || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      bounds.minX = minX; bounds.minY = minY; bounds.maxX = maxX; bounds.maxY = maxY;
    },

    snap(x, y) { cx = x; cy = y; cvx = cvy = 0; placed = true; cam.x = x; cam.y = y; },

    reset() {
      cx = cy = cvx = cvy = 0; sx = sy = svx = svy = 0;
      kx = ky = kvx = kvy = 0; zo = zv = 0; mag = 0; placed = false;
      cam.x = cam.y = 0; cam.zoom = 1; cam.trauma = 0;
    },

    update(dt, world) {
      if (!(dt > 0)) dt = 1 / 60;
      if (dt > 1 / 15) dt = 1 / 15;    // a stalled tab must not fling the camera
      t += dt;

      const p = world && world.player;
      if (p && p.alive !== false) cam.follow(p, dt);

      // shake: decaying magnitude, smooth noise target, stiff spring after it
      if (mag > 0.0005) {
        mag *= Math.exp(-cam.shakeDecay * dt);
        const heavy = Math.min(1, mag / cam.maxMag);
        const hz = cam.shakeBigHz + (cam.shakeHz - cam.shakeBigHz) * (1 - heavy);
        const a = mag * cam.shakeAmp;
        const tx = noise1(t * hz) * a;
        const ty = noise1(t * hz + 31.7) * a;
        spring(sx, svx, tx, cam.shakeOmega, dt, o); sx = o[0]; svx = o[1];
        spring(sy, svy, ty, cam.shakeOmega, dt, o); sy = o[0]; svy = o[1];
      } else {
        mag = 0;
        spring(sx, svx, 0, cam.shakeOmega, dt, o); sx = o[0]; svx = o[1];
        spring(sy, svy, 0, cam.shakeOmega, dt, o); sy = o[0]; svy = o[1];
      }
      cam.trauma = Math.min(1, mag / cam.maxMag);

      spring(kx, kvx, 0, cam.kickOmega, dt, o); kx = o[0]; kvx = o[1];
      spring(ky, kvy, 0, cam.kickOmega, dt, o); ky = o[0]; kvy = o[1];

      spring(zo, zv, 0, cam.zoomOmega, dt, o); zo = o[0]; zv = o[1];

      let x = cx + sx + kx, y = cy + sy + ky;
      if (bounds) {
        if (x < bounds.minX) x = bounds.minX; else if (x > bounds.maxX) x = bounds.maxX;
        if (y < bounds.minY) y = bounds.minY; else if (y > bounds.maxY) y = bounds.maxY;
      }
      cam.x = x; cam.y = y;
      // main.js multiplies viewport.zoom by this, so it is a MULTIPLIER, not a
      // scale in its own right.
      cam.zoom = 1 + zo;
    },
  };

  return cam;
}

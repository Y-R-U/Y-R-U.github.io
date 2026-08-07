// The eight named sequences and the turn presenter — C6 owns this file. The ids are frozen.
//
// Each generator is posed with EXPLICIT positions rather than by reading the camera's current
// transform. That is a hard rule, not a style choice — a generator that reads live world state at
// compile time poses differently on the second call, and seek() stops being deterministic.
// Anything variable comes in through ctx. Scene ANCHORS (the window, the table) are fixed and may
// be read; a ship's y is not, because a hull heaves every frame.

import * as THREE from 'three';
import { CINE, PACE, VFX } from '../config.js';
import { EASE } from './rig.js';
import { setShellPhase, ballistic } from '../world/shell.js';
import { registerShotSequences } from './shots.js';

export const SEQUENCE_IDS = [
  'open_flyover', 'bridge_settle', 'fire_out', 'shell_chase',
  'impact_miss', 'impact_hit', 'enemy_volley', 'bridge_return',
];

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const W = () => window.__waterline;

// registerSequences() receives only { bridge, ocean, ship, fleet } — main.js is frozen and does not
// pass vfx or table. Both are on the hook, and reading them from there is the established pattern
// (ocean.js's own sea() helper does exactly this).
export const vfxOf = () => W().vfx.emit ?? W().vfx;
export const tableOf = () => W().world.table;

export function registerSequences(director, world) {
  const bridge = world.bridge;
  const fleet = world.fleet;

  const table = () => bridge.tableAnchor.getWorldPosition(new THREE.Vector3());
  const win = () => bridge.windowAnchor.getWorldPosition(new THREE.Vector3());

  // The two interior poses everything else hangs off. atTable is the resting board view; atWindow
  // is a step forward, level with the sill, from which the fly-out leaves.
  // 1.30 is UI.camera.ceiling: the table is 0.95 above a deck with 2.68 of headroom, so 1.80 put
  // every resting pose 7 cm INSIDE the deckhead (D31). It also makes the hand-over to C7's play
  // pose nearly a no-op.
  const atTable = () => table().add(v(-0.62, 1.30, -3.15));
  const tableLook = () => table().add(v(0.52, 1.00, 1.5));
  const atWindow = () => win().add(v(0.05, 0.02, -2.6));

  // Where bridge_return cuts in from, offset from the window and ABOVE THE WATER, not above the
  // deck. It has to clear the flagship: 34 m out at sill height is inside her forward barrels.
  const outNear = () => win().add(v(1.5, 5.5, 62));

  director.registerSequence('open_flyover', function* (rig, ctx) {
    const c = ctx.at || v(0, 0, 260);
    const w = win();
    rig.fov(46);
    rig.exposure(CINE.exposure.exterior, CINE.exposure.exterior, 0);
    rig.drift(0.35, 0.9, 0.17);
    // a wide arc across the fleet, dropping and closing — a straight lerp reads as a slide
    rig.path([
      c.clone().add(v(430, 150, 470)),
      c.clone().add(v(210, 96, 250)),
      c.clone().add(v(40, 54, 90)),
    ], 3400, {
      ease: EASE.inOut,
      look: [c.clone().add(v(0, 12, 0)), c.clone().add(v(-10, 8, -30)), c.clone().add(v(-30, 6, -60))],
    });
    yield { until: 3400 };

    // climb the tower and come in level with the bay, so the room arrives from OUTSIDE rather than
    // the camera simply appearing in it
    rig.drift(0.22, 0.5, 0.19);
    rig.fov(52, 1500);
    // the last waypoint is level with the middle of the glass, not 1.6 m above the sill: coming in
    // over the header meant arriving looking DOWN into the room from inside its own roof (D31)
    rig.path([
      c.clone().add(v(40, 54, 90)),
      w.clone().add(v(16, 9, 46)),
      w.clone().add(v(3.2, 0.2, 12)),
    ], 1500, { ease: EASE.inOut, look: [w.clone().add(v(0, 0.0, 2))] });
    yield { until: 1500 };

    rig.exposure(CINE.exposure.exterior, CINE.exposure.interior, 1200, CINE.exposure.lagMs);
    rig.move(w.clone().add(v(3.2, 0.2, 12)), atTable(), w.clone().add(v(0, 0.0, 2)), tableLook(), 1200, EASE.settle);
    rig.drift(0.06, 0.16, 0.13);
    yield { until: 1200 };
  });

  // Where the loop rests. Free look is enabled HERE and nowhere else: it is a live offset applied
  // after the timeline, not a beat, so it survives the sequence ending.
  director.registerSequence('bridge_settle', function* (rig) {
    rig.fov(48);
    rig.exposure(CINE.exposure.interior, CINE.exposure.interior, 0);
    rig.drift(0.05, 0.14, 0.13);
    rig.move(atTable().add(v(0.35, 0.10, -0.8)), atTable(), tableLook(), tableLook(), 900, EASE.settle);
    rig.on(() => rig.freeLook(true));
    yield { until: 900 };
  });

  // Brief step 3. Out of the window, then round onto the firing ship's bow so her guns go off in
  // the lens. The last two beats are posed from ctx.gun, not from the window: an offset authored
  // against the window anchor frames whatever happens to be 120 m out of it, which is sea.
  director.registerSequence('fire_out', function* (rig, ctx) {
    const short = ctx.pace !== 'full';
    const gun = ctx.gun || v(0, 20, 36);
    const aim = ctx.aim || v(0, 8, 900);
    const a = atTable(), b = atWindow(), w = win();

    // A station off the muzzle, forward of it and up. `d` is scaled by the firing ship so the hull
    // fills the same fraction of the frame whether she is a 36 m destroyer or a 115 m battleship;
    // at fov 52 the frame is 0.98 × its distance wide, so 0.45 L lands about half a hull across it.
    const bore = aim.clone().sub(gun).setY(0).normalize();
    const beam = v(-bore.z, 0, bore.x);
    // stand on the side the round is NOT drifting toward, so it leaves across the frame rather
    // than straight down the lens. Both fleets face along Z, so `beam` is ±X and x is the test.
    const sign = (aim.x - gun.x) * beam.x > 0 ? -1 : 1;
    const d = Math.min(60, Math.max(30, (ctx.len || 90) * 0.45));
    const stn = gun.clone()
      .addScaledVector(beam, sign * d * 0.78)
      .addScaledVector(bore, d * 0.30)
      .add(v(0, d * 0.30, 0));
    // Framed on the hull BEHIND the muzzle, not on the muzzle: aimed at the gun itself the ship
    // runs out of one corner and half the frame is sea. The guns point roughly ahead, so backing
    // down the bore is backing down the deck.
    const hold = gun.clone().addScaledVector(bore, -d * 0.55);
    // where the frame drifts to as the guns go — a point just down the bore. A fraction of the way
    // to a target 900 m away swings the whole ship out of shot on the first frame.
    const away = gun.clone().addScaledVector(bore, d * 0.5).add(v(0, d * 0.12, 0));
    // still leaves through the glass: the transit is what motivates the exposure change instead of
    // it reading as a fade (BUILD_PLAN §7.1 fallback, taken up front)
    const o = w.clone().add(v(0, -1.4, 22)).lerp(stn, 0.20);

    rig.on(() => rig.freeLook(false));
    rig.exposure(CINE.exposure.interior, CINE.exposure.exterior, short ? 420 : 760, CINE.exposure.lagMs);
    rig.drift(0.12, 0.3, 0.2);
    rig.move(a, b, tableLook(), win().add(v(0.3, -0.6, 26)), short ? 260 : 520, EASE.inCubic);
    yield { until: short ? 260 : 520 };

    rig.fov(52, short ? 300 : 640);
    rig.move(b, o, win().add(v(0.3, -0.6, 26)), hold, short ? 300 : 640, EASE.out);
    yield { until: short ? 300 : 640 };

    rig.drift(0.3, 0.7, 0.23);
    rig.move(o, stn, hold, hold, short ? 260 : 560, EASE.inOut);
    yield { until: short ? 260 : 560 };

    // the guns go off in our face. The flash is fired HERE rather than after the sequence returns:
    // played out, it landed on the first frame of shell_chase and was never seen from this pose.
    if (ctx.flash) rig.on(ctx.flash);
    rig.kick(0.9, 460, 19);
    rig.pose(460, u => ({ look: _lerp(hold, away, EASE.out(u) * 0.55) }));
    yield { until: 460 };
  });

  // Brief step 4. Trails the round down its own arc. ctx.round is a tracer handle; ctx.from/to are
  // the fallback when there is no live round (a posed still, a dry run).
  director.registerSequence('shell_chase', function* (rig, ctx) {
    const ms = CINE.shellMs[ctx.pace] ?? CINE.shellMs.full;
    if (!ms) return;
    const round = ctx.round || null;
    const from = ctx.from || (round && round.round.arc.from) || v(0, 24, 60);
    const to = ctx.to || (round && round.round.arc.to) || v(0, 0, 900);
    const arc = round ? round.round.arc : ballistic(from, to);
    const at = (u, out) => arc.at(u, out);

    // Trail the round from behind, outboard and above, easing outboard as it falls so the impact
    // is already in frame when it lands. Distances are in shell calibres, so a size-9 round gets a
    // proportionally wider berth and does not fill the lens.
    const R = (VFX[ctx.size] || VFX[1]).scale;
    const head = new THREE.Vector3(), tail = new THREE.Vector3(), aim = new THREE.Vector3();
    const start = ctx.u0 ?? 0.06, end = ctx.u1 ?? 0.97;

    rig.drift(0.16 * R, 0.5 * R, 0.28);
    rig.fov(42);
    rig.pose(ms, u => {
      const f = start + (end - start) * u;
      at(f, head);
      at(Math.max(0, f - 0.055), tail);
      // camera sits behind the round on its own path, offset outboard and up
      const back = tail.clone().sub(head);
      const side = new THREE.Vector3(-back.z, 0, back.x).normalize();
      const lift = 1 + u * 1.7;
      const pos = head.clone()
        .add(back.multiplyScalar(0.62 + u * 0.5))
        .addScaledVector(side, R * (6.5 + u * 9))
        .add(v(0, R * (4.2 * lift), 0));
      // look slightly ahead of the round, at where it is going, not at where it is
      at(Math.min(1, f + 0.09 + u * 0.16), aim);
      return { pos, look: head.clone().lerp(aim, 0.42 + u * 0.3), fov: 42 - u * 6 };
    });
    // the round poses itself from the same u, so still and motion agree by construction
    if (round) rig.on(() => setShellPhase(null));
    yield { until: ms };
  });

  director.registerSequence('impact_miss', function* (rig, ctx) {
    const at = ctx.at || v(0, 0, 900);
    const eye = ctx.eye || at.clone().add(v(-46, 34, -78));
    rig.drift(0.22, 0.7, 0.2);
    rig.move(eye, eye.clone().add(v(6, -4, 14)), at.clone().add(v(0, 14, 0)), at.clone().add(v(0, 20, 0)), 1100, EASE.out);
    yield { until: 1100 };
  });

  director.registerSequence('impact_hit', function* (rig, ctx) {
    const at = ctx.at || v(0, 8, 900);
    const eye = ctx.eye || at.clone().add(v(-40, 26, -66));
    rig.drift(0.26, 0.8, 0.22);
    rig.kick(1.5, 620, 15);
    rig.move(eye, eye.clone().add(v(4, 3, 16)), at, at.clone().add(v(0, 8, 0)), 1250, EASE.out);
    yield { until: 1250 };
  });

  // Brief step 6/7. You watch from your OWN ship, so you see which hull takes it and where.
  director.registerSequence('enemy_volley', function* (rig, ctx) {
    const own = ctx.own || v(0, 12, 0);            // the deck you are standing on
    const foe = ctx.foe || v(0, 8, -900);          // where the flashes are
    const mark = ctx.at || own.clone().add(v(14, 2, 20));   // where it lands on you
    const short = ctx.pace !== 'full';

    // over your own rail, looking out at the enemy line
    const eyeA = own.clone().add(v(-34, 20, -30));
    rig.fov(44);
    rig.drift(0.3, 0.9, 0.19);
    rig.move(eyeA, eyeA.clone().add(v(7, -2, 4)), foe, foe, short ? 520 : 1000, EASE.out);
    yield { until: short ? 520 : 1000 };

    // swing to the struck plating — the red indicator is the point of the whole beat
    const eyeB = mark.clone().add(v(-30, 15, -26));
    rig.kick(1.4, 560, 16);
    rig.move(eyeA.clone().add(v(7, -2, 4)), eyeB, foe, mark, short ? 420 : 820, EASE.inOut);
    yield { until: short ? 420 : 820 };

    rig.move(eyeB, eyeB.clone().add(v(9, -2, 7)), mark, mark, short ? 400 : 900, EASE.out);
    yield { until: short ? 400 : 900 };
  });

  director.registerSequence('bridge_return', function* (rig, ctx) {
    const short = ctx.pace !== 'full';
    const from = ctx.from || outNear();
    rig.exposure(CINE.exposure.exterior, CINE.exposure.interior, short ? 380 : 700, CINE.exposure.lagMs);
    rig.fov(48, short ? 320 : 700);
    rig.drift(0.1, 0.28, 0.16);
    rig.move(from, atWindow(), from.clone().add(v(0, -4, 40)), win().add(v(0, -0.4, 8)), short ? 320 : 620, EASE.inOut);
    yield { until: short ? 320 : 620 };
    rig.move(atWindow(), atTable(), win().add(v(0, -0.4, 8)), tableLook(), short ? 300 : 620, EASE.settle);
    rig.drift(0.05, 0.14, 0.13);
    rig.on(() => rig.freeLook(true));
    yield { until: short ? 300 : 620 };
  });

  // P3 — appended, nothing above is touched. Out of the window, up over your own formation to watch
  // the escorts take their new stations, then back to the board. The flagship does not move (D34),
  // so the shot is you leaving your own ship and the rest of the fleet re-forming around you.
  //
  // Everything variable arrives in ctx: `centre` and `radius` are the bounding circle of the fleet
  // over BOTH the old and the new stations, `aspect` is the viewport's. Solving the station from
  // those is the only way the whole formation is in frame in portrait as well as landscape — a
  // fixed pose that frames it at 16:9 crops a third of it away at 390×844.
  director.registerSequence('fleet_reform', function* (rig, ctx) {
    const c = v(ctx.cx || 0, 0, ctx.cz || 0);
    const R = Math.max(120, ctx.radius || 260);
    const aspect = ctx.aspect || 1.78;
    const hold = Math.max(1200, ctx.ms || 2600);
    const fov = aspect < 1 ? 70 : 54;
    const tan = Math.tan((fov * Math.PI) / 360);
    // The formation is widest across the line of sight, and half the frame subtends d·tan(fov/2)
    // vertically and that × aspect horizontally — so in portrait the horizontal is what binds, by
    // a factor of nearly four. Solving it is the only way the fleet is in frame at 390×844 as well
    // as at 16:9; 0.95 puts the outermost hull on the frame edge rather than inside it.
    const PHI = 30 * Math.PI / 180;                      // camera elevation above the fleet
    const d = Math.min(900, Math.max(260, (R * 0.95) / (tan * Math.min(1, aspect) * Math.cos(PHI))));
    // Stand on the far side of the fleet FROM the sun and look back across it into the sunset. D32
    // is the reason: a dusk sea photographed away from the sun is orange water with nothing in
    // frame to explain it, which is exactly the shot Aaron called broken.
    let sx = -(ctx.sunX ?? 0.39), sz = -(ctx.sunZ ?? 0.92);
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl; sz /= sl;
    const stn = c.clone().add(v(sx * d * Math.cos(PHI), d * Math.sin(PHI), sz * d * Math.cos(PHI)));
    // raising the look point by `u` metres at range `dist` moves the scene down by u/(dist·tan)
    // NDC, so this is "put the fleet 0.16 of a frame below centre" written as arithmetic — and
    // what comes down into the top of the frame in its place is the horizon and the sun
    const look = c.clone().add(v(0, 0.11 * d * tan, 0));
    const w = win();

    rig.on(() => rig.freeLook(false));
    rig.fov(50, 600);
    rig.exposure(CINE.exposure.interior, CINE.exposure.exterior, 760, CINE.exposure.lagMs);
    rig.drift(0.1, 0.28, 0.18);
    rig.move(atTable(), atWindow(), tableLook(), w.clone().add(v(0.2, -0.4, 30)), 620, EASE.inCubic);
    yield { until: 620 };

    // climb away from the glass on a curve — a straight lerp from the sill to a station 400 m up
    // reads as a lift, not as a camera leaving a ship. The exit waypoint is always forward through
    // the glass whichever side of the fleet the station ends up on.
    const exit = w.clone().add(v(0, 8, 70));
    rig.fov(fov, 1500);
    rig.drift(0.24, 0.5, 0.15);
    rig.path([
      atWindow(),
      exit,
      exit.clone().lerp(stn, 0.45).add(v(0, 0.14 * d, 0)),
      stn.clone().lerp(c, 0.06),
    ], 1500, { ease: EASE.inOut, look: [w.clone().add(v(0.2, -0.4, 30)), look.clone().add(v(0, 30, 0)), look] });
    yield { until: 1500 };

    // the escorts get under way here, and the camera keeps closing a little so the formation is
    // still settling into a frame that is still moving
    if (ctx.start) rig.on(ctx.start);
    rig.drift(0.5, 0.6, 0.09);
    rig.move(stn.clone().lerp(c, 0.06), stn.clone().lerp(c, -0.04), look, look, hold, EASE.linear);
    yield { until: hold };

    rig.exposure(CINE.exposure.exterior, CINE.exposure.interior, 1100, CINE.exposure.lagMs);
    rig.fov(48, 1300);
    rig.drift(0.14, 0.3, 0.16);
    const back = outNear();
    rig.path([
      stn.clone().lerp(c, -0.04),
      stn.clone().lerp(back, 0.5).add(v(0, 0.10 * d, 0)),
      back,
    ], 1300, { ease: EASE.inOut, look: [look, win().add(v(0, -1, 30))] });
    yield { until: 1300 };

    rig.move(back, atTable(), win().add(v(0, -1, 30)), tableLook(), 820, EASE.settle);
    rig.drift(0.05, 0.14, 0.13);
    rig.on(() => rig.freeLook(true));
    yield { until: 820 };
  });

  registerShotSequences(director, world);

  // Everything C7 needs, published onto the hook main.js already built. A microtask, because
  // main.js assigns hook.cine AFTER it calls registerSequences and that file is frozen.
  const presenter = buildPresenter(director, world);
  Promise.resolve().then(() => {
    Object.assign(W().cine, presenter, { SEQUENCE_IDS });
    // main.js builds the caption after this call and does not pump it, so the follow-the-shell
    // update joins the system list here rather than in a file C6 does not own.
    W().app.add({ update: () => W().cine.caption?.update(W().app.camera) });
  });
  return presenter;
}

const _lerp = (a, b, t) => a.clone().lerp(b, t);

// ── the turn presenter — the seam C7 builds against ─────────────────────────────────────────
//
// C7 hands it the redacted event list a single fire() returned and the world positions come out of
// C3's fleet. Nothing here touches the sim: it reads events, it does not ask questions.

function buildPresenter(director, world) {
  const fleet = world.fleet;

  const cellPos = (side, r, c) => {
    const p = fleet.cellToWorld?.(side, r, c);
    return p ? p.clone() : new THREE.Vector3(0, 0, side ? 900 : -900);
  };

  // The ship that fires, trained onto the target, and the ONE anchor both the camera and the flash
  // come from. Pass 1 looked a TARGET ship's id up in the FIRING side's list and separately asked
  // for `gunFor(side, null)`, so the two could — and did — disagree.
  //
  // A turret's bore is local +X and the hull carries its own heading, so the training angle is
  // atan2(−dz, dx) less the hull's rotation.y.
  const gunner = (side, at) => {
    const ship = fleet.firingShip?.(side) ?? null;
    const anchor = ship?.handle.gunAnchors[0] ?? fleet.gunFor?.(side, null) ?? null;
    if (ship && at) {
      const o = ship.handle.object3D;
      const p = o.getWorldPosition(new THREE.Vector3());
      const face = Math.atan2(p.z - at.z, at.x - p.x) - o.rotation.y;
      ship.handle.trainGuns(Math.max(-2.4, Math.min(2.4, wrap(face))));
    }
    const pos = anchor
      ? anchor.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(0, 22, side ? FLEET_FALLBACK : -FLEET_FALLBACK);
    return { ship, anchor, pos };
  };

  const api = {
    // Play one resolved shot, start to finish. `events` is exactly what sim.fire() returned.
    async present(events, { mySide = 0, turn = 1, caption = null, pace = null } = {}) {
      const vfx = vfxOf();
      director.setPace(pace || director.paceForTurn(turn));
      const mode = director.pace;
      const shot = events.find(e => e.t === 'shot');
      if (!shot) return;

      const mine = shot.side === mySide;
      const results = events.filter(e => e.t === 'result');
      const sunkIds = events.filter(e => e.t === 'sunk');
      const first = results[0] || { r: shot.anchor.r, c: shot.anchor.c, hit: false };
      const target = cellPos(shot.at, first.r, first.c);
      const { ship: firer, anchor, pos: gun } = gunner(shot.side, target);
      const size = ORD_SIZE[shot.kind] ?? 1;

      if (mode === 'instant') {
        api.resolve(events, { mySide, size });
        await wait(PACE.instant.ms);
        return;
      }

      if (mine) {
        await director.play('fire_out', {
          gun, aim: target, size,
          len: firer?.handle.length ?? 90,
          flash: anchor ? () => { firer?.handle.fireGun(0); vfx.muzzle(anchor, size); } : null,
        });
      } else {
        await director.play('enemy_volley', {
          own: cellPos(mySide, first.r, first.c).setY(14), foe: gun, at: target, size,
        });
      }

      const ms = CINE.shellMs[mode] ?? CINE.shellMs.full;
      const round = vfx.tracer(gun.clone(), target.clone(), ms, { size, seed: (turn * 7919) & 0xffff, sea: true });
      caption?.forShot(turn, shot.kind);
      caption?.follow(() => round.head());
      await director.play('shell_chase', { round, size, from: gun, to: target });
      caption?.unfollow();

      api.resolve(events, { mySide, size });
      const hit = results.some(r => r.hit);
      await director.play(hit ? 'impact_hit' : 'impact_miss', { at: target, size });

      if (sunkIds.length) await wait(500);
      if (mine) await director.play('bridge_return', {});
    },

    // The world-side consequences of a shot: splashes, hits, fires, the red indicator on your own
    // hull. Split out so `instant` pace and a replay can reuse it without any camera work.
    resolve(events, { mySide = 0, size = 1 } = {}) {
      const vfx = vfxOf();
      const table = tableOf();
      for (const e of events) {
        if (e.t === 'result') {
          if (e.repeat) continue;                     // no new column on an already-resolved cell
          const p = cellPos(e.at, e.r, e.c);
          if (e.hit) {
            const s = fleet.shipAt?.(e.at, e.r, e.c);
            const at = s?.ship?.hullSide ? s.ship.hullSide(s.t, 1) : p;
            vfx.hit(at, { size, seconds: 6 });
            if (e.at === mySide) fleet.mark?.(e.at, e.r, e.c, 'hit');   // the red indicator
          } else {
            vfx.splash(p, { size, seed: (e.r * 131 + e.c * 17) & 0xffff });
          }
          table?.pulse?.(e.r, e.c, e.hit ? 'hit' : 'miss');
        }
        if (e.t === 'sunk') {
          const s = fleet.shipAt?.(e.at, e.cells[0].r, e.cells[0].c);
          if (s?.ship) vfx.fire(s.ship.object3D, s.ship.object3D.worldToLocal(s.ship.hullPoint(s.t)), { seconds: 0, size: 9 });
          for (const c of e.cells) table?.pulse?.(c.r, c.c, 'sunk');
        }
      }
    },

    // Hold-anywhere fast-forward, and the settle the loop returns to.
    fastForward(on) { director.setRate(on ? PACE.fastForward : 1); },
    skip() { director.skip(); },
    toBridge() { return director.play('bridge_settle', {}); },
    opening() { return director.play('open_flyover', {}); },
  };

  return api;
}

const ORD_SIZE = { shell: 1, heavy: 4, salvo: 9 };
const FLEET_FALLBACK = 60;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const wait = ms => new Promise(r => setTimeout(r, ms));

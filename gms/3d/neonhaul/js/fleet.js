// §S2-I — the LIVE half of the company layer. `js/company.js` is the money; this is the flying.
//
// A hired driver is a `Courier` at the stick of a real `Flight`, working a real `Missions` board.
// That is the whole design and it is not decoration: **the earnings on the company screen are
// deliveries that happened**, made by the same class `?courier=1` drives and that S2-E measured
// against the analytic economy at an optimism ratio of 0.995. Nothing here computes income from a
// formula.
//
// ── WHAT A DRIVER SHARES WITH THE PLAYER, AND WHAT IT DOES NOT ─────────────
//
//   shared    the world (`zones`, `city`, `clients`), the physics (`Flight`), the pilot
//             (`Courier`), the payment formula (`economy.payout` via `missions.deliver`)
//   its own   an economy state (its own cell, hold, lifetime and licence tier), and its own
//             `Missions` instance
//
// The second half matters. `Missions.accept()` bumps the pad's board generation, so a driver
// sharing the player's instance would refresh the board under the player's fingers from three
// kilometres away — which is exactly the "never under the player's fingers" rule §7.4.5 exists to
// enforce. A `Missions` is a Map of pad records and a seed; one each is cheap.
//
// ── THE HONEST LIMITATION, STATED HERE RATHER THAN DISCOVERED LATER ────────
//
// `CityRenderer.aabbsNear()` reads `this.live`, which holds ONLY the chunks streamed around the
// camera. A driver working a pad three kilometres away therefore flies through a world with **no
// collision geometry in it** — `aabbsNear` returns an empty list, not a wall. This is the same
// shape as the `solidAt()` trap in CLAUDE.md: absence of data is indistinguishable from open air.
//
// It is not hidden and it is not worked around, because both fixes are worse: streaming chunks for
// every driver would cost the whole frame budget, and a synthetic collision model would be a
// second physics nobody measures. What it means is that a driver's earning rate is an UPPER bound
// on what the same pilot would manage under the player's nose — so the wage table is solved
// against the rate drivers ACTUALLY achieve (`tools/sim_s2i.mjs`, and `gates_s2i` D1 measures the
// same quantity in the running game), never against the player's own.
//
// The player can watch: `main.js`'s driver view points the camera rig at a driver's flight model,
// which streams the city around them — and at that moment they are colliding like anybody else.

import { Flight } from './flight.js';
import { Courier } from './autopilot.js';
import { Missions } from './missions.js';
import { PlayerCraft, BODY_TINTS, TRIM_TINTS } from './craft.js';
import { VOLUME, KIND } from './zones.js';
import * as E from './economy.js';
import * as Company from './company.js';

// How close counts as arrived at a pad. §7.1's docking cylinder is 14 m; a driver is not asked to
// hit the deck, only to be in the volume and slow — the same standard `LanePilot` delivers the
// player to.
const DOCK_R = VOLUME.radius;
const DOCK_SPEED = 9;
// The player's own board read is 1.4 s (`tickCourier`). A grade's `dwell` multiplies it.
const BOARD_S = 1.4;
// Give up on a target the pilot is not closing on. Same watchdog `tickCourier` runs, same reason:
// a target that is not being approached is a wall, not a destination, and absorbing it silently
// is how a fleet quietly stops earning while the roster still says FLYING.
const STUCK_S = 34;
// Beyond this the driver is not drawn. It costs one instance in a field that is already being
// drawn, so the cap is about the instance budget, not about draw calls.
const DRAW_R = 1600;

let uid = 0;

export class FleetDriver {
  // `rec` is the plain record `company.js` owns and persists. This class never writes money onto
  // it directly — every credit goes through `company.creditDelivery` / `chargeDriver`, so the
  // ledger and the player's account can never disagree.
  constructor(rec, { zones, city, clients, seed, spawn, co = null }) {
    this.rec = rec;
    // §S2-J. WHICH charter this driver is on the books of. A group can hold three, each with its
    // own ledger, its own exposure and its own suspension, so the company can no longer be an argument
    // the whole fleet shares — the money has to follow the driver.
    this.co = co;
    this.zones = zones;
    this.missions = new Missions({ zones, city, clients, seed: (seed | 0) ^ (0x51 + (uid++ << 3)) });
    this.econ = E.newState({ craft: rec.craft, credits: 0 });
    this.econ.borrowed = true;              // the company leases it; it is nobody's asset
    this.flight = new Flight({ craft: rec.craft });
    this.courier = new Courier();
    // The grade's speed cap, and the ONLY place competence becomes a flight number.
    this.courier.speedCap = Company.gradeSpeed(rec.grade);
    this.craft = new PlayerCraft(rec.craft);
    // A seeded livery, so a fleet of four is four recognisable craft in the sky rather than four
    // copies of the player's hull. Same palettes traffic.js paints from.
    const h = hashStr(rec.id);
    this.craft.pose.tint = BODY_TINTS[h % BODY_TINTS.length];
    this.craft.pose.trim = TRIM_TINTS[(h >>> 5) % TRIM_TINTS.length];
    this.craft.pose.edge = (h >>> 11) % 6;

    const p = spawn || { x: 0, y: 90, z: 0 };
    this.flight.reset(p.x, p.y + 8, p.z, (h % 628) / 100, -0.04);

    this.state = 'idle';                    // idle | fly | dock | tow
    this.pad = null;                        // the pad being flown to / sat on
    this.hold = 0;                          // seconds left of the board read
    this.age = 0; this.best = Infinity;     // the stuck watchdog
    this.towing = false;
    this.deliveries = 0;
    this.stucks = 0;
  }

  get id() { return this.rec.id; }

  // What the roster shows. It is read off the LIVE model rather than mirrored into the record,
  // so a status line can never be stale in the way a copied field can.
  status() {
    const t = this.missions.task(this.econ, this._now || 0);
    return {
      state: this.state,
      leg: this.courier.leg,
      dist: Math.round(this.courier.dist),
      pad: this.pad ? (this.pad.name || this.pad.key) : null,
      held: this.econ.cargo.length,
      slots: E.cargoSlots(this.econ),
      cell: +E.cellFrac(this.econ).toFixed(3),
      tier: this.econ.tier,
      dest: t ? t.name : null,
      towing: this.towing,
      x: +this.flight.px.toFixed(1), y: +this.flight.py.toFixed(1), z: +this.flight.pz.toFixed(1),
      speed: +this.flight.speed.toFixed(1),
      escapes: this.courier.escapes, stucks: this.stucks, deliveries: this.deliveries,
      offBook: !!this.rec.offBook, charter: this.co ? this.co.id : null,
    };
  }

  // One frame. `co`/`econ` are the company and the PLAYER's economy — every credit that moves,
  // moves between those two.
  tick(dt, now, world, co, econ) {
    this._now = now;
    const ds = this.econ;

    if (this.state === 'dock') {
      this.hold -= dt;
      if (this.hold <= 0) this._leavePad(now, co, econ);
      // A docked driver still costs a lease and still burns nothing. The pose is frozen on the pad.
      this.flight.speed = 0; this.flight.hspeed = 0;
      this.flight.vx = this.flight.vy = this.flight.vz = 0;
      return;
    }

    if (!this.pad) this._pickTarget(now);

    const inp = this.courier.read(now, this.flight, dt);
    this.flight.update(dt, inp, world);

    // The cell. Same curve the player burns, so a driver in a `nocturne` is genuinely cheaper to
    // run and the earnings screen's FUEL line means something.
    const r = E.tickCell(ds, dt, { speed: this.flight.speed, boosting: false });
    if (r === 'flat' && !this.towing) this._startTow();

    // Arrival.
    if (this.pad) {
      const d = Math.hypot(this.pad.x - this.flight.px, this.pad.z - this.flight.pz);
      const dy = Math.abs(this.pad.y - this.flight.py);
      if (d < DOCK_R && dy < DOCK_R * 1.6 && this.flight.speed < DOCK_SPEED) {
        this._reachPad(now);
        return;
      }
      // The watchdog. Progress, not speed — §S2-F's lesson: the tangential slide assist converts a
      // blocked forward command into sideways travel, so a craft can be moving the whole time and
      // getting no closer.
      const d3 = Math.hypot(d, this.pad.y - this.flight.py);
      if (d3 < this.best - 6) { this.best = d3; this.age = 0; } else this.age += dt;
      if (this.age > STUCK_S) { this.stucks++; this._abandon(now); }
    }
  }

  _startTow() {
    this.towing = true;
    this.flight.maxFwd = E.CELL.TOW_SPEED;
    const near = this.zones.nearestCharge(this.flight.px, this.flight.pz);
    this._target(near ? near.pad : this.pad);
  }

  _abandon(now) {
    this.pad = null;
    this.courier.setTarget(null);
    this.age = 0; this.best = Infinity;
    this._pickTarget(now);
  }

  _target(pad) {
    this.pad = pad || null;
    this.age = 0; this.best = Infinity;
    this.courier.setTarget(pad ? { x: pad.x, y: pad.y, z: pad.z } : null);
    this.state = pad ? 'fly' : 'idle';
  }

  _reachPad(now) {
    this.state = 'dock';
    this.hold = BOARD_S * Company.gradeOf(this.rec.grade).dwell;
    // Stop where it arrived. It does NOT snap onto the deck: the player can be watching this craft
    // through the driver feed, and a hull that teleports two metres sideways the instant it gets
    // inside the docking volume is the one artefact the feed would make obvious. It is already
    // inside §7.1's 14 m cylinder — that is what "arrived" means here — so hovering there for the
    // board read is both correct and what the player's own LanePilot does.
    this.flight.vx = this.flight.vy = this.flight.vz = 0;
    this.flight.speed = 0; this.flight.hspeed = 0;
    this._arrivedAt = now;
  }

  // Everything that happens on the deck, in the order a courier would do it. Called once, when the
  // board read finishes — never per frame, so a driver cannot double-deliver.
  _leavePad(now, co, econ) {
    const ds = this.econ, pad = this.pad;
    if (!pad) { this.state = 'idle'; return; }

    // 1. deliver
    const res = this.missions.deliver(pad, ds, now);
    if (res.ok) {
      // `missions.deliver` has already run `economy.earn` on the DRIVER's state, which is what
      // moves their own licence tier. The credits are then swept into the company, and the
      // driver's own balance goes back to zero — they are paid a wage, not a share.
      // §S2-J. `creditDelivery` is also where a RUN resolves — the multiplier, the exposure, the bust
      // roll and the fine. A run is a delivery and this is the delivery, so there is no second path
      // and no way for the two to disagree about what a driver earned.
      const out = Company.creditDelivery(co, econ, this.rec, res.credits, res.receipts.length, now);
      this.lastRun = out && out.offBook ? out : null;
      ds.credits = 0;
      this.deliveries += res.receipts.length;
    }

    // 2. the tow, if this is where it was heading
    if (this.towing && pad.charge) {
      E.tow(ds);
      this.towing = false;
      this.flight.maxFwd = E.maxFwd(ds);
    }

    // 3. charge. The COMPANY pays, which is why this is not `economy.buyCharge` — the driver has
    // no purse. A player who is broke buys their fleet a partial charge, and a fleet that runs
    // flat limps at 12 m/s and earns nothing. That is the arrears mechanic biting through a
    // second route, and it is deliberate.
    if (pad.charge && E.cellFrac(ds) < 0.55) {
      const room = E.cellMax(ds) - ds.cellUnits;
      const cost = E.chargeCost(room);
      const paid = Company.chargeDriver(co, econ, this.rec, cost);
      ds.cellUnits += cost > 0 ? room * (paid / cost) : room;
      ds.stats.spentFuel += paid;
    }

    // 4. take work. Every job on this board they can carry, nearest first — which is
    // `sim_p7a`'s `chain` policy and is what `tools/sim_s2i.mjs` measures.
    const jobs = this.missions.board(pad, ds, now).sort((a, b) => a.km - b.km);
    for (const j of jobs) {
      if (!this.missions.canAccept(j, ds).ok) continue;
      this.missions.accept(j, ds, now);
    }

    // 5. go somewhere
    this.pad = null;
    this._pickTarget(now);
  }

  // Where next. Charge beats cargo beats a fresh board, which is the order `tickCourier` uses for
  // the soak and for the same reason: a flat cell earns nothing at all.
  _pickTarget(now) {
    const ds = this.econ;
    if (this.towing || E.cellFrac(ds) < 0.2) {
      const c = this.zones.nearestCharge(this.flight.px, this.flight.pz);
      if (c) { this._target(c.pad); return; }
    }
    // The parcel closest to its limit, and its DESTINATION PAD — the whole pad record and not
    // `missions.task()`'s summary, because `missions.deliver()` matches on `pad.key` and `task()`
    // does not return one. A target without a key arrives at the right coordinates and delivers
    // nothing, which reads as a driver that flies beautifully and never earns.
    let best = null, bestLeft = Infinity;
    for (const c of ds.cargo) {
      const left = c.limit - (now - c.acceptedAt);
      if (left < bestLeft) { bestLeft = left; best = c; }
    }
    if (best && best.dest) { this._target(best.dest); return; }
    // An empty hold: the nearest pad that is not the one just left. `nearest` walks the same
    // memoised lattice `zonesNear` does.
    const skip = this._lastKey;
    const n = this.zones.nearest(this.flight.px, this.flight.pz,
      p => (p.kind === KIND.PAD || p.kind === KIND.HUB) && p.key !== skip);
    if (n) { this._lastKey = n.pad.key; this._target(n.pad); return; }
    this.state = 'idle';
  }

  // The instanced pose, or null when the driver is too far from the camera to be worth an
  // instance. Written into the SAME four fields the player and the traffic use, so the whole
  // fleet costs zero extra draw calls.
  pose(t, camera) {
    if (camera) {
      const d = Math.hypot(this.flight.px - camera.x, this.flight.pz - camera.z);
      if (d > DRAW_R) return null;
    }
    return this.craft.fromFlight(this.flight, t);
  }
}

// ───────────────────────────────────────────────────────────────────────────

export class Fleet {
  constructor({ zones, city, clients, seed = 0 }) {
    this.zones = zones; this.city = city; this.clients = clients; this.seed = seed | 0;
    this.live = [];                 // FleetDriver
    this.spawn = null;              // where a new hire appears — set by main.js to the player's pad
  }

  find(id) { return this.live.find(d => d.id === id) || null; }

  // Bring the live list into line with the company record. Called after any hire, release or quit,
  // and once on load — so a save with two drivers in it comes back with two craft in the sky.
  // `src` is a GROUP (`{ companies: [...] }`) or a single company — §S2-J made the first case the
  // shipping one and kept the second because `company.js` still hands out single companies and a
  // caller with one should not have to wrap it.
  sync(src) {
    const cos = src && Array.isArray(src.companies) ? src.companies : (src ? [src] : []);
    const want = new Map();
    for (const co of cos) for (const rec of co.drivers) want.set(rec.id, co);
    this.live = this.live.filter(d => {
      const co = want.get(d.id);
      if (!co) return false;
      d.co = co;                       // a charter can change hands only by re-hiring, but keep it live
      return true;
    });
    for (const [id, co] of want) {
      if (this.find(id)) continue;
      const rec = co.drivers.find(r => r.id === id);
      this.live.push(new FleetDriver(rec, {
        zones: this.zones, city: this.city, clients: this.clients, seed: this.seed,
        spawn: this.spawn, co,
      }));
    }
    return this.live.length;
  }

  // One frame for the whole fleet. Wages first: a driver who cannot be paid walks BEFORE they fly
  // another metre, so the roster and the account agree on the same frame.
  // `src` is the GROUP. Wages first, per charter, for the same reason S2-I gave: a driver who
  // cannot be paid walks BEFORE they fly another metre, so the roster and the account agree on the
  // same frame. Each charter pays its own payroll out of the one account.
  tick(dt, now, world, src, econ) {
    if (!src || !econ || dt <= 0) return { quit: [], paid: 0, owed: 0 };
    const cos = Array.isArray(src.companies) ? src.companies : [src];
    const pay = { quit: [], paid: 0, owed: 0 };
    for (const co of cos) {
      const p = Company.payWages(co, econ, dt, now);
      pay.paid += p.paid; pay.owed += p.owed;
      for (const q of p.quit) pay.quit.push(q);
    }
    if (pay.quit.length) this.sync(src);
    for (const d of this.live) d.tick(dt, now, world, d.co || cos[0], econ);
    // Mirror the live status onto the persisted record, once per frame, so `company.driverLedger`
    // — which is pure and knows nothing about flight — can print what they are doing.
    for (const d of this.live) {
      const s = d.status();
      d.rec.status = s.state; d.rec.leg = s.leg; d.rec.dest = s.dest; d.rec.held = s.held;
    }
    return pay;
  }

  poses(t, camera) {
    const out = [];
    for (const d of this.live) {
      const p = d.pose(t, camera);
      if (p) out.push(p);
    }
    return out;
  }

  statuses() {
    const out = {};
    for (const d of this.live) out[d.id] = d.status();
    return out;
  }
}

// A stable small hash of a driver id, for the livery. Not a general-purpose hash and not exported.
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

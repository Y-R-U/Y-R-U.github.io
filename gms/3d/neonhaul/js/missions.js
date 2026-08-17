// §7.4.5 / §7.4.6 — the job board, a job's derivation, and the accept -> carry -> deliver loop.
//
// PURE. No three.js, no DOM, no wall clock: every entry point takes a sim time in SECONDS. The
// whole file is a state machine over plain objects so `tools/sim_p7a.mjs` can run a thousand
// careers through it headlessly, which is the only honest way to balance an economy.
//
// There is NO FAIL STATE anywhere in this file (§7.4.10, DECISIONS decision 6). Running past a
// job's limit costs the time bonus and nothing else — no impound, no penalty, no expiry, no
// pursuit. A parcel you are carrying can never be taken away from you.

import { hash2i, hashf, clamp } from './utils.js';
import { KIND } from './zones.js';
import * as E from './economy.js';

// ── parcels ────────────────────────────────────────────────────────────────
// The licence ladder (§7.4.4) unlocks parcel TYPES; the items inside a type are flavour plus a
// slot cost. Every cost is 1 or 2 so that no job can ever appear that the 2-slot starter `wisp`
// physically cannot carry — a board full of uncarriable jobs is the "nothing to do" state §7.4.0
// target 4 forbids, and it is the thing the sim harness measures as `idleRate`.
export const PARCELS = {
  standard:  { icon: '⬡', items: [['DOCUMENT TUBE', 1], ['COLD BOX', 1], ['SEALED CRATE', 2]] },
  bulk:      { icon: '⬢', items: [['PALLET SLEEVE', 2], ['DRUM CANISTER', 2]] },
  rush:      { icon: '⚡', items: [['RUSH POUCH', 1], ['PRIORITY SLEEVE', 1]] },
  fragile:   { icon: '◈', items: [['GLASSWARE CASE', 1], ['MEDICAL COOLER', 2]] },
  contested: { icon: '⬒', items: [['DISPUTED LOT', 2], ['SEALED PALLET', 2]] },
  blackbox:  { icon: '▣', items: [['BLACK BOX', 1], ['UNMARKED CASE', 1]] },
};

export const BOARD = {
  HUB_SLOTS: 3,
  PAD_SLOTS: 2,
  REFRESH: 90,              // §7.4.5's timer, seconds
  BAND_MIN: 0.6,            // km
  BAND_MAX_T1: 2.4,
  // §7.4.5: "widening by ~0.8 km per tier to 0.6-6.0 km at tier 6". 2.4 + 5 x 0.8 is 6.4, not the
  // 6.0 the same sentence states, so the per-tier step is 0.72 and the endpoint is exact.
  BAND_STEP: 0.72,
  WIDEN: [1, 1.7, 3.0],     // fallback multipliers when the band holds no eligible pad
  // At a rush-flagged pad, from tier 3. 12 % of courier pads carry the flag (zones.js) so the
  // board-level rate is 0.12 x this; at 0.34 it was 4 % of boards, which is too rare for the red
  // pad marker to mean anything. 0.75 puts a RUSH job on ~9 % of tier-3 boards. MEASURED by
  // gates_p7a T13, not guessed.
  RUSH_CHANCE: 0.75,
  HAGGLE_P: 0.55,           // §7.3
  HAGGLE_GAIN: 0.15,
  HAGGLE_COOLDOWN: 300,
  REDOCK_GRACE: 1.2,        // §7.2
  SCRIPT_NEAR: 500,         // the scripted second job's pickup radius (see makeBoard)
};

const JOB_SALT = 0x36b1;
const chunkKey = (cx, cz) => (Math.imul(cx | 0, 73856093) ^ Math.imul(cz | 0, 19349663)) | 0;

export function bandFor(tier) {
  return [BOARD.BAND_MIN, BOARD.BAND_MAX_T1 + (clamp(tier, 1, 6) - 1) * BOARD.BAND_STEP];
}

// ── one job ────────────────────────────────────────────────────────────────
// Derived from hash2i(padChunk, slot+gen, seed) exactly as §7.4.5 requires, so DECLINING AND
// RE-DOCKING SHOWS THE SAME BOARD — declining is a choice, not a reroll. `gen` only advances when
// a job is taken from the pad or when the 90 s timer fires, and never while the player is looking
// at the board (Board.lock).
export function makeJob({ zones, city, clients, pad, slot, gen, tier, seed, force = null }) {
  const h = hash2i(chunkKey(pad.cx, pad.cz), slot * 977 + gen * 31 + JOB_SALT, seed);
  const u = k => ((hash2i(h ^ (k * 2654435761), slot + gen, seed) >>> 8) / 16777216);

  const rush = !!(force && force.rush) || (!force && pad.rush && tier >= 3 && slot === 0 && u(1) < BOARD.RUSH_CHANCE);

  // parcel — a type the licence allows, then an item inside it
  const types = force && force.parcel ? [force.parcel]
    : rush && tier >= 3 ? ['rush']
      : E.unlockedParcels(tier);
  const type = types[Math.floor(u(2) * types.length) % types.length];
  let items = PARCELS[type].items;
  if (force && force.maxSlots) {
    const fit = items.filter(it => it[1] <= force.maxSlots);
    if (fit.length) items = fit;
  }
  const item = items[Math.floor(u(3) * items.length) % items.length];

  // Destination — a real generated pad inside the tier's band, in a district the licence covers
  // (§7.4.5). Picked through `pickPadInBand`, which filters on chunk coordinates and materialises
  // only what it has to; the exhaustive `padsInBand` would generate the whole annulus.
  const allowed = new Set(E.unlockedDistricts(tier));
  const band = force && force.band ? force.band : bandFor(tier);
  let dest = null, probes = 0;
  for (const w of BOARD.WIDEN) {
    const r = zones.pickPadInBand(pad.x, pad.z, band[0], band[1] * w, {
      districtOk: d => allowed.has(d.id),
      filter: p => p.kind === KIND.PAD && p.key !== pad.key,
      salt: h ^ 0x2b7d,
    });
    probes += r.probes;
    if (r.pad) { dest = r.pad; break; }
  }
  if (!dest) return null;                        // measured as `unreachable` by the harness

  const km = Math.hypot(dest.x - pad.x, dest.z - pad.z) / 1000;
  const risk = E.riskOf({ dropDistrictTier: dest.tier, parcelType: type, dropY: dest.y });
  const base = E.jobBase(km, risk);
  const limit = E.timeLimit(km, rush);
  // ── who is posting this job ───────────────────────────────────────────────
  // §7.1 assigns ONE client to a pad, and taken literally that is what shipped: every slot on a
  // board read "Auditor Kell · Pale Terrace Underwriters" with the identical quote under it. It is
  // as specified and it reads as a broken repeat, on the first screen of the game.
  //
  // The rule §7.1 is actually protecting is that the PAD's client is derived from the world seed
  // and never stored, so it survives a reload like the buildings do. That is kept exactly: SLOT 0
  // is still `clients[hash2i(cx, cz, CLIENT_SALT) % clients.length]`, the pad's own operator. The
  // other slots are other people posting from the same pad, offset around the list by a hash of
  // (pad, gen) plus the slot — so the offsets are DISTINCT BY CONSTRUCTION and a three-slot HUB
  // board can never show one client twice, which a per-slot random offset would do about 7 % of
  // the time with sixteen clients.
  //
  // Varying the CLIENT rather than the LINE was the choice: `clients.json` gives each client
  // exactly one line, so varying the line would mean writing new copy that no longer belongs to
  // the face beside it — and the panel (§7.3) shows a portrait, a faction and a reliability score,
  // none of which vary if the client does not. One repeated person is the thing that reads wrong,
  // not one repeated sentence.
  let client = null;
  if (clients.length) {
    const own = clients.findIndex(c => c.id === pad.clientId);
    const base = own < 0 ? 0 : own;
    if (slot === 0 || clients.length < 2) client = clients[base];
    else {
      const k = Math.abs(hash2i(chunkKey(pad.cx, pad.cz), gen * 7919 + 0xc11e, seed));
      const off = 1 + ((k + slot - 1) % (clients.length - 1));
      client = clients[(base + off) % clients.length];
    }
  }

  return {
    id: pad.key + '#' + slot + '@' + gen,
    padKey: pad.key, pad: { key: pad.key, name: pad.name, x: pad.x, y: pad.y, z: pad.z },
    slot, gen, rush,
    clientId: client ? client.id : null,
    client: client ? { id: client.id, name: client.name, faction: client.faction, line: client.line, tint: client.tint_hex } : null,
    parcel: { type, name: item[0], slots: item[1], icon: PARCELS[type].icon },
    dest: {
      key: dest.key, name: dest.name, district: dest.district, districtName: dest.districtName,
      x: dest.x, y: dest.y, z: dest.z, tier: dest.tier,
    },
    km: +km.toFixed(3), risk, riskLabel: E.riskLabel(risk), probes,
    base, limit,
    // What §7.3's panel prints in the bonus rows. `maxTime` is the +45 % it saturates at and
    // `saturateAt` is the 65 %-of-limit clock the mock shows as "under 2:10".
    bonus: { maxTime: E.PAY.TIME_MAX, saturateAt: Math.round(limit * (1 - E.PAY.TIME_SPAN)), chain: E.PAY.CHAIN },
    rushMul: rush ? E.PAY.RUSH_MUL : 1,
    haggled: false, haggleGain: 0,
  };
}

// ── the board ──────────────────────────────────────────────────────────────

export class Missions {
  constructor({ zones, city, clients, seed }) {
    this.zones = zones;
    this.city = city;
    this.clients = clients || [];
    this.seed = seed | 0;
    this._pads = new Map();          // padKey -> { gen, refreshed }
    this._locked = null;             // the pad whose board the player is looking at (§7.4.5)
    this._haggled = new Set();       // clientId, once per session (§7.3)
    this._cool = new Map();          // clientId -> sim time the cooldown ends
    this.lastDrop = null;            // for the scripted second job
    this.unreachable = 0;            // slots that could not resolve a destination — measured, not hidden
    this.slotsAsked = 0;
    this.active = [];                // mirrors state.cargo, held for the HUD marker
  }

  _rec(key, time) {
    let r = this._pads.get(key);
    if (!r) this._pads.set(key, r = { gen: 0, refreshed: time });
    return r;
  }

  lock(key) { this._locked = key || null; }

  // §7.4.5's refresh: on a 90 s timer, and never under the player's fingers.
  _maybeRefresh(pad, time) {
    const r = this._rec(pad.key, time);
    if (this._locked === pad.key) return r;
    if (time - r.refreshed >= BOARD.REFRESH) { r.gen++; r.refreshed = time; }
    return r;
  }

  slotsFor(pad) { return pad.kind === KIND.HUB ? BOARD.HUB_SLOTS : BOARD.PAD_SLOTS; }

  // The board at a pad. CHARGE and WORKSHOP pads carry no jobs — they are services (§7.1).
  board(pad, state, time) {
    if (!pad || pad.kind === KIND.CHARGE || pad.kind === KIND.WORKSHOP) return [];
    const r = this._maybeRefresh(pad, time);
    const n = this.slotsFor(pad);
    const out = [];
    let rushUsed = false;

    // §7.4.9's first-playthrough shape. Two scripted jobs, and both are 1-slot on purpose: the
    // chain bonus is what job 2 exists to teach, and a `wisp` has two slots, so a 2-slot crate in
    // either of them would make the tutorial's own lesson impossible to perform.
    //   job 1 — at the HUB, 0.6-0.9 km, so the first payment lands inside 90 s
    //   job 2 — at any pad near the first drop, so it can be picked up while job 1's parcel is
    //           still held. §7.4.9 says "200 m from the first job's drop"; a pad at exactly 200 m
    //           cannot be guaranteed, because §3.1.1 forbids moving a rejected placement, so the
    //           script takes the nearest pad inside SCRIPT_NEAR instead.
    let force = null;
    if (state.stats.delivered === 0 && state.stats.jobs === 0 && pad.kind === KIND.HUB) {
      force = { band: [0.6, 0.9], parcel: 'standard', maxSlots: 1 };
    } else if (state.stats.delivered === 1 && this.lastDrop
      && Math.hypot(pad.x - this.lastDrop.x, pad.z - this.lastDrop.z) <= BOARD.SCRIPT_NEAR) {
      force = { band: [0.6, 1.4], parcel: 'standard', maxSlots: 1 };
    }

    for (let slot = 0; slot < n; slot++) {
      this.slotsAsked++;
      const job = makeJob({
        zones: this.zones, city: this.city, clients: this.clients,
        pad, slot, gen: r.gen, tier: state.tier, seed: this.seed,
        force: slot === 0 ? force : null,
      });
      if (!job) { this.unreachable++; continue; }
      if (job.rush) {
        if (rushUsed) { job.rush = false; job.rushMul = 1; job.limit = E.timeLimit(job.km, false); }
        else rushUsed = true;                     // §7.4.5 — at most one RUSH on a board
      }
      out.push(job);
    }
    return out;
  }

  // ── accept ───────────────────────────────────────────────────────────────
  canAccept(job, state) {
    if (!job) return { ok: false, why: 'nojob' };
    const free = E.cargoSlots(state) - E.occupiedSlots(state);
    if (job.parcel.slots > free) return { ok: false, why: 'slots', need: job.parcel.slots, free };
    if (!E.unlockedParcels(state.tier).includes(job.parcel.type)) return { ok: false, why: 'licence' };
    const cd = this._cool.get(job.clientId);
    if (cd !== undefined && cd > (this._now || 0)) return { ok: false, why: 'cooldown', until: cd };
    return { ok: true };
  }

  accept(job, state, time) {
    this._now = time;
    const chk = this.canAccept(job, state);
    if (!chk.ok) return chk;
    const pay = job.base + Math.round(job.base * job.haggleGain);
    state.cargo.push({
      jobId: job.id, clientId: job.clientId, client: job.client,
      parcel: job.parcel, slots: job.parcel.slots,
      destKey: job.dest.key, dest: job.dest,
      base: pay, limit: job.limit, rush: job.rush, km: job.km,
      risk: job.risk, riskLabel: job.riskLabel,
      acceptedAt: time,
    });
    state.stats.jobs++;
    const r = this._rec(job.padKey, time);
    r.gen++; r.refreshed = time;                  // §7.4.5 — refreshed when one is taken
    this.active = state.cargo;
    return { ok: true, job };
  }

  // ── deliver ──────────────────────────────────────────────────────────────
  // Every parcel whose destination is this pad is delivered at once. `othersHeld` is evaluated
  // ONCE, before anything is removed, so two parcels dropping at the same pad each see the other
  // and each earn one chain step — the alternative (recomputing after each removal) would pay the
  // second parcel less for arriving on the same trip, which is the opposite of what §7.4.2's chain
  // bonus is for.
  deliver(pad, state, time) {
    const held = state.cargo;
    const due = held.filter(p => p.destKey === pad.key);
    if (!due.length) return { ok: false, why: 'nothing' };
    const othersHeld = held.length - 1;
    const receipts = [];
    let promoted = false;

    for (const p of due) {
      const elapsed = time - p.acceptedAt;
      const q = E.payout({ base: p.base, limit: p.limit, elapsed, othersHeld, rush: p.rush });
      const res = E.earn(state, q.credits);
      promoted = promoted || res.promoted;
      state.stats.delivered++;
      receipts.push({
        jobId: p.jobId, client: p.client, parcel: p.parcel, credits: q.credits,
        base: p.base, elapsed: +elapsed.toFixed(1), limit: p.limit,
        timeBonus: +q.timeBonus.toFixed(4), chainBonus: +q.chainBonus.toFixed(4),
        rushMul: q.rushMul, othersHeld, overdue: elapsed > p.limit,
        km: p.km, risk: p.risk,
      });
    }
    state.cargo = held.filter(p => p.destKey !== pad.key);
    this.active = state.cargo;
    this.lastDrop = { key: pad.key, x: pad.x, y: pad.y, z: pad.z };
    return {
      ok: true, receipts, promoted, tier: state.tier,
      credits: receipts.reduce((s, r) => s + r.credits, 0),
    };
  }

  // ── §7.3's HAGGLE ────────────────────────────────────────────────────────
  // Once per client per session. The outcome is HASHED from the job id rather than drawn from
  // Math.random, so it cannot be rerolled by re-docking and the sim harness is reproducible. 55 %
  // success -> +15 % payment; failure withdraws the job and cools the client for 5 minutes.
  haggle(job, state, time) {
    this._now = time;
    if (!job || !job.clientId) return { ok: false, why: 'nojob' };
    if (this._haggled.has(job.clientId)) return { ok: false, why: 'used' };
    this._haggled.add(job.clientId);
    state.stats.haggles++;
    const win = hashf(chunkKey(job.pad.x | 0, job.pad.z | 0), job.slot * 31 + job.gen, this.seed ^ 0x4a91) < BOARD.HAGGLE_P;
    if (win) {
      job.haggled = true;
      job.haggleGain = BOARD.HAGGLE_GAIN;
      return { ok: true, win: true, gain: BOARD.HAGGLE_GAIN, base: job.base + Math.round(job.base * BOARD.HAGGLE_GAIN) };
    }
    this._cool.set(job.clientId, time + BOARD.HAGGLE_COOLDOWN);
    const r = this._rec(job.padKey, time);
    r.gen++; r.refreshed = time;                  // the job is withdrawn
    return { ok: true, win: false, cooldownUntil: time + BOARD.HAGGLE_COOLDOWN };
  }

  // ── what the HUD reads ───────────────────────────────────────────────────
  // The active parcel the world marker and the dash task line point at: the one closest to its
  // limit, because that is the one the player needs to be told about.
  task(state, time) {
    if (!state.cargo.length) return null;
    let best = null, bestLeft = Infinity;
    for (const p of state.cargo) {
      const left = p.limit - (time - p.acceptedAt);
      if (left < bestLeft) { bestLeft = left; best = p; }
    }
    return {
      name: best.dest.name, district: best.dest.districtName,
      x: best.dest.x, y: best.dest.y, z: best.dest.z,
      timeLeft: +bestLeft.toFixed(1), limit: best.limit,
      overdue: bestLeft < 0, parcel: best.parcel, client: best.client,
      // §8.2's task line prints the distance and §8.3's holo panel prints the fee. Both are on the
      // cargo record already; returning them here is what stops main.js reaching into state.cargo
      // to rebuild a job the mission layer already knows about.
      base: best.base, km: best.km, rush: !!best.rush,
      held: state.cargo.length,
    };
  }

  destKeys(state) { return new Set(state.cargo.map(p => p.destKey)); }

  stats() {
    return {
      unreachable: this.unreachable, slotsAsked: this.slotsAsked,
      unreachableRate: this.slotsAsked ? this.unreachable / this.slotsAsked : 0,
      pads: this._pads.size, haggles: this._haggled.size,
    };
  }
}

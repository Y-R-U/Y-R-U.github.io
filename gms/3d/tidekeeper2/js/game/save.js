/* localStorage, versioned. A save that cannot be read is thrown away rather
   than half-applied, because a half-applied save is a bug you cannot see. */

const KEY = 'tidekeeper2.save.v1';

export const blank = () => ({
  v: 1,
  money: 0, renown: 0,
  caps: [], goals: [], shelf: [], kept: {}, lore: [], rels: [],
  stats: { earned: 0, feeds: 0, births: 0, trips: 0, renownEver: 0, days: 0, visitors: 0, losses: 0, fishEver: 0 },
  tanks: null,
  settings: { vol: 0.6, look: 0 },
  lastSeen: Date.now(),
  seenIntro: false,
});

export const Save = {
  data: blank(),
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === 1) this.data = Object.assign(blank(), raw);
    } catch (e) { this.data = blank(); }
    return this.data;
  },
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {} },
  wipe() { try { localStorage.removeItem(KEY); } catch (e) {} this.data = blank(); },
};

/* ── serialising a running tank ──────────────────────────────────────────── */
export function packTank(T) {
  return {
    uid: T.uid, tankId: T.tankId, water: T.water, name: T.name, substrate: T.substrate,
    temp: T.temp, target: T.target, ph: T.ph, o2: T.o2, nh3: T.nh3, no2: T.no2, no3: T.no3,
    bactA: T.bactA, bactN: T.bactN, processed: T.processed, organics: T.organics,
    detritus: T.detritus, algae: T.algae, day: T.day, hour: T.hour, ageDays: T.ageDays,
    gear: [...T.gear], flowUser: T.flowUser, autoFeed: T.autoFeed, lastWaterChange: T.lastWaterChange,
    plants: T.plants.map(p => ({ id: p.id, health: p.health })),
    decor: T.decor.map(d => ({ id: d.id, health: d.health ?? 1 })),
    fish: T.fish.filter(f => f.alive).map(f => ({
      spId: f.spId, len: f.len, ageDays: f.ageDays, health: f.health, hunger: f.hunger,
      sick: f.sick, finDamage: f.finDamage, tint: f.tint, zoneBias: f.zoneBias, speedMul: f.speedMul,
    })),
  };
}

// Rotating special ops (sim events.js). day-of-week: 0 = Sunday. No energy (D10): unlimited runs,
// rewards diminish after a few clears per tier per day so events stay a supplement, not a farm.
import { buildSquad, squadPower } from './maps.js';

const LV = [10, 20, 30, 40, 50, 60];
const SIZE = [3, 4, 5, 6, 6, 6];
const DIM = [1, 1, 1, 0.5, 0.5, 0.25];
function tiers(rosters, rewardFn) {
  return LV.map((lv, i) => {
    const defs = rosters[i % rosters.length].slice(0, SIZE[i]);
    const waves = [buildSquad(defs, lv, i >= 3 ? 1 : 0), buildSquad(defs.slice().reverse(), lv, i >= 3 ? 1 : 0)].slice(0, i < 2 ? 1 : 2);
    return { id: `t${i + 1}`, name: `Tier ${i + 1}`, level: lv, power: Math.round(Math.max(...waves.map(squadPower)) * 1.05), waves, rewards: rewardFn(i, lv) };
  });
}
const R = {
  corporate: [['warden', 'gunner', 'patch', 'bulwark', 'lancer', 'aegis'], ['bulwark', 'meridian', 'arbiter', 'citadel', 'lancer', 'aegis']],
  rogue: [['scrapper', 'rattler', 'sparkplug', 'riot', 'barb', 'jammer'], ['riot', 'tarantula', 'pyre', 'juggernaut', 'barb', 'jammer']],
  experimental: [['husk', 'needle', 'wisp', 'phase', 'prism', 'oracle'], ['phase', 'specter', 'halo', 'monolith', 'prism', 'oracle']],
  mixed: [['scrapper', 'gunner', 'wisp', 'riot', 'lancer', 'jammer'], ['bulwark', 'barb', 'oracle', 'phase', 'tarantula', 'halo']],
};

export const EVENTS = {
  salvage_run: { id: 'salvage_run', name: 'Salvage Run', kind: 'daily', unlock: 'daily_ops', rotation: { everyDays: 1 }, diminish: DIM,
    desc: 'Strip a wrecked convoy before the scavengers do. Big scrap.',
    tiers: tiers(R.mixed, (i, lv) => ({ scrap: [900, 2200, 4800, 8500, 14000, 21000][i], credits: 100 + lv * 10 })) },
  vault_job: { id: 'vault_job', name: 'Vault Job', kind: 'daily', unlock: 'daily_ops', rotation: { days: [0, 1, 3, 5] }, diminish: DIM,
    desc: 'Crack a corp payroll vault. Big credits.',
    tiers: tiers([R.corporate[0], R.corporate[1]], (i) => ({ credits: [750, 2000, 4500, 8000, 13000, 20000][i] })) },
  sim_drills: { id: 'sim_drills', name: 'Sim Drills', kind: 'daily', unlock: 'daily_ops', rotation: { days: [0, 2, 4, 6] }, diminish: DIM,
    desc: 'League training simulators. Big unit XP.',
    tiers: tiers(R.mixed.slice().reverse(), (i, lv) => ({ xp: Math.round((30 + 10 * lv) * 2.5) })) },
  corporate_trial: { id: 'corporate_trial', name: 'Trial: Halvorsen Audit', kind: 'trial', faction: 'corporate', unlock: 'faction_trials', rotation: { days: [1, 4, 0] }, diminish: DIM,
    desc: 'Corporate-only enemy squads. Rewards event marks + chips.',
    tiers: tiers(R.corporate, (i) => ({ event_marks: [10, 15, 20, 30, 40, 50][i], chips: [3, 5, 8, 10, 12, 15][i], ...(i >= 0 ? { focusShards: 3 } : { shards: { [['warden', 'bulwark', 'lancer', 'aegis', 'meridian', 'citadel'][i]]: 2 } }) })) },
  rogue_trial: { id: 'rogue_trial', name: 'Trial: Ledger Pit', kind: 'trial', faction: 'rogue', unlock: 'faction_trials', rotation: { days: [2, 5, 0] }, diminish: DIM,
    desc: 'Rogue-only enemy squads. Rewards event marks + chips.',
    tiers: tiers(R.rogue, (i) => ({ event_marks: [10, 15, 20, 30, 40, 50][i], chips: [3, 5, 8, 10, 12, 15][i], ...(i >= 0 ? { focusShards: 3 } : { shards: { [['scrapper', 'riot', 'barb', 'jammer', 'tarantula', 'juggernaut'][i]]: 2 } }) })) },
  experimental_trial: { id: 'experimental_trial', name: 'Trial: Lattice Echo', kind: 'trial', faction: 'experimental', unlock: 'faction_trials', rotation: { days: [3, 6, 0] }, diminish: DIM,
    desc: 'Experimental-only enemy squads. Rewards event marks + chips.',
    tiers: tiers(R.experimental, (i) => ({ event_marks: [10, 15, 20, 30, 40, 50][i], chips: [3, 5, 8, 10, 12, 15][i], ...(i >= 0 ? { focusShards: 3 } : { shards: { [['husk', 'phase', 'prism', 'oracle', 'halo', 'specter'][i]]: 2 } }) })) },
  weekly_raid: { id: 'weekly_raid', name: 'Raid: Dreadnought', kind: 'raid', unlock: 'weekly_raid', rotation: { weekly: true }, diminish: [1, 1, 1, 0.3],
    desc: 'A rogue siege platform. You won\'t kill it — rewards scale with damage dealt.',
    tiers: [20, 35, 50, 60].map((lv, i) => {
      const w = buildSquad(['raid_dreadnought', 'citadel', 'aegis'].slice(0, 1 + i), lv, 1);
      return { id: `t${i + 1}`, name: `Threat ${i + 1}`, level: lv, power: squadPower(w), waves: [w], rewards: {} };
    }),
    raid: { rewardsByDamage: [
      { damage: 5000, rewards: { scrap: 1500, credits: 1500 } },
      { damage: 20000, rewards: { scrap: 4000, credits: 4000, chips: 10 } },
      { damage: 60000, rewards: { scrap: 9000, credits: 9000, chips: 20, buffs: { overclock_core: 1 } } },
      { damage: 150000, rewards: { scrap: 18000, credits: 18000, chips: 35, buffs: { overclock_core: 2 } } },
      { damage: 300000, rewards: { scrap: 30000, credits: 30000, chips: 50, buffs: { overclock_core: 3 } } },
    ] } },
};
export default EVENTS;

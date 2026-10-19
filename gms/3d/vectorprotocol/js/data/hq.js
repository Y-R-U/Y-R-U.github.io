// Company skills (HQ tech tree). Unlocked by the 'hq' feature (m1_l12). mods/effect are PER LEVEL.
const c = (credits, chips) => ({ credits, chips });
export const HQ = {
  // Offense
  weapons_bay: { id: 'weapons_bay', name: 'Weapons Bay', branch: 'offense', icon: 'atk', max: 5, desc: '+3% ATK per level, all units.', cost: c([800, 2500, 7000, 16000, 35000], [0, 0, 10, 25, 50]), mods: { atk: 0.03 } },
  targeting_ai: { id: 'targeting_ai', name: 'Targeting AI', branch: 'offense', icon: 'crit', max: 3, desc: '+3% crit chance per level.', cost: c([4000, 12000, 30000], [10, 30, 60]), requires: { hq: 'weapons_bay', level: 2 }, mods: { crit: 0.03 } },
  overcharge_rails: { id: 'overcharge_rails', name: 'Overcharge Rails', branch: 'offense', icon: 'charge', max: 3, desc: '+5% Overdrive charge per level.', cost: c([6000, 18000, 40000], [20, 40, 80]), requires: { hq: 'targeting_ai', level: 1, companyLevel: 10 }, mods: { charge: 0.05 } },
  // Defense
  armor_lab: { id: 'armor_lab', name: 'Armor Lab', branch: 'defense', icon: 'hp', max: 5, desc: '+3% HP and DEF per level.', cost: c([800, 2500, 7000, 16000, 35000], [0, 0, 10, 25, 50]), mods: { hp: 0.03, def: 0.03 } },
  shield_tech: { id: 'shield_tech', name: 'Shield Tech', branch: 'defense', icon: 'shield', max: 3, desc: '+6% healing & shields per level.', cost: c([4000, 12000, 30000], [10, 30, 60]), requires: { hq: 'armor_lab', level: 2 }, mods: { heal: 0.06 } },
  reactive_plating: { id: 'reactive_plating', name: 'Reactive Plating', branch: 'defense', icon: 'dr', max: 3, desc: '+2% damage reduction per level.', cost: c([6000, 18000, 40000], [20, 40, 80]), requires: { hq: 'shield_tech', level: 1, companyLevel: 10 }, mods: { dr: 0.02 } },
  // Logistics (economy)
  salvage_crew: { id: 'salvage_crew', name: 'Salvage Crew', branch: 'logistics', icon: 'scrap', max: 5, desc: '+10% scrap from every battle per level.', cost: c([600, 1800, 5000, 12000, 25000], [0, 0, 0, 10, 20]), mods: {}, effect: { scrapGain: 0.10 } },
  contracts_desk: { id: 'contracts_desk', name: 'Contracts Desk', branch: 'logistics', icon: 'credits', max: 5, desc: '+8% credits from every battle per level.', cost: c([600, 1800, 5000, 12000, 25000], [0, 0, 0, 10, 20]), mods: {}, effect: { creditGain: 0.08 } },
  sim_pods: { id: 'sim_pods', name: 'Sim Pods', branch: 'logistics', icon: 'xp', max: 5, desc: '+8% unit XP per level.', cost: c([1500, 4500, 10000, 20000, 40000], [0, 5, 10, 20, 40]), requires: { companyLevel: 4 }, mods: {}, effect: { xpGain: 0.08 } },
  // Network (meta)
  league_agent: { id: 'league_agent', name: 'League Agent', branch: 'network', icon: 'arena', max: 3, desc: '+10% arena tokens per level.', cost: c([3000, 9000, 20000], [10, 20, 40]), requires: { story: 'm2_l4' }, mods: {}, effect: { arenaTokens: 0.10 } },
  recruiter: { id: 'recruiter', name: 'Recruiter', branch: 'network', icon: 'recruit', max: 3, desc: '-5% recruitment cost per level.', cost: c([5000, 15000, 35000], [15, 30, 60]), requires: { companyLevel: 8 }, mods: {}, effect: { recruitDiscount: 0.05 } },
};
export default HQ;

// DESIGN §8 + MISSIONS §3/§9. `tags` = site tags the world is expected to expose there.
// `p1Sites` is the fallback site list the generator uses when the engine hasn't registered real sites.
export const DISTRICTS = {
  aurum_plaza: {
    id: 'aurum_plaza', name: 'Aurum Plaza', minLvl: 1, maxLvl: 12, act: 1, unlock: { level: 1 }, danger: 1, gang: 'The Gilt Grins',
    tags: ['plaza', 'fountain', 'park', 'market', 'locker', 'alley', 'rooftop', 'warehouse', 'relay', 'spawn_edge'],
    pools: [['syndicate', 5], ['scrap', 4], ['concord', 1]],
    packs: ['syndicate_street', 'scrap_swarm', 'warden_patrol'],
  },
  brightline: {
    id: 'brightline', name: 'Brightline Boulevard', minLvl: 3, maxLvl: 15, act: 1, unlock: { level: 3 }, danger: 2, gang: 'Neon Saints',
    tags: ['plaza', 'market', 'locker', 'alley', 'rooftop', 'lobby', 'relay', 'spawn_edge'],
    pools: [['syndicate', 5], ['concord', 3], ['scrap', 2]],
    packs: ['syndicate_street', 'chromehead_duo', 'scrap_swarm', 'warden_patrol'],
  },
  terraces: {
    id: 'terraces', name: 'Verdant Terraces', minLvl: 7, maxLvl: 20, act: 2, unlock: { level: 8, story: 'a2_m1' }, danger: 3, gang: 'Greenhouse Boys',
    tags: ['park', 'fountain', 'garden', 'rooftop', 'locker', 'plaza', 'relay', 'spawn_edge'],
    pools: [['scrap', 3], ['syndicate', 3], ['concord', 4]],
    packs: ['scrap_swarm', 'syndicate_street', 'sweeper_squad'],
  },
  arcology: {
    id: 'arcology', name: 'Nexus Arcology', minLvl: 10, maxLvl: 24, act: 2, unlock: { level: 10, story: 'a2_m2' }, danger: 4, gang: 'Floor Thirteen',
    tags: ['lobby', 'interior', 'vault', 'rooftop', 'relay', 'spawn_edge'],
    pools: [['concord', 6], ['syndicate', 2]],
    packs: ['security_floor', 'warden_patrol', 'chromehead_duo'],
  },
  portside: {
    id: 'portside', name: 'Portside', minLvl: 15, maxLvl: 30, act: 3, unlock: { level: 18, story: 'a3_m1' }, danger: 5, gang: 'Silverhand Dockers',
    tags: ['dock', 'pad', 'warehouse', 'market', 'vault', 'alley', 'locker', 'relay', 'spawn_edge'],
    pools: [['syndicate', 6], ['concord', 2], ['unlinked', 2]],
    packs: ['dockers', 'syndicate_street', 'warden_patrol', 'unlinked_cell'],
  },
  stacks: {
    id: 'stacks', name: 'The Stacks', minLvl: 18, maxLvl: 34, act: 4, unlock: { level: 26, story: 'a4_m1' }, danger: 6, gang: 'Pod Wolves',
    tags: ['pods', 'market', 'alley', 'warehouse', 'relay', 'spawn_edge'],
    pools: [['scrap', 6], ['syndicate', 2], ['concord', 2]],
    packs: ['rust_pack', 'syndicate_street', 'lancer_patrol'],
  },
  spine: {
    id: 'spine', name: 'The Spine', minLvl: 28, maxLvl: 40, act: 4, unlock: { level: 32, story: 'a4_m4' }, danger: 7, gang: 'Rust Choir',
    tags: ['catwalk', 'interior', 'warehouse', 'relay', 'spawn_edge'],
    pools: [['scrap', 7], ['concord', 3]],
    packs: ['wight_crawl', 'lancer_patrol'],
  },
  hullside: {
    id: 'hullside', name: 'Hullside', minLvl: 34, maxLvl: 45, act: 5, unlock: { level: 34, story: 'a4_m5' }, danger: 8,
    tags: ['hull', 'pad', 'catwalk', 'relay', 'spawn_edge'],
    pools: [['scrap', 5], ['choir', 5]],
    packs: ['wight_crawl', 'choir_trine'],
  },
  meridian: {
    id: 'meridian', name: 'Meridian Wreck', minLvl: 36, maxLvl: 48, act: 5, unlock: { level: 36, story: 'a5_m2' }, danger: 8,
    tags: ['hull', 'interior', 'vault', 'catwalk', 'relay', 'spawn_edge'],
    pools: [['scrap', 5], ['choir', 5]],
    packs: ['wight_crawl', 'choir_trine'],
  },
  helm: {
    id: 'helm', name: 'The Helm', minLvl: 45, maxLvl: 50, act: 6, unlock: { level: 45, story: 'a6_m2' }, danger: 9,
    tags: ['interior', 'vault', 'lobby', 'relay', 'spawn_edge'],
    pools: [['voices', 6], ['choir', 4]],
    packs: ['gilded_court', 'choir_trine'],
  },
  landfall: {
    id: 'landfall', name: 'Verdance Landfall', minLvl: 50, maxLvl: 999, act: 7, unlock: { level: 50, story: 'finale' }, danger: 9,
    tags: ['park', 'plaza', 'pad', 'warehouse', 'garden', 'relay', 'spawn_edge'],
    pools: [['voices', 6], ['choir', 4], ['scrap', 3]],
    packs: ['gilded_court', 'choir_trine', 'wight_crawl'],
  },
};

export const DISTRICT_ORDER = ['aurum_plaza', 'brightline', 'terraces', 'arcology', 'portside', 'stacks', 'spine', 'hullside', 'meridian', 'helm', 'landfall'];

// Virtual site layout used when world.sites isn't available (node sim, early boot).
// 2-4 sites per tag, laid out on a ring so goto distances are 40-120 m.
export function fallbackSites(districtId) {
  const d = DISTRICTS[districtId];
  const sites = [];
  let i = 0;
  const counts = { locker: 3, alley: 2, rooftop: 2, fountain: 2, spawn_edge: 4 };
  for (const tag of d.tags) {
    const n = counts[tag] || 2;
    for (let k = 0; k < n; k++, i++) {
      const a = i * 2.399963;               // golden angle spiral
      const r = 20 + (i % 7) * 11;
      sites.push({ id: `${tag}_${k + 1}`, tag, x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r), r: 4, district: districtId, virtual: true });
    }
  }
  return sites;
}

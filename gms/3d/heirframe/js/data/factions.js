// DESIGN §9, §11.2. `stance` is the default attitude toward the player.
export const FACTIONS = {
  civilians: { id: 'civilians', name: 'Civilians', stance: 'friendly', invulnerable: true, noRep: true, color: '#f4e7c3', blurb: 'Harmony-Aegis protected. They cannot be harmed, and they flee combat.' },
  concord: { id: 'concord', name: 'Concord', short: 'Wardens', stance: 'neutral', lawful: true, color: '#e8c35a', blurb: 'Civic security. Warden robots keep the utopia tidy.' },
  nexus: { id: 'nexus', name: 'Nexus', stance: 'neutral', lawful: true, color: '#7ec8ff', blurb: 'The frame and Link monopoly. Vendors, HireFrame, Transit Relays.' },
  syndicate: { id: 'syndicate', name: 'Silverhand Syndicate', short: 'Syndicate', stance: 'neutral', startRep: -10, color: '#c9d3dd', blurb: 'Chrome-plated organised crime: docks, clubs, protection rackets.' },
  unlinked: { id: 'unlinked', name: 'The Unlinked', stance: 'neutral', color: '#5ef2c1', blurb: 'Undercity resistance, hackers, pod-born riders.' },
  freehaul: { id: 'freehaul', name: 'Freehaul Union', short: 'Freehaul', stance: 'neutral', color: '#ffb36b', blurb: 'Dockers and shuttle crews. Big friendly worker frames.' },
  scrap: { id: 'scrap', name: 'Scrap / Rustkin', short: 'Scrap', stance: 'hostile', alwaysHostile: true, noRep: true, color: '#d0763a', blurb: 'Feral maintenance bots and their hives.' },
  choir: { id: 'choir', name: 'The Choir', stance: 'hostile', alwaysHostile: true, noRep: true, color: '#ffd36b', blurb: "Seraph's gold hunter-angels." },
  voices: { id: 'voices', name: 'Concord Voices', stance: 'neutral', hidden: true, noRep: true, color: '#fff1b8', blurb: 'The seven Voices of the Concord and their gilded guard.' },
};

// inclusive lower bounds; DESIGN §9 tiers
export const REP_TIERS = [
  { id: 'hated', min: -100, name: 'Hated', payMul: 0.9 },
  { id: 'hostile', min: -59, name: 'Hostile', payMul: 0.9 },
  { id: 'wary', min: -24, name: 'Wary', payMul: 0.9 },
  { id: 'neutral', min: 0, name: 'Neutral', payMul: 1 },
  { id: 'friendly', min: 25, name: 'Friendly', payMul: 1.05 },
  { id: 'trusted', min: 50, name: 'Trusted', payMul: 1.1 },
  { id: 'honored', min: 80, name: 'Honored', payMul: 1.2 },
];

// DESIGN §9 "Hostile when" rules evaluated by factions.stance()
export const HOSTILITY = {
  concord: { heatAtLeast: 2 },
  syndicate: { repAtMost: -1, onTurf: true },
  unlinked: { repAtMost: -1 },
  freehaul: { repAtMost: -25 },
  nexus: { repAtMost: -60 },
};

export const RIVALS = { concord: ['syndicate', 'unlinked'], syndicate: ['concord'], unlinked: ['concord'] };

export const REP_RULES = {
  forClient: { street: 3, pro: 5, elite: 7, black: 8, story: 5 },
  againstTarget: { street: -4, pro: -6, elite: -8, black: -10, story: -4 },
  killEach: -0.5, killCapPerMission: -5, rivalShare: 0.5, failClient: -3,
};

export const HEAT = {
  maxStars: 5,
  decaySeconds: 180,           // -1 star per 3 min with no incident
  wardenKillCooldown: 10,
  gains: { alarm: 1, wardenKill: 0.5, blackContract: 1, collateral: 1, spotted: 1 }, // sim: wardenKill 1→0.5 (P2a: a responder squad fight no longer runs 3★→5★ in a minute)
  collateralThreshold: 500,
  effects: {
    1: 'Warden Eyes watch you.',
    2: 'Wardens are hostile on sight.',
    3: 'Patrols hunt you. Black contracts unlock.',
    4: 'Lancers and Enforcer squads. Transit Relays locked.',
    5: 'A Choir Angel squad every 90 s. Rewards x1.5.',
  },
  rewardMultAt5: 1.5,
};

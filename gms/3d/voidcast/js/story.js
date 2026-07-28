// story.js — 50 contracts across 5 acts, plus the beats that run between them.

import { ACT_THEME } from './palettes.js';

/**
 * Table rows: [name, radius, time, target%, rivals, hazards, maxTier, type, brief]
 * type: clear | rush | rival | siege | boss
 *   clear  — hit the clearance quota, no clock
 *   rush   — quota against the clock
 *   rival  — out-clear every rival feed
 *   siege  — quota with the defence grid live
 *   boss   — swallow the act's landmark before the clock runs out
 */
const T = [
  // ── ACT I — THE SCRAPYARD MOONS ──────────────────────────────────────────
  ['Orientation Rock', 68, 0, 35, 0, 0, 4, 'clear', 'Guild training moon. Nothing here is alive and nothing here is watching. Get the aperture open.'],
  ['Tin Belt', 74, 130, 45, 0, 0, 5, 'rush', 'Forty thousand viewers. That is not a lot, Unit. That is a corridor of people walking past a screen.'],
  ['The Dump', 78, 125, 52, 1, 0, 5, 'rival', 'Another worker got assigned the same rock. Whoever clears more of it keeps the airtime.'],
  ['Pod Field', 82, 125, 55, 0, 0, 5, 'rush', 'Escape pods. Empty ones, obviously. The Guild would never leave that in a clearance zone.'],
  ['Crane Shadow', 86, 120, 58, 1, 1, 6, 'siege', 'The old yard defences still think they work for someone. Consider them content.'],
  ['Rust Flats', 88, 120, 60, 1, 0, 6, 'clear', 'You are trending in a demographic the Guild describes as "unemployed and awake at 04:00". Progress.'],
  ['Salvage Line', 92, 115, 62, 2, 1, 6, 'rival', 'Two feeds, one line. Your chat has started making banners. Nobody asked them to.'],
  ['Anchor Nine', 94, 115, 64, 1, 1, 6, 'siege', 'Something under the plating is transmitting on a band the Guild does not use. Ignore it.'],
  ["Breaker's Yard", 98, 110, 68, 2, 2, 7, 'rival', 'Last job before the crane. Your handler says the numbers "no longer embarrass anyone".'],
  ['THE BREAKER CRANE', 102, 165, 55, 0, 2, 8, 'boss', 'Take the crane itself. It has stood there for nine hundred years. Two million viewers would like to watch it not.'],

  // ── ACT II — THE COLONY BELT ─────────────────────────────────────────────
  ['Welcome Ring', 100, 130, 50, 1, 0, 6, 'rush', 'Real colonies now. Real streets. The Guild says the residents were relocated. The Guild says a lot of things.'],
  ['Marrow Gardens', 104, 130, 55, 1, 1, 6, 'clear', 'Somebody planted these. Recently. Your chat thinks the little running ones are adorable.'],
  ['Sixteen Terraces', 106, 125, 58, 2, 1, 7, 'rival', 'Terraced housing, all identical, all empty. Your co-streamer keeps saying "allegedly".'],
  ['The Long Commute', 108, 125, 58, 1, 1, 7, 'rush', 'Traffic still runs on schedule. Nobody has told it. Catching a moving bus is worth four static ones to the feed.'],
  ['Dome Nine', 110, 120, 60, 2, 2, 7, 'siege', 'Colonial defence pylons. Local militia. Two hundred of them against a satellite they cannot see.'],
  ['Orchard Belt', 112, 120, 62, 1, 1, 7, 'clear', 'Fourteen million viewers. Somebody made merchandise of your aperture. You get none of the revenue.'],
  ['Fallow Sector', 114, 115, 64, 2, 2, 7, 'rival', 'Your handler has stopped answering questions about the relocation manifests.'],
  ['The Spillway', 116, 115, 66, 2, 2, 7, 'siege', 'Water still running. Lights still on. Someone left in a hurry, and not that long ago.'],
  ['Seedbank Approach', 118, 110, 68, 3, 2, 7, 'rival', 'Three feeds on one colony. The Guild calls it a festival. Chat calls it a bloodbath.'],
  ['THE SEED ARK', 120, 175, 55, 1, 2, 8, 'boss', 'The Ark holds every crop this belt ever grew. It is also the single largest object you have been cleared to remove.'],

  // ── ACT III — THE HIVE CITIES ────────────────────────────────────────────
  ['Undercity', 118, 130, 55, 2, 2, 7, 'rush', 'Hive world. Ninety million residents on the census. The Guild has filed it as "sparse".'],
  ['Neon Spine', 120, 130, 58, 2, 2, 7, 'clear', 'Every window here is lit. Do not look at the windows. Look at the counter.'],
  ['Transit Deck', 122, 125, 60, 3, 2, 7, 'rival', 'Rivals everywhere. The Guild has started running your feeds side by side as a competition.'],
  ['The Stacks', 124, 125, 62, 2, 3, 7, 'siege', 'Full planetary defence grid. Your casing is rated for exactly none of this.'],
  ['Kettle District', 126, 120, 64, 2, 3, 7, 'siege', 'Two hundred million viewers. Someone in chat asked where the residents went and got timed out by a moderator you have never met.'],
  ['Ash Boulevard', 128, 120, 65, 3, 2, 8, 'rival', 'You are winning. That is the problem. Winning gets you the bigger contracts.'],
  ['Signal Row', 130, 115, 66, 2, 3, 8, 'siege', 'The broadcast relays here carry your own feed. Swallowing them cuts your audience for six seconds. Chat finds this hilarious.'],
  ['The Choir Blocks', 132, 115, 68, 3, 3, 8, 'clear', 'There is singing on the open channel. The Guild says it is an automated hazard warning. It is not.'],
  ['Needle Approach', 134, 110, 70, 3, 3, 8, 'rival', 'Last run before the Needle. Every clearance worker in the sector is watching you now.'],
  ['THE BROADCAST NEEDLE', 136, 185, 55, 1, 3, 8, 'boss', 'The tower that carries your show. Take it down live and the Guild will still bill the audience for the ad break.'],

  // ── ACT IV — THE SANCTUM ─────────────────────────────────────────────────
  ['Green Threshold', 126, 130, 55, 2, 2, 7, 'rush', 'A living world. Uncatalogued. Your handler transmitted the contract and then went quiet for a full minute.'],
  ['Fernward', 128, 130, 58, 2, 2, 7, 'clear', 'Everything here runs from you. The feed has never been higher. Think about that for a second.'],
  ['The Bright Shallows', 130, 125, 60, 3, 2, 7, 'rival', 'Rivals are dropping in. They saw your numbers. They did not read the survey.'],
  ['Cradlewood', 132, 125, 62, 2, 3, 8, 'siege', 'Someone is shooting back. Not a defence grid. People, with what they had to hand.'],
  ['The Quiet Mile', 134, 120, 64, 2, 2, 8, 'clear', 'No music this run. The Guild cut your track for "tonal reasons". Chat has gone strange and soft.'],
  ['Hollow Reach', 136, 120, 66, 3, 3, 8, 'rival', 'Nine hundred million viewers. You have never had an audience like this and it has never mattered less.'],
  ['The Last Terrace', 138, 115, 68, 3, 3, 8, 'siege', 'Your handler sends one line, off the record: "Do the job. They watch the ones who do not."'],
  ['Amber Hollow', 140, 115, 70, 3, 3, 8, 'clear', 'You have started leaving things standing. The counter notices. The counter always notices.'],
  ['Rootfall', 142, 110, 70, 4, 3, 8, 'rival', 'Four rivals, sent to finish what you have been slow about. The Guild is making a point.'],
  ['THE WORLD TREE', 144, 195, 55, 1, 3, 8, 'boss', 'It is nine kilometres tall and it is older than the Guild. They want it gone by the end of the broadcast.'],

  // ── ACT V — THE CORE VERGE ───────────────────────────────────────────────
  ['Verge Approach', 130, 130, 55, 2, 3, 7, 'rush', 'You have been promoted. The Core Verge is where cleared matter goes. Nobody has ever streamed from inside it.'],
  ['Intake Shelf', 134, 130, 58, 2, 3, 8, 'clear', 'Every world you have taken is in here somewhere, ground down and stacked.'],
  ['The Ledger Halls', 136, 125, 60, 3, 3, 8, 'rival', 'Records. Manifests. Nine hundred years of relocation orders that were never carried out.'],
  ['Foundry Belt', 138, 125, 62, 2, 4, 8, 'siege', 'The Guild is building something. It is very large and it is not a station.'],
  ['Silent Wards', 140, 120, 64, 3, 3, 8, 'siege', 'Two billion viewers. Your feed is the most watched object in the galaxy and you are inside their house.'],
  ['The Overlook', 142, 120, 66, 3, 4, 8, 'clear', 'From here you can see the shell they are wrapping around the dying star. It is made of planets.'],
  ['Handler Deck', 144, 115, 68, 4, 4, 8, 'rival', 'Your handler is somewhere on this deck. So are eleven other clearance units, and they have all been told about you.'],
  ['The Long Argument', 146, 115, 70, 4, 4, 8, 'siege', 'Guild security, everything they have. Chat has stopped joking. Chat is just watching.'],
  ['Threshold', 148, 110, 72, 4, 4, 8, 'rival', 'One deck left. Four billion viewers. Nobody is going to be able to say they did not see it.'],
  ['THE GUILD CORE', 152, 215, 60, 1, 4, 8, 'boss', 'Point the aperture at the people who built it. The whole galaxy is already tuned in.'],
];

export const LEVELS = T.map((row, i) => {
  const [name, radius, time, rawTarget, rivals, hazards, maxTier, type, brief] = row;
  const act = Math.floor(i / 10);
  // The quota counts only what YOU clear. Rivals typically strip 15–25% of a
  // sector out from under you, so the authored figures are discounted to keep
  // one star reachable — the stretch lives in the two- and three-star marks.
  const target = Math.round(rawTarget * 0.82);
  return {
    id: i + 1,
    kind: 'story',
    act,
    name,
    theme: ACT_THEME[act],
    seed: 0x5eed0000 + (i + 1) * 2654435761 % 100000,
    radius,
    time,
    target,
    rivals,
    hazards,
    maxTier,
    type,
    brief,
    density: 1 + act * 0.06,
    // Landmark sites are megastructure districts, and the Verge is nothing but
    // megastructure — both need far more big objects than a suburb, or there is
    // nothing left to climb on once you outgrow the small stuff.
    mix: type === 'boss'
      ? [0, 0.34, 0.22, 0.15, 0.10, 0.08, 0.07, 0.04]
      : act === 4
        ? [0, 0.38, 0.23, 0.15, 0.09, 0.065, 0.045, 0.025]
        : undefined,
    roads: act === 0 ? 'sparse' : act === 3 ? 'sparse' : act >= 2 ? 'dense' : 'normal',
    landmarks: type === 'boss' ? 1 : act >= 1 ? 1 : 0,
    stars: [target, Math.min(96, target + 13), Math.min(99, target + 26)],
    subs: 60 + act * 45 + (i % 10) * 8 + (type === 'boss' ? 320 : 0),
  };
});

export const ACTS = [
  { n: 0, name: 'THE SCRAPYARD MOONS', sub: 'Nothing here was ever alive.' },
  { n: 1, name: 'THE COLONY BELT', sub: 'The Guild says they were relocated.' },
  { n: 2, name: 'THE HIVE CITIES', sub: 'Ninety million on the census. Filed as sparse.' },
  { n: 3, name: 'THE SANCTUM', sub: 'Everything here runs from you.' },
  { n: 4, name: 'THE CORE VERGE', sub: 'Where the planets go.' },
];

export function level(id) { return LEVELS[id - 1]; }
export function actOf(id) { return LEVELS[id - 1].act; }

/** Which cutscene, if any, plays before this level. */
export function cutsceneBefore(id) {
  if (id === 1) return 'intro';
  if (id === 11) return 'act2';
  if (id === 21) return 'act3';
  if (id === 31) return 'turn';
  if (id === 41) return 'act5';
  return null;
}
export function cutsceneAfter(id) {
  if (id === 50) return 'finale';
  return null;
}

export function objectiveText(lv) {
  switch (lv.type) {
    case 'boss': return `Swallow the landmark — clear ${lv.target}% first to grow big enough`;
    case 'rival': return `Clear ${lv.target}% and out-clear every rival feed`;
    case 'siege': return `Clear ${lv.target}% with the defence grid live`;
    case 'rush': return `Clear ${lv.target}% before the broadcast ends`;
    default: return `Clear ${lv.target}% of the sector`;
  }
}

export function typeLabel(t) {
  return ({ clear: 'CLEARANCE', rush: 'TIMED', rival: 'COMPETITIVE', siege: 'DEFENDED', boss: 'LANDMARK' })[t] || 'CLEARANCE';
}

/* Equipment you buy with money, per tank. Abilities you unlock with renown
   live in data/progress.js instead. */

export const GEAR = [
  { id:'filter1', name:'Sponge Filter',   group:'filter', tier:1, price:0,   bact:1.0, flow:0.25,
    desc:'Enough surface for the bacteria a lightly stocked starter needs.' },
  { id:'filter2', name:'Canister Filter', group:'filter', tier:2, price:180, bact:2.4, flow:0.55,
    desc:'Three times the media. The single biggest jump in how much life a tank can carry.' },
  { id:'filter3', name:'Sump & Refugium', group:'filter', tier:3, price:640, bact:5.0, flow:0.8,
    desc:'A second tank underneath doing the unglamorous work. Bacteria stop being your limit.' },
  { id:'light1',  name:'Standard LED',    group:'light',  tier:1, price:0,   light:0.45, appeal:0,
    desc:'Lights the tank. Grows the toughest plants and nothing else.' },
  { id:'light2',  name:'Planted Spectrum',group:'light',  tier:2, price:150, light:0.78, appeal:8,
    desc:'Proper spectrum. Plants take off — and so does algae if the nitrate is high.' },
  { id:'light3',  name:'Gallery Array',   group:'light',  tier:3, price:520, light:1.0,  appeal:18,
    desc:'Cinema lighting with dawn and dusk ramps. Colours read from across the room.' },
  { id:'heater',  name:'Precision Heater',group:'heater', tier:1, price:120, heat:1,
    desc:'Holds temperature within half a degree instead of drifting two.' },
  { id:'chiller', name:'Inline Chiller',  group:'chill',  tier:2, price:340, cool:1,
    desc:'Runs the tank cooler than the room. Goldfish, jellies and seahorses all want this.' },
  { id:'skimmer', name:'Protein Skimmer', group:'skim',   tier:2, price:260, water:'sw', organics:0.55,
    desc:'Pulls dissolved waste out before it ever becomes ammonia. Marine only.' },
  { id:'uv',      name:'UV Sterilizer',   group:'uv',     tier:2, price:300, algae:0.6, disease:0.55,
    desc:'Kills what drifts through it. Cuts algae blooms and slows an outbreak dramatically.' },
  { id:'wave',    name:'Wavemaker',       group:'wave',   tier:2, price:170, flow:0.5, o2:0.5,
    desc:'Real water movement. Most fish love it. Jellies and seahorses do not survive it.' },
  { id:'co2',     name:'CO₂ Injection', group:'co2',  tier:3, price:210, plant:0.55, ph:-0.25,
    desc:'Plants grow half again as fast. The pH follows it down, so watch the buffer.' },
  { id:'gen',     name:'Backup Generator',group:'gen',    tier:3, price:420,
    desc:'A power cut stops being an emergency and becomes a footnote.' },
];
export const GR = {}; GEAR.forEach(g => GR[g.id] = g);
export const has = (T, id) => T.gear.has(id);

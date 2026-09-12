/* ═══════════════════════════════════════════════════════════════════════════
   PROGRESSION
   Nothing in this game is available at the start. GOALS are the spine — they
   fire automatically as you play and hand you the next capability. The SHELF
   is the meta-layer: renown you spend on whatever you want next.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Capability flags. Anything the UI or sim gates on lives here. */
export const CAPS = [
  'feed', 'shelf1', 'tank2', 'plants', 'testkit', 'decor', 'speed3', 'shelf2',
  'autofeed', 'trips', 'shelf3', 'gearshop', 'marine', 'shelf4', 'breeding',
  'shelf5', 'photo', 'logbook', 'care', 'moveFish',
];

/* ── the spine ─────────────────────────────────────────────────────────────
   Each goal: id, text (what the player is told), check(G), and what it gives.
   `silent` goals do not announce themselves, they just gate the next one. */
export const GOALS = [
  { id:'g_fish', text:'Put your first fish in the tank',
    check: G => G.totalFishEverAdded >= 1,
    give: { caps:['feed'] }, silent:true },

  { id:'g_feed', text:'Feed it',
    check: G => G.stats.feeds >= 1,
    give: { money:40 }, silent:true },

  { id:'g_days', text:'Keep it alive for three days',
    check: G => G.tank(0) && G.tank(0).day >= 4 && G.tank(0).fish.some(f => f.alive),
    give: { renown:10, caps:['shelf1','care','tank2'],
      note:'You can look after a fish. Here is a second tank and a shelf of fish to put in it.' } },

  { id:'g_tank2', text:'Open your second tank',
    check: G => G.tanks.length >= 2,
    give: { renown:6, caps:['moveFish'] } },

  { id:'g_school', text:'Keep a school of six together',
    check: G => G.tanks.some(T => { const c = {}; T.fish.forEach(f => f.alive && (c[f.sp.id] = (c[f.sp.id]||0)+1)); return Object.values(c).some(n => n >= 6); }),
    give: { renown:8, caps:['plants'], note:'A shoal reads as one animal, and the crowd notices. Planting is now available.' } },

  { id:'g_cycle', text:'Cycle a tank properly',
    check: G => G.tanks.some(T => T.processed > 4.5 && T.nh3 < 0.05 && T.no2 < 0.05),
    give: { renown:10, caps:['testkit','logbook'], lore:'cycling',
      note:'Your filter has grown its bacteria. Here is a test kit so you can watch the next one.' } },

  { id:'g_appeal1', text:'Reach 120 crowd appeal',
    check: G => G.appealPeak >= 120,
    give: { renown:10, caps:['decor','speed3'] } },

  { id:'g_earn', text:'Take $1,000 at the door',
    check: G => G.stats.earned >= 1000,
    give: { renown:12, caps:['shelf2','gearshop'], note:'Word is getting round. Better fish and better equipment are in the shop.' } },

  { id:'g_ten', text:'Keep ten animals at once',
    check: G => G.tanks.reduce((n,T) => n + T.fish.filter(f=>f.alive).length, 0) >= 10,
    give: { renown:10, caps:['autofeed'], lore:'idle',
      note:'Auto-feeders unlocked. A tank with one keeps earning while you are away.' } },

  { id:'g_clean', text:'Hold a tank in good water for five days',
    check: G => G.streak.clean >= 5,
    give: { renown:14, caps:['trips'], note:'A collector has heard about you. You can fund trips now.' } },

  { id:'g_trip', text:'Bring a species back from a trip',
    check: G => G.stats.trips >= 1,
    give: { renown:10, caps:['shelf3'] } },

  { id:'g_plants', text:'Grow six plants across your tanks',
    check: G => G.tanks.reduce((n,T) => n + T.plants.length, 0) >= 6,
    give: { renown:10, money:200 } },

  { id:'g_marine', text:'Reach 60 renown',
    check: G => G.stats.renownEver >= 60,
    give: { caps:['marine','shelf4'], note:'You can run salt water now. Everything about it is narrower.' } },

  { id:'g_host', text:'Get a clownfish hosting an anemone',
    check: G => G.tanks.some(T => T.fish.some(f => f.alive && f.sp.id==='clown' && f.hostDecor)),
    give: { renown:14, rel:'clown-anem' } },

  { id:'g_breed', text:'Breed anything in your care',
    check: G => G.stats.births >= 1,
    give: { renown:14, caps:['breeding'], lore:'breeding' } },

  { id:'g_appeal2', text:'Reach 500 crowd appeal',
    check: G => G.appealPeak >= 500,
    give: { renown:16, caps:['shelf5'] } },

  { id:'g_noloss', text:'Go ten days without losing an animal',
    check: G => G.streak.noLoss >= 10,
    give: { renown:18, money:600 } },

  { id:'g_species6', text:'Display six species at once',
    check: G => new Set(G.tanks.flatMap(T => T.fish.filter(f=>f.alive).map(f=>f.sp.id))).size >= 6,
    give: { renown:14 } },

  { id:'g_tanks4', text:'Run four tanks at once',
    check: G => G.tanks.length >= 4,
    give: { renown:16, caps:['photo'] } },

  { id:'g_appeal3', text:'Reach 1,500 crowd appeal',
    check: G => G.appealPeak >= 1500,
    give: { renown:25, money:2500 } },

  { id:'g_collection', text:'Have kept fifteen different species',
    check: G => Object.keys(G.save.kept).length >= 15,
    give: { renown:30, note:'Fifteen species through your hands. People are calling this a collection.' } },

  { id:'g_everything', text:'Have kept every species in the book',
    check: G => Object.keys(G.save.kept).length >= 26,
    give: { renown:80, note:'Every animal in the book, kept and understood. There is nothing left to unlock — only tanks left to build.' } },
];

/* ── the shelf: renown you spend ───────────────────────────────────────────
   kind: 'tank' | 'perk' | 'species' */
export const SHELF = [
  { id:'tank3', kind:'tank', name:'A third tank', cost:20, icon:'🪟', req:'tank2',
    desc:'Another tank running alongside the others, earning alongside them too.' },
  { id:'tank4', kind:'tank', name:'A fourth tank', cost:55, icon:'🪟', req:'tank3',
    desc:'The room is starting to look like a fishroom.' },
  { id:'tank5', kind:'tank', name:'A fifth tank', cost:130, icon:'🪟', req:'tank4', desc:'Wall to wall.' },
  { id:'tank6', kind:'tank', name:'A sixth tank', cost:280, icon:'🪟', req:'tank5', desc:'The last wall you have.' },

  { id:'poster', kind:'perk', name:'Street signage', cost:12, icon:'🪧', mult:{ visitors:0.18 },
    desc:'A board outside. Eighteen per cent more people find the door.' },
  { id:'cafe', kind:'perk', name:'A little café', cost:26, icon:'☕', mult:{ ticket:0.30 },
    desc:'They stay longer and they spend more while they are here.' },
  { id:'nightlight', kind:'perk', name:'Late opening', cost:34, icon:'🌙', mult:{ night:1.0 },
    desc:'The gallery stays open after dark, which is when the glowing things earn their keep.' },
  { id:'goodstock', kind:'perk', name:'A better supplier', cost:22, icon:'📦', mult:{ health:0.25 },
    desc:'Animals arrive healthier and settle faster. Fewer losses in the first week.' },
  { id:'bulkfood', kind:'perk', name:'Bulk food', cost:18, icon:'🥫', mult:{ foodCost:-0.5, portion:0.25 },
    desc:'Half price, and a little more in every portion.' },
  { id:'holiday', kind:'perk', name:'A keyholder', cost:40, icon:'🔑', mult:{ offline:1.0 },
    desc:'Somebody to look in while you are away. Doubles how long a tank keeps earning offline.' },
  { id:'scrubbers', kind:'perk', name:'Algae scrubbers', cost:30, icon:'🧽', mult:{ algae:-0.4 },
    desc:'Fitted to every tank. Algae grows far more slowly everywhere.' },
  { id:'quarantine', kind:'perk', name:'Quarantine bay', cost:36, icon:'🧪', mult:{ disease:-0.45 },
    desc:'New arrivals sit out of sight for a while. Much less finds its way into a display.' },
];
export const SH = {}; SHELF.forEach(s => SH[s.id] = s);

/** Species not on an unlocked shelf can still be bought outright with renown. */
export const SPECIES_RENOWN = { 1:3, 2:6, 3:12, 4:20, 5:34 };

/** Which shelf cap covers which tier. */
export const TIER_CAP = { 0:null, 1:'shelf1', 2:'shelf2', 3:'shelf3', 4:'shelf4', 5:'shelf5' };

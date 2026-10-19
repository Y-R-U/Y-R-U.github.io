// Story cast + scenes. Scene id = `<levelId>_pre` (before the squad screen) or `_post` (after a
// first-clear win). Levels without a scene simply skip it. Lines are mobile-length (≤ ~110 chars).
// `who` = CAST id; 'sys' = system/HUD text in mono. docs/STORY.md is the narrative bible.

export const COMPANY = { name: 'NIGHTSHIFT', full: 'Nightshift Contracting', motto: 'We work when you can\'t.' };

export const CAST = {
  mags: { name: 'MAGS OKORO', title: 'Fixer · your handler', color: '#22d3ff', portrait: 'woman, 50s, grey locs tied up, AR monocle over one eye, worn Novaline jacket with the logo ripped off' },
  tink: { name: 'TINK', title: 'Mechanic', color: '#ffc23a', portrait: 'teen, shaved sides, welding goggles on forehead, grease on cheek, oversized orange overalls' },
  krell: { name: 'DOCKMASTER KRELL', title: 'Loan shark, Rustline Docks', color: '#ff6a1a', portrait: 'heavy man, rain slicker, gold teeth, cybernetic jaw' },
  jax: { name: 'JAX VARRO', title: 'Boss, Red Ledger', color: '#ef4444', portrait: 'lean, 30s, red mohawk, scar through lip, ledger tattoo columns down the neck' },
  ione: { name: 'IONE VALE', title: '"CORONA" · league champion', color: '#e2e8f0', portrait: 'athletic, 20s, platinum buzzcut, sponsor-patched white flight suit, calm eyes' },
  sable: { name: 'DIRECTOR SABLE HALVORSEN', title: 'CEO, Halvorsen Security', color: '#38bdf8', portrait: 'tall, 60s, silver hair, navy suit, shield-crest pin' },
  rhee: { name: 'WING DIRECTOR RHEE', title: 'Kestrel Dynamics', color: '#9fd8ff', portrait: 'sharp, 40s, pilot visor, Kestrel bird insignia' },
  choir: { name: 'THE CHOIR', title: 'Voice of the Lattice', color: '#a855f7', portrait: 'no face: a violet glass shard with light moving inside it' },
  ysolde: { name: 'YSOLDE', title: 'Sage of the Verdance', color: '#22c55e', portrait: 'elf, white hair, green hooded robe, staff with a floating blue crystal' },
  brannoch: { name: 'SER BRANNOCH', title: 'Knight-Captain, the Hollow Crown', color: '#3b82f6', portrait: 'weathered knight, dark hair, dented plate, blue tabard' },
  vane: { name: 'CASSIUS VANE', title: 'CEO, Novaline', color: '#ffc23a', portrait: 'handsome, 40s, white turtleneck, gold-rimmed eyes, perfect smile' },
  prime: { name: 'VECTOR PRIME', title: 'Vane, uploaded', color: '#ffc23a', portrait: 'Vane\'s face rendered in gold wireframe around a black sphere' },
  sys: { name: 'SYSTEM', title: '', color: '#94a3b8', portrait: null },
};

const L = (who, text) => ({ who, text });

export const SCENES = {
  // ═══ MAP 1 — RUSTLINE DOCKS ═══
  m1_l1_pre: [
    L('sys', 'NIGHTSHIFT CONTRACTING — licence #44-0917 — ASSETS: 2 robots, 1 hangar (leaking).'),
    L('mags', 'Congratulations, Boss. You now own the worst merc outfit in Halcyon Reach.'),
    L('mags', 'Dent hits things. Hum shoots things. Neither has been serviced since the war.'),
    L('mags', 'First job: some dock thug is sitting on a client\'s container. Go be persuasive.'),
  ],
  m1_l1_post: [L('mags', 'Huh. They work. Don\'t tell them I sounded surprised.')],
  m1_l2_post: [L('tink', 'I\'m Tink. I fix stuff. You break stuff. I think this is gonna work out.'), L('sys', 'UPGRADES unlocked — spend scrap in the BARRACKS to level up your robots.')],
  m1_l3_pre: [L('mags', 'Clinic down Pier 6 can\'t pay us in cash. They\'re offering a drone instead.'), L('mags', 'Take it. A medic is worth more than money, and it\'s worth more than you.')],
  m1_l3_post: [L('sys', 'PATCH joined the company.'), L('tink', 'It keeps trying to bandage me. I\'m fine. I\'m mostly fine.')],
  m1_l4_post: [L('sys', 'RECRUITMENT unlocked — hire new robots with credits.')],
  m1_l5_pre: [L('mags', 'Three robots on the board, Boss. Triad Protocol — front, back, support. Use it.')],
  m1_l5_post: [L('sys', 'SQUAD SLOT 3 unlocked.'), L('mags', 'Tank in front, shooters behind, the clever one on the edge. Old rules. Good rules.')],
  m1_l8_pre: [L('krell', 'You\'re the new outfit in Hangar 9? Rent\'s due. Rent is everything you own.')],
  m1_l8_post: [L('sys', 'RANK UP unlocked — duplicates and shards raise a robot\'s level cap.'), L('mags', 'Krell won\'t let that go. Good. Let him come to us.')],
  m1_l11_post: [L('tink', 'Boss? Hum\'s core is glowing purple. It\'s not supposed to do that. It\'s not supposed to have a core.')],
  m1_l12_pre: [L('krell', 'Meet BIG RUSTY. Demolition rig. I usually point it at buildings.'), L('mags', 'He\'s using a bulldozer as an argument. Win the argument.')],
  m1_l12_post: [
    L('krell', 'Fine! FINE. Hangar\'s yours. Take the junk in Bay 3 too, it scares me.'),
    L('sys', 'BULWARK joined the company. HQ unlocked — company skills.'),
    L('mags', 'The docks know our name now. Time to go where the money is. Down.'),
  ],

  // ═══ MAP 2 — NEON UNDERCITY ═══
  m2_l1_pre: [L('mags', 'The Undercity. Under the platforms, under the law, under a lot of neon.'), L('mags', 'Red Ledger runs it. Don\'t start anything with them. Today.')],
  m2_l3_post: [L('sys', 'ABILITY UPGRADES and the WORKSHOP unlocked — fabricate combat buffs there.'), L('tink', 'Stim Packs! Plating Kits! Don\'t ask where I got them.')],
  m2_l4_pre: [L('mags', 'Pit night. Robots fight, people bet, everyone pretends it\'s legal.')],
  m2_l4_post: [L('sys', 'ARENA unlocked — fight rival companies for tokens and XP.'), L('mags', 'When the jobs get too hard, the Arena makes you harder. Remember that.')],
  m2_l5_pre: [L('jax', 'Nightshift. Cute name. You\'re working Ledger streets without paying Ledger.'), L('jax', 'Consider this the invoice.')],
  m2_l7_post: [L('sys', 'SQUAD SLOT 4 unlocked.'), L('mags', 'Four on the board. Now you can start matching factions. Two of a kind, things get interesting.')],
  m2_l10_post: [L('sys', 'DAILY OPS unlocked — salvage runs, vault jobs, sim drills.')],
  m2_l11_pre: [L('tink', 'I pulled the Ledger crew\'s orders off a wreck. Boss… someone PAID them to hit us.'), L('mags', 'Who.'), L('tink', 'Shell company. Shell company. Shell company. Novaline.')],
  m2_l11_post: [L('mags', 'Novaline makes toasters and therapy apps. Why would they want two scrap robots dead?'), L('tink', 'One scrap robot. They wanted Hum.')],
  m2_l14_pre: [L('jax', 'Nothing personal, Nightshift. Novaline pays triple. REDLINE, wipe them.')],
  m2_l14_post: [
    L('jax', '…Okay. Personal now. You cost me a rig.'),
    L('jax', 'Here\'s free advice: whatever\'s in your gunner, Novaline wants it more than they want me alive.'),
    L('sys', 'JAMMER defected to Nightshift.'),
    L('mags', 'We need money, protection and cameras. The league has all three.'),
  ],

  // ═══ MAP 3 — PROTOCOL LEAGUE ═══
  m3_l1_pre: [L('mags', 'The Vector Protocol league. Every robot in the city runs the Protocol. The league is where it shows off.'), L('mags', 'Win on camera and nobody can make us quietly disappear.')],
  m3_l1_post: [L('sys', 'CORPORATE CONTRACT recruitment unlocked (chips).')],
  m3_l2_pre: [L('ione', 'A wildcard. From the docks. With a medic drone.'), L('ione', 'I like you already. Don\'t make me stop.')],
  m3_l8_post: [L('sys', 'FACTION TRIALS unlocked — earn event marks, buy faction drafts.')],
  m3_l10_pre: [L('sys', 'BROADCAST FEED LOST.'), L('mags', 'Somebody just cut the cameras on our semifinal. Fight like nobody\'s watching. Nobody is.')],
  m3_l13_post: [L('mags', 'The Protocol\'s base code is ancient. I know it. I… knew the people who wrote it.')],
  m3_l14_pre: [L('ione', 'Halvorsen sponsors me. They told me to break you, not beat you.'), L('ione', 'I\'m only going to beat you. Call it respect.')],
  m3_l14_post: [
    L('ione', 'Good fight. Watch your back, Nightshift. My sponsors have been asking about your gunner too.'),
    L('sys', 'SQUAD SLOT 5 unlocked. LANCER — league prize — joined the company.'),
    L('sable', 'Director Halvorsen. Impressive showing. I have a contract worth more than your hangar.'),
  ],

  // ═══ MAP 4 — KESTREL SKYPORT ═══
  m4_l1_pre: [L('sable', 'Kestrel Dynamics is smuggling something through their skyport. Find it. Halvorsen pays on proof.'), L('mags', 'I don\'t trust anyone whose company logo is a shield.')],
  m4_l1_post: [L('sys', 'WEEKLY RAID unlocked — damage the Dreadnought for big rewards.')],
  m4_l5_pre: [L('rhee', 'Mercenaries on my pads. Halvorsen sent you? Of course they did.')],
  m4_l8_post: [L('sys', 'LEAGUE DRAFT recruitment unlocked (arena tokens).')],
  m4_l10_pre: [L('tink', 'Cargo manifest says "rift-glass, 40 tonnes, Novaline Lab 9". That\'s what\'s in Hum. That purple stuff.')],
  m4_l10_post: [L('mags', 'Mags Okoro, Novaline senior engineer, Protocol team. That was me. Before.'), L('mags', 'I wrote the rules every robot fights by. Then I saw what Vane wanted them for. I ran.')],
  m4_l15_pre: [L('rhee', 'Halvorsen isn\'t your friend, merc. They\'re Novaline\'s muscle. STORMCROW, scramble.')],
  m4_l15_post: [
    L('rhee', 'Kestrel only flew the glass. Novaline makes it… makes something with it. Lab 9. Go see.'),
    L('sys', 'PRISM joined the company.'),
    L('sable', 'Contract complete. Do not go to Lab 9, Nightshift. That is not advice.'),
  ],

  // ═══ MAP 5 — THE LATTICE ═══
  m5_l1_pre: [L('mags', 'Novaline Lab 9. Quarantined three years. Officially, a reactor leak.'), L('tink', 'The robots in there are all purple. Same glow as Hum.')],
  m5_l5_pre: [L('choir', 'small one. glass one. you carry one of us.'), L('tink', 'Boss. The building is talking.')],
  m5_l8_pre: [L('choir', 'the Oracle has run this meeting a thousand times. in one of them you listen.')],
  m5_l8_post: [
    L('sys', 'ORACLE joined the company. SQUAD SLOT 6 unlocked.'),
    L('mags', 'The Experimental frames aren\'t malfunctioning. They\'re people. Minds, living in the glass.'),
    L('choir', 'we came through the tear. Novaline cut us into cores. Hum is a child of ours. you kept it safe.'),
  ],
  m5_l11_post: [L('choir', 'the tear is a door. on the other side is our home. Novaline is taking it apart.')],
  m5_l16_pre: [L('choir', 'Novaline\'s chains are still in some of us. forgive what we do next.'), L('mags', 'Break the chain, not the Choir. If that\'s possible.')],
  m5_l16_post: [
    L('choir', 'free. thank you. the door is open, little company. something is coming through from both sides.'),
    L('sys', 'PHASE joined the company.'),
    L('tink', 'The Rift\'s getting bigger. And there are… trees? On the other side?'),
  ],

  // ═══ MAP 6 — THE VERDANCE (fantasy) ═══
  m6_l1_pre: [L('sys', 'REALM SHIFT — sensors report: oxygen, birdsong, magic(?)'), L('mags', 'Nobody touch anything. Especially the glowing anything.')],
  m6_l1_post: [L('brannoch', 'Iron demons! Another wave of them! Hold the bridge, sworn of the Crown!')],
  m6_l5_pre: [L('brannoch', 'Your kind burns our forests and carves our stones into purple glass. No more.')],
  m6_l5_post: [L('brannoch', 'You… spared my knights. The iron demons never spare.'), L('mags', 'Wrong iron demons, Ser. We\'re the other kind.')],
  m6_l8_pre: [L('ysolde', 'The Crown\'s knights fight what they see. I see further. Your gunner carries a seed of our heartwood.')],
  m6_l8_post: [L('ysolde', 'Novaline\'s drones dig here. They take our heartstones home and call them glass.'), L('ysolde', 'Help us close their wound, and the Verdance will remember Nightshift.')],
  m6_l11_pre: [L('ysolde', 'The minotaur clans were bought with Novaline gold. They guard the Labyrinth Gate now.')],
  m6_l12_post: [L('sys', 'A pack of frost wolves now follows Ser Brannoch\'s banner — and yours.')],
  m6_l16_pre: [L('ysolde', 'Elderbark is older than the Crown. Novaline wrapped its roots in their chains. It does not know us.')],
  m6_l16_post: [
    L('ysolde', 'The old one sleeps clean. The Verdance owes you a debt it intends to pay.'),
    L('brannoch', 'Some of my sworn will ride with you. Through your door, into your iron city.'),
    L('sys', 'RIFT RECRUITMENT unlocked — Rift Knights, Elf Sages and Frost Wolves can now join.'),
    L('vane', 'Boss of Nightshift. You\'ve been so useful. Come home. I\'ve made the city ready for you.'),
  ],

  // ═══ MAP 7 — SPIRE WAR ═══
  m7_l1_pre: [L('mags', 'Halcyon Reach is at war. Halvorsen shield domes on every tower. Novaline flags on the rest.'), L('tink', 'And Novaline\'s squads have… minotaurs. Chained ones.')],
  m7_l6_pre: [L('sable', 'Halvorsen keeps order. Novaline pays for order. You understand, mercenary. You also sell.')],
  m7_l9_pre: [L('ione', 'Halvorsen told me to fight you one more time. I told them where to file that.'), L('ione', 'Corona\'s squad is yours for the duration. Try to keep up.')],
  m7_l12_pre: [L('jax', 'Nightshift! The Ledger owes you a rig. Thought we\'d pay in reinforcements.'), L('jax', 'Don\'t get sentimental. I hate Novaline more than I hate you.')],
  m7_l12_post: [L('ysolde', 'The bound beasts are free. They go home through the door. They will not forget.')],
  m7_l18_pre: [L('vane', 'AURELIAN is my masterpiece. Every Protocol rule, perfected. You can\'t outplay perfect.'), L('mags', 'I wrote those rules, Cassius. I left a few doors in them.')],
  m7_l18_post: [
    L('sys', 'SOVEREIGN PALADIN — Halvorsen honour guard — has defected to Nightshift.'),
    L('vane', 'Then I\'ll stop playing by the rules. I\'ll BECOME them.'),
    L('sys', 'GLOBAL PROTOCOL UPDATE IN PROGRESS. 3%… 9%… 17%…'),
  ],

  // ═══ MAP 8 — PROTOCOL CORE ═══
  m8_l1_pre: [L('mags', 'Vane uploaded himself into the Protocol. At 100%, every robot in the city obeys him. Ours too.'), L('mags', 'So we go in. Tink built a bridge. Hum is the key.')],
  m8_l5_pre: [L('prime', 'Welcome to the root directory. I am every rule you have ever fought by.')],
  m8_l10_pre: [L('mags', 'This is my old code. Somewhere in here I left a backdoor. I called it NIGHTSHIFT, if you can believe it.')],
  m8_l10_post: [L('mags', 'That\'s why I bought a dead merc licence with this name. I was waiting for someone to walk through it.')],
  m8_l14_post: [L('sys', 'PROTOCOL UPDATE: 91%… 94%…'), L('choir', 'we are with you, little company. all of us.')],
  m8_l15_pre: [L('prime', 'You can\'t delete me. I AM THE PROTOCOL.'), L('mags', 'We\'re not deleting you. We\'re patching you.')],
  m8_l15_post: [
    L('sys', 'PROTOCOL v2.0 — AUTHOR: M. OKORO / NIGHTSHIFT. CLAUSE 1: EVERY MIND MAY REFUSE AN ORDER.'),
    L('choir', 'the door stays open. not a wound now. a door.'),
    L('ysolde', 'The Verdance has its own wars, Boss. One day we may send for Nightshift.'),
    L('mags', 'Get some rest. The league season starts Monday, and we are the champions now.'),
  ],
};
export default SCENES;

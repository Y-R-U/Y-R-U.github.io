// Act 4 "The Sky Is a Screen" scripts (STORY §4, VO_LINES §3). Same beat format as story_a1.js.
// Scenes that run after a mission (the game plays them once the results card closes): a4_m1 'home' (Pod 4471),
// a4_m5 'hull' (the Breach: out through the airlock onto the hull). Extra actions (js/game/game.js): cull, halloran.

export const SCRIPTS_A4 = {
  a4_m1: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "Go home, Wren. Unplug and ride down in your frame. You've never seen the Stacks with your own eyes. Well. Its eyes." },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'hira', text: "The Stacks! HireFrame does not insure frames below street level. I'm sure it's lovely." },
    { n: 3, trigger: 'done:0', mode: 'dlg', speaker: 'rook', vo: 'a4_s01_rook_01', text: "So you're the one the whole city's pretending not to look for. Sit down. Your father owed me a drink." },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'rook', text: "Tomas Quill. Laughed too loud, ran too slow. Good man. Your pod's in the Lullaby Rest, kid. Go and look at yourself.", choices: ['You knew my father?', 'Which door?'] },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'rook', vo: 'b_rook_open_01', text: "Everything's for sale in the Stacks, friend. Even the truth. Especially the truth. Come back when you're buying." },
    // played in Pod 4471 after the results card
    { n: 10, trigger: 'home', mode: 'card', lines: ['LULLABY REST — POD 4471', 'A coffin pod with the lid open. Someone is asleep inside it. It is you.'], ms: 3800, sfx: ['pod_hum', 'heartbeat'] },
    { n: 11, trigger: 'after:10', mode: 'bark', speaker: 'hira', vo: 'b_hira_home_01', text: 'Is that... you? You look peaceful. Your vitals are fine! Mostly fine.' },
    { n: 12, trigger: 'after:11', mode: 'card', lines: ['HR 52 · DEBT 3,140 CR · RENEWAL ELIGIBLE', 'The Stacks are the rot under the utopia: power-culls, riders slumped in their frames. And this is home.'], ms: 4000 },
    { n: 13, trigger: 'after:12', mode: 'action', action: { toast: 'Home unlocked: Pod 4471', sub: 'Bed = next shift · codex wall · frame rack' } },
  ],
  a4_m2: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'harmony', vo: 'pa_curfew_01', text: 'Stack Nine is being rebalanced. Riders in Stack Nine, please rest.' },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'jun', text: "Rest. She means die. Those pods go dark, the riders don't wake up. Stack 9, Wren. Now." },
    { n: 3, trigger: 'enter:0', mode: 'action', action: { cull: [1, -48, -4] } },
    { n: 4, trigger: 'done:1', mode: 'action', action: { halloran: 'arrive' } },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'halloran', vo: 'a4_s02_halloran_01', text: 'Culling order for Stack Nine. There are people down there. I will not sign this.' },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'halloran', vo: 'b_halloran_stand_01', text: "Wardens, stand down. That's an order. We are not doing this." },
    { n: 7, trigger: 'after:6', mode: 'dlg', speaker: 'halloran', text: "You. Rental. The pumps are drowning in Rustkin. Hold the rows, then go and see what's eating the power.", choices: ['Why help me?', 'Go.'] },
    { n: 8, trigger: 'after:7', mode: 'action', action: { halloran: 'leave' } },
    { n: 9, trigger: 'wave1', mode: 'bark', speaker: 'jun', text: 'Rustkin coming up out of the sub-stack! Keep them off the pods!' },
    { n: 10, trigger: 'done:4', mode: 'bark', speaker: 'hira', text: "The big one's down! Now turn the lights back on. Please. It's very dark and I don't like it." },
    { n: 11, trigger: 'done:5', mode: 'action', action: { cull: [0] } },
    { n: 12, trigger: 'deliver', mode: 'bark', speaker: 'mara', text: "Stack 9's lit. Every pod. And Halloran walked her squad out. I'd keep an eye on that one, kiddo." },
  ],
  a4_m3: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', vo: 'b_jun_archive_01', text: 'Sixty-one years of billboards. Same number. Every single one.' },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'jun', text: 'Get me four clean shots of the countdown on Brightline. If it never moves, the whole Landfall story is a screen saver.' },
    { n: 3, trigger: 'done:1', mode: 'card', lines: ['212 YEARS TO LANDFALL', 'The same number in every archived frame, for sixty-one years.'], ms: 3200 },
    { n: 4, trigger: 'after:3', mode: 'action', action: { toast: 'Codex updated: The Stuck Clock' } },
    { n: 5, trigger: 'deliver', mode: 'bark', speaker: 'hira', text: "Uploading your photos to Jun! And... hold on. Something in my firmware is... opening?" },
    { n: 6, trigger: 'after:5', mode: 'card', lines: ['HIDDEN PARTITION · R-1 FIRMWARE', 'AUTHOR: L. VAEL'], ms: 2600 },
    { n: 7, trigger: 'after:6', mode: 'dlg', speaker: 'lyra', label: 'HIDDEN RECORDING', vo: 'a4_s03_lyra_01', text: "If you're hearing this, my love, the R-1 found you. The map is in the lullaby." },
    { n: 8, trigger: 'after:7', mode: 'dlg', speaker: 'hira', vo: 'a4_s03_hira_01', text: 'She put it in me. All this time. I think... I think I was carrying something for you.' },
    { n: 9, trigger: 'after:8', mode: 'dlg', speaker: 'jun', text: '"Go see outside." The lullaby is a route map, Wren. It points down. To where the waterfalls go.' },
  ],
  a4_m4: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', text: "Every waterfall in Halcyon drains to the same pipes. Follow the runoff. Fast, before the pumps cycle." },
    { n: 2, trigger: 'done:0', mode: 'bark', speaker: 'jun', vo: 'b_jun_pumps_01', text: "The waterfalls drain down here. And then they get pumped back up. It's a loop, Wren." },
    { n: 3, trigger: 'done:1', mode: 'card', lines: ['PUMP CONTROL · LOOP 7', 'Every waterfall in Halcyon is the same water, going round.'], ms: 3200 },
    { n: 4, trigger: 'after:3', mode: 'action', action: { toast: 'Codex updated: Waterfalls Loop' } },
    { n: 5, trigger: 'done:2', mode: 'bark', speaker: 'hira', text: '"Crew only. Auth: Vael." Well! We are a Vael. Technically. Legally unpersoned, but technically.' },
    { n: 6, trigger: 'deliver', mode: 'card', lines: ['FIRMAMENT ACCESS', 'AUTH: VAEL · ACCEPTED'], ms: 2800, sfx: ['scan'] },
    { n: 7, trigger: 'after:6', mode: 'bark', speaker: 'mara', text: "Your hand opened it. Of course it did. Don't go through alone, kiddo. Get some rest, then we climb." },
  ],
  a4_m5: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', text: 'Behind that door is the back of the sky. Climb the lattice, find the airlock. Talk to me the whole way.' },
    { n: 2, trigger: 'done:0', mode: 'bark', speaker: 'hira', text: "Up close the sun is... a lamp. A very big lamp. And the moon is a feed. On a screen. I'm fine." },
    { n: 3, trigger: 'done:2', mode: 'bark', speaker: 'jun', text: "The Keeper's down. The airlock's right there. Wren... whatever's outside, I'm with you." },
    // the Breach set piece, played on the hull after the results card
    { n: 10, trigger: 'hull', mode: 'bark', speaker: 'hira', vo: 'a4_s05_hira_01', text: "That's... not in the brochure." },
    { n: 11, trigger: 'after:10', mode: 'bark', speaker: 'jun', vo: 'a4_s05_jun_01', text: "It's a ship. The whole city. We're on a ship." },
    { n: 12, trigger: 'after:11', mode: 'card', lines: ['REVELATION', 'Halcyon is inside a starship. The sky is a screen. The "moon" is a green world, and it is right there.'], ms: 4800 },
    { n: 13, trigger: 'after:12', mode: 'action', action: { toast: 'Hullside unlocked', actEnd: 4 } },
  ],
};

export const SPEAKERS_A4 = {};

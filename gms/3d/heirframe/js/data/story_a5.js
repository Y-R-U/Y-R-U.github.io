// Act 5 "Hullside" scripts (STORY §4, VO_LINES §3). Same beat format as story_a1.js.
// Extra actions (js/game/game.js): hideCore (A5-M2 pickup), heirCore (install card).

export const SCRIPTS_A5 = {
  a5_m1: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', vo: 'a5_s01_mara_01', text: "I'm back on your comms, kiddo. For good, if you'll have me. Jun's team is at the airlock." },
    { n: 2, trigger: 'done:0', mode: 'bark', speaker: 'jun', vo: 'a5_s01_jun_01', text: "Mag boots on. Don't look up, it's very big and very green. Spur's at the far end. Wights nest in the plating." },
    { n: 3, trigger: 'after:2', mode: 'bark', speaker: 'hira', text: 'Low gravity, zero air, extremely large planet. HireFrame recommends you do not think about any of it.' },
    { n: 4, trigger: 'deliver', mode: 'bark', speaker: 'jun', text: "Docking collar's holding. Meridian's through there. Wren... that's where it happened, isn't it." },
    { n: 5, trigger: 'after:4', mode: 'action', action: { toast: 'The Meridian spur is open', sub: 'Hullside · docking collar' } },
  ],
  a5_m2: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "Meridian. Twenty-two years it's been hanging out there. Go slow, Wren. Look at everything." },
    { n: 2, trigger: 'done:0', mode: 'bark', speaker: 'hira', text: "Every name on that wall is frosted over. Except... one of them was scratched out. Eight points. Your star." },
    { n: 3, trigger: 'done:1', mode: 'dlg', speaker: 'mara', vo: 'a5_s02_mara_01', text: "He's still holding the door. Oh, Tomas." },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'mara', text: "He held it long enough for Lyra to get you out. I never knew where. Now I do." },
    { n: 5, trigger: 'done:2', mode: 'card', lines: ["CAPTAIN'S LOG · ARK HALCYON", 'DAY 164 OF YEAR 164 · SIXTY-ONE YEARS AGO'], ms: 2600 },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'elena', label: "CAPTAIN'S LOG", vo: 'a5_s02_elena_01', text: "Captain's log, day one-sixty-four. We can see it. It's green. I'm going to tell them tomorrow." },
    { n: 7, trigger: 'after:6', mode: 'bark', speaker: 'jun', vo: 'a5_s02_jun_01', text: "Sixty-one years ago. She saw it sixty-one years ago. And then nobody told anyone. Ever." },
    { n: 8, trigger: 'after:7', mode: 'action', action: { toast: "Codex updated: Elena's Last Log" } },
    { n: 9, trigger: 'done:4', mode: 'action', action: { hideCore: true } },
    { n: 10, trigger: 'after:9', mode: 'card', lines: ['THE HEIR CORE', 'It answers to your blood. HEIR PROTOCOL: ONLINE.'], ms: 2800, sfx: ['scan'] },
    { n: 11, trigger: 'after:10', mode: 'bark', speaker: 'hira', vo: 'a5_s02_hira_01', text: "Whoa. Something just plugged into the core slot and said hello. Nicely! A fourth button. For you." },
    { n: 12, trigger: 'deliver', mode: 'action', action: { toast: 'Heir Core installed', sub: '4th skill: Heir Protocol · on your core slot' } },
  ],
  a5_m3: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', vo: 'a5_s03_jun_01', text: "Your grandfather's broadcast array is still up that mast. Give me eighty seconds and it'll talk again." },
    { n: 2, trigger: 'wave1', mode: 'bark', speaker: 'choir', vo: 'b_choir_aggro_01', text: 'Return. Return. Return.' },
    { n: 3, trigger: 'done:1', mode: 'bark', speaker: 'jun', text: "Array's live! One message, the whole ship, whenever you're ready. We just need something worth saying." },
    { n: 4, trigger: 'deliver', mode: 'bark', speaker: 'mara', text: "That was the Choir. Which means she knows where you are. Rest, kiddo. She'll come." },
  ],
  a5_m4: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', text: "Three lieutenants, each carrying a piece of her chip key. Take the pieces, and she's alone out there." },
    { n: 2, trigger: 'done:1', mode: 'bark', speaker: 'hira', text: 'Chip key fragment one! It hums. Of course it hums.' },
    { n: 3, trigger: 'done:3', mode: 'bark', speaker: 'jun', text: "Two. One more and I can crack what's under the gold." },
    { n: 4, trigger: 'done:5', mode: 'bark', speaker: 'jun', vo: 'a5_s04_jun_01', text: "That's all three. And, Wren, she's here. She came to watch. Get your optics on her. Now." },
    { n: 5, trigger: 'shot:1', mode: 'card', lines: ['OPTICS · SUBSURFACE SCAN', 'Under the gold paint, scratched into the plate: an eight-pointed star.'], ms: 3000, sfx: ['scan'], action: { seraphLeaves: true } },
    { n: 6, trigger: 'after:5', mode: 'bark', speaker: 'hira', text: "That's... that's the Vael star. Wren. Why would the Concord's hunter have your family's star?" },
    { n: 7, trigger: 'after:6', mode: 'action', action: { toast: 'Codex updated: Star Under Gold' } },
  ],
  a5_m5: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "She's on the open hull and she isn't hiding. Whatever happens out there, kiddo, I'm right here." },
    // the fight's own lines come from js/game/boss.js (spawn, phase breaks, hums)
    { n: 2, trigger: 'done:1', mode: 'bark', speaker: 'seraph', vo: 'a2_s04_seraph_02', text: 'Mm... mm-mm.' },
    { n: 3, trigger: 'done:2', mode: 'card', lines: ['HARMONY CHIP · CRACKED', 'The gold goes dark. The eyes go warm.'], ms: 2600, sfx: ['power_down'] },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'lyra', vo: 'a5_s05_lyra_01', text: 'Wren? You got so... big.' },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'lyra', vo: 'a5_s05_lyra_02', text: 'I could hear you. The whole time. I kept humming so I wouldn\'t forget.', choices: ['Mum?', "I've got you."] },
    { n: 6, trigger: 'after:5', mode: 'card', lines: ['REVELATION', 'Seraph is Lyra Vael. Your mother.'], ms: 3600 },
    { n: 7, trigger: 'deliver', mode: 'card', lines: ['MERIDIAN', 'You carry her frame back to the wreck, one slow mag-step at a time.'], ms: 3000 },
    { n: 8, trigger: 'after:7', mode: 'action', action: { toast: 'Lyra Vael joins you', sub: 'Codex: Lyra is revealed', actEnd: 5 } },
  ],
};

export const SPEAKERS_A5 = {
  elena: { name: 'Capt. Elena Vael', role: 'Ark Halcyon · log entry', portrait: { kind: 'human', seed: 31, veil: 'elena' } },
  choir: { name: 'The Choir', role: '', portrait: { kind: 'gold', seed: 9, model: 'seraph' } },
};

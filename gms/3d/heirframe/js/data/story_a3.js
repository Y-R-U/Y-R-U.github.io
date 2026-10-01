// Act 3 "Little Star" scripts (STORY §4, VO_LINES §3). Same beat format as story_a1.js.
// `when: {maraTone}` plays a beat only for that choice (the contract's pick, else the saved one).
// Extra actions (js/game/game.js): joinJun, harmonyIris (A3-M5's billboards).

export const SCRIPTS_A3 = {
  a3_m1: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'kettle', vo: 'b_kettle_tip_01', text: "Word from the docks, rental. The Unlinked are hiring. Ask for the girl who talks to cranes." },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'mara', text: "Kettle's tips come with a smell. Go anyway. Portside, the Freehaul shed." },
    { n: 3, trigger: 'done:0', mode: 'dlg', speaker: 'jun', vo: 'a3_s01_jun_01', text: "You're the Vael? You're shorter than the wanted posters. It's the rental. It's definitely the rental." },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'jun', text: "Test job. One crate, shed to quay. The Silverhand cranes don't like us. Don't let them have it.", choices: ["What's in it?", 'Easy.'],
      replies: { 1: { speaker: 'jun', text: "Easy, says the rental. Oh, and my veil's pirated, so if a Warden asks, you never saw a cat." } } },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'jun', text: 'Farm stuff. Probably. Go.' },
    { n: 6, trigger: 'ambush', mode: 'bark', speaker: 'thug', vo: 'b_thug_aggro_01', text: 'That crate belongs to the Syndicate now, rental!' },
    { n: 7, trigger: 'deliver', mode: 'card', lines: ['THE CRATE SPLITS OPEN', 'Soil. Real soil, and pollen, and one seed with no Halcyon registry code.'], ms: 3400 },
    { n: 8, trigger: 'after:7', mode: 'dlg', speaker: 'jun', vo: 'a3_s01_jun_02', text: "That's soil. Real soil. Nothing in Halcyon grows in dirt like this." },
    { n: 9, trigger: 'after:8', mode: 'dlg', speaker: 'jun', text: "Right. You passed. I'm in your comms from now on. Don't make it weird." },
    { n: 10, trigger: 'after:9', mode: 'action', action: { toast: 'Codex updated: Outer Farms Soil', joinJun: true } },
  ],
  a3_m2: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', vo: 'b_jun_comms_01', text: "I'm in your comms now. Don't be weird about it." },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'jun', text: 'B4 holds the Wards registry. Two terminals, and I need you on both. Quietly.' },
    { n: 3, trigger: 'done:1', mode: 'card', lines: ['WARDS OF HARMONY · FILE 4471 · "WREN"', 'Guardian visits: yearly, on the ward\'s birthday · Visitor: M.Q.', 'Renewal eligibility: 22 years · Flag: OFFICE OF THE CHAIR'], ms: 4200 },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'jun', vo: 'a3_s02_jun_01', text: 'Guardian visits, once a year, every year, on your birthday. Initials: M.Q.' },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'jun', text: "And the Chair's office flagged you for Renewal. The Chair is Dray, Wren. Who do we know with the initials M.Q.?", choices: ['...Mara.', 'No. Not her.'] },
    { n: 6, trigger: 'after:5', mode: 'action', action: { toast: 'Codex updated: Visitor: M.Q.' } },
    { n: 7, trigger: 'deliver', mode: 'bark', speaker: 'hira', text: "Mara Quill. M.Q. I'm sure it's a coincidence! I'm... not sure it's a coincidence." },
  ],
  a3_m3: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'hira', text: "After hours at the kiosk. Should I... be here for this? I'll be here for this." },
    { n: 2, trigger: 'done:0', mode: 'dlg', speaker: 'mara', text: "Wren. You never come round after dark. ...You found the registry, didn't you." },
    { n: 3, trigger: 'after:2', mode: 'dlg', speaker: 'mara', vo: 'a3_s03_mara_01', text: "Tomas was my brother. You're his child. You're all I had left of him." },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'mara', vo: 'a3_s03_mara_02', text: 'I kept you alive. That was the deal. I never knew what he wanted you for.' },
    { n: 5, trigger: 'after:4', mode: 'bark', speaker: 'warden', text: "All units: the Heir's Ascension proceeds on Renewal Day. The ward is not to be harmed. Not a scratch." },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'mara', vo: 'a3_s03_mara_03', text: "Ascension. Renewal means Ascension. God, Wren. I'm so sorry." },
    { n: 7, trigger: 'done:1', when: { maraTone: 'cold' }, mode: 'dlg', speaker: 'mara', vo: 'a3_s03_mara_cold_01', text: "You're right. I should have. I'll earn it back, kiddo, one job at a time." },
    { n: 8, trigger: 'done:1', when: { maraTone: 'warm' }, mode: 'dlg', speaker: 'mara', vo: 'a3_s03_mara_warm_01', text: "And you were all I had. Right. Let's burn his world down, then." },
    { n: 9, trigger: 'deliver', mode: 'card', lines: ['REVELATION', 'Mara Quill is your aunt, and she has been Dray\'s handler all your life.', 'From tonight, her board works for the Unlinked.'], ms: 4400 },
    { n: 10, trigger: 'after:9', mode: 'action', action: { toast: 'Codex updated: Mara Quill, your aunt' } },
  ],
  a3_m4: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', vo: 'b_jun_chorus_01', text: "Traced your key. It wasn't a courier. It came from the top of the spire. The Chorus Tower." },
    { n: 2, trigger: 'after:1', mode: 'bark', speaker: 'mara', text: "Three relay pylons carry the Choir's signal up the spire. Break them and the stair's open. Be careful, kiddo." },
    { n: 3, trigger: 'done:1', mode: 'bark', speaker: 'harmony', fx: 'billboards_glitch', text: 'Harmony through... through... little... through unity.' },
    { n: 4, trigger: 'deliver', mode: 'bark', speaker: 'jun', text: "Signal's down to a whisper. The core's exposed. Whatever sent you that key is up there." },
  ],
  a3_m5: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "Harmony's core. Whatever you find up there, you come back down. Promise me." },
    { n: 2, trigger: 'done:1', mode: 'bark', speaker: 'hira', text: 'Core open! Also, something big and shiny is very, very upset about that.' },
    { n: 3, trigger: 'deliver', mode: 'action', action: { harmonyIris: true } },
    { n: 4, trigger: 'after:3', mode: 'bark', speaker: 'harmony', vo: 'a3_s05_harmony_01', text: 'Hello, little star.' },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'iris', vo: 'a3_s05_iris_01', text: "It's Grandma. I haven't long. Find Lyra. Then find the edge of the sky." },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'iris', text: 'I sent you the key, darling. Dray needs you for Renewal. Your mother is alive.', choices: ['Grandma?', 'How do I find her?'] },
    { n: 7, trigger: 'after:6', mode: 'dlg', speaker: 'iris', vo: 'a3_s05_iris_02', text: 'The sky is a lie, darling. The whole sky.' },
    { n: 8, trigger: 'after:7', mode: 'bark', speaker: 'harmony', vo: 'a3_s05_harmony_02', fx: 'billboards_face', text: 'Harmony through unity. Harmony through unity. Harmony through...' },
    { n: 9, trigger: 'after:8', mode: 'card', lines: ['REVELATION', 'Harmony is Iris Vael, your grandmother: captured, bound, and speaking through every billboard in the city.'], ms: 4400 },
    { n: 10, trigger: 'after:9', mode: 'action', action: { toast: 'Codex updated: "The sky is a lie"', actEnd: 3 } },
  ],
};

export const SPEAKERS_A3 = {};

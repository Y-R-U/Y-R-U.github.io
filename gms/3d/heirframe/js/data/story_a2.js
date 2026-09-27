// Act 2 "Harmony Through Unity" scripts (STORY §4, VO_LINES §2). Same beat format as story_a1.js.
// Extra actions handled by js/game/game.js: seraph (A2-M4's first appearance), fennDown (A2-M5).

export const SCRIPTS_A2 = {
  a2_m1: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: 'The Terraces. Your key said Abel Fenn kept the names. Go and find out what that means.' },
    { n: 2, trigger: 'done:0', mode: 'dlg', speaker: 'fenn', vo: 'a2_s01_fenn_02', text: 'Every plaque here had a name once. The Concord calls it tidying.' },
    { n: 3, trigger: 'after:2', mode: 'dlg', speaker: 'fenn', vo: 'a2_s01_fenn_01', text: "You have her eyes. Well, your frame doesn't. But you would.", choices: ['Whose eyes?', 'You knew my family?'] },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'fenn', text: 'Not here. The sweepers come through at noon. Walk an old man home, and keep them off him.' },
    { n: 5, trigger: 'deliver', mode: 'dlg', speaker: 'fenn', text: 'The official story is a reactor breach, and treason. Your family, blamed for Meridian. Here: one photograph they never found.' },
    { n: 6, trigger: 'after:5', mode: 'card', lines: ['A PHOTOGRAPH', 'A young engineer at a workbench, laughing. On the back: "I.V., Year 1 of the Link".'], ms: 3200 },
    { n: 7, trigger: 'after:6', mode: 'bark', speaker: 'hira', vo: 'a2_s01_hira_01', text: 'Huh! That photo lady looks just like Harmony. Lookalike! Must be a lookalike.' },
    { n: 8, trigger: 'after:7', mode: 'action', action: { toast: 'Codex updated: Young Iris' } },
  ],
  a2_m2: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "Nexus archive floor, B4. Fenn says there's a shard down there with Meridian on it. In, out, invisible." },
    { n: 2, trigger: 'enter:0', mode: 'bark', speaker: 'hira', text: "B4! Staff only! I'm going to be very, very quiet. This is me being quiet." },
    { n: 3, trigger: 'done:1', mode: 'card', lines: ['MEMORY SHARD · FRAME-CAM', 'MERIDIAN STATION · 22 YEARS AGO · GOLD FRAMES AT THE DOOR'], ms: 2800 },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'tomas', label: 'MEMORY SHARD', vo: 'a2_s02_tomas_01', text: "Lyra, take the baby, go. I'll hold the door." },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'tomas', label: 'MEMORY SHARD', vo: 'a2_s02_tomas_02', text: 'Little star, the sky is wide... little star, go see outside.' },
    { n: 6, trigger: 'after:5', mode: 'bark', speaker: 'hira', vo: 'a2_s02_hira_01', text: "That's the song. That's my hiccup song. Why do I know that song?" },
    { n: 7, trigger: 'after:6', mode: 'action', action: { toast: "Codex updated: Tomas's Shard" } },
    { n: 8, trigger: 'deliver', mode: 'bark', speaker: 'mara', text: "Gold frames at Meridian. Not a reactor. ...Come home, Wren. Don't talk to anyone on the way." },
  ],
  a2_m3: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'fenn', text: 'The gold one by the atrium fountain. It never Links out and it never rests. Follow it, and do not let it see you.' },
    { n: 2, trigger: 'shot:1', mode: 'bark', speaker: 'voice', text: 'Brother Dray sends his regards. The garden is quiet. As it should be.' },
    { n: 3, trigger: 'done:2', mode: 'bark', speaker: 'fenn', vo: 'a2_s03_fenn_01', text: "No pod. There's no body at the other end of that frame, Wren." },
    { n: 4, trigger: 'deliver', mode: 'dlg', speaker: 'fenn', vo: 'a2_s03_fenn_02', text: "I should tell you. I'm one of them too. I was dying. They offered. I'm not proud.", choices: ["You're a frame too?", 'Why tell me now?'] },
    { n: 5, trigger: 'after:4', mode: 'dlg', speaker: 'fenn', text: 'Twenty years in a body that never tires, and never quite feels anything. If they ever offer it to you, say no.' },
    { n: 6, trigger: 'after:5', mode: 'action', action: { toast: 'Codex updated: The Voice Without a Body' } },
  ],
  a2_m4: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', text: "A Concord evidence vault. Fenn's old research core is sitting in it. If this goes wrong, I never met you." },
    { n: 2, trigger: 'done:1', mode: 'bark', speaker: 'hira', text: 'Locker open! Also, heat signatures inbound. One of them is very... shiny.' },
    { n: 3, trigger: 'done:3', mode: 'action', action: { seraph: true } },
    { n: 4, trigger: 'after:3', mode: 'action', action: { toast: 'Codex updated: Seraph Hums' } },
    { n: 5, trigger: 'deliver', mode: 'bark', speaker: 'mara', text: "You're alive. Good. That thing could have finished you. Why didn't it? ...Get the core to Fenn." },
  ],
  a2_m5: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'fenn', text: "Bring it here. The decryption takes time, and they'll feel me doing it." },
    { n: 2, trigger: 'wave1', mode: 'bark', speaker: 'warden', text: 'Sweeper teams to the glasshouse. Unregistered archive activity.' },
    { n: 3, trigger: 'deliver', mode: 'dlg', speaker: 'fenn', vo: 'a2_s05_fenn_01', text: 'Iris made Ascension to save the dying. Severin made it to never die.' },
    { n: 4, trigger: 'after:3', mode: 'dlg', speaker: 'fenn', vo: 'a2_s05_fenn_02', text: 'The Voices are the Concord, Wren. Seven minds that forgot how to end.' },
    { n: 5, trigger: 'after:4', mode: 'bark', speaker: 'dray', vo: 'a2_s05_dray_01', text: 'Abel. You always did talk too much.', fx: 'billboards_face' },
    { n: 6, trigger: 'after:5', mode: 'action', action: { fennDown: true } },
    { n: 7, trigger: 'after:6', mode: 'dlg', speaker: 'fenn', vo: 'a2_s05_fenn_03', text: "Find the ones who were erased. Some of them... aren't dead." },
    { n: 8, trigger: 'after:7', mode: 'card', lines: ['REVELATION', 'The Sundering was a coup. The Voices of the Concord are Ascended minds in gold frames, and Severin Dray led them.'], ms: 4200 },
    { n: 9, trigger: 'after:8', mode: 'action', action: { toast: 'Codex updated: Dray Never Ages', actEnd: 2 } },
  ],
};

export const SPEAKERS_A2 = {
  tomas: { name: 'Tomas Quill', role: 'Memory shard', portrait: { kind: 'human', seed: 14, hue: 30 } },
  voice: { name: 'Gold frame', role: 'Voice of the Concord', portrait: { kind: 'gold', seed: 23 } },
};

// Act 6 "Heirframe" scripts (STORY §4, VO_LINES §3). Same beat format as story_a1.js.
// Extra actions (js/game/game.js + finale.js): helm (setMode), human ('on'|'off'), voicesFlee.
// a6_m5 'epilogue' runs after the results card (the city, the billboards, Mara's last line). `unveil` (D30): that last
// call is the one time anyone drops their Link veil, so it shows Mara's real face.

export const SCRIPTS_A6 = {
  a6_m1: [
    { n: 1, trigger: 'accept', mode: 'dlg', speaker: 'lyra', vo: 'a6_s01_lyra_01', text: "If no Vael sits in that chair on Renewal Day, the ship lands itself. That's why he kept you." },
    { n: 2, trigger: 'after:1', mode: 'dlg', speaker: 'lyra', vo: 'a6_s01_lyra_02', text: "He doesn't want you to sit in it. He wants to put you in it. Forever. Read the protocol. See for yourself." },
    { n: 3, trigger: 'done:1', mode: 'card', lines: ['RENEWAL PROTOCOL · HELM', 'Heir presence required: TODAY. Pending order: ASCEND HEIR INTO HELM (permanent). Signed: S. DRAY.'], ms: 3600, sfx: ['alarm'] },
    { n: 4, trigger: 'after:3', mode: 'bark', speaker: 'harmony', vo: 'pa_renewal_today', text: 'Good morning, Halcyon. Renewal Day is today.' },
    { n: 5, trigger: 'deliver', mode: 'bark', speaker: 'mara', vo: 'a6_s01_mara_01', text: "So it's today. Right. Then we go to the Helm before he does. All of us." },
  ],
  a6_m2: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'jun', text: "Seven gold seats down the nave. Seven Voices. They've been running this ship since before my gran was born." },
    { n: 2, trigger: 'done:2', mode: 'bark', speaker: 'hira', text: 'The Voice of Plenty has left the building. Permanently.' },
    { n: 3, trigger: 'done:4', mode: 'action', action: { voicesFlee: true } },
    { n: 4, trigger: 'after:3', mode: 'bark', speaker: 'lyra', vo: 'a6_s02_lyra_01', text: "Five of them are running. Let them. They'll have nowhere to hide once the sky is honest." },
    { n: 5, trigger: 'after:4', mode: 'action', action: { toast: 'Five Voices fled the Helm', sub: 'They will turn up again. Later.' } },
  ],
  a6_m3: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'lyra', text: "The ship has its own mind. Old, patient, very literal. It only talks to family. Wake it." },
    { n: 2, trigger: 'done:1', mode: 'dlg', speaker: 'helm', vo: 'a6_s03_helm_01', text: 'Welcome, Captain-heir. This vessel arrived at its destination sixty-one years, four days ago.', action: { helm: 'calm' } },
    { n: 3, trigger: 'after:2', mode: 'dlg', speaker: 'helm', vo: 'a6_s03_helm_02', text: 'Landfall has been deferred by order of the Concord twenty-two thousand, two hundred and sixty-nine times.' },
    { n: 4, trigger: 'after:3', mode: 'card', lines: ['REVELATION', 'The ark arrived sixty-one years ago. The "moon" is Verdance, and it has been waiting the whole time.'], ms: 4200 },
    { n: 5, trigger: 'after:4', mode: 'bark', speaker: 'jun', text: 'Once a day. Every day. For sixty-one years. Somebody pressed "not yet".' },
    { n: 6, trigger: 'after:5', mode: 'action', action: { toast: 'Codex updated: Landfall Deferred' } },
  ],
  a6_m4: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'helm', vo: 'a6_s04_helm_01', text: 'The Helm accepts a living body only. Frames will be refused.' },
    { n: 2, trigger: 'done:0', mode: 'card', lines: ['UNLINKING', 'For the first time in your life, you open your own eyes somewhere other than Pod 4471.'], ms: 3400, sfx: ['pod_hum', 'heartbeat'], action: { human: 'on' } },
    { n: 3, trigger: 'after:2', mode: 'bark', speaker: 'mara', vo: 'a6_s04_mara_01', text: 'Your own feet. Look at you. Slowly now, kiddo.' },
    { n: 4, trigger: 'done:1', mode: 'bark', speaker: 'lyra', vo: 'a6_s04_lyra_01', text: 'You walk like your father. All elbows. I love it.' },
    { n: 5, trigger: 'after:4', mode: 'bark', speaker: 'jun', vo: 'a6_s04_jun_01', text: "I'm not crying. The helmet's fogging. Helmets fog." },
    { n: 6, trigger: 'done:2', mode: 'bark', speaker: 'hira', vo: 'a6_s04_hira_01', text: "For the record, you're my favourite rider. Premium tier." },
    { n: 10, trigger: 'after:6', mode: 'bark', speaker: 'mara', text: "Your own face, out in the open. Nobody's seen mine in twenty years, kiddo. Maybe that's next." },
    { n: 7, trigger: 'deliver', mode: 'dlg', speaker: 'helm', vo: 'a6_s04_helm_02', text: 'Heir present. Living. Renewal may proceed.' },
    { n: 8, trigger: 'after:7', mode: 'dlg', speaker: 'dray', vo: 'a6_s04_dray_01', text: "There you are, child. Right where I needed you. Stay very still." },
    { n: 9, trigger: 'after:8', mode: 'card', lines: ['THE SOVEREIGN FRAME', 'Gold light floods the dais. Your frame beams back in around you, just in time.'], ms: 3000, sfx: ['alarm'], action: { human: 'off' } },
  ],
  a6_m5: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'lyra', text: "He's wired into Harmony, into all of it. Keep him busy. Mum's going to find the plug." },
    // Dray's phase lines are in js/game/boss.js (harmony, halo voices, Iris cuts the link)
    { n: 2, trigger: 'done:1', mode: 'card', lines: ['THE HELM', 'The Concord is dissolved. The chair is yours.'], ms: 2800 },
    { n: 3, trigger: 'done:2', when: { ending: 'open' }, mode: 'dlg', speaker: 'helm', vo: 'a6_s05_helm_open_01', text: 'Firmament disengaged. Landfall protocol initiated. Good morning, Verdance.', action: { helm: 'open' } },
    { n: 4, trigger: 'done:2', when: { ending: 'keep' }, mode: 'dlg', speaker: 'helm', vo: 'a6_s05_helm_keep_01', text: 'Renewal accepted. Captain-heir recognised. Awaiting your orders.', action: { helm: 'calm' } },
    { n: 5, trigger: 'done:3', when: { irisFate: 'fade' }, mode: 'dlg', speaker: 'iris', vo: 'a6_s05_iris_fade_01', text: "Thank you, darling. One last broadcast, then. Tell your mother I was proud. Of both of you." },
    { n: 6, trigger: 'done:3', when: { irisFate: 'frame' }, mode: 'dlg', speaker: 'iris', vo: 'a6_s05_iris_frame_01', text: "A frame. At my age. Well. I shall have to learn to walk all over again. Lead the way, little star." },
    { n: 7, trigger: 'deliver', mode: 'card', lines: ['HEIRFRAME', 'Renewal Day is over. There will not be another one.'], ms: 3400 },
    // after the results card: Aurum Plaza, the billboards, Mara's last line (by the A3-M3 choice)
    { n: 10, trigger: 'epilogue', when: { ending: 'open' }, mode: 'card', lines: ['EPILOGUE', 'The Firmament goes clear across the whole city. Everyone looks up at once. Verdance fills the sky.'], ms: 4200 },
    { n: 11, trigger: 'epilogue', when: { ending: 'keep' }, mode: 'card', lines: ['EPILOGUE', 'The sky stays on, for now. But every billboard in Halcyon is telling the truth.'], ms: 4200 },
    { n: 12, trigger: 'after:10', mode: 'bark', speaker: 'harmony', vo: 'a6_s06_harmony_01', text: 'A brighter future, together. For real this time.', fx: 'billboards_epilogue' },
    { n: 13, trigger: 'after:11', mode: 'bark', speaker: 'harmony', vo: 'a6_s06_harmony_01', text: 'A brighter future, together. For real this time.', fx: 'billboards_epilogue' },
    { n: 14, trigger: 'after:12', mode: 'action', action: { closing: true } },
    { n: 15, trigger: 'after:13', mode: 'action', action: { closing: true } },
    { n: 20, trigger: 'closing', when: { maraTone: 'cold' }, mode: 'dlg', speaker: 'mara', unveil: true, vo: 'a6_s06_mara_cold_01', text: "I said I'd earn it back one job at a time. Board's still open, kiddo. Contracts don't stop just because the sky did." },
    { n: 21, trigger: 'closing', when: { maraTone: 'warm' }, mode: 'dlg', speaker: 'mara', unveil: true, vo: 'a6_s06_mara_warm_01', text: "We burned his world down, kiddo. Now let's build a better one. Board's open. Contracts don't stop just because the sky did." },
    { n: 22, trigger: 'after:20', mode: 'action', action: { theEnd: true } },
    { n: 23, trigger: 'after:21', mode: 'action', action: { theEnd: true } },
  ],
};

export const SPEAKERS_A6 = {
  helm: { name: 'The Helm', role: 'Ship intelligence', portrait: { kind: 'unknown', seed: 41 } },
};

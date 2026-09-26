// STORY §8 script tables. trigger: event name from the mission runner, or 'after:N' to chain after beat N.
// mode: bark (subtitle + VO, play continues) | dlg (dialogue panel) | card (full-screen text) | action (no line).

export const SCRIPTS = {
  intro: [
    { n: 1, trigger: 'newGame', mode: 'card', lines: ['LULLABY REST — POD 4471', "Occupant: WARD-4471 'WREN' · Ward status: DISCHARGED (age 22) · Ward debt: 3,140 cr"], ms: 4000, sfx: ['pod_hum', 'heartbeat'] },
    { n: 2, trigger: 'after:1', mode: 'card', lines: ['LINKING… HireFrame R-1 · Aurum Plaza'], ms: 1500, fx: 'eyes_open' },
    { n: 3, trigger: 'spawn', mode: 'bark', speaker: 'hira', vo: 'a1_s00_hira_01', text: 'Good morning, valued rider! Welcome to HireFrame. Your R-1 is ready for another brighter day!' },
    { n: 4, trigger: 'after:3', mode: 'bark', speaker: 'hira', vo: 'a1_s00_hira_02', text: "Link stable. Latency: zero milliseconds! Wow, that's... unusually good. Anyway!" },
    { n: 5, trigger: 'after:4', mode: 'bark', speaker: 'harmony', vo: 'a1_s00_harmony_01', text: 'Good morning, Halcyon. Renewal Day is one hundred days away. Two hundred and twenty-five years of unity. The journey continues.', fx: 'billboards_face' },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'mara', vo: 'a1_s00_mara_01', text: "Wren? It's Mara. Quill Contracts, the kiosk by the fountain. You said you wanted work." },
    { n: 7, trigger: 'after:6', mode: 'dlg', speaker: 'mara', vo: 'a1_s00_mara_02', text: "I've got a parcel that needs legs. Yours are rented, but they'll do.",
      choices: ['On my way.', 'How much does it pay?'], replies: { 1: { speaker: 'mara', text: 'Enough for rent. Barely. Move.' } } },
    { n: 8, trigger: 'after:7', mode: 'bark', speaker: 'hira', vo: 'a1_s00_hira_03', text: 'Tip! Drag the left side of the screen to walk…', action: { tutorial: 'move', marker: 'mara_kiosk' } },
    { n: 9, trigger: 'reachKiosk', mode: 'action', action: { openBoard: true, highlight: 'a1_m1', tutorial: 'accept' } },
  ],
  a1_m1: [
    { n: 1, trigger: 'accept', mode: 'bark', speaker: 'mara', vo: 'a1_s01_mara_01', text: 'Locker seven, north side…' },
    { n: 2, trigger: 'pickup', mode: 'bark', speaker: 'hira', vo: 'a1_s01_hira_01', text: 'Parcel acquired! Did you know HireFrame Premium riders get a complimentary shoulder bag?' },
    { n: 3, trigger: 'ambush', mode: 'bark', speaker: 'hira', vo: 'a1_s02_hira_01', text: 'Uh-oh! Scrap rats! Tap attack…', action: { tutorial: 'attack' } },
    { n: 4, trigger: 'ambushCleared', mode: 'bark', speaker: 'mara', vo: 'a1_s02_mara_01', text: 'Rats out of the drains in broad daylight…' },
    { n: 5, trigger: 'deliver', mode: 'dlg', speaker: 'hira', vo: 'a1_s03_hira_01', text: 'Drop-locker twelve! Scanning recipient... recipient is... you?', fx: 'vael_star_holo' },
    { n: 6, trigger: 'after:5', mode: 'dlg', speaker: 'iris', label: 'UNKNOWN RECORDING', portrait: 'heir_key', vo: 'a1_s03_iris_01', text: "Happy birthday, little star. Don't let them see this." },
    { n: 7, trigger: 'after:6', mode: 'bark', speaker: 'hira', vo: 'a1_s03_hira_02', text: '(hums two notes) …Oh! Sorry! Firmware hiccup!' },
    { n: 8, trigger: 'after:7', mode: 'dlg', speaker: 'mara', vo: 'a1_s04_mara_01', text: "That's not on my manifest. Who sends a Ward a birthday present?", choices: ['No idea.', 'Someone who knows my birthday.'] },
    { n: 9, trigger: 'after:8', mode: 'dlg', speaker: 'mara', vo: 'a1_s04_mara_02', text: "Keep it in your pocket, kid… The board's yours." },
    { n: 10, trigger: 'after:9', mode: 'action', action: { results: true, toast: 'Codex updated: The Heir-Key', clue: 'C01', storyNext: 'a1_m2', unlockBoard: true } },
  ],
};

export const SPEAKERS = {
  mara: { name: 'Mara Quill', role: 'Quill Contracts', portrait: { kind: 'human', seed: 11, hue: 30 } },
  hira: { name: 'HIRA', role: 'HireFrame Rental Assistant', portrait: { kind: 'rental', seed: 3 } },
  harmony: { name: 'Harmony', role: 'Civic AI', portrait: { kind: 'gold', seed: 1 } },
  iris: { name: 'Dr. Iris Vael', role: '', portrait: { kind: 'unknown', seed: 7 } },
  dray: { name: 'Archon Dray', role: 'Chair of the Concord', portrait: { kind: 'gold', seed: 2 } },
  lyra: { name: 'Lyra Vael', role: '', portrait: { kind: 'ghost', seed: 5 } },
  seraph: { name: 'Seraph', role: '', portrait: { kind: 'gold', seed: 9 } },
  kettle: { name: 'Big Kettle', role: 'Silverhand Syndicate', portrait: { kind: 'black', seed: 4 } },
  fenn: { name: 'Dr. Abel Fenn', role: 'Retired archivist', portrait: { kind: 'human', seed: 8 } },
  jun: { name: 'Jun Okafor', role: 'The Unlinked', portrait: { kind: 'human', seed: 12 } },
  halloran: { name: 'Warden-Captain Halloran', role: 'Concord security', portrait: { kind: 'robot', seed: 6 } },
  rook: { name: 'Rook', role: 'Info broker', portrait: { kind: 'robot', seed: 13 } },
};

// STORY §6: clues, family-tree nodes, places. Node states: unknown → rumoured → revealed → complete.
// Each node: rumouredBy / revealedBy = story mission id or reveal id (R1..R7); complete = all its clues found.

export const PEOPLE = [
  { id: 'elena', name: 'Capt. Elena Vael', rumouredName: 'The Founder', role: 'Founding captain of the ark', gen: 0, parents: [], rumouredBy: 'R5', revealedBy: 'a5_m2', portrait: 'unknown', years: '225 years ago', bio: 'Launched the ark and genome-locked the Helm to her bloodline.' },
  { id: 'lineage', name: '… five generations …', role: 'collapsed', gen: 1, parents: ['elena'], collapsed: true, rumouredBy: 'R5', revealedBy: 'R5' },
  { id: 'iris', name: 'Dr. Iris Vael (née Hale)', rumouredName: 'The engineer in the photo', role: 'Grandmother · inventor of the Link', gen: 2, parents: [], partner: 'aurel', rumouredBy: 'a2_m1', revealedBy: 'R4', portrait: 'human' },
  { id: 'aurel', name: 'Aurel Vael', rumouredName: '? Vael', role: "Grandfather · the captain's heir", gen: 2, parents: ['lineage'], partner: 'iris', rumouredBy: 'R2', revealedBy: 'a5_m2', portrait: 'human' },
  { id: 'dray', name: 'Archon Severin Dray', role: "Chair of the Concord · Iris's protégé", gen: 2, parents: [], rumouredBy: 'a2_m3', revealedBy: 'R2', portrait: 'gold', antagonist: true, link: { to: 'iris', kind: 'protégé' } },
  { id: 'tomas', name: 'Tomas Quill', rumouredName: '?', role: 'Father', gen: 3, parents: [], partner: 'lyra', rumouredBy: 'a1_m5', revealedBy: 'a2_m2', portrait: 'human' },
  { id: 'lyra', name: 'Lyra Vael', rumouredName: '? Vael', role: 'Mother · designer of the Ghost frame', gen: 3, parents: ['iris', 'aurel'], partner: 'tomas', rumouredBy: 'a1_m5', revealedBy: 'R6', portrait: 'ghost', alias: 'Seraph' },
  { id: 'mara', name: 'Mara Quill', role: 'Fixer', revealedRole: "Aunt · Tomas's sister", gen: 3, parents: [], sibling: 'tomas', rumouredBy: 'start', revealedBy: 'R3', portrait: 'human' },
  { id: 'wren', name: 'Wren', role: 'You', gen: 4, parents: ['lyra', 'tomas'], you: true, rumouredBy: 'start', revealedBy: 'a1_m1', portrait: 'rental' },
];

export const PLACES = [
  { id: 'halcyon', name: 'Halcyon', blurb: 'A gleaming city under a warm sun.', revealedBlurb: 'The inside of a generation ark, 40 km long.', revealedBy: 'R5' },
  { id: 'meridian', name: 'Meridian', blurb: 'Site of the reactor breach, 22 years ago.', revealedBlurb: 'The Landfall-prep station where the Sundering happened.', revealedBy: 'a5_m2' },
  { id: 'verdance', name: 'Verdance', blurb: 'The pale moon.', revealedBlurb: 'A living green world. The ark arrived 61 years ago.', revealedBy: 'R7' },
  { id: 'vael', name: 'House Vael', blurb: 'An eight-pointed star, erased from every plaque.', revealedBy: 'a1_m5' },
];

// node: a PEOPLE/PLACES id this clue attaches to
export const CLUES = [
  { id: 'C01', name: 'The Heir-Key', source: 'a1_m1', node: 'wren', text: "A star-shaped data key, warm to the touch. 'Happy birthday, little star.'" },
  { id: 'C02', name: "Tinsel's Scan", source: 'a1_m2', node: 'lyra', text: 'Fragment: ...AEL — HEIR PROTOCOL — ACCESS DENIED.' },
  { id: 'C03', name: 'Stuttering Billboard', source: 'a1_m3', node: 'iris', text: "A Harmony billboard glitched and said 'little star'. Probably nothing." },
  { id: 'C04', name: '"His Stubbornness"', source: 'a1_m4', node: 'mara', text: "Mara said I have 'his' stubbornness. Whose?" },
  { id: 'C05', name: 'The Vael Star', source: 'a1_m5', node: 'vael', text: 'Eight-pointed star, erased from every plaque in the city.' },
  { id: 'C06', name: 'Young Iris', source: 'a2_m1', node: 'iris', text: 'A photo of a young engineer. She has the Harmony face.' },
  { id: 'C07', name: "Tomas's Shard", source: 'a2_m2', node: 'tomas', text: "'I'll hold the door.' My father. He hummed my lullaby." },
  { id: 'C08', name: 'The Voice Without a Body', source: 'a2_m3', node: 'dray', text: 'Gold frames with no pod on the other end.' },
  { id: 'C09', name: 'Seraph Hums', source: 'a2_m4', node: 'lyra', text: 'She could have killed me. She hummed instead.' },
  { id: 'C10', name: 'Dray Never Ages', source: 'a2_m5', node: 'dray', text: 'Forty years of billboards. Not one line on his face.' },
  { id: 'C11', name: 'Outer Farms Soil', source: 'a3_m1', node: 'halcyon', text: 'Soil with pollen from no plant in the registry.' },
  { id: 'C12', name: 'Visitor: M.Q.', source: 'a3_m2', node: 'mara', text: 'Someone visited me every birthday for 22 years.' },
  { id: 'C13', name: '"The sky is a lie"', source: 'a3_m5', node: 'iris', text: "Grandma's last words before Harmony took her back." },
  { id: 'C14', name: 'The Stuck Clock', source: 'a4_m3', node: 'halcyon', text: '212 YEARS TO LANDFALL. For 61 years.' },
  { id: 'C15', name: 'Waterfalls Loop', source: 'a4_m4', node: 'halcyon', text: 'Every waterfall in Halcyon is the same water, going round.' },
  { id: 'C16', name: "Elena's Last Log", source: 'a5_m2', node: 'elena', text: "'We can see it. It's green.' Dated 61 years ago." },
  { id: 'C17', name: 'Star Under Gold', source: 'a5_m4', node: 'lyra', text: "Under Seraph's gold paint: the Vael star." },
  { id: 'C18', name: 'Landfall Deferred', source: 'a6_m3', node: 'verdance', text: 'Deferred 22,269 times. Once a day, every day.' },
  // Echo clues: 3% from contracts in story-relevant districts, each unique once
  { id: 'E01', name: "Aurel's Garden Letter", source: 'echo', node: 'aurel', districts: ['terraces'], text: 'A letter to Iris about planting things that take a hundred years to grow.' },
  { id: 'E02', name: 'Mara and Tomas as Kids', source: 'echo', node: 'mara', districts: ['portside', 'stacks'], text: 'Two kids on a pod-row roof, pointing at the moon.' },
  { id: 'E03', name: "Elena's Launch-Day Log", source: 'echo', node: 'elena', districts: ['spine', 'hullside'], text: "'We leave the old world with everything we could carry, and a promise.'" },
  { id: 'E04', name: "Iris's Link Patent", source: 'echo', node: 'iris', districts: ['arcology'], text: 'Link Patent No. 1. Filed under a maiden name: Hale.' },
  { id: 'E05', name: "Lyra's Ghost-Frame Blueprint", source: 'echo', node: 'lyra', districts: ['arcology', 'portside'], text: 'A slim frame with no face. The margin says: for the quiet ones.' },
  { id: 'E06', name: "Dray's First Ascension", source: 'echo', node: 'dray', districts: ['arcology', 'helm'], text: 'A consent form, signed in a steady hand. The witness line is blank.' },
  { id: 'E07', name: 'The First Voice', source: 'echo', node: 'dray', districts: ['brightline', 'arcology'], text: "A gold frame's maintenance log. No body on file. Ever." },
  { id: 'E08', name: "Halloran's Service File", source: 'echo', node: 'halcyon', districts: ['arcology', 'stacks'], text: 'Commendations for twenty years. One reprimand: "asked why".' },
  { id: 'E09', name: 'Founding of the Unlinked', source: 'echo', node: 'tomas', districts: ['stacks'], text: 'A flyer. Two names at the bottom: Rook, and T. Quill.' },
  { id: 'E10', name: 'HIRA Training Transcript', source: 'echo', node: 'lyra', districts: ['aurum_plaza', 'brightline'], text: 'An R-1 firmware test log. Someone hid a lullaby in the checksum.' },
  { id: 'E11', name: "Fenn's Diary", source: 'echo', node: 'iris', districts: ['terraces'], text: "'Iris would have hated what they made of her work.'" },
  { id: 'E12', name: "The Lullaby's Origin", source: 'echo', node: 'elena', districts: ['meridian', 'hullside'], text: 'Little star, the sky is wide. Sung on the ark for 225 years.' },
];

export const REVEALS = {
  R1: { id: 'R1', mission: 'a1_m5', title: 'You are a Vael.' },
  R2: { id: 'R2', mission: 'a2_m5', title: 'The Sundering was a coup.' },
  R3: { id: 'R3', mission: 'a3_m3', title: 'Mara is your aunt.' },
  R4: { id: 'R4', mission: 'a3_m5', title: 'Harmony is your grandmother.' },
  R5: { id: 'R5', mission: 'a4_m5', title: 'Halcyon is a starship.' },
  R6: { id: 'R6', mission: 'a5_m5', title: 'Seraph is your mother.' },
  R7: { id: 'R7', mission: 'a6_m3', title: 'The ark arrived 61 years ago.' },
};

export const ECHO_CHANCE = 0.03;

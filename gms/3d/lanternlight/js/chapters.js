export const CHAPTERS = [
  {
    id: 'garden', num: 'Chapter One', title: 'The Night Garden', env: 'garden', palette: 'garden', music: 'garden', mode: 'run',
    length: 540, speed: 7.2, width: 2.6, seed: 11, drain: 0.5, startClear: 40, checkpoints: [180, 360],
    rules: [
      { k: 'line', w: 3, to: 150 }, { k: 'weave', w: 2 },
      { k: 'arc', w: 3, from: 140 }, { k: 'rocks', w: 2, from: 90 },
      { k: 'hush', w: 3, from: 230 }, { k: 'pool', w: 1, from: 330 },
    ],
    events: [
      { s: 12, say: 'e_ch1' },
      { s: 48, say: 'e_firefly' },
      { s: 136, hint: 'Tap anywhere to jump', say: 'e_jump' },
      { s: 226, hint: 'Tap the lantern to SHINE', say: 'e_shine', shineTut: true },
      { s: 505, say: 'e_ch1end' },
    ],
  },
  {
    id: 'river', num: 'Chapter Two', title: 'Lantern River', env: 'river', palette: 'river', music: 'river', mode: 'boat',
    length: 680, speed: 8.6, width: 3.4, seed: 23, drain: 0.75, startClear: 35, checkpoints: [230, 460],
    rules: [
      { k: 'line', w: 2 }, { k: 'weave', w: 3 }, { k: 'rocks', w: 4 }, { k: 'arc', w: 2, from: 120 },
      { k: 'hush', w: 2, from: 160 }, { k: 'hush2', w: 1, from: 380 },
    ],
    events: [
      { s: 10, say: 'e_ch2' },
      { s: 620, say: 'e_seepip' },
    ],
  },
  {
    id: 'sky', num: 'Chapter Three', title: 'The Drifting Isles', env: 'sky', palette: 'sky', music: 'sky', mode: 'glide',
    length: 760, speed: 11, width: 3.2, seed: 37, drain: 0.7, startClear: 45, checkpoints: [260, 520],
    rules: [
      { k: 'weave', w: 3 }, { k: 'ring', w: 3 }, { k: 'line', w: 1 },
      { k: 'storm', w: 3, from: 110 }, { k: 'hush', w: 2, from: 300 },
    ],
    events: [
      { s: 8, say: 'e_ch3' },
      { s: 40, hint: 'Drag up and down to glide' },
      { s: 190, say: 'p_ch3' },
      { s: 430, say: 'p_ch3q', then: 'e_ch3reply' },
    ],
  },
  {
    id: 'hush', num: 'Chapter Four', title: 'The Hush', env: 'hush', palette: 'hush', music: 'hush', mode: 'run',
    length: 640, speed: 7.4, width: 2.6, seed: 41, drain: 1.05, startClear: 30, checkpoints: [220, 440],
    rules: [
      { k: 'line', w: 2 }, { k: 'weave', w: 2 }, { k: 'hush', w: 4 }, { k: 'hush2', w: 2, from: 200 },
      { k: 'thorns', w: 2 }, { k: 'pool', w: 2, from: 120 }, { k: 'arc', w: 2 },
    ],
    events: [
      { s: 10, say: 'e_ch4' },
      { s: 140, say: 'p_ch4' },
      { s: 440, boss: true, music: 'final' },
      { s: 470, say: 'e_ch4mid' },
    ],
  },
  {
    id: 'dawn', num: 'Chapter Five', title: 'Home by Morning', env: 'dawn', palette: 'dawn', music: 'title', mode: 'ride',
    length: 460, speed: 12, width: 4, seed: 53, drain: 0, startClear: 20, checkpoints: [],
    rules: [{ k: 'weave', w: 3 }, { k: 'line', w: 2 }, { k: 'ring', w: 2 }],
    events: [
      { s: 20, say: 'b_end', then: 'e_end' },
      { s: 250, say: 'p_again', then: 'e_nope' },
    ],
  },
];

export const SPEAKERS = { e: null, p: 'Pip', b: 'Bean', n: 'Narrator' };

export const LINES = {};
export function loadLines(manifest) {
  for (const [file, m] of Object.entries(manifest)) {
    const key = file.replace(/(_ivy|_rowan)?\.mp3$/, '');
    LINES[key] = m.text;
  }
}

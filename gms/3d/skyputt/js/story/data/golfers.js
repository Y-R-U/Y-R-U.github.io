// AI golfers (PLAN 2.6) as data: skill 0..1 and a personality id the ai agent's planner understands.
// D14: skill ≤ 0.9; the Muni rival sits at 0.3–0.4 and the Muni Open field under 0.5 (ai_test: 0.3 ≈ +1.3/hole).
// personality: careful | power | banks | lucky | pro (+ the ai agent's professor | zoe | mags)
// story2: each later tour has its own rival (a step up per chapter) and a stronger field. Characters who
// come back later (Lou, Banks, Bertha) get a new entry per tour so earlier events keep their old skill.
// `who` = the CHARACTERS id that speaks for this golfer (portraits / dialogue).
export const GOLFERS = {
  // ---- ch1 Muni (field 0.22–0.46, rival 0.36)
  carl:   { name: 'Careful Carl',  personality: 'careful', skill: 0.36, colour: '#c9d36a', who: 'carl' },
  bertha: { name: 'Big Bertha',    personality: 'power',   skill: 0.42, colour: '#ff7a6b', who: 'bertha' },
  banks:  { name: 'Banks',         personality: 'banks',   skill: 0.34, colour: '#7fd1ff', who: 'banks' },
  lou:    { name: 'Lucky Lou',     personality: 'lucky',   skill: 0.28, colour: '#c58cff', who: 'lou' },
  pip:    { name: 'Pip Novak',     personality: 'careful', skill: 0.22, colour: '#9be8b0' },
  gus:    { name: 'Gus the Groundskeeper', personality: 'banks', skill: 0.26, colour: '#e0b070' },
  dot:    { name: 'Dot Fairweather', personality: 'lucky', skill: 0.46, colour: '#ffb8d8' },
  pro:    { name: 'The Pro',       personality: 'pro',     skill: 0.9, colour: '#f2c75c', who: 'pro' },   // cameo (tests)

  // ---- ch2 Club Tour (field 0.30–0.52, rival Lou 0.46)
  lou_club:    { name: 'Lucky Lou',      personality: 'lucky',   skill: 0.46, colour: '#c58cff', who: 'lou' },
  carl_club:   { name: 'Careful Carl',   personality: 'careful', skill: 0.42, colour: '#c9d36a', who: 'carl' },
  hattie:      { name: 'Hattie Cloudbury', personality: 'careful', skill: 0.38, colour: '#f4d58a' },
  fitz:        { name: 'Fitz Larkspur',  personality: 'power',   skill: 0.34, colour: '#ff9f6b' },
  opal:        { name: 'Opal Wicket',    personality: 'banks',   skill: 0.44, colour: '#8fd0c8' },
  milo:        { name: 'Milo Breeze',    personality: 'zoe',     skill: 0.30, colour: '#ff8fd0' },
  dot_club:    { name: 'Dot Fairweather', personality: 'lucky',  skill: 0.50, colour: '#ffb8d8' },

  // ---- ch3 Regional Cup (field 0.40–0.62, rival Banks 0.56)
  banks_reg:   { name: 'Remy Banks',     personality: 'banks',   skill: 0.56, colour: '#7fd1ff', who: 'banks' },
  lou_reg:     { name: 'Lucky Lou',      personality: 'lucky',   skill: 0.50, colour: '#c58cff', who: 'lou' },
  ivy:         { name: 'Ivy Kestrel',    personality: 'professor', skill: 0.48, colour: '#4fd6d6' },
  stan:        { name: 'Stan Underhill', personality: 'careful', skill: 0.44, colour: '#b9c46a' },
  rosa:        { name: 'Rosa Silva',     personality: 'power',   skill: 0.52, colour: '#ff6b6b' },
  kai:         { name: 'Kai Tanaka',     personality: 'zoe',     skill: 0.42, colour: '#ff7fc4' },
  gwen:        { name: 'Gwen Penhallow', personality: 'pro',     skill: 0.40, colour: '#e6c86a' },
  hugo:        { name: 'Hugo Ashdown',   personality: 'banks',   skill: 0.60, colour: '#a6b8ff' },
  tess:        { name: 'Tess Brightwater', personality: 'lucky', skill: 0.46, colour: '#d6a6ff' },

  // ---- ch4 National Tour (field 0.48–0.70, rival Bertha 0.66)
  bertha_nat:  { name: 'Big Bertha',     personality: 'power',   skill: 0.66, colour: '#ff7a6b', who: 'bertha' },
  banks_nat:   { name: 'Remy Banks',     personality: 'banks',   skill: 0.60, colour: '#7fd1ff', who: 'banks' },
  vera:        { name: 'Vera Castellan', personality: 'pro',     skill: 0.62, colour: '#f0d27a' },
  otis:        { name: 'Otis Rookwood',  personality: 'careful', skill: 0.54, colour: '#a8c070' },
  yuki:        { name: 'Yuki Nakamura',  personality: 'professor', skill: 0.58, colour: '#5fd0e0' },
  wren:        { name: 'Wren Sparrow',   personality: 'zoe',     skill: 0.50, colour: '#ff8ad8' },
  dex:         { name: 'Dex Delacroix',  personality: 'power',   skill: 0.56, colour: '#ff9a5a' },
  june:        { name: 'June Hollis',    personality: 'lucky',   skill: 0.52, colour: '#c8a0ff' },
  basil:       { name: 'Basil Marrow',   personality: 'banks',   skill: 0.48, colour: '#9ad0ff' },

  // ---- ch5 World Tour (field 0.58–0.80, rival The Pro 0.76)
  pro_world:   { name: 'Sterling Vance', personality: 'pro',     skill: 0.74, colour: '#f2c75c', who: 'pro' },
  bertha_world:{ name: 'Big Bertha',     personality: 'power',   skill: 0.70, colour: '#ff7a6b', who: 'bertha' },
  professor:   { name: 'The Professor',  personality: 'professor', skill: 0.72, colour: '#4fd6d6' },
  zoe:         { name: 'Zippy Zoe',      personality: 'zoe',     skill: 0.64, colour: '#ff6fc8' },
  nico:        { name: 'Nico Lindqvist', personality: 'careful', skill: 0.66, colour: '#b0d070' },
  ezra:        { name: 'Ezra Okafor',    personality: 'banks',   skill: 0.62, colour: '#80c8ff' },
  lena:        { name: 'Lena Moreno',    personality: 'pro',     skill: 0.68, colour: '#ffd890' },
  arlo:        { name: 'Arlo Featherstone', personality: 'lucky', skill: 0.60, colour: '#d0a0ff' },
  rhea:        { name: 'Rhea Gale',      personality: 'power',   skill: 0.58, colour: '#ff8060' },
  sol:         { name: 'Sol Haverford',  personality: 'professor', skill: 0.64, colour: '#60d8c8' },
  lou_world:   { name: 'Lucky Lou',      personality: 'lucky',   skill: 0.62, colour: '#c58cff', who: 'lou' },

  // ---- ch6 Legends (field 0.66–0.84, final rival Mags 0.86)
  mags_legend: { name: 'Old Mags',       personality: 'mags',    skill: 0.84, colour: '#e8e0c8', who: 'mags' },
  pro_legend:  { name: 'Sterling Vance', personality: 'pro',     skill: 0.80, colour: '#f2c75c', who: 'pro' },
  prof_legend: { name: 'The Professor',  personality: 'professor', skill: 0.76, colour: '#4fd6d6' },
  bertha_legend: { name: 'Big Bertha',   personality: 'power',   skill: 0.74, colour: '#ff7a6b', who: 'bertha' },
  banks_legend:  { name: 'Remy Banks',   personality: 'banks',   skill: 0.72, colour: '#7fd1ff', who: 'banks' },
  zoe_legend:  { name: 'Zippy Zoe',      personality: 'zoe',     skill: 0.70, colour: '#ff6fc8' },
  lou_legend:  { name: 'Lucky Lou',      personality: 'lucky',   skill: 0.68, colour: '#c58cff', who: 'lou' },
  carl_legend: { name: 'Careful Carl',   personality: 'careful', skill: 0.66, colour: '#c9d36a', who: 'carl' },
  ada:         { name: 'Ada Quill',      personality: 'pro',     skill: 0.78, colour: '#ffe08a' },
};

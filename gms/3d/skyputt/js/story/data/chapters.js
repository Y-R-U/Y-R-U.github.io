// The career: chapters = tours (PLAN 2.5). A chapter without `data` is shown locked "coming soon".
// story2: a tour opens once the previous tour's rival is beaten (career.js chapterOpen); finishing a
// tour grants its rank (rankOnFinish) or, for the World Tour, only a trophy.
import muni from './ch1_muni.js';
import club from './ch2_club.js';
import regional from './ch3_regional.js';
import national from './ch4_national.js';
import world from './ch5_world.js';
import legends from './ch6_legends.js';
import grand from './ch7_grand.js';   // story7: Reef → Star → Jungle, three rivals, opens after the Legends

export const RANKS = ['Nobody', 'Amateur', 'Club Player', 'Semi-pro', 'Pro', 'Legend'];

export const CHAPTERS = [
  { id: 'muni', name: 'Muni', data: muni },
  { id: 'club', name: 'Club Tour', data: club },
  { id: 'regional', name: 'Regional Cup', data: regional },
  { id: 'national', name: 'National Tour', data: national },
  { id: 'world', name: 'World Tour', data: world },
  { id: 'legends', name: 'Legends', data: legends },
  { id: 'grand', name: 'Grand Tour', data: grand },
];

// The career: chapters = tours (PLAN 2.5). A chapter without `data` is shown locked "coming soon".
import muni from './ch1_muni.js';

export const RANKS = ['Nobody', 'Amateur', 'Club Player', 'Semi-pro', 'Pro', 'Legend'];

export const CHAPTERS = [
  { id: 'muni', name: 'Muni', data: muni },
  { id: 'club', name: 'Club Tour' },
  { id: 'regional', name: 'Regional Cup' },
  { id: 'national', name: 'National Tour' },
  { id: 'world', name: 'World Tour' },
  { id: 'legends', name: 'Legends' },
];

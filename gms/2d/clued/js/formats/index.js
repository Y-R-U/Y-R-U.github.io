// Every format module the shell loads. Lanes append a path to MODULES (relative to this file) and say so in notes.
// Loaded with allSettled so one broken format can't stop the game booting.
import { BUILD } from '../build.js?v=1';

export const MODULES = [
  './mc.js',
  './tf.js',
  '../audio/listen.js',
  '../geo/formats/map-click.js',
  '../geo/formats/city-pick.js',
  '../geo/formats/continent.js',
  '../geo/formats/water-click.js',
  '../geo/formats/pin-drop.js',
  '../geo/formats/neighbours.js',
  '../geo/formats/flag-map.js',
];

export async function loadFormats() {
  const res = await Promise.allSettled(MODULES.map(p => import(`${p}?v=${BUILD}`)));
  const failed = [];
  res.forEach((r, i) => { if (r.status === 'rejected') { failed.push(MODULES[i]); console.error('[clued] format failed', MODULES[i], r.reason); } });
  return { failed };
}

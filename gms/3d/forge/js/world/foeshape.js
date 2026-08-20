// Which bestiary rows the robed rig can body, and the proportions each one is. Split out of
// robed.js for the reason roster.js is split out of vermin.js: that file imports three, and
// "the spawner cannot place a Watchman" is invisible from every side except this one.

import { FIGURE } from './figure.js';
import { ACT } from '../sim/foes.js';

// `tall`/`wide`/`hem`/`hood`/`mantle` stretch the shared profile; `scale` is the whole body
// afterwards; `run` is what js/sim/foes.js chases at. `stone` lifts the robe toward the same zone's
// own masonry and `shade` darkens it — both derived from zones.js, neither adding a colour to it.
//
// A palette is fixed by who the enemy is, not by the ground it stands on: a raider is a Blackstone
// raider wherever it raids, and the Watch has to be the same silhouette in every town or avoiding
// it while disguised is guesswork.
export const FOES = {
  raider: { zone: 'dark', shade: 0.86, run: 4.4, tall: 0.97, hem: 1.16, hood: 0.94, scale: 1.00, staff: 'spike', ragged: true },
  // Aaron's "short round cloak blob monster with eyes": the same profile squashed and widened
  // until the hood sits straight on the hem and there is no body between them.
  hollow: { zone: 'dark', shade: 0.42, run: 3.1, tall: 0.60, wide: 1.46, hem: 1.34, hood: 1.32, scale: 1.06 },
  watchman: { zone: 'dark', stone: 0.62, run: 4.9, tall: 1.14, wide: 0.95, hem: 0.94, hood: 1.02, mantle: 1.20,
    scale: 1.06, staff: 'lamp' },
  // One champion per town, told apart by palette first and bulk second. `champion_3` is the only
  // one the corpus fields — N21, after ten Watchmen — so it is Blackstone's. Whose the other two
  // are has no source but this; see NOTES_ENEMIES.md.
  champion_1: { zone: 'light', run: 4.3, tall: 1.08, wide: 1.10, hem: 1.10, hood: 1.08, mantle: 1.30, scale: 1.28, staff: 'bulb' },
  champion_2: { zone: 'neutral', run: 4.5, tall: 1.02, wide: 1.20, hem: 1.26, hood: 1.12, mantle: 1.06, scale: 1.34, staff: 'fork' },
  champion_3: { zone: 'dark', run: 4.7, tall: 1.16, wide: 1.10, hem: 1.06, hood: 1.10, mantle: 1.22, scale: 1.44, staff: 'spike' },
};

export const isRobed = enemy => !!FOES[enemy];

// How far up the staff a lamp is carried, before the figure's own stretch.
export const LAMP_STAFF = 1.96;
export const CAGE = [0.03, 0.20];

// The hem widens toward the ground and the chest ring barely moves, so a wide hem is a cloak
// rather than a barrel. 1.5 rather than linear because the fold term already flares the bottom ring.
export function shapeOf(v, base = FIGURE) {
  const tall = v.tall ?? 1, wide = v.wide ?? 1, hem = v.hem ?? 1, hd = v.hood ?? 1;
  const flare = y => 1 + (hem - 1) * Math.pow(Math.max(0, 1 - y / base.shoulder), 1.5);
  return {
    robe: base.robe.map(R => ({ ...R, y: R.y * tall, r: R.r * wide * flare(R.y) })),
    hood: base.hood.map((R, i) => ({
      ...R, y: R.y * tall, r: R.r * hd * (i === 0 ? (v.mantle ?? 1) : 1),
      dx: R.dx * hd, dz: R.dz * hd, dy: R.dy * tall,
    })),
    apex: [base.apex[0] * hd, base.apex[1] * tall, base.apex[2] * hd],
    shoulder: base.shoulder * tall,
    under: base.under * tall,
    cavity: base.cavity * hd,
  };
}

// The flame's seat in the figure's own stretched frame — inside the cage, or the one thing that
// makes a Watchman visible across a street is hanging off the end of a stick.
export const lampAt = v =>
  [-0.255 * (v.wide ?? 1), (LAMP_STAFF + 0.12) * (v.tall ?? 1), 0.045 * (v.wide ?? 1)];

// Who is carrying a light, and how many of those lights are drawn. `cost()` and `drawLamps` both
// read the second one, or the readout goes on claiming two draws the knob has already put out.
export const carriesLamp = a => a.enemy === 'watchman' && a.act !== ACT.die;
export const lampCount = (wanted, level, cap) => (level > 0 ? Math.min(wanted, cap) : 0);

// Height and shoulder width of a finished body, for the silhouette check: a variant nobody can
// tell from another at fifteen metres is not a variant.
export function silhouette(id) {
  const v = FOES[id];
  const S = shapeOf(v);
  const widest = Math.max(...S.robe.map(r => r.r), ...S.hood.map(r => r.r));
  return { height: S.apex[1] * v.scale, width: widest * 2 * v.scale };
}

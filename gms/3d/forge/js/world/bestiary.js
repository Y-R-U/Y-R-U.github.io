// Which rig can body which bestiary row. Pure, because "can the world ever put this enemy in front
// of the player" is what decides whether a `kill` objective can be finished at all, and
// tools/campaign.test.mjs has to be able to ask it without loading three.

import { ENEMIES } from '../sim/tables.js';
import { FOES } from './foeshape.js';

// The quadruped rig's rows, lifted out of vermin.js for the reason FOES was lifted out of robed.js:
// that file imports three, so nothing outside a browser could read this list. No zone named
// anywhere — a rat picks up its town from the ground it spawns on.
export const CREATURES = {
  grain_rat: { kind: 'rat', scale: 1.00 },
  mire_rat: { kind: 'rat', scale: 1.22 },
  rat_knot: { kind: 'rat', scale: 0.86 },
  brood_mother: { kind: 'rat', scale: 2.40 },
  creek_crab: { kind: 'crab', scale: 1.00 },
  blight_boar: { kind: 'boar', scale: 1.00 },
};

// The fowl rig's hostile row: the yard bird at nearly twice the size in Blackstone's own plumage,
// darkened. `zone` and `shade` derive the palette the way FOES derives a raider from dark's robe.
export const FOWL = {
  sour_crow: { zone: 'dark', shade: 0.38, scale: 1.85, run: 3.9 },
};

// A bestiary row's `geo` names a rig. This is the table js/main.js has to hand `rigFor`, and
// enemies.test.js holds main.js to exactly these keys.
export const RIGS = { rat: CREATURES, crab: CREATURES, boar: CREATURES, people: FOES, chicken: FOWL };

export const bodied = enemy => !!RIGS[ENEMIES[enemy]?.geo]?.[enemy];

export const unbodied = () => Object.keys(ENEMIES).filter(id => !bodied(id));

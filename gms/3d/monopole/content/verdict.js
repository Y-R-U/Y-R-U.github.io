// The cold open. It plays itself — no Next button anywhere in it.
//
// It is deliberately about somebody else. A player who has just been told that the biggest carrier
// in human space is being cut to a tenth of itself, lane by lane, works out on their own why there
// is suddenly room for a nobody with one rig. Saying it out loud would kill it.
//
// `shot` is an absolute camera framing, not a spline, so a skip can cut straight to the last one.
//
// Beats 0–7 are nowhere in particular, and the Reach's own landmarks are switched off for them —
// aiming around a station that is 3° off the axis to Ossian is not possible, and hiding it turns
// a framing problem into the reveal on `here: true`, which is where the ruling stops being
// history and starts being the player's problem.

const D = [1540, 400, 3520];

export const beats = Object.freeze([
  Object.freeze({
    id: 'seal', kind: 'seal', ms: 2600,
    over: 'Universal Alliance', text: 'Competition Division',
    shot: Object.freeze({ pos: [-3600, 620, 5200], look: [-2200, 380, 3400], fov: 38, ms: 0 }),
  }),
  Object.freeze({
    id: 'docket', kind: 'record', ms: 4600,
    over: 'Finding 44-119 · The Alliance v. the Meridian Combine',
    text: 'Sixty-one years. Four hundred lanes. One carrier.',
    shot: Object.freeze({ pos: [-3380, 600, 4940], look: [-2020, 366, 3180], fov: 39, ms: 4600 }),
  }),
  Object.freeze({
    id: 'method', kind: 'record', ms: 4800,
    over: 'Findings of fact · 1 of 3',
    text: 'Meridian never out-carried anyone. It bought the yards, then the lanes, then the people who set the tariffs.',
    shot: Object.freeze({ pos: [-3100, 572, 4610], look: [-1800, 348, 2900], fov: 40, ms: 4800 }),
  }),
  Object.freeze({
    id: 'wait', kind: 'record', ms: 4400,
    over: 'Findings of fact · 2 of 3',
    text: 'Where it could not buy, it waited. A rival that cannot dock does not have to be beaten.',
    shot: Object.freeze({ pos: [-2820, 544, 4280], look: [-1580, 330, 2620], fov: 41, ms: 4400 }),
  }),
  Object.freeze({
    id: 'ration', kind: 'record', ms: 5000,
    over: 'Findings of fact · 3 of 3',
    text: 'Coil filament was rationed to hold its price. Every lamp, every drive coil and every relay beacon in the outer systems burns filament.',
    shot: Object.freeze({ pos: [-2500, 512, 3900], look: [-1330, 310, 2300], fov: 42, ms: 5000 }),
  }),
  Object.freeze({
    id: 'kalsa', kind: 'record', ms: 5200, weight: true,
    over: 'Kalsa relay · the ninth year of the ration',
    text: 'The Kalsa beacon went dark and stayed dark for nine days. Two thousand three hundred people were aboard the ships that could not see it.',
    shot: Object.freeze({ pos: [-2140, 476, 3480], look: [-1050, 288, 1950], fov: 43, ms: 5200 }),
  }),
  Object.freeze({
    id: 'guilty', kind: 'stamp', ms: 2800,
    text: 'Guilty', sub: 'on all forty counts',
    shot: Object.freeze({ pos: [-2040, 466, 3360], look: [-970, 282, 1850], fov: 29, ms: 0 }),
  }),
  Object.freeze({
    id: 'sentence', kind: 'sentence', ms: 5400,
    over: 'Order of divestiture',
    text: 'Meridian is reduced to one tenth of what it holds. Twelve years. Lane by lane, system by system, whether or not there is anyone ready to take them.',
    shot: Object.freeze({ pos: [-1600, 900, 2900], look: [-600, 300, 1500], fov: 50, ms: 5400 }),
  }),
  Object.freeze({
    id: 'reach', kind: 'land', ms: 3600, here: true,
    text: 'Tamber Reach was released this year.',
    shot: Object.freeze({ pos: [520, 1480, 1980], look: [260, 40, 460], fov: 56, ms: 4200 }),
  }),
  Object.freeze({
    id: 'corvain', kind: 'land', ms: 4200,
    text: 'Corvain Drayage took seventy-one per cent of it in nine weeks.',
    shot: Object.freeze({ pos: [D[0] - 980, D[1] - 90, D[2] - 1420], look: [D[0] - 260, D[1] - 60, D[2] - 640], fov: 40, ms: 4600 }),
  }),
  Object.freeze({
    id: 'late', kind: 'land', ms: 3800, last: true,
    text: 'You got here late.',
    shot: Object.freeze({ pos: [-150, 26, 250], look: [130, 4, 60], fov: 44, ms: 4400 }),
  }),
]);

export default Object.freeze({ beats });

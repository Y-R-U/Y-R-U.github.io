import { WALL, SAND, WATER, LAVA } from '../sim/materials.js';

/**
 * The first three levels, written by hand.
 *
 * Everything else in the campaign is generated and measured, and that is the
 * right way to build a hundred levels — but it is the wrong way to build the
 * first three. A generated act I taught nothing in particular: the acceptance
 * path culled every `span` candidate for having no headroom, so the campaign
 * opened on five "dissolve N grains" levels and the game's core verb — span the
 * board in one colour and watch it dissolve — was never introduced by the mode
 * that is supposed to teach it.
 *
 * So these three are authored, one verb each:
 *
 *   1. FIRST SPAN     one colour, wall to wall. The whole game in one rule.
 *   2. FIRST QUENCH   water onto lava makes crystal, and crystal is forever.
 *   3. FIRST CUT      a heap you have to take apart.
 *
 * They are deliberately gentle and deliberately short. A tutorial that can be
 * failed by a careless player is not a tutorial, so `tools/tutgate.mjs` holds
 * them to a bar the generated levels are not held to: the DELIBERATE bot must
 * beat them, and so must a masher that hard-drops with no thought at all.
 *
 * ONE TINT IN LEVEL ONE is the teaching device. With a single colour every
 * piece can join every other, so the first span happens within a few drops and
 * the player sees the rule fire before anyone has explained it. Levels two and
 * three widen to the three tints the rest of the game uses — see D3 for why
 * three is the only number that works once a level asks for anything.
 *
 * The board is 80x160 in all three: aspect 0.500, the same shape as every other
 * mode, which gate A4 holds the generated levels to as well.
 */
export const TUTORIAL = [
  {
    id: 1,
    seed: 11,
    name: 'First Span',
    act: 1,
    cols: 80,
    rows: 160,
    tints: 1,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 16,
    fallAccel: 0,
    fallMax: 16,
    pieces: 18,
    seq: [SAND],
    scene: [
      { x: 0, y: 156, w: 80, h: 4, mat: WALL },
    ],
    objective: { type: 'chains', target: 2 },
    // Piece counts, fewest last. Two spans inside eight drops is the lesson
    // landing; fourteen is finishing it at all.
    stars: [18, 13, 10],
    arch: 'span',
    reach: 6,
    teaches: 'One colour, wall to wall, and the whole band dissolves.',
    tutorial: true,
  },
  {
    id: 2,
    seed: 12,
    name: 'First Quench',
    act: 1,
    cols: 80,
    rows: 160,
    tints: 3,
    tintMode: 'mono',
    diagonal: true,
    reactions: true,
    fallRate: 16,
    fallAccel: 0,
    fallMax: 16,
    // TEN, because this level is genuinely two pours long and pretending
    // otherwise would hand the player twenty pieces they never spend. Crystal
    // is a step function: the first water over a pool converts almost all of
    // what that pool will ever give and then the crust seals it. So the lesson
    // is a demonstration, the budget says so, and the stars are scaled to it —
    // three pieces is a clean pour, eight is having sloshed it about.
    pieces: 10,
    // Water in hand from the first piece: the reaction IS the level, so it must
    // not wait behind two loads of sand the way a generated quench level does.
    seq: [WATER],
    // FIVE SMALL POOLS, not two big ones, and the reason is the mechanic itself:
    // crystal SEALS the lava that makes it. Two wide pools gave up 70 crystal to
    // the first three water pieces and then nothing at all ever again — the
    // level was won before the player had understood what they had done, and
    // the whole budget after that was inert. Five separate pools cannot be
    // sealed by one pour, so each one is another go at the same idea.
    scene: [
      { x: 0, y: 156, w: 80, h: 4, mat: WALL },
      { x: 4, y: 152, w: 11, h: 4, mat: LAVA },
      { x: 20, y: 152, w: 11, h: 4, mat: LAVA },
      { x: 36, y: 152, w: 11, h: 4, mat: LAVA },
      { x: 52, y: 152, w: 11, h: 4, mat: LAVA },
      { x: 66, y: 152, w: 11, h: 4, mat: LAVA },
    ],
    // 55 of a measured ceiling of ~85. Five pools of eleven cells is 220 lava
    // and only about two fifths of it can ever become crystal, however long you
    // pour: the crust seals what is underneath. Asking for more than the board
    // contains is the mistake the generated quench levels kept making.
    objective: { type: 'crystal', target: 55 },
    stars: [10, 5, 3],
    arch: 'quench',
    reach: 200,
    teaches: 'Water quenches lava into crystal — and crystal never moves again.',
    tutorial: true,
  },
  {
    id: 3,
    seed: 13,
    name: 'First Cut',
    act: 1,
    cols: 80,
    rows: 160,
    // TWO tints, the middle rung. Level one is one colour so the rule fires by
    // itself; the game proper is three. At three, a twenty-piece budget cleared
    // NOTHING AT ALL on two seeds in three — spanning is site percolation and
    // three tints needs far more sand than a tutorial should ask for. Two makes
    // "drop onto the colour that is already there" a decision you can act on
    // and see work, which is the entire lesson.
    tints: 2,
    tintMode: 'mono',
    diagonal: true,
    reactions: false,
    fallRate: 18,
    fallAccel: 0.2,
    fallMax: 30,
    pieces: 30,
    seq: [SAND],
    scene: [
      { x: 0, y: 156, w: 80, h: 4, mat: WALL },
      // A heap already laid down in bands. Dropping onto the colour that is
      // already there is how a span gets built, and the heap makes that visible
      // before the level asks for it.
      { x: 2, y: 140, w: 24, h: 16, mat: SAND, tint: 1 },
      { x: 28, y: 144, w: 22, h: 12, mat: SAND, tint: 2 },
      { x: 52, y: 138, w: 26, h: 18, mat: SAND, tint: 1 },
    ],
    objective: { type: 'dissolve', target: 2200 },
    stars: [30, 20, 15],
    arch: 'excavate',
    reach: 6000,
    teaches: 'Drop onto the colour that is already there.',
    tutorial: true,
  },
];

export default TUTORIAL;

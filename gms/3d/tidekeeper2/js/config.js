/* Every number a designer would want to reach for. */

export const CFG = {
  /* time */
  DAY_SECONDS: 100,          // one in-game day at 1x
  SPEEDS: [0, 1, 3],
  OFFLINE_CAP_HOURS: 14,     // how much idle earning banks while you are away
  OFFLINE_RATE: 0.55,        // and at what fraction of live rate

  /* world scale — ONE UNIT IS TEN CENTIMETRES, everywhere, always */
  UNIT_CM: 10,

  /* money */
  START_MONEY: 25,
  TICKET_BASE: 0.42,
  RENOWN_PER_VISITOR: 0.00050,

  /* chemistry (validated against a node harness — see CLAUDE.md) */
  FOOD_PER_PORTION: 26,
  FOOD_MASS: 0.011,
  FOOD_LIFE_DAYS: 0.45,

  /* rendering */
  SNOW: 900,
  BUBBLES: 220,
  RAYS: 12,
};

/** What one water reading means, for the single-number Water dial the player
    sees before they ever earn a test kit. */
export const WATER_BANDS = [
  [85, 'good',  'Clear'],
  [65, 'ok',    'Slightly off'],
  [40, 'warn',  'Getting bad'],
  [0,  'bad',   'Dangerous'],
];

// Ghost Town (W12): a main-street overlay from Oct 1 to Nov 2 (local date of the injected clock). Ghosts of past
// duel losers drift through the hero; tapping one pays 👻 ectoplasm. 8 ranks of keepsake hats; rank 8 = Headless Hank.
// The manager cuts the whole season if core is not integrated by 20 Oct (W12) — remove it from DEFAULT_DATA.
export const SEASON = {
  id: 'ghosttown', name: 'Ghost Town', token: '👻', tokenName: 'ectoplasm',
  from: { month: 10, day: 1 }, to: { month: 11, day: 2 },
  ghostGap: [20, 40], ghostLife: 9, ectoPerGhost: 1,
  ranks: [
    { xp: 5, keepsake: 'cobweb_derby' },
    { xp: 15, keepsake: 'ghostly_bowler', box: 'basic' },
    { xp: 30, keepsake: 'candle_stetson' },
    { xp: 50, keepsake: 'bat_brim', box: 'silver' },
    { xp: 80, keepsake: 'ecto_tengallon' },
    { xp: 120, keepsake: 'tombstone_tophat', teeth: 5 },
    { xp: 170, keepsake: 'lantern_twentygallon', box: 'gold' },
    { xp: 240, keepsake: 'hanks_hat', manager: 'm_hank' },
  ],
};
// Keepsake hats are worn by You, a business or a manager (act 'assignKeepsake'); each gives +power income there.
export const KEEPSAKES = {
  cobweb_derby: { name: 'Cobweb Derby', emoji: '🕸️', power: 0.02 },
  ghostly_bowler: { name: 'Ghostly Bowler', emoji: '👻', power: 0.02 },
  candle_stetson: { name: 'Candle-Brim Stetson', emoji: '🕯️', power: 0.03 },
  bat_brim: { name: 'Bat-Brim Stetson', emoji: '🦇', power: 0.03 },
  ecto_tengallon: { name: 'Ectoplasm Ten-Gallon', emoji: '🟢', power: 0.04 },
  tombstone_tophat: { name: 'Tombstone Top Hat', emoji: '🪦', power: 0.04 },
  lantern_twentygallon: { name: 'Green Lantern Twenty-Gallon', emoji: '🏮', power: 0.05 },
  hanks_hat: { name: "Hank's Hat (head included)", emoji: '🎩', power: 0.06 },
};
export const KEEPSAKE_TARGET = { character: 1, line: 3, manager: 2 };

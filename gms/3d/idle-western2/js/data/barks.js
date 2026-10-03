// Who says what (from tools/audio/script.json trigger counts). State picks a speaker and emits `bark {char, trig}`;
// the audio layer picks the line (once-ever, 10 min no-repeat, Sunday School, bubble) — docs/ECONOMY.md §8.
// Speakers tied to a business only talk once it is open (`line`); the rest are always about town.
export const CHAR_LINE = { mabel: 'saloon', pete: 'dentist', lulu: 'garter', mortimer: 'undertaker', wendell: 'jail', thrupp: 'bank', nubbin: 'shine', hortense: 'livery' };
export const BARK_CHARS = {
  opening: { mabel: 1, pomfrey: 2, nubbin: 2 },
  eject: { mabel: 6, pickles: 2, fingers: 1 },
  fling: { mabel: 2 },
  fling_trough: { mabel: 1, pickles: 1 },
  fling_dentist: { mabel: 1, pete: 3 },
  fling_jail: { mabel: 1, wendell: 1 },
  fling_pomfrey: { mabel: 1, pomfrey: 1 },
  idle: { mabel: 4, pickles: 4, pomfrey: 3, wendell: 3, mortimer: 3, lulu: 2, pete: 1, nubbin: 1, hortense: 2, thrupp: 1, fingers: 1 },
  duel: { pickles: 2, wendell: 1, mortimer: 2, bart: 2 },
  duel_win: { mortimer: 1 },
  duel_boot: { pickles: 1 },
  brawl: { mabel: 2, wendell: 1, pete: 1 },
  robbery: { bart: 6, wendell: 3, thrupp: 1, lulu: 1, pickles: 1 },
  robbery_crash: { bart: 1 },
  robbery_caught: { bart: 2, hortense: 1 },
  stagecoach: { hortense: 1 },
  build: { mulligan: 4, pickles: 1, pomfrey: 1 },
  hurry: { mulligan: 2 },
  sign_raise: { mulligan: 1, pickles: 1, pomfrey: 1 },
  acquire_saloon: { mabel: 1 },
  acquire_undertaker: { mortimer: 1 },
  acquire_jail: { wendell: 1 },
  acquire_bank: { thrupp: 1 },
  acquire_garter: { lulu: 1 },
  deed: { pomfrey: 4 },
  half_town: { pomfrey: 1 },
  hat_promo: { pomfrey: 1, mabel: 1, pickles: 1, nubbin: 1, hortense: 1 },
  hat_thimble: { pomfrey: 1 },
  fake_death: { pickles: 1, pomfrey: 1, mortimer: 1 },
  strongbox: { pete: 1, thrupp: 1 },
  piano: { fingers: 3, lulu: 1 },
  frenzy: { fingers: 1, mabel: 1 },
  wrong_note: { fingers: 1 },
  first_business: { nubbin: 1 },
  levelup: { nubbin: 1 },
  link: { mabel: 1, pickles: 1, pete: 1, thrupp: 1 },
  ghost: { pickles: 1 },
  offline_return: { pickles: 1 },
};
// Priority triggers always speak; the rest are dropped inside the global sentence gap (W5: one per 30–45 s).
export const BARK_PRIORITY = ['opening', 'first_business', 'acquire_saloon', 'acquire_undertaker', 'acquire_jail', 'acquire_bank', 'acquire_garter', 'deed', 'half_town', 'hat_promo', 'hat_thimble', 'fake_death', 'duel_win', 'duel_boot', 'robbery_caught', 'offline_return'];
export const BARK_GATE = { gap: 30, prioGap: 4, idle: [30, 45] };

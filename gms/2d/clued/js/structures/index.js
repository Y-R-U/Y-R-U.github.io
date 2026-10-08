// Structure registry. Each: { id, title, icon, blurb, start(choice), count?, timer?, difficulty?, formatFilter? }
import quick from './quick.js?v=202610081215';
import survival from './survival.js?v=202610081215';
import blitz from './blitz.js?v=202610081215';
import ladder from './ladder.js?v=202610081215';
import daily from './daily.js?v=202610081215';
import party from './party.js?v=202610081215';
import duel from './duel.js?v=202610081215';
import pubquiz from './pubquiz.js?v=202610081215';

export const STRUCTURES = { quick, survival, blitz, ladder, daily, party, duel, pubquiz };

// Challenge replays (js/net/): the spec's structure brings its own runner rules and final score (ladder, blitz, survival).
export const replayCfg = (spec, questions) => STRUCTURES[spec?.structure]?.replay?.cfg?.(spec, questions) || {};
export const replayScore = (spec, res) => STRUCTURES[spec?.structure]?.replay?.score?.(res, spec) ?? res.score;

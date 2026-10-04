// Structure registry. Each: { id, title, icon, blurb, start(choice), count?, timer?, difficulty?, formatFilter? }
import quick from './quick.js?v=1';
import survival from './survival.js?v=1';
import blitz from './blitz.js?v=1';
import ladder from './ladder.js?v=1';
import daily from './daily.js?v=1';
import party from './party.js?v=1';
import duel from './duel.js?v=1';
import pubquiz from './pubquiz.js?v=1';

export const STRUCTURES = { quick, survival, blitz, ladder, daily, party, duel, pubquiz };

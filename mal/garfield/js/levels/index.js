import l01 from './l01.js';
import l02 from './l02.js';
import l03 from './l03.js';
import l04 from './l04.js';
import l05 from './l05.js';
import l06 from './l06.js';
import l07 from './l07.js';
import l08 from './l08.js';
import l09 from './l09.js';
import l10 from './l10.js';
export { playOpening, playIntro } from './common.js';

// Wave-3 content loads defensively: a broken Ch2/free-play module must never take Chapter One down with it.
const extra = {};
let story = null;
try { extra.fp1 = (await import('./freeplay1.js')).default; } catch (e) { console.error('[levels] freeplay1', e); }
try { const m = await import('./ch2/index.js'); Object.assign(extra, m.ch2Levels); story = m.playStory; } catch (e) { console.error('[levels] ch2', e); }
export const playStory = (ctx) => story?.(ctx);

export const levels = { 1: l01, 2: l02, 3: l03, 4: l04, 5: l05, 6: l06, 7: l07, 8: l08, 9: l09, 10: l10, ...extra };

// Lazy bridges to lane S (js/net/) and lane L (js/learn/). A failed load is not remembered, so the next tap retries.
import { BUILD } from '../build.js?v=202610100510';
import { lazyImport } from './update.js?v=202610100510';

let netP = null, learnP = null;
const url = p => new URL(`${p}?v=${BUILD}`, import.meta.url).href;
export const loadNet = () => netP || (netP = lazyImport(url('../net/index.js')).catch(e => { netP = null; console.info('[clued] net not available', e?.message); return null; }));
export const loadLearn = () => learnP || (learnP = lazyImport(url('../learn/index.js')).catch(e => { learnP = null; throw e; }));

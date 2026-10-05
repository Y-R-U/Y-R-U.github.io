// Lazy bridges to lane S (js/net/) and lane L (js/learn/). Missing modules degrade to "coming soon".
import { BUILD } from '../build.js?v=202610051408';

let netP = null, learnP = null;
export const loadNet = () => netP || (netP = import(`../net/index.js?v=${BUILD}`).catch(e => { console.info('[clued] net not available', e?.message); return null; }));
export const loadLearn = () => learnP || (learnP = import(`../learn/index.js?v=${BUILD}`).catch(e => { console.info('[clued] learn not available', e?.message); return null; }));

import { playSpec } from './session.js?v=202610171142';
import { specFor, fmtTitle } from './common.js?v=202610171142';

const quick = {
  id: 'quick', title: 'Quick game', icon: '▶', blurb: 'One format, your themes.',
  start(c) {
    playSpec(specFor('quick', c), { title: fmtTitle(c.format), choice: c, replay: () => quick.start(c), cfg: () => ({ timer: c.timer }) });
  },
};
export default quick;

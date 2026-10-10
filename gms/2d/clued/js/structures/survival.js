import { playSpec } from './session.js?v=202610100510';
import { specFor, fmtTitle } from './common.js?v=202610100510';

const survival = {
  id: 'survival', title: 'Survival', icon: '❤️', blurb: 'Keep going until you lose three lives.', count: false,
  start(c) {
    const spec = specFor('survival', { ...c, count: c.kids ? 15 : 40 });
    playSpec(spec, {
      title: `Survival · ${fmtTitle(c.format)}`, choice: c, replay: () => survival.start(c), prepare: { sparesRatio: 0.15 },
      cfg: () => ({ lives: 3, timer: c.timer, label: i => `Question ${i + 1}` }),
    });
  },
  replay: { cfg: () => ({ lives: 3, label: i => `Question ${i + 1}` }) },
};
export default survival;

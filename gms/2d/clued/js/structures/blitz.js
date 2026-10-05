import { playSpec } from './session.js?v=202610050144';
import { specFor, fmtTitle } from './common.js?v=202610050144';

const blitz = {
  id: 'blitz', title: 'Blitz', icon: '⚡', blurb: 'As many as you can in 60 seconds.', count: false, timer: false,
  formatFilter: f => !(f.tags || []).includes('slow'),
  start(c) {
    playSpec(specFor('blitz', { ...c, count: 50 }), {
      title: `Blitz · ${fmtTitle(c.format)}`, choice: c, replay: () => blitz.start(c), prepare: { sparesRatio: 0.1 },
      cfg: () => blitzCfg(),
    });
  },
  replay: { cfg: () => blitzCfg() },
};
function blitzCfg() {
  return { deadline: 60000, timer: false, autoNext: rec => (rec.correct ? 550 : 1300), label: (i, q, s) => `${s.correct} right` };
}
export default blitz;

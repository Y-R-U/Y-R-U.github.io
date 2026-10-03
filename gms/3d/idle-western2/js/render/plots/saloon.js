// 🍺 Saloon — PLACEHOLDER (boxes): a tall two-storey false front with a balcony and swing doors.
import { shopPlot } from './placeholder.js?v=20261004a';

export default function buildPlot(kit, opts) {
  return shopPlot(kit, opts, {
    wall: '#c98a4a', sign: '#f1d9a0', w: 10, h: 6.2,
    extra(b) {
      b.slab('wood2', -2, 3.1, 1.6, 10.6, 0.15, 1.6, { round: 0.03, taper: 0 });
      for (let i = 0; i < 14; i++) b.cyl('woodDark', -7 + i * 0.77, 3.2, 2.3, 0.04, 0.8, 0, { sides: 4 });
      b.slab('woodDark', -2, 3.95, 2.3, 10.6, 0.08, 0.08, { round: 0.02, taper: 0 });
      for (const k of [-1, 1]) b.slab('wood', -2 + k * 0.35, 0.8, 1.45, 0.62, 1.0, 0.06, { round: 0.03, taper: 0 });
    },
  });
}

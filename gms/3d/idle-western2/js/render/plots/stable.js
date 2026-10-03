// 🐎 Stable — PLACEHOLDER (boxes): a barn-red shop with a corral fence and a couple of box "horses".
import { shopPlot } from './placeholder.js?v=20261004a';

export default function buildPlot(kit, opts) {
  return shopPlot(kit, opts, {
    wall: '#a8473a', roof: 'roof2', w: 8, h: 4.6,
    extra(b) {
      for (let x = 3.5; x <= 9.5; x += 1.5) b.cyl('woodDark', x, 0, -2.5, 0.07, 1.3, 0, { sides: 5 });
      for (const y of [0.5, 1.1]) b.slab('wood2', 6.5, y, -2.5, 6.4, 0.1, 0.1, { round: 0.02, taper: 0 });
      for (const [x, c] of [[5, '#7a4a2e'], [7.8, '#3e2f28']]) {
        b.slab(c, x, 0.9, -1.2, 1.8, 0.8, 0.6, { round: 0.2 });
        b.slab(c, x + 1.0, 1.5, -1.2, 0.5, 0.7, 0.4, { round: 0.15 });
        for (const dx of [-0.6, 0.6]) b.cyl(c, x + dx, 0, -1.2, 0.09, 0.95, 0, { sides: 5 });
      }
    },
  });
}

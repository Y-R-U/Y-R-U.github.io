// 🛒 General Store — PLACEHOLDER (boxes): a wide shop front with stacked crates and barrels on the boardwalk.
import { shopPlot } from './placeholder.js?v=20261004a';

export default function buildPlot(kit, opts) {
  return shopPlot(kit, opts, {
    wall: '#8a9a6a', sign: '#f6ecda', w: 11, h: 4.4, x: -1.5,
    extra(b) {
      for (let i = 0; i < 5; i++) b.slab(i % 2 ? 'wood' : 'wood2', -6.6 + (i % 3) * 0.9, 0.22 + Math.floor(i / 3) * 0.8, 1.9, 0.8, 0.8, 0.8, { round: 0.04, ry: i * 0.2 });
      for (let i = 0; i < 2; i++) b.cyl('wood', 3.8 + i * 0.9, 0.22, 1.9, 0.36, 0.95, 0, { sides: 9, taper: 0.92 });
    },
  });
}

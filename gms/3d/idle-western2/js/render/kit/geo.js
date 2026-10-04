import * as THREE from 'three';
import * as S from './shape.js?v=20261004h';

const prep = (g, rough = 0.5) => S.setPbr(g, rough, 0, 0);

export const GEO = {
  box: prep(S.block(1, 1, 1, { cut: 0.12, taper: 0.03 })),
  cyl: prep(S.prism(9, 1, 0.92, 1)),
  cyl12: prep(S.prism(11, 1, 0.96, 1), 0.35),
  cone: prep(S.spire(7, 1, 1, { curve: 1.1, rings: 2 })),
  ico: prep(S.blob(1, 0, { jitter: 0.05 })),
  prism: prep(S.gable(1, 1, 1, { over: 0 })),
  plane: prep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).toNonIndexed()),
};
for (const g of Object.values(GEO)) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aPbr'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.color) S.paint(g, '#ffffff');
  g.computeVertexNormals();
}

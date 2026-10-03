// Town layout: one straight main street along +x. The hub (the street the hero opens on) sits at x = 0, then one
// plot per business in BUSINESSES order, north of the road and facing it (+z).
import { LINES } from './lines.js?v=20261004a';

export const PLOT_W = 24, PLOT_D = 9, PLOT_GAP = 3;
export const ROAD_Z = 7.5;
export const HUB = 'hub';

const plots = [{ id: HUB, kind: 'hub', x: 0, z: 0, rotY: 0, district: 'main' }];
let x = PLOT_W + PLOT_GAP;
const span = {};
for (const l of LINES) {
  span[l.district] ||= [x - PLOT_W / 2, 0];
  plots.push({ id: l.id, kind: 'line', x, z: 0, rotY: 0, district: l.district });
  span[l.district][1] = x + PLOT_W / 2;
  x += PLOT_W + PLOT_GAP;
}

export const PLOTS = plots;
export const PLOT_BY_ID = Object.fromEntries(plots.map((p) => [p.id, p]));
export const DISTRICT_SPAN = span;
export const STREET = { x0: -PLOT_W, x1: x + PLOT_W / 2, z: ROAD_Z, width: 8 };
export const ROAD_GRAPH = { nodes: [[STREET.x0, ROAD_Z], [STREET.x1, ROAD_Z]], edges: [[0, 1]] };
export const HUB_ANCHOR = [0, 0, 0];
export const WORLD_BOUNDS = { x0: -150, x1: STREET.x1 + 130, z0: -220, z1: 170 };

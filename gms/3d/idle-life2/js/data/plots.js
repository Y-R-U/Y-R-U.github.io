import { LINES } from './lines.js?v=20261004c';

// One continuous town along a straight high street (+x). Plots sit north of the road and face it (+z).
// Old Town | river + bridge | Suburbs | Harbour (basin behind) | Downtown; the bay and Coast lie north.
export const PLOT_W = 24, PLOT_D = 9, PLOT_GAP = 3;
export const ROAD_Z = 7.5;
const GAP_BEFORE = { oldtown: 0, suburbs: 22, harbour: 15, downtown: 15 };

const plots = [{ id: 'home', kind: 'home', x: 0, z: 0, rotY: 0, district: 'oldtown' }];
let x = PLOT_W + PLOT_GAP, prevD = 'oldtown';
const span = { oldtown: [-PLOT_W / 2, 0] };
for (const l of LINES) {
  if (l.district !== prevD) {
    span[prevD][1] = x - PLOT_GAP - PLOT_W / 2;
    x += GAP_BEFORE[l.district];
    span[l.district] = [x - PLOT_W / 2, 0];
    prevD = l.district;
  }
  plots.push({ id: l.id, kind: 'line', x, z: 0, rotY: 0, district: l.district });
  x += PLOT_W + PLOT_GAP;
}
span[prevD][1] = x - PLOT_GAP - PLOT_W / 2;

export const PLOTS = plots;
export const PLOT_BY_ID = Object.fromEntries(plots.map((p) => [p.id, p]));
export const DISTRICT_SPAN = span;
export const RIVER_X = (span.oldtown[1] + span.suburbs[0]) / 2;
export const STREET = { x0: -PLOT_W, x1: x + PLOT_W / 2, z: ROAD_Z, width: 6 };
export const ROAD_GRAPH = { nodes: [[STREET.x0, ROAD_Z], [STREET.x1, ROAD_Z]], edges: [[0, 1]] };
export const HOME_ANCHOR = [0, 0, 0];
export const WORLD_BOUNDS = { x0: -170, x1: STREET.x1 + 150, z0: -300, z1: 190 };
export const QUAY = { x0: DISTRICT_SPAN.harbour[0] - 10, x1: DISTRICT_SPAN.harbour[1] + 10, z: -8.2 };
// Sea lies north of SHORE and south of COAST (the resort strip across the bay).
export const SHORE = [[-200, -420], [RIVER_X - 5, -420], [RIVER_X + 25, -150], [RIVER_X + 70, -55], [QUAY.x0 - 6, -14], [QUAY.x0, QUAY.z], [QUAY.x1, QUAY.z], [QUAY.x1 + 14, -36], [DISTRICT_SPAN.downtown[0] + 40, -78], [WORLD_BOUNDS.x1 + 50, -86]];
export const COAST = [[-200, -260], [RIVER_X + 60, -250], [DISTRICT_SPAN.harbour[0], -226], [DISTRICT_SPAN.downtown[1], -240], [WORLD_BOUNDS.x1 + 50, -232]];
export const RIVER = [[RIVER_X, WORLD_BOUNDS.z1 + 20], [RIVER_X, 30], [RIVER_X - 1.5, -30], [RIVER_X + 6, -80], [RIVER_X + 20, -130], [RIVER_X + 30, -170]];

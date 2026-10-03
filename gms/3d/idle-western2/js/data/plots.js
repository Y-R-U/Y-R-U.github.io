// Dribble Creek (DESIGN W1/W3): ONE main street along +x. The 9 business lots sit on the NORTH side (z ≈ 0, facing +z
// toward the street) in three blocks split by alleys; Pomfrey's 7 frontages and the Town Hall face them from the SOUTH
// side (facing −z); the church closes the far end of the street and Boot Hill rises behind it. See docs/ART.md.
import { LINES } from './lines.js?v=20261004b';

export const PLOT_D = 9;
export const ROAD_Z = 9;
export const STREET_W = 8;
export const HUB = 'hub';
// Business lot widths (plot-local x span; facade on local z ≈ 0..1, boardwalk to z ≈ 2.6, street edge at local z = 5).
export const LOT_W = { shine: 12, tubs: 13, livery: 16, saloon: 16, dentist: 12, garter: 14, undertaker: 13, jail: 13, bank: 14 };
export const PLOT_W = 14;
const LOT_GAP = 1, ALLEY = 8;
// Hero camera (lane S): like refs/a_clay_hero.jpg — low, down the street from the west, sky + mesas in the top ~18%.
export const HERO_VIEW = { yawOffAxis: 24, elevation: 32, pitch: 19.5, fov: 50, distance: 31, lookZ: 3.5 };

const plots = [];
const span = {};
let x = 0, prevDistrict = null;
for (const l of LINES) {
  const w = LOT_W[l.id] ?? PLOT_W;
  if (prevDistrict && l.district !== prevDistrict) x += ALLEY - LOT_GAP;
  const cx = x + w / 2;
  span[l.district] ||= [x, 0];
  plots.push({ id: l.id, kind: 'line', x: cx, z: 0, rotY: 0, district: l.district, w, d: PLOT_D, side: 'n' });
  span[l.district][1] = x + w;
  x += w + LOT_GAP;
  prevDistrict = l.district;
}
const END = x - LOT_GAP;
const saloon = plots.find((p) => p.id === 'saloon') || plots[Math.min(3, plots.length - 1)];
// The hub is the open street in front of the Thirsty Gizzard (W15: you are thrown out of its doors face-first).
plots.unshift({ id: HUB, kind: 'hub', x: saloon.x, z: ROAD_Z - 1.5, rotY: 0, district: saloon.district, w: 16, d: 8, side: 'street' });

// The south side and the ends (town.js builds these; ids match data/hats.js FRONTAGES). x = frontage centre, w = width.
const SOUTH_Z = ROAD_Z + STREET_W / 2;
export const FRONTS = [
  { id: 'p_feed', kind: 'pomfrey', name: 'Pomfrey Feed & Seed', side: 's', x: 6, w: 11, style: 'barn' },
  { id: 'p_emporium', kind: 'pomfrey', name: "Pomfrey's Emporium", side: 's', x: 20, w: 14, style: 'emporium' },
  { id: 'p_hats', kind: 'pomfrey', name: 'Pomfrey & Sons, Hatters', side: 's', x: 34.5, w: 11, style: 'hatter' },
  { id: 'p_hotel', kind: 'pomfrey', name: 'The Pomfrey Grand Hotel', side: 's', x: 59.5, w: 17, style: 'hotel' },
  { id: 'p_opera', kind: 'pomfrey', name: 'Pomfrey Opera House', side: 's', x: 76.5, w: 15, style: 'opera' },
  { id: 'p_gazette', kind: 'pomfrey', name: 'The Pomfrey Gazette', side: 's', x: 90, w: 10, style: 'gazette' },
  { id: 'p_assay', kind: 'pomfrey', name: 'Pomfrey Assay Office', side: 's', x: 108, w: 11, style: 'assay' },
  { id: 'c_hall', kind: 'civic', name: 'Town Hall', side: 's', x: 125, w: 16, style: 'hall' },
  { id: 'c_church', kind: 'civic', name: 'Church', side: 'end', x: END + 24, w: 12, style: 'church' },
];
for (const f of FRONTS) f.z = f.side === 's' ? SOUTH_Z + 2 : ROAD_Z;
export const FRONT_BY_ID = Object.fromEntries(FRONTS.map((f) => [f.id, f]));
// Boot Hill: a rise north-east of the church; graves are added at prestige (render reads state.graves).
export const BOOT_HILL = { x: END + 34, z: -16, r: 13, h: 3.2 };
// Skyline heroes and the railroad stub kept open for v1.1 Railroad End.
export const LANDMARKS = {
  waterTower: [62, -17],
  windmill: [118, -21],
  railEnd: [END + 10, 40],
};

export const PLOTS = plots;
export const PLOT_BY_ID = Object.fromEntries(plots.map((p) => [p.id, p]));
export const DISTRICT_SPAN = span;
export const STREET = { x0: -28, x1: END + 18, z: ROAD_Z, width: STREET_W, north: ROAD_Z - STREET_W / 2, south: SOUTH_Z, end: END };
export const ROAD_GRAPH = { nodes: [[STREET.x0, ROAD_Z], [STREET.x1, ROAD_Z]], edges: [[0, 1]] };
export const HUB_ANCHOR = [saloon.x, 0, ROAD_Z - 1.5];
export const WORLD_BOUNDS = { x0: -110, x1: END + 120, z0: -150, z1: 150 };

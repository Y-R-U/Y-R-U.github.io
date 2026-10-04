// Region views. Shared by the runtime and tools/m_build.mjs.
// frame = [west, south, east, north] that must fit on screen; east may exceed 180 to cross the antimeridian.

export const CONTINENTS = {
  AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania', AN: 'Antarctica',
};

export const REGIONS = {
  world: { name: 'World', proj: 'equalEarth', frame: [-180, -58, 180, 84] },
  EU: { name: 'Europe', proj: 'laea', center: [15, 52], frame: [-24, 35, 42, 70], file: 'EU', members: { continent: 'EU', extra: ['CYP', 'TUR', 'GEO', 'ARM', 'AZE'] } },
  AS: { name: 'Asia', proj: 'laea', center: [88, 30], frame: [26, -10, 148, 55], file: 'AS', members: { continent: 'AS', extra: ['RUS'] } },
  AF: { name: 'Africa', proj: 'laea', center: [18, 2], frame: [-25, -35, 55, 37], file: 'AF', members: { continent: 'AF' } },
  NA: { name: 'North America', proj: 'laea', center: [-98, 42], frame: [-165, 8, -55, 72], file: 'NA', members: { continent: 'NA' } },
  SA: { name: 'South America', proj: 'laea', center: [-60, -22], frame: [-81, -55, -35, 12], file: 'SA', members: { continent: 'SA' } },
  OC: { name: 'Oceania', proj: 'laea', center: [158, -15], frame: [112, -47, 192, 10], file: 'OC', members: { continent: 'OC' } },
  caribbean: {
    name: 'Caribbean', proj: 'laea', center: [-72, 17], frame: [-86, 10, -59, 26], file: 'caribbean',
    members: { ids: ['ATG', 'BHS', 'BRB', 'CUB', 'DMA', 'DOM', 'GRD', 'HTI', 'JAM', 'KNA', 'LCA', 'VCT', 'TTO'] },
  },
  mideast: {
    name: 'Middle East', proj: 'laea', center: [45, 28], frame: [26, 12, 63, 42], file: 'mideast',
    members: { ids: ['BHR', 'CYP', 'EGY', 'IRN', 'IRQ', 'ISR', 'JOR', 'KWT', 'LBN', 'OMN', 'PSE', 'QAT', 'SAU', 'SYR', 'TUR', 'ARE', 'YEM'] },
  },
};

// Countries with a states/provinces file. frame overrides keep far-flung islands from shrinking the view;
// insets move whole features (by id) into the frame: scale about the feature's main part, centred on `to`.
export const STATE_VIEWS = {
  USA: { label: 'states', frame: [-124, 24.5, -67, 49.5], insets: [
    { ids: ['US-AK'], scale: 0.35, to: [-122, 25.6] },
    { ids: ['US-HI'], scale: 1.5, to: [-110, 24.6] },
  ] },
  CAN: { label: 'provinces and territories', frame: [-140, 42, -53, 75] },
  MEX: { label: 'states', frame: [-117.5, 14.4, -86.5, 32.8] },
  BRA: { label: 'states', frame: [-74, -33.8, -34.7, 5.3] },
  ARG: { label: 'provinces', frame: [-73.6, -55, -53.6, -21.8] },
  CHL: { label: 'regions', frame: [-76, -56, -66.5, -17.5] },
  AUS: { label: 'states and territories', frame: [113, -43.7, 153.7, -10.5] },
  IND: { label: 'states and union territories', frame: [68, 6.5, 97.5, 35.7] },
  CHN: { label: 'provinces', frame: [73.5, 18, 134.8, 53.6] },
  JPN: { label: 'prefectures', frame: [129, 30.5, 146, 45.6], insets: [{ ids: ['JP-47'], scale: 1, to: [131.8, 37.6] }] },
  KOR: { label: 'provinces' },
  THA: { label: 'provinces' },
  MYS: { label: 'states' },
  DEU: { label: 'states' },
  FRA: { label: 'regions', frame: [-5, 41.3, 9.6, 51.1] },
  ESP: { label: 'autonomous communities', frame: [-9.4, 35.2, 4.4, 43.8], insets: [{ ids: ['ES-CN'], scale: 1, to: [-6.8, 36.2] }] },
  ITA: { label: 'regions', frame: [6.6, 36.6, 18.6, 47.1] },
  GBR: { label: 'nations', frame: [-8.2, 49.9, 1.8, 58.7] },
  CHE: { label: 'cantons' },
  AUT: { label: 'states' },
  POL: { label: 'voivodeships' },
  SWE: { label: 'counties' },
  NLD: { label: 'provinces', frame: [3.3, 50.75, 7.3, 53.6] },
  TUR: { label: 'provinces' },
  SAU: { label: 'regions' },
  EGY: { label: 'governorates', frame: [24.6, 21.9, 36.9, 31.7] },
  ZAF: { label: 'provinces', frame: [16.4, -35, 33, -22.1] },
  NGA: { label: 'states' },
};

export function regionFor(key) {
  if (REGIONS[key]) return { key, ...REGIONS[key] };
  if (STATE_VIEWS[key]) return { key, proj: 'laea', states: key, ...STATE_VIEWS[key] };
  return null;
}

// The one loader. No DOM, no three, no Math.random.
// Two shapes that are not arrays of records: content/balance.js default-exports an object,
// and content/system.tamber.js is a single system. content/stations.js and content/rival.js
// carry named exports beside the default; reading only `default` silently drops them.

import system from '../../content/system.tamber.js';
import shipList from '../../content/ships.js';
import moduleList, { stations as stationList } from '../../content/stations.js';
import commodityList from '../../content/commodities.js';
import tacticList from '../../content/tactics.js';
import storyList from '../../content/stories.js';
import rivalOptionList, { profile as rivalProfile, scoring as rivalScoring } from '../../content/rival.js';
import balanceData from '../../content/balance.js';

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

const registry = {
  system: [system],
  ship: shipList,
  station: stationList,
  module: moduleList,
  commodity: commodityList,
  tactic: tacticList,
  story: storyList,
  rivalOption: rivalOptionList,
  palette: [],
  formation: [],
};

for (const k of Object.keys(registry)) registry[k] = deepFreeze(registry[k].slice());

const index = {};
for (const kind of Object.keys(registry)) {
  index[kind] = new Map(registry[kind].map(r => [r.id, r]));
}

export const content = {
  get(kind, id) {
    const m = index[kind];
    if (!m) throw new Error(`content.get: unknown kind ${kind}`);
    return m.get(id) || null;
  },
  all(kind) {
    const l = registry[kind];
    if (!l) throw new Error(`content.all: unknown kind ${kind}`);
    return l;
  },
  kinds() { return Object.keys(registry); },
  load(pack) {
    for (const kind of Object.keys(pack || {})) {
      if (!registry[kind]) { registry[kind] = []; index[kind] = new Map(); }
      const added = deepFreeze(pack[kind].slice());
      registry[kind] = Object.freeze(registry[kind].concat(added));
      for (const r of added) index[kind].set(r.id, r);
    }
    return content;
  },
  balance: deepFreeze(balanceData),
  rival: deepFreeze({ options: rivalOptionList, profile: rivalProfile, scoring: rivalScoring }),
};

export default content;

// Plot registry: plot id → builder. One file per business plot; the hub is the street the hero opens on.
// A business with no entry here still renders: world.js falls back to the generic placeholder.
import hub from './hub.js?v=20261004a';
import stable from './stable.js?v=20261004a';
import saloon from './saloon.js?v=20261004a';
import store from './store.js?v=20261004a';
import placeholder from './placeholder.js?v=20261004a';

export const PLOT_BUILDERS = { hub, stable, saloon, store };
export const FALLBACK_PLOT = placeholder;

// Plot registry: plot id → builder. One file per business plot; the hub is the street the hero opens on.
// A business with no entry here still renders: world.js falls back to the generic placeholder.
import hub from './hub.js?v=20261004g';
import shine from './shine.js?v=20261004g';
import tubs from './tubs.js?v=20261004g';
import livery from './livery.js?v=20261004g';
import dentist from './dentist.js?v=20261004g';
import garter from './garter.js?v=20261004g';
import undertaker from './undertaker.js?v=20261004g';
import jail from './jail.js?v=20261004g';
import bank from './bank.js?v=20261004g';
import saloon from './saloon.js?v=20261004g';
import placeholder from './placeholder.js?v=20261004g';

export const PLOT_BUILDERS = { hub, shine, tubs, livery, saloon, dentist, garter, undertaker, jail, bank };
export const FALLBACK_PLOT = placeholder;

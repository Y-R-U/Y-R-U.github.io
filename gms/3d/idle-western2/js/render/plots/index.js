// Plot registry: plot id → builder. One file per business plot; the hub is the street the hero opens on.
// A business with no entry here still renders: world.js falls back to the generic placeholder.
import hub from './hub.js?v=20261004b';
import shine from './shine.js?v=20261004b';
import tubs from './tubs.js?v=20261004b';
import livery from './livery.js?v=20261004b';
import dentist from './dentist.js?v=20261004b';
import garter from './garter.js?v=20261004b';
import undertaker from './undertaker.js?v=20261004b';
import jail from './jail.js?v=20261004b';
import bank from './bank.js?v=20261004b';
import saloon from './saloon.js?v=20261004b';
import placeholder from './placeholder.js?v=20261004b';

export const PLOT_BUILDERS = { hub, shine, tubs, livery, saloon, dentist, garter, undertaker, jail, bank };
export const FALLBACK_PLOT = placeholder;

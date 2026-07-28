// Settings, in localStorage so they survive even if IndexedDB is wiped.
import { bus } from './bus.js';

const KEY = 'studio:settings';

const DEFAULTS = {
  popups: true,      // step-by-step guide popups (tours)
  hints: true,       // little "?" bubbles on controls
  sound: true,       // blips
  advanced: false,   // show raw JSON / expert fields everywhere
  bigText: false,    // larger UI text
  motion: true,      // animations & confetti
  grid: true,        // pixel grid in paint / grid in model
  autosave: true
};

let data = { ...DEFAULTS };
try { Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }

function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full */ } }

export const settings = {
  get(k) { return data[k]; },
  set(k, v) {
    if (data[k] === v) return;
    data[k] = v; persist();
    applyBodyFlags();
    bus.emit('settings:change', { key: k, value: v });
  },
  all() { return { ...data }; },
  reset() { data = { ...DEFAULTS }; persist(); applyBodyFlags(); bus.emit('settings:change', { key: '*' }); },
  defaults: DEFAULTS
};

export function applyBodyFlags() {
  const b = document.body; if (!b) return;
  b.classList.toggle('big-text', !!data.bigText);
  b.classList.toggle('no-motion', !data.motion);
  b.classList.toggle('advanced', !!data.advanced);
}

// Non-setting persistent flags (seen tours, badges, last project…)
const FLAGS = 'studio:flags';
let flags = {};
try { flags = JSON.parse(localStorage.getItem(FLAGS) || '{}'); } catch (e) { flags = {}; }

export const flag = {
  get(k, dflt = null) { return k in flags ? flags[k] : dflt; },
  set(k, v) { flags[k] = v; try { localStorage.setItem(FLAGS, JSON.stringify(flags)); } catch (e) {} },
  del(k) { delete flags[k]; try { localStorage.setItem(FLAGS, JSON.stringify(flags)); } catch (e) {} },
  all() { return { ...flags }; }
};

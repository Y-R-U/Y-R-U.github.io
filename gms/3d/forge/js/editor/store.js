// Scene persistence: the working scene in localStorage, named copies beside it, files on disk.
// Every write reports whether it landed — a level editor that has quietly stopped saving looks
// exactly like one that is saving.

import { normalise } from './scene.js';

const KEY = 'forge.scene';
const INDEX = 'forge.slots';
const LEGACY = 'forge.scenes';
const slotKey = name => `forge.slot.${name}`;

let healthy = true;
let problem = '';
export const storageHealthy = () => healthy;
export const storageError = () => problem || 'storage is unavailable';

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    healthy = true;
    problem = '';
    return true;
  } catch (e) {
    healthy = false;
    problem = /quota|full/i.test(e?.name + e?.message) ? 'storage is full' : 'storage is blocked';
    return false;
  }
}

function drop(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

// Private-mode Safari and a full quota both throw on write, never on read, so ask at boot.
// Without this the editor reports itself healthy until the first edit has already been lost.
if (write(`${KEY}.probe`, '1')) drop(`${KEY}.probe`);

function parse(raw) {
  if (!raw) return null;
  try { return normalise(JSON.parse(raw)); } catch { return { doc: null, error: 'corrupt JSON', dropped: 0, warnings: [] }; }
}

// The editor autosaves over the working key as soon as anything is touched, so bytes we could
// not read are put somewhere they survive that — the only chance of getting them back by hand.
export function loadScene() {
  const raw = read(KEY);
  const r = parse(raw);
  if (raw && r && !r.doc) write(`${KEY}.broken`, raw);
  return r;
}

export const saveScene = doc => write(KEY, JSON.stringify(doc));

export const clearScene = () => drop(KEY);

// One key per copy plus an index, so a corrupt byte costs one copy instead of all of them.
export function slots() {
  migrateSlots();
  try {
    const list = JSON.parse(read(INDEX) || '[]');
    return Array.isArray(list) ? list.filter(n => typeof n === 'string') : [];
  } catch { return []; }
}

function migrateSlots() {
  const old = read(LEGACY);
  if (!old || read(INDEX)) return;
  let all = {};
  try { all = JSON.parse(old) || {}; } catch { all = {}; }
  const names = [];
  for (const [name, doc] of Object.entries(all)) {
    if (write(slotKey(name), JSON.stringify(doc))) names.push(name);
  }
  write(INDEX, JSON.stringify(names));
  drop(LEGACY);
}

export function saveSlot(name, doc) {
  const names = slots();
  if (!write(slotKey(name), JSON.stringify(doc))) return false;
  if (!names.includes(name)) names.push(name);
  return write(INDEX, JSON.stringify(names));
}

export const loadSlot = name => parse(read(slotKey(name)));

export function deleteSlot(name) {
  drop(slotKey(name));
  return write(INDEX, JSON.stringify(slots().filter(n => n !== name)));
}

export function exportScene(doc) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(doc.name || 'scene').replace(/\W+/g, '-').toLowerCase()}.forge.json`;
  // Safari ignores a click on an anchor that was never in the document
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

// Resolves null if the picker was dismissed, otherwise a normalise() report — including one
// whose `doc` is null, which is the case the caller has to tell the user about.
export function importScene() {
  return new Promise(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return res(null);
      try {
        res(normalise(JSON.parse(await file.text())));
      } catch (e) {
        res({ doc: null, error: `could not read ${file.name}: ${e.message}`, dropped: 0, warnings: [] });
      }
    };
    input.click();
  });
}

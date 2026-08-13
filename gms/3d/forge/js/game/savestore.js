// Save persistence, on the same primitives and the same key naming as `editor/store.js`.

import { read, write, drop, storageHealthy, storageError } from '../kv.js';
import { normalise } from './save.js';

export { storageHealthy, storageError } from '../kv.js';

const KEY = 'forge.save';
const INDEX = 'forge.save.slots';
const slotKey = name => `forge.save.slot.${name}`;

function parse(raw, opts) {
  if (!raw) return null;
  try { return normalise(JSON.parse(raw), opts); } catch { return { doc: null, error: 'corrupt JSON', warnings: [] }; }
}

// Bytes we could not read are kept verbatim: the next autosave would otherwise write over the only
// copy of a save the player might still want recovered by hand.
export function load(opts) {
  const raw = read(KEY);
  const r = parse(raw, opts);
  if (raw && r && !r.doc) write(`${KEY}.broken`, raw);
  return r;
}

export const save = doc => write(KEY, JSON.stringify(doc));
export const clear = () => drop(KEY);
export const hasSave = () => !!read(KEY);

export function slots() {
  try {
    const list = JSON.parse(read(INDEX) || '[]');
    return Array.isArray(list) ? list.filter(n => typeof n === 'string') : [];
  } catch { return []; }
}

export function saveSlot(name, doc) {
  const names = slots();
  if (!write(slotKey(name), JSON.stringify(doc))) return false;
  if (!names.includes(name)) names.push(name);
  return write(INDEX, JSON.stringify(names));
}

export const loadSlot = (name, opts) => parse(read(slotKey(name)), opts);

export function deleteSlot(name) {
  drop(slotKey(name));
  return write(INDEX, JSON.stringify(slots().filter(n => n !== name)));
}

export const EVERY = 10;

// §5.7: every 10 s of unpaused play and immediately on the events that matter, but never during a
// channel and never when nothing has changed — a phone pays for both.
export class Autosave {
  constructor(snapshot, { every = EVERY, sink = save } = {}) {
    this.snapshot = snapshot;
    this.every = every;
    this.sink = sink;
    this.acc = 0;
    this.last = null;
    this.blocked = 0;
    this.writes = 0;
    this.skipped = 0;
  }

  block(on) { this.blocked += on ? 1 : -1; this.blocked = Math.max(0, this.blocked); }

  tick(dt) {
    this.acc += dt;
    if (this.acc < this.every) return false;
    this.acc = 0;
    return this.flush();
  }

  mark() { this.acc = this.every; }

  flush() {
    if (this.blocked) return false;
    const doc = this.snapshot();
    const bytes = JSON.stringify(doc);
    if (bytes === this.last) { this.skipped++; return false; }
    if (!this.sink(doc, bytes)) return false;
    this.last = bytes;
    this.writes++;
    return true;
  }
}

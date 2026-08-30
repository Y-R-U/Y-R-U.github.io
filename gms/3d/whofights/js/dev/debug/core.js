// Session state for every debug panel: the ring buffers, the filters, and the flags that outlive
// a tab mount. Nothing here touches window, three or the DOM, so node can import and test it.

export class Ring {
  constructor(n = 400) {
    this.cap = n;
    this.buf = [];
    this.at = 0;
    this.seq = 0;
    this.dropped = 0;
  }

  push(v) {
    const e = { seq: ++this.seq, ...v };
    if (this.buf.length < this.cap) this.buf.push(e);
    else { this.buf[this.at] = e; this.dropped++; }
    this.at = (this.at + 1) % this.cap;
    return e;
  }

  // Oldest first, which is the order a log reads in.
  list() {
    if (this.buf.length < this.cap) return this.buf.slice();
    return this.buf.slice(this.at).concat(this.buf.slice(0, this.at));
  }

  tail(n) { const l = this.list(); return l.slice(Math.max(0, l.length - n)); }
  clear() { this.buf = []; this.at = 0; this.dropped = 0; }
  get size() { return this.buf.length; }
}

export const TRACE_KINDS = ['enter', 'exit', 'fire', 'action', 'node', 'line', 'flag', 'event', 'warp', 'note'];
export const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'];

export const state = {
  trace: new Ring(800),
  log: new Ring(500),
  frames: new Ring(300),
  installed: false,
  tracing: true,
  keepRunning: false,
  installedAt: 0,
  selected: null,
  picking: false,
  lastInput: null,
  counts: { enter: 0, fire: 0, action: 0, node: 0, flag: 0, event: 0, error: 0, warn: 0 },
};

export const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function record(kind, id, text, meta) {
  if (!state.tracing) return null;
  if (kind in state.counts) state.counts[kind]++;
  return state.trace.push({ t: now(), wall: Date.now(), kind, id, text: text || '', meta: meta || null });
}

// Pure: what one trace row looks like. The panel and the mini-HUD both render from this, so a
// line reads the same in both.
export function traceLine(e, t0 = 0) {
  const secs = ((e.t - t0) / 1000);
  return {
    time: secs >= 0 && secs < 1e6 ? secs.toFixed(2) : '—',
    clock: new Date(e.wall).toLocaleTimeString(),
    kind: e.kind,
    id: e.id || '',
    text: e.text || '',
    cls: e.kind === 'fire' ? 'good' : e.kind === 'enter' ? 'warnc' : e.kind === 'note' ? 'bad' : '',
  };
}

export function matchTrace(e, { kinds = null, text = '' } = {}) {
  if (kinds && kinds.size && !kinds.has(e.kind)) return false;
  if (!text) return true;
  const q = text.toLowerCase();
  return `${e.kind} ${e.id} ${e.text}`.toLowerCase().includes(q);
}

export function matchLog(e, { levels = null, text = '' } = {}) {
  if (levels && levels.size && !levels.has(e.level)) return false;
  if (!text) return true;
  return e.text.toLowerCase().includes(text.toLowerCase());
}

// One place decides what a value looks like in a log line, so an object in a console call and an
// action's payload print the same way.
export function brief(v, max = 400) {
  const cut = s => (s.length > max ? `${s.slice(0, max)}…` : s);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return cut(v);
  if (typeof v !== 'object') return String(v);
  if (v instanceof Error) return cut(v.stack || `${v.name}: ${v.message}`);
  let s;
  try { s = JSON.stringify(v); } catch { s = String(v); }
  if (s === undefined) s = String(v);
  return cut(s);
}

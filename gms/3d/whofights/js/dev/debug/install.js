// Wires the tracer, the console capture and the frame sampler into the running game. Installed
// once per session, on the first open of the Debug tab, and never removed — a tracer that only
// records while its panel is mounted records nothing worth reading.
//
// Everything here wraps rather than replaces: each hook calls through to the original and its own
// body is in a try/catch, so a debug tool can never be the reason the game stops.

import { VERBS } from '../../game/actions.js';
import { Hotspots } from '../../game/hotspots.js';
import { DialogueBox } from '../../game/dialoguebox.js';
import { Input } from '../../input.js';
import { state, record, brief, now } from './core.js';

export function install(ctx) {
  if (state.installed) return state;
  state.installed = true;
  state.installedAt = now();
  hookActions();
  hookHotspots();
  hookDialogue();
  hookInput();
  hookConsole();
  sampleFrames(ctx);
  record('note', 'debug', 'tracer installed — anything before this was not captured');
  return state;
}

function safe(fn) { try { fn(); } catch { /* a hook must never break the frame */ } }

function hookActions() {
  for (const k of Object.keys(VERBS)) {
    const orig = VERBS[k];
    VERBS[k] = (a, c) => {
      const why = orig(a, c);
      safe(() => record('action', k, detailOf(k, a), { action: a, why }));
      if (k === 'flag') safe(() => record('flag', a.name, `= ${brief(a.value === undefined ? true : a.value)}`));
      return why;
    };
  }
}

const detailOf = (k, a) => ({
  say: () => a.node,
  goto: () => `${a.level}${a.at ? ` @ ${a.at.x},${a.at.z}` : ''}`,
  flag: () => `${a.name} = ${brief(a.value === undefined ? true : a.value)}`,
  event: () => `${a.name} ${brief(a.data || {}, 80)}`,
  music: () => (a.stop ? 'stop' : a.set),
  bark: () => `${a.who} · ${a.category}`,
}[k] || (() => brief(a, 80)))();

function hookHotspots() {
  const upd = Hotspots.prototype.update;
  Hotspots.prototype.update = function (dt, p) {
    const was = new Map([...this.state].map(([id, s]) => [id, s.in]));
    const out = upd.call(this, dt, p);
    safe(() => {
      for (const [id, s] of this.state) {
        if (s.in === was.get(id)) continue;
        const h = this.get(id);
        record(s.in ? 'enter' : 'exit', id, h?.name || '', { trigger: h?.trigger });
      }
    });
    return out;
  };

  const fire = Hotspots.prototype.fire;
  Hotspots.prototype.fire = function (h, st) {
    const ok = fire.call(this, h, st);
    safe(() => record(ok ? 'fire' : 'note', h.id,
      ok ? `${h.trigger} → ${(h.actions || []).map(a => a.k).join(', ') || 'no actions'}`
        : `blocked (${h.once && st.fired ? 'once, already fired' : st.cool > 0 ? `cooling ${st.cool.toFixed(1)}s` : 'predicate false'})`,
      { trigger: h.trigger, fired: st.fired }));
    return ok;
  };
}

function hookDialogue() {
  const play = DialogueBox.prototype.play;
  DialogueBox.prototype.play = function (id) {
    const ok = play.call(this, id);
    safe(() => record('node', id, ok ? `${this.pack?.[id]?.lines?.length ?? 0} lines` : 'no such node / gated out'));
    return ok;
  };
  const rec = DialogueBox.prototype.record;
  DialogueBox.prototype.record = function (line) {
    safe(() => record('line', this.scene?.id || '', `${line[0]}: ${brief(line[1], 90)}`));
    return rec.call(this, line);
  };
}

// read() drains the stick and the look delta every frame, so the only way a panel can show them
// is to keep the last returned command.
function hookInput() {
  const read = Input.prototype.read;
  Input.prototype.read = function () {
    const cmd = read.call(this);
    state.lastInput = {
      ...cmd, at: now(),
      keys: [...this.keys], pointers: this.pointers.size,
      stick: this.stickId !== null, look: this.lookId !== null, flip: !!this.flip,
    };
    return cmd;
  };
}

function hookConsole() {
  if (typeof console === 'undefined') return;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        state.log.push({ t: now(), wall: Date.now(), level, text: args.map(a => brief(a)).join(' ') });
        if (level === 'error') state.counts.error++;
        if (level === 'warn') state.counts.warn++;
      } catch { /* never let logging break logging */ }
      orig(...args);
    };
  }
  addEventListener('error', e => {
    state.counts.error++;
    state.log.push({ t: now(), wall: Date.now(), level: 'error',
      text: `${e.message} — ${e.filename || ''}:${e.lineno || 0}` });
  });
  addEventListener('unhandledrejection', e => {
    state.counts.error++;
    state.log.push({ t: now(), wall: Date.now(), level: 'error', text: `unhandled rejection: ${brief(e.reason)}` });
  });
}

// A system in the game's own loop, so the frame graph is sampled from inside the frame and stops
// filling the instant the hub pauses the loop — which is the honest reading.
function sampleFrames(ctx) {
  const app = ctx?.app;
  if (!app?.systems) return;
  let acc = 0;
  app.systems.push({
    update(dt) {
      acc += dt;
      if (acc < 1 / 30) return;
      acc = 0;
      const s = app.stats;
      state.frames.push({
        t: now(), ms: s?.frame?.avg || dt * 1000, p95: s?.frame?.p95 || 0,
        cpu: s?.cpu?.avg || 0, gpu: s?.gpu?.avg || 0,
        calls: app.renderer?.info?.render?.calls || 0,
        tris: app.renderer?.info?.render?.triangles || 0,
      });
    },
  });
}

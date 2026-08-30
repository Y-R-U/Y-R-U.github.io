// The action executor — DEV_CONTRACT §10. A pure function over a context object: no DOM, no
// globals, no imports, so node can drive every verb without a browser.
//
// A verb that the owning agent has not built yet is registered here as a no-op rather than left
// out, so a document naming it is valid data and not an error the author has to chase.

export const VERBS = {
  say: (a, ctx) => {
    if (typeof a.node !== 'string' || !a.node) return 'say needs a conversation id';
    ctx.say?.(a.node, a);
    return null;
  },

  goto: (a, ctx) => {
    if (typeof a.level !== 'string' || !a.level) return 'goto needs a level id';
    ctx.goto?.(a.level, a.at || null);
    return null;
  },

  flag: (a, ctx) => {
    if (typeof a.name !== 'string' || !a.name) return 'flag needs a name';
    if (!ctx.flags) return 'no flag store in this context';
    ctx.flags[a.name] = a.value === undefined ? true : a.value;
    return null;
  },

  event: (a, ctx) => {
    if (typeof a.name !== 'string' || !a.name) return 'event needs a name';
    ctx.emit?.(a.name, a.data || {});
    return null;
  },

  // js/game/music.js installs the runtime on globalThis.__wfMusic; a test or the dev tools can
  // pass their own as ctx.music instead. With neither, a music action is valid data that plays
  // nothing rather than an error.
  music: (a, ctx) => {
    if (a.stop !== true && (typeof a.set !== 'string' || !a.set)) return 'music needs a "set" or "stop": true';
    if (typeof ctx.music === 'function') { ctx.music(a); return null; }
    (ctx.music || globalThis.__wfMusic)?.action?.(a);
    return null;
  },

  // Filled in by the VO/barks agent — data/barks.json plus audio/vo/index.json.
  bark: (a, ctx) => { ctx.bark?.(a); return null; },
};

export const VERB_IDS = Object.keys(VERBS);

// Never throws: a bad action in authored data must not take the frame down with it. The result
// says what ran and what did not, which is what the level editor's validator reads.
export function runAction(a, ctx = {}) {
  if (!a || typeof a.k !== 'string') return { k: null, ok: false, why: 'not an action' };
  const fn = VERBS[a.k];
  if (!fn) return { k: a.k, ok: false, why: `unknown action "${a.k}"` };
  try {
    const why = fn(a, ctx);
    return why ? { k: a.k, ok: false, why } : { k: a.k, ok: true };
  } catch (e) {
    return { k: a.k, ok: false, why: e?.message || 'threw' };
  }
}

export function runActions(list, ctx = {}) {
  const out = [];
  for (const a of Array.isArray(list) ? list : []) out.push(runAction(a, ctx));
  return out;
}

// For the editor and the linter: what is wrong with this action, before anyone runs it.
export function validateAction(a, path = 'action') {
  if (!a || typeof a !== 'object') return [`${path}: not an object`];
  if (typeof a.k !== 'string') return [`${path}: missing "k"`];
  if (!VERBS[a.k]) return [`${path}: unknown action "${a.k}"`];
  const need = { say: 'node', goto: 'level', flag: 'name', event: 'name', bark: 'who' }[a.k];
  if (need && typeof a[need] !== 'string') return [`${path}: ${a.k} needs a "${need}" string`];
  if (a.k === 'music' && typeof a.set !== 'string' && a.stop !== true) {
    return [`${path}: music needs a "set" or "stop": true`];
  }
  return [];
}

// Validates and normalises quest and dialogue JSON. Everything the runtime relies on is checked
// here, so a broken pack is a list of errors rather than an exception three frames later.

import { validatePred } from './predicate.js';

export const PRIMITIVES = ['kill', 'gather', 'deliver', 'interact', 'goto', 'escort', 'talk', 'survive'];

// slot name, required, default
const SIGS = {
  kill: [['kind', true], ['n', false, 1]],
  gather: [['kind', true], ['n', false, 1]],
  deliver: [['item', true], ['n', false, 1], ['to', false, null]],
  interact: [['id', true], ['n', false, 1]],
  goto: [['area', true]],
  escort: [['npc', true], ['path', false, null]],
  talk: [['npc', true], ['node', false, null]],
  survive: [['area', true], ['seconds', true]],
};

// `onDay` is the eighth-day gate: n means the last day of every n-day cycle. STORY.md §4's
// "the eighth day is a fiction, not a wait" — the step advances the clock to it on accept.
// `unopposed` is a `survive` step claiming it is meant to stage nothing; the linter takes it as an
// answer and errors on every other empty hold.
export const STEP_MODIFIERS = ['in', 'after', 'before', 'onDay', 'within', 'via', 'verb', 'worn',
  'unseen', 'unopposed', 'require', 'fail', 'optional', 'hidden', 'recover'];

const VIA = ['sell', 'craft', 'gather'];
const CAMPAIGNS = ['light', 'neutral', 'dark', 'sandbox'];
const TOWNS = ['light', 'neutral', 'dark'];
export const MAX_SUMMARY = 46;

const isStr = v => typeof v === 'string' && v.length > 0;
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function objective(raw, path, errors) {
  if (!Array.isArray(raw) || !isStr(raw[0])) { errors.push(`${path}: objective must be [verb, …]`); return null; }
  const [verb, ...args] = raw;
  const sig = SIGS[verb];
  if (!sig) { errors.push(`${path}: ${verb} is not one of the eight primitives`); return null; }
  if (args.length > sig.length) { errors.push(`${path}: ${verb} takes at most ${sig.length} args, got ${args.length}`); return null; }
  const out = { k: verb };
  sig.forEach(([name, required, dflt], i) => {
    const v = args[i];
    if (v === undefined || v === null) {
      if (required) errors.push(`${path}: ${verb} needs ${name}`);
      out[name] = dflt ?? null;
      return;
    }
    out[name] = v;
  });
  if ('n' in out && !isNum(out.n)) { errors.push(`${path}: ${verb} count must be a number`); out.n = 1; }
  if (verb === 'survive' && !isNum(out.seconds)) errors.push(`${path}: survive needs seconds`);
  out.target = verb === 'survive' ? out.seconds : (out.n ?? 1);
  return out;
}

function step(raw, path, errors, warnings) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { errors.push(`${path}: step must be an object`); return null; }
  const list = raw.all ?? (raw.do ? [raw.do] : null);
  if (!Array.isArray(list) || !list.length) { errors.push(`${path}: step needs \`do\` or a non-empty \`all\``); return null; }
  if (raw.do && raw.all) errors.push(`${path}: step has both \`do\` and \`all\``);

  const objectives = list.map((o, i) => objective(o, `${path}.objective[${i}]`, errors)).filter(Boolean);
  if (!isStr(raw.text)) errors.push(`${path}: step needs \`text\` for the tracker`);

  const s = {
    id: isStr(raw.id) ? raw.id : null,
    objectives,
    text: raw.text || '',
    hint: isStr(raw.hint) ? raw.hint : null,
    in: isStr(raw.in) ? raw.in : null,
    after: isNum(raw.after) ? raw.after : null,
    before: isNum(raw.before) ? raw.before : null,
    onDay: isNum(raw.onDay) && raw.onDay > 1 ? raw.onDay : null,
    within: isNum(raw.within) ? raw.within : null,
    via: raw.via ?? null,
    verb: raw.verb ?? null,
    worn: raw.worn === undefined ? undefined : raw.worn,
    unseen: !!raw.unseen,
    unopposed: !!raw.unopposed,
    require: raw.require ?? null,
    fail: raw.fail ?? null,
    optional: !!raw.optional,
    hidden: !!raw.hidden,
    recover: Array.isArray(raw.recover) ? raw.recover : null,
    onDone: Array.isArray(raw.onDone) ? raw.onDone : null,
  };
  if (!s.id) errors.push(`${path}: step needs an \`id\``);
  if (s.via && !VIA.includes(s.via)) errors.push(`${path}: via must be one of ${VIA.join(' | ')}`);
  if (s.after !== null && (s.after < 0 || s.after > 24)) errors.push(`${path}: after must be an hour 0–24`);
  if (s.before !== null && (s.before < 0 || s.before > 24)) errors.push(`${path}: before must be an hour 0–24`);
  errors.push(...validatePred(s.require, `${path}.require`));
  errors.push(...validatePred(s.fail, `${path}.fail`));

  for (const k of Object.keys(raw)) {
    if (!['id', 'do', 'all', 'text', 'hint', 'onDone', ...STEP_MODIFIERS].includes(k)) {
      warnings.push(`${path}: unknown field \`${k}\``);
    }
  }
  const strandable = objectives.some(o => ['deliver', 'escort', 'goto'].includes(o.k));
  if (strandable && !s.recover) warnings.push(`${path}: ${objectives.map(o => o.k).join('/')} step has no \`recover\` — §9.4 requires one`);
  return s;
}

export function normaliseQuests(raw, { pack = '' } = {}) {
  const errors = [], warnings = [], defs = {};
  if (!Array.isArray(raw)) return { defs, errors: [`${pack || 'pack'}: must be a JSON array of quests`], warnings };

  raw.forEach((q, qi) => {
    const path = `${pack}[${qi}]`;
    if (!q || typeof q !== 'object') { errors.push(`${path}: quest must be an object`); return; }
    if (!isStr(q.id)) { errors.push(`${path}: quest needs an \`id\``); return; }
    if (defs[q.id]) { errors.push(`${path}: duplicate id ${q.id}`); return; }
    if (pack && !q.id.startsWith(`${pack}.`)) errors.push(`${path}: id ${q.id} is not prefixed \`${pack}.\``);

    const p = `${q.id}`;
    if (!isStr(q.title)) errors.push(`${p}: needs a \`title\``);
    if (!isStr(q.summary)) errors.push(`${p}: needs a \`summary\``);
    else if (q.summary.length > MAX_SUMMARY) errors.push(`${p}: summary is ${q.summary.length} chars, max ${MAX_SUMMARY}`);
    if (q.campaign && !CAMPAIGNS.includes(q.campaign)) errors.push(`${p}: campaign must be one of ${CAMPAIGNS.join(' | ')}`);
    if (q.town && !TOWNS.includes(q.town)) errors.push(`${p}: town must be one of ${TOWNS.join(' | ')}`);
    if (q.reward && (q.reward.xp || q.reward.mk !== undefined)) {
      errors.push(`${p}: reward.xp and reward.mk are generated from sim/campaign.js — remove them`);
    }
    errors.push(...validatePred(q.prereq, `${p}.prereq`));

    const steps = (Array.isArray(q.steps) ? q.steps : [])
      .map((s, i) => step(s, `${p}.steps[${i}]`, errors, warnings)).filter(Boolean);
    if (!steps.length) errors.push(`${p}: needs at least one step`);
    const ids = steps.map(s => s.id);
    if (new Set(ids).size !== ids.length) errors.push(`${p}: duplicate step ids`);
    if (steps.length && steps.every(s => s.optional)) errors.push(`${p}: every step is optional, so it can never complete`);

    defs[q.id] = {
      id: q.id,
      story: isStr(q.story) ? q.story : null,
      campaign: q.campaign || pack || null,
      act: isNum(q.act) ? q.act : null,
      title: q.title || q.id,
      summary: q.summary || '',
      giver: isStr(q.giver) ? q.giver : null,
      turnin: isStr(q.turnin) ? q.turnin : null,
      town: q.town || null,
      prereq: q.prereq ?? ['all'],
      steps,
      reward: {
        items: Array.isArray(q.reward?.items) ? q.reward.items : [],
        truths: Array.isArray(q.reward?.truths) ? q.reward.truths : [],
        bonus: q.reward?.bonus ?? null,
      },
      onDone: Array.isArray(q.onDone) ? q.onDone : [],
      repeat: q.repeat?.every > 0 ? { every: q.repeat.every } : null,
      board: q.board ?? null,
    };
  });

  const stories = Object.values(defs).map(d => d.story).filter(Boolean);
  for (const s of new Set(stories)) {
    if (stories.filter(x => x === s).length > 1) errors.push(`story id ${s} is used by more than one quest`);
  }
  return { defs, errors, warnings };
}

export const MAX_LINE = 46;
export const MAX_CHOICES = 3;
const CAMS = ['close', 'two', 'wide', 'none'];

export function normaliseDialogue(raw, { pack = '' } = {}) {
  const errors = [], warnings = [], nodes = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { nodes, errors: [`${pack || 'pack'}: dialogue must be a JSON object keyed by node id`], warnings };
  }
  for (const [id, n] of Object.entries(raw)) {
    const p = `${id}`;
    if (!n || typeof n !== 'object') { errors.push(`${p}: node must be an object`); continue; }
    const lines = [];
    if (!Array.isArray(n.lines) || !n.lines.length) errors.push(`${p}: node needs \`lines\``);
    else n.lines.forEach((l, i) => {
      if (!Array.isArray(l) || !isStr(l[0]) || !isStr(l[1])) { errors.push(`${p}.lines[${i}]: must be [speaker, line1, line2?]`); return; }
      // The two-line rule is structural: there is no third slot to write into.
      if (l.length > 3) { errors.push(`${p}.lines[${i}]: a bubble is two lines — ${l.length - 1} given`); return; }
      if (l[2] !== undefined && !isStr(l[2])) { errors.push(`${p}.lines[${i}]: second line must be a string`); return; }
      for (let j = 1; j < l.length; j++) {
        if (l[j].length > MAX_LINE) errors.push(`${p}.lines[${i}][${j}]: ${l[j].length} chars, max ${MAX_LINE}`);
      }
      lines.push(l.slice(0, 3));
    });

    const choices = [];
    if (n.choices !== undefined) {
      if (!Array.isArray(n.choices)) errors.push(`${p}.choices: must be an array`);
      else {
        if (n.choices.length > MAX_CHOICES) errors.push(`${p}.choices: ${n.choices.length} choices, max ${MAX_CHOICES}`);
        n.choices.forEach((c, i) => {
          if (!c || typeof c !== 'object') { errors.push(`${p}.choices[${i}]: must be an object`); return; }
          if (!isStr(c.say)) errors.push(`${p}.choices[${i}]: needs \`say\``);
          else if (c.say.length > MAX_LINE) errors.push(`${p}.choices[${i}]: ${c.say.length} chars, max ${MAX_LINE}`);
          if (c.goto !== null && !isStr(c.goto)) errors.push(`${p}.choices[${i}]: \`goto\` must be a node id or null`);
          errors.push(...validatePred(c.if, `${p}.choices[${i}].if`));
          choices.push({ say: c.say || '', goto: c.goto ?? null, if: c.if ?? null, sets: Array.isArray(c.sets) ? c.sets : null });
        });
      }
    }
    if (n.cam !== undefined && !CAMS.includes(n.cam)) errors.push(`${p}: cam must be one of ${CAMS.join(' | ')}`);

    nodes[id] = {
      id,
      cam: n.cam || 'two',
      lines,
      choices: choices.length ? choices : null,
      once: !!n.once,
      sets: Array.isArray(n.sets) ? n.sets : [],
      mark: isStr(n.mark) ? n.mark : null,
      next: isStr(n.next) ? n.next : null,
    };
  }
  return { nodes, errors, warnings };
}

export function normaliseAreas(raw) {
  const errors = [], areas = {};
  if (!Array.isArray(raw)) return { areas, errors: ['areas.json: must be a JSON array'] };
  for (const a of raw) {
    if (!a || !isStr(a.id)) { errors.push('areas.json: every area needs an id'); continue; }
    if (areas[a.id]) { errors.push(`areas.json: duplicate area ${a.id}`); continue; }
    const shape = a.shape;
    const ok = shape && (
      (shape.k === 'circle' && isNum(shape.x) && isNum(shape.z) && isNum(shape.r)) ||
      (shape.k === 'rect' && isNum(shape.x0) && isNum(shape.z0) && isNum(shape.x1) && isNum(shape.z1)));
    if (!ok) errors.push(`areas.json: ${a.id} needs a circle {k,x,z,r} or rect {k,x0,z0,x1,z1} shape`);
    areas[a.id] = { id: a.id, town: a.town || null, parent: a.parent || null, shape,
      label: a.label || a.id, hearth: !!a.hearth };
  }
  for (const a of Object.values(areas)) {
    if (a.parent && !areas[a.parent]) errors.push(`areas.json: ${a.id} has unknown parent ${a.parent}`);
  }
  return { areas, errors };
}

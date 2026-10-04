// Pack schema validation shared by build_index.mjs and c1_test.mjs (see docs/CONTRACT.md).
export const THEMES = ['animals', 'nature', 'geography', 'screen', 'music', 'books', 'people', 'science', 'art', 'history', 'sport', 'food', 'general', 'kids'];
export const ALLOWED_LICENSE = /^(CC0( 1\.0)?|Public domain|PD|PDM(-owner)?|CC BY(-SA)? [1-4]\.[05]( [A-Za-z-]{2,})?)$/;
// Apple previews are streamed at play time, never stored (DESIGN.md media policy); allowed for audio only.
const APPLE_PREVIEW = /^Apple Music preview/;
const FACT_TYPES = ['bool', 'num', 'cat', 'year', 'date', 'text'];
const Q_KINDS = ['mc', 'tf', 'number', 'order'];
const STOP = new Set(['the', 'and', 'of', 'a', 'an', 'de', 'la', 'le', 'el', 'du', 'von', 'van', 'der', 'den', 'des', 'di', 'da', 'in', 'on', 'or', 'to', 'for', 'with', 'from']);

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Name stems a clue must not contain. Words of 3 letters match whole-word; longer words match by prefix stem.
export function leakStems(names, exempt = []) {
  const ex = new Set([...STOP, ...exempt.map(norm)]);
  const out = new Set();
  for (const n of names) {
    for (const w of norm(n).split(/[^a-z0-9]+/)) {
      if (w.length < 3 || ex.has(w) || /^\d+$/.test(w)) continue;
      out.add(w.length <= 3 ? w : w.slice(0, Math.min(w.length, Math.max(4, w.length - 3))));
    }
  }
  return [...out];
}

export function findLeak(clue, stems) {
  const c = ' ' + norm(clue).replace(/[^a-z0-9]+/g, ' ') + ' ';
  for (const s of stems) {
    if (s.length <= 3 ? c.includes(' ' + s + ' ') : c.includes(' ' + s)) return s;
  }
  return null;
}

function checkMedia(media, where, errors, warnings) {
  if (!media) return;
  if (typeof media !== 'object') return errors.push(`${where}: media must be an object`);
  for (const kind of ['img', 'audio']) {
    if (media[kind] == null) continue;
    if (!Array.isArray(media[kind])) { errors.push(`${where}: media.${kind} must be an array`); continue; }
    media[kind].forEach((m, i) => {
      const w = `${where} media.${kind}[${i}]`;
      for (const k of ['src', 'credit', 'license', 'page']) if (!m || typeof m[k] !== 'string' || !m[k].trim()) errors.push(`${w}: missing ${k}`);
      if (m?.license && !ALLOWED_LICENSE.test(m.license) && !(kind === 'audio' && APPLE_PREVIEW.test(m.license))) errors.push(`${w}: licence not allowed "${m.license}"`);
      if (m?.src && !/^(https:\/\/|media\/|data\/music\/)/.test(m.src)) errors.push(`${w}: src must be https://, media/… or data/music/…`);
      if (kind === 'img' && (typeof m?.w !== 'number' || typeof m?.h !== 'number')) warnings.push(`${w}: no w/h`);
      if (kind === 'img' && Math.max(m?.w || 0, m?.h || 0) > 1024) warnings.push(`${w}: larger than 1024px`);
    });
  }
}

export function validatePack(pack, fileId) {
  const errors = [], warnings = [];
  const P = `pack ${fileId || pack?.id}`;
  if (!pack || typeof pack !== 'object') return { errors: [`${P}: not an object`], warnings };
  for (const k of ['id', 'title', 'theme', 'icon']) if (typeof pack[k] !== 'string' || !pack[k]) errors.push(`${P}: missing ${k}`);
  if (fileId && pack.id !== fileId) errors.push(`${P}: id "${pack.id}" does not match file name`);
  if (pack.theme && !THEMES.includes(pack.theme)) errors.push(`${P}: unknown theme "${pack.theme}"`);
  if (typeof pack.kids !== 'boolean') errors.push(`${P}: kids must be boolean`);
  if (typeof pack.version !== 'number') errors.push(`${P}: version must be a number`);
  if (pack.kidsSafe != null && typeof pack.kidsSafe !== 'boolean') errors.push(`${P}: kidsSafe must be boolean`);
  if (pack.kids && pack.kidsSafe === false) errors.push(`${P}: kids:true contradicts kidsSafe:false`);
  const items = pack.items || [], questions = pack.questions || [];
  if (!Array.isArray(items)) errors.push(`${P}: items must be an array`);
  if (!items.length && !questions.length) errors.push(`${P}: no items or questions`);
  const fm = pack.factsMeta || {};
  for (const [k, m] of Object.entries(fm)) {
    if (!FACT_TYPES.includes(m?.type)) errors.push(`${P}: factsMeta.${k} bad type "${m?.type}"`);
    if (!m?.label) errors.push(`${P}: factsMeta.${k} needs a label`);
    for (const t of ['ask', 'askReverse', 'askBool', 'askHigh', 'askLow', 'stmt']) {
      if (m?.[t] == null) continue;
      const bad = String(m[t]).match(/\{(\w+)\}/g)?.filter(x => !['{name}', '{lname}', '{aName}', '{value}', '{lvalue}', '{aValue}', '{label}', '{llabel}', '{unit}'].includes(x));
      if (bad?.length) errors.push(`${P}: factsMeta.${k}.${t} has unknown placeholder ${bad.join(' ')}`);
    }
  }
  const ids = new Set();
  for (const it of items) if (it?.id) { if (ids.has(it.id)) errors.push(`${P}: duplicate item id "${it.id}"`); ids.add(it.id); }
  const names = new Map();
  items.forEach((it, i) => {
    const W = `${P} item ${it?.id || '#' + i}`;
    if (!it || typeof it !== 'object') return errors.push(`${W}: not an object`);
    if (typeof it.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(it.id)) errors.push(`${W}: bad id`);
    if (typeof it.name !== 'string' || !it.name.trim()) errors.push(`${W}: missing name`);
    const nk = norm(it.name || '');
    if (names.has(nk)) errors.push(`${W}: duplicate name "${it.name}" (also ${names.get(nk)})`); else names.set(nk, it.id);
    if (it.alt != null && !Array.isArray(it.alt)) errors.push(`${W}: alt must be an array`);
    if (it.difficulty != null && ![1, 2, 3].includes(it.difficulty)) errors.push(`${W}: difficulty must be 1-3`);
    if (it.facts) {
      for (const [k, v] of Object.entries(it.facts)) {
        const m = fm[k];
        if (!m) { errors.push(`${W}: fact "${k}" not in factsMeta`); continue; }
        if (m.type === 'bool' && typeof v !== 'boolean') errors.push(`${W}: fact ${k} must be boolean`);
        if ((m.type === 'num' || m.type === 'year') && (typeof v !== 'number' || !isFinite(v))) errors.push(`${W}: fact ${k} must be a number`);
        if (m.type === 'cat' && !(typeof v === 'string' || (Array.isArray(v) && v.every(x => typeof x === 'string')))) errors.push(`${W}: fact ${k} must be a string`);
      }
    }
    if (it.clues != null) {
      if (!Array.isArray(it.clues)) errors.push(`${W}: clues must be an array`);
      else {
        if (it.clues.length < 5 || it.clues.length > 20) errors.push(`${W}: ${it.clues.length} clues (need 5-20)`);
        else if (it.clues.length < 8) warnings.push(`${W}: only ${it.clues.length} clues`);
        const stems = leakStems([it.name, ...(it.alt || [])], pack.leakExempt || []);
        it.clues.forEach((c, j) => {
          if (typeof c !== 'string' || !c.trim()) return errors.push(`${W}: clue ${j} empty`);
          const s = findLeak(c, stems);
          if (s) errors.push(`${W}: clue ${j} leaks "${s}": ${c}`);
        });
        if (new Set(it.clues).size !== it.clues.length) errors.push(`${W}: duplicate clues`);
      }
    }
    if (it.lookalikes) for (const l of it.lookalikes) if (!ids.has(l)) errors.push(`${W}: lookalike "${l}" is not an item id`);
    checkMedia(it.media, W, errors, warnings);
  });
  const qids = new Set();
  questions.forEach((q, i) => {
    const W = `${P} question ${q?.id || '#' + i}`;
    if (!q || typeof q !== 'object') return errors.push(`${W}: not an object`);
    if (!q.id) errors.push(`${W}: missing id`); else if (qids.has(q.id)) errors.push(`${W}: duplicate id`); else qids.add(q.id);
    if (!Q_KINDS.includes(q.kind)) errors.push(`${W}: bad kind "${q.kind}"`);
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) errors.push(`${W}: missing prompt`);
    if (q.kind === 'mc') {
      if (typeof q.answer !== 'string' || !q.answer) errors.push(`${W}: mc answer must be a string`);
      if (!Array.isArray(q.wrong) || q.wrong.length < 1) errors.push(`${W}: mc needs wrong[]`);
      else {
        if (q.wrong.some(w => norm(w) === norm(q.answer || ''))) errors.push(`${W}: answer repeated in wrong[]`);
        if (new Set(q.wrong.map(norm)).size !== q.wrong.length) errors.push(`${W}: duplicate wrong answers`);
        if (q.wrong.length < 3 && !pack.kids) warnings.push(`${W}: only ${q.wrong.length} wrong answers`);
      }
    }
    if (q.kind === 'tf' && typeof q.answer !== 'boolean') errors.push(`${W}: tf answer must be boolean`);
    if (q.kind === 'number') {
      if (typeof q.answer !== 'number') errors.push(`${W}: number answer must be numeric`);
      if (q.tolerance != null && typeof q.tolerance !== 'number') errors.push(`${W}: tolerance must be numeric`);
    }
    if (q.kind === 'order' && (!Array.isArray(q.answer) || q.answer.length < 3)) errors.push(`${W}: order answer must be an array of 3+`);
    if (q.difficulty != null && ![1, 2, 3].includes(q.difficulty)) errors.push(`${W}: difficulty must be 1-3`);
    if (!q.explain) warnings.push(`${W}: no explain`);
    checkMedia(q.media, W, errors, warnings);
  });
  if (pack.fakes != null) {
    if (!Array.isArray(pack.fakes)) errors.push(`${P}: fakes must be an array`);
    else for (const f of pack.fakes) if (names.has(norm(f))) errors.push(`${P}: fake "${f}" is a real item name`);
  }
  const easy = items.filter(i => i?.difficulty === 1).length + questions.filter(q => q?.difficulty === 1).length;
  if (easy < 15) warnings.push(`${P}: only ${easy} difficulty-1 items/questions (want ≥ 15 for Easy/Kids)`);
  const undiff = items.filter(i => i && i.difficulty == null).length + questions.filter(q => q && q.difficulty == null).length;
  if (undiff) warnings.push(`${P}: ${undiff} items/questions have no difficulty`);
  if (pack.kids) {
    const easyImg = items.filter(i => i?.difficulty === 1 && i.media?.img?.length).length;
    if (items.length && easyImg < 15) warnings.push(`${P}: kids pack has only ${easyImg} difficulty-1 items with images`);
  }
  return { errors, warnings };
}

export function packCaps(pack) {
  const items = pack.items || [];
  const facts = {};
  for (const [k, m] of Object.entries(pack.factsMeta || {})) {
    const n = items.filter(it => it.facts && it.facts[k] != null).length;
    if (n >= 4) facts[k] = m.type;
  }
  const groups = new Set(items.map(i => i.group).filter(Boolean));
  return {
    img: items.filter(i => i.media?.img?.length).length + (pack.questions || []).filter(q => q.media?.img?.length).length,
    audio: items.filter(i => i.media?.audio?.length).length + (pack.questions || []).filter(q => q.media?.audio?.length).length,
    itemImg: items.filter(i => i.media?.img?.length).length,
    itemAudio: items.filter(i => i.media?.audio?.length).length,
    clues: items.filter(i => (i.clues?.length || 0) >= 5).length,
    facts,
    groups: groups.size,
    lookalikes: items.filter(i => i.lookalikes?.length).length,
    fakes: (pack.fakes || []).length,
    quotes: items.filter(i => i.quote || i.quotes?.length).length,
    qkinds: (pack.questions || []).reduce((o, q) => ((o[q.kind] = (o[q.kind] || 0) + 1), o), {}),
    easy: items.filter(i => i.difficulty === 1).length + (pack.questions || []).filter(q => q.difficulty === 1).length,
    kidsItems: items.filter(i => i.difficulty === 1 && (pack.kids || i.facts?.kids)).length,
  };
}

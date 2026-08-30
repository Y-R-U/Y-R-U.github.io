// The speaker picker, and the two things Aaron asked for next to it: make a bodiless character
// without leaving the conversation, and turn one into a full character.

import { h, select } from './dom.js';
import { voiceGroups, voiceLabel, VOICES } from './voices.js';
import { newCharacter, promote, placeNearStart, idSlug } from './model.js';

export const NEW_NPC = '__new_npc';
export const NEW_NARRATOR = '__new_narrator';

export function speakerSelect(cast, value, onPick, attrs = {}) {
  const bodied = [], voiceOnly = [];
  for (const [id, c] of Object.entries(cast)) {
    (c.body === 'robed' ? bodied : voiceOnly).push([id, `${c.name || id} (${id})`]);
  }
  const groups = [];
  if (bodied.length) groups.push(['In the world', bodied.sort(byLabel)]);
  if (voiceOnly.length) groups.push(['Voice only — no body', voiceOnly.sort(byLabel)]);
  groups.push(['Make one', [[NEW_NPC, '＋ New simple NPC…'], [NEW_NARRATOR, '＋ New narrator…']]]);
  if (value && !cast[value]) groups.unshift(['Missing', [[value, `${value} — not in characters.json`]]]);
  return select(groups, value || '', onPick, attrs);
}

const byLabel = (a, b) => a[1].localeCompare(b[1]);

export function voicePicker(value, onchange) {
  const wrap = h('div', { class: 'row', style: 'margin:0' });
  let showAll = !!value && !/^[ab]/.test(value);
  const draw = () => {
    wrap.innerHTML = '';
    const g = voiceGroups();
    const opts = g.english.map(([label, list]) => [label, list.map(v => [v, voiceLabel(v)])]);
    if (showAll) opts.push(...g.other.map(([label, list]) => [label, list.map(v => [v, voiceLabel(v)])]));
    if (value && !VOICES.includes(value)) opts.unshift(['Unknown', [[value, value]]]);
    wrap.append(
      select(opts, value, v => { value = v; onchange(v); }, { style: 'max-width:260px' }),
      h('button', {
        class: 'convo-mini', text: showAll ? 'English only' : 'other languages…',
        onclick: () => { showAll = !showAll; draw(); },
      }));
  };
  draw();
  return wrap;
}

// kind is only which name it starts with — both make the same record, per DEV_CONTRACT §7.
export function createForm({ kind, cast, onCreate, onCancel }) {
  const narrator = kind === NEW_NARRATOR;
  let name = narrator ? 'Narrator' : '';
  let voice = narrator ? 'bm_fable' : 'af_heart';
  const idOut = h('span', { class: 'dim convo-vo' });
  const nameIn = h('input', {
    type: 'text', value: name, placeholder: narrator ? 'Narrator' : 'name, e.g. Stable hand',
    style: 'width:220px', oninput: e => { name = e.target.value; refresh(); },
  });
  const refresh = () => { idOut.textContent = `id: ${idSlug(name) || 'npc'}`; };
  refresh();

  const create = () => {
    const made = newCharacter({ name, voice, taken: cast });
    onCreate(made);
  };
  return h('div', { class: 'convo-new' },
    h('div', { class: 'row' },
      h('b', { text: narrator ? 'New narrator' : 'New simple NPC' }),
      h('span', { class: 'dim', text: '— a character with no body. Give it one later with “Turn into a full character”.' })),
    h('div', { class: 'row' }, nameIn, idOut),
    h('div', { class: 'row' }, h('span', { class: 'dim', text: 'voice' }), voicePicker(voice, v => { voice = v; })),
    h('div', { class: 'row' },
      h('button', { class: 'primary', text: 'Create', onclick: create }),
      h('button', { text: 'Cancel', onclick: onCancel })));
}

export function promoteForm({ id, record, levels, onPromote, onCancel }) {
  const first = levels[0] || { id: 'academy', start: {} };
  let place = placeNearStart(first.id, first.start || {});
  const fields = h('div', { class: 'row' });
  const drawFields = () => {
    fields.innerHTML = '';
    for (const k of ['x', 'z', 'yaw']) {
      fields.append(h('span', { class: 'dim', text: k }), h('input', {
        type: 'number', step: k === 'yaw' ? '0.01' : '0.5', value: place[k], style: 'width:90px',
        oninput: e => { place[k] = +e.target.value || 0; },
      }));
    }
  };
  drawFields();
  return h('div', { class: 'convo-new' },
    h('div', { class: 'row' },
      h('b', { text: `Turn ${record?.name || id} into a full character` }),
      h('span', { class: 'dim', text: '— body: robed, plus somewhere to stand.' })),
    h('div', { class: 'row' },
      h('span', { class: 'dim', text: 'level' }),
      select(levels.map(l => [l.id, `${l.name || l.id} (${l.id})`]), place.level, v => {
        const lv = levels.find(l => l.id === v) || { id: v, start: {} };
        place = placeNearStart(lv.id, lv.start || {});
        drawFields();
      })),
    fields,
    h('div', { class: 'dim convo-vo', text: 'dropped just in front of the level start — the Level editor places it precisely.' }),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'primary', text: 'Turn into a full character', onclick: () => onPromote(promote(record, place)) }),
      h('button', { text: 'Cancel', onclick: onCancel })));
}

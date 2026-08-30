// Pure shapes and checks for a conversation node and for the characters that speak in one.
// DEV_CONTRACT §6 for the node, §7 for the character — a narrator and a "simple NPC" are ordinary
// characters with `body: "none"`, never a second record type.

import { validateAction } from '../../game/actions.js';
import { validatePred } from '../../game/predicate.js';
import { VOICES } from './voices.js';

export const CAMS = ['none', 'close', 'two', 'wide'];

export const blankNode = (name = '') => ({
  name, cam: 'two', once: false, lines: [], choices: [], next: null, sets: [],
});

export const blankLine = (who = '') => ({ who, text: '', vo: '' });
export const blankChoice = () => ({ say: '', goto: null, sets: [] });

export const slug = s => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 60);

export const idSlug = s => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

export function uniqueId(base, taken) {
  const b = base || 'node';
  if (!taken[b]) return b;
  for (let i = 2; ; i++) if (!taken[`${b}${b.includes('.') ? '.' : '_'}${i}`]) return `${b}${b.includes('.') ? '.' : '_'}${i}`;
}

// Kokoro writes audio/vo/<basename>.wav, so the basename has to survive the filename charset.
export const voName = (nodeId, i) => `${idSlug(nodeId).slice(0, 46)}_${String(i + 1).padStart(2, '0')}`;

export function nodeProblems(id, node, doc = { nodes: {} }, cast = {}) {
  const out = [];
  if (!node || typeof node !== 'object') return [`${id}: not an object`];
  if (!Array.isArray(node.lines)) out.push('lines must be an array');
  if (node.cam && !CAMS.includes(node.cam)) out.push(`cam "${node.cam}" is not one of ${CAMS.join(' | ')}`);
  for (const [i, l] of (node.lines || []).entries()) {
    if (!l || typeof l !== 'object') { out.push(`line ${i + 1}: not an object`); continue; }
    if (!l.who) out.push(`line ${i + 1}: no speaker`);
    else if (Object.keys(cast).length && !cast[l.who]) out.push(`line ${i + 1}: unknown speaker "${l.who}"`);
    if (!String(l.text || '').trim()) out.push(`line ${i + 1}: no text`);
    if (l.vo && !/^[A-Za-z0-9._-]+$/.test(l.vo)) out.push(`line ${i + 1}: vo "${l.vo}" is not a plain basename`);
  }
  for (const [i, c] of (node.choices || []).entries()) {
    if (!String(c?.say || '').trim()) out.push(`choice ${i + 1}: no text`);
    if (c?.goto && !doc.nodes?.[c.goto]) out.push(`choice ${i + 1}: goes to missing node ${c.goto}`);
    if (!c?.goto) out.push(`choice ${i + 1}: goes nowhere`);
    out.push(...validatePred(c?.if ?? null, `choice ${i + 1} if`));
    for (const [j, a] of (c?.sets || []).entries()) out.push(...validateAction(a, `choice ${i + 1} set ${j + 1}`));
  }
  if (node.next && !doc.nodes?.[node.next]) out.push(`next is a missing node ${node.next}`);
  for (const [j, a] of (node.sets || []).entries()) out.push(...validateAction(a, `set ${j + 1}`));
  if (!(node.lines || []).length && !(node.choices || []).length && !node.next) {
    out.push('nothing happens here — no lines, no choices, no next');
  }
  return out;
}

export const castOf = doc => (doc && doc.characters) || {};

// A "simple NPC" and a narrator are the same operation: a character with no body.
export function newCharacter({ name, voice = 'bm_fable', id, taken = {} } = {}) {
  const label = String(name || '').trim();
  const key = uniqueId(idSlug(id || label) || 'npc', taken);
  const record = { name: label || key, body: 'none', voice: VOICES.includes(voice) ? voice : 'bm_fable', voiceSpeed: 1 };
  return { id: key, record };
}

// DEV_CONTRACT §7 promotion, in full: a body and somewhere to stand. Nothing else changes.
export function promote(record, place) {
  if (!record) return null;
  if (!place || typeof place.level !== 'string' || !place.level) return null;
  return {
    ...record,
    body: 'robed',
    robe: record.robe || 'neutral',
    place: { level: place.level, x: round(place.x), z: round(place.z), yaw: round(place.yaw, 5) },
  };
}

// Drop the new body a few metres in front of where the player arrives, facing back at them. The
// Level editor places it properly; this only has to be somewhere the author can find it.
export function placeNearStart(levelId, start = {}, gap = 5) {
  const yaw = Number.isFinite(+start.yaw) ? +start.yaw : 0;
  return {
    level: levelId,
    x: round((+start.x || 0) + Math.sin(yaw) * gap),
    z: round((+start.z || 0) + Math.cos(yaw) * gap),
    yaw: round(wrapPi(yaw + Math.PI), 5),
  };
}

const round = (v, p = 2) => Math.round((+v || 0) * 10 ** p) / 10 ** p;
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export function move(list, from, to) {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

// Every flag a pack touches, so the preview can offer them as switches instead of asking the
// author to remember what they called one.
export function flagNames(nodes = {}) {
  const out = new Set();
  const fromPred = p => {
    if (!Array.isArray(p)) return;
    if (p[0] === 'flag' && typeof p[1] === 'string') out.add(p[1]);
    for (const a of p.slice(1)) fromPred(a);
  };
  for (const n of Object.values(nodes)) {
    for (const a of n?.sets || []) if (a?.k === 'flag' && a.name) out.add(a.name);
    for (const c of n?.choices || []) {
      fromPred(c?.if);
      for (const a of c?.sets || []) if (a?.k === 'flag' && a.name) out.add(a.name);
    }
  }
  return [...out].sort();
}

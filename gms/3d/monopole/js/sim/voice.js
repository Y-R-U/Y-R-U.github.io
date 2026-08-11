// Resolves a line of dialogue against who the player decided to be.
// Pure: no DOM, no three, no Math.random. `node sim.mjs voice` exercises every combination.

import content from './content.js';

// An NPC line can use a term of address, and whether that term came out gendered is the thing the
// player's reply is allowed to react to. `say()` reports it back so a reply table can match on it.
function termFor(register, gender) {
  const reg = content.voice.registers[register] || content.voice.registers.plain;
  const word = reg[gender] || reg.x;
  return { word, gendered: !!reg.genderedFor?.includes(gender) };
}

function matches(when, profile, said) {
  if (!when) return true;
  for (const [k, v] of Object.entries(when)) {
    const list = Array.isArray(v) ? v : [v];
    let ok;
    switch (k) {
      case 'trait': ok = list.some(t => profile.traits.includes(t)); break;
      case 'noTrait': ok = !list.some(t => profile.traits.includes(t)); break;
      case 'personality': ok = list.includes(profile.personality); break;
      case 'gender': ok = list.includes(profile.gender); break;
      case 'origin': ok = list.includes(profile.origin); break;
      case 'said': ok = list.every(f => said?.[f]); break;
      case 'notSaid': ok = !list.some(f => said?.[f]); break;
      default: throw new Error(`voice: unknown when key "${k}"`);
    }
    if (!ok) return false;
  }
  return true;
}

// First match wins, so a table is authored most-specific-first with a bare fallback last.
export function pickVariant(table, profile, said) {
  const list = Array.isArray(table) ? table : [table];
  for (const v of list) if (matches(v.when, profile, said)) return v;
  return null;
}

const TOKEN = /\{(\w+)\}/g;

export function fillTokens(text, profile, vars = {}) {
  return String(text).replace(TOKEN, (m, k) => {
    if (k in vars) return String(vars[k]);
    if (k === 'name') return profile.name;
    if (k === 'first') return profile.name.split(' ')[0];
    if (k === 'last') return profile.name.split(' ').slice(1).join(' ') || profile.name;
    if (k === 'company') return profile.company;
    return m;
  });
}

// SHOUTS becomes real: the trait rewrites the delivery rather than needing its own copy in every
// table, which is what stops the variant lists exploding.
function deliver(text, profile) {
  if (profile.traits.includes('shouts')) return text.toUpperCase().replace(/\.(\s|$)/g, '!$1');
  return text;
}

export function getLines(id) {
  const t = content.voice.lines[id];
  if (!t) throw new Error(`voice: no line table "${id}"`);
  return t;
}

// `said` carries the flags from the line this one is answering, which is how "don't call me love"
// knows both that it was called something and what the word was.
// `voiced` is what makes the delivery traits the player's alone — an NPC does not start shouting
// because you do.
export function line(id, profile, { vars = {}, said = null, register = 'plain', voiced = true } = {}) {
  const table = getLines(id);
  const v = pickVariant(table, profile, said);
  if (!v) throw new Error(`voice: no variant matched "${id}" — every table needs a bare fallback`);
  const term = termFor(v.register || register, profile.gender);
  const text = fillTokens(v.say, profile, { term: term.word, ...vars });
  const usedTerm = /\{term\}/.test(v.say);
  return {
    text: voiced && !v.raw ? deliver(text, profile) : text,
    flags: { gendered: usedTerm && term.gendered, addressed: usedTerm, ...(v.flags || {}) },
    term: usedTerm ? term.word : null,
    id,
  };
}

// `said` is normally the flags off the previous beat; a caller outside a conversation can pass
// facts of its own instead — the yard sets `onSale` so the pitch can lead with the discount.
export function npcSay(npcId, id, profile, vars = {}, said = null) {
  const npc = content.voice.npcs[npcId];
  if (!npc) throw new Error(`voice: no npc "${npcId}"`);
  return line(id, profile, { vars, said, register: npc.register, voiced: false });
}

// The player's own half of a one-off exchange. Same rules as a `you` beat inside a conversation:
// plain register, and delivered — a player who SHOUTS shouts at the broker too.
export function playerSay(id, profile, vars = {}, said = null) {
  return line(id, profile, { vars, said, register: 'plain', voiced: true });
}

// A conversation is a list of beats; each beat is a line table plus who is speaking. The player's
// beats see the flags and the term from the NPC beat immediately before them.
export function runConversation(id, profile, vars = {}) {
  const conv = content.voice.conversations[id];
  if (!conv) throw new Error(`voice: no conversation "${id}"`);
  const npc = content.voice.npcs[conv.npc];
  const out = [];
  let said = null;
  let lastTerm = '';
  for (const beat of conv.beats) {
    const who = beat.npc ? 'npc' : 'you';
    const table = beat.npc || beat.you;
    const r = line(table, profile, {
      vars: { ...vars, lastTerm, npcName: npc.name },
      said,
      register: who === 'npc' ? npc.register : 'plain',
      voiced: who === 'you',
    });
    said = r.flags;
    if (who === 'npc' && r.term) lastTerm = r.term;
    out.push({ who, speaker: who === 'npc' ? npc.name : profile.name, text: r.text, flags: r.flags });
  }
  return { npc, beats: out };
}

export default { line, npcSay, playerSay, runConversation, pickVariant, fillTokens, getLines };

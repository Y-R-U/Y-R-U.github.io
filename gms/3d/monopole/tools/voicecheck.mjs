// Exhaustive check on the dialogue tables: every origin × gender × personality × trait
// combination has to resolve every line without falling off the end of a table, and no line may
// leave an unfilled {token} behind.
//
//   node tools/voicecheck.mjs          assert only
//   node tools/voicecheck.mjs --show   print a sample of real exchanges

import content from '../js/sim/content.js';
import { runConversation, npcSay, playerSay } from '../js/sim/voice.js';
import { newProfile, normalise } from '../js/sim/profile.js';

const show = process.argv.includes('--show');
const origins = content.all('origin').map(o => o.id);
const genders = content.all('gender').map(g => g.id);
const personalities = content.all('personality').map(p => p.id);
const traitIds = content.all('trait').map(t => t.id);
const convos = Object.keys(content.voice.conversations);

let checks = 0;
const fails = [];

// every table needs a bare fallback or some combination will find nothing
for (const [id, table] of Object.entries(content.voice.lines)) {
  if (!table.some(v => !v.when)) fails.push(`table "${id}" has no fallback variant`);
}

// trait sets: none, each single trait, and each origin's default pair
const traitSets = [[], ...traitIds.map(t => [t]), ['touchy_gender', 'posh'], ['shouts', 'polite']];

for (const origin of origins) {
  for (const gender of genders) {
    for (const personality of personalities) {
      for (const traits of traitSets) {
        const p = normalise({ ...newProfile(origin, 7), gender, personality, traits }, 7);
        for (const c of convos) {
          checks++;
          try {
            const { beats } = runConversation(c, p, { rate: '3.0%' });
            for (const b of beats) {
              const left = b.text.match(/\{(\w+)\}/);
              if (left) fails.push(`${c} / ${origin}/${gender}/${personality}/[${traits}] left ${left[0]}`);
              if (!b.text.trim()) fails.push(`${c} produced an empty line`);
            }
          } catch (e) {
            fails.push(`${c} / ${origin}/${gender}/${personality}/[${traits}] threw: ${e.message}`);
          }
        }
      }
    }
  }
}

// The sales floor belongs to no conversation — every one of its tables is reached through npcSay
// or playerSay, so the sweep above never touched them. These are the flag shapes js/ui/yard.js
// actually passes, against every broker.
const YARD_VARS = { hull: 'Kite-class Hauler', price: '26,000 cr', cut: '15%', hold: 'held for 6 days' };
const YARD = [
  ['yard_connect', 'npc', [null]],
  ['yard_pitch', 'npc', [null, { onSale: true }, { held: true }, { urgent: true },
    { onSale: true, urgent: true }, { held: true, urgent: true }]],
  ['yard_ask', 'you', [null]],
  ['yard_push', 'you', [null]],
  ['yard_deal', 'npc', [null, { hard: true }, { gendered: true, addressed: true }]],
  ['yard_no', 'npc', [null, { hard: true }]],
  ['yard_firm', 'npc', [null]],
  ['yard_lapsed', 'npc', [null]],
  ['yard_gone', 'npc', [null]],
  ['yard_sold', 'npc', [{ first: true }, { first: false }]],
];

let yardChecks = 0;
for (const origin of origins) {
  for (const gender of genders) {
    for (const personality of personalities) {
      for (const traits of traitSets) {
        const p = normalise({ ...newProfile(origin, 7), gender, personality, traits }, 7);
        for (const b of content.voice.brokers) {
          for (const [table, who, saids] of YARD) {
            for (const said of saids) {
              yardChecks++;
              const where = `${table} / ${b} / ${origin}/${gender}/${personality}/[${traits}]`;
              try {
                const r = who === 'you'
                  ? playerSay(table, p, YARD_VARS, said)
                  : npcSay(b, table, p, YARD_VARS, said);
                const left = r.text.match(/\{(\w+)\}/);
                if (left) fails.push(`${where} left ${left[0]}`);
                if (!r.text.trim()) fails.push(`${where} produced an empty line`);
              } catch (e) {
                fails.push(`${where} threw: ${e.message}`);
              }
            }
          }
        }
      }
    }
  }
}

// the case that started all this: a rough-register NPC calls you love, and a touchy player answers
const touchy = normalise({ ...newProfile('saved', 7), gender: 'f', traits: ['touchy_gender'] }, 7);
const easy = normalise({ ...newProfile('saved', 7), gender: 'f', traits: ['polite'] }, 7);
const a = runConversation('yard_first', touchy).beats;
const c2 = runConversation('yard_first', easy).beats;
if (!/love/.test(a[0].text)) fails.push('rough register did not produce a gendered term');
if (!/Don’t call me love/.test(a[1].text)) fails.push('touchy_gender did not fire on a gendered term');
if (/Don’t call me/.test(c2[1].text)) fails.push('polite player snapped when they should not have');

// and the neutral gender must not trip it
const neutral = normalise({ ...newProfile('saved', 7), gender: 'x', traits: ['touchy_gender'] }, 7);
if (/Don’t call me/.test(runConversation('yard_first', neutral).beats[1].text)) {
  fails.push('touchy_gender fired on a non-gendered term');
}

// shouting is the player's alone
const loud = normalise({ ...newProfile('saved', 7), traits: ['shouts'] }, 7);
const lb = runConversation('yard_first', loud).beats;
if (lb[0].text === lb[0].text.toUpperCase()) fails.push('the NPC started shouting too');
if (lb[1].text !== lb[1].text.toUpperCase()) fails.push('shouts trait did not raise the player');

if (show) {
  const samples = [
    ['saved', 'f', 'blunt', ['touchy_gender']],
    ['silver', 'm', 'warm', ['posh', 'namedropper']],
    ['gutter', 'x', 'sly', ['foulmouth', 'haggler']],
    ['saved', 'f', 'hot', ['shouts']],
  ];
  for (const [o, g, per, tr] of samples) {
    const p = normalise({ ...newProfile(o, 7), gender: g, personality: per, traits: tr }, 7);
    console.log(`\n── ${o} · ${g} · ${per} · ${tr.join(', ') || 'no traits'} ──`);
    for (const cid of convos) {
      const { npc, beats } = runConversation(cid, p, { rate: '3.0%' });
      console.log(`  [${npc.name}]`);
      for (const b of beats) console.log(`    ${b.who === 'npc' ? npc.name : p.name}: ${b.text}`);
    }
  }
}

console.log(`\nvoicecheck: ${checks} conversation resolutions, ${yardChecks} sales-floor resolutions, `
  + `${Object.keys(content.voice.lines).length} tables`);
if (fails.length) {
  console.error(`\nFAILED (${fails.length}):`);
  for (const f of fails.slice(0, 20)) console.error('  ' + f);
  process.exit(1);
}
console.log('all clean');

// node-only generator: docs/MAPS.md from maps.js + _maps_tpl.md. Not imported by the game.
const root = new URL('../../', import.meta.url).pathname;
const fs = await import('node:fs');
const { MAPS, MAP_SPEC, SLOT_UNLOCKS, FEATURE_UNLOCKS } = await import(root + 'js/data/maps.js');
const { UNITS } = await import(root + 'js/data/units.js');
const { ENEMIES } = await import(root + 'js/data/enemies.js');
const { goalText } = await import(root + 'js/sim/story.js');
const ALL = { ...UNITS, ...ENEMIES };
const nm = (d) => (ALL[d]?.boss ? `**${ALL[d].name}**` : d.replace(/_elite$/, '★'));
let out = '';
for (const m of MAPS) {
  const sp = MAP_SPEC.find((s) => s.id === m.id);
  out += `\n## ${m.order}. ${m.name} (\`${m.id}\`, theme \`${m.theme}\`, realm ${m.realm}) — ${m.levels.length} levels\n*${m.blurb}*\n\n`;
  out += `**Backdrop (hub/map agent):** ${m.look.backdrop}  \nPalette: ${m.look.palette.join(' ')}. Enemy levels ${sp.lv[0]}→${sp.lv[1]}, wave size ${sp.size[0]}→${sp.size[1]}, rank bonus +${sp.rankBonus}. Enemy pool: \`${sp.pool}\`.\n\n`;
  out += '| # | name | type | waves (unit+level, rank) | rec. power | rewards | first clear | ★2 / ★3 goals |\n|---|---|---|---|---|---|---|---|\n';
  for (const l of m.levels) {
    const waves = l.waves.map((w) => w.units.map((u) => `${nm(u.def)}${u.level}${u.rank ? 'r' + u.rank : ''}`).join(' ')).join(' / ');
    const r = l.rewards;
    const rw = `${r.credits}c ${r.scrap}s ${r.xp}xp${r.shards ? ' · ' + Object.entries(r.shards).map(([k, v]) => `${v}×${k}`).join(' ') : ''}`;
    const fc = l.firstClear;
    const fcs = [`${fc.chips} chips`, fc.unlockSlot ? `**SLOT ${fc.unlockSlot}**` : '', fc.cards ? `unit: **${fc.cards.join(', ')}**` : '', fc.unlocks ? `unlock: **${fc.unlocks.join(', ')}**` : ''].filter(Boolean).join(' · ');
    const type = l.boss ? 'BOSS' : l.elite ? 'elite' : '';
    const star = (l.goals || []).slice(1).map(goalText).join(' / ');
    out += `| ${l.node} | ${l.name} | ${type} | ${waves} | ${l.power} | ${rw} | ${fcs} | ${star} |\n`;
  }
  const rw = (r) => [r.chips && `${r.chips} chips`, r.credits && `${r.credits}c`, r.scrap && `${r.scrap}s`, ...Object.entries(r.buffs || {}).map(([k, v]) => `${v}× ${k}`), ...(r.cards || []).map((c) => `unit **${c}**`)].filter(Boolean).join(' · ');
  if (m.chests) out += `\n**Star chests:** ${m.chests.map((c) => `${c.stars}★ → ${rw(c.rewards)}`).join(' · ')}\n`;
}
const slots = Object.entries(SLOT_UNLOCKS).map(([k, v]) => `slot ${k} → \`${v}\``).join(' · ');
const feats = Object.entries(FEATURE_UNLOCKS).map(([k, v]) => `\`${k}\`: ${v.join(', ')}`).join(' · ');
fs.writeFileSync(root + 'docs/MAPS.md', fs.readFileSync(root + 'js/data/_maps_tpl.md', 'utf8').replace('{{SLOTS}}', slots).replace('{{FEATURES}}', feats).replace('{{MAPS}}', out));
console.log('ok', MAPS.reduce((s, m) => s + m.levels.length, 0), 'levels');

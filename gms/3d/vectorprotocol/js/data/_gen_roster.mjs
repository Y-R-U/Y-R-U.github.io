// node-only generator: docs/ROSTER.md from units/abilities/enemies + _roster_tpl.md. Not imported by the game.
const root = '/Users/aaronair/cc/yru/site/gms/3d/vectorprotocol/';
const { UNITS, LAUNCH_SET } = await import(root + 'js/data/units.js');
const { ABILITIES } = await import(root + 'js/data/abilities.js');
const { FANTASY_UNITS, BOSSES } = await import(root + 'js/data/enemies.js');
const pct = (x) => Math.round(x * 100) + '%';
function eff(e) {
  const t = e.target ? ` (${e.target.side === 'self' ? 'self' : e.target.pick === 'all' && e.target.side === 'ally' ? 'all allies' : e.target.pick})` : '';
  switch (e.type) {
    case 'damage': return `${pct(e.mult)} ATK dmg${e.pierce ? ' (pierce)' : ''}${t}`;
    case 'heal': return (e.mult ? `heal ${pct(e.mult)} ATK` : `heal ${pct(e.pctMax)} max HP`) + t;
    case 'shield': return `shield ${pct(e.pctMax)} max HP${e.duration ? ' ' + e.duration + 's' : ''}${t}`;
    case 'status': return `${e.chance && e.chance < 1 ? pct(e.chance) + ' ' : ''}${e.status}${e.stacks ? ' ×' + e.stacks : ''} ${e.duration}s${t}`;
    case 'charge': return `${e.amount > 0 ? '+' : ''}${e.amount} charge${t}`;
    case 'cleanse': return `cleanse ${e.count}${t}`;
    case 'mods': return `${Object.entries(e.mods).map(([k, v]) => k + ' +' + v).join(', ')} ${e.duration}s${t}`;
    default: return e.type;
  }
}
function tgt(a) { const t = a.target; if (!t) return ''; let s = t.side === 'ally' ? (t.pick === 'all' ? 'all allies' : t.pick) : t.side === 'self' ? 'self' : t.pick; if (t.count) s += ' ×' + t.count; if (t.splash) s += `, splash ${pct(t.splash)}`; return s; }
function ab(id) {
  const a = ABILITIES[id];
  if (a.kind === 'passive') {
    if (a.trigger === 'aura') return `**${a.name}** — aura: ${Object.entries(a.aura.mods).map(([k, v]) => k + ' +' + pct(v)).join(', ')} to all allies`;
    const trig = { every_n: `every ${a.n}th attack`, interval: `every ${a.every}s`, low_hp: `once below ${pct(a.threshold)} HP`, on_attack: `on attack (${pct(a.chance)})`, on_damaged: `when hit (${pct(a.chance)})` }[a.trigger] || a.trigger.replace('_', ' ');
    return `**${a.name}** — ${trig}: ${a.effects.map(eff).join('; ')}`;
  }
  return `**${a.name}** — [${tgt(a)}] ${a.effects.map(eff).join('; ')}`;
}
const S = (v) => v;
let out = '';
function unitBlock(u) {
  const v = u.visual || {};
  let s = `#### ${u.name} — *${u.title}* · \`${u.id}\` · ${u.role} · ${u.faction} · ${u.rarity}${u.launch ? ' · **LAUNCH**' : ''}${u.starter ? ' · **STARTER**' : ''}\n`;
  if (u.ref) s += `Ref: ${u.ref}.  \n`;
  if (u.fantasy) s += `*${u.fantasy}*\n\n`;
  if (u.visual) s += `- **Visual**: size **${v.size}**, **${v.loco}**. ${v.silhouette}. Weapon: ${v.weapon}. Signature: ${v.signature}. Colours: ${v.colors}.\n- **Rank tiers**: ${v.tiers}\n`;
  const b = u.base;
  s += `- **Stats L1**: HP ${b.hp} · ATK ${b.atk} · DEF ${b.def} · interval ${b.spd}s · crit ${pct(b.crit)}${u.chargeRate !== 1 ? ` · charge ×${u.chargeRate}` : ''}\n`;
  s += `- Basic: ${ab(u.attack)}\n- Passive: ${ab(u.passive)}\n- Overdrive: ${ab(u.overdrive)}\n`;
  if (u.od_vfx) s += `- **OD VFX**: ${u.od_vfx}\n`;
  return s + '\n';
}
for (const f of ['corporate', 'rogue', 'experimental']) {
  out += `## ${f[0].toUpperCase() + f.slice(1)}\n\n`;
  for (const r of ['tank', 'archer', 'mage']) {
    out += `### ${r[0].toUpperCase() + r.slice(1)}s\n\n`;
    for (const u of Object.values(UNITS).filter((u) => u.faction === f && u.role === r)) out += unitBlock(u);
  }
}
let fan = '';
for (const u of Object.values(FANTASY_UNITS)) fan += unitBlock(u) ;
let boss = '| id | name | model | role | faction | notes |\n|---|---|---|---|---|---|\n';
for (const b of Object.values(BOSSES)) boss += `| \`${b.id}\` | ${b.name} | \`${b.model}\` ×${b.scale} | ${b.role} | ${b.faction} | ${b.title}; ${ABILITIES[b.passive].name} at 50%; OD ${ABILITIES[b.overdrive].name} |\n`;
let grid = '| | Corporate | Rogue | Experimental |\n|---|---|---|---|\n';
for (const r of ['tank', 'archer', 'mage']) for (const ra of ['common', 'rare', 'epic', 'legendary']) {
  grid += `| ${r} ${ra} | ` + ['corporate', 'rogue', 'experimental'].map((f) => { const u = Object.values(UNITS).find((u) => u.faction === f && u.role === r && u.rarity === ra); return u ? (u.launch ? `**${u.name}**` : u.name) + ` (${u.visual.loco})` : '—'; }).join(' | ') + ' |\n';
}
const fs = await import('node:fs');
const tpl = fs.readFileSync(root + 'js/data/_roster_tpl.md', 'utf8');
fs.writeFileSync(root + 'docs/ROSTER.md', tpl.replace('{{GRID}}', grid).replace('{{UNITS}}', out).replace('{{FANTASY}}', fan).replace('{{BOSSES}}', boss).replace('{{LAUNCH}}', LAUNCH_SET.map((id) => '`' + id + '`').join(', ')));
console.log('ok');

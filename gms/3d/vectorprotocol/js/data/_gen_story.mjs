// node-only generator: docs/STORY.md from story.js + _story_tpl.md. Not imported by the game.
const root = new URL('../../', import.meta.url).pathname;
const fs = await import('node:fs');
const { SCENES, CAST } = await import(root + 'js/data/story.js');
const { MAPS } = await import(root + 'js/data/maps.js');
let out = '';
for (const m of MAPS) {
  out += `\n### ${m.order}. ${m.name}\n`;
  for (const l of m.levels) for (const k of ['pre', 'post']) {
    const sc = SCENES[`${l.id}_${k}`];
    if (!sc) continue;
    out += `\n**${l.id} · ${l.name} · ${k}**\n`;
    for (const x of sc) out += `- **${CAST[x.who]?.name || x.who}**: ${x.text}\n`;
  }
}
fs.writeFileSync(root + 'docs/STORY.md', fs.readFileSync(root + 'js/data/_story_tpl.md', 'utf8').replace('{{SCRIPT}}', out));
const bad = Object.keys(SCENES).filter((id) => !MAPS.some((m) => m.levels.some((l) => id.startsWith(l.id + '_'))));
console.log('ok', Object.keys(SCENES).length, 'scenes', bad.length ? 'ORPHANS ' + bad : '');

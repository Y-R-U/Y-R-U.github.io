// THE visibility audit — the tool for "I can't see the target".
// For every mark, LOS-tests it from a 7x7 grid of standable spots on the perch
// roof. "visible from only 9 of 49" is normal; **0 of 49 is a bug**. Run it after
// ANY change that consumes randomness during city generation: extra random draws
// shift the generator's stream and re-roll every layout on every seed.
//
//   node tools/audit_visibility.mjs [seeds] [missionIds] [outFile]
//   node tools/audit_visibility.mjs 1,4,9
import { connect, boot, sleep } from './cdp.mjs';

const SEEDS = (process.argv[2] || '1,4,9').split(',');
const IDS = (process.argv[3] || 's01,s02,s03,s04,s05,s06,s07,s09,s11,s12,s13,s14,s15,s16,s17,s18,s19,s21').split(',');

const AUDIT = `
const m = window.__game.mission, w = window.__game.walker;
const marks = [];
for (const t of m.targets) {
  const p = t.person;
  const g = p && p.group; const pt = g ? { x: g.position.x, y: g.position.y + 1.5, z: g.position.z } : null;
  marks.push({ name: (t.def && (t.def.name || t.def.kind)) || 'target', kind: (t.def && t.def.kind) || '?', pt });
}
for (let i = 0; i < m.plates.length; i++) marks.push({ name: 'plate' + (i + 1), kind: 'plate', pt: { x: m.plates[i].c.x, y: m.plates[i].c.y, z: m.plates[i].c.z } });
const b = m.vantageB, orig = m.origin.clone();
const out = [];
for (const mk of marks) {
  if (!mk.pt) { out.push({ ...mk, vis: -1 }); continue; }
  let vis = 0, def = false;
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    const x = b.minX + 0.4 + (b.maxX - b.minX - 0.8) * i / 6;
    const z = b.minZ + 0.4 + (b.maxZ - b.minZ - 0.8) * j / 6;
    m.origin.set(x, w.surfaceAt(x, z) + 1.62, z);
    if (m._losClear(mk.pt)) vis++;
  }
  m.origin.copy(orig);
  def = m._losClear(mk.pt);
  const d = Math.hypot(mk.pt.x - orig.x, mk.pt.z - orig.z);
  out.push({ name: mk.name, kind: mk.kind, dist: Math.round(d), vis, def });
}
m.origin.copy(orig);
return out;
`;

const p = await connect();
const res = {};
for (const seed of SEEDS) {
  for (const id of IDS) {
    try {
      await boot(p, `m=${id}&seed=${seed}&time=day&nosave`);
      await sleep(400);
      const a = await p.ev(AUDIT);
      res[`${id}@${seed}`] = a;
      const bad = a.filter(x => x.vis === 0);
      console.log(`${id}@${seed}`, a.map(x => `${x.name}:${x.vis}/49${x.def ? '*' : ''}`).join(' '), bad.length ? ' <<< ZERO' : '');
    } catch (e) { console.log(`${id}@${seed} ERROR ${e.message}`); res[`${id}@${seed}`] = 'error'; }
  }
}
const fs = await import('node:fs');
fs.writeFileSync(process.argv[4] || 'shots/vis.json', JSON.stringify(res, null, 1));
p.close();

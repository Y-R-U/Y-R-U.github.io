// Screenshots through the cutscenes (no ?skip): node tools/sim/cutscenes.mjs <intro|N> --shots=DIR [--every=1.5]
import { connect, sleep } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const which = process.argv[2];
const shots = args.shots || '/tmp'; mkdirSync(shots, { recursive: true });
const every = +(args.every || 1.5) * 1000;
const base = args.base || 'http://localhost:8888/mal/garfield/';
const CDP = homedir() + '/.claude/bin/cdp';
const PORT = +(args.port || 9409);
execFileSync(CDP, ['start', '--port', String(PORT), '--idle', '120', '--', '--use-angle=metal'], { stdio: 'ignore' });
process.on('exit', () => { try { execFileSync(CDP, ['stop', String(PORT)], { stdio: 'ignore' }); } catch {} });
const c = await connect(PORT);
if (which === 'intro') {
  await c.nav(`${base}?nointro=1&nogate=1`);
  await c.waitFor(`window.__game && __game.state==='menu'`, 45000);
  c.eval(`__game.intro()`, false);
  await c.waitFor(`__game.sys.director.active`, 10000);
} else {
  await c.nav(`${base}?level=${which}&nointro=1`);
  await c.waitFor(`window.__game && __game.sys.director.active`, 45000);
}
let i = 0;
const t0 = Date.now();
while ((await c.eval(`__game.sys.director.active`)) && Date.now() - t0 < 90000) {
  await c.shot(`${shots}/cs_${which}_${String(i++).padStart(2, '0')}.png`);
  await sleep(every);
}
console.log(`${i} shots, ${((Date.now() - t0) / 1000).toFixed(1)}s, state=${await c.eval('__game.state')}`);
console.log(c.logs.filter((l) => /error|exception/.test(l)).slice(0, 10).join('\n'));
c.close();
process.exit(0);

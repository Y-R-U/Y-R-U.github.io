// R3 reviewer C: style recalcs and layouts per second from HUD writes (Performance.getMetrics), at 4x CPU throttle,
// with the HUD as is, then with every per-frame HUD write that does not change anything suppressed (a proxy for the fix).
//   node tools/review_c_style.mjs [night|mg:ctf]
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';
const PORT = 9335, BASE = 'http://localhost:8861/gms/3d/synthwild/';
const which = process.argv[2] || 'mg:ctf';
const port = await launch(PORT, ['--use-angle=metal']);
const metrics = async (pg) => Object.fromEntries((await pg.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
try {
  const pg = await open(port);
  await pg.viewport({ width: 915, height: 412, mobile: true, dpr: 2 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + (which === 'night' ? '?play=1&nointro&t=0.85&seed=perfnight' : '?mgtest=' + which.slice(3) + '&nointro'));
  await pg.waitFor(`window.__game?.ctx?.ui?.shell?.state === 'playing' && window.__game.ctx.player?.ready`, { timeout: 90000 });
  await pg.eval('window.__game.ctx.ui.shell.noAutoPause = true');
  await sleep(6000);
  await pg.send('Performance.enable', { timeDomain: 'threadTicks' });
  await pg.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const run = async (label) => {
    const a = await metrics(pg); await sleep(10000); const b = await metrics(pg);
    const d = (k) => b[k] - a[k], s = d('Timestamp');
    return { label, layoutsPerSec: +(d('LayoutCount') / s).toFixed(1), stylePerSec: +(d('RecalcStyleCount') / s).toFixed(1),
      layoutMsPerSec: +(d('LayoutDuration') * 1000 / s).toFixed(2), styleMsPerSec: +(d('RecalcStyleDuration') * 1000 / s).toFixed(2), scriptMsPerSec: +(d('ScriptDuration') * 1000 / s).toFixed(1), taskMsPerSec: +(d('TaskDuration') * 1000 / s).toFixed(1) };
  };
  const rows = [await run('as is')];
  // Suppress no-op DOM writes: classList.add/remove/toggle that would not change the class list, and identical textContent.
  await pg.eval(`(() => {
    const L = DOMTokenList.prototype, add = L.add, rem = L.remove;
    L.add = function (...t) { if (t.every((x) => this.contains(x))) return; return add.apply(this, t); };
    L.remove = function (...t) { if (!t.some((x) => this.contains(x))) return; return rem.apply(this, t); };
    const d = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    Object.defineProperty(Node.prototype, 'textContent', { get: d.get, set(v) { if (d.get.call(this) === String(v)) return; d.set.call(this, v); }, configurable: true });
    const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', { get: ih.get, set(v) { if (ih.get.call(this) === String(v)) return; ih.set.call(this, v); }, configurable: true });
    return 1; })()`);
  rows.push(await run('no-op writes suppressed'));
  await pg.eval(`(() => { const st = document.createElement('style'); st.textContent = '.glass{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'; document.head.append(st); return 1; })()`);
  rows.push(await run('+ no backdrop-filter'));
  await pg.eval(`document.querySelector('.sw-hud').style.display = 'none'; document.querySelector('.mg-hud') && (document.querySelector('.mg-hud').style.display = 'none'); 1`);
  rows.push(await run('HUD hidden (floor)'));
  console.table(rows);
} finally { stopBrowser(PORT); }

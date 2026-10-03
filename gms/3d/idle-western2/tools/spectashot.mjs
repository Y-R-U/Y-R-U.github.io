// Dev helper (lane S): boot, play spectacle scenes cosmetically, screenshot the hero.
// node tools/spectashot.mjs [outDir] [scene,scene...] [query]
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
const OUT = process.argv[2] || 'docs/shots/spectacle';
const LIST = (process.argv[3] || 'brawl,duel,eject,robbery,stagecoach').split(',');
const Q = process.argv[4] || '?nosave=1&demo=1&debug=1';
const port = launch({ port: +(process.env.CDP_PORT || 9351) });
try {
  const page = await openPage(port);
  await page.goto(GAME + Q, VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready', 20000);
  await sleep(1500);
  const err = () => [...page.exceptions, ...page.consoleLog.filter((c) => c.type === 'error').map((c) => c.text)];
  console.log('boot errors:', err());
  for (const item of LIST) {
    const [kind, ...at] = item.split('@');
    const times = (at[0] || '2').split('+').map(Number);
    const ok = await page.eval(`(() => { const s = __iw2.world.spectacle; s.stop(); return kind = s.play(${JSON.stringify(kind)}, ${kind === 'gag' ? '{which:"barrel"}' : '{}'}); })()`.replace('kind = ', ''));
    let t = 0;
    for (const tt of times) {
      await sleep((tt - t) * 1000); t = tt;
      const st = await page.eval('JSON.stringify({sc: __iw2.world.spectacle.scenes, d: __iw2.world.spectacle.debug})');
      console.log(kind, 't=' + tt, ok, st);
      await page.shot(`${OUT}/${kind}_${tt}.png`);
    }
  }
  console.log('errors:', err());
  await page.close();
} finally { stop(port); }

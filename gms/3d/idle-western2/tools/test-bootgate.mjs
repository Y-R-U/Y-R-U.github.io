import { launch, stop, openPage, GAME, sleep } from './cdp.mjs';

const port = launch();
const fails = [];
async function arm(block) {
  const page = await openPage(port);
  await page.send('Network.enable');
  if (block) await page.send('Network.setBlockedURLs', { urls: ['*js/render/host.js*'] });
  await page.goto(GAME + '?nosave=1');
  let panel = false, ready = false;
  for (let i = 0; i < 170 && !panel && !ready; i++) {
    await sleep(100);
    try {
      ready = await page.eval('!!(window.__iw2 && window.__iw2.ready)');
      panel = await page.eval("document.getElementById('boot').classList.contains('failed') && !document.getElementById('boot-reload').hidden");
    } catch {}
  }
  await page.close();
  return { panel, ready };
}
try {
  const b = await arm(true);
  console.log('blocked arm:', b);
  if (!b.panel) fails.push('blocked host.js did not show the boot error panel');
  const c = await arm(false);
  console.log('control arm:', c);
  if (c.panel || !c.ready) fails.push('control arm did not boot cleanly');
} finally {
  stop(port);
}
console.log(fails.length ? 'FAILED\n  ' + fails.join('\n  ') : 'PASS');
process.exit(fails.length ? 1 : 0);

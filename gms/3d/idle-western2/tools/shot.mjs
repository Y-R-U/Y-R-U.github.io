import { fileURLToPath } from 'node:url';
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';

const OUT = fileURLToPath(new URL('../docs/shots/', import.meta.url));
const query = process.argv[2] || '?nosave=1&demo=1';
const port = launch();
try {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const page = await openPage(port);
    await page.goto(GAME + query, vp);
    await page.wait('window.__iw2 && window.__iw2.ready', 10000);
    await sleep(2500);
    const file = OUT + `${name}-${vp.width}x${vp.height}.png`;
    await page.shot(file);
    console.log('wrote', file);
    await page.close();
  }
} finally {
  stop(port);
}

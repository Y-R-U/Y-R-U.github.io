// node tools/artshot.mjs out.png "view=card&plot=stable" [w] [h]   — renders tools/artlab.html headless (Metal)
import { launch, stop, openPage, ORIGIN, sleep } from './cdp.mjs';
const [out, query = '', w = '780', h = '341'] = process.argv.slice(2);
const port = launch({ port: +(process.env.CDP_PORT || 9311) });
try {
  const page = await openPage(port);
  await page.goto(ORIGIN + '/gms/3d/idle-western2/tools/artlab.html?' + query, { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
  const info = await page.wait('window.__lab && window.__lab.ready && window.__lab', 30000).catch(async (e) => { console.log(page.exceptions, page.consoleLog.slice(0, 10)); await page.shot(out); throw e; });
  await page.shot(out);
  console.log(JSON.stringify(info), page.exceptions.length ? page.exceptions : '', page.consoleLog.filter((l) => l.type === 'error' || l.type === 'warning').slice(0, 5).map((l) => l.text));
  await page.close();
} finally { stop(port); }

// R3 (lane S): pin each business in the real game, wait for its staged gag, log the gag + its characters' on-screen
// height (S22 device px) and screenshot the hero. node tools/stageshot.mjs outDir [ids] [tod] [gag] [times]
// times: comma list of seconds after the gag starts (default 1.8), one shot each (R4 vignettes: e.g. 1.4,2.6,5).
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
const [dir = 'docs/shots/spectacle/r3', only = '', tod = '17', force = '', times = '1.8'] = process.argv.slice(2);
const AT = times.split(',').map(Number);
const IDS = (only || 'shine,tubs,livery,saloon,dentist,garter,undertaker,jail,bank').split(',');
const port = launch({ port: +(process.env.CDP_PORT || 9351) });
try {
  const page = await openPage(port);
  await page.goto(GAME + `?nosave=1&demo=1&tod=${tod}`, VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready', 30000);
  await sleep(2500);
  const out = [];
  for (const id of IDS) {
    await page.eval(`(() => { scrollTo(0, 0); const s = __iw2.world.spectacle; s.stop(); const r = __iw2.world.heroRig; if ('${id}' === '@town') r.town(true); else { r.town(false); r.pin('${id}'); } })()`);
    if (force) { await sleep(2600); await page.eval(`(() => { const s = __iw2.world.spectacle; for (const k of ['gag','duel','eject']) s.stop(k); return !!s.gag('${force}'); })()`); }
    let info = null;
    for (let i = 0; i < 24 && !info; i++) {
      await sleep(250);
      info = await page.eval(`(() => { const w = __iw2.world, s = w.spectacle, host = __iw2.host;
        const sc = s.scenes.find((k) => k === 'gag' || k === 'duel'); if (!sc) return null;
        return { sc }; })()`);
    }
    let prev = 0;
    for (const [k, at] of AT.entries()) {
    await sleep(info ? Math.max(0, at * 1000 - prev) : 0);
    prev = at * 1000;
    const m = await page.eval(`(() => { const w = __iw2.world, s = w.spectacle, host = __iw2.host, h = [0,0,0];
      const acts = s.pool.filter((a) => a.used && !a.hidden).map((a) => { s.cast.head(a, h); const top = { ...host.project('hero', [h[0], h[1] + 0.3, h[2]]) }, foot = { ...host.project('hero', [a.x, a.y, a.z]) };
        return { char: a.char || 'extra', px: Math.round((foot.y - top.y) * devicePixelRatio), y: Math.round(foot.y * devicePixelRatio), vis: foot.visible }; });
      return { scenes: s.scenes, acts, cut: w.pool?.stats?.nearCut }; })()`);
    console.log(id, JSON.stringify(m));
    out.push({ id, ...m });
    await page.shot(`${dir}/stage_${tod}_${id}${AT.length > 1 ? '_' + k : ''}.jpg`, { clip: await page.eval(`(() => { const r = document.querySelector('section.hero').getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`), quality: 80 });
    }
  }
  console.log('errors', page.exceptions.slice(0, 3));
  await page.close();
} finally { stop(port); }

// node tools/camshot.mjs outDir [tod] [build] — real game at S22: hero pinned on every business + every card.
import { launch, stop, openPage, GAME, VIEWPORTS, sleep, cardShot } from './cdp.mjs';
const [dir = 'docs/shots/cam', tod = '10', mode = 'open', only = ''] = process.argv.slice(2);
const IDS = ['shine', 'tubs', 'livery', 'saloon', 'dentist', 'garter', 'undertaker', 'jail', 'bank'].filter((i) => !only || only.split(',').includes(i));
const port = launch({ port: +(process.env.CDP_PORT || 9301) });
const clip = async (page, sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`);
try {
  const page = await openPage(port);
  const q = mode === 'build' ? `?nosave=1&debug=1&tod=${tod}` : `?nosave=1&demo=1&tod=${tod}`;
  await page.goto(GAME + q, VIEWPORTS.s22);
  await page.wait('window.__iw2 && window.__iw2.ready', 30000);
  await sleep(2500);
  if (mode === 'build') {
    await page.eval(`(async () => { const g = window.__iw2.game, st = g.state; g.act('cheat', { cash: 1e18 }); st.bootstrap.done = true;
      const { DISTRICTS } = await import('./js/data/districts.js'); for (const d of DISTRICTS) if (!st.districts.includes(d.id)) st.districts.push(d.id); return st.districts; })()`);
    const r = await page.eval(`(() => { const g = window.__iw2.game; return ${JSON.stringify(IDS)}.map((id) => { const r = g.act('buy', { lineId: id }); return id + ':' + (r.ok ? 'ok' : r.reason || r.msg); }); })()`);
    console.log('buy', r.join(' '));
    await sleep(2000);
  }
  const rig = 'window.__iw2.world.heroRig';
  if (mode !== 'build') for (const id of IDS) {
    await page.eval(`(() => { scrollTo(0, 0); ${rig}.pin('${id}'); })()`);
    await sleep(3200);
    await page.shot(`${dir}/hero_${mode}_${tod}_${id}.jpg`, { clip: await clip(page, 'section.hero'), quality: 80 });
  }
  if (mode !== 'build') {
    await page.eval(`(() => { ${rig}.unpin(); scrollTo(0,0); })()`);
    await sleep(3000);
    await page.shot(`${dir}/hero_${mode}_${tod}_tour.jpg`, { clip: await clip(page, 'section.hero'), quality: 80 });
    await page.eval(`${rig}.town(true)`);
    await sleep(3500);
    await page.shot(`${dir}/hero_${mode}_${tod}_town.jpg`, { clip: await clip(page, 'section.hero'), quality: 80 });
    await page.eval(`${rig}.town(false)`);
  }
  for (const id of IDS) {
    await page.eval(`document.querySelector('.line-card[data-line="${id}"]').scrollIntoView({ block: 'center' })`);
    await sleep(mode === 'build' ? 6000 : 1800);
    if (!await cardShot(page, id, `${dir}/card_${mode}_${tod}_${id}.jpg`)) console.log('hidden', id);
  }
  console.log(page.exceptions.slice(0, 3));
  await page.close();
} finally { stop(port); }

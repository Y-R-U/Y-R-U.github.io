// node tools/ui-shots.mjs [outDir] — UI lane screenshots: fresh opening, demo street, build card, sheets, duel, fling.
import { launch, stop, openPage, GAME, VIEWPORTS, sleep } from './cdp.mjs';
import { fileURLToPath } from 'node:url';
const OUT = process.argv[2] || fileURLToPath(new URL('../docs/shots/ui/', import.meta.url));
const only = process.argv[3] || '';
const port = launch({ port: +(process.env.CDP_PORT || 9361) });
const shot = async (page, name) => { const f = OUT + name + '.png'; await page.shot(f); console.log('wrote', f); };
try {
  for (const [vpName, vp] of [['s22', VIEWPORTS.s22], ['desktop', VIEWPORTS.desktop]]) {
    if (only && !vpName.startsWith(only)) continue;
    let page = await openPage(port);
    await page.goto(GAME + '?nosave=1&debug=1', vp);
    await page.wait('window.__iw2 && window.__iw2.ready', 15000);
    await sleep(1500);
    await shot(page, `${vpName}-01-fresh`);
    await page.eval(`(() => { const g = __iw2.game; for (let i = 0; i < 8; i++) g.act('tap'); __iw2ui.debug.coach; __iw2.ui.debug; })()`);
    await sleep(900);
    await shot(page, `${vpName}-02-mudcoins`);
    await page.eval(`(() => { const g = __iw2.game; for (let i = 0; i < 20; i++) g.act('tap'); g.act('hat'); g.act('unlock', { lineId: 'shine' }); for (let i=0;i<3;i++) g.tick(0.5); })()`);
    await sleep(900);
    await page.eval(`scrollTo(0, 260)`);
    await sleep(700);
    await shot(page, `${vpName}-03-building`);
    await page.close();

    page = await openPage(port);
    await page.goto(GAME + '?nosave=1&demo=1', vp);
    await page.wait('window.__iw2 && window.__iw2.ready', 15000);
    await sleep(2500);
    await shot(page, `${vpName}-04-demo`);
    await page.eval(`scrollTo(0, 900)`);
    await sleep(900);
    await shot(page, `${vpName}-05-scrolled`);
    await page.eval(`scrollTo(0, 0)`);
    for (const tab of ['crew', 'goals', 'boothill', 'season']) {
      await page.eval(`__iw2.ui.openTab('${tab}')`);
      await sleep(700);
      await shot(page, `${vpName}-06-sheet-${tab}`);
    }
    await page.eval(`__iw2ui.debug.sheets.close()`);
    await page.eval(`document.querySelector('.hud .gear').click()`);
    await sleep(700);
    await shot(page, `${vpName}-07-settings`);
    await page.eval(`__iw2ui.debug.sheets.close()`);
    await sleep(500);
    await page.eval(`(() => { const st = __iw2.game.state; st.saloon.held = null; st.saloon.next = __iw2.game.simTime; __iw2.game.tick(0.05); })()`);
    await sleep(500);
    await shot(page, `${vpName}-08-fling`);
    await sleep(2500);
    await page.eval(`__iw2ui.debug.captions.script('poker')`);
    await sleep(2600);
    await shot(page, `${vpName}-09-captions`);
    await page.eval(`__iw2ui.debug.captions.end(true)`);
    await page.eval(`__iw2ui.debug.hats.promo({ hat: { name: 'Fifty-Gallon' }, pomfreyHat: { name: 'Bowler' }, pomfrey: 1 })`);
    await sleep(700);
    await shot(page, `${vpName}-10-hatpromo`);
    await sleep(2500);
    await page.eval(`(() => { const g = __iw2.game, st = g.state; for (let i = 0; i < 60; i++) { const cur = g.special(); if (cur && cur.kind === 'duel') return; if (cur) g.act('claimEvent', { eventId: cur.id }); st.events.nextSpecial = g.simTime; g.tick(0.05); } })()`);
    await sleep(300);
    await shot(page, `${vpName}-11-windup`);
    await page.wait('!!document.querySelector(".duel-draw.on")', 20000).catch(() => {});
    await shot(page, `${vpName}-12-draw`);
    await page.eval(`__iw2ui.debug.specials.debug.shoot(212)`);
    await sleep(900);
    await shot(page, `${vpName}-13-duelresult`);
    await page.eval(`(__iw2.game.state.boxes.gold = 1, __iw2ui.debug.boxes.show('gold'))`);
    await sleep(1600);
    await shot(page, `${vpName}-14-strongbox`);
    await page.close();
  }
} finally { stop(port); }

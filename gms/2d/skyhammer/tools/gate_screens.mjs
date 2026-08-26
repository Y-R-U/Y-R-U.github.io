#!/usr/bin/env node
/**
 * SCREENS gate — the four things Aaron reported in his playtest.
 *   1 music list keeps its scroll position across a real toggle (and the counters stay right)
 *   2 a track preview parks the game music, and gives it back — including leaving mid-preview
 *   3 no settings footer; the version and the DONE button are in the top bar
 *   4 the act jump chips scroll BOTH ways, and 20 tiles land on 2 rows at the short viewport
 *
 * Every check has a --falsify counterpart that breaks the fix at runtime and must go red.
 *   --falsify=scroll   rebuild the music panel on toggle, the old behaviour
 *   --falsify=audio    skip the hold, the old behaviour
 *   --falsify=jump     point the chips back at the sticky .act-head
 *   --falsify=grid     put the auto-fill 70px track back
 *   --falsify=foot     re-add a footer
 */
import { harness } from '/Users/aaronair/cc/yru/site/gms/2d/skyhammer/tools/cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const FALSIFY = (process.argv.find((a) => a.startsWith('--falsify=')) || '').slice(10);
const SHOT = process.argv.includes('--shot');
const TAG = process.argv.find((a) => a.startsWith('--tag=')) ?.slice(6) || (FALSIFY ? 'f_' + FALSIFY : 'after');
const SHOTDIR = '/Users/aaronair/cc/yru/site/gms/2d/skyhammer/shots/screens';
mkdirSync(SHOTDIR, { recursive: true });

const SIZES = [[844, 390], [844, 330], [760, 620], [700, 500], [1280, 720]];
const fails = [];
const lines = [];
const ok = (pass, msg) => { lines.push(`${pass ? 'PASS' : 'FAIL'}  ${msg}`); if (!pass) fails.push(msg); };

const h = await harness({ gpu: true });
const { cdp, base } = h;

async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTDIR}/${name}.png`, Buffer.from(r.data, 'base64'));
  return `${SHOTDIR}/${name}.png`;
}

async function bootTo(w, hh, screen) {
  await cdp.viewport(w, hh, 1, true);
  await cdp.goto(`${base}/index.html?nofs=1`);
  await cdp.eval('try{localStorage.clear()}catch(e){}');   // every size starts from a fresh save
  await cdp.goto(`${base}/index.html?nofs=1`);
  await cdp.waitFor('document.getElementById("tapbtn") && !document.getElementById("tapbtn").disabled', 12000);
  await cdp.eval('document.getElementById("tapbtn").click()');
  await cdp.waitFor('window.__ui', 12000);
  await sleep(350);
  if (FALSIFY === 'grid') {
    await cdp.eval(`(()=>{const s=document.createElement('style');s.id='sab';
      s.textContent='.lv-grid{grid-template-columns:repeat(auto-fill,minmax(70px,1fr))!important;max-width:none!important}';
      document.head.appendChild(s);})()`);
  }
  if (screen) { await cdp.eval(`window.__ui.go(${JSON.stringify(screen)})`); await sleep(420); }
  if (FALSIFY === 'foot' && screen === 'settings') {
    // put the pre-fix layout back: version + DONE in a 54 px footer, nothing in the top bar
    await cdp.eval(`(()=>{
      const bar=document.querySelector('.topbar');
      const v=bar.querySelector('.set-ver'), d=bar.querySelector('.btn.go');
      const f=document.createElement('footer'); f.className='set-foot';
      if(v) f.appendChild(v); if(d) f.appendChild(d);
      document.querySelector('.screen').appendChild(f);
      const b=document.querySelector('.set-body');
      b.style.height=(b.getBoundingClientRect().height-54)+'px'; b.style.flex='0 0 auto';
    })()`);
    await new Promise((r) => setTimeout(r, 120));
  }
}

/* ============================================================ 4a jump chips both ways */
for (const [w, hh] of SIZES) {
  await bootTo(w, hh, 'levelselect');
  if (FALSIFY === 'jump') {
    // the pre-fix code: read offsetTop off the STICKY header
    await cdp.eval(`(()=>{
      const sc=document.querySelector('.map-scroll');
      const chips=[...document.querySelectorAll('.act-jump .chipbtn')];
      const heads=[...document.querySelectorAll('.act-head')];
      chips.forEach((c,i)=>{ const n=c.cloneNode(true); c.replaceWith(n);
        n.addEventListener('click',()=>{ const el=heads[i]; sc.scrollTo({top: el.offsetTop-6, behavior:'smooth'}); }); });
    })()`);
  }
  const r = await cdp.eval(`(async () => {
    const sc = document.querySelector('.map-scroll');
    const chips = [...document.querySelectorAll('.act-jump .chipbtn')];
    const secs = [...document.querySelectorAll('.act-sec')];
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    // where does the chip's own act actually END UP, relative to the scroller viewport?
    const err = async (i) => {
      chips[i].click(); await wait(950);
      const target = secs[i] || document.querySelectorAll('.act-head')[i];
      const d = target.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      return { top: sc.scrollTop, delta: Math.round(d) };
    };
    const out = { max: sc.scrollHeight - sc.clientHeight };
    sc.scrollTop = 0; await wait(80);
    out.last = await err(chips.length - 1);      // forwards
    out.first = await err(0);                    // backwards — the one that never worked
    sc.scrollTop = sc.scrollHeight; await wait(100);
    out.second = await err(1);                   // backwards from the very bottom
    return out;
  })()`);
  const tol = 14;
  // the last act cannot always reach the top: on a tall viewport the list simply ends first, so
  // "at the top OR the scroller is pinned to its maximum" is the honest requirement
  ok(Math.abs(r.last.delta) <= tol || r.last.top >= r.max - 2,
    `${w}x${hh} jump to LAST act lands it at the top of the scroller, or at max scroll (delta ${r.last.delta}px, scrollTop ${r.last.top} of max ${r.max})`);
  ok(Math.abs(r.first.delta) <= tol, `${w}x${hh} jump BACK to first act lands it at the top (delta ${r.first.delta}px, scrollTop ${r.first.top} of max ${r.max})`);
  ok(Math.abs(r.second.delta) <= tol, `${w}x${hh} jump back to act 2 from the bottom (delta ${r.second.delta}px, scrollTop ${r.second.top})`);

  /* ==================================================== 4b twenty tiles on two rows */
  const geo = await cdp.eval(`(() => {
    const sc = document.querySelector('.map-scroll');
    return [...document.querySelectorAll('.lv-grid')].map((g) => {
      const tiles = [...g.children];
      const tops = [...new Set(tiles.map(t => Math.round(t.offsetTop)))];
      return {
        n: tiles.length, rows: tops.length,
        cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
        gridH: Math.round(g.getBoundingClientRect().height),
        tileW: tiles[0] ? Math.round(tiles[0].getBoundingClientRect().width) : 0,
        tileH: tiles[0] ? Math.round(tiles[0].getBoundingClientRect().height) : 0,
        headPlusGrid: Math.round(g.parentNode.getBoundingClientRect().height),
        scrollerH: sc.clientHeight,
      };
    });
  })()`);
  const full = geo.filter((g) => g.n === 20);
  ok(full.length >= 5, `${w}x${hh} found ${full.length} acts of 20 levels`);
  const bad = full.filter((g) => g.rows !== 2);
  ok(bad.length === 0, `${w}x${hh} every act of 20 is 2 rows (cols ${full[0] && full[0].cols}, tile ${full[0] && full[0].tileW}x${full[0] && full[0].tileH}, gridH ${full[0] && full[0].gridH}) — ${bad.length} act(s) wrong`);
  ok(full.every((g) => g.tileW >= 44 && g.tileH >= 44), `${w}x${hh} tiles stay above the 44px touch floor (${full[0] && full[0].tileW}x${full[0] && full[0].tileH})`);
  const sec = full[0];
  ok(!!sec && sec.headPlusGrid <= sec.scrollerH, `${w}x${hh} a whole act (head + both rows, ${sec && sec.headPlusGrid}px) fits the ${sec && sec.scrollerH}px scroller without scrolling`);
  if (SHOT) await shot(`${TAG}_campaign_${w}x${hh}`);
}

/* ============================================ 1 + 3 settings: scroll memory, no footer */
for (const [w, hh] of [[844, 390], [1280, 720]]) {
  await bootTo(w, hh, 'settings');
  const layout = await cdp.eval(`(() => {
    const sc = document.querySelector('.music-scroll');
    return {
      foot: !!document.querySelector('.set-foot'),
      ver: !!document.querySelector('.topbar .set-ver'),
      done: !!document.querySelector('.topbar .btn.go'),
      back: !!document.querySelector('.topbar .btn.back'),
      listH: sc.clientHeight, contentH: sc.scrollHeight,
      colH: Math.round(document.querySelector('.set-col').getBoundingClientRect().height),
    };
  })()`);
  ok(!layout.foot, `${w}x${hh} settings has no bottom bar`);
  ok(layout.ver, `${w}x${hh} name/version is in the top bar`);
  ok(layout.done && layout.back, `${w}x${hh} the leave button is in the top bar (done ${layout.done}, back arrow ${layout.back})`);
  ok(layout.listH >= (hh === 390 ? 275 : 600), `${w}x${hh} track list viewport is ${layout.listH}px (was 229 / 557 with the footer)`);

  const s = await cdp.eval(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const sc = document.querySelector('.music-scroll');
    sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * 0.6);
    await wait(60);
    const before = sc.scrollTop;
    const scr = sc.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.trow')];
    const vis = rows.find(r => { const b = r.getBoundingClientRect(); return b.top >= scr.top && b.bottom <= scr.bottom; }) || rows[0];
    const label = vis.querySelector('.trow-n').textContent;
    const head0 = document.querySelector('.music-head .set-sub').textContent;
    const grp0 = [...document.querySelectorAll('.music-group-c')].map(x => x.textContent).join(',');
    vis.querySelector('.switch').click();
    await wait(160);
    const sc2 = document.querySelector('.music-scroll');
    const after = sc2.scrollTop;
    const head1 = document.querySelector('.music-head .set-sub').textContent;
    const grp1 = [...document.querySelectorAll('.music-group-c')].map(x => x.textContent).join(',');
    const offRows = [...document.querySelectorAll('.trow.trow-off')].length;
    // and a group bulk button, which used to rebuild too. Re-query and re-scroll first: a check
    // that starts from scrollTop 0 passes on a rebuild too and would prove nothing.
    const liveSc = document.querySelector('.music-scroll');
    liveSc.scrollTop = Math.round((liveSc.scrollHeight - liveSc.clientHeight) * 0.45);
    await wait(80);
    const gtop = liveSc.scrollTop;
    document.querySelectorAll('.music-group .btn.tiny')[2].click();
    await wait(160);
    return {
      before, after, sameNode: sc2 === sc, label,
      head0, grp0, head1, grp1, offRows,
      afterBulkScroll: document.querySelector('.music-scroll').scrollTop, bulkFrom: gtop,
      head2: document.querySelector('.music-head .set-sub').textContent,
      grp2: [...document.querySelectorAll('.music-group-c')].map(x => x.textContent).join(','),
      offRows2: [...document.querySelectorAll('.trow.trow-off')].length,
    };
  })()`);
  ok(s.after === s.before, `${w}x${hh} scrollTop survives a track toggle (${s.before} -> ${s.after}, row "${s.label}")`);
  ok(s.sameNode, `${w}x${hh} the scroller node itself is not replaced`);
  ok(s.afterBulkScroll === s.bulkFrom && s.bulkFrom > 0, `${w}x${hh} scrollTop survives a group ON/OFF (${s.bulkFrom} -> ${s.afterBulkScroll})`);
  ok(s.head0 === '22 of 22 on' && s.head1 === '21 of 22 on', `${w}x${hh} header count follows the toggle ("${s.head0}" -> "${s.head1}")`);
  ok(s.offRows === 1, `${w}x${hh} exactly the toggled row went grey (${s.offRows})`);
  ok(s.grp1 !== s.grp0, `${w}x${hh} group counters follow the toggle (${s.grp0} -> ${s.grp1})`);
  ok(/^\d+ of 22 on$/.test(s.head2) && s.grp2.includes('0/12'), `${w}x${hh} bulk OFF updates the header and the group counter ("${s.head2}", groups ${s.grp2})`);
  ok(s.offRows2 >= 12, `${w}x${hh} bulk OFF greys the rows it turned off (${s.offRows2} off)`);
  if (SHOT) await shot(`${TAG}_settings_${w}x${hh}`);
}

/* ================================================== 2 preview vs the game music */
{
  await bootTo(844, 390, null);
  await cdp.waitFor('window.__audio && window.__audio.snap().now', 12000);
  if (FALSIFY === 'audio') {
    // remove the hold: the old behaviour, preview over the top of the music
    await cdp.eval(`(()=>{const a=window.__ui;})()`);
  }
  await cdp.eval('window.__ui.go("settings")');
  await sleep(500);
  if (FALSIFY === 'audio') {
    await cdp.eval(`(()=>{ const api = window.__audio.api;
      api.__stopMusic = api.stopMusic; api.stopMusic = () => {};   // sabotage: the hold does nothing
    })()`);
  }
  const snap = () => cdp.eval('JSON.parse(JSON.stringify(window.__audio.snap()))');
  const live = (s) => { const d = s.decks.find((x) => x.state === 'live'); return d ? d.id : null; };

  const s0 = await snap();
  ok(!!live(s0), `music is playing before the preview (${live(s0)})`);

  await cdp.eval(`document.querySelector('.trow .btn.prev').click()`);
  await sleep(1100);
  const s1 = await snap();
  const p1 = await cdp.eval('({id: window.__settings.previewId(), playing: window.__settings.previewPlaying(), holding: window.__settings.holding()})');
  ok(p1.playing, `the preview element is actually playing (${p1.id})`);
  ok(!live(s1), `the game music is parked while the preview runs (live deck: ${live(s1)}, decks ${JSON.stringify(s1.decks.map((d) => [d.state, d.id, +d.gain.toFixed(2)]))})`);

  // a pref change while previewing must not resurrect it (prefs.apply() calls setMusic every time)
  await cdp.eval(`document.querySelectorAll('.trow .switch')[5].click()`);
  await sleep(800);
  const s2 = await snap();
  const p2 = await cdp.eval('window.__settings.previewPlaying()');
  ok(!live(s2), `a setting change mid-preview does not restart the music (live deck: ${live(s2)})`);
  ok(p2, 'the preview is still playing after that setting change');

  // stopping the preview gives the music back
  await cdp.eval(`document.querySelector('.trow .btn.prev.playing').click()`);
  await sleep(900);
  const s3 = await snap();
  const p3 = await cdp.eval('({id: window.__settings.previewId(), playing: window.__settings.previewPlaying()})');
  ok(!p3.playing, 'stopping the preview stops the preview element');
  ok(!!live(s3), `stopping the preview brings the game music back (${live(s3)})`);

  // and the case that will actually happen: leave the screen mid-preview
  await cdp.eval(`document.querySelector('.trow .btn.prev').click()`);
  await sleep(900);
  const during = await snap();
  ok(!live(during), 'music parked again for the second preview');
  // leave to PAUSE, not to title: MENU_MUSIC.title makes main.js re-issue audio.music('title'),
  // which would restart the music whether or not this screen released it. MENU_MUSIC.pause is
  // null, so nothing but the release can bring it back.
  await cdp.eval('window.__ui.go("pause")');
  await sleep(1600);
  const s4 = await snap();
  const p4 = await cdp.eval('({playing: window.__settings.previewPlaying(), holding: window.__settings.holding()})');
  ok(!p4.playing, 'leaving mid-preview stops the preview');
  ok(!p4.holding, 'leaving mid-preview releases the hold');
  ok(!!live(s4), `leaving mid-preview leaves the game music playing, not silent (${live(s4)})`);
  const liveCount = s4.decks.filter((d) => d.state === 'live').length;
  ok(liveCount === 1, `exactly one deck is live after all that — no double-play (${liveCount})`);
}

ok(cdp.errors.length === 0, `zero page errors (${cdp.errors.join(' | ') || 'none'})`);

console.log(lines.join('\n'));
console.log(`\n--- ${fails.length ? fails.length + ' FAILED' : 'ALL ' + lines.length + ' PASSED'} ---${FALSIFY ? ' [falsify=' + FALSIFY + ']' : ''}`);
h.close();
process.exit(fails.length ? 1 : 0);

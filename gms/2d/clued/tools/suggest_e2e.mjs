#!/usr/bin/env node
// Suggested sets on the host screen, real clicks: no saves → Sets opens on Suggested → load Classic Pub Quiz (5 rounds)
// → remove one → Save set → Sets now opens on My sets with the 4-round copy, Suggested still shows the 5-round original.
// Then (portrait, unless --no-room) a device room from a suggestion: create, start, play one round to the podium, save
// the podium's set, and load that set back into the host screen. Music through the decades: ✕ / ▲ / ▼ at 390x844.
//   node tools/suggest_e2e.mjs [OUT] [portrait|landscape|both] [--no-room]
// Needs the :8888 site server and a cdp Chrome (CDP_PORT, e.g. 9540); the room part needs internet (PeerJS broker).
import { open } from './a_cdp.mjs';
import { startLocalServer, blockProd } from './lib/localserver.mjs';
import { SUGGESTED } from '../js/net/suggested.js';
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const OUT = args[0] || '/tmp';
const which = args[1] || 'both';
const ROOM = !process.argv.includes('--no-room');
// the host screen's server calls go to a local server, never the live one (it has the daily allowance on)
const srv = await startLocalServer({ tag: 'clued-suggest' });
const URL = `http://localhost:8888/gms/2d/clued/?test&noauth=1&${srv.query}`;
const SIZES = { portrait: [384, 854], landscape: [854, 384] };
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const b = await open({ width: 384, height: 854, mobile: true });
await blockProd(b.send);
const q = s => JSON.stringify(s);
const count = sel => b.eval(`document.querySelectorAll(${q(sel)}).length`);
const tabOn = () => b.eval(`document.querySelector('.pop .set-tab[aria-selected=true]')?.dataset.tab || null`);
const rowText = (name, tab) => b.eval(`[...document.querySelectorAll('.pop .set-row${tab === 'suggested' ? '.no-del' : ':not(.no-del)'}')].find(r => r.dataset.set === ${q(name)})?.textContent || ''`);
const closePop = async () => { await b.click('.pop .btn:not(.primary)'); await b.sleep(400); };

async function boot(tag) {
  await b.goto(URL); await b.waitFor('window.__cluedReady');
  await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ bgm: false })); true`);
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await b.click('.tile[data-mode="online"]'); await b.waitFor('document.querySelector("[data-act=host]")');
  await b.click(`[data-act=${tag}]`); await b.waitFor('document.querySelector(".round-card")'); await b.sleep(400);
}

async function flow(orient) {
  const [w, h] = SIZES[orient];
  await b.viewport(w, h, 2, true);
  await boot('host');
  ok(await b.eval('document.body.dataset.screen') === 'host', `${orient}: host screen`);
  ok(await b.eval(`document.querySelector('[data-act=sets-load]')?.textContent.includes('Sets')`), `${orient}: 📂 Sets shows with no saves`);
  await b.click('[data-act=sets-load]'); await b.sleep(500);
  ok(await tabOn() === 'suggested', `${orient}: popup opens on Suggested`);
  ok(await b.eval(`document.querySelector('.pop .set-tab[data-tab=mine]')?.textContent`) === 'My sets (0)', `${orient}: My sets (0) tab`);
  const n = await count('.pop .set-row.no-del');
  ok(n === SUGGESTED.length, `${orient}: ${SUGGESTED.length} suggestions listed (${n})`);
  ok(await count('.pop [data-act=set-delete]') === 0, `${orient}: suggestions have no ✕`);
  const pub = await rowText('Classic Pub Quiz', 'suggested');
  ok(pub.includes('5 rounds · 50 questions') && pub.includes('Friday-night'), `${orient}: pub quiz row: rounds line + blurb`);
  await b.shot(`${OUT}/suggest-${orient}-popup.png`);
  await b.click('.pop .set-row.no-del[data-set="Classic Pub Quiz"] .set-load'); await b.sleep(1500);
  ok(await count('.round-card') === 5, `${orient}: 5 rounds loaded`);
  ok(await b.eval(`document.querySelector('.set-name')?.textContent`) === 'Classic Pub Quiz', `${orient}: set name shown`);
  ok(await b.eval(`document.querySelector('[data-opt=answer] .chip.on, [data-opt=answer] .chip[aria-pressed=true]')?.textContent || ''`).then(t => t.includes('15')), `${orient}: answer time 15 s from the suggestion`);
  ok(await b.eval(`document.querySelector('.round-card[data-round="2"] .r-t').textContent.includes('Geography')`), `${orient}: round 3 is Geography`);
  await b.shot(`${OUT}/suggest-${orient}-loaded.png`);
  await b.click('.round-card[data-round="1"] [data-act=round-remove]'); await b.sleep(400);
  ok(await count('.round-card') === 4, `${orient}: removed a round (4 left)`);
  await b.click('[data-act=sets-save]'); await b.sleep(400);
  ok(await b.eval(`document.querySelector('.pop input').value`) === 'Classic Pub Quiz', `${orient}: Save set pre-fills the suggestion's name`);
  await b.click('.pop .btn.primary'); await b.sleep(600);
  await b.click('[data-act=sets-load]'); await b.sleep(500);
  ok(await tabOn() === 'mine', `${orient}: popup now opens on My sets`);
  const mine = await rowText('Classic Pub Quiz', 'mine');
  ok(mine.includes('4 rounds · 40 questions'), `${orient}: My sets holds the 4-round copy`);
  await b.shot(`${OUT}/suggest-${orient}-mine.png`);
  await b.click('.pop .set-tab[data-tab=suggested]'); await b.sleep(300);
  ok((await rowText('Classic Pub Quiz', 'suggested')).includes('5 rounds · 50 questions'), `${orient}: Suggested still lists the 5-round original`);
  await closePop();
  const stored = await b.eval(`JSON.parse(localStorage.getItem('clued.sets')).list.map(s => s.rounds.length).join()`);
  ok(stored === '4', `${orient}: one user set stored (${stored})`);
}

// Music through the decades at 390x844: seven decade rounds in order, ✕ removes one in a single tap, ▲/▼ keep order sane.
async function decades() {
  await b.viewport(390, 844, 2, true);
  await boot('host');
  const titles = () => b.eval(`[...document.querySelectorAll('.round-card .r-t')].map(e => e.textContent.replace(/^\\d+\\. /, '')).join('|')`);
  await b.click('[data-act=sets-load]'); await b.sleep(500);
  ok((await rowText('Music through the decades', 'suggested')).includes('7 rounds · 56 questions'), 'decades: row shows 7 rounds · 56 questions');
  await b.click('.pop .set-row.no-del[data-set="Music through the decades"] .set-load'); await b.sleep(1500);
  const all = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'].map(d => `${d} hits`);
  ok(await titles() === all.join('|'), `decades: 7 rounds, 1960s → 2020s (${await titles()})`);
  ok((await b.eval(`document.querySelector('.rounds-sum').textContent`)).startsWith('7 rounds · 56 questions'), 'decades: 56 questions');
  ok(await count('.round-card [data-act=round-remove]:not([disabled])') === 7, 'decades: every round has an enabled ✕');
  await b.eval('scrollTo(0, 0)');
  await b.shot(`${OUT}/decades-loaded-390x844.png`);
  await b.click('.round-card[data-round="0"] [data-act=round-remove]'); await b.sleep(300);
  ok(await titles() === all.slice(1).join('|'), 'decades: one tap on ✕ removed the 1960s, no confirm');
  await b.click('.round-card[data-round="5"] [data-act=round-remove]'); await b.sleep(300);
  ok(await titles() === all.slice(1, 6).join('|'), 'decades: one more tap removed the 2020s');
  await b.click('.round-card[data-round="4"] [data-act=round-up]'); await b.sleep(300);
  ok(await titles() === [all[1], all[2], all[3], all[5], all[4]].join('|'), 'decades: ▲ swaps the 2010s above the 2000s');
  await b.click('.round-card[data-round="3"] [data-act=round-down]'); await b.sleep(300);
  ok(await titles() === all.slice(1, 6).join('|'), 'decades: ▼ puts it back; numbering follows');
  ok(await b.eval(`[...document.querySelectorAll('.round-card .r-t')].map(e => e.textContent.match(/^\\d+/)[0]).join()`) === '1,2,3,4,5', 'decades: rounds renumber 1–5');
  ok((await b.eval(`document.querySelector('.rounds-sum').textContent`)).startsWith('5 rounds · 40 questions'), 'decades: summary follows (5 rounds · 40 questions)');
  await b.eval('scrollTo(0, 0)');
  await b.shot(`${OUT}/decades-after-remove-390x844.png`);
  for (let k = 0; k < 4; k++) { await b.click('.round-card[data-round="0"] [data-act=round-remove]'); await b.sleep(250); }
  ok(await count('.round-card') === 1 && await b.eval(`document.querySelector('.round-card [data-act=round-remove]').disabled`), 'decades: the last round keeps a disabled ✕');
}

async function room() {
  await b.viewport(384, 854, 2, true);
  await boot('host-device');
  await b.click('[data-act=sets-load]'); await b.sleep(500);
  await b.click('.pop .set-row.no-del[data-set="Quick Quiz"] .set-load'); await b.sleep(1500);
  ok(await count('.round-card') === 3, 'room: Quick Quiz loaded (3 rounds)');
  // one short round for the podium: keep General knowledge, host taps Next
  await b.click('.round-card[data-round="2"] [data-act=round-remove]'); await b.sleep(300);
  await b.click('.round-card[data-round="1"] [data-act=round-remove]'); await b.sleep(300);
  await b.click('[data-opt=gap] .chip[data-v="0"]');
  await b.eval(`(() => { const i = document.querySelector('[data-field=name]'); i.value = 'Hosty'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await b.click('[data-act=create]');
  await b.waitFor(`document.querySelector('.net-code')?.textContent`, 60000);
  const st = await b.eval('window.__cluedRoom?.st');
  ok(!!st, `room: lobby ${await b.eval(`document.querySelector('.net-code').textContent`)}`);
  await b.click('[data-act=start]');
  let answered = 0, seen = new Set();
  for (let i = 0; i < 120; i++) {
    const st = await b.eval(`(() => { const s = window.__cluedRoom?.st; return s ? { phase: s.phase, q: s.q } : null; })()`);
    if (st?.phase === 'final') break;
    if (st?.phase === 'question') seen.add(st.q);
    if (st?.phase === 'question' && await b.eval(`!!document.querySelector('.play .choice:not([disabled])')`)) {
      await b.click('.play .choice:not([disabled])'); answered++; await b.sleep(500);
    }
    if (await b.eval(`!!document.querySelector('[data-act=next]')`)) await b.click('[data-act=next]');
    await b.sleep(600);
  }
  ok(seen.size === 10 && answered >= 8, `room: played ${seen.size} questions from the suggestion (answered ${answered})`);
  await b.waitFor(`window.__cluedRoom?.st?.phase === 'final' && document.querySelector('[data-act=save-set]')`, 30000);
  await b.shot(`${OUT}/suggest-podium.png`);
  await b.click('[data-act=save-set]'); await b.sleep(400);
  await b.eval(`document.querySelector('.pop input').value = 'From the podium'; true`);
  await b.click('.pop .btn.primary'); await b.sleep(600);
  const saved = await b.eval(`JSON.parse(localStorage.getItem('clued.sets')).list.find(s => s.name === 'From the podium')`);
  ok(saved && saved.rounds.length === 1 && !('online' in saved.rounds[0].opts), 'podium: set saved without the online opt');
  // load it back into the host screen (the "untested by hand" item)
  await b.click('[data-act=leave], [data-act=done]'); await b.sleep(1500);
  await b.eval(`window.__cluedCtx?.go ? (window.__cluedCtx.go('host'), true) : false`) || await b.click('[data-act=host]');
  await b.waitFor('document.querySelector("[data-act=sets-load]")', 10000);
  await b.click('[data-act=rounds-reset]').catch(() => {});
  await b.click('[data-act=sets-load]'); await b.sleep(500);
  ok(await tabOn() === 'mine', 'podium set: Sets opens on My sets');
  await b.click('.pop .set-row:not(.no-del)[data-set="From the podium"] .set-load'); await b.sleep(1500);
  const t = await b.eval(`[...document.querySelectorAll('.round-card .r-t')].map(e => e.textContent).join('|')`);
  ok(t === '1. General knowledge', `podium set loads into the host screen (${t})`);
  ok(await b.eval(`document.querySelector('.set-name')?.textContent`) === 'From the podium', 'podium set: name shown');
  await b.shot(`${OUT}/suggest-podium-loaded.png`);
}

try {
  for (const o of which === 'both' ? ['portrait', 'landscape'] : [which]) await flow(o);
  await decades();
  if (ROOM) await room();
} catch (e) { fails++; console.log('FAIL', e.message); await b.shot(`${OUT}/suggest-error.png`).catch(() => {}); }
const errs = b.logs.filter(l => /\[exception\]|\[error\]/.test(l));
ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 3).join(' / ') : ''}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

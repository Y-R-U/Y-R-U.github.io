#!/usr/bin/env node
// Genres e2e (solo, against a throwaway local server; production API requests are blocked): the picker lists the Genres
// theme, a Quick game on Genres › Sci-fi by real clicks, then sci-fi rounds in several formats (picture, listen, books,
// famous lines, hat-trick) with every question checked to come from one sci-fi part, kids mode without the adult
// genres, and the pub quiz loading the Sci-fi Night set.
//   ~/.claude/bin/cdp start --port 9662 -- --autoplay-policy=no-user-gesture-required
//   CDP_PORT=9662 node tools/genre_e2e.mjs OUT [portrait|landscape]
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './a_cdp.mjs';
import { startLocalServer, blockProd } from './lib/localserver.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || '/tmp';
const MODE = process.argv[3] || 'portrait';
mkdirSync(OUT, { recursive: true });
const index = JSON.parse(readFileSync(join(ROOT, 'data/index.json'), 'utf8'));
const genres = JSON.parse(readFileSync(join(ROOT, 'data/genres.json'), 'utf8'));
const SCIFI = index.packs['genre~scifi'].virtual.parts;
const inScifi = ref => { const [p, i] = String(ref).split('/'); return SCIFI.includes(p) && (i.startsWith('q:') || genres.packs[index.packs[p].virtual.of].scifi.includes(i)); };

const srv = await startLocalServer({ tag: 'clued-genre' });
const URL = `http://localhost:8888/gms/2d/clued/?test&noauth=1&${srv.query}`;
const b = await open(MODE === 'landscape' ? { width: 854, height: 384, mobile: true } : { width: 384, height: 854, mobile: true });
await blockProd(b.send);
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
const vis = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!(e && (e.offsetParent || e.getClientRects().length)); })()`;
const screen = () => b.eval('document.body.dataset.screen');
const cur = async () => { const s = await b.eval('(() => { const q = window.__cluedRun?.current(); return q ? JSON.stringify({ id: q.id, p: q.prompt, refs: q.refs, f: q.format, img: !!q.media?.img?.length, a: q.answerText, opts: (q.options || []).map(o => o.text) }) : null; })()'); return s && JSON.parse(s); };
const packOf = q => String(q.refs?.[0] || '').split('/')[0];

// answers every question (the test hook picks the right answer once the question is up); shoot(q) → a screenshot name
async function play(shoot = () => null) {
  const asked = [];
  let shotNext = null;
  for (let guard = 0; guard < 1500 && (await screen()) === 'play'; guard++) {
    if (await b.eval(vis('[data-act=ready]'))) { await b.click('[data-act=ready]'); continue; }
    if (await b.eval(vis('.reveal.show .next'))) {
      if (shotNext) { await b.sleep(500); await b.shot(`${OUT}/${shotNext}-reveal.png`); shotNext = null; }
      await b.click('.reveal.show .next'); await b.sleep(250); continue;
    }
    const q = await cur();
    if (q && !asked.some(x => x.id === q.id)) {
      if (q.f === 'listen') {
        let st = '';
        for (let t = 0; t < 120 && !/Pick your answer/.test(st); t++) { await b.sleep(250); st = await b.eval(`document.querySelector('.au-status')?.textContent || ''`); }
        q.played = /Pick your answer/.test(st);
      } else await b.waitFor(vis('.q-prompt'), 10000).catch(() => {});
      asked.push(q);
      const name = shoot(q);
      if (name) { await b.sleep(900); await b.shot(`${OUT}/${name}.png`); shotNext = name; }
      await b.eval(`window.__clued.answer('correct'); true`);
      if (q.f === 'trio') { await b.sleep(300); if (await b.eval(vis('[data-act=lock]'))) await b.click('[data-act=lock]'); }
      await b.sleep(350);
      continue;
    }
    await b.sleep(200);
  }
  return asked;
}
const start = async rounds => {
  await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
  await b.eval(`window.__clued.start({ structure: 'quick', rounds: ${JSON.stringify(rounds)} }); true`);
  await b.waitFor(`document.body.dataset.screen === 'play'`, 20000);
};
const onePack = qs => qs.every(q => new Set((q.refs || []).map(r => String(r).split('/')[0])).size <= 1);

await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.clear(); localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);

// 1. the theme picker lists Genres; a Quick game on Genres › Sci-fi by real clicks
await b.click('[data-mode=solo]'); await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.click('.theme-sum button'); await b.sleep(200);
if (await b.eval(`document.querySelector('input.tick[aria-label="All themes"]')?.checked`)) await b.click('input.tick[aria-label="All themes"]');
ok(await b.eval(vis('.th[data-theme=genres]')), 'Genres theme in the picker');
await b.click('.th[data-theme=genres] .th-exp'); await b.sleep(250);
const names = await b.eval(`[...document.querySelectorAll('.th[data-theme=genres] .pk-name')].map(e => e.textContent)`);
ok(['Sci-fi', 'Horror', 'Fantasy', 'Comedy', 'Family & animation'].every(n => names.includes(n)), `Genres lists ${names.join(' · ')}`);
await b.eval(`document.querySelector('.th[data-theme=genres]').scrollIntoView({ block: 'center' }); true`); await b.sleep(200);
await b.shot(`${OUT}/picker-genres-${MODE}.png`);
await b.click('.th[data-theme=genres] input.tick[aria-label="Sci-fi"]'); await b.sleep(200);
const sum = await b.eval(`document.querySelector('.theme-sum .ts-txt')?.textContent || ''`);
ok(/1 pack/.test(sum) && /Sci-fi/.test(sum), `picker shows Sci-fi only ("${sum}")`);
await b.click('button.chip[data-v="10"]');
await b.click('[data-act=start]');
await b.waitFor(`document.body.dataset.screen === 'play'`, 20000);
const g1 = await play();
await b.waitFor('document.body.dataset.screen === "results"', 20000);
ok(g1.length === 10 && g1.every(q => q.refs.every(inScifi)), `Sci-fi mc game: ${g1.length} questions from ${[...new Set(g1.map(packOf))].join(', ')}`);
ok(onePack(g1), 'each question keeps to one pack');

// 2. picture round: name the film, show or book from a picture
let shotPic = 0;
await start([{ format: 'mc', packs: ['genre~scifi'], count: 10, opts: { source: 'pictures', answers: 4 }, difficulty: 0 }]);
const g2 = await play(q => (!shotPic && q.img && packOf(q) === 'movie-moments~scifi' && (shotPic = 1) ? `scifi-picture-${MODE}` : null));
ok(g2.length === 10 && g2.every(q => /moments~scifi$/.test(packOf(q)) && q.refs.every(inScifi)), `picture round: ${g2.length} from ${[...new Set(g2.map(packOf))].join(', ')}`);
ok(onePack(g2), 'picture options keep to one pack (films with films, books with books)');

// 3. listen: sci-fi theme tunes
let shotLis = 0;
await start([{ format: 'listen', packs: ['genre~scifi'], count: 3, opts: { clip: 3, art: 'off', ask: 'auto', answers: 4 }, difficulty: 0 }]);
const g3 = await play(q => (!shotLis && (shotLis = 1) ? `scifi-listen-${MODE}` : null));
ok(g3.length === 3 && g3.every(q => packOf(q) === 'screen-themes~scifi' && q.refs.every(inScifi)), `listen: ${g3.map(q => q.a).join(', ')}`);
ok(g3.every(q => q.played), `every clip reached "Pick your answer" (${g3.map(q => (q.played ? 'played' : 'stuck')).join(', ')})`);

// 4. a book question (sci-fi books)
let shotBook = 0;
await start([{ format: 'mc', packs: ['books~scifi', 'book-moments~scifi'], count: 8, opts: { source: 'mix', answers: 4 }, difficulty: 0 }]);
const g4 = await play(q => (!shotBook && /^books~/.test(packOf(q)) && (shotBook = 1) ? `scifi-book-${MODE}` : null));
ok(g4.length === 8 && g4.every(q => /^book/.test(packOf(q)) && q.refs.every(inScifi)), `books round: ${g4.length} from ${[...new Set(g4.map(packOf))].join(', ')}`);

// 5. famous lines (film and TV lines, book opening lines)
let shotQ = 0;
await start([{ format: 'quote', packs: ['genre~scifi'], count: 8, opts: { answers: 4 }, difficulty: 0 }]);
const g5 = await play(q => (!shotQ && (shotQ = 1) ? `scifi-quote-${MODE}` : null));
ok(g5.length === 8 && g5.every(q => q.refs.every(inScifi)), `quote round: ${g5.length} from ${[...new Set(g5.map(packOf))].join(', ')}`);
ok(onePack(g5), 'quote options keep to one pack');

// 6. hat-trick
let shotT = 0;
await start([{ format: 'trio', packs: ['genre~scifi'], count: 2, opts: {}, difficulty: 0 }]);
const g6 = await play(q => (!shotT && (shotT = 1) ? `scifi-trio-${MODE}` : null));
ok(g6.length === 2 && g6.every(q => q.refs.every(inScifi)), `hat-trick: ${g6.map(q => q.a || q.p).join(' | ')}`);

// 7. kids mode: no horror, crime or war
await b.goto(URL); await b.waitFor('window.__cluedReady');
await b.eval(`localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false, kids: true })); true`);
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.click('[data-mode=solo]'); await b.click('[data-mode=quick]'); await b.click('[data-format=mc]');
await b.click('.theme-sum button'); await b.sleep(200);
await b.click('.th[data-theme=genres] .th-exp').catch(() => {}); await b.sleep(200);
const kidsNames = await b.eval(`[...document.querySelectorAll('.th[data-theme=genres] .pk-name')].map(e => e.textContent)`);
ok(kidsNames.length && !kidsNames.some(n => /Horror|Crime|War/.test(n)), `kids Genres: ${kidsNames.join(' · ')}`);
await b.eval(`localStorage.setItem('clued.settings', JSON.stringify({ timerSec: 0, bgm: false })); true`);

// 8. pub quiz: Ready-made › Sci-fi Night fills the rounds
await b.goto(URL); await b.waitFor('window.__cluedReady'); await b.sleep(300);
await b.click('[data-mode=together]'); await b.click('[data-mode=pubquiz]'); await b.sleep(300);
await b.click('[data-act=ready-made]'); await b.sleep(300);
if (await b.eval(vis('.set-tab[data-tab=suggested]'))) await b.click('.set-tab[data-tab=suggested]');
await b.click('.set-row[data-set="Sci-fi Night"] .set-load'); await b.sleep(400);
const rounds = await b.eval(`document.querySelectorAll('.rounds [data-act=round-edit]').length`);
const saved = await b.eval(`JSON.parse(localStorage.getItem('clued.pubquiz') || '{}').rounds || []`);
ok(saved.length === 6 && saved.every(r => r.packs.some(p => /scifi$/.test(p))) && rounds === 6, `pub quiz loaded Sci-fi Night: ${saved.map(r => `${r.format}`).join(', ')} (${rounds} cards)`);
await b.shot(`${OUT}/pubquiz-scifi-${MODE}.png`);

const errs = b.logs.filter(l => /exception|\[error\]/i.test(l) && !/ERR_BLOCKED_BY_CLIENT|blocked|net::/i.test(l));
ok(!errs.length, `no console errors${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
console.log([...g2.slice(0, 2), ...g3.slice(0, 2), ...g4.slice(0, 2), ...g5.slice(0, 2), ...g6.slice(0, 1)].map(q => `  ${packOf(q)} [${q.f}]: ${q.p} → ${q.a} | ${q.opts.join(' / ')}`).join('\n'));
b.close();
srv.stop();
console.log(fails ? `genre_e2e: ${fails} failure(s)` : 'genre_e2e: all passed');
process.exit(fails ? 1 : 0);

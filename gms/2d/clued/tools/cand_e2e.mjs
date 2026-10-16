#!/usr/bin/env node
// Candidate gate: review.html lists data/candidates/* pictures (refs "<pack>:new/<key>") against a fake admin API, opens on
// them, saves verdicts under candidate refs, and carries an OK candidate verdict over to the promoted live copy; the game
// itself never requests a candidate file or candidate picture.
// Needs: ~/.claude/bin/cdp start --port 9406 -- --use-angle=metal (CDP_PORT=9406) and the :8888 site server.
// Usage: node tools/cand_e2e.mjs [outDir] [--falsify]   (--falsify must end in 1 FAILED: proves the leak check can fail)
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './a_cdp.mjs';
import { momentFile } from './mv_paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || '/tmp';
const BASE = 'http://localhost:8888/gms/2d/clued/';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const idx = JSON.parse(readFileSync(join(ROOT, 'data/candidates/index.json'), 'utf8'));
const candTotal = idx.candidates.reduce((s, c) => s + c.pictures, 0);
ok(idx.candidates.length > 0 && candTotal > 0, `candidate files exist: ${idx.candidates.map(c => `${c.pack} ${c.pictures}`).join(', ')}`);
const gameIndex = readFileSync(join(ROOT, 'data/index.json'), 'utf8');
ok(!/candidates|media\/cand\//.test(gameIndex), 'data/index.json names no candidate file or picture');

const b = await open({ port: 9406, width: 384, height: 854, mobile: true });
const reviews = new Map();
const posts = [];
let failPosts = 0;
// a live movie-moments picture whose candidate twin was approved earlier (same hashed file name)
const LIVE_KEY = 'titanic-1', liveFile = momentFile(LIVE_KEY);
reviews.set(`movie-moments:new/${LIVE_KEY}`, { ref: `movie-moments:new/${LIVE_KEY}`, src: `media/cand/movie-moments/${liveFile}`, verdict: 'ok' });
const AUTH = `export const auth = { ready: async () => {}, getIdToken: async () => 'tok', user: { email: 'admin@test' } };
export async function signInGoogle() {}`;
const b64 = s => Buffer.from(s).toString('base64');
b.on('Fetch.requestPaused', async ({ requestId, request }) => {
  const reply = (body, type = 'application/json') => b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: b64(body),
    responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
  if (request.url.includes('/lib/auth/auth.js')) return reply(AUTH, 'text/javascript');
  if (request.url.includes('/fakeapi/admin/imgreview')) {
    if (request.method === 'POST' && failPosts > 0) {
      failPosts--;
      return b.send('Fetch.fulfillRequest', { requestId, responseCode: 500, body: b64(JSON.stringify({ error: 'boom' })), responseHeaders: [{ name: 'Content-Type', value: 'application/json' }] }).catch(() => {});
    }
    if (request.method === 'POST') {
      const items = JSON.parse(request.postData || '{}').items || [];
      posts.push(items);
      for (const it of items) if (it.verdict) reviews.set(it.ref, it); else reviews.delete(it.ref);
      return reply(JSON.stringify({ saved: items.length }));
    }
    return reply(JSON.stringify({ reviews: [...reviews.values()] }));
  }
  b.send('Fetch.continueRequest', { requestId }).catch(() => {});
});
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/lib/auth/auth.js*' }, { urlPattern: '*/fakeapi/*' }] });
const requested = [];
b.on('Network.requestWillBeSent', ({ request }) => requested.push(request.url));

// review page
await b.goto(`${BASE}review.html?api=http://localhost:8888/fakeapi`);
await b.waitFor(`document.querySelector('#rv-pack') && document.querySelectorAll('.rv-card').length > 0`, 30000);
const first = idx.candidates[0];
ok(await b.eval(`document.querySelector('#rv-pack').value`) === `${first.pack}:new`, `opens on the first candidate set (${first.pack}:new)`);
ok(await b.eval(`document.querySelector('.rv-seg button.on').textContent`) === 'To review', 'default filter is To review');
const opts = await b.eval(`[...document.querySelectorAll('#rv-pack option')].map(o => o.textContent)`);
ok(idx.candidates.every((c, i) => opts[i].startsWith(c.title)), `candidate sets head the pack picker: ${opts.slice(0, 3).join(' | ')}`);
const firstCard = await b.eval(`(() => { const c = document.querySelector('.rv-card'); return { src: c.querySelector('img').getAttribute('src'), name: c.querySelector('.rv-meta b').textContent, sub: c.querySelector('.rv-meta small').textContent }; })()`);
ok(firstCard.src.startsWith(`media/cand/${first.pack}/`), `candidate card shows its candidate picture: ${firstCard.src}`);
ok(firstCard.sub.startsWith(first.title), `card is labelled with the candidate set: ${firstCard.sub}`);
await b.waitFor(`document.querySelector('.rv-card img').naturalWidth > 0`, 15000);
await b.shot(`${OUT}/cand-review.png`);
await b.eval(`document.querySelector('.rv-card .rv-acts .y').click(); true`);
await b.sleep(400);
const p1 = posts.flat().pop();
ok(p1 && p1.ref.startsWith(`${first.pack}:new/`) && p1.verdict === 'ok' && p1.src === firstCard.src, `OK saved under a candidate ref: ${JSON.stringify(p1)}`);
await b.eval(`document.querySelectorAll('.rv-card')[1].querySelector('.rv-acts .n').click(); true`);
await b.sleep(400);
const p2 = posts.flat().pop();
ok(p2 && p2.ref.includes(':new/') && p2.verdict === 'bad' && p2.reason === 'poor', `Bad saved with a reason: ${JSON.stringify(p2)}`);
const keys = (await b.eval(`[...document.querySelectorAll('.rv-card img')].map(i => i.getAttribute('src'))`));
ok(keys.every(s => s.startsWith('media/cand/')), 'the candidate set shows only candidate pictures');

// "Mark the rest OK" on the second candidate set: only unmarked pictures of this pack and filter, two taps, batched
const second = idx.candidates[1];
if (second) {
  await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = '${second.pack}:new'; s.dispatchEvent(new Event('change')); return true; })()`);
  await b.sleep(300);
  await b.eval(`document.querySelectorAll('.rv-card')[0].querySelector('.rv-acts .n').click(); true`);
  await b.sleep(400);
  const badRef = posts.flat().pop().ref;
  const listed = await b.eval(`document.querySelectorAll('.rv-card').length`);
  const restLabel = await b.eval(`document.querySelector('.rv-rest').textContent`);
  ok(restLabel === `✓ Mark the rest OK (${listed - 1})`, `button counts the unmarked listed pictures: ${restLabel} (${listed} listed)`);
  const before = posts.length;
  await b.eval(`document.querySelector('.rv-rest').click(); true`);
  await b.sleep(200);
  ok(posts.length === before && /^Tap again to mark \d+ as OK$/.test(await b.eval(`document.querySelector('.rv-rest').textContent`)), 'first tap only asks to confirm');
  await b.sleep(4300);
  ok((await b.eval(`document.querySelector('.rv-rest').textContent`)).startsWith('✓ Mark the rest'), 'the confirm resets after 4 s');
  failPosts = 1;
  await b.eval(`(() => { const x = document.querySelector('.rv-rest'); x.click(); x.click(); return true; })()`);
  await b.waitFor(`!!document.querySelector('.rv-err')`, 10000);
  const err = await b.eval(`document.querySelector('.rv-err').textContent`);
  const saved1 = posts.slice(before).flat();
  ok(/not saved/.test(err) && saved1.length === listed - 1 - 50 || (listed - 1 <= 50 && saved1.length === 0), `a failed batch is reported inline: ${err.slice(0, 80)}`);
  ok(saved1.every(p => p.verdict === 'ok' && p.ref.startsWith(`${second.pack}:new/`) && p.ref !== badRef), 'only this pack, never the Bad one');
  await b.eval(`[...document.querySelectorAll('.rv-fails button')].pop().click(); true`);
  await b.waitFor(`!document.querySelector('.rv-err')`, 10000);
  const saved = posts.slice(before).flat();
  ok(saved.length === listed - 1 && new Set(saved.map(p => p.ref)).size === listed - 1, `retry saves the rest: ${saved.length} OK in ${posts.length - before} posts`);
  ok(reviews.get(badRef)?.verdict === 'bad', 'the Bad verdict is untouched');
  ok(posts.slice(before).every(p => p.length <= 50), 'saved in batches of at most 50');
  await b.shot(`${OUT}/cand-rest-ok.png`);
}

// carry-over: the live titanic-1 picture counts as OK because its candidate was approved
await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = 'movie-moments'; s.dispatchEvent(new Event('change')); return true; })()`);
await b.eval(`[...document.querySelectorAll('.rv-seg button')].find(x => x.textContent === 'OK').click(); true`);
await b.sleep(400);
const okSrcs = await b.eval(`[...document.querySelectorAll('.rv-card img')].map(i => i.getAttribute('src'))`);
ok(okSrcs.includes(`media/moments/${liveFile}`), `approved candidate's live copy shows as OK (${okSrcs.length} OK in movie-moments)`);
ok(!posts.flat().some(p => !p.ref.includes(':new/')), 'the carry-over writes nothing to the server');

// game: play picture rounds; no candidate file or picture is ever requested
requested.length = 0;
await b.goto(`${BASE}?test`); await b.waitFor('window.__cluedReady', 30000);
await b.eval(`localStorage.clear(); true`);
await b.goto(`${BASE}?test`); await b.waitFor('window.__cluedReady', 30000); await b.sleep(400);
const packIds = JSON.parse(gameIndex).packs;
const playPacks = ['movie-moments', 'book-moments', 'movies', 'books'].filter(id => packIds[id]);
for (const fmt of ['mc', 'reveal']) {
  await b.eval(`window.__clued.start({ structure: 'quick', format: '${fmt}', packs: ${JSON.stringify(playPacks)}, count: 5, timer: false, difficulty: 0 }); true`);
  for (let i = 0; i < 5; i++) {
    try { await b.waitFor(`window.__clued.state().q`, 15000); } catch { break; }
    await b.sleep(500);
    await b.eval(`window.__clued.answer('correct'); true`); await b.sleep(300);
    await b.eval(`window.__clued.next(); true`); await b.sleep(300);
  }
}
// --falsify: the page fetches a candidate picture itself, so the leak check below must fail
if (process.argv.includes('--falsify')) await b.eval(`fetch('media/cand/${first.pack}/' + ${JSON.stringify(firstCard.src.split('/').pop())}).then(() => true)`);
await b.shot(`${OUT}/cand-game.png`);
const sawMoments = requested.some(u => u.includes('/media/moments/'));
ok(sawMoments, `the game showed movie-moment pictures (${requested.filter(u => u.includes('/media/')).length} media requests)`);
const leaked = requested.filter(u => /\/data\/candidates\/|\/media\/cand\//.test(u));
ok(!leaked.length, `the game requested no candidate file or picture ${leaked.slice(0, 3).join(' ')}`);
ok(!existsSync(join(ROOT, 'data/packs/movie-moments-candidates.json')), 'no candidate pack in data/packs');
const errs = b.logs.filter(l => /\[(exception|error)\]/.test(l));
ok(!errs.length, `no page errors ${errs.slice(0, 3).join(' | ')}`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);

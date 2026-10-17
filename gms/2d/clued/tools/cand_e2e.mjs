#!/usr/bin/env node
// Candidate gate: review.html lists data/candidates/* pictures against a fake admin API, opens on them, saves verdicts under
// candidate refs, and carries an OK candidate verdict over to the promoted live copy; the game itself never requests a
// candidate file or candidate picture.
// Two kinds of set: "new" (refs "<pack>:new/<key>", up to two pictures per title behind a ⇄ toggle, both can be kept) and
// "second pictures" (refs "<pack>:more/<key>", one card per extra picture with the live pictures shown as "already in").
// The real data/candidates may hold no "new" set, so a fixture one built from movie-moments is served in front of them.
// Needs: ~/.claude/bin/cdp start --port 9406 -- --use-angle=metal (CDP_PORT=9406) and the :8888 site server.
// Usage: node tools/cand_e2e.mjs [outDir] [--falsify | --falsify-ok]
//   --falsify must end in 1 FAILED (the leak check can fail); --falsify-ok serves review.js with the old "a second OK clears
//   the first" behaviour and must fail the both-OK checks.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open } from './a_cdp.mjs';
import { momentFile, PACKS, sceneRel } from './mv_paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || '/tmp';
const BASE = 'http://localhost:8888/gms/2d/clued/';
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };

const realIdx = JSON.parse(readFileSync(join(ROOT, 'data/candidates/index.json'), 'utf8'));
const candTotal = realIdx.candidates.reduce((s, c) => s + c.pictures, 0);
ok(realIdx.candidates.length > 0 && candTotal > 0, `candidate files exist: ${realIdx.candidates.map(c => `${c.pack}:${c.kind || 'new'} ${c.pictures}`).join(', ')}`);
// fixture "new" set (one page of 60): 50 movie-moments titles with two pictures + 10 with one (whatever files exist, live or candidate)
const FIX_PATH = 'candidates/__e2e-new.json';
const fixPack = (() => {
  const cfg = JSON.parse(readFileSync(join(ROOT, PACKS['movie-moments'].prompts), 'utf8'));
  const items = cfg.films.map(f => ({ id: f.id, name: f.name, media: { img: f.scenes.map((sc, i) => ({ sc, key: `${f.id}-${i + 1}` }))
    .filter(x => !x.sc.drop && existsSync(join(ROOT, sceneRel('movie-moments', x.key, x.sc))))
    .map(x => ({ src: sceneRel('movie-moments', x.key, x.sc), key: x.key, ref: `movie-moments:new/${x.key}`, caption: x.sc.cap })).slice(0, 2) } }));
  return { id: 'movie-moments-candidates', title: 'Movie moments: new', candidate: true,
    items: [...items.filter(i => i.media.img.length === 2).slice(0, 50), ...items.filter(i => i.media.img.length === 1).slice(0, 10)] };
})();
const fixEntry = { pack: 'movie-moments', kind: 'new', title: 'Movie moments: new', path: FIX_PATH, pictures: fixPack.items.reduce((s, i) => s + i.media.img.length, 0), titles: fixPack.items.length };
const idx = { candidates: [fixEntry, ...realIdx.candidates] };
const moreSet = realIdx.candidates.find(c => c.kind === 'more');
const gameIndex = readFileSync(join(ROOT, 'data/index.json'), 'utf8');
ok(!/candidates|media\/cand\//.test(gameIndex), 'data/index.json names no candidate file or picture');

const b = await open({ port: 9406, width: 384, height: 854, mobile: true });
const reviews = new Map();
const posts = [];
let failPosts = 0;
// a live movie-moments picture whose candidate twin was approved earlier (same hashed file name)
const LIVE_KEY = 'titanic-1', liveFile = momentFile(LIVE_KEY);
reviews.set(`movie-moments:new/${LIVE_KEY}`, { ref: `movie-moments:new/${LIVE_KEY}`, src: `media/cand/movie-moments/${liveFile}`, verdict: 'ok' });
// the same through a "second pictures" OK
const LIVE_KEY2 = 'jaws-1', liveFile2 = momentFile(LIVE_KEY2);
reviews.set(`movie-moments:more/${LIVE_KEY2}`, { ref: `movie-moments:more/${LIVE_KEY2}`, src: `media/cand/movie-moments/${liveFile2}`, verdict: 'ok' });
// first-pass rows left on the old ":new/" refs of the re-offered pictures (an OK that was cleared later shows as no row)
const morePack = moreSet && JSON.parse(readFileSync(join(ROOT, 'data', moreSet.path), 'utf8'));
const staleKeys = (morePack?.items || []).slice(0, 3).map(it => it.media.img[0]);
for (const m of staleKeys) reviews.set(`${moreSet.pack}:new/${m.key}`, { ref: `${moreSet.pack}:new/${m.key}`, src: m.src, verdict: 'ok' });
const AUTH = `export const auth = { ready: async () => {}, getIdToken: async () => 'tok', user: { email: 'admin@test' } };
export async function signInGoogle() {}`;
const b64 = s => Buffer.from(s).toString('base64');
b.on('Fetch.requestPaused', async ({ requestId, request }) => {
  const reply = (body, type = 'application/json') => b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, body: b64(body),
    responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
  if (request.url.includes('/lib/auth/auth.js')) return reply(AUTH, 'text/javascript');
  if (request.url.includes('/data/candidates/index.json')) return reply(JSON.stringify(idx));
  if (request.url.includes('/data/' + FIX_PATH)) return reply(JSON.stringify(fixPack));
  if (request.url.includes('/js/net/review.js') && process.argv.includes('--falsify-ok')) {
    const src = readFileSync(join(ROOT, 'js/net/review.js'), 'utf8').replace(/\/\/ each picture of a title is kept on its own[^\n]*\n/,
      "if (!on) for (const q of u.pics) if (q !== p && verdictOf(q)?.verdict === 'ok') setVerdict(q, '');\n");
    return reply(src, 'text/javascript');
  }
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
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/lib/auth/auth.js*' }, { urlPattern: '*/fakeapi/*' }, { urlPattern: '*/data/candidates/*' }, { urlPattern: '*/js/net/review.js*' }] });
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
ok(fixPack.items.some(it => it.media.img.some(m => m.src === firstCard.src)), `candidate card shows its candidate picture: ${firstCard.src}`);
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
const fixSrcs = new Set(fixPack.items.flatMap(it => it.media.img.map(m => m.src)));
ok(keys.every(s => fixSrcs.has(s)), 'the candidate set shows only candidate pictures');

// two candidates per title: one card per title with a "1/2 ⇄" toggle; titles with one picture show none
const firstPack = fixPack;
const nPics = new Map(firstPack.items.map(it => [it.name, it.media.img.map(m => m.src)]));
const cards = await b.eval(`[...document.querySelectorAll('.rv-card')].map(c => ({ name: c.querySelector('.rv-meta b').textContent, src: c.querySelector('img').getAttribute('src'), alt: c.querySelector('.rv-alt')?.textContent || null }))`);
ok(new Set(cards.map(c => c.name)).size === cards.length, `one card per title (${cards.length} cards)`);
ok(cards.every(c => (nPics.get(c.name)?.length > 1) === !!c.alt), `toggle only on titles with two pictures (${cards.filter(c => c.alt).length} with, ${cards.filter(c => !c.alt).length} without)`);
const pairAt = (from = 0) => b.eval(`[...document.querySelectorAll('.rv-card')].findIndex((c, i) => i >= ${from} && c.querySelector('.rv-alt') && !c.classList.contains('ok') && !c.classList.contains('bad'))`);
const cardAt = i => b.eval(`(() => { const c = document.querySelectorAll('.rv-card')[${i}]; return { name: c.querySelector('.rv-meta b').textContent, src: c.querySelector('img').getAttribute('src'), alt: c.querySelector('.rv-alt')?.textContent, ok: c.classList.contains('ok'), bad: c.classList.contains('bad') }; })()`);
const click = (i, sel) => b.eval(`document.querySelectorAll('.rv-card')[${i}].querySelector('${sel}').click(); true`);
let pi = await pairAt(2);
if (pi < 0) ok(false, 'a title with two candidates is listed');
else {
  const c0 = await cardAt(pi), sib = nPics.get(c0.name).find(x => x !== c0.src);
  const nPosts = posts.length;
  await click(pi, '.rv-alt'); await b.sleep(200);
  const c1 = await cardAt(pi);
  ok(c0.alt === '1/2 ⇄' && c1.alt === '2/2 ⇄' && c1.src === sib && c1.name === c0.name, `toggle flips to the sibling: ${c0.alt} → ${c1.alt}`);
  ok(posts.length === nPosts && (await b.eval('location.pathname')).endsWith('review.html'), 'the toggle saves nothing and does not open the picture');
  await click(pi, '.rv-alt'); await b.sleep(200);
  ok((await cardAt(pi)).src === c0.src, 'toggle flips back');
  await click(pi, '.rv-acts .n'); await b.sleep(400);
  const pb = posts.flat().pop(), c2 = await cardAt(pi);
  ok(pb.verdict === 'bad' && pb.src === c0.src, `Bad saved for the shown picture: ${pb.ref}`);
  ok(c2.src === sib && c2.name === c0.name && !c2.ok && !c2.bad, 'Bad flips to the sibling, title still to review');
  await click(pi, '.rv-acts .y'); await b.sleep(400);
  const po = posts.flat().pop(), c3 = await cardAt(pi);
  ok(po.verdict === 'ok' && po.src === sib && c3.ok, `OK on the sibling picks the title: ${po.ref}`);
  ok(reviews.get(pb.ref)?.verdict === 'bad', 'the first picture stays Bad');
  // OK on one, then OK on the other: both are kept ("✓ 2 kept"), and un-OK-ing one leaves the other
  const pj = await pairAt(pi + 1);
  if (pj < 0) ok(false, 'a second title with two candidates is listed');
  else {
    const d0 = await cardAt(pj);
    const kept = () => b.eval(`(() => { const k = document.querySelectorAll('.rv-card')[${pj}].querySelector('.rv-kept'); return k && !k.hidden ? k.textContent : null; })()`);
    await click(pj, '.rv-acts .y'); await b.sleep(300);
    const refA = posts.flat().pop().ref;
    ok(await kept() === null, 'one OK shows no "kept" badge');
    await click(pj, '.rv-alt'); await b.sleep(200);
    await click(pj, '.rv-acts .y'); await b.sleep(500);
    const d1 = await cardAt(pj), refB = posts.flat().pop().ref;
    ok(d1.ok && d1.src !== d0.src && refA !== refB && reviews.get(refA)?.verdict === 'ok' && reviews.get(refB)?.verdict === 'ok', `a second OK in a title keeps both: ${refA} + ${refB}`);
    ok(await kept() === '✓ 2 kept', `both OK shows the badge: ${await kept()}`);
    await click(pj, '.rv-alt'); await b.sleep(200);
    ok((await cardAt(pj)).ok && await kept() === '✓ 2 kept', 'the badge stays on the other picture too');
    await click(pj, '.rv-acts .y'); await b.sleep(400);
    ok(!reviews.has(refA) && reviews.get(refB)?.verdict === 'ok' && await kept() === null, 'un-OK one: the other stays OK, badge gone');
    await click(pj, '.rv-acts .y'); await b.sleep(400);
    ok(reviews.get(refA)?.verdict === 'ok' && reviews.get(refB)?.verdict === 'ok', 'OK again: both kept');
  }
}

// "Mark the rest OK" on the second candidate set: only unmarked pictures of this pack and filter, two taps, batched
const second = idx.candidates[1];
{
  const restPack = first.pack;
  await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = '${restPack}:new'; s.dispatchEvent(new Event('change')); return true; })()`);
  await b.sleep(300);
  // Bad on a title with two pictures flips to the sibling, which "Mark the rest OK" then picks
  // a two-picture title nothing has touched yet (no verdict on either picture)
  const ri = Math.max(0, await b.eval(`[...document.querySelectorAll('.rv-card')].findIndex(c => c.querySelector('.rv-alt') && !${JSON.stringify(
    fixPack.items.filter(it => it.media.img.some(m => reviews.has(m.ref))).map(it => it.name))}.includes(c.querySelector('.rv-meta b').textContent))`));
  const rPair = !!(await cardAt(ri)).alt;
  await b.eval(`document.querySelectorAll('.rv-card')[${ri}].querySelector('.rv-acts .n').click(); true`);
  await b.sleep(400);
  const badRef = posts.flat().pop().ref;
  const shownSib = rPair ? (await cardAt(ri)).src : null;
  const listed = await b.eval(`document.querySelectorAll('.rv-card').length`);
  const rest = listed - (rPair ? 0 : 1);
  const restLabel = await b.eval(`document.querySelector('.rv-rest').textContent`);
  ok(restLabel === `✓ Mark the rest OK (${rest})`, `button counts the untouched listed titles: ${restLabel} (${listed} listed)`);
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
  ok(/not saved/.test(err) && saved1.length === rest - 50 || (rest <= 50 && saved1.length === 0), `a failed batch is reported inline: ${err.slice(0, 80)}`);
  ok(saved1.every(p => p.verdict === 'ok' && p.ref.startsWith(`${restPack}:new/`) && p.ref !== badRef), 'only this pack, never the Bad one');
  await b.eval(`[...document.querySelectorAll('.rv-fails button')].pop().click(); true`);
  await b.waitFor(`!document.querySelector('.rv-err')`, 10000);
  const saved = posts.slice(before).flat();
  ok(saved.length === rest && new Set(saved.map(p => p.ref)).size === rest, `retry saves the rest: ${saved.length} OK in ${posts.length - before} posts`);
  if (rPair) ok(saved.some(p => p.src === shownSib && p.verdict === 'ok'), 'Mark the rest OK picks the shown sibling of the Bad picture');
  const groups = fixPack.items.filter(it => it.media.img.length > 1);
  ok(groups.every(it => it.media.img.filter(m => saved.some(p => p.src === m.src)).length <= 1), 'Mark the rest OK marks only the shown picture of a title');
  ok(reviews.get(badRef)?.verdict === 'bad', 'the Bad verdict is untouched');
  ok(posts.slice(before).every(p => p.length <= 50), 'saved in batches of at most 50');
  await b.shot(`${OUT}/cand-rest-ok.png`);
}

// "second pictures": one card per extra picture, the live ones small beside it; stale first-pass rows never count
if (!moreSet) ok(false, 'a "second pictures" set is staged');
else {
  const mid = `${moreSet.pack}:more`;
  ok(opts.some(o => o.startsWith(moreSet.title)), `the picker lists ${moreSet.title}`);
  await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = '${mid}'; s.dispatchEvent(new Event('change')); return true; })()`);
  await b.eval(`[...document.querySelectorAll('.rv-seg button')].find(x => x.textContent === 'To review').click(); true`);
  await b.sleep(400);
  const items = new Map(morePack.items.flatMap(it => it.media.img.map(m => [m.src, it])));
  const mc = await b.eval(`[...document.querySelectorAll('.rv-card')].map(c => ({ src: c.querySelector('.rv-pic img').getAttribute('src'), alt: !!c.querySelector('.rv-alt'), ok: c.classList.contains('ok'),
    label: c.querySelector('.rv-live span')?.textContent || null, live: [...c.querySelectorAll('.rv-live img')].map(i => i.getAttribute('src')) }))`);
  const nMore = morePack.items.reduce((s, it) => s + it.media.img.length, 0);
  ok(mc.length === Math.min(60, nMore), `one card per extra picture, all to review: ${mc.length} of ${nMore}`);
  ok(staleKeys.every(m => mc.some(c => c.src === m.src && !c.ok)), `first-pass OK rows on old refs show as to review (${staleKeys.length})`);
  ok(mc.every(c => c.src.startsWith(`media/cand/${moreSet.pack}/`) && items.has(c.src) && !c.alt), 'cards show the candidate picture, no toggle');
  ok(mc.every(c => c.label === 'already in' && c.live.length > 0 && c.live.join() === items.get(c.src).live.map(l => l.src).join()), 'each card shows the live pictures, labelled "already in"');
  ok(mc.every(c => c.live.every(s => !s.startsWith('media/cand/'))), 'the "already in" pictures are live files');
  await b.waitFor(`[...document.querySelectorAll('.rv-live img')].slice(0, 2).every(i => i.naturalWidth > 0)`, 15000).catch(() => {});
  await b.shot(`${OUT}/cand-more.png`);
  await b.eval(`document.querySelector('.rv-card .rv-acts .y').click(); true`); await b.sleep(400);
  const mo = posts.flat().pop();
  ok(mo.ref === items.get(mc[0].src).media.img.find(m => m.src === mc[0].src).ref && mo.ref.startsWith(`${mid}/`) && mo.verdict === 'ok' && mo.src === mc[0].src, `OK adds it, under a "more" ref: ${mo.ref}`);
  await b.eval(`document.querySelectorAll('.rv-card')[1].querySelector('.rv-acts .n').click(); true`); await b.sleep(400);
  const mb = posts.flat().pop();
  ok(mb.ref.startsWith(`${mid}/`) && mb.verdict === 'bad' && mb.reason === 'poor', `Bad drops it: ${mb.ref}`);
  ok(!posts.flat().some(p => staleKeys.some(m => p.ref === `${moreSet.pack}:new/${m.key}`)), 'old ":new/" rows are never written');
}

// carry-over: the live titanic-1 picture counts as OK because its candidate was approved
await b.eval(`(() => { const s = document.querySelector('#rv-pack'); s.value = 'movie-moments'; s.dispatchEvent(new Event('change')); return true; })()`);
await b.eval(`[...document.querySelectorAll('.rv-seg button')].find(x => x.textContent === 'OK').click(); true`);
await b.sleep(400);
const okSrcs = await b.eval(`[...document.querySelectorAll('.rv-card img')].map(i => i.getAttribute('src'))`);
ok(okSrcs.includes(`media/moments/${liveFile}`), `approved candidate's live copy shows as OK (${okSrcs.length} OK in movie-moments)`);
ok(okSrcs.includes(`media/moments/${liveFile2}`), 'an approved "second picture" carries over to its live copy too');
ok(!posts.flat().some(p => !/:(new|more)\//.test(p.ref)), 'the carry-over writes nothing to the server');

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
if (process.argv.includes('--falsify')) await b.eval(`fetch(${JSON.stringify(morePack?.items[0].media.img[0].src || `media/cand/movie-moments/${liveFile}`)}).then(() => true)`);
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

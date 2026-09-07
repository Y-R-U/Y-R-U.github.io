// The three shops, driven. Walks into each one, looks at the room, talks to the keeper, buys a
// weapon and confirms it is in the player's hand on the way out.
//
// The things only the running game can answer: that the doors are enterable at all, that the rooms
// are dressed as shops rather than as somebody's cottage, that a keeper standing inside a house
// that only exists while you are in it is actually there when you get there, and that a purchase
// moves marks out of the same counted bag the sheet reads.
//
//   node js/dev/shop.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-shoptest');
const OUT = process.argv[2] || '/tmp/wf-shopshots';
const PORT = 8805;

let fails = 0;
const check = (cond, what) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${what}`); if (!cond) fails++; };

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(COPY, { recursive: true, force: true });
spawnSync('rsync', ['-a', '--exclude', 'shots', '--exclude', 'audio/vo/raw', '--exclude', '.git',
  `${ROOT}/`, `${COPY}/`]);
const server = spawn(process.execPath, [path.join(COPY, 'tools/devserver.mjs'), '--port', String(PORT)],
  { cwd: COPY, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try { if ((await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json()).devserver) break; } catch { /* booting */ }
  await sleep(200);
}

const { proc, port, kill } = await launch({ port: 9342, profile: '/tmp/wf-cdp-shop' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');

// From an empty save, always. Chrome's profile is deleted before it is launched, but a renderer
// left alive by a previous run holds the old localStorage in memory and the attach lands on THAT
// browser — which handed this test 27 marks and a rope it had bought the run before. The purse is
// the thing being measured here, so it starts at nothing whatever the profile did.
await p.eval('try { localStorage.clear(); } catch (e) {} location.reload(); true');
await sleep(1200);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'and reloaded with an empty save');

// ── the three doors exist and are enterable ─────────────────────────────────────────────────
const shops = await p.eval(`(() => {
  const objs = window.__wf.level.objects.filter(o => o.type === 'house' && o.p.shop);
  const doors = window.__wf.doors.doors.map(d => d.id);
  return JSON.stringify(objs.map(o => ({ id: o.id, shop: o.p.shop, x: o.x, z: o.z, door: doors.includes(o.id) })));
})()`).then(JSON.parse);
check(shops.length === 3, `three shops in the level (${shops.length})`);
check(shops.every(s => s.door), `every shop has a front door (${shops.filter(s => !s.door).map(s => s.id)})`);

// The keepers are behind their own counters, inside their own houses.
const keepers = await p.eval(`(() => {
  const g = window.__wf.game;
  return JSON.stringify(['smith', 'apothecary', 'sundry'].map(id => {
    const c = g.characters.get(id), at = g.characters.at(id);
    return { id, inside: c?.place?.inside ?? null, at: at ? [+at.x.toFixed(1), +at.z.toFixed(1)] : null };
  }));
})()`).then(JSON.parse);
for (const k of keepers) check(!!k.at && k.inside, `${k.id} is standing inside house ${k.inside} at ${k.at}`);

// ── walk into the Weaponry ──────────────────────────────────────────────────────────────────
// Through the door script — `Doors.trigger()` is the same walk a held stick produces, minus the
// stick — because "make sure you can enter the shops" is the thing being tested and a peek is a
// render hook that never involves the player at all.
const enter = async (houseId, label) => {
  const started = await p.eval(`(() => {
    const D = window.__wf.doors, P = window.__wf.player;
    const i = D.doors.findIndex(d => d.id === ${houseId});
    if (i < 0) return false;
    if (D.state !== 'out') D.abort();
    const d = D.doors[i];
    // Put him on the doorstep first: trigger() walks him through from wherever he is standing,
    // and from across the square that is a forty-metre glide through the scenery.
    P.pos.x = d.pos.x + d.n.x * 4; P.pos.z = d.pos.z + d.n.z * 4;
    P.pos.y = window.__wf.world.terrain.surfaceY(P.pos.x, P.pos.z);
    P.snap = true;
    return D.trigger(i);
  })()`);
  check(started, `started the walk into the ${label}`);
  const inside = await p.waitFor(`window.__wf.doors.state === 'in' && !!window.__wf.doors.interior`, 12000);
  check(inside, `and got inside the ${label}`);
  await sleep(900);
  return inside;
};

await enter(60, 'Weaponry');
check(await p.eval('window.__wf.doors.interior && window.__wf.doors.interior.shop === 1'),
  'and it is dressed as an armoury, not as a cottage');
check(await p.eval('window.__wf.doors.interior.solids.length > 3'),
  'with a counter and cupboards you cannot walk through');
await p.shot(`${OUT}/weaponry.png`);

await enter(61, 'Apothecary');
check(await p.eval('window.__wf.doors.interior.shop === 2'), 'the Apothecary is dressed for physic');
await p.shot(`${OUT}/apothecary.png`);

await enter(62, 'General Goods');
check(await p.eval('window.__wf.doors.interior.shop === 3'), 'the general shop is dressed for sundries');
await p.shot(`${OUT}/general.png`);
await p.eval('window.__wf.doors.abort(); true');
await sleep(600);

// ── the registration purse ──────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.doc.items.marks === undefined || window.__wf.game.doc.items.marks === 0'),
  'a new adventurer has nothing');
check(await p.eval('window.__wf.game.payPurse()'), 'the Society pays the registration fee');
const purse = await p.eval('window.__wf.game.doc.items.marks');
check(purse > 0, `and it lands in the purse (${purse} marks)`);
check(await p.eval('window.__wf.game.payPurse() === false'), 'and it is only ever paid once');

// ── the counter ─────────────────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.showScreen("shop.weaponry")'), 'the Weaponry counter opens');
await sleep(500);
check(await p.eval('!!document.querySelector("#game .g-shop")'), 'and it is on screen');
const rows = await p.eval('document.querySelectorAll("#game .g-ware").length');
check(rows >= 4, `with the racks on it (${rows} rows)`);
check(await p.eval('document.querySelector("#game .g-till button").disabled === true'),
  'and nothing can be bought until something is picked');
await p.shot(`${OUT}/counter.png`);

// The dagger by name, not the first row: the sheet sorts by price and the cheapest thing on
// Sella's counter is a coil of rope, which is not a weapon and must not end up in the hand.
check(await p.eval(`(() => {
  const r = [...document.querySelectorAll('#game .g-ware')].find(x => /dagger/i.test(x.textContent));
  if (!r) return false;
  r.click();
  return true;
})()`), 'picked the dagger off the rack');
await sleep(300);
check(await p.eval('!!document.querySelector("#game .g-shopnote")'), 'and it says what it is');
check(await p.eval('document.querySelector("#game .g-till button").disabled === false'), 'and it can be bought');
await p.shot(`${OUT}/counter-picked.png`);

const before = await p.eval('window.__wf.game.doc.items.marks');
check(await p.eval('document.querySelector("#game .g-till button").click(), true'), 'bought it');
await sleep(400);
const after = await p.eval(`JSON.stringify({
  marks: window.__wf.game.doc.items.marks,
  gear: window.__wf.game.doc.gear,
  bag: window.__wf.game.doc.items,
  held: window.__wf.player.heft,
})`).then(JSON.parse);
check(after.marks < before, `and it cost something (${before} -> ${after.marks})`);
check(!!after.gear.weapon, `and went straight into the hand (${after.gear.weapon})`);
check(after.held === 'dagger', `and is actually drawn (${after.held})`);
check(await p.eval('window.__wf.game.combat.weapon.id === "dagger"'), 'and the fight is swinging it');
await p.shot(`${OUT}/bought.png`);

// ── the stone is meant to hurt ──────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.showScreen("shop.general")'), 'the general shop opens');
await sleep(400);
const stone = await p.eval(`(() => {
  const rows = [...document.querySelectorAll('#game .g-ware')];
  const r = rows.find(x => /Awakening/.test(x.textContent));
  if (!r) return null;
  r.click();
  return document.querySelector('#game .g-till button').textContent;
})()`);
check(!!stone && /short/i.test(stone), `a stone is far out of reach on a registration purse ("${stone}")`);
await p.shot(`${OUT}/stone-price.png`);
await p.eval('window.__wf.game.shopUI.close(); true');

// ── loot goes straight into the bag ─────────────────────────────────────────────────────────
const drops = await p.eval(`(async () => {
  const g = window.__wf.game;
  const e = await import('./js/game/economy.js');
  e.retune({ lootChance: 1 });
  let got = 0;
  for (let i = 0; i < 12; i++) if (g.dropLoot()) got++;
  e.reset();
  return got;
})()`);
check(drops === 12, `every kill dropped something with the odds pinned to 1 (${drops}/12)`);
check(await p.eval('Object.keys(window.__wf.game.doc.items).length > 2'), 'and it is all in the bag');

// Nothing may have thrown along the way. A screen that renders and quietly logs a TypeError every
// frame passes every check above and is still broken.
// A missing favicon is a 404 the dev server has never served and never will; it is not the game
// throwing. Everything else at this level is.
const bad = p.logs().filter(l => (l.level === 'exception' || l.level === 'error')
  && !/favicon\.ico/.test(l.text));
check(bad.length === 0, `nothing threw (${bad.slice(0, 3).map(l => l.text.split('\n')[0]).join(' | ') || 'clean'})`);

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
// kill(), not proc.kill(): the renderer and GPU children outlive the parent, and one of them
// still holding the old localStorage is what made this test read a purse from the run before it.
kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);

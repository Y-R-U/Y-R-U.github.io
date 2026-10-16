#!/usr/bin/env node
// img_marks.mjs (review circles → packs) and the in-game ring geometry (kit.markRect).
// Usage: node tools/img_marks_test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanMark, rowsOf, applyRows, applyMarks, run } from './img_marks.mjs';
import { markRect, markOk } from '../js/ui/kit.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('FAIL', m); } };
const near = (a, b) => Math.abs(a - b) < 1e-6;

// marks
ok(cleanMark('{"cx":0.5,"cy":0.25,"rx":0.1,"ry":0.2}')?.cy === 0.25, 'mark from a JSON string (sqlite3 -json)');
ok(cleanMark({ cx: 0.123456, cy: 0.5, rx: 0.1, ry: 0.1 }).cx === 0.1235, 'rounded to 4 places');
ok(cleanMark('') === null && cleanMark(null) === null, 'empty mark');
ok(cleanMark({ cx: 1.2, cy: 0.5, rx: 0.1, ry: 0.1 }) === null && cleanMark({ cx: 0.5, cy: 0.5, rx: 0, ry: 0.1 }) === null, 'out of range rejected');
ok(rowsOf({ reviews: [{ ref: 'a/b/0', src: 's', verdict: 'ok' }] }).length === 1 && rowsOf([{ ref: 'a/b/0' }]).length === 0, 'rowsOf: endpoint body, rows need a src');
ok(markOk({ cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }) && !markOk({ cx: 0.5, cy: 0.5, rx: 0.1 }) && !markOk({ cx: NaN, cy: 0.5, rx: 0.1, ry: 0.1 }), 'markOk');

// geometry: a 400×200 picture in a 300×300 box is shown 300×150 at y 75
{
  const r = markRect({ cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.5 }, 300, 300, 400, 200);
  ok(near(r.left, 75) && near(r.top, 75) && near(r.width, 150) && near(r.height, 150), `letterboxed: ${JSON.stringify(r)}`);
  const t = markRect({ cx: 0, cy: 0, rx: 0.1, ry: 0.1 }, 300, 100, 100, 100);
  ok(near(t.left, 100 - 10) && near(t.top, -10) && near(t.width, 20), `pillarboxed corner: ${JSON.stringify(t)}`);
  const s = markRect({ cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01 }, 100, 100, 100, 100, 24);
  ok(near(s.width, 24) && near(s.left, 38), 'minimum size stays centred');
  const small = markRect({ cx: 0.3, cy: 0.6, rx: 0.2, ry: 0.1 }, 160, 90, 1600, 900), big = markRect({ cx: 0.3, cy: 0.6, rx: 0.2, ry: 0.1 }, 320, 180, 1600, 900);
  ok(near(big.left, small.left * 2) && near(big.height, small.height * 2), 'scales with the box (reveal shrink)');
  ok(markRect({ cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }, 0, 100, 10, 10) === null, 'no box, no ring');
}

// applyRows: set, clear, replaced picture
{
  const pack = { items: [{ id: 'liver', name: 'Liver', media: { img: [{ src: 'l.png', page: 'https://c/File:L' }] } }, { id: 'k', name: 'K', media: { img: [{ src: 'k.png', mark: { cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 } }] } }],
    questions: [{ id: 'q1', prompt: 'x', media: { img: [{ src: 'q.png' }] } }] };
  const store = { 'k.png': { cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 } };
  const m = { cx: 0.4, cy: 0.6, rx: 0.1, ry: 0.05 };
  const res = applyRows(pack, [
    { ref: 'body/liver/0', src: 'l.png', mark: m }, { ref: 'body/k/0', src: 'k.png', mark: null },
    { ref: 'body/q1/0', src: 'q.png', mark: m }, { ref: 'body/gone/0', src: 'old.png', mark: m }], store);
  ok(pack.items[0].media.img[0].mark === m && pack.questions[0].media.img[0].mark === m, 'marks set on items and questions');
  ok(!('mark' in pack.items[1].media.img[0]) && !store['k.png'], 'reviewed without a mark clears it');
  ok(res.set === 2 && res.cleared === 1 && res.missing.join() === 'body/gone/0', `counts ${JSON.stringify(res)}`);
  ok(store['https://c/File:L'] === m && store['q.png'] === m, 'store keyed by page, else src');
  const rebuilt = { items: [{ id: 'liver', media: { img: [{ src: 'mirrored/l.png', page: 'https://c/File:L' }] } }] };
  ok(applyMarks('body', rebuilt, { body: store }) === 1 && rebuilt.items[0].media.img[0].mark === m, 'builder re-applies by page after a mirror swap');
}

// run(): reads an export, writes the pack in its own indentation and the marks file
{
  const root = mkdtempSync(join(tmpdir(), 'imgmarks-'));
  mkdirSync(join(root, 'data/packs'), { recursive: true });
  mkdirSync(join(root, 'tools/c1_src'), { recursive: true });
  writeFileSync(join(root, 'tools/c1_src/body.mjs'), '');
  writeFileSync(join(root, 'data/index.json'), JSON.stringify({ packs: { body: { path: 'packs/body.json' }, flat: { path: 'packs/flat.json' } } }));
  writeFileSync(join(root, 'data/packs/body.json'), JSON.stringify({ id: 'body', items: [{ id: 'heart', media: { img: [{ src: 'h.png' }] } }] }, null, 1) + '\n');
  writeFileSync(join(root, 'data/packs/flat.json'), JSON.stringify({ id: 'flat', items: [{ id: 'a', media: { img: [{ src: 'a.png' }] } }] }));
  const exp = join(root, 'marks.json');
  writeFileSync(exp, JSON.stringify([
    { ref: 'body/heart/0', src: 'h.png', verdict: 'ok', mark: '{"cx":0.3,"cy":0.4,"rx":0.1,"ry":0.1}' },
    { ref: 'flat/a/0', src: 'a.png', verdict: 'bad', mark: { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2 } },
    { ref: 'nope/x/0', src: 'x.png', verdict: 'ok', mark: { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2 } }]));
  const logs = [], marksFile = join(root, 'tools/img_marks.json');
  run(exp, { root, marksFile, log: s => logs.push(s) });
  const body = readFileSync(join(root, 'data/packs/body.json'), 'utf8'), flat = readFileSync(join(root, 'data/packs/flat.json'), 'utf8');
  ok(JSON.parse(body).items[0].media.img[0].mark.cx === 0.3 && body.startsWith('{\n "id"'), 'body pack written, indent kept');
  ok(JSON.parse(flat).items[0].media.img[0].mark.rx === 0.2 && !flat.includes('\n "'), 'compact pack stays compact');
  ok(logs.some(l => /^flat: .*pack JSON only/.test(l)) && logs.some(l => /^body: .*rebuild-safe/.test(l)) && logs.some(l => /^nope: pack not found/.test(l)), `log: ${logs.join(' | ')}`);
  ok(JSON.parse(readFileSync(marksFile, 'utf8')).body['h.png'].cy === 0.4, 'marks file saved');
  writeFileSync(exp, JSON.stringify({ reviews: [{ ref: 'body/heart/0', src: 'h.png', verdict: 'ok' }] }));
  run(exp, { root, marksFile, log: () => {} });
  ok(!JSON.parse(readFileSync(join(root, 'data/packs/body.json'), 'utf8')).items[0].media.img[0].mark && !JSON.parse(readFileSync(marksFile, 'utf8')).body, 'cleared circle removed from pack and file');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

// Lane 7: runs every tools/*_test.mjs (pure node) and summarises. Exit 1 if any fails.
//   node tools/qa_unit.mjs [filter]      e.g. node tools/qa_unit.mjs world
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const TIMEOUT = 180000;

const files = fs.readdirSync(HERE).filter((f) => /_test\.mjs$/.test(f) && !f.startsWith('qa_') && f.includes(filter)).sort();
if (!files.length) { console.log('no tools/*_test.mjs found' + (filter ? ` matching "${filter}"` : '')); process.exit(0); }

function run(f) {
  return new Promise((res) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(HERE, f)], { cwd: path.resolve(HERE, '..'), env: { ...process.env, QA_UNIT: '1' } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const kill = setTimeout(() => { out += `\n[qa_unit] killed after ${TIMEOUT / 1000} s`; p.kill('SIGKILL'); }, TIMEOUT);
    p.on('close', (code, sig) => { clearTimeout(kill); res({ f, code: sig ? 124 : code, ms: Date.now() - t0, out }); });
  });
}

// Best-effort count extraction from the lanes' differing summary formats.
function counts(out) {
  const tail = out.split('\n').slice(-12).join('\n');
  let m = tail.match(/(\d+)\s*pass(?:ed)?\D{0,12}?(\d+)\s*fail/i) || tail.match(/pass(?:ed)?\D{0,3}(\d+)\D{1,12}fail(?:ed|s)?\D{0,3}(\d+)/i);
  if (m) return { pass: +m[1], fail: +m[2] };
  m = tail.match(/(\d+)\s*\/\s*(\d+)\s*(?:passed|tests|checks|ok)/i);
  if (m) return { pass: +m[1], fail: +m[2] - +m[1] };
  const fails = (out.match(/^\s*FAIL\b/gm) || []).length, oks = (out.match(/^\s*ok\b/gm) || []).length;
  return { pass: oks || null, fail: fails };
}

const results = [];
for (const f of files) {
  process.stdout.write(`running ${f} … `);
  const r = await run(f);
  const c = counts(r.out);
  const failedLines = r.out.split('\n').filter((l) => /\bFAIL\b/.test(l)).slice(0, 5);
  const status = r.code === 0 && !(c.fail > 0) ? 'PASS' : 'FAIL';
  results.push({ ...r, ...c, status, failedLines });
  console.log(`${status} (${(r.ms / 1000).toFixed(1)} s)`);
  if (status === 'FAIL') console.log(r.out.split('\n').slice(-15).map((l) => '    | ' + l).join('\n'));
}

const w = Math.max(...results.map((r) => r.f.length));
console.log(`\nSYNTHWILD unit tests\n${'-'.repeat(w + 40)}`);
for (const r of results) console.log(`${r.f.padEnd(w)}  ${r.status}  exit ${String(r.code).padEnd(3)} pass ${String(r.pass ?? '?').padEnd(4)} fail ${String(r.fail ?? '?').padEnd(3)} ${(r.ms / 1000).toFixed(1)} s`);
const nf = results.filter((r) => r.status === 'FAIL').length;
console.log(`${'-'.repeat(w + 40)}\n${results.length - nf}/${results.length} files passed`);
fs.mkdirSync(path.join(HERE, 'qa_out'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'qa_out', 'unit.json'), JSON.stringify(results.map(({ out, ...r }) => ({ ...r, tail: out.split('\n').slice(-20) })), null, 1));
process.exit(nf ? 1 : 0);

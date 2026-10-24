// STORY: unlock + mission picker through the real menu (real CDP touch at 390×844).
//   node tools/story/test-picker.mjs [--port=9632] [--base=http://localhost:8790/gms/3d/krayzee/] [--falsify=unlock]
// --falsify=unlock pretends Mission 1 was never finished: the picker must then not appear (Mission 1 starts directly).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', 'docs', 'shots', 'story');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const BASE = arg('base', 'http://localhost:8790/gms/3d/krayzee/'), FALSIFY = arg('falsify', '');
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-DIRK' };
const C = await connect(+arg('port', 9632));
const results = [];
const check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const W = 390, H = 844;
await C.viewport(W, H, true);
await C.load(BASE + '?intro=0');
const done = FALSIFY === 'unlock' ? {} : { 1: { done: true, diff: 'easy', best: 900 } };
await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('krayzee.story', JSON.stringify({ introSeen: true, missions: ${JSON.stringify(done)} })); true`);
check('game boots', await C.load(BASE + '?intro=0'));
C.errors.length = 0;
for (let i = 0; i < 40 && !(await C.ev(`!!document.querySelector('[data-a="story"]')?.getClientRects().length`)); i++) await C.sleep(250);
await C.sleep(800);
await C.tapSel('[data-a="story"]');
let pick = null;
for (let i = 0; i < 60 && !pick; i++) { await C.sleep(250); pick = await C.ev(`(() => { const c = document.querySelector('.krz-st-pick .krz-st-card'); if (!c) return null; const r = c.getBoundingClientRect(); return { rows: [...c.querySelectorAll('.krz-st-picklist button')].map((b) => b.dataset.id + (b.disabled ? 'L' : 'U') + (b.classList.contains('next') ? '*' : '')), l: r.left, r: r.right, t: r.top, b: r.bottom }; })()`); }
await C.shot(SHOTS, 'picker_portrait');
check('Story button opens the mission picker once Mission 1 is done', !!pick, JSON.stringify(pick));
check('picker: 1 and 2 unlocked, 2 highlighted, 3 and 4 locked', pick && pick.rows.join() === '1U,2U*,3L,4L', pick?.rows.join());
check('picker fits the screen', pick && pick.l >= 0 && pick.r <= W && pick.t >= 0 && pick.b <= H);
check('the world waits behind the picker', await C.ev(`window.__krzStory.simScale() === 0`));
const locked = await C.ev(`(() => { document.querySelector('.krz-st-picklist button[data-id="3"]')?.click(); return !!document.querySelector('.krz-st-pick'); })()`);
check('a locked mission cannot be started', locked);
await C.tapSel('.krz-st-picklist button[data-id="2"]');
let m = null;
for (let i = 0; i < 40 && !m; i++) { await C.sleep(250); m = await C.ev(`(() => { const s = window.__krzStory.mission?.state; return s && document.querySelector('.krz-st-brief') ? s.mission : null; })()`); }
check('tapping Mission 2 starts it (briefing up)', m === 2, String(m));
check('no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);

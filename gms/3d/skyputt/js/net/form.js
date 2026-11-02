// Room options form (create a room, or the host editing it in the lobby). DOM only.
import { COURSES } from '../course/holes/index.js';
import { THEME_LIST } from '../app/menus.js';
import { HELPERS } from '../meta/helpers.js';
import { holeSets, holesFor, SHOT_CLOCKS, MAX_PLAYERS, MIN_PLAYERS, AI_PERSONALITIES, AI_RANKS, rankForSkill } from './rooms.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const seg = (k, items, cur) => `<div class="seg" data-k="${k}">${items.map(([v, l]) => `<button data-v="${esc(v)}" class="${String(v) === String(cur) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
const step = (k, v, lo, hi) => `<div class="stepper" data-k="${k}" data-lo="${lo}" data-hi="${hi}"><button data-d="-1" aria-label="Fewer">−</button><b>${v}</b><button data-d="1" aria-label="More">+</button></div>`;

// renderForm(el, opts, { quick, humans, onChange }) — edits a copy of opts in place, calls onChange(opts).
export function renderForm(el, opts, { quick = false, humans = 1, onChange, click } = {}) {
  const o = structuredClone(opts);
  const draw = () => {
    const sets = holeSets(o.course);
    const nHelpers = HELPERS.length;
    const maxAI = o.max - humans;
    o.ai.count = Math.max(0, Math.min(o.ai.count, maxAI));
    el.innerHTML = `
      <label class="row"><span>Room name</span><input type="text" data-k="name" maxlength="20" placeholder="${quick ? 'Quick play' : 'Optional'}" value="${esc(o.name)}" ${quick ? 'disabled' : ''}></label>
      ${quick ? '' : `<div class="row"><span>Who can join</span>${seg('public', [['0', 'Invite code'], ['1', 'Public list']], o.public ? '1' : '0')}</div>`}
      ${Object.keys(COURSES).length > 1 ? `<div class="row"><span>Course</span><select data-k="course">${Object.values(COURSES).map(c => `<option value="${c.id}" ${c.id === o.course ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>` : ''}
      <div class="row"><span>Holes</span><select data-k="holeSet">${sets.map(s => `<option value="${s.id}" ${s.id === o.holeSet ? 'selected' : ''}>${esc(s.name)} (${s.count})</option>`).join('')}</select></div>
      <div class="row col"><span>Theme</span><div class="seg wrap" data-k="theme">${THEME_LIST.map(t => `<button data-v="${t.id}" class="${t.id === o.theme ? 'on' : ''}"><i class="sw" style="background:${t.swatch}"></i>${esc(t.name)}</button>`).join('')}</div></div>
      <div class="row"><span>Max players</span>${step('max', o.max, Math.max(MIN_PLAYERS, humans), MAX_PLAYERS)}</div>
      <div class="row col"><span>Helpers</span>${seg('helpers', [['off', 'Off'], ['fixed', 'Everyone gets'], ['own', 'Own inventory']], o.helpers.mode)}
        ${o.helpers.mode === 'fixed' ? `<div class="sub">${step('helperN', o.helpers.n, 1, 5)}<small>of each of the ${nHelpers} helpers</small></div>` : ''}</div>
      <div class="row col"><span>Shot clock</span>${seg('shotClock', SHOT_CLOCKS.map(s => [s, s ? `${s}s` : 'Off']), o.shotClock)}</div>
      <div class="row col"><span>Ghost AIs</span>
        ${quick ? '<small class="dim">Empty seats fill with ghost AIs</small>' : `<div class="sub">${step('aiCount', o.ai.count, 0, maxAI)}<small>${o.ai.count >= maxAI ? 'fills every empty seat' : 'added at the start'}</small><button class="mini" data-a="fill">Fill</button></div>`}
        <select data-k="personality">${AI_PERSONALITIES.map(p => `<option value="${p.id}" ${p.id === o.ai.personality ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        ${seg('rank', AI_RANKS.map(r => [r.name, r.name]), rankForSkill(o.ai.skill).name)}</div>`;
  };
  const changed = () => { draw(); onChange?.(o); };
  el.oninput = e => { if (e.target.dataset.k === 'name') { o.name = e.target.value; onChange?.(o); } };
  el.onchange = e => {
    const k = e.target.dataset.k;
    if (k === 'course') { o.course = e.target.value; o.courseName = COURSES[o.course]?.name || ''; o.holeSet = '0-3'; o.holes = holesFor(o.course, o.holeSet); }
    else if (k === 'holeSet') { o.holeSet = e.target.value; o.holes = holesFor(o.course, o.holeSet); }
    else if (k === 'personality') o.ai.personality = e.target.value;
    else return;
    click?.(); changed();
  };
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    e.preventDefault();
    click?.();
    const sg = b.closest('.seg'), st = b.closest('.stepper');
    if (b.dataset.a === 'fill') { o.ai.count = o.max - humans; return changed(); }
    if (sg) {
      const k = sg.dataset.k, v = b.dataset.v;
      if (k === 'public') o.public = v === '1';
      else if (k === 'theme') o.theme = v;
      else if (k === 'helpers') o.helpers = { mode: v, n: v === 'fixed' ? (o.helpers.n || 2) : 0 };
      else if (k === 'shotClock') o.shotClock = +v;
      else if (k === 'rank') o.ai.skill = AI_RANKS.find(r => r.name === v)?.skill ?? 0.45;
      return changed();
    }
    if (st) {
      const k = st.dataset.k, lo = +st.dataset.lo, hi = +st.dataset.hi, d = +b.dataset.d;
      const cl = v => Math.max(lo, Math.min(hi, v + d));
      if (k === 'max') { const fill = o.ai.count >= o.max - humans; o.max = cl(o.max); if (fill) o.ai.count = o.max - humans; }
      else if (k === 'helperN') o.helpers.n = cl(o.helpers.n);
      else if (k === 'aiCount') o.ai.count = cl(o.ai.count);
      return changed();
    }
  };
  draw();
  return o;
}

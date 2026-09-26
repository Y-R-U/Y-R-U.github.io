import { h, esc, fmt, fmtTime, onTap, haptic } from './core.js';
import { icon, MISSION_ICON } from './icons.js';
import { portrait } from './portrait.js';

const TYPE_LABEL = {
  courier: 'Courier', pest: 'Pest Control', retrieve: 'Retrieval', surveil: 'Surveillance', bounty: 'Bounty', escort: 'Escort',
  sabotage: 'Sabotage', hack: 'Uplink', tail: 'Shadow', infiltrate: 'Infiltration', transport: 'Heavy Haul', defend: 'Hold the Line',
  repo: 'Repossession', race: 'Street Run', assassinate: 'Wetwork', rescue: 'Extraction', heist: 'Heist', wetwork: 'Wetwork+', story: 'Story',
};
const DIFF = ['', 'Routine', 'Standard', 'Hazardous', 'Severe', 'Lethal'];
const GRADE = { street: 'Street', pro: 'Pro', elite: 'Elite', black: 'Black', story: 'Story' };

function card(c, i) {
  const d = Math.max(1, Math.min(5, c.difficulty || 1));
  const g = c.story ? 'story' : c.grade || 'street';
  const arch = c.archetype || c.type;
  const mods = (c.modifiers || []).map(m => `<span class="hf-chip ${m.kind === 'good' ? 'good' : m.kind === 'bad' ? 'bad' : ''}">${esc(m.label)}</span>`).join('');
  const cl = c.client || {};
  return `<article class="hf-ccard d${d} g-${g} ${c.story ? 'story' : ''}" data-i="${i}" style="animation-delay:${i * 60}ms">
    ${c.story ? '<div class="cc-rib">Story</div>' : ''}
    <div class="cc-top">
      <div class="cc-type"><span class="cc-ti">${icon(MISSION_ICON(c.story ? 'story' : arch))}</span><span>${esc(c.typeLabel || TYPE_LABEL[arch] || arch || 'Contract')}</span></div>
      ${c.difficulty ? `<div class="cc-diff" title="${DIFF[d]}">${Array.from({ length: 5 }, (_, k) => `<i class="${k < d ? 'on' : ''}"></i>`).join('')}</div>` : ''}
    </div>
    <h3 class="cc-title">${esc(c.title)}</h3>
    ${c.suits ? `<div class="cc-suits">${icon('check')}Suits your ${esc(c.suits)}</div>` : ''}
    <div class="cc-client">
      <div class="cc-av">${portrait(cl.portrait || { kind: cl.kind || 'human', seed: cl.seed ?? (i * 7 + 3), hue: cl.hue })}</div>
      <div><b>${esc(cl.name || 'Anonymous')}</b><small>${esc(cl.org || '')}</small></div>
    </div>
    <div class="cc-loc">${icon('pin')}<span>${esc(c.location || '')}${c.district ? ` · <em>${esc(c.district)}</em>` : ''}</span></div>
    <div class="cc-mods">${mods}</div>
    ${c.target ? `<div class="cc-tgt">${icon('mark')}<span>${esc(c.target)}</span></div>` : ''}
    ${c.desc ? `<p class="cc-desc">${esc(c.desc)}</p>` : '<div class="cc-sp"></div>'}
    <div class="cc-meta">
      <span>${icon('clock')}${c.timeLimit ? fmtTime(c.timeLimit) : 'No limit'}</span>
      <span class="cc-lv">LV <b class="hf-num">${c.level ?? '—'}</b></span>
      <span class="cc-gr">${esc(GRADE[g] || g)}</span>
    </div>
    <div class="cc-pay">
      <div class="cc-cr"><span class="ci">${icon('credits')}</span><b class="hf-num hf-gold-text">${fmt(c.payout || 0)}</b></div>
      <div class="cc-side"><div class="cc-xp hf-num">+${fmt(c.xp || 0)} XP</div>${c.bonus ? `<small class="hf-num">+${fmt(c.bonus)} bonus</small>` : ''}</div>
    </div>
    <button class="hf-btn gold cc-go hf-live" data-i="${i}">Accept</button>
  </article>`;
}

export function contractsPanel(body, data, ctx) {
  const list = (data.contracts || []).slice().sort((a, b) => (b.story ? 1 : 0) - (a.story ? 1 : 0));
  body.innerHTML = `<div class="hf-cboard hf-scroll">${list.map(card).join('') || '<div class="hf-empty">No open contracts. Check back soon.</div>'}</div>`;
  if (data.threats) {
    const seg = h('div.cb-threat', {
      html: `<span class="hf-label">Threat</span><div class="st-seg">${data.threats.map(t => (typeof t === 'string' ? { id: t, name: t[0].toUpperCase() + t.slice(1) } : t)).map(t => `<button class="hf-live ${t.id === data.threat ? 'on' : ''} ${t.locked ? 'locked' : ''}" data-t="${esc(t.id)}" ${t.locked ? 'aria-disabled="true"' : ''}>${t.locked ? icon('lock') : ''}${esc(t.name)}</button>`).join('')}</div>`,
    });
    seg.querySelectorAll('button').forEach(b => onTap(b, () => {
      if (b.classList.contains('locked')) { ctx.bus.emit('sfx', 'deny'); return; }
      haptic(); ctx.bus.emit('sfx', 'click'); ctx.bus.emit('contract:threat', b.dataset.t);
    }));
    ctx.extra.append(seg);
  }
  if (data.refreshIn != null) ctx.extra.append(h('div.cb-refresh', { html: `<small>New shift in</small><b class="hf-num">${fmtTime(data.refreshIn)}</b>` }));
  if (data.rerollCost != null) {
    const b = h('button.hf-btn.ghost.hf-live', { html: `${icon('reroll')}<span>Refresh</span><b class="hf-num" style="color:var(--gold)">${fmt(data.rerollCost)}</b>` });
    onTap(b, () => { haptic(); ctx.bus.emit('sfx', 'click'); ctx.bus.emit('contract:reroll'); });
    ctx.extra.append(b);
  }
  const board = body.firstChild;
  if (ctx.state.scroll) board.scrollLeft = ctx.state.scroll;
  board.addEventListener('scroll', () => { ctx.state.scroll = board.scrollLeft; }, { passive: true });
  board.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { board.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  board.querySelectorAll('.cc-go').forEach(b => onTap(b, () => {
    const c = list[+b.dataset.i];
    haptic(18);
    ctx.bus.emit('sfx', 'confirm');
    b.closest('.hf-ccard').classList.add('taken');
    setTimeout(() => { ctx.bus.emit('contract:accept', c); ctx.close(); }, 380);
  }));
  board.querySelectorAll('.hf-ccard').forEach(c => c.addEventListener('click', () => {
    board.querySelectorAll('.hf-ccard.sel').forEach(x => x !== c && x.classList.remove('sel'));
    c.classList.toggle('sel');
  }));
}

// Warehouse ▸ Legacy (P6): the Legacy board, the Heir Core rank, Succession ("Pass the Frame") and the five Voices.
import { esc, fmt, onTap } from './core.js';
import { icon } from './icons.js';

const ROMAN = (n) => { let s = ''; for (const [v, r] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s || '0'; };
export { ROMAN };

export function legacyTab(body, data, ctx, emit) {
  const st = ctx.state;
  const L = data.legacy;
  if (!L) { body.innerHTML = '<div class="hf-empty">Legacy opens after the story ends.</div>'; return; }
  const s = L.succession;
  const lvlBar = L.level >= 60
    ? `<div class="lg-bar"><i style="width:${Math.min(100, Math.round(L.xp / L.xpNext * 100))}%"></i></div><small class="hf-num">${fmt(L.xp)} / ${fmt(L.xpNext)} XP to the next point</small>`
    : `<small>Legacy points start at level 60 (you are ${L.level}).</small>`;
  const nodes = L.nodes.map((n) => `<button class="lg-node hf-live ${n.ranks ? 'on' : ''}" ${L.points < 1 || n.capped ? 'disabled' : ''} data-node="${esc(n.id)}">
      <b>${esc(n.name)}</b><span class="hf-num">${n.ranks ? `rank ${n.ranks} · ${esc(n.value)}` : 'rank 0'}</span><em>${n.capped ? 'capped' : `next ${esc(n.next)}`}</em></button>`).join('');
  const heirPct = L.heirRank * 5;
  const voices = L.voices.open ? L.voices.list.map((v) => `<div class="lg-voice ${v.caught ? 'caught' : v.hunting ? 'hunt' : ''}">
      <span class="lg-vi">${icon(v.caught ? 'check' : v.hunting ? 'bounty' : 'lock')}</span>
      <div><b>${esc(v.name)}</b><small>${v.caught ? `Silenced · ${esc(v.relic)}` : v.hunting ? `Hiding in ${esc(v.district || '?')} · take the Voice Hunt card` : `Still in hiding · drops ${esc(v.relic)}`}</small></div></div>`).join('')
    + (L.voices.cycle ? `<small class="lg-note">Cycle ${L.voices.cycle + 1}: they came back stronger.</small>` : '')
    : '<small class="lg-note">Five Voices fled the Helm. They surface once the story ends.</small>';

  st.heirloom = s.heirlooms.some((h) => h.uid === st.heirloom) ? st.heirloom : s.heirlooms[0]?.uid || null;
  const hl = s.heirlooms.map((h) => `<button class="lg-hl hf-live ${st.heirloom === h.uid ? 'on' : ''}" data-hl="${esc(h.uid)}"><b>${esc(h.name)}</b><small>${esc(h.slot)} · +${h.tune}${h.handedDown ? ` · handed down ×${h.handedDown}` : ''} → cap +${11 + h.handedDown}</small></button>`).join('');
  const tree = [`<i>Wren</i>`, ...L.heirs.map((x) => `<i>${esc(x.name)}</i>`)].join('<span>›</span>');
  const succ = `<div class="lg-succ ${s.ok ? 'ready' : ''}">
      <span class="hf-label">Succession · Generation ${s.generation} → ${s.nextGen}</span>
      <div class="lg-tree">${tree}</div>
      ${s.ok ? '' : `<small>${L.level < 60 ? 'Reach level 60, then earn' : 'Earn'} ${s.need} Legacy points as ${esc(s.name)} (${s.legacyGen}/${s.need}).</small>`}
      <small>Your heir starts at level 1 with +${Math.round(s.xpBonus * 100)}% XP and +${Math.round(s.lootBonus * 100)}% loot quality. You keep frames, stash, materials, codex, the Legacy board and the Heir Core. Credits above ${fmt(s.creditCap)} go as estate duty${s.duty ? ` (−${fmt(s.duty)} cr)` : ''}. The story replays as an Echo run.</small>
      ${s.ok ? `<span class="hf-label">Hand down one heirloom (it grows with the heir)</span>${hl || '<small>No heirloom pieces in the stash.</small>'}
      <label class="lg-in"><span>Heir's name</span><input class="lg-name" maxlength="18" value="${esc(st.heirName || '')}" placeholder="Name your heir" autocomplete="off"></label>
      <button class="hf-btn ${st.confirmSucc ? 'danger' : 'gold'} hf-live lg-pass">${icon('star')}${st.confirmSucc ? `Confirm: pass the frame to ${esc(st.heirName || 'your heir')}` : 'Pass the Frame'}</button>` : ''}
    </div>`;
  body.innerHTML = `<div class="hf-sk hf-lg">
    <div class="sk-l hf-scroll">
      <div class="lg-head"><div><span class="hf-label">Legacy points</span><b class="hf-num lg-pts">${L.points}</b></div>
        <div><span class="hf-label">Heir Core</span><b class="hf-num">Rank ${L.heirRank}</b><small>+${heirPct}% Heir Protocol · next at ${L.heirNext} Legacy</small></div></div>
      ${lvlBar}
      <div class="lg-nodes">${nodes}</div>
      <small class="lg-note">Ranks 1–50 count in full, 51–150 half, 151+ a quarter. Earned ever: ${L.ever}.${L.overclock ? ` Overclock ${ROMAN(L.overclock)} unlocked (pick it on the contract board).` : ''}</small>
    </div>
    <div class="sk-r hf-scroll">${succ}<span class="hf-label">The five Voices</span>${voices}</div>
  </div>`;
  body.querySelectorAll('.lg-node:not([disabled])').forEach((b) => onTap(b, () => emit('warehouse:legacy', { node: b.dataset.node })));
  body.querySelectorAll('.lg-hl').forEach((b) => onTap(b, () => { st.heirloom = b.dataset.hl; st.confirmSucc = false; ctx.bus.emit('sfx', 'click'); ctx.rerender(); }));
  const inp = body.querySelector('.lg-name');
  if (inp) {
    ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => inp.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'keydown' }));
    inp.addEventListener('input', () => { st.heirName = inp.value; st.confirmSucc = false; body.querySelector('.lg-pass')?.classList.replace('danger', 'gold'); });
  }
  const pass = body.querySelector('.lg-pass');
  if (pass) onTap(pass, () => {
    st.heirName = (inp?.value || '').trim();
    if (!st.heirName) { inp?.focus(); ctx.bus.emit('sfx', 'deny'); return; }
    if (!st.confirmSucc) { st.confirmSucc = true; ctx.bus.emit('sfx', 'click'); ctx.rerender(); return; }
    st.confirmSucc = false;
    emit('warehouse:succession', { name: st.heirName, heirloom: st.heirloom });
  });
}

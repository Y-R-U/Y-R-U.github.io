import { el, btn, setText } from './dom.js?v=20261004e';
import { fmtNum, fmtCash, fmtMult } from '../state/format.js?v=20261004e';
import { section, empty } from './kit.js?v=20261004e';
import { composePoster, savePoster } from './poster.js?v=20261004e';

// Boot Hill: Fake Your Death (W2) — the Bounty preview, the ceremony, every grave with its epitaph, and the
// Wanted Poster PNG (W16).
export function posterData(model, game) {
  const st = game.state;
  const h = model.hat();
  return {
    name: model.disguise()?.name || 'The Stranger', hatName: h.hat?.name, hatScale: h.hat?.scale || 1, disguise: model.disguise(),
    bounty: st.bounty || 0, allTime: st.allTime || 0, stats: st.stats || {}, gen: st.gen || 1,
  };
}

export async function takePoster(ctx) {
  const d = posterData(ctx.model, ctx.game);
  const c = await composePoster(d);
  ctx.audio.sfx.stamp();
  const slug = (d.name || 'stranger').toLowerCase().replace(/[^a-z]+/g, '-');
  return savePoster(c, `wanted-${slug}-${d.gen}.png`, ctx.toast);
}

export function fillBootHill(body, ctx) {
  const { model, game } = ctx;
  let armed = false, sig = '';
  const hero = el('div', 'bh-top');
  const stone = el('div', 'bh-stone', '🪦');
  const info = el('div', 'bh-info');
  const big = el('b', 'bh-big');
  const sub = el('small', 'bh-sub');
  info.append(el('small', 'bh-k', 'Bounty on your head'), big, sub);
  hero.append(stone, info);
  body.appendChild(hero);
  const needs = el('div', 'needs');
  body.appendChild(needs);
  const keep = el('p', 'bh-note', 'You keep: Bounty, graves, gold teeth, strongboxes, managers & gear, Demands, achievements, keepsakes. Businesses come back as 3 s rebrands.');
  body.appendChild(keep);
  const go = btn('cta danger', '', () => {
    const pv = model.death();
    if (!pv.available) { ctx.toast('🔒 Open Bank Block and own Boot Hill first'); return; }
    if (!armed) { armed = true; setText(go, '⚰️ Really? Tap again to die (a bit)'); go.classList.add('armed'); setTimeout(() => { armed = false; paint(true); }, 3500); return; }
    armed = false;
    ctx.fakeDeath();
  });
  body.appendChild(go);
  const posterBtn = btn('wide-btn poster', '🖼️ Print my Wanted Poster', async () => { posterBtn.disabled = true; await takePoster(ctx); posterBtn.disabled = false; });
  body.appendChild(posterBtn);
  const gs = section(body, '🪦 Boot Hill');
  const graves = el('div', 'graves');
  gs.appendChild(graves);

  function paint(force) {
    const pv = model.death();
    const gr = model.graves();
    const key = [pv.available, pv.bounty, pv.recommended, gr.length, armed].join('|');
    if (key === sig && !force) return;
    sig = key;
    setText(big, `💀 ${fmtNum(pv.total || 0)}`);
    setText(sub, pv.available ? `+${fmtNum(pv.bounty)} now · income ${fmtMult(pv.nextMult || 1)} · start with ${fmtCash(pv.starterCash || 50)}` : 'Fake your death once Bank Block is open');
    needs.replaceChildren();
    for (const n of pv.needs || []) needs.appendChild(el('span', 'need' + (n.done ? ' ok' : ''), (n.done ? '✓ ' : '') + n.emoji + ' ' + n.text));
    if (!armed) setText(go, pv.recommended ? '⚰️ Fake Your Death · recommended' : '⚰️ Fake Your Death');
    go.disabled = !pv.available;
    go.classList.toggle('glow', !!pv.recommended);
    go.classList.remove('armed');
    graves.replaceChildren();
    if (!gr.length) empty(graves, '🌵', 'No graves yet. Give it time.');
    for (const g of gr.slice().reverse()) {
      const s = el('div', 'grave');
      s.append(el('b', '', g.name), el('i', '', '“' + g.epitaph + '”'), el('small', '', `Identity ${g.gen} · 💀 ${fmtNum(g.bounty || 0)} · ${fmtCash(g.allTime || 0)}`));
      graves.appendChild(s);
    }
  }
  paint(true);
  return () => paint(false);
}

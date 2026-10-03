import { el, btn } from './dom.js?v=20261004a';

// Manager sheet: portrait, trait, and "run this business" when owned but placed elsewhere.
// Manager levels / gear are a later lane (Idle Life 2's tickets + items were dropped in the fork).
export function fillManager(body, ctx, managerId) {
  const { model, game } = ctx;
  const def = model.mgrById[managerId];
  const line = model.line(def.lineId);
  const card = el('div', 'mgr-card');
  const face = el('div', 'mgr-portrait', def.emoji);
  face.dataset.line = line.emoji;
  const who = el('div', 'mgr-who');
  who.append(el('h3', '', def.name), el('small', 'mgr-trait', `${def.trait} · ${def.text}`));
  card.append(face, who);
  body.appendChild(card);
  const place = btn('wide-btn', '', () => {
    const r = game.act('hire', { lineId: def.lineId, managerId });
    if (r.ok) { ctx.audio.sfx.pop(); ctx.textNow(); } else ctx.toast(r.msg || '🙅 Not yet');
  });
  body.appendChild(place);

  const update = () => {
    const m = model.manager(def.lineId);
    face.classList.toggle('unhired', !m.owned);
    place.hidden = !(m.owned && !m.hired && model.stats(line.id).owned);
    if (!place.hidden) place.textContent = `🕴 Run ${line.emoji} ${line.name}`;
  };
  update();
  return update;
}

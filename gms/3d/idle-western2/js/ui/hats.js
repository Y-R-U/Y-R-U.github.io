import { el, btn, setText, show } from './dom.js?v=20261004h';

// The hat war (W3/W14): a ribbon "🤠 You 3/18 · 🎩 Pomfrey 7/18" whose hat icons scale with each side's tier,
// the promotion toast, and the upturned mud hat of the opening (W15) that you tap to bank coins.
export function createHats(hero, ctx) {
  const { model } = ctx;
  let promo = null;
  const ribbon = btn('hero-chip ribbon', '', (e) => { e.stopPropagation(); explain(); }, 'Hat war');
  const you = el('span', 'rb-side you');
  const youHat = el('i', 'rb-hat', '🤠');
  const youN = el('b', '');
  you.append(youHat, el('small', '', 'You'), youN);
  const pom = el('span', 'rb-side pom');
  const pomHat = el('i', 'rb-hat', '🎩');
  const pomN = el('b', '');
  pom.append(pomHat, el('small', '', 'Pom'), pomN);
  ribbon.append(you, pom);
  ribbon.hidden = true;

  const mud = btn('mud-hat', '', (e) => { e.stopPropagation(); ctx.onHat(e); }, 'Your hat: tap to pocket the coins');
  const mudN = el('b', 'mud-n', '');
  mud.append(el('span', 'mud-e', '🎩'), mudN);
  mud.hidden = true;
  hero.append(ribbon, mud);

  let sig = '';
  function explain() {
    const h = model.hat();
    ctx.toast(`🤠 ${h.hat?.name || 'Hat'} vs Pomfrey's ${h.pomfreyHat?.name || 'hat'}`, { ms: 2600 });
  }

  return {
    ribbon, mud,
    update(R) {
      const started = model.started();
      show(ribbon, started && !ctx.townActive());
      const boot = model.bootstrapping();
      show(mud, boot && !ctx.townActive() && !ctx.captions?.active && (model.gen() < 2 || model.hatCoins() > 0));
      if (boot) {
        const a = ctx.spectacle?.bubbleAnchor('hat');
        if (a && a.visible) { mud.style.transform = `translate(${a.x | 0}px, ${a.y | 0}px)`; mud.classList.add('anchored'); }
        else if (mud.classList.contains('anchored')) { mud.classList.remove('anchored'); mud.style.transform = ''; }
        const n = Math.round(model.hatCoins() / (model.data.econ?.bootTap || 2));
        setText(mudN, n > 0 ? '×' + n : '');
        mud.classList.toggle('full', n > 0);
      }
      if (!started) return;
      const h = model.hat();
      const pf = model.pomfreyFrontages();
      const key = [h.tier, h.pomfrey, h.own, h.frontages].join('|');
      if (key === sig) return;
      sig = key;
      setText(youN, `${h.own}/${h.frontages}`);
      setText(pomN, `${pf}/${h.frontages}`);
      youHat.style.setProperty('--s', Math.max(0.75, Math.min(1.6, 0.7 + (h.hat?.scale || 1) * 0.22)).toFixed(2));
      pomHat.style.setProperty('--s', Math.max(0.68, Math.min(1.6, 0.55 + (h.pomfreyHat?.scale || 1) * 0.22)).toFixed(2));
      ribbon.classList.toggle('winning', h.pomfrey <= 0);
    },
    // Hero-px rect of the promotion card while it is up, so speech bubbles steer under it (PT2#10).
    promoRect() { return promo && promo.el.isConnected && !promo.el.classList.contains('out') ? promo.rect : null; },
    promo({ hat, pomfreyHat, pomfrey }) {
      const t = el('div', 'hat-promo');
      const big = el('div', 'hp-hat', '🤠');
      const txt = el('div', 'hp-txt');
      txt.append(el('small', '', 'New hat!'), el('b', '', hat?.name || 'Bigger hat'), el('span', 'hp-pom', pomfrey <= 0 ? 'Pomfrey is wearing a THIMBLE' : `Pomfrey shrinks to a ${pomfreyHat?.name || 'smaller hat'}`));
      t.append(big, txt);
      hero.appendChild(t);
      const r = t.getBoundingClientRect(), h = hero.getBoundingClientRect();
      promo = { el: t, rect: { l: r.left - h.left, r: r.right - h.left, t: r.top - h.top, b: r.bottom - h.top } };
      ctx.audio.stinger('st_hat');
      setTimeout(() => t.classList.add('out'), 2800);
      setTimeout(() => t.remove(), 3300);
      sig = '';
      ribbon.classList.remove('flash'); void ribbon.offsetWidth; ribbon.classList.add('flash');
    },
  };
}

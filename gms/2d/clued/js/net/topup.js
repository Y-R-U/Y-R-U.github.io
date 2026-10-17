// Out of online games: an in-page sheet offering a free top-up (Yes / No), with a short br8t Pass pitch.
// After the last top-up of the day it shows a friendly end-of-day note instead (no Yes).
import { h } from '../ui/kit.js?v=202610171317';
import { toast } from '../ui/popup.js?v=202610171317';
import { go } from '../ui/app.js?v=202610171317';
import { ensureStyles } from './util.js?v=202610171317';
import { topUp, canTopUp, doneForToday, resetTime, passPrices, buyPass, uuid } from './pass.js?v=202610171317';

let layer = null;
const ensureLayer = () => layer || (layer = document.getElementById('popups') || document.body.appendChild(h('div', { id: 'popups' })));

// Does this allowance call for the sheet? (false on a payments build without top-ups: callers keep the inline panel)
export const wantsSheet = a => canTopUp(a) || doneForToday(a);

function passRow(status) {
  const btn = (product, label) => h('button.btn.small.topup-pass', { type: 'button', dataset: { act: product === 'br8t_pass_yearly' ? 'pass-yearly' : 'pass-monthly' },
    onclick: async e => {
      const b = e.currentTarget;
      b.disabled = true;
      status.textContent = 'Opening the shop…';
      try { await buyPass(product); } catch (err) { status.textContent = err.message; b.disabled = false; }
    } }, label);
  const month = btn('br8t_pass_monthly', 'Monthly Pass');
  const year = btn('br8t_pass_yearly', 'Yearly Pass');
  passPrices().then(p => {
    if (p.monthly) month.textContent = `Monthly · ${p.monthly}`;
    if (p.yearly) year.textContent = `Yearly · ${p.yearly}`;
  });
  return h('div.topup-passrow', {}, month, year);
}

// a = the allowance that ran out. extra = more actions for this caller, e.g. [{ label: 'Send a link challenge', value: 'link' }].
// Resolves 'yes' once games were added (the caller retries what it was doing), an extra's value, or null (closed).
export function offerTopUp(a, { extra = [] } = {}) {
  ensureStyles();
  return new Promise(resolve => {
    const id = uuid();   // one claim per sheet: "Try again" after a network error can never grant twice
    const card = h('div.pop-card.topup-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'topup-title', dataset: { sheet: 'topup' } });
    const back = h('div.pop.topup-pop', {}, card);
    let done = false;
    const close = v => {
      if (done) return;
      done = true;
      back.classList.add('out');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => back.remove(), 220);
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
    back.addEventListener('click', e => { if (e.target === back) close(null); });
    const shopStatus = h('p.topup-status', { role: 'status' });
    const codeLink = h('button.topup-link', { type: 'button', dataset: { act: 'pass-code' }, onclick: () => { close(null); go('settings', { focus: 'pass' }); } }, 'Got a Pass code?');
    const extras = extra.map(x => h('button.btn.wide', { type: 'button', dataset: { act: `extra-${x.value}` }, onclick: () => close(x.value) }, x.label));

    function endOfDay(st) {
      const at = resetTime(st);
      const n = st?.usedToday || st?.perDay || 20;
      card.dataset.state = 'done';
      card.replaceChildren(
        h('div.topup-icon', { 'aria-hidden': 'true' }, '🌙'),
        h('h3.pop-title', { id: 'topup-title' }, `That’s ${n} games today. Nice!`),
        h('p.topup-lead', {}, `Take a break until tomorrow${at ? ` (more at ${at} your time)` : ''}, get a br8t Pass for unlimited hosting, or ask a friend to host: joining is always free.`),
        passRow(shopStatus), shopStatus, codeLink, ...extras,
        h('div.pop-actions', {}, h('button.btn.primary', { type: 'button', dataset: { act: 'topup-close' }, onclick: () => close(null) }, 'OK')));
      card.querySelector('[data-act=topup-close]')?.focus({ preventScroll: true });
    }

    function offer(st) {
      const n = st.topUpSize || 5;
      const note = h('p.topup-note', { role: 'status' });
      const yes = h('button.btn.primary', { type: 'button', dataset: { act: 'topup-yes' } }, 'Yes please');
      const no = h('button.btn.ghost', { type: 'button', dataset: { act: 'topup-no' }, onclick: () => close(null) }, 'No thanks');
      yes.addEventListener('click', async () => {
        yes.disabled = true;
        yes.textContent = 'Adding…';
        note.textContent = '';
        const r = await topUp(id);
        if (done) return;
        if (r.status === 'ok' || r.status === 'left' || r.status === 'unlimited') {
          close('yes');
          if (r.status === 'ok') toast(`${r.granted || n} more free games added`);
          return;
        }
        if (r.status === 'cap') { endOfDay(r.allowance || st); return; }
        card.dataset.state = 'error';
        note.textContent = r.status === 'signin' ? 'Your sign-in has expired. Sign in again, then try once more.'
          : 'We couldn’t add games just now. Check your connection and try again in a moment.';
        yes.disabled = false;
        yes.textContent = 'Try again';
      });
      card.dataset.state = 'offer';
      card.replaceChildren(
        h('div.topup-icon', { 'aria-hidden': 'true' }, '🎟️'),
        h('h3.pop-title', { id: 'topup-title' }, `Would you like another ${n} free games?`),
        h('p.topup-lead', {}, `You’ve used today’s ${st.perDay} online games. They’re on us.`),
        h('div.topup-pitch', {},
          h('p', {}, 'Enjoying Clued? A br8t Pass gives you unlimited hosting in Clued and every br8t game, and helps keep them going.'),
          passRow(shopStatus), shopStatus, codeLink),
        note, ...extras,
        h('div.pop-actions', {}, no, yes));
      yes.focus({ preventScroll: true });
    }

    if (canTopUp(a)) offer(a); else endOfDay(a);
    document.addEventListener('keydown', onKey, true);
    ensureLayer().append(back);
    requestAnimationFrame(() => back.classList.add('in'));
  });
}

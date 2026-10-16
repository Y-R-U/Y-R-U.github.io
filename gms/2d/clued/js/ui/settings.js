import { h, esc } from './kit.js?v=202610161407';
import { canFullscreen, toggleFullscreen } from './toggles.js?v=202610161407';
import { defineScreen, header, back, go } from './app.js?v=202610161407';
import { getSettings, setSettings, ANSWER_TIMES } from '../core/store.js?v=202610161407';
import { getIndex, loadPacks, loadedPacks, allPackIds } from '../core/packs.js?v=202610161407';
import { applyAudioSettings, sfx } from './fx.js?v=202610161407';
import { applyKids } from './home.js?v=202610161407';
import { loadLearn, loadNet } from './net.js?v=202610161407';
import { BUILD } from '../build.js?v=202610161407';
import { canSpeak, speak } from './speech.js?v=202610161407';
import { streakOption } from './streakopt.js?v=202610161407';
import { localChip } from './local.js?v=202610161407';
import { confirmPop, toast } from './popup.js?v=202610161407';
import { seenInfo, resetSeen } from '../core/fresh.js?v=202610161407';
import { mySetting, saveMySetting } from '../core/local.js?v=202610161407';
import { passUntil, redeemCode, fmtDate } from '../net/pass.js?v=202610161407';

function toggleRow(label, help, key, after) {
  const s = getSettings();
  const inp = h('input', { type: 'checkbox', 'aria-label': label, dataset: { key } });
  inp.checked = !!s[key];
  inp.addEventListener('change', () => { const n = setSettings({ [key]: inp.checked }); after && after(n); sfx('button'); });
  return h('div.opt-row', {}, h('span.lbl', {}, label, help ? h('small', {}, help) : null), h('span.switch', {}, inp, h('i')));
}

export function applyAll(s = getSettings()) {
  document.documentElement.classList.toggle('reduced', !!s.reducedMotion);
  applyKids(s.kids);
  applyAudioSettings(s);
}

// Gift codes: the Pass is on the br8t account, so it covers every br8t game.
function passPanel() {
  const note = h('small', {}, 'Got a br8t Pass code? Sign in, then enter it here. The Pass covers every br8t game.');
  const code = h('input.field', { type: 'text', placeholder: 'BR8T-XXXX-XXXX-XXXX', maxlength: 24, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Pass code', style: { flex: '1', minWidth: '0', fontSize: '16px', padding: '10px 12px' } });
  const btn = h('button.btn.small', { type: 'button', dataset: { act: 'redeem' } }, 'Use');
  const status = h('p.muted.tiny', { style: { margin: '8px 0 0' } });
  const use = async () => {
    const c = code.value.trim();
    if (!c) { status.textContent = 'Type the code first.'; return; }
    btn.disabled = true;
    try {
      const until = await redeemCode(c);
      code.value = '';
      status.textContent = `Done! Your br8t Pass is active until ${fmtDate(until)}.`;
      toast('br8t Pass added');
    } catch (e) { status.textContent = e.message; }
    btn.disabled = false;
  };
  btn.addEventListener('click', use);
  code.addEventListener('keydown', e => { if (e.key === 'Enter') use(); });
  passUntil().then(u => { if (u && status.isConnected && !status.textContent) status.textContent = `Your br8t Pass is active until ${fmtDate(u)}.`; });
  return h('div.panel.set-list', { dataset: { set: 'pass' } },
    h('div.opt-row', {}, h('span.lbl', {}, 'Pass code', note)),
    h('div', { style: { display: 'flex', gap: '8px' } }, code, btn), status);
}

// Bug reports and ideas, through the shared br8t feedback panel (signed-in accounts only).
function feedbackPanel() {
  const note = h('small', {}, 'Goes straight to the developer.');
  const slot = h('span');
  import('/lib/feedback/feedback.js')
    .then(m => slot.replaceWith(m.feedbackButton({ game: 'clued', build: BUILD, accent: '#7b61ff', className: 'btn small', label: '✉️ Write', signedOutLabel: 'Sign in', note })))
    .catch(() => { note.textContent = 'Feedback isn’t available right now.'; });
  return h('div.panel.set-list', { dataset: { set: 'feedback' } }, h('div.opt-row', {}, h('span.lbl', {}, 'Report a bug or suggest an idea', note), slot));
}

defineScreen('settings', (el, params = {}) => {
  const s = getSettings();
  el.append(header('Settings'));
  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.music, 'aria-label': 'Music volume' });
  vol.addEventListener('input', () => applyAll(setSettings({ music: +vol.value })));
  const secs = h('div.chips');
  for (const n of ANSWER_TIMES) {
    const c = h('button.chip', { type: 'button', class: s.timerSec === n ? 'on' : '' }, n ? `${n}s` : 'Off');
    c.addEventListener('click', () => { setSettings({ timerSec: n }); secs.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); });
    secs.append(c);
  }
  el.append(h('div.panel.set-list', {},
    toggleRow('Sound effects', null, 'sound', applyAll),
    h('div.opt-row', {}, h('span.lbl', {}, 'Music volume'), h('div', { style: { width: '50%' } }, vol)),
    toggleRow('Haptics', 'Buzz on right and wrong answers', 'haptics'),
    h('div.opt', {}, h('div.opt-label', {}, 'Default answer time'), secs),
    streakOption(s.streakPts !== false, v => setSettings({ streakPts: v })),
    toggleRow('Reduced motion', 'Fewer animations, no confetti', 'reducedMotion', applyAll),
    canSpeak() ? toggleRow('Read questions aloud', 'Always on in kids mode', 'readAloud', n => n.readAloud && speak('Questions will be read aloud.')) : null,
    canFullscreen() ? h('div.opt-row', {}, h('span.lbl', {}, 'Full screen'), h('button.btn.small', { type: 'button', onclick: () => toggleFullscreen() }, 'Toggle')) : null,
    toggleRow('Kids mode', 'Easy picture questions, no timer, stickers', 'kids', applyAll),
  ));
  el.append(h('h3.sec-title', { style: { marginTop: '18px' } }, 'Local focus'), h('div.panel.set-list', { dataset: { set: 'local' } },
    h('p.muted.tiny', { style: { margin: '0 0 10px' } }, 'More questions about one country in the games you set up (solo, party, pub quiz and the rooms you host).'),
    localChip(mySetting, next => saveMySetting(next))));
  const seenLbl = h('span', { dataset: { seen: 'count' } });
  const showSeen = () => { const n = seenInfo().count; seenLbl.textContent = n ? `${n.toLocaleString('en-GB')} question${n === 1 ? '' : 's'} remembered` : 'None yet'; };
  showSeen();
  const seenReset = h('button.btn.small', { type: 'button', dataset: { act: 'seen-reset' }, onclick: async () => {
    if (!(await confirmPop('Forget the questions you’ve seen?', 'New games will be free to pick any question again.', 'Reset', 'Cancel', true))) return;
    resetSeen(); showSeen(); toast('Seen questions reset');
  } }, 'Reset');
  el.append(h('h3.sec-title', { style: { marginTop: '18px' } }, 'Questions you’ve seen'), h('div.panel.set-list', { dataset: { set: 'seen' } },
    h('div.opt-row', {}, h('span.lbl', {}, seenLbl, h('small', {}, 'Games you set up pick questions you haven’t had yet, then the ones you saw longest ago.')), seenReset)));
  el.append(h('h3.sec-title', { style: { marginTop: '18px' } }, 'Home page'), h('div.panel.set-list', {},
    toggleRow('Show the kids mode switch', 'Kids mode itself is in the list above', 'homeKids'),
    toggleRow('Show the daily challenge', null, 'homeDaily')));
  el.append(h('h3.sec-title', { style: { marginTop: '18px' } }, 'br8t Pass'), passPanel());
  el.append(h('h3.sec-title', { style: { marginTop: '18px' } }, 'Feedback'), feedbackPanel());
  if (params.focus === 'pass') setTimeout(() => el.querySelector('[data-set=pass]')?.scrollIntoView({ block: 'center' }), 60);
  el.append(h('div.panel.set-list', { style: { marginTop: '14px' } }, h('div.opt-row', {}, h('span.lbl', {}, 'Your stats', h('small', {}, 'Games, accuracy, streaks, topics and history')),
    h('button.btn.small', { type: 'button', dataset: { act: 'stats' }, onclick: () => go('stats') }, '📊 Open'))));
  el.append(h('p.muted.tiny.center', { style: { marginTop: '18px' } }, `Clued build ${BUILD} · ${Object.values(getIndex()?.packs || {}).filter(p => !p.virtual).length} packs`));
});

defineScreen('credits', async el => {
  el.append(header('Credits'));
  const body = h('div');
  const link = (t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`;
  const fixed = h('div.panel.credits-pack', {}, h('h3', {}, 'Maps, music and services'), h('ul', { html: [
    `<b>Map data</b>: Made with ${link('Natural Earth', 'https://www.naturalearthdata.com')} (public domain). Flags from Wikimedia Commons (credit per flag below the map questions).`,
    `<b>Song previews</b>: provided courtesy of ${link('Apple Music', 'https://music.apple.com')}; streamed from Apple, never stored. Apple Music is a trademark of Apple Inc.`,
    `<b>Piano</b>: ${link('Salamander Grand Piano', 'https://archive.org/details/SalamanderGrandPianoV3')} by Alexander Holm (CC BY 3.0). Sheet music from the ${link('Mutopia Project', 'https://www.mutopiaproject.org')} (licence per piece) and public-domain sources.`,
    `<b>Anthems and band recordings</b>: US Navy, Marine, Army and Air Force bands (US government, public domain) and other Wikimedia Commons files.`,
    `<b>Device-hosted rooms</b>: ${link('PeerJS', 'https://peerjs.com')} (MIT licence) and its free signalling server.`,
    `<b>Facts</b>: ${link('Wikidata', 'https://www.wikidata.org')} (CC0), ${link('iNaturalist', 'https://www.inaturalist.org')}, Wikipedia and Wikiquote, checked by hand.`,
  ].map(x => `<li>${x}</li>`).join('') }));
  el.append(h('p.muted', {}, 'Every picture and sound in Clued is free to use under the licence shown. Thank you to all the photographers, musicians and archives.'), fixed, body);
  const draw = () => {
    body.innerHTML = '';
    const idx = getIndex();
    const real = () => allPackIds().filter(id => !idx?.packs?.[id]?.virtual);
    for (const p of loadedPacks().filter(p => !idx?.packs?.[p.id]?.virtual).sort((a, b) => String(a.title).localeCompare(b.title))) {
      const rows = [];
      for (const it of p.items || []) for (const m of [...(it.media?.img || []), ...(it.media?.audio || [])]) rows.push([it.name, m]);
      for (const q of p.questions || []) for (const m of [...(q.media?.img || []), ...(q.media?.audio || [])]) rows.push([q.prompt.slice(0, 40) + (q.prompt.length > 40 ? '…' : ''), m]);
      const sec = h('div.panel.credits-pack', {}, h('h3', {}, `${p.icon || ''} ${p.title}`));
      if (rows.length) sec.append(h('ul', { html: rows.map(([n, m]) => `<li><b>${esc(n)}</b>: ${esc(m.credit || 'Unknown')} · ${esc(m.license || '')}${m.page ? ` · <a href="${esc(m.page)}" target="_blank" rel="noopener">source</a>` : ''}</li>`).join('') }));
      if (p.sources?.length) sec.append(h('p.tiny.muted', { html: 'Data: ' + p.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(', ') }));
      body.append(sec);
    }
    const missing = real().length - loadedPacks().filter(p => idx?.packs?.[p.id] && !idx.packs[p.id].virtual).length;
    if (missing > 0) body.append(h('button.btn.wide', { type: 'button', onclick: async e => { e.target.disabled = true; e.target.textContent = 'Loading…'; await loadPacks(real()); draw(); } }, `Show credits for all ${real().length} packs`));
    body.append(h('div.panel.credits-pack', {}, h('h3', {}, 'Fonts and code'), h('p.tiny', { html: 'Lilita One and Nunito (SIL Open Font License) via Google Fonts. Account layer: br8t games.' })));
  };
  if (!loadedPacks().length && allPackIds().length <= 12) { await loadPacks(allPackIds()); }
  draw();
});

// Shown when js/net/ fails to load (offline, or mid-deploy).
defineScreen('online-soon', el => {
  el.append(header('Online'), h('div.coming', {}, h('div.c-ico', {}, '🌐'), h('h2', {}, 'Couldn’t connect'),
    h('p.muted', {}, 'Online play didn’t load. Check your connection and try again.'),
    h('button.btn.primary', { type: 'button', dataset: { act: 'retry' }, onclick: async () => { if (await loadNet()) go('online', {}, { replace: true }); } }, 'Retry')));
}, { pester: true });

defineScreen('learn', async el => {
  const learn = await loadLearn();
  return learn.openLearn(el, window.__cluedCtx);
}, { pester: true });

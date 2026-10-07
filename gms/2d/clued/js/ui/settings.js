import { h, esc } from './kit.js?v=202610071324';
import { setBgm, canFullscreen, toggleFullscreen } from './toggles.js?v=202610071324';
import { defineScreen, header, back } from './app.js?v=202610071324';
import { getSettings, setSettings, ANSWER_TIMES } from '../core/store.js?v=202610071324';
import { getIndex, loadPacks, loadedPacks, allPackIds } from '../core/packs.js?v=202610071324';
import { applyAudioSettings, sfx } from './fx.js?v=202610071324';
import { applyKids } from './home.js?v=202610071324';
import { loadLearn } from './net.js?v=202610071324';
import { BUILD } from '../build.js?v=202610071324';
import { canSpeak, speak } from './speech.js?v=202610071324';

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

defineScreen('settings', el => {
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
    toggleRow('Background music', 'Soft classical, pauses for questions with sound', 'bgm', n => setBgm(n.bgm !== false)),
    toggleRow('Sound effects', null, 'sound', applyAll),
    h('div.opt-row', {}, h('span.lbl', {}, 'Music volume'), h('div', { style: { width: '50%' } }, vol)),
    toggleRow('Haptics', 'Buzz on right and wrong answers', 'haptics'),
    h('div.opt', {}, h('div.opt-label', {}, 'Default answer time'), secs),
    toggleRow('Reduced motion', 'Fewer animations, no confetti', 'reducedMotion', applyAll),
    canSpeak() ? toggleRow('Read questions aloud', 'Always on in kids mode', 'readAloud', n => n.readAloud && speak('Questions will be read aloud.')) : null,
    canFullscreen() ? h('div.opt-row', {}, h('span.lbl', {}, 'Full screen'), h('button.btn.small', { type: 'button', onclick: () => toggleFullscreen() }, 'Toggle')) : null,
    toggleRow('Kids mode', 'Easy picture questions, no timer, stickers', 'kids', applyAll),
  ));
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

function comingSoon(el, title, icon, text) {
  el.append(header(title), h('div.coming', {}, h('div.c-ico', {}, icon), h('h2', {}, 'Coming soon'), h('p.muted', {}, text),
    h('button.btn.primary', { type: 'button', onclick: () => back() }, 'Back')));
}

// Fallback only: lane S registers the real 'online' screen when js/net/ loads.
defineScreen('online-soon', el => comingSoon(el, 'Online', '🌐', 'Play with friends by sharing a link. Nearly ready!'), { pester: true });

defineScreen('learn', async el => {
  const learn = await loadLearn();
  if (learn?.openLearn) return learn.openLearn(el, window.__cluedCtx);
  comingSoon(el, 'Learn', '📖', 'Field guides, flashcards and the mastery map are on their way.');
}, { pester: true });

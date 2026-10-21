import { el, esc, onTap, sound, ICON } from './dom.js';
import { createPopup } from './popup.js';
import { titleFor } from './ranks.js';
import { career } from './career.js';
import { VOICES, sampleUrl, loadRoster } from './voices.js';
import { loadSettings, loadProfile, saveProfile, liveryOf, cleanText, checkName, checkCompany, checkReg, suggestReg, LIMITS } from './store.js';

export const PRESETS = [
  { name: 'Royal Crimson', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017' },
  { name: 'Navy & Gold', primary: '#14285e', secondary: '#f3ede0', accent: '#e0ac2b' },
  { name: 'Racing Green', primary: '#11523a', secondary: '#f1eadb', accent: '#c9a227' },
  { name: 'Sky Blue', primary: '#3d8fd6', secondary: '#ffffff', accent: '#ff7a1a' },
  { name: 'Tangerine', primary: '#f26b1d', secondary: '#fff4e2', accent: '#2a2f4a' },
  { name: 'Flamingo', primary: '#ef6fa3', secondary: '#fff1f6', accent: '#3a2d6b' },
  { name: 'Lemon Meringue', primary: '#f2d33c', secondary: '#fffbe9', accent: '#2f4ea8' },
  { name: 'Midnight', primary: '#1c1d24', secondary: '#c9ccd6', accent: '#d8323c' },
  { name: 'Mint Julep', primary: '#69c9a6', secondary: '#f7fff9', accent: '#7a3e1d' },
  { name: 'Imperial Purple', primary: '#5b2a86', secondary: '#f6eefb', accent: '#e8b730' },
];

const SILLY = ['Dirk', 'Bunty', 'Rupert', 'Hattie', 'Monty', 'Pips', 'Fenella', 'Basil', 'Clemmie', 'Archie', 'Tilly', 'Bertie', 'Wilhelmina', 'Gussie', 'Dotty'];

const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

export function createProfile(root, { onSave, onClose }) {
  const pop = createPopup(root, { title: 'Your Pilot', sub: 'Letters patent', cls: 'kz-creator', onClose: () => { preview?.setActive(false); stopSample(); onClose?.(saved); saved = false; } });
  let saved = false;
  const main = el(`<div class="kz-cr-main">
    <div class="kz-stage">
      <div class="kz-stage-msg">Rolling out your aeroplane…</div>
      <span class="kz-spinhint">Drag to turn</span>
      <div class="kz-plate"><div class="kz-plate-name"></div><span class="kz-reg"></span></div>
    </div>
    <div class="kz-form kz-body"></div>
  </div>`);
  pop.body.replaceWith(main);
  pop.body = main.querySelector('.kz-form');
  const stage = main.querySelector('.kz-stage');
  const stageMsg = main.querySelector('.kz-stage-msg');

  pop.body.innerHTML = `
    <div class="kz-sec"><h3>The pilot</h3>
      <div class="kz-field"><label for="kz-name">Pilot name <span class="kz-cnt" data-for="name"></span></label>
        <div class="kz-input"><input id="kz-name" data-k="name" maxlength="${LIMITS.name}" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="e.g. Dirk"><button class="kz-btn ghost" data-act="random">Random</button></div>
        <div class="kz-hint" data-hint="name"></div></div>
      <div class="kz-field"><label>Title</label>
        <div class="kz-seg wide" data-k="gender"><button data-v="m"></button><button data-v="f"></button></div>
        <div class="kz-hint" data-hint="rank"></div></div>
    </div>
    <div class="kz-sec"><h3>The company</h3>
      <div class="kz-two">
        <div class="kz-field"><label for="kz-company">Company <span class="kz-cnt" data-for="company"></span></label>
          <div class="kz-input"><input id="kz-company" data-k="company" maxlength="${LIMITS.company}" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="optional, e.g. Dirk Air"></div>
          <div class="kz-hint" data-hint="company">Painted on the fuselage and tail.</div></div>
        <div class="kz-field"><label for="kz-reg">Registration</label>
          <div class="kz-input"><input id="kz-reg" class="mono" data-k="registration" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
          <div class="kz-hint" data-hint="registration"></div></div>
      </div>
    </div>
    <div class="kz-sec"><h3>Company colours</h3>
      <div class="kz-presets">${PRESETS.map((p, i) => `<button class="kz-preset" data-i="${i}" aria-label="${esc(p.name)}" title="${esc(p.name)}" style="background:conic-gradient(from 200deg, ${p.primary} 0 55%, ${p.secondary} 0 80%, ${p.accent} 0)"></button>`).join('')}</div>
      <div class="kz-swatches">
        ${['primary', 'secondary', 'accent'].map((k) => `<label class="kz-swatch"><i data-sw="${k}"></i>${k}<input type="color" data-k="${k}" aria-label="${k} colour"></label>`).join('')}
      </div>
    </div>
    <div class="kz-sec"><h3>Radio voice</h3>
      <div class="kz-voices" role="radiogroup" aria-label="Radio voice">${VOICES.map((v) => `<div class="kz-voice" role="radio" tabindex="0" data-v="${v.id}" aria-checked="false">
        <b>${esc(v.name)}</b><p>${esc(v.desc)}</p><button data-sample="${v.id}" disabled>${ICON.mute}Sample soon</button></div>`).join('')}</div>
    </div>`;

  const $ = (s) => pop.body.querySelector(s);
  const inputs = { name: $('#kz-name'), company: $('#kz-company'), registration: $('#kz-reg') };
  const save = el('<button class="kz-btn primary" data-act="save">Take to the skies</button>');
  const cancel = el('<button class="kz-btn ghost" data-act="cancel">Cancel</button>');
  pop.foot.append(cancel, save);

  let draft = loadProfile(), regTouched = false, preview = null, previewing = null, firstRun = false;

  function errors() {
    return { name: checkName(draft.name), company: checkCompany(draft.company), registration: checkReg(draft.registration) };
  }

  function paint() {
    const err = errors();
    for (const k of ['name', 'company', 'registration']) {
      if (document.activeElement !== inputs[k] && inputs[k].value !== draft[k]) inputs[k].value = draft[k];
      const show = err[k] && (draft[k] || k !== 'company');
      inputs[k].classList.toggle('bad', !!(show && inputs[k].dataset.dirty));
      const hint = $(`[data-hint="${k}"]`);
      if (show && inputs[k].dataset.dirty) { hint.textContent = err[k]; hint.classList.add('bad'); }
      else { hint.classList.remove('bad'); hint.textContent = k === 'company' ? 'Painted on the fuselage and tail.' : k === 'registration' ? 'Suggested from your name — change it if you like.' : ''; }
    }
    $('[data-for="name"]').textContent = `${draft.name.trim().length}/${LIMITS.name}`;
    $('[data-for="company"]').textContent = `${draft.company.trim().length}/${LIMITS.company}`;
    const [m, f] = pop.body.querySelectorAll('[data-k="gender"] button');
    m.textContent = `Lord · ${titleFor('m', draft.rank)}`;
    f.textContent = `Lady · ${titleFor('f', draft.rank)}`;
    m.setAttribute('aria-pressed', String(draft.gender !== 'f'));
    f.setAttribute('aria-pressed', String(draft.gender === 'f'));
    for (const k of ['primary', 'secondary', 'accent']) {
      $(`[data-sw="${k}"]`).style.background = draft[k];
      const inp = $(`input[data-k="${k}"]`);
      if (inp.value !== draft[k]) inp.value = draft[k];
    }
    pop.body.querySelectorAll('.kz-preset').forEach((b) => {
      const p = PRESETS[b.dataset.i];
      b.setAttribute('aria-pressed', String(p.primary === draft.primary && p.secondary === draft.secondary && p.accent === draft.accent));
    });
    pop.body.querySelectorAll('.kz-voice').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.v === draft.voice)));
    const title = career().displayTitle({ context: 'menu', gender: draft.gender, rankIndex: draft.rank });
    const nm = draft.name.trim() || 'Nobody';
    const display = (draft.company.trim() || nm).slice(0, LIMITS.display);
    main.querySelector('.kz-plate-name').innerHTML = `<small>${esc(display)}</small><i>${esc(title)}</i> ${esc(nm)}`;
    main.querySelector('.kz-reg').textContent = draft.registration || 'K-';
    const g = career();
    $('[data-hint="rank"]').textContent = g.lifetimePP > 0 ? `Your rank follows your career: ${g.lifetimePP.toLocaleString('en-GB')} PP banked so far.` : 'Everyone starts at the bottom of the peerage. Fly badly, rise quickly.';
    const ok = !err.name && !err.company && !err.registration;
    save.classList.toggle('dim', !ok);
  }

  let liveryTimer = 0;
  function pushLivery() {
    if (liveryTimer) return;
    liveryTimer = requestAnimationFrame(() => {
      liveryTimer = 0;
      const l = liveryOf({ ...draft, name: draft.name.trim() || 'Nobody', company: draft.company.trim() });
      preview?.setLivery(l);
    });
  }
  const change = () => { paint(); pushLivery(); };

  for (const [k, inp] of Object.entries(inputs)) {
    inp.addEventListener('input', () => {
      inp.dataset.dirty = '1';
      let v = cleanText(inp.value);
      if (k === 'registration') {
        v = v.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (!v.startsWith('K-')) v = 'K-' + v.replace(/^K?-?/, '');
        regTouched = v !== suggestReg(draft.name);
        if (inp.value !== v) inp.value = v;
      }
      draft[k] = v;
      if (k === 'name' && !regTouched) { draft.registration = suggestReg(v); inputs.registration.value = draft.registration; }
      change();
    });
    inp.addEventListener('blur', () => { draft[k] = draft[k].trim(); inp.value = draft[k]; change(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  }
  onTap($('[data-act="random"]'), () => {
    const pool = SILLY.filter((n) => n !== draft.name);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    draft.name = pick;
    inputs.name.value = pick;
    inputs.name.dataset.dirty = '1';
    if (!regTouched) draft.registration = suggestReg(pick);
    change();
  });
  pop.body.querySelectorAll('[data-k="gender"] button').forEach((b) => onTap(b, () => { draft.gender = b.dataset.v; change(); }, 'toggle'));
  pop.body.querySelectorAll('.kz-preset').forEach((b) => onTap(b, () => { const { primary, secondary, accent } = PRESETS[b.dataset.i]; Object.assign(draft, { primary, secondary, accent }); change(); }));
  pop.body.querySelectorAll('input[type=color]').forEach((inp) => inp.addEventListener('input', () => { const c = hex(inp.value); if (c) { draft[inp.dataset.k] = c; change(); } }));
  pop.body.querySelectorAll('.kz-voice').forEach((c) => {
    const pick = () => { if (draft.voice !== c.dataset.v) sound('toggle'); draft.voice = c.dataset.v; change(); };
    c.addEventListener('click', pick);
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });

  let audio = null, playingBtn = null;
  function stopSample() {
    if (audio) { audio.pause(); audio = null; }
    if (playingBtn) { playingBtn.classList.remove('playing'); playingBtn.innerHTML = `${ICON.play}Sample`; playingBtn = null; }
  }
  pop.body.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.sample;
    draft.voice = id;
    change();
    const again = playingBtn === b;
    stopSample();
    if (again) return;
    audio = new Audio(sampleUrl(id));
    try { navigator.audioSession && (navigator.audioSession.type = 'playback'); } catch (err) { /* unsupported */ }
    audio.volume = Math.max(0, Math.min(1, loadSettings().voice ?? 1));
    playingBtn = b;
    b.classList.add('playing');
    b.innerHTML = `${ICON.stop}Stop`;
    audio.addEventListener('ended', stopSample);
    audio.play().catch(stopSample);
  }));

  loadRoster().then((list) => list.forEach((v) => {
    const card = pop.body.querySelector(`.kz-voice[data-v="${v.id}"]`);
    if (!card) return;
    card.querySelector('b').textContent = v.name;
    card.querySelector('p').textContent = v.desc;
    if (v.line) card.title = `“${v.line}”`;
  }));

  let probed = false;
  function probeSamples() {
    if (probed) return;
    probed = true;
    pop.body.querySelectorAll('[data-sample]').forEach((b) => {
      fetch(sampleUrl(b.dataset.sample), { method: 'HEAD', cache: 'no-store' }).then((r) => {
        const type = r.headers.get('content-type') || '';
        if (r.ok && !type.includes('html')) { b.disabled = false; b.innerHTML = `${ICON.play}Sample`; }
      }).catch(() => {});
    });
  }

  function ensurePreview() {
    if (previewing) return previewing;
    previewing = import('./preview.js')
      .then((m) => m.createPreview(stage, liveryOf(draft)))
      .then((p) => { preview = p; stageMsg.remove(); pushLivery(); return p; })
      .catch((e) => { console.warn('[krayzee] livery preview unavailable', e); stageMsg.textContent = 'Preview unavailable'; });
    return previewing;
  }

  onTap(save, () => {
    for (const k of Object.keys(inputs)) { inputs[k].dataset.dirty = '1'; draft[k] = draft[k].trim(); }
    const err = errors();
    paint();
    if (err.name || err.company || err.registration) { sound('error'); (err.name ? inputs.name : err.company ? inputs.company : inputs.registration).focus(); return; }
    const p = saveProfile(draft);
    firstRun = false;
    pop.closable = true;
    saved = true;
    sound('confirm');
    pop.close();
    onSave?.(p);
  }, null);
  onTap(cancel, () => pop.close(), 'back');

  return {
    pop,
    open({ first = false } = {}) {
      firstRun = first;
      draft = loadProfile();
      if (first) { draft.name = ''; draft.company = ''; draft.registration = suggestReg(''); }
      regTouched = draft.registration !== suggestReg(draft.name);
      Object.values(inputs).forEach((i) => { delete i.dataset.dirty; i.value = ''; });
      pop.closable = !first;
      pop.x.style.display = first ? 'none' : '';
      cancel.style.display = first ? 'none' : '';
      pop.setTitle(first ? 'Your Pilot' : 'Hangar', first ? 'Letters patent' : 'Pilot & livery');
      save.textContent = first ? 'Take to the skies' : 'Save';
      paint();
      pop.open();
      probeSamples();
      ensurePreview().then(() => { preview?.setActive(true); pushLivery(); });
      if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => inputs.name.focus(), 350);
    },
    get firstRun() { return firstRun; },
  };
}

// Where you came from, and who you are. Runs once after the cold open and resolves with a profile.
//
// The sample exchange under the trait list is the whole reason the traits are legible: it re-runs
// through js/sim/voice.js on every toggle, so the player can see "Touchy about gender" turn a
// broker's "g'day love" into a comeback before they commit to it.

import content from '../sim/content.js';
import { newProfile, normalise, toggleTrait, rollName, getOrigin } from '../sim/profile.js';
import { runConversation } from '../sim/voice.js';
import { credits, esc, pct } from './format.js';

const CONVERSATIONS = ['yard_first', 'vosk_first', 'mutual_first'];

let root = null;
let profile = null;
let stage = 'origin';
let advanced = false;
let convo = 0;
let seed = 1;
let resolveWith = null;

export function chooseOrigin({ seed: s = Date.now() & 0xffff } = {}) {
  seed = s;
  ensureRoot();
  stage = 'origin';
  advanced = false;
  convo = 0;
  profile = null;
  draw();
  root.classList.add('live');
  requestAnimationFrame(() => root.classList.add('in'));
  return new Promise(res => { resolveWith = res; });
}

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('origin');
  if (!root) {
    root = document.createElement('div');
    root.id = 'origin';
    document.body.appendChild(root);
  }
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  return root;
}

function finish() {
  root.classList.remove('in');
  setTimeout(() => { root.innerHTML = ''; root.classList.remove('live'); }, 380);
  resolveWith?.(normalise(profile, seed));
  resolveWith = null;
}

function onInput(e) {
  const f = e.target.dataset.f;
  if (!f) return;
  profile = { ...profile, [f]: e.target.value };
  paintPreview();
}

function onClick(e) {
  const t = e.target.closest('[data-o]');
  if (!t) return;
  const a = t.dataset.o;
  if (a === 'pick') {
    profile = newProfile(t.dataset.id, seed);
    stage = 'character';
    return draw();
  }
  if (a === 'back') { stage = 'origin'; return draw(); }
  if (a === 'gender') { profile = { ...profile, gender: t.dataset.id }; return draw(); }
  if (a === 'personality') { profile = { ...profile, personality: t.dataset.id }; return draw(); }
  if (a === 'trait') { profile = toggleTrait(profile, t.dataset.id); return draw(); }
  if (a === 'advanced') { advanced = !advanced; return draw(); }
  if (a === 'reroll') {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const r = rollName(seed);
    profile = { ...profile, ...r };
    return draw();
  }
  if (a === 'cycle') { convo = (convo + 1) % CONVERSATIONS.length; return paintPreview(); }
  if (a === 'start') return finish();
}

/* ── screen one: where you came from ────────────────────────────────────── */

function originHtml() {
  const cards = content.all('origin').slice().sort((a, b) => a.order - b.order).map(o => `
    <button class="o-card" data-o="pick" data-id="${esc(o.id)}">
      <i class="o-tier">${esc(o.tier)}</i>
      <h3>${esc(o.name)}</h3>
      <p class="o-lede">${esc(o.lede)}</p>
      <ul>${o.edge.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      <div class="o-nums">
        <span><b>${esc(credits(o.start.cash))}</b><s>in hand</s></span>
        <span><b>${esc(credits(o.start.debt))}</b><s>owed</s></span>
        <span><b>${esc(pct(o.loan.interestWeekly, 1))}</b><s>a week</s></span>
        <span><b>${o.start.ships.length}</b><s>${o.start.ships.length === 1 ? 'hull' : 'hulls'}</s></span>
      </div>
    </button>`).join('');

  return `
    <div class="o-head">
      <i>Before any of that</i>
      <h2>Where did you come from?</h2>
      <p>The Reach does not care. Everyone else does.</p>
    </div>
    <div class="o-cards">${cards}</div>`;
}

/* ── screen two: who you are ────────────────────────────────────────────── */

function characterHtml() {
  const o = getOrigin(profile.origin);
  const chip = (kind, list, on) => list.map(x => `
    <button class="o-chip${on(x.id) ? ' on' : ''}" data-o="${kind}" data-id="${esc(x.id)}"
      ${x.blurb ? `title="${esc(x.blurb)}"` : ''}>${esc(x.name)}</button>`).join('');

  const full = content.traitRules.MAX_TRAITS - profile.traits.length;

  return `
    <div class="o-head tight">
      <button class="o-back" data-o="back" aria-label="Back">‹</button>
      <i>${esc(o.name)}</i>
      <h2>Who are you?</h2>
    </div>

    <div class="o-fields">
      <label class="o-field">
        <s>Name</s>
        <input data-f="name" value="${esc(profile.name)}" maxlength="28" autocomplete="off" spellcheck="false">
      </label>
      <label class="o-field">
        <s>Company</s>
        <input data-f="company" value="${esc(profile.company)}" maxlength="28" autocomplete="off" spellcheck="false">
      </label>
      <button class="o-reroll" data-o="reroll" aria-label="Roll another name">⟳</button>
    </div>

    <div class="o-row">
      <s>Gender</s>
      <div class="o-chips">${chip('gender', content.all('gender'), id => profile.gender === id)}</div>
    </div>

    <button class="o-advanced" data-o="advanced" aria-expanded="${advanced}">
      <b>Advanced</b>
      <em>${esc(personalityName())}${profile.traits.length ? ' · ' + profile.traits.length + ' traits' : ''}</em>
      <u>${advanced ? '▾' : '▸'}</u>
    </button>

    ${advanced ? `
      <div class="o-row">
        <s>Personality</s>
        <div class="o-chips">${chip('personality', content.all('personality'), id => profile.personality === id)}</div>
        <p class="o-note">${esc(content.get('personality', profile.personality)?.edge || '')}</p>
      </div>
      <div class="o-row">
        <s>Traits <em>${full > 0 ? `pick up to ${full} more` : 'full'}</em></s>
        <div class="o-chips">${chip('trait', content.all('trait'), id => profile.traits.includes(id))}</div>
      </div>` : ''}

    <div class="o-preview">
      <div class="o-preview-head">
        <s>How that sounds</s>
        <button class="o-cycle" data-o="cycle">Another ›</button>
      </div>
      <div class="o-convo"></div>
    </div>

    <div class="o-cta"><button class="o-start" data-o="start">Start</button></div>`;
}

function personalityName() {
  return content.get('personality', profile.personality)?.name || '';
}

function paintPreview() {
  const box = root.querySelector('.o-convo');
  if (!box) return;
  const p = normalise(profile, seed);
  const { npc, beats } = runConversation(CONVERSATIONS[convo], p, { rate: pct(getOrigin(p.origin).loan.interestWeekly, 1) });
  box.innerHTML = `
    <i class="o-npc">${esc(npc.name)} — ${esc(npc.role)}</i>
    ${beats.map(b => `
      <p class="o-say ${b.who}"><s>${esc(b.who === 'npc' ? npc.name : p.name)}</s>${esc(b.text)}</p>`).join('')}`;
}

function draw() {
  const keep = root.querySelector('.o-body')?.scrollTop || 0;
  root.innerHTML = `<div class="o-body">${stage === 'origin' ? originHtml() : characterHtml()}</div>`;
  if (stage === 'character') { paintPreview(); root.querySelector('.o-body').scrollTop = keep; }
}

export default { chooseOrigin };

// Title screen: wordmark over the key-art backdrop, worlds (mine/public), new world form, account.
import { h, click, toast, confirmPop, promptPop, fmtAgo } from './dom.js';
import { g } from './glyphs.js';
import { renderMinigameMenu } from '../minigames/menu.js';

const ASSETS = new URL('../../assets/', import.meta.url).href;
const ADJ = ['Glowmoss', 'Mirror', 'Solar', 'Humming', 'Lumen', 'Kelp', 'Crystal', 'Sunfilm', 'Whispering', 'Bright', 'Lattice', 'Drifting'];
const NOUN = ['Valley', 'Shore', 'Grove', 'Hollow', 'Isles', 'Reach', 'Meadow', 'Cove', 'Wilds', 'Ridge', 'Garden', 'Bay'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const randomName = () => `${pick(ADJ)} ${pick(NOUN)}`;
export const randomSeed = () => {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

export function createTitle({ store, account, onPlay, onSettings, onIntro, onMinigame }) {
  let tab = 'mine';
  let lists = { mine: [], pub: [] };
  const form = { name: randomName(), seed: randomSeed(), mode: 'survival', difficulty: 'normal', where: 'local', cheats: 'off' };

  const motes = h('canvas.sw-motes');
  const backdrop = h('div.sw-backdrop', {}, h('img', { src: ASSETS + 'intro/forest.webp', alt: '', onerror: (e) => { e.target.style.display = 'none'; } }), motes);
  const tabs = h('div.sw-tabs');
  const body = h('div.sw-panel-body');
  const panel = h('div.sw-panel.glass', {}, tabs, body);
  const hint = h('div.hint');
  const left = h('div.sw-title-left', {},
    h('div.sw-wordmark', {}, h('h1', {}, 'SYNTHWILD'), h('div.tag', {}, 'Plant your seed'), hint),
    h('div.sw-title-actions', {},
      h('button.sw-btn.glass', { onclick: () => { click(); onSettings(); } }, g('gear', 18), 'Settings'),
      h('button.sw-btn.glass', { onclick: () => { click(); onIntro(); } }, g('film', 18), 'Intro'),
      account.el));
  const el = h('div.sw-screen.sw-title', {}, backdrop, left, panel);
  // backdrop is absolutely positioned behind the grid
  backdrop.style.zIndex = '-1';
  el.style.zIndex = '0';
  el.style.isolation = 'isolate';

  function drawTabs() {
    const T = [['mine', 'My Worlds', lists.mine.length], ...(account.user ? [['pub', 'Public', lists.pub.length]] : []), ['new', 'New World', null], ['mg', 'Games', null]];
    if (tab === 'pub' && !account.user) tab = 'mine';
    tabs.replaceChildren(...T.map(([id, lb, n]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { click(); tab = id; draw(); } },
      id === 'new' ? h('span', { style: { display: 'inline-flex', gap: '5px', alignItems: 'center', color: tab === id ? '' : 'var(--teal)' } }, g('plus', 15), lb)
        : id === 'mg' ? h('span', { style: { display: 'inline-flex', gap: '5px', alignItems: 'center', color: tab === id ? '' : 'var(--gold)' } }, g('flag', 15), lb) : lb,
      n ? h('span.n', {}, ` ${n}`) : null)));
  }

  function worldRow(m, pub) {
    const thumb = h('div.thumb', m.thumbUrl ? { style: { backgroundImage: `url("${m.thumbUrl}")` } } : {}, m.thumbUrl ? null : g('sprout', 24));
    const badges = [
      h('span.badge.' + (m.mode === 'build' ? 'build' : 'surv'), {}, m.mode === 'build' ? 'Build' : 'Survival'),
      m.source === 'cloud' ? h('span.badge.cloud', {}, pub ? '@' + (m.ownerDisplay || m.owner) : 'Cloud') : h('span.badge', {}, 'This device'),
      m.public && !pub ? h('span.badge.pub', {}, 'Public') : null,
      h('span', {}, fmtAgo(m.updatedAt)),
    ];
    const acts = h('div.acts');
    if (m.mine) {
      acts.append(h('button.sw-icon-btn', { title: 'Rename', onclick: (e) => { e.stopPropagation(); rename(m); } }, g('edit', 16)));
      if (m.source === 'cloud') acts.append(h('button.sw-icon-btn', { title: m.public ? 'Make private' : 'Make public', style: m.public ? { color: '#a9c6ff', borderColor: '#a9c6ff' } : {}, onclick: (e) => { e.stopPropagation(); togglePublic(m); } }, g('globe', 16)));
      acts.append(h('button.sw-icon-btn', { title: 'Delete', onclick: (e) => { e.stopPropagation(); remove(m); } }, g('trash', 16)));
    }
    acts.append(h('button.sw-btn.primary.small', { onclick: (e) => { e.stopPropagation(); click(); onPlay(m); } }, g('play', 14), pub && !m.mine ? 'Visit' : 'Play'));
    return h('div.sw-world', { onclick: () => { click(); onPlay(m); } },
      thumb, h('div', { style: { minWidth: 0 } }, h('div.nm', {}, m.name), h('div.meta', {}, badges)), acts);
  }

  function drawWorlds(list, pub) {
    if (!list.length) {
      body.replaceChildren(h('div.sw-empty', {},
        h('span.big', {}, g('sprout', 34)),
        pub ? 'No public worlds yet. Make one of yours public with the globe button!' : 'No worlds yet. Plant your first seed!',
        h('div', { style: { marginTop: '12px' } }, !pub && h('button.sw-btn.primary', { onclick: () => { click(); tab = 'new'; draw(); } }, g('plus', 16), 'New World'))));
      return;
    }
    body.replaceChildren(...list.map((m) => worldRow(m, pub)));
  }

  function seg(key, opts) {
    const s = h('div.sw-seg', {}, opts.map(([v, lb]) => h('button', { class: form[key] === v ? 'on' : '', onclick: () => { click(); form[key] = v; drawNew(); } }, lb)));
    return s;
  }
  function drawNew() {
    const nameIn = h('input.sw-input', { value: form.name, maxLength: 48, placeholder: 'World name', oninput: (e) => { form.name = e.target.value; } });
    const seedIn = h('input.sw-input', { value: form.seed, maxLength: 32, placeholder: 'any word or number', oninput: (e) => { form.seed = e.target.value; } });
    const modeCard = (m, title, desc) => h('button.sw-mode-card', { class: form.mode === m ? 'on' : '', onclick: () => { click(); form.mode = m; drawNew(); } }, h('b', {}, title), h('span', {}, desc));
    const cloudOk = account.user && account.online;
    if (!cloudOk) form.where = 'local';
    body.replaceChildren(h('div.sw-form', {}, h('div.namesed', {},
      h('div.sw-field', {}, h('label', {}, 'Name'), h('div.row', {}, nameIn,
        h('button.sw-icon-btn', { title: 'Random name', onclick: () => { click(); form.name = randomName(); nameIn.value = form.name; } }, g('dice', 18)))),
      h('div.sw-field', {}, h('label', {}, 'Seed'), h('div.row', {}, seedIn,
        h('button.sw-icon-btn', { title: 'Roll a new seed', onclick: () => { click('select'); form.seed = randomSeed(); seedIn.value = form.seed; } }, g('dice', 18))),
        h('div.hint', {}, 'The same seed always grows the same world.'))),
      h('div.two', {},
        modeCard('survival', 'Survival', 'Gather, fabricate, keep your Charge up and get through the night.'),
        modeCard('build', 'Build', 'Every block, flying, no danger. Just create.')),
      form.mode === 'survival' && h('div.sw-field', {}, h('label', {}, 'Difficulty'),
        seg('difficulty', [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])),
      h('div.sw-field', {}, h('label', {}, 'Commands'), seg('cheats', [['off', 'Off'], ['on', 'On']]),
        h('div.hint', {}, 'On lets you type /time and /tp in this world.')),
      cloudOk && h('div.sw-field', {}, h('label', {}, 'Save to'), seg('where', [['cloud', 'Cloud'], ['local', 'This device']])),
      h('button.sw-btn.primary', { style: { marginTop: '4px', fontSize: '17px', minHeight: '46px' }, onclick: create }, g('sprout', 20), 'Plant the seed')));
  }

  async function create() {
    click();
    const name = (form.name || '').trim() || randomName();
    const seed = (form.seed || '').trim() || randomSeed();
    try {
      const meta = await store.create({ name, seed, mode: form.mode, difficulty: form.difficulty, where: form.where, cheats: form.cheats === 'on' });
      form.name = randomName(); form.seed = randomSeed();
      onPlay(meta, { fresh: true });
    } catch (e) { toast(e?.code === 'quota' ? 'You have too many worlds. Delete one first.' : 'Could not create the world: ' + (e?.message || e), { kind: 'bad', ms: 4000 }); }
  }
  async function rename(m) {
    click();
    const n = await promptPop('Rename world', m.name, 'World name', 'Rename');
    if (!n || n === m.name) return;
    try { await store.rename(m, n); toast('Renamed', { kind: 'good' }); reload(); } catch (e) { toast('Could not rename: ' + (e?.message || e), { kind: 'bad' }); }
  }
  async function remove(m) {
    click();
    const ok = await confirmPop(`Delete “${m.name}”?`, 'This world will be gone for good. This cannot be undone.', 'Delete', true);
    if (!ok) return;
    try { await store.remove(m); toast('World deleted'); reload(); } catch (e) { toast('Could not delete: ' + (e?.message || e), { kind: 'bad' }); }
  }
  async function togglePublic(m) {
    click();
    const make = !m.public;
    if (make && !(await confirmPop('Make it public?', 'Everyone who signs in can visit a copy of this world. They can’t change yours.', 'Make public'))) return;
    try { await store.patch(m, { public: make }); toast(make ? 'Now public' : 'Now private', { kind: 'good' }); reload(); } catch (e) { toast('Could not change: ' + (e?.message || e), { kind: 'bad' }); }
  }

  function draw() {
    drawTabs();
    if (tab === 'new') drawNew();
    else if (tab === 'mg') renderMinigameMenu(body, (id, o) => onMinigame?.(id, o));
    else if (tab === 'pub') drawWorlds(lists.pub, true);
    else drawWorlds(lists.mine, false);
  }
  async function reload() {
    try { lists = await store.lists(); } catch (e) { console.warn(e); }
    if (tab === 'mine' && !lists.mine.length && !el._loadedOnce) tab = 'new';
    el._loadedOnce = true;
    draw();
  }

  // drifting voxel motes
  let raf = 0;
  const parts = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), s: 2 + Math.random() * 5, v: 0.01 + Math.random() * 0.025, p: Math.random() * 6, c: Math.random() < 0.7 ? '120,255,225' : Math.random() < 0.5 ? '255,140,230' : '255,220,120' }));
  function anim(t) {
    const par = motes.parentElement;
    const w = par?.clientWidth || 0, hgt = par?.clientHeight || 0;
    if (!w) { raf = requestAnimationFrame(anim); return; }
    const dpr = Math.min(2, devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(hgt * dpr);
    if (motes.width !== bw || motes.height !== bh) { motes.width = bw; motes.height = bh; }
    const c = motes.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, hgt);
    for (const p of parts) {
      p.y -= p.v / 60; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      const a = 0.35 + 0.35 * Math.sin(t / 900 + p.p);
      const x = (p.x + Math.sin(t / 4000 + p.p) * 0.01) * w, y = p.y * hgt;
      c.save(); c.translate(x, y); c.rotate(t / 3000 + p.p);
      c.fillStyle = `rgba(${p.c},${a})`; c.shadowColor = `rgba(${p.c},1)`; c.shadowBlur = 8;
      c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); c.restore();
    }
    raf = requestAnimationFrame(anim);
  }

  return {
    el,
    reload,
    setHint(text) { hint.textContent = text || ''; },
    show(root) { root.append(el); el.classList.remove('fade-out'); cancelAnimationFrame(raf); raf = requestAnimationFrame(anim); reload(); },
    hide() { el.classList.add('fade-out'); cancelAnimationFrame(raf); setTimeout(() => el.remove(), 450); },
    openNew() { tab = 'new'; draw(); },
    openTab(t) { tab = t; el._loadedOnce = true; draw(); },
  };
}

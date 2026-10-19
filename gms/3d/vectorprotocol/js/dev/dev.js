// Dev mode (HEIRFRAME D24 pattern). Loaded ONLY by main.js's dynamic import when the URL has ?dev, so players never fetch it.
// ?dev=1 · &level=m1_l12 (straight to that level's formation screen) · &map=6 (that map) · &fresh (new dev save)
// · &god=1 / &onehit=1 · &story=1 (play story scenes; skipped by default in dev)
// The save + settings use the `_dev` key suffix (store.js), so nothing here can touch the real save.
import { data, unitDef } from '../app/data.js';
import { setSkipScenes } from '../ui/dialogue.js';
import { DEV_CSS } from './dev_css.js';

const CUR = ['credits', 'scrap', 'chips', 'arena_tokens', 'event_marks'];

let store = null;
let D = null;   // dev flags, persisted in the dev settings

const G = () => store.game;
const levels = () => G().levels();
const saveDev = () => store.setSetting('dev', { ...D });

export function prepare({ store: s, Q }) {
  store = s;
  if (Q.has('fresh')) store.reset();
  D = { god: false, oneHit: false, skipStory: true, ...(Q.has('fresh') ? {} : store.settings.dev || {}) };
  if (Q.has('god')) D.god = Q.get('god') !== '0';
  if (Q.has('onehit')) D.oneHit = Q.get('onehit') !== '0';
  if (Q.has('story')) D.skipStory = Q.get('story') === '0';
  saveDev();
  setSkipScenes(D.skipStory);

  // god / one-hit = the sim's dev cheat flags on the battle config (js/sim/battle.js: player.cheats {invulnerable, oneHit};
  // invulnerable also disables the contract timer)
  for (const k of ['startLevel', 'startArena', 'startEvent']) {
    const orig = store[k].bind(store);
    store[k] = (...a) => {
      const r = orig(...a);
      if (r.ok && (D.god || D.oneHit)) {
        r.player = { ...r.player, cheats: { invulnerable: !!D.god, oneHit: !!D.oneHit } };
      }
      return r;
    };
  }

  const lv = Q.get('level'), mp = +Q.get('map');
  if (lv && levels().some((l) => l.id === lv)) {
    openUpTo(lv);
    history.replaceState(null, '', '#/formation/' + lv);
  } else if (mp && data().maps?.[mp - 1]) {
    openUpTo(data().maps[mp - 1].levels[0].id);
    history.replaceState(null, '', '#/map/' + mp);
  }
}

// ---- save actions (every one goes through the sim where the sim has a path; direct save edits otherwise)
function ensureSquad() { if (!G().save.formation.length) G().autoFormation(); }
// a real sim clear: firstClear rewards, slots, features, chests all fire exactly like a won battle
function clearLevel(id) {
  ensureSquad();
  const r = G().startLevel(id);
  if (!r.ok) return false;
  G().completeBattle({ win: true, stars: 3, time: 1, lost: [], survivors: [], integrity: 1, stats: {} });
  return true;
}
export function openUpTo(id) {
  const L = levels();
  const i = L.findIndex((l) => l.id === id);
  let n = 0;
  for (let k = 0; k < i; k++) if (!L[k].stars && clearLevel(L[k].id)) n++;
  fillSquad();
  return n;
}
// a jump unlocks slots the old formation doesn't use yet: let the sim's auto formation fill them
function fillSquad() {
  const s = G().save;
  if (s.formation.length < Math.min(s.slots, s.units.length)) { G().autoFormation(); store.touch(); }
}
function clearAll() { let n = 0; for (const l of levels()) if (!l.stars && clearLevel(l.id)) n++; return n; }
function unlockFeatures() {
  const s = G().save;
  const keys = new Set([...Object.values(data().features || {}).flat(), ...(data().maps || []).flatMap((m) => m.levels.flatMap((l) => l.firstClear?.unlocks || []))]);
  s.features = [...new Set([...(s.features || []), ...keys])];
  s.slots = 6;
  store.touch();
}
function setCurrency(k, n) { G().save.wallet[k] = Math.max(0, Math.round(n)); store.touch(); }
function setShardsAll(n) {
  const s = G().save;
  for (const id of Object.keys(data().units || {})) s.shards[id] = Math.max(0, Math.round(n));
  store.touch();
}
const maxRankOf = (def) => data().economy?.maxRank?.[unitDef(def)?.rarity] ?? 5;
const capOf = (rank) => data().economy?.levelCapByRank?.[rank] ?? 60;
function grantUnit(def, rank, level) {
  const s = G().save;
  rank = Math.max(0, Math.min(maxRankOf(def), rank | 0));
  level = Math.max(1, Math.min(capOf(rank), level | 0));
  let u = s.units.find((x) => x.def === def);
  if (!u) { u = { uid: 'u' + s.nextUid++, def, level, xp: 0, rank, abilityLevels: { attack: 1, passive: 1, overdrive: 1 }, obtained: Date.now() }; s.units.push(u); }
  else Object.assign(u, { rank, level, xp: 0 });
  store.touch();
  return u;
}
function maxOwned() {
  for (const u of G().save.units) { u.rank = maxRankOf(u.def); u.level = capOf(u.rank); u.xp = 0; u.abilityLevels = { attack: 5, passive: 5, overdrive: 5 }; }
  store.touch();
}

// ---- panel
export function attach({ router, toast, Q }) {
  if (!document.getElementById('vpdev-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'vpdev-css', textContent: DEV_CSS }));
  const app = document.getElementById('app');
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.flat().filter((k) => k != null)); return e; };
  const button = (label, fn, cls = '') => el('button', { type: 'button', className: cls, onclick: (e) => { e.stopPropagation(); fn(e); } }, label);
  const say = (t) => toast(t, 'gold', 1.6);

  const badge = button('DEV', () => toggle(), 'vpdev-badge');
  badge.setAttribute('aria-label', 'Dev panel');
  const panel = el('div', { className: 'vpdev' });
  app.append(badge, panel);
  let open = false, mapSel = 1;
  const toggle = (v = !open) => { open = v; panel.classList.toggle('show', open); badge.classList.toggle('open', open); if (open) render(); };
  const reflect = () => badge.classList.toggle('god', !!(D.god || D.oneHit));
  reflect();

  function jump(id) {
    const n = openUpTo(id);
    toggle(false);
    if (n) say('Cleared ' + n + ' contract' + (n > 1 ? 's' : ''));
    router.go('/formation/' + id);
  }
  const reroute = () => { if (!/^#\/battle/.test(location.hash)) router.reload(); };

  function render() {
    const s = G().save;
    const maps = data().maps || [];
    const m = maps[mapSel - 1];
    const L = levels();
    const sec = (title, ...kids) => el('section', {}, el('h3', {}, title), ...kids);
    const row = (...kids) => el('div', { className: 'row' }, ...kids);
    const toggleBtn = (label, key, after) => button(label + (D[key] ? ' ON' : ' off'), () => { D[key] = !D[key]; saveDev(); after?.(); reflect(); render(); }, D[key] ? 'on' : '');

    const lvBtns = m.levels.map((l) => {
      const st = L.find((x) => x.id === l.id);
      const b = button((l.boss ? 'BOSS ' : '') + (l.node ?? l.id.split('_l')[1]), () => jump(l.id), (l.boss ? 'boss ' : '') + (st?.stars ? 'done' : st?.unlocked ? 'here' : ''));
      b.title = l.id + ' · ' + l.name;
      return b;
    });
    const curIn = CUR.map((k) => {
      const inp = el('input', { type: 'number', min: 0, value: s.wallet[k] || 0, inputMode: 'numeric' });
      inp.addEventListener('change', () => { setCurrency(k, +inp.value || 0); say(k + ' = ' + inp.value); });
      return el('label', { className: 'cur' }, el('span', {}, k.replace('_', ' ')), inp);
    });
    const shardIn = el('input', { type: 'number', min: 0, value: 200, inputMode: 'numeric' });
    const unitSel = el('select', {}, ...['scifi', 'fantasy'].map((realm) => el('optgroup', { label: realm },
      Object.values(data().units || {}).filter((u) => (u.realm || 'scifi') === realm)
        .map((u) => el('option', { value: u.id }, u.name + ' · ' + u.rarity + ' ' + u.role + (s.units.some((x) => x.def === u.id) ? ' (owned)' : ''))))));
    const rankIn = el('input', { type: 'number', min: 0, max: 5, value: 0, inputMode: 'numeric' });
    const lvlIn = el('input', { type: 'number', min: 1, max: 60, value: 10, inputMode: 'numeric' });
    const speed = store.settings.speed || 1;

    panel.replaceChildren(
      el('div', { className: 'top' }, el('b', {}, 'DEV MODE'), el('small', {}, store.saveKey), button('Close', () => toggle(false))),
      sec('Jump to contract',
        row(...maps.map((mp, i) => button(String(i + 1), () => { mapSel = i + 1; render(); }, (i + 1 === mapSel ? 'on' : '') + (mp.realm === 'fantasy' ? ' fantasy' : '')))),
        el('div', { className: 'stat' }, m.name + ' · ' + m.realm + ' · ' + m.levels.length + ' levels (earlier ones are cleared through the sim)'),
        row(...lvBtns),
        row(button('Open map ' + mapSel, () => { openUpTo(m.levels[0].id); toggle(false); router.go('/map/' + mapSel); }),
          button('Chapters', () => { toggle(false); router.go('/chapters'); }), button('Hub', () => { toggle(false); router.go('/hub'); }))),
      sec('Unlock',
        row(button('Clear every level', () => { const n = clearAll(); say('Cleared ' + n); render(); reroute(); }),
          button('All features + 6 slots', () => { unlockFeatures(); say('Features unlocked'); render(); reroute(); }),
          button('Reset dev save', () => { store.reset(); say('Dev save reset'); render(); router.go('/hub'); }, 'danger'))),
      sec('Currencies', el('div', { className: 'curs' }, curIn),
        row(button('Max all', () => { for (const k of CUR) G().save.wallet[k] = 999999; store.touch(); render(); reroute(); }),
          el('label', { className: 'cur' }, el('span', {}, 'shards (every unit)'), shardIn),
          button('Set shards', () => { setShardsAll(+shardIn.value || 0); say('Shards set'); reroute(); }))),
      sec('Units',
        row(unitSel),
        row(el('label', { className: 'cur' }, el('span', {}, 'rank'), rankIn), el('label', { className: 'cur' }, el('span', {}, 'level'), lvlIn),
          button('Grant / set', () => { const u = grantUnit(unitSel.value, +rankIn.value, +lvlIn.value); say(unitDef(u.def).name + ' R' + u.rank + ' Lv' + u.level); render(); reroute(); }, 'on')),
        row(button('Grant every unit', () => { for (const id of Object.keys(data().units || {})) if (!s.units.some((x) => x.def === id)) grantUnit(id, 0, 1); say('All units granted'); render(); reroute(); }),
          button('Max owned (rank, level, abilities)', () => { maxOwned(); say('Roster maxed'); render(); reroute(); }))),
      sec('Battle',
        row(toggleBtn('God mode', 'god'), toggleBtn('One-hit kills', 'oneHit')),
        el('div', { className: 'stat' }, 'Applies at the next battle start. God = your squad takes no damage and the contract timer is off; One-hit = your hits kill.'),
        row(el('span', { className: 'lbl' }, 'Speed'), ...[1, 2, 4].map((v) => button('×' + v, () => {
          store.setSetting('speed', v);
          window.__vp.hud?.setSpeed?.(v);   // live in a running battle
          render();
        }, v === speed ? 'on' : '')))),
      sec('Tutorials',
        row(button('Skip all hints', () => {
          const seen = { ...(store.settings.hintsSeen || {}) };
          for (const k of ['formation', 'overdrive', 'barracks', 'collection', 'levelup']) seen[k] = true;
          store.setSetting('hintsSeen', seen); store.setSetting('hints', false); store.markIntroSeen(); say('Hints off'); render();
        }, store.settings.hints === false ? 'on' : ''),
        toggleBtn('Skip story scenes', 'skipStory', () => setSkipScenes(D.skipStory)))),
      el('div', { className: 'stat' }, 'URL: ?dev=1&level=m1_l12 · &map=6 · &god=1 · &onehit=1 · &fresh · &story=1'));
  }

  if (Q.has('panel')) toggle(true);
  return { open: () => toggle(true), close: () => toggle(false), jump, openUpTo, clearLevel, clearAll, unlockFeatures, setCurrency, setShardsAll, grantUnit, maxOwned, flags: D };
}

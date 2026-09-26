export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = n => Math.round(n).toLocaleString('en-US');

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(r).padStart(2, '0')}`;
}

export function createBus() {
  const map = new Map();
  return {
    on(n, fn) { if (!map.has(n)) map.set(n, new Set()); map.get(n).add(fn); return () => map.get(n)?.delete(fn); },
    off(n, fn) { map.get(n)?.delete(fn); },
    emit(n, ...a) {
      for (const fn of map.get(n) || []) { try { fn(...a); } catch (e) { console.error('[ui]', n, e); } }
      for (const fn of map.get('*') || []) { try { fn(n, ...a); } catch (e) { console.error(e); } }
    },
  };
}

export const RARITY = {
  list: [
    { key: 'scrap', name: 'Scrap', color: '#8e959f' },
    { key: 'standard', name: 'Standard', color: '#eef2f7' },
    { key: 'tuned', name: 'Tuned', color: '#4be08a' },
    { key: 'custom', name: 'Custom', color: '#3fa9ff' },
    { key: 'prototype', name: 'Prototype', color: '#b46cff' },
    { key: 'relic', name: 'Relic', color: '#ff9a2e' },
    { key: 'heirloom', name: 'Heirloom', color: '#ffd36b' },
  ],
  legendary: 5,
  get(r) {
    if (typeof r === 'number') return this.list[clamp(r | 0, 0, this.list.length - 1)];
    const k = String(r ?? '').toLowerCase();
    return this.list.find(x => x.key === k || x.id === k || x.name.toLowerCase() === k) || this.list[1];
  },
  index(r) { return this.list.indexOf(this.get(r)); },
};

export const STAT_LABELS = {
  hp: 'Hull', armor: 'Armor', shield: 'Shield', energy: 'Energy', energyRegen: 'Energy Regen', enRegen: 'Energy Regen',
  shieldRegen: 'Shield Regen', moveSpeed: 'Speed', movePct: 'Move Speed', critChance: 'Crit Chance', critDmg: 'Crit Damage',
  weaponDamage: 'Weapon Dmg', power: 'Power', damage: 'Damage', evasion: 'Evasion', regen: 'Regen', detectMult: 'Detection',
  dodgeCd: 'Dodge CD', cooldown: 'Cooldown', cdr: 'Cooldown Red.', thorns: 'Thorns', lootLuck: 'Loot Luck', resist: 'Resist',
  stealth: 'Stealth', hack: 'Hacking', range: 'Range', fireRate: 'Fire Rate', pierce: 'Armor Pierce', skillDmg: 'Skill Dmg',
  fr: 'Frame Rating',
};
export const LOWER_IS_BETTER = new Set(['cooldown', 'dodgeCd', 'detectMult', 'mass']);
const PCT = new Set(['critChance', 'critDmg', 'movePct', 'evasion', 'enRegen', 'shieldRegen', 'thorns', 'lootLuck', 'resist', 'cdr', 'skillDmg', 'detectMult', 'crit']);
export const SLOTS = ['chassis', 'core', 'weapon', 'optics', 'mobility', 'chip'];

export function statLabel(k) {
  return STAT_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

export function fmtStat(k, v) {
  if (typeof v !== 'number') return String(v);
  if (PCT.has(k) || (/pct$/i.test(k))) return `${Math.round(v * 100)}%`;
  if (k === 'dodgeCd' || k === 'cooldown') return `${+v.toFixed(1)}s`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function haptic(ms = 8) {
  if (store.settings.haptics && navigator.vibrate && navigator.userActivation?.hasBeenActive) try { navigator.vibrate(ms); } catch {}
}

const SETTINGS_KEY = 'heirframe:settings';
const DEFAULT_SETTINGS = { quality: 'high', music: 0.7, sfx: 0.8, voice: 0.9, subtitles: true, joystick: 'left', haptics: true };

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export const store = {
  settings: loadSettings(),
  saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {} },
};

export const cssUrl = name => new URL(`../../css/${name}.css`, import.meta.url).href;

export function onTap(el, fn) {
  el.addEventListener('click', e => { e.stopPropagation(); fn(e); });
  return el;
}

const banner = { busy: 0, q: [] };
export function centerBanner(fn, ms) {
  const run = () => { banner.busy = performance.now() + ms; fn(); setTimeout(() => { const n = banner.q.shift(); n && n(); }, ms); };
  if (performance.now() < banner.busy) banner.q.push(run); else run();
}

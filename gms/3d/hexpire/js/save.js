// localStorage persistence: settings, story progress, custom maps, resume slot.
const NS = 'hexpire.';

function get(k, fallback) {
  try { const v = localStorage.getItem(NS + k); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function set(k, v) {
  try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* storage full/blocked */ }
}

export const Settings = {
  data: get('settings', {
    sound: true, music: true, fastAI: false, showHints: true,
    empireName: 'Your Empire', colorIdx: 0,
  }),
  save() { set('settings', this.data); },
};

export const Progress = {
  data: get('progress', { completed: [] }),
  isDone(id) { return this.data.completed.includes(id); },
  markDone(id) {
    if (!this.isDone(id)) { this.data.completed.push(id); set('progress', this.data); }
  },
  reset() { this.data = { completed: [] }; set('progress', this.data); },
};

export const CustomMaps = {
  list() { return get('customs', []); },
  save(map) {
    const all = this.list().filter(m => m.id !== map.id);
    all.unshift(map);
    set('customs', all.slice(0, 40));
  },
  remove(id) { set('customs', this.list().filter(m => m.id !== id)); },
  byId(id) { return this.list().find(m => m.id === id); },
};

export const Resume = {
  store(payload) { set('resume', payload); },
  load() { return get('resume', null); },
  clear() { try { localStorage.removeItem(NS + 'resume'); } catch {} },
};

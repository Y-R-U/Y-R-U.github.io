// The voice list has to be the one the Characters tab offers, so it is that list — js/dev/chars/
// belongs to the character agent and this is a read-only adapter onto it, not a second copy that
// can drift.

import { VOICES as CATALOGUE, LANGS } from '../chars/voices.js';

export const VOICES = CATALOGUE.map(v => v.id);

export const isEnglish = id => !!CATALOGUE.find(v => v.id === id)?.english;

export function voiceInfo(id) {
  const v = CATALOGUE.find(x => x.id === id);
  return {
    id,
    lang: LANGS[id?.[0]]?.label || 'Other',
    gender: v?.sex || (id?.[1] === 'f' ? 'f' : id?.[1] === 'm' ? 'm' : 'x'),
    name: v?.label || (id || '').slice(3),
    english: !!v?.english,
    note: v?.note || '',
  };
}

export const voiceLabel = id => {
  const v = voiceInfo(id);
  return `${v.name} ${v.gender === 'f' ? '♀' : '♂'} — ${v.note || v.lang} (${id})`;
};

// English up front; the other 26 go behind a toggle, because a picker with 54 entries is not one.
export function voiceGroups() {
  const by = pred => {
    const m = new Map();
    for (const v of CATALOGUE.filter(pred)) {
      const k = LANGS[v.lang]?.label || v.lang;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(v.id);
    }
    return [...m];
  };
  return { english: by(v => v.english), other: by(v => !v.english) };
}

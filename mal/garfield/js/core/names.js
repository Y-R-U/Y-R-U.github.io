// Player-chosen character names (D2): subtitles/UI use them; voiced lines that speak a name
// switch to a name-free alternate take (<key>_nn) when a custom name is set.
export function createNames(save, audio) {
  const n = {
    get garfield() { return save.data.settings.names?.garfield || 'Garfield'; },
    get jon() { return save.data.settings.names?.jon || 'Jon'; },
    get custom() { return n.garfield !== 'Garfield' || n.jon !== 'Jon'; },
    set(names) { save.data.settings.names = { ...save.data.settings.names, ...names }; save.write(); },
    apply(text) {
      if (!text) return text;
      text = String(text).replace(/\{garfield\}/gi, n.garfield).replace(/\{jon\}/gi, n.jon);
      if (!n.custom) return text;
      return text.replace(/\bGarfield\b/g, n.garfield).replace(/\bJon\b/g, n.jon);
    },
    voKey(key) {
      if (!n.custom) return key;
      const lines = audio?.voLines;
      return lines && lines[key + '_nn'] ? key + '_nn' : key;
    },
  };
  return n;
}

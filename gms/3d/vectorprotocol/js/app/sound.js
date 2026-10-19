// Thin wrapper over the audio agent's js/audio/audio.js (loaded lazily through modules.js, D19):
// every call is a no-op until the module has loaded, so screens can call snd.* unconditionally.
import { load } from './modules.js';

let A = null;
export const audioReady = load('audio').then((m) => { A = m?.audio || m?.default || null; return A; });

export const snd = {
  get on() { return !!A; },
  sfx(name, opts) { try { A?.sfx(name, opts); } catch (e) { /* audio is optional */ } },
  sting(name, opts) { try { return A?.sting(name, opts); } catch (e) { return null; } },
  forBattle(info) { try { return A?.forBattle(info) || null; } catch (e) { return null; } },
  getVolumes() { return A?.getVolumes?.() || null; },
  setVolumes(v) { A?.setVolumes?.(v); },
  mute(on) { A?.mute?.(on); },
  get muted() { return !!A?.muted; },
};

// The dramatisation disclaimer over the shell in flight — C6 owns this file. C7 must not
// reimplement it; call `caption.forShot(...)` from the turn hand-off and nothing else.
//
// D2 fixes the wording: "Positions dramatised" every time, and the long form "Ship and impact
// positions are dramatised." exactly ONCE per match, the first time a shell is followed. The brief
// asks for it to be as short as language allows; two words is the floor that is still honest.
//
// It also shows on the first shot of each new ordnance kind (BUILD_PLAN §7.4) — forty showings is
// half the cinematic fatigue on its own.

import { CINE } from '../config.js';

export const SHORT = 'Positions dramatised';
export const LONG = 'Ship and impact positions are dramatised.';

export function createCaption(mount) {
  const el = document.createElement('div');
  el.className = 'caption';
  el.setAttribute('aria-live', 'polite');
  mount.appendChild(el);

  const seen = new Set();
  let longShown = false;
  let timer = 0;
  let track = null;      // () → Vector3 | null, the world point to sit above

  const api = {
    el,

    shouldShow(turn, kind = 'shell') { return turn <= 1 || !seen.has(kind); },

    // The one call C7 makes. Returns the text shown, or null if this shot does not warrant one.
    forShot(turn, kind = 'shell') {
      if (!api.shouldShow(turn, kind)) return null;
      const text = longShown ? SHORT : LONG;
      longShown = true;
      return api.show(turn, kind, text) ? text : null;
    },

    show(turn, kind = 'shell', text = SHORT) {
      if (!api.shouldShow(turn, kind)) return false;
      seen.add(kind);
      el.textContent = text;
      el.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('on'), CINE.caption.ms);
      return true;
    },

    // Sit above a world point — the shell — instead of at the stylesheet's fixed band. Inline
    // styles only, so C7 still owns every other property of `.caption` in style.css.
    follow(getWorldPos) { track = getWorldPos || null; if (!track) api.unfollow(); },

    unfollow() { track = null; el.style.left = el.style.top = el.style.transform = ''; },

    // Called from the director pump. Cheap: one project() while a caption is on screen.
    update(camera) {
      if (!track || !el.classList.contains('on')) return;
      const p = track();
      if (!p) return;
      const v = p.clone().project(camera);
      if (v.z > 1) { el.style.opacity = '0'; return; }
      el.style.opacity = '';
      const x = (v.x * 0.5 + 0.5) * 100;
      // above the shell, then held inside the frame: a caption clipped by the top edge reads worse
      // than one that has stopped tracking
      const y = Math.min(88, Math.max(9, (-v.y * 0.5 + 0.5) * 100 - 7));
      el.style.left = `${Math.min(84, Math.max(16, x))}%`;
      el.style.top = `${y}%`;
      el.style.transform = 'translate(-50%, -50%)';
    },

    hide() { clearTimeout(timer); el.classList.remove('on'); },

    // New match. The long form is owed again.
    reset() { seen.clear(); longShown = false; api.unfollow(); api.hide(); },
  };

  return api;
}

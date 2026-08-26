// Title / attract. Live AI dogfight behind, big PLAY, small edge buttons, first-tap arm.

import { el, btn, coinChip } from '../widgets.js';
import { cash } from '../units.js';
import { startAttract, stopAttract } from '../attract.js';
import { nextLevel, totalStars, maxStars, getMoney } from '../model.js';
import { buzz } from '../prefs.js';
import { goFullscreen as go, autoFullscreenDevice } from '../../core/fullscreen.js';

let armed = false;   // module-level: only ever prompt for the first tap once per load
let armEl = null;

export function mount(root, ctx) {
  const { data, save } = ctx;
  const stage = el('div.attract-stage');
  root.appendChild(stage);
  startAttract(stage);

  const next = nextLevel(save, data.LEVELS);
  const stars = totalStars(save, data.LEVELS);
  const starMax = maxStars(data.LEVELS);

  root.appendChild(el('div.title-tl', {},
    coinChip(ctx),
    el('div.chip.stars', {}, el('span.star-dot'), el('span', {}, `${stars}/${starMax}`))
  ));

  root.appendChild(el('div.title-tr', {},
    btn('icon ghost hangar', '', () => ctx.go('hangar'), { aria: 'Hangar' }),
    btn('icon ghost cog', '', () => ctx.go('settings', { from: 'title' }), { aria: 'Settings' })
  ));

  root.appendChild(el('div.title-mid', {},
    el('div.logo', {},
      el('h1.logo-word', {}, 'SKYHAMMER'),
      el('div.logo-rule'),
      el('div.logo-sub', {}, 'DAWN PATROL · 1940')
    ),
    btn('play', el('span.play-inner', {},
      el('span.play-label', {}, 'PLAY'),
      el('span.play-sub', {}, next ? `${next.id.toUpperCase()} · ${next.name}` : 'Campaign')
    ), () => {
      if (next) ctx.go('brief', { levelId: next.id, mode: 'story' });
      else ctx.go('levelselect');
    })
  ));

  root.appendChild(el('div.title-bl', {},
    btn('edge', 'MODES', () => ctx.go('modeselect')),
    btn('edge', 'MISSIONS', () => ctx.go('levelselect'))
  ));

  root.appendChild(el('div.title-br', {},
    btn('edge event', el('span', {}, el('span.ev-dot'), 'EVENT'), () => ctx.go('modeselect', { focus: 'event' })),
    btn('edge', 'HANGAR', () => ctx.go('hangar'))
  ));

  root.appendChild(el('div.title-foot', {}, `${cash(getMoney(save))} banked · tap PLAY to fly`));

  // The boot overlay's TAP TO START already unlocked audio, so a second "tap anywhere" prompt on
  // top of the title screen is just noise. Only ask when nothing has taken a gesture yet.
  if (!armed && !(ctx.audio && ctx.audio.ready)) {
    armEl = el('div.arm', {}, el('div.arm-inner', {}, 'TAP ANYWHERE TO BEGIN'));
    const arm = (e) => {
      e.preventDefault();
      armed = true;
      buzz(14);
      try { ctx.audio && ctx.audio.unlock && ctx.audio.unlock(); } catch { /* no audio yet */ }
      goFullscreen();
      if (armEl) { armEl.classList.add('out'); const n = armEl; armEl = null; setTimeout(() => n.remove(), 300); }
    };
    armEl.addEventListener('pointerdown', arm, { once: true });
    root.appendChild(armEl);
  }
}

export function unmount() {
  stopAttract();
  armEl = null;
}

/**
 * Desktop never takes fullscreen unasked (Aaron's ruling) — it gets the chip and the pause-screen
 * button instead. This only fires on phones and tablets, where the browser chrome eats a third of
 * a landscape screen and there is no window to resize.
 */
function goFullscreen() {
  if (!autoFullscreenDevice()) return;
  go(document.documentElement);
}

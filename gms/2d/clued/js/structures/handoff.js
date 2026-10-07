import { h, onKey } from '../ui/kit.js?v=202610071629';
import { sfx } from '../ui/fx.js?v=202610071629';

// Full-screen "pass the phone" / round card. Resolves when tapped.
export function handoff(host, { kicker = 'Pass to', name = '', sub = '', icon = '', button = "I'm ready", cls = '' } = {}) {
  return new Promise(resolve => {
    const btn = h('button.btn.primary.big', { type: 'button', dataset: { act: 'ready' } }, button);
    const box = h('div.handoff', { class: cls },
      icon ? h('div.ri-ico', { style: { fontSize: '72px' } }, icon) : null,
      kicker ? h('div.muted', {}, kicker) : null,
      h('div.ho-name', {}, name),
      sub ? h('div.ho-score', { html: sub }) : null,
      btn);
    const play = host.querySelector('.play') || host;
    play.append(box);
    sfx('join');
    const done = () => { off(); box.remove(); resolve(); };
    const off = onKey(e => { if (e.key === 'Enter' || e.key === ' ') { done(); return true; } });
    btn.addEventListener('click', done);
    setTimeout(() => btn.focus({ preventScroll: true }), 50);
  });
}

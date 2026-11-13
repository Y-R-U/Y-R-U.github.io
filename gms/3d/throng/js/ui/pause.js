import { h, UI_ICON } from './kit.js';

// Practice: a real pause. sim-online: the match keeps running and your crowd goes on autopilot.
export function createPause({ root, app, onResume, onLeave }) {
  const el = h(`<section class="screen pause hidden">
    <div class="pz-card">
      <div class="pz-t"></div>
      <div class="pz-s"></div>
      <button type="button" class="btn btn-primary pz-go">${UI_ICON.play} RESUME</button>
      <div class="pz-snd">
        <label class="tg"><span>Music</span><input type="checkbox" data-k="music"><i></i></label>
        <label class="tg"><span>Sound effects</span><input type="checkbox" data-k="sfx"><i></i></label>
      </div>
      <button type="button" class="btn btn-ghost pz-leave">LEAVE MATCH</button>
    </div>
  </section>`);
  root.appendChild(el);
  const leave = el.querySelector('.pz-leave');
  let armed = 0;
  el.querySelector('.pz-go').addEventListener('click', () => { app.audio.ui(); onResume(); });
  el.querySelectorAll('input').forEach((c) => c.addEventListener('change', () => {
    app.save.settings[c.dataset.k] = c.checked; app.persist(); app.applySettings();
  }));
  leave.addEventListener('click', () => {
    if (!armed) {
      leave.classList.add('armed');
      leave.textContent = el.classList.contains('rated') ? 'TAP AGAIN: COUNTS AS LAST' : 'TAP AGAIN TO LEAVE';
      armed = setTimeout(reset, 3000);
      return;
    }
    reset();
    onLeave();
  });
  function reset() { clearTimeout(armed); armed = 0; leave.classList.remove('armed'); leave.textContent = 'LEAVE MATCH'; }
  window.addEventListener('keydown', (e) => {
    if (!el.classList.contains('hidden') && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) { e.preventDefault(); onResume(); }
  });

  return {
    show({ online, away = 0, rated = online }) {
      reset();
      el.classList.toggle('online', online);
      el.classList.toggle('rated', !!rated);
      el.querySelector('.pz-t').textContent = online ? 'AUTOPILOT' : 'PAUSED';
      el.querySelector('.pz-s').textContent = online
        ? (away >= 1 ? `You were away ${Math.round(away)} s. The match kept going and autopilot steered your crowd.` : 'The match is live: autopilot is steering your crowd until you resume.')
        : 'Practice is paused.';
      el.querySelectorAll('input').forEach((c) => { c.checked = !!app.save.settings[c.dataset.k]; });
      el.classList.remove('hidden');
    },
    hide() { reset(); el.classList.add('hidden'); },
    get open() { return !el.classList.contains('hidden'); },
  };
}

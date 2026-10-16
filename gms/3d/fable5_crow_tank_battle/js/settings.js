// Settings popup, opened from the title screen's ⚙️ button: sound, volume, auto-fire,
// full screen, the br8t account and the shared bug/idea row. Sound, volume and auto-fire
// live in f5mr.settings.v1 like the rest of the settings (career.js does the try/catch).

const $ = (id) => document.getElementById(id);

function row(label, sub, control) {
  const r = document.createElement('div');
  r.className = 'set-row';
  const l = document.createElement('div');
  l.className = 'set-label';
  l.textContent = label;
  let small = null;
  if (sub !== null) {
    small = document.createElement('small');
    small.textContent = sub || '';
    l.appendChild(small);
  }
  r.append(l, control);
  return { r, small };
}

function toggle(on, onFlip, labels = ['ON', 'OFF']) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-toggle';
  const paint = (v) => { b.textContent = v ? labels[0] : labels[1]; b.classList.toggle('on', v); };
  paint(on);
  b.addEventListener('click', () => paint(onFlip()));
  return b;
}

/** deps: { AudioFX, ui, aim, saveSettings, loadSettings, noCloud } */
export function openSettings(deps) {
  const { AudioFX, ui, aim, saveSettings, loadSettings, noCloud } = deps;
  const body = $('settings-body');
  body.textContent = '';

  const sound = toggle(!AudioFX.muted, () => {
    AudioFX.init();
    AudioFX.setMuted(!AudioFX.muted);
    ui.updateMuteBtn(AudioFX.muted);
    return !AudioFX.muted;
  });
  sound.dataset.set = 'sound';
  body.appendChild(row('SOUND', null, sound).r);

  const vol = document.createElement('input');
  vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '5';
  vol.className = 'set-range';
  vol.setAttribute('aria-label', 'Volume');
  vol.value = String(Math.round((loadSettings().volume ?? 1) * 100));
  vol.addEventListener('input', () => { AudioFX.init(); AudioFX.setVolume(+vol.value / 100); });
  body.appendChild(row('VOLUME', null, vol).r);

  const af = toggle(aim.autoFire, () => {
    aim.autoFire = !aim.autoFire;
    saveSettings({ autoFire: aim.autoFire });
    ui.setAutoFireUI(aim.autoFire);
    return aim.autoFire;
  });
  body.appendChild(row('AUTO-FIRE', 'Shoots whenever your lock is lined up', af).r);

  const d = document.documentElement;
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    const fs = toggle(inFs(), () => {
      try {
        const p = inFs()
          ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
          : (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
        p?.catch?.(() => {});
      } catch { /* not allowed here */ }
      return !inFs();
    });
    fs.dataset.set = 'fullscreen';
    body.appendChild(row('FULL SCREEN', null, fs).r);
  }

  // Account and feedback need the shared layer, which ?test/?auto/?shot keep out.
  if (!noCloud) {
    const acct = document.createElement('button');
    acct.type = 'button';
    acct.className = 'btn-toggle';
    acct.textContent = 'ACCOUNT';
    acct.dataset.set = 'account';
    acct.addEventListener('click', () => $('br8t-account')?.shadowRoot?.querySelector('.fab')?.click());
    const a = row('BR8T ACCOUNT', 'Carry your career between devices', acct);
    body.appendChild(a.r);
    import('/lib/auth/auth.js').then((m) => m.auth.ready().then(() => {
      const paint = (u) => {
        const inn = u && !u.anon;
        a.small.textContent = inn ? `Signed in as ${u.name || u.email || 'you'}` : 'Playing as guest: sign in to keep your career';
        acct.textContent = inn ? 'ACCOUNT' : 'SIGN IN';
      };
      paint(m.auth.user);
      m.auth.onChange((u) => { if (a.r.isConnected) paint(u); });
    })).catch(() => a.r.remove());

    const fb = row('BUG OR IDEA?', '', document.createElement('span'));
    body.appendChild(fb.r);
    import('/lib/feedback/feedback.js')
      .then((m) => fb.r.lastChild.replaceWith(m.feedbackButton({ game: 'murderroyale', className: 'btn-toggle', label: 'SEND', signedOutLabel: 'SIGN IN', note: fb.small, accent: '#c2603a' })))
      .catch(() => fb.r.remove());
  }

  $('settings-popup').classList.remove('hidden');
}

export function closeSettings() {
  $('settings-popup').classList.add('hidden');
}

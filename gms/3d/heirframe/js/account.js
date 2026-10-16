// The shared br8t account (/lib/auth). Aaron: the avatar shows on the title screen and while
// Settings is open, never during play. No cloud saves yet (follow-up): this is sign-in only,
// which the feedback row in Settings needs.

const shown = () => !!(document.querySelector('.hf-scr.hf-title:not(.out)')
  || document.querySelector('.hf-panel.show[data-panel="settings"]'));

export function mountBr8tAccount() {
  return import('/lib/auth/ui.js').then(({ mountAccount }) => {
    mountAccount({ gameId: 'heirframe', accent: '#e8c45a', nudge: 'callout', canPester: shown, pesterHoldMs: 6000 });
    const host = document.getElementById('br8t-account');
    const root = document.documentElement;
    let last = null;
    const sync = () => {
      const on = shown();
      if (on === last) return;
      last = on;
      if (host) host.style.display = on ? '' : 'none';
      // Corner furniture only needs to make room while the avatar is actually there.
      root.style.setProperty('--br8t-account-space', on ? '52px' : '0px');
    };
    sync();
    setInterval(sync, 250);
    return true;
  });
}

export function signedIn() {
  return import('/lib/auth/auth.js').then(m => m.auth.ready().then(() => m.auth));
}

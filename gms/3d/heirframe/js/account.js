// The shared br8t account (/lib/auth). Aaron: the avatar shows on the title screen and while
// Settings is open, never during play. Signed-in players also get the main save slot mirrored to
// their account (cloud_sync.js decides; this file is the browser glue and the inline chooser).

import { createCloudSync, revOf, describe } from './cloud_sync.js';

const SAVE_KEY = 'heirframe.save.main';
const META_KEY = 'heirframe.cloud.v1';
const ADOPTED = 'heirframe.cloud.adopted';
const TICK = 2500;

const shown = () => !!(document.querySelector('.hf-scr.hf-title:not(.out)')
  || document.querySelector('.hf-panel.show[data-panel="settings"]'));

// Test hooks never reach the cloud, whatever main.js does.
const NO_CLOUD = ['auto', 'test', 'nocloud', 'noui', 'shot', 'dev'];
const cloudAllowed = () => {
  const Q = new URLSearchParams(location.search);
  return !NO_CLOUD.some((k) => Q.has(k) && Q.get(k) !== '0');
};

export function mountBr8tAccount() {
  // Started first: on a new device, the sooner the account save lands the likelier the title shows it without a reload.
  if (cloudAllowed()) startCloudSave().catch((e) => console.warn('cloud save unavailable', e));
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

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
};
const readMeta = () => { try { return JSON.parse(ls.get(META_KEY)) || {}; } catch (e) { return {}; } };

async function startCloudSave() {
  const [{ auth }, { cloud }] = await Promise.all([import('/lib/auth/auth.js'), import('/lib/auth/cloud.js')]);
  const slot = cloud.game('heirframe');
  let meta = readMeta(), seenText, adoptedText = null, statusText = '', choice = null, later = false, nagged = false;
  const keepMeta = (m) => { meta = { ...meta, ...m }; ls.set(META_KEY, JSON.stringify(meta)); };

  // The local save's "when", for the chooser: stamped the first time this page sees a new revision.
  function local() {
    const text = ls.get(SAVE_KEY);
    if (text !== seenText) {
      seenText = text;
      const rev = revOf(text);
      if (rev !== meta.rev) keepMeta({ rev, at: rev && 'rev' in meta ? Date.now() : 0 });   // first sighting: age unknown
    }
    return { text, base: meta.base || null, owner: meta.owner || null, at: meta.at || 0 };
  }

  const io = {
    local,
    now: () => Date.now(),
    read: (uid) => slot.loadForUser(uid),
    write: (uid, doc, expected) => slot.saveForUser(uid, doc, expected),
    setBase: (base, owner) => keepMeta({ base, owner }),
    status: (s) => { statusText = s; },
    conflict: (c) => { choice = c; later = false; nagged = false; paint(); },
    adopt(doc, uid, chosen) {
      const G = window.__game?.runtime;
      if (G?.sim && !chosen) return false;   // never swap the save under a live session unasked
      try { if (!chosen && sessionStorage.getItem(ADOPTED) === doc.revision) return false; sessionStorage.setItem(ADOPTED, doc.revision); } catch (e) { /* private mode */ }
      const prev = ls.get(SAVE_KEY);
      if (prev && prev !== doc.text) ls.set(SAVE_KEY + '.bak', prev);   // this device's save stays as the backup
      ls.set(SAVE_KEY, doc.text);
      seenText = doc.text;
      keepMeta({ rev: doc.revision, at: doc.savedAt || Date.now(), base: doc.revision, owner: uid });
      // Still booting: the title reads storage when it appears. Otherwise restart onto the new save.
      if (window.__game) {
        if (G?.sim) G.sim.noAutosave = true;
        adoptedText = doc.text;
        setTimeout(() => location.reload(), 50);
      }
      return true;
    },
  };
  const engine = createCloudSync(io);
  window.__hfCloud = { get status() { return statusText; }, engine };

  // --- inline chooser: a corner callout on the title and in Settings, never a modal
  const box = document.createElement('div');
  box.id = 'hf-cloud-choice';
  const css = document.createElement('style');
  css.textContent = `
#hf-cloud-choice { position: fixed; left: var(--pad-l, 14px); top: var(--pad-t, 10px); z-index: 30; box-sizing: border-box; width: min(360px, calc(100vw - 28px));
  padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255, 210, 122, .45); background: var(--glass-solid, rgba(7, 18, 36, .92));
  box-shadow: 0 10px 28px -10px #000; color: var(--ink, #eef8ff); font: 500 13px/1.35 var(--font-u, system-ui, sans-serif); display: none; }
#hf-cloud-choice.inline { position: static; width: auto; margin: 4px 0 8px; }
#hf-cloud-choice.inline .later { display: none; }
#hf-cloud-choice b.h { display: block; font: 400 11px/1.3 var(--font-d, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--gold, #ffd27a); margin-bottom: 6px; }
#hf-cloud-choice p { margin: 2px 0; color: var(--ink-dim, #cfe3f5); }
#hf-cloud-choice p em { font-style: normal; color: var(--ink, #fff); font-weight: 700; }
#hf-cloud-choice .r { display: flex; gap: 8px; margin-top: 9px; align-items: center; }
#hf-cloud-choice .hf-btn { min-height: 36px; padding: 0 10px; font-size: 11px; letter-spacing: .06em; flex: 1; white-space: nowrap; }
#hf-cloud-choice .later { flex: none; background: none; border: 0; color: var(--ink-faint, #9ab); font: inherit; padding: 6px; cursor: pointer; }
#hf-cloud-choice small { display: block; margin-top: 6px; color: var(--ink-faint, #9ab); font-size: 11.5px; }`;
  box.innerHTML = '<div class="body"></div>';
  document.head.append(css);
  document.body.append(box);
  const body = box.querySelector('.body');
  const HEAD = {
    newer: 'Your account has newer progress', owner: "This device has another account's save",
    lineage: 'A different game is on your account', diverged: 'Two saves with progress',
  };
  function paint() {
    if (!choice) { body.textContent = ''; box.style.display = 'none'; return; }
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    body.innerHTML = `<b class="h">${HEAD[choice.why] || HEAD.diverged}</b>
      <p>This device: <em>${esc(describe(choice.local.sum, choice.local.at))}</em></p>
      <p>Account: <em>${esc(describe(choice.remote.sum, choice.remote.at))}</em></p>
      <div class="r"><button class="hf-btn" data-c="local">Keep this device</button><button class="hf-btn primary" data-c="remote">Use account</button><button class="later">Later</button></div>
      <small>The one you don't pick is kept as a backup.</small>`;
    body.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      body.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      void engine.choose(b.dataset.c);
    }));
    body.querySelector('.later').addEventListener('click', () => { later = true; show(); });
    show();
  }
  // Title: a corner callout. Settings: inline under the account row, so it never covers a control.
  function show() {
    const row = document.querySelector('.hf-panel.show[data-panel="settings"] .st-acct')?.closest('.st-row');
    if (row && box.previousElementSibling !== row) row.after(box);
    else if (!row && box.parentElement !== document.body) document.body.append(box);
    box.classList.toggle('inline', !!row);
    box.style.display = choice && (row || (!later && shown())) ? 'block' : 'none';
  }

  // --- wiring
  const uidOf = (u) => (u && !u.anon ? u.uid : null);
  auth.onChange((u) => { if (uidOf(u) !== engine.uid) void engine.connect(uidOf(u)); });
  void auth.ready().then((u) => { if (!engine.uid && uidOf(u)) void engine.connect(uidOf(u)); else if (!uidOf(u)) io.status('Saved on this device. Sign in to carry it to other devices.'); });
  addEventListener('online', () => { if (engine.uid && !engine.ready && !engine.conflict) void engine.connect(engine.uid); });
  const away = () => {
    if (adoptedText && ls.get(SAVE_KEY) !== adoptedText) ls.set(SAVE_KEY, adoptedText);   // a late autosave lost the race
    void engine.flush(true);
  };
  addEventListener('pagehide', away);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); });
  setInterval(() => {
    show();
    if (choice && !nagged && !shown() && window.__game?.runtime?.sim) {
      nagged = true;
      window.__game.ui?.toast?.('Cloud save needs a choice', 'info', { sub: 'Open Settings to pick which progress to keep', ms: 5000 });
    }
    if (!adoptedText) void engine.flush();
  }, TICK);
}

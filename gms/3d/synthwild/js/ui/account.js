// Account area on the title: username login, admin Google sign-in, admin player list.
import { h, click, toast, confirmPop } from './dom.js';
import { g } from './glyphs.js';

const LINK_HELP = 'Ask Aaron for a one-time admin sign-in link instead. It works in any browser, including on iPhone.';

export const msg = (e) => ({
  not_found: "We couldn't find that name. Ask a grown-up to add it.",
  rate_limited: 'Too many tries. Wait a moment and try again.',
  forbidden: 'That Google account is not one of the admins.',
  popup: 'The Google window was blocked. ' + LINK_HELP,
  google_failed: 'Google sign-in did not work here. ' + LINK_HELP,
  cancelled: 'Sign-in was cancelled.',
  corrupt: "This world's save is damaged and can't be opened.",
  busy: 'The server is busy. Try again in a moment.',
  offline: 'The world server is not reachable right now.',
  conflict: 'That name is already taken.',
  bad_request: 'Names are 3–20 letters, numbers or _.',
}[e?.code] || e?.message || 'Something went wrong.');

export function createAccount(getApi, onChange) {
  let user = null, online = false;
  const el = h('div.sw-account');
  addEventListener('online', () => { if (!online) refresh(); });

  async function refresh() {
    const api = getApi();
    online = !!api && (await api.available().catch(() => false));
    user = online ? await api.me().catch(() => null) : null;
    draw();
    onChange?.(user, online);
  }

  function draw() {
    if (!online) {
      el.replaceChildren(h('div.sw-account-chip.glass.off', { title: 'Worlds are saved in this browser' },
        h('span.dot'), h('span', {}, 'Playing offline'), h('span', { style: { width: '6px' } })));
      return;
    }
    if (!user) {
      el.replaceChildren(h('button.sw-btn.glass', { onclick: login }, g('user', 18), 'Sign in'));
      return;
    }
    el.replaceChildren(h('div.sw-account-chip.glass', {},
      h('span.dot'), h('span', {}, user.display || user.username),
      user.admin && h('button.sw-icon-btn', { title: 'Manage players', onclick: adminPanel }, g('shield', 16)),
      h('button.sw-icon-btn', { title: 'Sign out', onclick: logout }, g('exit', 16))));
  }

  async function login() {
    const api = getApi();
    click();
    api.prepareAdminSignIn?.().catch(() => {});
    const field = h('input.sw-input', { placeholder: 'player name', maxLength: 20, autocomplete: 'off', spellcheck: false, autocapitalize: 'off' });
    const err = h('p', { style: { color: '#ff9aa8', margin: '0 0 10px', minHeight: '1.2em', fontSize: '13px' } });
    const close = () => scrim.remove();
    const go = async () => {
      const n = field.value.trim().toLowerCase();
      if (!n) return;
      try {
        user = await api.login(n);
        close();
        toast(`Welcome, ${user.display || user.username}!`, { kind: 'good' });
        await refresh();
      } catch (e) { err.textContent = msg(e); }
    };
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') close(); e.stopPropagation(); });
    const card = h('div.sw-pop.glass', {},
      h('h3', {}, 'Sign in'),
      h('p', {}, 'Type your player name to see your cloud worlds and everyone’s public worlds.'),
      field, err,
      h('div.sw-pop-btns', { style: { alignItems: 'center' } },
        h('a', { href: '#', style: { marginRight: 'auto', fontSize: '13px', color: 'var(--ink-3)' }, onclick: (e) => { e.preventDefault(); close(); adminLogin(); } }, 'Admin? Sign in with Google'),
        h('button.sw-btn', { onclick: close }, 'Cancel'),
        h('button.sw-btn.primary', { onclick: go }, 'Sign in')));
    const scrim = h('div.sw-scrim', { onpointerdown: (e) => { if (e.target === scrim) close(); } }, card);
    document.querySelector('.sw-root .sw-layer')?.append(scrim);
    setTimeout(() => field.focus(), 30);
  }
  async function adminLogin() {
    const api = getApi();
    try {
      user = await api.adminGoogleSignIn();
      toast(`Signed in as admin ${user.username}`, { kind: 'good' });
      await refresh();
    } catch (e) { toast(msg(e), { kind: 'bad', ms: 8000 }); }
  }
  async function logout() {
    const api = getApi();
    click();
    if (!(await confirmPop('Sign out?', 'Your cloud worlds stay safe on the server.', 'Sign out'))) return;
    try { await api.logout(); } catch {}
    user = null; await refresh();
  }

  async function adminPanel() {
    const api = getApi();
    click();
    const list = h('div', { style: { maxHeight: '46vh', overflowY: 'auto', margin: '8px 0' } });
    const name = h('input.sw-input', { placeholder: 'new player name', maxLength: 20, autocomplete: 'off', style: { marginBottom: 0 } });
    const disp = h('input.sw-input', { placeholder: 'shown to others as, e.g. Sam', maxLength: 32, autocomplete: 'off', style: { marginBottom: 0 } });
    const close = () => scrim.remove();
    async function load() {
      list.replaceChildren(h('div.sw-empty', {}, 'Loading…'));
      try {
        const users = await api.admin.listUsers();
        list.replaceChildren(...users.map((u) => h('div.sw-world', { style: { gridTemplateColumns: '1fr auto', cursor: 'default' } },
          h('div', {}, h('div.nm', {}, u.display || u.username, u.adminEmail ? '  ★' : ''),
            h('div.meta', {}, h('span', {}, '@' + u.username), h('span', {}, `${u.worlds ?? 0} worlds`))),
          u.adminEmail ? h('span.badge', {}, 'admin') : h('button.sw-icon-btn', { title: 'Remove', onclick: () => remove(u) }, g('trash', 16)))));
        if (!users.length) list.replaceChildren(h('div.sw-empty', {}, 'No players yet.'));
      } catch (e) { list.replaceChildren(h('div.sw-empty', {}, msg(e))); }
    }
    async function remove(u) {
      if (!(await confirmPop(`Remove ${u.username}?`, 'They will not be able to sign in. Their worlds are kept but hidden.', 'Remove', true))) return;
      try { await api.admin.removeUser(u.username); toast('Removed ' + u.username); load(); } catch (e) { toast(msg(e), { kind: 'bad' }); }
    }
    async function add() {
      const n = name.value.trim().toLowerCase();
      if (!n) return;
      try { await api.admin.addUser(n, disp.value.trim()); name.value = ''; disp.value = ''; toast('Added ' + n, { kind: 'good' }); load(); }
      catch (e) { toast(msg(e), { kind: 'bad' }); }
    }
    const card = h('div.sw-pop.glass', { style: { width: 'min(520px, 94vw)' } },
      h('h3', {}, 'Players'),
      h('p', { style: { marginBottom: '6px' } }, 'Anyone on this list can sign in with just their name.'),
      h('p.sw-hint', { style: { marginBottom: '6px', fontSize: '13px', color: '#ffd27a' } }, 'Usernames work like passwords — pick ones that are hard to guess (e.g. sam_tiger42), and give each a separate display name. Other players only ever see the display name.'),
      list,
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' } },
        name, disp, h('button.sw-btn.primary', { onclick: add }, g('plus', 16), 'Add')),
      h('div.sw-pop-btns', { style: { marginTop: '12px' } }, h('button.sw-btn', { onclick: close }, 'Close')));
    const scrim = h('div.sw-scrim', { onpointerdown: (e) => { if (e.target === scrim) close(); } }, card);
    document.querySelector('.sw-root .sw-layer')?.append(scrim);
    load();
  }

  return { el, refresh, get user() { return user; }, get online() { return online; } };
}

import { auth } from '/lib/auth/auth.js';
import { cloud } from '/lib/auth/cloud.js';
import { mountAccount, matchCompleted } from '/lib/auth/ui.js';
import { onSave, KEY, DEFAULT } from './save.js';
import { SaveSync } from './save-sync.js';

export function connectCloud({ canPester, adopt, status, conflict }) {
  const slot = cloud.game('ragdojo');
  const metaKey = 'ragdojo.sync.v1';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  let meta = read(metaKey, {});
  let current = { revision: meta.revision || crypto.randomUUID(), owner: meta.owner || null, save: read(KEY, null) };
  const keepMeta = () => { try { localStorage.setItem(metaKey, JSON.stringify({ revision: current.revision, owner: current.owner })); } catch {} };
  const sync = new SaveSync({
    local: () => current,
    empty: () => ({ revision: crypto.randomUUID(), owner: auth.user?.uid, save: DEFAULT() }),
    safe: () => new Promise(resolve => {
      if (canPester()) { resolve(); return; }
      const timer = setInterval(() => { if (canPester()) { clearInterval(timer); resolve(); } }, 250);
    }),
    read: uid => slot.loadForUser(uid),
    write: async (uid, data, revision) => {
      await slot.saveForUser(uid, { ...data, owner: uid }, revision);
      if (current.revision === data.revision) { current = { ...current, owner: uid }; keepMeta(); }
    },
    adopt: data => {
      current = data; keepMeta();
      try { localStorage.setItem(KEY, JSON.stringify(data.save)); } catch {}
      adopt(data.save);
    }, status, conflict,
  });
  keepMeta();
  onSave(save => { current = { revision: crypto.randomUUID(), owner: current.owner, save: structuredClone(save) }; keepMeta(); sync.changed(); });
  // The shared avatar owns sign-in only; SaveSync owns all Ragdojo save decisions.
  mountAccount({ nudge: 'callout', canPester });
  auth.onChange(u => {
    const uid = u && !u.anon ? u.uid : null;
    if (uid !== sync.uid) void sync.connect(uid);
  });
  void auth.ready().then(u => { if (!sync.uid) void sync.connect(u && !u.anon ? u.uid : null); });
  setInterval(() => { if (canPester()) void sync.flush(); }, 2500);
  addEventListener('online', () => void sync.connect(sync.uid));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void sync.flush(); });
  return { auth, sync, matchCompleted: () => matchCompleted('ragdojo') };
}

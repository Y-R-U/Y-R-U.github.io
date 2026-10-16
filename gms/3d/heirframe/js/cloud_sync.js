// Cloud copy of the main save slot, per br8t account. Pure: no DOM, no Firebase, so node can test it
// (tools/sim/cloudsync.mjs). account.js supplies the io. Modelled on Ragdojo's SaveSync, plus a three-way
// check so a device that simply played on since its last sync fast-forwards instead of asking.
//
// Revisions are content hashes of the raw save text, so two devices holding the same bytes agree for free.
// `base` is the cloud revision this device last matched: local moved off it = local is ahead, the cloud
// moved off it = the cloud is ahead, both moved = a real conflict, and the player picks.
import { hashString } from './sim/rng.js';
import { deserialize } from './sim/save.js';

export const MIN_GAP = 30000;        // never write more often than this
export const IDLE_PUSH = 300000;     // playtime-only changes still go up every 5 minutes

export const WRITE_DEBOUNCE = 2500;  // /lib/auth/cloud.js's floor, which even a forced flush respects

export const revOf = (text) => { if (!text) return null; const h = hashString(text); return `${h[0].toString(36)}${h[1].toString(36)}-${text.length}`; };

export function summarize(text) {
  if (!text) return null;
  let s;
  try { s = deserialize(text); } catch (e) { return null; }
  const p = s.player || {}, st = s.stats || {};
  return {
    seed: String(s.seed ?? ''), name: p.name || 'Wren', gen: p.generation || 1, level: p.level || 1,
    playSeconds: Math.round(s.playSeconds || 0), credits: s.credits || 0, contracts: st.contractsDone || 0,
    progress: JSON.stringify([p.generation, p.level, p.xp, p.legacyEver, s.credits, st.contractsDone, st.kills, s.story?.mission,
      s.districts?.unlocked?.length, s.frames?.length, s.stash?.length]),
  };
}

export const played = (sum) => !!sum && (sum.level > 1 || sum.gen > 1 || sum.contracts > 0 || sum.playSeconds >= 120);

export function describe(sum, at) {
  if (!sum) return 'No save';
  const h = sum.playSeconds / 3600;
  const time = h >= 1 ? `${h.toFixed(1)} h` : `${Math.max(1, Math.round(sum.playSeconds / 60))} min`;
  const gen = sum.gen > 1 ? ` · Gen ${sum.gen}` : '';
  const when = at ? ` · ${new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : '';
  return `${sum.name} · Level ${sum.level}${gen} · ${time}${when}`;
}

// io: local() → { text, base, owner, at }, read(uid) → doc|null (throws offline), write(uid, doc, expectedRev),
// adopt(doc, uid, chosen) → bool (false = a session is live, so ask instead), setBase(rev, uid), status(msg), conflict(c|null),
// now() → ms. A cloud doc is { revision, owner, savedAt, text, prev? }.
export function createCloudSync(io) {
  const sync = {
    uid: null, ready: false, conflict: null, writing: false, gen: 0,
    remoteRev: null, pushedProgress: null, lastWrite: 0, lastPushAt: 0,
    async connect(uid) {
      const gen = ++sync.gen;
      sync.uid = uid; sync.ready = false; sync.conflict = null; io.conflict(null);
      if (!uid) { io.status('Saved on this device. Sign in to carry it to other devices.'); return 'local'; }
      io.status('Checking your account…');
      let remote;
      try { remote = await io.read(uid); } catch (e) { if (gen === sync.gen) io.status('Cloud unavailable. Progress is saved on this device.'); return 'offline'; }
      if (gen !== sync.gen) return 'stale';
      return sync.reconcile(uid, remote, gen);
    },
    async reconcile(uid, remote, gen) {
      const loc = io.local(), lrev = revOf(loc.text), rrev = remote?.revision || null;
      const lsum = summarize(loc.text), rsum = summarize(remote?.text);
      const lp = played(lsum), rp = played(rsum);
      sync.remoteRev = rrev;
      const ask = (why) => {
        sync.conflict = { why, local: { sum: lsum, at: loc.at }, remote: { sum: rsum, at: remote.savedAt, doc: remote } };
        io.status('Two saves found: choose one.');
        io.conflict(sync.conflict);
        return 'conflict';
      };
      const mine = loc.owner === uid;
      let verdict;
      if (lrev && lrev === rrev) verdict = 'same';
      else if (!rsum) verdict = lsum ? 'push' : 'same';   // empty or unreadable account copy
      else if (!lsum) verdict = 'adopt';
      // a New Game started here must not quietly replace the account's played save
      else if (mine && loc.base === rrev) { if (rp && lsum.seed !== rsum.seed) return ask('lineage'); verdict = 'push'; }
      else if (mine && loc.base === lrev) verdict = 'adopt';
      else if (!lp) verdict = 'adopt';
      else if (!rp) verdict = 'push';
      else return ask(loc.owner && !mine ? 'owner' : lsum.seed !== rsum.seed ? 'lineage' : 'diverged');

      if (verdict === 'adopt') {
        if (!io.adopt(remote, uid)) return ask('newer');
        sync.remoteRev = rrev; io.setBase(rrev, uid);
        sync.pushedProgress = rsum.progress; sync.lastPushAt = io.now();
      } else if (verdict === 'push') {
        try { await io.write(uid, sync.doc(loc.text, uid, remote?.prev), rrev); }
        catch (e) { if (gen === sync.gen) io.status('Cloud unavailable. Progress is saved on this device.'); return 'offline'; }
        if (gen !== sync.gen) return 'stale';
        sync.wrote(loc.text, lsum, uid);
      } else {
        if (lrev) io.setBase(lrev, uid);
        sync.pushedProgress = lsum?.progress ?? null; sync.lastPushAt = io.now();
      }
      sync.ready = true;
      io.status('Cloud save on.');
      return verdict;
    },
    doc(text, uid, prev) {
      const d = { revision: revOf(text), owner: uid, savedAt: io.now(), text };
      if (prev) d.prev = prev;
      return d;
    },
    wrote(text, sum, uid) {
      sync.remoteRev = revOf(text); sync.pushedProgress = sum?.progress ?? null;
      sync.lastWrite = sync.lastPushAt = io.now();
      io.setBase(sync.remoteRev, uid);
    },
    // force: the tab is going away, so skip the "meaningful" test (never the conflict or the gap on a failing cloud).
    async flush(force = false) {
      if (!sync.uid || !sync.ready || sync.conflict || sync.writing) return 'idle';
      const loc = io.local(), rev = revOf(loc.text);
      if (!rev || rev === sync.remoteRev) return 'idle';
      const t = io.now();
      if (t - sync.lastWrite < (force ? WRITE_DEBOUNCE : MIN_GAP)) return 'wait';
      const sum = summarize(loc.text);
      if (!sum) return 'idle';
      if (!force && sum.progress === sync.pushedProgress && t - sync.lastPushAt < IDLE_PUSH) return 'wait';
      const uid = sync.uid, gen = sync.gen;
      sync.writing = true; sync.lastWrite = t;
      try {
        const remote = await io.read(uid);
        if (gen !== sync.gen) return 'stale';
        const rrev = remote?.revision || null;
        if (rrev !== sync.remoteRev) {
          // another device saved since we last looked: reconcile again (it fast-forwards or asks)
          sync.ready = false;
          return await sync.reconcile(uid, remote, gen);
        }
        await io.write(uid, sync.doc(loc.text, uid, remote?.prev), rrev);
        if (gen !== sync.gen) return 'stale';
        sync.wrote(loc.text, sum, uid);
        io.status('Cloud save on.');
        return 'pushed';
      } catch (e) {
        if (gen === sync.gen) io.status('Cloud unavailable. Progress is saved on this device.');
        return 'offline';
      } finally { sync.writing = false; }
    },
    async choose(which) {
      const c = sync.conflict, uid = sync.uid, gen = sync.gen;
      if (!c || !uid) return 'idle';
      try {
        if (which === 'remote') {
          if (!io.adopt(c.remote.doc, uid, true)) return 'idle';
          sync.remoteRev = c.remote.doc.revision; io.setBase(sync.remoteRev, uid);
        } else {
          const text = io.local().text;
          const prev = c.remote.doc?.text ? { text: c.remote.doc.text, savedAt: c.remote.doc.savedAt, revision: c.remote.doc.revision } : c.remote.doc?.prev;
          await io.write(uid, sync.doc(text, uid, prev), c.remote.doc?.revision || null);
          if (gen !== sync.gen) return 'stale';
          sync.wrote(text, summarize(text), uid);
        }
        sync.conflict = null; sync.ready = true;
        io.conflict(null); io.status('Cloud save on.');
        return which;
      } catch (e) {
        // the cloud moved again (or went away): look afresh rather than retry a stale compare-and-swap
        io.status('Could not sync. Both saves are still safe.');
        void sync.connect(uid);
        return 'retry';
      }
    },
  };
  return sync;
}

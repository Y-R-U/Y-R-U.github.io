// br8t games — per-game cloud save on top of the shared auth layer.
//
// Layout:  users/{uid}                     profile (display bits, last seen)
//          users/{uid}/games/{gameId}      one document per game per player
//
// The account is shared across every game on the hub; progress is not. Adding a
// game later is a new gameId and nothing else — no schema change, no migration.
//
//   import { cloud } from "/lib/auth/cloud.js";
//   const slot = cloud.game("racketeer");
//   const remote = await slot.load();       // { data, updatedAt } | null
//   slot.save(saveObject);                  // debounced, fire-and-forget
//   await slot.flush();                     // force pending write out now

import { auth } from "./auth.js";
import { firebaseConfig, SDK } from "./config.js";

const WRITE_DEBOUNCE = 2500;   // games call persist() on every point; batch them
const SYNCED = id => `br8t_synced_${id}`;   // when this game last reached the server

let db = null;
let dbP = null;
let mod = null;

async function getDB() {
  if (db) return { db, mod };
  if (!dbP) {
    dbP = (async () => {
      const [app, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const application = app.getApps().length ? app.getApp() : app.initializeApp(firebaseConfig);
      mod = fs;
      db = fs.getFirestore(application);
      return { db, mod };
    })();
  }
  return dbP;
}

class Slot {
  constructor(gameId) {
    this.gameId = gameId;
    this._pending = null;
    this._timer = null;
    this._inflight = null;
  }

  async _doc() {
    const u = await auth.ready();
    if (!u) return null;
    const { db, mod } = await getDB();
    return mod.doc(db, "users", u.uid, "games", this.gameId);
  }

  // Returns { data, updatedAt } or null when this player has no cloud save yet.
  // Never throws — a failed read means "no cloud save", and the local one stands.
  async load() {
    try {
      const ref = await this._doc();
      if (!ref) return null;
      const { mod } = await getDB();
      const snap = await mod.getDoc(ref);
      if (!snap.exists()) return null;
      const d = snap.data();
      return { data: d.data ?? null, updatedAt: d.updatedAt?.toMillis?.() ?? 0 };
    } catch (e) {
      console.warn(`[cloud:${this.gameId}] load failed`, e);
      return null;
    }
  }

  // Debounced write. Safe to call as often as the game calls persist().
  save(data) {
    this._pending = data;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), WRITE_DEBOUNCE);
  }

  async flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._pending === null) return;
    const data = this._pending;
    this._pending = null;
    this._inflight = (async () => {
      try {
        const ref = await this._doc();
        if (!ref) return;
        const { mod } = await getDB();
        // NOT { merge: true }. Firestore's merge recurses into nested maps, so a
        // save written over another one blends the two instead of replacing it:
        // a key the player has cleared can never go away, and two devices end up
        // sharing one Frankenstein document. Racketeer lost a career this way —
        // the overwriting save's `skills` came back carrying the other device's
        // levels. The document only ever holds these three fields, so writing it
        // whole is both correct and complete.
        await mod.setDoc(ref, {
          data,
          gameId: this.gameId,
          updatedAt: mod.serverTimestamp(),
        });
        // Only after the write resolves, so the panel can never claim a save
        // that never left the device. Kept in localStorage so it survives the
        // reload an adopt causes.
        try { localStorage.setItem(SYNCED(this.gameId), String(Date.now())); } catch (e) { /* private mode */ }
      } catch (e) {
        console.warn(`[cloud:${this.gameId}] save failed`, e);
      }
    })();
    return this._inflight;
  }
}

// Decide what a device should do at boot with its local save and the account's:
// "adopt" the cloud one, "push" the local one, or "keep" and say nothing.
//
// Recency alone is not enough, and trusting it cost a real career. A device
// opening a game for the FIRST time builds a blank save and the game persists it
// during boot, stamping it with the current time — newer than the account's real
// progress by definition. "Newest wins" then pushes the blank save over
// everything the player has done, on every device, silently.
//
// Two rules keep that from happening:
//   - `ourStamp` must be the stamp the save had ON DISK AT STARTUP, never one a
//     boot-time persist has just rewritten. Callers are responsible for this.
//   - Emptiness outranks recency. A save nobody has played never wins, whichever
//     side it is on and however new it looks.
export function pickSave({ ourStamp = 0, theirStamp = 0, oursPlayed = true, theirsPlayed = true }) {
  if (theirsPlayed && !oursPlayed) return "adopt";
  if (oursPlayed && !theirsPlayed) return "push";
  if (theirStamp > ourStamp) return "adopt";
  if (ourStamp > theirStamp) return "push";
  return "keep";
}

const slots = new Map();

export const cloud = {
  game(gameId) {
    if (!slots.has(gameId)) slots.set(gameId, new Slot(gameId));
    return slots.get(gameId);
  },

  // When this game last reached the server, or 0 if it never has. For display
  // only — nothing reconciles against it.
  lastSync(gameId) {
    try { return Number(localStorage.getItem(SYNCED(gameId)) || 0); } catch (e) { return 0; }
  },

  // "Local and the account agree as of now." A write marks itself, but adopting
  // the cloud save — or a reconcile that finds the two already identical — means
  // the same thing without anything being sent, and the panel should say so
  // rather than claim there is nothing saved.
  markSynced(gameId) {
    try { localStorage.setItem(SYNCED(gameId), String(Date.now())); } catch (e) { /* private mode */ }
  },

  // Touch the profile doc so the account panel and any future "your games"
  // listing have something to read. Best-effort; failure is silent.
  async touchProfile() {
    try {
      const u = await auth.ready();
      if (!u || u.anon) return;
      const { db, mod } = await getDB();
      await mod.setDoc(mod.doc(db, "users", u.uid), {
        name: u.name ?? null,
        email: u.email ?? null,
        photo: u.photo ?? null,
        lastSeen: mod.serverTimestamp(),
      }, { merge: true });
    } catch (e) { console.warn("[cloud] profile touch failed", e); }
  },
};

// Nothing is worse than losing the last match because the tab closed mid-debounce.
addEventListener("pagehide", () => { for (const s of slots.values()) s.flush(); });
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") for (const s of slots.values()) s.flush();
});

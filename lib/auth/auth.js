// br8t games — shared auth layer.
//
// The ONLY module (besides cloud.js) that imports Firebase. Game code imports
// this and never touches the SDK, so swapping the backend later is a two-file job.
//
//   import { auth } from "/lib/auth/auth.js";
//   await auth.ready();            // every visitor has a uid by here
//   auth.user                      // { uid, anon, name, photo, email, providers }
//   auth.onChange(u => ...)        // fires on every state change, incl. first
//
// Everything is lazy: the SDK is only fetched when ready() is first called, and
// if it fails to load (offline, blocked) the module degrades to a null user
// rather than throwing. Games must keep working signed-out.

import { firebaseConfig, SDK } from "./config.js";

const LAST_EMAIL = "br8t_auth_email";     // for completing an email-link sign-in
const HINT_SEEN  = "br8t_auth_hint_seen"; // has the sign-in hint pulse been shown

let fb = null;          // { app, auth, mod } once loaded
let current = null;     // normalised user, or null
let readyP = null;
let pendingConflict = null;   // an AccountConflict raised before any UI existed
const listeners = new Set();

/* ---------------------------------------------------------- SDK bootstrap */

async function loadSDK() {
  if (fb) return fb;
  const [app, a] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const application = app.initializeApp(firebaseConfig);
  fb = { app: application, auth: a.getAuth(application), mod: a };
  return fb;
}

function normalise(u) {
  if (!u) return null;
  const providers = u.providerData.map(p => p.providerId);
  return {
    uid: u.uid,
    anon: u.isAnonymous,
    name: u.displayName || null,
    email: u.email || null,
    photo: u.photoURL || null,
    providers,
  };
}

function emit() {
  for (const fn of listeners) { try { fn(current); } catch (e) { console.warn("[auth] listener", e); } }
}

/* --------------------------------------------------------------- lifecycle */

// Resolves once auth state has settled — signing in anonymously if nobody is
// signed in, so every visitor has a stable uid to hang progress off.
function init() {
  if (readyP) return readyP;
  readyP = (async () => {
    let sdk;
    try {
      sdk = await loadSDK();
    } catch (e) {
      console.warn("[auth] SDK unavailable — running signed out", e);
      current = null; emit();
      return null;
    }
    const { mod, auth: a } = sdk;

    await new Promise(res => {
      let first = true;
      mod.onAuthStateChanged(a, u => {
        current = normalise(u);
        emit();
        if (first) { first = false; res(); }
      });
    });

    // An email-link landing takes priority over creating a throwaway anon user.
    try {
      await completeEmailLink();
    } catch (e) {
      // A conflict here can't be resolved before the UI exists — park it for
      // mountAccount() to pick up and put in front of the player.
      if (e instanceof AccountConflict) pendingConflict = e;
      else console.warn("[auth] email link", e);
    }

    if (!current) {
      try { await mod.signInAnonymously(a); } catch (e) { console.warn("[auth] anon sign-in failed", e); }
    }
    return current;
  })();
  return readyP;
}

/* ------------------------------------------------------------- conflicts */

// Thrown by signInGoogle()/completeEmailLink() when the account being linked
// already exists elsewhere (the player has a save on another device). Carries
// everything the UI needs to show both sides and let the player choose.
export class AccountConflict extends Error {
  constructor(credential, localUid) {
    super("This account already exists on another device.");
    this.name = "AccountConflict";
    this.credential = credential;
    this.localUid = localUid;
  }
  // Sign in as the pre-existing account, discarding the anonymous one.
  // Callers copy any local progress across BEFORE or AFTER per the player's choice.
  async adopt() {
    const { mod, auth: a } = await loadSDK();
    const anon = a.currentUser;
    const res = await mod.signInWithCredential(a, this.credential);
    // The orphaned anonymous user is unreachable now — bin it rather than leaving litter.
    if (anon && anon.isAnonymous && anon.uid !== res.user.uid) {
      try { await mod.deleteUser(anon); } catch (e) { /* already gone / needs recent login */ }
    }
    return normalise(res.user);
  }
}

/* ------------------------------------------------------------ sign-in ops */

// Upgrade the anonymous account to Google, preserving the uid. If the player
// already has a Google account here, throws AccountConflict.
export async function signInGoogle() {
  const { mod, auth: a } = await loadSDK();
  const provider = new mod.GoogleAuthProvider();
  const u = a.currentUser;
  if (u && u.isAnonymous) {
    try {
      const res = await mod.linkWithPopup(u, provider);
      return normalise(res.user);
    } catch (e) {
      if (e.code === "auth/credential-already-in-use" || e.code === "auth/email-already-in-use") {
        const cred = mod.GoogleAuthProvider.credentialFromError(e);
        throw new AccountConflict(cred, u.uid);
      }
      throw e;
    }
  }
  const res = await mod.signInWithPopup(a, provider);
  return normalise(res.user);
}

// Passwordless email. Sends a link back to this exact page; the reply is picked
// up automatically on next load by completeEmailLink().
export async function sendEmailLink(email) {
  const { mod, auth: a } = await loadSDK();
  await mod.sendSignInLinkToEmail(a, email, {
    url: location.href,
    handleCodeInApp: true,
  });
  try { localStorage.setItem(LAST_EMAIL, email); } catch (e) { /* private mode */ }
}

// If the current URL is an email sign-in link, complete it. No-op otherwise.
export async function completeEmailLink() {
  const { mod, auth: a } = await loadSDK();
  if (!mod.isSignInWithEmailLink(a, location.href)) return null;

  let email = null;
  try { email = localStorage.getItem(LAST_EMAIL); } catch (e) { /* private mode */ }
  // Link opened on a different device — we have to ask for the address again.
  if (!email) email = window.prompt("Confirm the email address you requested the link with:");
  if (!email) return null;

  const u = a.currentUser;
  const cred = mod.EmailAuthProvider.credentialWithLink(email, location.href);
  try {
    let res;
    if (u && u.isAnonymous) res = await mod.linkWithCredential(u, cred);
    else res = await mod.signInWithEmailLink(a, email, location.href);
    cleanLinkFromURL();
    try { localStorage.removeItem(LAST_EMAIL); } catch (e) { /* ignore */ }
    return normalise(res.user);
  } catch (e) {
    if (e.code === "auth/credential-already-in-use" || e.code === "auth/email-already-in-use") {
      cleanLinkFromURL();
      throw new AccountConflict(cred, u ? u.uid : null);
    }
    throw e;
  }
}

// Strip the one-time sign-in params so a refresh doesn't retry a spent link.
function cleanLinkFromURL() {
  const url = new URL(location.href);
  let touched = false;
  for (const k of ["apiKey", "oobCode", "mode", "lang", "continueUrl", "tenantId"]) {
    if (url.searchParams.has(k)) { url.searchParams.delete(k); touched = true; }
  }
  if (touched) history.replaceState(null, "", url.pathname + (url.search === "?" ? "" : url.search) + url.hash);
}

// Sign out and drop straight back to a fresh anonymous session, so the game
// never finds itself with no uid to save against.
export async function signOut() {
  const { mod, auth: a } = await loadSDK();
  await mod.signOut(a);
  await mod.signInAnonymously(a);
  return current;
}

/* ------------------------------------------------------------ public API */

export const auth = {
  ready: init,
  get user() { return current; },
  get signedIn() { return !!current && !current.anon; },
  onChange(fn) {
    listeners.add(fn);
    if (readyP) fn(current);      // late subscribers get the current state immediately
    return () => listeners.delete(fn);
  },
  signInGoogle,
  sendEmailLink,
  completeEmailLink,
  signOut,
  // Whether to pulse the avatar as a "sign in to restore your progress" hint.
  get shouldHint() {
    if (!current || !current.anon) return false;
    try { return !localStorage.getItem(HINT_SEEN); } catch (e) { return false; }
  },
  markHinted() { try { localStorage.setItem(HINT_SEEN, "1"); } catch (e) { /* ignore */ } },
  // Consumed once by the UI on mount.
  takeConflict() { const c = pendingConflict; pendingConflict = null; return c; },
};

export { AccountConflict as Conflict };

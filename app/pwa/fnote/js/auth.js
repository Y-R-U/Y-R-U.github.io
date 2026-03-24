// auth.js — username management
// The username is stored in localStorage and used as the cloud storage key.
// It is sanitised to lowercase a-z, 0-9, hyphens and underscores (2-30 chars).

const AUTH_KEY    = 'fnote_username';
const RECENT_KEY  = 'fnote_recent_users';
const RECENT_MAX  = 10;

export function getUsername() {
  return localStorage.getItem(AUTH_KEY) || null;
}

export function setUsername(name) {
  localStorage.setItem(AUTH_KEY, name);
  // Keep a history of logged-in usernames (most-recent first, deduplicated)
  const list = getRecentUsernames().filter(u => u !== name);
  list.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

export function clearUsername() {
  localStorage.removeItem(AUTH_KEY);
}

/** Returns the stored list of previously used usernames (includes current). */
export function getRecentUsernames() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

/** Remove a specific username from the history list. */
export function removeRecentUsername(name) {
  const list = getRecentUsernames().filter(u => u !== name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/** Strip unsupported characters and force lowercase. */
export function sanitizeUsername(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

/** Must be 2-30 chars of [a-z0-9_-]. */
export function isValidUsername(name) {
  return /^[a-z0-9_-]{2,30}$/.test(name);
}

const PATHS_KEY = 'fnote_user_paths';

function _getPaths() {
  try { return JSON.parse(localStorage.getItem(PATHS_KEY) || '{}'); }
  catch { return {}; }
}

/** Persist the current URL hash for a given user. */
export function saveUserPath(name, hash) {
  const paths = _getPaths();
  paths[name] = hash || '#/';
  localStorage.setItem(PATHS_KEY, JSON.stringify(paths));
}

/** Retrieve the last-visited hash for a given user (defaults to '#/'). */
export function getUserPath(name) {
  return _getPaths()[name] || '#/';
}

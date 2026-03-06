// auth.js — username management
// The username is stored in localStorage and used as the cloud storage key.
// It is sanitised to lowercase a-z, 0-9, hyphens and underscores (2-30 chars).

const AUTH_KEY = 'fnote_username';

export function getUsername() {
  return localStorage.getItem(AUTH_KEY) || null;
}

export function setUsername(name) {
  localStorage.setItem(AUTH_KEY, name);
}

export function clearUsername() {
  localStorage.removeItem(AUTH_KEY);
}

/** Strip unsupported characters and force lowercase. */
export function sanitizeUsername(raw) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

/** Must be 2-30 chars of [a-z0-9_-]. */
export function isValidUsername(name) {
  return /^[a-z0-9_-]{2,30}$/.test(name);
}

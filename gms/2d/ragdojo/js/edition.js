// Replaced with constants by the release builder. Source stays convenient for game gates.
export const EDITION = typeof __RAGDOJO_EDITION__ === 'string' ? __RAGDOJO_EDITION__ : 'source';
export const DEV = EDITION === 'source' && ['localhost', '127.0.0.1'].includes(location.hostname);
export const DEMO = EDITION === 'itch';
export const HOME = 'https://games.br8t.com/gms/2d/ragdojo/';
export const ACCOUNTS = !DEMO && (location.hostname === 'games.br8t.com' || (['localhost', '127.0.0.1'].includes(location.hostname) && location.pathname.startsWith('/gms/2d/ragdojo/')));

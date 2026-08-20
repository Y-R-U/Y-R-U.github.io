// localStorage primitives and the one storage-health probe, shared by the editor and the game.

let healthy = true;
let problem = '';

export const storageHealthy = () => healthy;
export const storageError = () => problem || 'storage is unavailable';

export function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, value);
    healthy = true;
    problem = '';
    return true;
  } catch (e) {
    healthy = false;
    problem = /quota|full/i.test(e?.name + e?.message) ? 'storage is full' : 'storage is blocked';
    return false;
  }
}

export function drop(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

// Private-mode Safari and a full quota both throw on write, never on read, so ask at boot.
// Without this the app reports itself healthy until the first edit has already been lost.
if (write('forge.probe', '1')) drop('forge.probe');

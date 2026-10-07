// A local family-play exception, separate from account purchases and game saves.
export const FAMILY_KEY = 'ragdojo.family-lan.v1';
export function createFamilyAccess(hostname, storage, enabled = true) {
  const parts = hostname.split('.');
  const available = enabled && parts.length === 4 && parts[0] === '192' &&
    parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  let accepted = false;
  if (available) { try { accepted = storage?.getItem(FAMILY_KEY) === 'yes'; } catch {} }
  return {
    available,
    get active() { return available && accepted; },
    grant() {
      if (!available) return false;
      accepted = true;
      try { storage?.setItem(FAMILY_KEY, 'yes'); } catch {}
      return true;
    },
  };
}

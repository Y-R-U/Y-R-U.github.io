import test from 'node:test';
import assert from 'node:assert/strict';
import { createFamilyAccess, FAMILY_KEY } from '../js/family-access.js';
const storage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };
test('family access needs a deliberate click and survives local reload', () => {
  const local = storage(), access = createFamilyAccess('192.168.1.40', local);
  assert(access.available); assert.equal(access.active, false);
  assert(access.grant()); assert(access.active);
  assert(createFamilyAccess('192.168.1.40', local).active);
});
test('a saved family flag cannot grant access on public hosts or other IP ranges', () => {
  const local = storage(); local.setItem(FAMILY_KEY, 'yes');
  for (const host of ['games.br8t.com', '192.168.1.40.example.com', '192.example.com', '192.168.1.999', '192.168.1', '10.0.0.4', '127.0.0.1']) {
    const access = createFamilyAccess(host, local);
    assert.equal(access.available, false, host); assert.equal(access.grant(), false, host); assert.equal(access.active, false, host);
  }
});
test('itch edition excludes family access even on a matching IP', () => {
  const local = storage(); local.setItem(FAMILY_KEY, 'yes');
  const access = createFamilyAccess('192.168.1.40', local, false);
  assert.equal(access.available, false); assert.equal(access.active, false); assert.equal(access.grant(), false);
});
test('blocked storage still permits family play for the current page', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const access = createFamilyAccess('192.168.1.40', blocked);
  assert.equal(access.active, false); assert(access.grant()); assert(access.active);
});

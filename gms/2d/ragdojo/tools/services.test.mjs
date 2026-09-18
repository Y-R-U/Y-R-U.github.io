import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveSync } from '../js/save-sync.js';
import { Purchases } from '../js/purchases.js';
const snapshot = (revision, level = 0) => ({ revision, save: { level, wins: level, losses: 0, stash: {} } });
function setup(local = snapshot('local'), remote = snapshot('remote', 10)) {
  const io = { local: () => local, read: async () => remote, writes: [], adopted: null, statuses: [], choice: null,
    write: async (uid, data, expected) => { assert.equal(remote?.revision || null, expected); remote = data; io.writes.push({ uid, data }); },
    adopt: d => { io.adopted = d; local = d; }, status: s => io.statuses.push(s), conflict: c => io.choice = c,
    setLocal: d => local = d, setRemote: d => remote = d };
  return { io, sync: new SaveSync(io) };
}
test('blank new device adopts real cloud progress without a write', async () => { const { io,sync } = setup();await sync.connect('alice');assert.equal(io.adopted.save.level,10);assert.equal(io.writes.length,0); });
test('first account receives earned guest progress', async () => { const { io,sync } = setup(snapshot('local',4),null);await sync.connect('alice');assert.equal(io.writes[0].data.save.level,4); });
test('failed read cannot overwrite cloud save', async () => { const { io,sync } = setup(snapshot('local',4));io.read = async () => { throw new Error('offline'); };sync.changed();await sync.connect('alice');await sync.flush();assert.equal(io.writes.length,0);assert.equal(sync.ready,false); });
test('two played saves require a choice, never silently newest wins', async () => { const { io,sync } = setup(snapshot('local',4));await sync.connect('alice');assert.ok(io.choice);assert.equal(io.writes.length,0);await sync.choose('remote');assert.equal(io.adopted.save.level,10); });
test('choosing local writes only the verified account', async () => { const { io,sync } = setup(snapshot('local',4));await sync.connect('alice');await sync.choose('local');assert.equal(io.writes[0].uid,'alice');assert.equal(io.writes[0].data.save.level,4); });
test('account change ignores a slow previous account read', async () => { const { io,sync } = setup();let release;io.read = uid => uid === 'alice' ? new Promise(r => release = r) : Promise.resolve(snapshot('bob',7));const first = sync.connect('alice');await sync.connect('bob');release(snapshot('alice',40));await first;assert.equal(io.adopted.save.level,7);assert.equal(sync.uid,'bob'); });
test('signout cancels queued writes', async () => { const { io,sync } = setup(snapshot('same',4),snapshot('same',4));await sync.connect('alice');const before=io.writes.length;io.setLocal(snapshot('next',5));sync.changed();await sync.connect(null);await sync.flush();assert.equal(io.writes.length,before); });
test('remote advancement during play opens conflict', async () => { const { io,sync } = setup();await sync.connect('alice');io.setLocal(snapshot('next',11));sync.changed();io.setRemote(snapshot('other-device',20));await sync.flush();assert.ok(io.choice);assert.equal(io.writes.length,0); });
test('same revision does not reload or adopt repeatedly', async () => { const { io,sync } = setup(snapshot('same',4),snapshot('same',4));await sync.connect('alice');await sync.connect('alice');assert.equal(io.adopted,null); });
const auth = () => ({ signedIn: true, user: { uid: 'alice' }, getIdToken: async () => 'fixture-token' });
const response = owned => ({ ok: true, json: async () => ({ owned, product: 'ragdojo_dark', testMode: true }) });
test('purchase is restored from server, independent of editable save', async () => { const a=auth();const p=new Purchases(a,async () => response(true));assert.equal(p.owned,false);await p.refresh();assert.equal(p.owned,true); });
test('refund revokes ownership on refresh', async () => { const p=new Purchases(auth(),async () => response(true));await p.refresh();p.request=async () => response(false);await p.refresh();assert.equal(p.owned,false); });
test('offline cannot grant or retain cached ownership', async () => { const p=new Purchases(auth(),async () => response(true));await p.refresh();p.request=async () => { throw new Error('offline'); };await assert.rejects(p.refresh());assert.equal(p.owned,false); });
test('purchase response from prior account cannot unlock current account', async () => { const a=auth();let release;const p=new Purchases(a,() => new Promise(r => release=r));const first=p.refresh();await Promise.resolve();a.user={uid:'bob'};a.signedIn=false;await p.refresh();release(response(true));await first;assert.equal(p.owned,false); });
test('fake purchase success URL does not establish ownership', () => { const p=new Purchases(auth());assert.equal(p.owned,false); });
test('checkout rejects untrusted redirect and needs login', async () => { const a=auth();const p=new Purchases(a,async () => ({ok:true,json:async () => ({testMode:true,url:'https://evil.example'})}));await assert.rejects(p.checkout());a.signedIn=false;await assert.rejects(p.checkout()); });

test('switching owners requires a choice even when the new account is empty', async () => {
 const {io,sync}=setup({...snapshot('alice',5),owner:'alice'},null);
 io.empty=()=>snapshot('blank',0);
 await sync.connect('bob');assert.ok(io.choice);assert.equal(io.writes.length,0);
 await sync.choose('local');assert.equal(io.writes[0].uid,'bob');
});
test('save read waits for a safe menu before adopting', async () => {
 const {io,sync}=setup();let release;io.safe=()=>new Promise(r=>release=r);
 const connecting=sync.connect('alice');await Promise.resolve();assert.equal(io.adopted,null);
 release();await connecting;assert.equal(io.adopted.save.level,10);
});
test('transaction conflict leaves local progress and pending write intact', async () => {
 const {io,sync}=setup();await sync.connect('alice');io.setLocal(snapshot('local-next',11));sync.changed();
 io.write=async()=>{throw Error('remote changed during transaction')};await sync.flush();
 assert.equal(sync.pending.save.level,11);assert.equal(io.local().save.level,11);
});

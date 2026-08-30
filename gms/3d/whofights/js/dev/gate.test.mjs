// node js/dev/gate.test.mjs
import { isLocal, hostIsLocal, isDottedQuad } from './gate.js';

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('  FAIL', what); } };
const yes = h => ok(hostIsLocal(h) === true, `${h} should be local`);
const no = h => ok(hostIsLocal(h) === false, `${h} should NOT be local`);

['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '::1', '[::1]', '0:0:0:0:0:0:0:1',
 'macbook.local', 'MacBook.Local', 'a.b.local'].forEach(yes);

['10.0.0.4', '10.255.255.255', '192.168.0.1', '192.168.1.5', '172.16.0.1', '172.20.5.5',
 '172.31.255.255'].forEach(yes);

['172.15.0.1', '172.32.0.1', '172.320.0.1', '173.16.0.1', '11.0.0.1', '192.169.0.1',
 '191.168.0.1', '9.255.255.255'].forEach(no);

['y-r-u.github.io', 'example.com', 'localhost.evil.com', 'notlocalhost', 'mylocal', '.local',
 'local', 'evil.com/192.168.1.1', '8.8.8.8', '', '   ', 'localhost:8796'].forEach(no);

// Non-canonical forms a browser would still resolve to a private address.
['010.0.0.1', '0x7f.0.0.1', '2130706433', '127.1', '192.168.1', '192.168.1.5.6',
 '192.168.1.256', '192.168.01.5'].forEach(no);

// 127/8 beyond .1 is deliberately out — the contract lists 127.0.0.1 and nothing else.
no('127.0.0.2');

ok(hostIsLocal(null) === false, 'null host');
ok(hostIsLocal(undefined) === false, 'undefined host');
ok(hostIsLocal(12) === false, 'number host');

ok(isLocal({ protocol: 'file:', hostname: '' }) === true, 'file: origin');
ok(isLocal({ protocol: 'https:', hostname: '192.168.1.5' }) === true, 'https on LAN');
ok(isLocal({ protocol: 'https:', hostname: 'y-r-u.github.io' }) === false, 'the live site');
ok(isLocal({ protocol: 'http:', hostname: 'whofights.example.com' }) === false, 'public host');
ok(isLocal(null) === false || typeof location !== 'undefined', 'no location object');

ok(isDottedQuad('0.0.0.0') === true, '0.0.0.0 is a quad');
ok(isDottedQuad('255.255.255.255') === true, '255.255.255.255 is a quad');

console.log(`gate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

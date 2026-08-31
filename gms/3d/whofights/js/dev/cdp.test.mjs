// Covers js/dev/cdp.mjs's transport — the one that used to wedge for ever on a big screenshot.
//
// No chrome: a local http server speaks just enough of /json/new and RFC 6455 to drive attach(),
// so these run in the shared tools/test.mjs process. Nothing here is allowed to wait on a reply
// that never comes.
import http from 'node:http';
import crypto from 'node:crypto';
import { test, eq, ok } from '../../tools/harness.mjs';
import { createFrameReader } from '../../tools/shot.mjs';
import { attach, sleep } from './cdp.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const URL_ = 'http://example.invalid/page';

// Server frames are never masked (RFC 6455 §5.1), unlike the client's.
function serverFrame(opcode, payload) {
  const body = Buffer.from(payload), len = body.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, body]);
}

// `handle(msg, reply, sock)` decides what this pretend chrome does with each command. It records
// what the client offered in its handshake, which is the whole point of test one.
async function fakeDevtools(handle) {
  const socks = new Set();
  let offered = null;
  const server = http.createServer((req, res) => {
    if (req.method === 'PUT' && req.url.startsWith('/json/new')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ id: 'T1',
        webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/T1` }));
    }
    res.writeHead(404); res.end('no');
  });
  server.on('upgrade', (req, sock) => {
    socks.add(sock);
    offered = req.headers['sec-websocket-extensions'] ?? null;
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    // Deliberately echoes no extension back, so the revert fails on the assertion below rather
    // than on a message this server was too strict to carry.
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const reader = createFrameReader();
    const reply = m => { if (!sock.destroyed) sock.write(serverFrame(1, JSON.stringify(m))); };
    sock.on('data', d => {
      for (const f of reader.push(d)) if (f.opcode === 1) handle(JSON.parse(f.payload.toString('utf8')), reply, sock);
    });
    sock.on('error', () => { /* the tests destroy sockets on purpose */ });
    sock.on('close', () => socks.delete(sock));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    get offered() { return offered; },
    close() { for (const s of socks) s.destroy(); server.close(); },
  };
}

const answerAll = (msg, reply) => reply({ id: msg.id, result: {} });

// The bug the whole transport exists for. Node's global WebSocket offers permessage-deflate, and
// undici destroys the socket rather than inflate past 4 MiB — measured against real chrome on
// 31 Aug, a 3.687 MiB reply came back in 171 ms and a 4.031 MiB one never came back at all.
test('attach carries a reply far past undici\'s 4 MiB cap, and offers no compression', async () => {
  const big = 'x'.repeat(5 * 1024 * 1024 + 11);
  ok(big.length > 4 * 1024 * 1024, 'the payload must exceed the cap it is testing');
  const srv = await fakeDevtools((msg, reply) =>
    reply({ id: msg.id, result: msg.method === 'Page.captureScreenshot' ? { data: big } : {} }));
  try {
    const p = await attach(srv.port, URL_, { timeout: 20000 });
    const r = await p.send('Page.captureScreenshot', { format: 'png' });
    eq(r.data.length, big.length, 'the whole reply must arrive');
    eq(srv.offered, null,
      `the client must offer no websocket extension — permessage-deflate is what caps a message at 4 MiB (offered ${srv.offered})`);
    p.close();
  } finally { srv.close(); }
});

test('a request chrome never answers rejects, and names the method', async () => {
  const srv = await fakeDevtools((msg, reply) => { if (msg.method !== 'Page.captureScreenshot') answerAll(msg, reply); });
  try {
    const p = await attach(srv.port, URL_, { timeout: 250 });
    let err = null;
    await p.send('Page.captureScreenshot').catch(e => { err = e; });
    ok(err, 'a request with no reply must reject, not hang for ever');
    ok(/Page\.captureScreenshot/.test(err.message), `the method must be in the message: ${err?.message}`);
    p.close();
  } finally { srv.close(); }
});

test('a dropped socket rejects every request in flight, by name', async () => {
  const srv = await fakeDevtools((msg, reply, sock) => {
    if (msg.method === 'Boom.drop') sock.destroy();          // 1006, exactly as undici used to
    else if (/enable/.test(msg.method)) answerAll(msg, reply);
  });
  try {
    const p = await attach(srv.port, URL_, { timeout: 8000 });
    const a = p.send('Page.captureScreenshot').then(() => null, e => e);
    const b = p.send('Runtime.evaluate').then(() => null, e => e);
    const c = p.send('Boom.drop').then(() => null, e => e);
    const [ea, eb] = [await a, await b];
    await c;
    ok(ea && /Page\.captureScreenshot/.test(ea.message), `orphan named: ${ea?.message}`);
    ok(eb && /Runtime\.evaluate/.test(eb.message), `orphan named: ${eb?.message}`);
    ok(/dropped with this request in flight/.test(ea.message), `it must say why, not just time out: ${ea.message}`);
    const after = await p.send('Page.enable').then(() => null, e => e);
    ok(after && /Page\.enable/.test(after.message), 'a send after the drop rejects rather than hanging');
    p.close();
  } finally { srv.close(); }
});

// beforeunload blocks navigation until someone answers it, and nothing else in the stack will.
test('a javascript dialog is answered automatically, and events are collected', async () => {
  const seen = [];
  const srv = await fakeDevtools((msg, reply) => {
    seen.push(msg.method);
    answerAll(msg, reply);
    if (msg.method === 'Page.navigate') reply({ method: 'Page.javascriptDialogOpening', params: { message: 'leave?' } });
  });
  try {
    const p = await attach(srv.port, URL_, { timeout: 5000 });
    await p.send('Page.navigate', { url: 'about:blank' });
    for (let i = 0; i < 100 && !seen.includes('Page.handleJavaScriptDialog'); i++) await sleep(20);
    ok(seen.includes('Page.handleJavaScriptDialog'), `the dialog must be dismissed: saw ${seen.join(', ')}`);
    ok(p.events.some(e => e.method === 'Page.javascriptDialogOpening'), 'the event must reach events[]');
    p.close();
  } finally { srv.close(); }
});

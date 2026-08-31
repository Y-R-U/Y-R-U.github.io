// Covers tools/shot.mjs — the websocket transport it talks CDP over, and settle().
//
// It lives under js/ because tools/test.mjs only walks js/. Everything here is pure: the frame
// codec is fed bytes, and CDP is handed a fake transport instead of a socket.
import { test, eq, ok } from '../tools/harness.mjs';
import { createFrameReader, encodeFrame, CDP, settle } from '../tools/shot.mjs';

// A server frame: unmasked, one shot, 64-bit length when it needs one.
function serverFrame(opcode, payload, fin = true) {
  const body = Buffer.from(payload), len = body.length;
  let head;
  if (len < 126) head = Buffer.from([(fin ? 0x80 : 0) | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = (fin ? 0x80 : 0) | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = (fin ? 0x80 : 0) | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, body]);
}

const drain = (reader, buf, chunk) => {
  const out = [];
  for (let i = 0; i < buf.length; i += chunk) out.push(...reader.push(buf.subarray(i, i + chunk)));
  return out;
};

// The bug this whole transport exists for: node's global WebSocket negotiates permessage-deflate
// and undici aborts any message that inflates past 4 MiB, killing the socket. A 3200 × 1800
// Page.captureScreenshot reply is ~9 MB of base64. Anything over 4 MiB must survive intact.
test('the reader reassembles a message far larger than undici\'s 4 MiB cap', () => {
  const big = 'x'.repeat(5 * 1024 * 1024 + 7);
  ok(big.length > 4 * 1024 * 1024, 'the payload must exceed the cap it is testing');
  const msgs = drain(createFrameReader(), serverFrame(1, big), 65536);
  eq(msgs.length, 1, 'one message out');
  eq(msgs[0].payload.length, big.length, 'no bytes lost across the chunk boundaries');
  ok(msgs[0].payload.toString() === big, 'bytes match');
});

test('the reader tolerates any chunk boundary, including mid-header', () => {
  const wire = Buffer.concat([serverFrame(1, 'a'.repeat(300)), serverFrame(1, 'b'.repeat(70000))]);
  for (const chunk of [1, 3, 9, 128, 65535]) {
    const msgs = drain(createFrameReader(), wire, chunk);
    eq(msgs.map(m => m.payload.length), [300, 70000], `chunk size ${chunk}`);
  }
});

test('the reader joins continuation frames and keeps control frames separate', () => {
  const r = createFrameReader();
  const out = [
    ...r.push(serverFrame(1, 'one ', false)),
    ...r.push(serverFrame(9, 'ping')),          // a ping mid-message must not corrupt it
    ...r.push(serverFrame(0, 'two ', false)),
    ...r.push(serverFrame(0, 'three', true)),
  ];
  eq(out.map(m => m.opcode), [9, 1]);
  eq(out[1].payload.toString(), 'one two three');
});

test('encodeFrame masks, and the reader unmasks it back', () => {
  for (const len of [10, 200, 70000]) {
    const text = 'q'.repeat(len);
    const frame = encodeFrame(1, Buffer.from(text));
    ok((frame[0] & 0x80) !== 0, 'FIN set');
    ok((frame[1] & 0x80) !== 0, 'client frames must be masked or chrome drops the connection');
    const msgs = createFrameReader().push(frame);
    eq(msgs.length, 1);
    eq(msgs[0].payload.toString(), text, `round trip at ${len} bytes`);
  }
});

// A fake socket, so the two ways a request can be orphaned can be provoked without chrome.
function fakeTransport({ reply = null } = {}) {
  const sent = [];
  let onMessage = () => {}, onClose = () => {};
  const conn = {
    send(t) { sent.push(JSON.parse(t)); if (reply) reply(JSON.parse(t), m => onMessage(JSON.stringify(m))); },
    onMessage: fn => { onMessage = fn; },
    onClose: fn => { onClose = fn; },
    close() {},
  };
  return { sent, conn, drop: err => onClose(err), connect: async () => conn };
}

test('a request nothing answers rejects, and names the method', async () => {
  const t = fakeTransport();
  const cdp = new CDP('ws://fake', { connect: t.connect, timeout: 40 });
  await cdp.connect();
  let err = null;
  await cdp.send('Page.captureScreenshot').catch(e => { err = e; });
  ok(err, 'a request with no reply must reject, not hang for ever');
  ok(/Page\.captureScreenshot/.test(err.message), `the method must be in the message: ${err?.message}`);
});

test('a dropped socket rejects every request in flight, by name', async () => {
  const t = fakeTransport();
  const cdp = new CDP('ws://fake', { connect: t.connect, timeout: 60000 });
  await cdp.connect();
  const a = cdp.send('Page.captureScreenshot').then(() => null, e => e);
  const b = cdp.send('Runtime.evaluate').then(() => null, e => e);
  t.drop(new Error('the devtools websocket closed'));
  const [ea, eb] = [await a, await b];
  ok(ea && /Page\.captureScreenshot/.test(ea.message), `orphan named: ${ea?.message}`);
  ok(eb && /Runtime\.evaluate/.test(eb.message), `orphan named: ${eb?.message}`);
  const after = await cdp.send('Page.enable').then(() => null, e => e);
  ok(after && /Page\.enable/.test(after.message), 'a send after the drop rejects rather than hanging');
});

test('a reply resolves the matching request', async () => {
  const t = fakeTransport({ reply: (msg, back) => back({ id: msg.id, result: { data: 'ok' } }) });
  const cdp = new CDP('ws://fake', { connect: t.connect, timeout: 1000 });
  await cdp.connect();
  eq(await cdp.send('Page.captureScreenshot'), { data: 'ok' });
});

const frameCounter = counts => {
  let i = 0;
  return async () => ({ result: { value: JSON.stringify(counts[Math.min(i++, counts.length - 1)]) } });
};

test('settle returns the frames drawn once the page has advanced', async () => {
  eq(await settle(frameCounter([100, 104, 160]), 20, 2000), 60);
});

// This is the check that could never fail: settle used to fall out of its own while loop and
// return, so a stalled page was screenshotted and the run reported success.
test('settle throws when the render loop has stalled', async () => {
  let err = null;
  await settle(frameCounter([42]), 20, 250).catch(e => { err = e; });
  ok(err, 'a page that never advances a frame must fail the run, not be screenshotted anyway');
  ok(/drew 0 frames/.test(err.message), `it must say how far it got: ${err?.message}`);
});

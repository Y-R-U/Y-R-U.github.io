// The pure guards in tools/devserver.mjs — every write route's confinement passes through one of
// them. They had no tests because importing the module used to start the server; it now only
// listens when it is the CLI entry point, so this file imports it directly.
//
// Lives under js/ because tools/test.mjs only walks js/.

import { test, eq, ok, throws } from '../../tools/harness.mjs';
import { ROOT, dataPath, assetPath, underDir, originOK, remoteIsLocal, isWriteRoute, checkEncode,
  server } from '../../tools/devserver.mjs';

const req = (origin, remote = '127.0.0.1') => ({ headers: origin === undefined ? {} : { origin },
  socket: { remoteAddress: remote } });

test('importing the module does not open a port', () => {
  eq(server.listening, false);
});

test('dataPath confines writes to data/ and to .json', () => {
  eq(dataPath('levels/academy.json').rel, 'data/levels/academy.json');
  eq(dataPath('data/levels/academy.json').rel, 'data/levels/academy.json');
  eq(dataPath('/data/music.json').rel, 'data/music.json');
  eq(dataPath('music.json').abs, `${ROOT}/data/music.json`);

  throws(() => dataPath('levels/academy.txt'), 'a non-json extension');
  throws(() => dataPath('levels/academy'), 'no extension');
  throws(() => dataPath(''), 'empty');
  throws(() => dataPath('   '), 'blank');
  throws(() => dataPath(null), 'null');
  throws(() => dataPath(12), 'a number');
});

test('dataPath rejects every escape the review probed by hand', () => {
  for (const p of ['../../../tmp/x.json', 'data/../../x.json', '../x.json', 'data/../../../x.json',
    'a/../../b.json', '..%2f..%2fx.json', 'levels/..\\..\\x.json']) {
    throws(() => dataPath(p), `${p} must not resolve`);
  }
});

// Nothing on this path decodes, so `%2e%2e` used to become a literal directory: not an escape, but
// data/ silently grew junk that then appeared in /api/ls.
test('dataPath rejects an undecoded escape rather than making a directory called %2e%2e', () => {
  throws(() => dataPath('levels/%2e%2e/%2e%2e/pwned.json'), '%2e%2e segments');
  throws(() => dataPath('%2e%2e/x.json'), 'a leading %2e%2e');
  throws(() => dataPath('levels/%20/x.json'), 'any percent escape at all');
});

test('dataPath rejects the charset that is not a filename', () => {
  throws(() => dataPath('levels/a b.json'), 'a space');
  throws(() => dataPath('levels//x.json'), 'an empty segment');
  throws(() => dataPath('levels/x\0.json'), 'a NUL');
  throws(() => dataPath('levels/$(whoami).json'), 'shell punctuation');
  throws(() => dataPath('levels/x;rm.json'), 'a semicolon');
});

test('assetPath strips the extension it is about to write and nothing else', () => {
  eq(assetPath('audio/music', 'tavern', '.mp3').rel, 'audio/music/tavern.mp3');
  eq(assetPath('audio/music', 'tavern.mp3', '.mp3').rel, 'audio/music/tavern.mp3');
  eq(assetPath('audio/music', 'tavern.MP3', '.mp3').rel, 'audio/music/tavern.mp3');
  eq(assetPath('audio/vo', 'raw/greeter_hello_01', '.wav').rel, 'audio/vo/raw/greeter_hello_01.wav');
  eq(assetPath('art/skins', 'vail', '.png').name, 'vail');
});

// `tavern.v2` and `tavern.v3` both used to resolve to `tavern.mp3`, and both reported success.
test('a dotted out name is a different file, not a silent overwrite', () => {
  eq(assetPath('audio/music', 'tavern.v2', '.mp3').rel, 'audio/music/tavern.v2.mp3');
  ok(assetPath('audio/music', 'tavern.v2', '.mp3').rel !== assetPath('audio/music', 'tavern.v3', '.mp3').rel,
    'two versions must not collide');
  eq(assetPath('audio/music', 'tavern.wav', '.mp3').rel, 'audio/music/tavern.wav.mp3',
    'a wrong extension is kept, so the echoed name shows the caller what happened');
  eq(assetPath('art', 'vail.v2', '.png').name, 'vail.v2', 'the resolved name comes back');
});

test('assetPath confines the output to its own directory', () => {
  for (const n of ['../evil', 'a/../../b', '/etc/passwd', '..', 'a/..', '%2e%2e/x']) {
    throws(() => assetPath('art', n, '.png'), `${n} must not resolve`);
  }
  throws(() => assetPath('art', '', '.png'), 'empty');
  throws(() => assetPath('art', '.png', '.png'), 'a name that is only the extension');
  throws(() => assetPath('art', 'a b', '.png'), 'a space');
  throws(() => assetPath('art', null, '.png'), 'null');
});

test('underDir accepts only the listed roots', () => {
  eq(underDir('audio/music/raw/tavern_01.wav', ['audio/music/raw'], 'src').rel, 'audio/music/raw/tavern_01.wav');
  eq(underDir('/audio/vo/x.wav', ['audio/music', 'audio/vo'], 'src').rel, 'audio/vo/x.wav');

  throws(() => underDir('data/music.json', ['audio/music', 'audio/vo'], 'src'), 'a root not listed');
  throws(() => underDir('../../../etc/passwd', ['audio/vo'], 'src'), 'above the project');
  throws(() => underDir('audio/vo/../../data/x', ['audio/vo'], 'src'), 'a traversal back down');
  throws(() => underDir('audio/vo\0/x', ['audio/vo'], 'src'), 'a NUL');
  throws(() => underDir('', ['audio/vo'], 'src'), 'empty');
  throws(() => underDir('audio', ['audio/vo'], 'src'), 'the parent of a listed root');
});

test('originOK admits a local page and nothing that merely looks like one', () => {
  for (const o of [undefined, 'null', 'http://localhost:8796', 'http://localhost', 'https://127.0.0.1:8796',
    'http://[::1]:8796', 'http://macbook.local:8796', 'http://192.168.0.5:8796', 'http://10.1.2.3',
    'http://172.16.0.1', 'http://172.31.255.1']) {
    ok(originOK(req(o)) === true, `${o} should be allowed`);
  }
  for (const o of ['https://evil.example.com', 'http://localhost.evil.com', 'http://notlocalhost',
    'https://y-r-u.github.io', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.169.0.1',
    'http://11.0.0.1', 'not a url', 'http://local']) {
    ok(originOK(req(o)) === false, `${o} should be refused`);
  }
});

test('remoteIsLocal reads the socket, IPv4-mapped forms included', () => {
  for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', '::ffff:192.168.1.5',
    '192.168.0.9', '10.0.0.1', '172.20.1.1', 'fe80::1', 'fd00::1']) {
    ok(remoteIsLocal(req(undefined, a)) === true, `${a} should be local`);
  }
  for (const a of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '11.0.0.1', '::ffff:8.8.8.8', '', '2001:db8::1']) {
    ok(remoteIsLocal(req(undefined, a)) === false, `${a} should not be local`);
  }
});

test('cancel is a write route, so it is refused from a non-local socket', () => {
  eq(isWriteRoute('/api/job/flux-1/cancel'), true);
  eq(isWriteRoute('/api/save'), true);
  eq(isWriteRoute('/api/skin'), true);
  eq(isWriteRoute('/api/job/flux-1'), false);
  eq(isWriteRoute('/api/ls'), false);
  eq(isWriteRoute('/api/status'), false);
});

test('checkEncode rejects a self-overwrite up front, like every other bad request', () => {
  throws(() => checkEncode({ src: 'audio/music/tavern_01.mp3', profile: 'full', out: 'tavern_01' }),
    'encoding a file over itself');
  throws(() => checkEncode({ src: 'audio/vo/greeter_01.mp3', profile: 'voice', out: 'greeter_01' }),
    'the voice side of the same mistake');

  const preview = checkEncode({ src: 'audio/music/tavern_01.mp3', profile: 'full', out: 'tavern_01', preview: true });
  eq(preview.outRel, 'audio/music/_preview/tavern_01.mp3', 'a preview is not the source');
});

test('checkEncode agrees with the job about where the bytes land', () => {
  const c = checkEncode({ src: 'audio/music/raw/tavern_01.wav', profile: 'radio', out: 'tavern_01' });
  eq(c.outRel, 'audio/music/tavern_01.mp3');
  eq(c.src.rel, 'audio/music/raw/tavern_01.wav');
  eq(c.profile.kind, 'music');

  eq(checkEncode({ src: 'audio/vo/raw/greeter_01.wav', profile: 'voice-opus', out: 'greeter_01' }).outRel,
    'audio/vo/greeter_01.ogg', 'the profile picks the directory and the extension');
  eq(checkEncode({ src: 'audio/vo/raw/g.wav', profile: 'voice', out: 'audio/vo/g' }).outRel, 'audio/vo/g.mp3',
    'an out that already names its directory is not doubled');

  throws(() => checkEncode({ src: 'audio/music/raw/t.wav', profile: 'nope', out: 't' }), 'an unknown profile');
  throws(() => checkEncode({ src: 'data/music.json', profile: 'full', out: 't' }), 'a source outside the audio dirs');
  throws(() => checkEncode({ src: 'audio/music/raw/t.wav', profile: 'full', out: '../t' }), 'an out that escapes');
});

// Projects: create from a template, open, autosave, import/export .mcaddon.
import { idb } from './db.js';
import { fs } from './fs.js';
import { bus } from './bus.js';
import { flag } from './store.js';
import { zip, unzip, download } from './pack.js';
import * as B from '../lib/bedrock.js';

const LIST = 'projects';
const key = id => 'proj:' + id;
// Random suffix, not just the clock: duplicating twice inside one millisecond would otherwise
// give both copies the same id, and the second would overwrite the first.
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let current = null;      // meta of the open project
let saveTimer = null;

export const project = {
  get current() { return current; },
  get isOpen() { return !!current; },

  async list() { return (await idb.get(LIST)) || []; },

  async create({ name, namespace, author, template = 'mob' }) {
    const id = newId();
    const meta = {
      id,
      name: name || 'My Add-On',
      namespace: B.safeName(namespace || name || 'mypack'),
      author: author || 'Me',
      template,
      created: Date.now(),
      modified: Date.now(),
      bpUuid: B.uuid(), bpModUuid: B.uuid(),
      rpUuid: B.uuid(), rpModUuid: B.uuid()
    };
    fs.clear();
    await buildTemplate(meta, template);
    current = meta;
    await saveNow();
    const list = await project.list();
    list.unshift(stripMeta(meta));
    await idb.set(LIST, list);
    flag.set('lastProject', id);
    bus.emit('project:open', { id, meta });
    return meta;
  },

  async open(id) {
    const rec = await idb.get(key(id));
    if (!rec) throw new Error('That project is missing.');
    current = rec.meta;
    fs.loadAll(rec.files);
    flag.set('lastProject', id);
    bus.emit('project:open', { id, meta: current });
    return current;
  },

  async close() {
    if (current) await saveNow();
    current = null;
    fs.clear();
    bus.emit('project:open', { id: null, meta: null });
  },

  async remove(id) {
    await idb.del(key(id));
    const list = (await project.list()).filter(p => p.id !== id);
    await idb.set(LIST, list);
    if (current && current.id === id) { current = null; fs.clear(); bus.emit('project:open', { id: null, meta: null }); }
  },

  async duplicate(id) {
    const rec = await idb.get(key(id));
    if (!rec) return null;
    const meta = { ...rec.meta, id: newId(), name: rec.meta.name + ' copy', created: Date.now(), modified: Date.now(), bpUuid: B.uuid(), bpModUuid: B.uuid(), rpUuid: B.uuid(), rpModUuid: B.uuid() };
    await idb.set(key(meta.id), { meta, files: rec.files });
    const list = await project.list();
    list.unshift(stripMeta(meta));
    await idb.set(LIST, list);
    return meta;
  },

  async setMeta(patch) {
    if (!current) return;
    Object.assign(current, patch, { modified: Date.now() });
    const list = await project.list();
    const i = list.findIndex(p => p.id === current.id);
    if (i >= 0) list[i] = stripMeta(current);
    await idb.set(LIST, list);
    await saveNow();
    bus.emit('project:meta', { meta: current });
  },

  save: saveNow,

  // ------------------------------------------------------------ transfer ---
  async exportBlob() {
    if (!current) throw new Error('No project open.');
    const files = fs.dumpBytes();
    const blob = await zip(files);
    const safe = B.safeName(current.name);
    return { blob, filename: safe + '.mcaddon' };
  },

  async exportDownload() {
    const { blob, filename } = await project.exportBlob();
    download(blob, filename);
    return filename;
  },

  /** Import a .mcaddon / .mcpack / .zip into a NEW project. */
  async importFile(file) {
    const entries = await unzip(file);
    const paths = Object.keys(entries);
    if (!paths.length) throw new Error('That file was empty.');

    // Work out where the behaviour and resource packs live inside the zip.
    const mapped = {};
    const manifests = paths.filter(p => p.endsWith('manifest.json'));
    const roots = [];
    for (const m of manifests) {
      const dir = m.slice(0, m.length - 'manifest.json'.length);
      let kind = 'BP';
      try {
        const j = JSON.parse(new TextDecoder().decode(entries[m]));
        const t = (j.modules || []).map(x => x.type).join(',');
        kind = t.includes('resources') ? 'RP' : 'BP';
      } catch (e) { /* guess below */ }
      roots.push({ dir, kind });
    }
    if (!roots.length) {
      const guess = paths.some(p => /(^|\/)(entity|models|textures)\//.test(p)) ? 'RP' : 'BP';
      roots.push({ dir: '', kind: guess });
    }
    roots.sort((a, b) => b.dir.length - a.dir.length);
    for (const [p, bytes] of Object.entries(entries)) {
      if (/(^|\/)(\.|__MACOSX)/.test(p)) continue;
      const root = roots.find(r => p.startsWith(r.dir));
      const rel = root ? p.slice(root.dir.length) : p;
      const kind = root ? root.kind : 'BP';
      mapped[kind + '/' + rel] = bytes;
    }

    const name = (file.name || 'Imported add-on').replace(/\.(mcaddon|mcpack|zip)$/i, '');
    const meta = await project.create({ name, namespace: B.safeName(name), template: 'blank' });
    fs.clear();
    const dec = new TextDecoder();
    for (const [p, bytes] of Object.entries(mapped)) {
      if (/\.(json|lang|js|ts|txt|material|mcfunction)$/i.test(p)) fs.write(p, dec.decode(bytes), { silent: true });
      else fs.write(p, bytes, { silent: true });
    }
    // adopt the imported pack's identity where we can
    const bp = fs.readJSON('BP/manifest.json');
    if (bp && bp.header) {
      meta.name = bp.header.name && !/^pack\./.test(bp.header.name) ? bp.header.name : meta.name;
      meta.bpUuid = bp.header.uuid || meta.bpUuid;
    }
    const anyEntity = fs.find('BP/entities/*.json');
    if (anyEntity) {
      const e = fs.readJSON(anyEntity);
      const id = e && e['minecraft:entity'] && e['minecraft:entity'].description.identifier;
      if (id && id.includes(':')) meta.namespace = id.split(':')[0];
    }
    await project.setMeta(meta);
    bus.emit('file:change', { path: '*' });
    return meta;
  }
};

function stripMeta(m) {
  const { id, name, namespace, author, created, modified, template } = m;
  return { id, name, namespace, author, created, modified, template };
}

async function saveNow() {
  if (!current) return;
  current.modified = Date.now();
  await idb.set(key(current.id), { meta: current, files: fs.dumpAll() });
  bus.emit('project:saved', { id: current.id });
}

bus.on('project:change', () => {
  if (!current) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
});
window.addEventListener('beforeunload', () => { if (current) saveNow(); });

// ============================================================== templates ===

const TEMPLATES = {
  blank: { icon: '📄', title: 'Empty pack', desc: 'Just the two manifests. You add everything.' },
  mob: { icon: '👾', title: 'My first mob', desc: 'A friendly blob you can paint, animate and spawn.' },
  item: { icon: '🍎', title: 'A magic snack', desc: 'A food item that gives you a power when eaten.' },
  block: { icon: '🟫', title: 'A glowing block', desc: 'A block you can place, break and light up a cave with.' },
  everything: { icon: '🎁', title: 'One of everything', desc: 'A mob, an item and a block, all set up and working.' }
};
export function templateList() {
  return Object.entries(TEMPLATES).map(([k, v]) => ({ value: k, ...v }));
}

async function buildTemplate(meta, template) {
  const ns = meta.namespace;
  const packName = meta.name;

  fs.writeJSON('BP/manifest.json', B.manifest({
    name: packName + ' BP', description: 'Behaviour pack for ' + packName,
    kind: 'bp', uuidHeader: meta.bpUuid, uuidModule: meta.bpModUuid, dependsOn: meta.rpUuid
  }), { silent: true });
  fs.writeJSON('RP/manifest.json', B.manifest({
    name: packName + ' RP', description: 'Resource pack for ' + packName,
    kind: 'rp', uuidHeader: meta.rpUuid, uuidModule: meta.rpModUuid, dependsOn: meta.bpUuid
  }), { silent: true });

  const icon = await packIcon(packName);
  fs.write('BP/pack_icon.png', icon, { silent: true });
  fs.write('RP/pack_icon.png', icon, { silent: true });

  const lang = {};

  if (template === 'mob' || template === 'everything') {
    const short = 'blobby';
    const id = `${ns}:${short}`;
    fs.writeJSON(`BP/entities/${short}.json`, B.entityBP(id, { health: 14, speed: 0.25, collision: { w: 0.8, h: 0.9 }, floats: true }), { silent: true });
    fs.writeJSON(`RP/entity/${short}.entity.json`, B.entityRP(id, {
      geo: `geometry.${short}`, texture: `textures/entity/${short}`,
      anims: { idle: `animation.${short}.idle`, walk: `animation.${short}.walk` }
    }), { silent: true });
    fs.writeJSON(`RP/render_controllers/${short}.render_controllers.json`, B.renderController(id), { silent: true });
    fs.writeJSON(`RP/models/entity/${short}.geo.json`, B.starterGeo(short, 'blob'), { silent: true });
    fs.writeJSON(`RP/animations/${short}.animation.json`, B.starterAnims(short, 'blob'), { silent: true });
    fs.write(`RP/textures/entity/${short}.png`, await mobTexture(), { silent: true });
    fs.writeJSON(`BP/spawn_rules/${short}.json`, B.spawnRule(id, { weight: 8 }), { silent: true });
    lang[`entity.${id}.name`] = 'Blobby';
    lang[`item.spawn_egg.entity.${id}.name`] = 'Spawn Blobby';
  }

  if (template === 'item' || template === 'everything') {
    const short = 'sky_berry';
    const id = `${ns}:${short}`;
    fs.writeJSON(`BP/items/${short}.json`, B.itemBP(id, { kind: 'food', nutrition: 4, displayName: 'Sky Berry', stack: 16 }), { silent: true });
    fs.write(`RP/textures/items/${short}.png`, await berryTexture(), { silent: true });
    fs.writeJSON('RP/textures/item_texture.json', B.itemTexture(packName, { [short]: { textures: `textures/items/${short}` } }), { silent: true });
    lang[`item.${id}`] = 'Sky Berry';
  }

  if (template === 'block' || template === 'everything') {
    const short = 'glow_stone_block';
    const id = `${ns}:${short}`;
    fs.writeJSON(`BP/blocks/${short}.json`, B.blockBP(id, { hardness: 1.2, light: 15, mapColor: '#ffd76a' }), { silent: true });
    fs.write(`RP/textures/blocks/${short}.png`, await blockTexture(), { silent: true });
    fs.writeJSON('RP/textures/terrain_texture.json', B.terrainTexture(packName, { [short]: { textures: `textures/blocks/${short}` } }), { silent: true });
    fs.writeJSON('RP/blocks.json', { format_version: [1, 1, 0], [id]: { textures: short, sound: 'stone' } }, { silent: true });
    lang[`tile.${id}.name`] = 'Glow Stone Block';
  }

  lang[`pack.name`] = packName;
  fs.write('RP/texts/en_US.lang', B.langLines(lang), { silent: true });
  fs.write('RP/texts/languages.json', JSON.stringify(['en_US'], null, 2), { silent: true });
  fs.write('BP/texts/en_US.lang', B.langLines(lang), { silent: true });
  fs.write('BP/texts/languages.json', JSON.stringify(['en_US'], null, 2), { silent: true });
}

// ------------------------------------------------------------ starter art ---
function draw(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  fn(x, c);
  return new Promise(res => c.toBlob(async b => res(new Uint8Array(await b.arrayBuffer())), 'image/png'));
}

function packIcon(name) {
  return draw(128, 128, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#3b7d2a'); g.addColorStop(1, '#1d3a12');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#6cc349';
    for (let i = 0; i < 8; i++) x.fillRect(i * 16, 24 + ((i * 7) % 3) * 8, 16, 16);
    x.fillStyle = '#84d95e'; x.fillRect(36, 52, 56, 44);
    x.fillStyle = '#12200c'; x.fillRect(48, 64, 10, 10); x.fillRect(70, 64, 10, 10);
    x.fillStyle = '#fff'; x.fillRect(50, 66, 4, 4); x.fillRect(72, 66, 4, 4);
    x.fillStyle = '#12200c'; x.fillRect(54, 84, 20, 5);
  });
}

/** 64×64 texture that lines up with the "blob" starter geometry, complete with a face. */
function mobTexture() {
  return draw(64, 64, (x) => {
    x.clearRect(0, 0, 64, 64);
    const body = '#5eb83f', bodyDark = '#3f8c28', head = '#7ad355', headDark = '#57a83a';
    // head block: uv 0,0  size 10w 8h 10d  -> 40 x 18
    x.fillStyle = head; x.fillRect(0, 0, 40, 18);
    x.fillStyle = headDark; x.fillRect(0, 0, 40, 10);          // top strip = up/down faces
    // face on the north region (x 10..20, y 10..18)
    x.fillStyle = '#12200c'; x.fillRect(12, 12, 2, 2); x.fillRect(17, 12, 2, 2);
    x.fillStyle = '#fff'; x.fillRect(12, 12, 1, 1); x.fillRect(17, 12, 1, 1);
    x.fillStyle = '#12200c'; x.fillRect(14, 15, 4, 1);
    // body: uv 0,20 size 12w 10h 12d -> 48 x 22
    x.fillStyle = body; x.fillRect(0, 20, 48, 22);
    x.fillStyle = bodyDark; x.fillRect(0, 20, 48, 12);
    for (let i = 0; i < 14; i++) {                                  // speckles
      x.fillStyle = i % 2 ? '#8ade63' : '#478f2c';
      x.fillRect(2 + ((i * 5) % 44), 33 + ((i * 3) % 8), 2, 2);
    }
    // legs: uv 0,42 size 4w 3h 4d -> 16 x 7
    x.fillStyle = '#3f8c28'; x.fillRect(0, 42, 16, 7);
  });
}

function berryTexture() {
  return draw(16, 16, (x) => {
    x.clearRect(0, 0, 16, 16);
    x.fillStyle = '#7ca8ff';
    const pts = [[6, 4], [8, 4], [5, 5], [9, 5], [4, 6], [10, 6], [4, 7], [10, 7], [5, 8], [9, 8], [6, 9], [8, 9], [7, 10]];
    for (const [px, py] of pts) x.fillRect(px, py, 2, 2);
    x.fillStyle = '#bcd4ff'; x.fillRect(6, 5, 2, 2);
    x.fillStyle = '#4a7bd6'; x.fillRect(7, 9, 3, 2);
    x.fillStyle = '#6cc349'; x.fillRect(7, 2, 2, 3);
  });
}

function blockTexture() {
  return draw(16, 16, (x) => {
    x.fillStyle = '#6b5a3a'; x.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 30; i++) {
      x.fillStyle = ['#7d6a45', '#5b4c30', '#8a774f'][i % 3];
      x.fillRect((i * 7) % 16, (i * 5) % 16, 2, 2);
    }
    x.fillStyle = '#ffd76a';
    x.fillRect(4, 4, 8, 8);
    x.fillStyle = '#fff3c4'; x.fillRect(6, 6, 4, 4);
    x.fillStyle = '#e0a83c'; x.fillRect(4, 10, 8, 2); x.fillRect(10, 4, 2, 8);
  });
}

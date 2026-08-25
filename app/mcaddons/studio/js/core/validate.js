// The checker. Two jobs:
//   1. parseFriendly() — turn a JSON syntax error into a sentence a child can act on.
//   2. lintProject()   — the cross-file checks Minecraft would otherwise fail on silently.
import { fs, stripComments, extOf } from './fs.js';
import { COMPONENTS, KNOWN_EXTRA, ID_RE } from '../lib/bedrock.js';
import { parseGeoFile } from '../lib/geo.js';

// ------------------------------------------------------------ JSON errors ---

/** @returns {{ok:true,value:any} | {ok:false,line:number,col:number,message:string,fix:string}} */
export function parseFriendly(text) {
  const scan = scanJSON(text);
  if (scan) return { ok: false, ...scan };
  try {
    return { ok: true, value: JSON.parse(stripComments(text)) };
  } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    const pos = m ? parseInt(m[1], 10) : 0;
    const { line, col } = lineCol(text, pos);
    return {
      ok: false, line, col,
      message: 'Minecraft could not read this file: ' + e.message.replace(/ in JSON at position \d+.*/, '') + '.',
      fix: 'Look at line ' + line + ' — something is missing or spelled wrong.'
    };
  }
}

function lineCol(text, pos) {
  const upto = text.slice(0, pos);
  const line = upto.split('\n').length;
  const col = pos - upto.lastIndexOf('\n');
  return { line, col };
}

/** Hand-rolled scan for the mistakes kids actually make, with kind messages. */
function scanJSON(text) {
  const stack = [];
  let i = 0, line = 1, col = 1;
  let lastSignificant = '', lastPos = 0, lastLine = 1;
  const push = (ch) => stack.push({ ch, line, col });
  const step = (n = 1) => { for (let k = 0; k < n; k++) { if (text[i] === '\n') { line++; col = 1; } else col++; i++; } };

  while (i < text.length) {
    const c = text[i];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r') { step(); continue; }
    if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {           // comments allowed
      if (text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') step(); }
      else { step(2); while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) step(); step(2); }
      continue;
    }
    if (c === '‘' || c === '’' || c === '“' || c === '”') {
      return { line, col, message: 'There is a curly quote (' + c + ') on line ' + line + '.',
        fix: 'Minecraft only understands straight quotes: "like this". This usually happens when text is copied from a website or a phone.' };
    }
    if (c === "'") {
      return { line, col, message: "Line " + line + " uses single quotes ' but JSON needs double quotes.",
        fix: 'Change \'like this\' to "like this".' };
    }
    if (c === '"') {
      if (lastSignificant === 'value') return commaHint(line, '"…"');
      const startLine = line;
      step();
      let closed = false;
      while (i < text.length) {
        if (text[i] === '\\') { step(2); continue; }
        if (text[i] === '"') { closed = true; step(); break; }
        if (text[i] === '\n') break;
        step();
      }
      if (!closed) return { line: startLine, col, message: 'A piece of text on line ' + startLine + ' never gets closed.', fix: 'Add a closing " at the end of it.' };
      lastSignificant = 'value'; lastLine = line;
      continue;
    }
    if (c === '{' || c === '[') {
      if (lastSignificant === 'value') return commaHint(line, c);
      push(c); step(); lastSignificant = 'open'; continue;
    }
    if (c === '}' || c === ']') {
      const open = stack.pop();
      const want = c === '}' ? '{' : '[';
      if (!open) return { line, col, message: 'There is an extra ' + c + ' on line ' + line + '.', fix: 'Delete it — every ' + c + ' needs a matching ' + want + ' earlier in the file.' };
      if (open.ch !== want) return { line, col, message: 'Line ' + line + ' closes with ' + c + ' but line ' + open.line + ' opened with ' + open.ch + '.', fix: 'Curly brackets {} and square brackets [] have to match up.' };
      if (lastSignificant === 'comma') return { line, col, message: 'There is a spare comma just before the ' + c + ' on line ' + line + '.', fix: 'The last thing in a list or group must NOT have a comma after it. Delete it.' };
      step(); lastSignificant = 'value'; continue;
    }
    if (c === ',') {
      if (lastSignificant === 'comma') return { line, col, message: 'Two commas in a row on line ' + line + '.', fix: 'Delete one of them.' };
      if (lastSignificant === 'open') return { line, col, message: 'A comma right after a bracket on line ' + line + '.', fix: 'Delete it — a list starts with a value, not a comma.' };
      step(); lastSignificant = 'comma'; continue;
    }
    if (c === ':') { step(); lastSignificant = 'colon'; continue; }
    // bare word / number
    const m = /^[A-Za-z0-9_+\-.]+/.exec(text.slice(i));
    if (m) {
      const word = m[0];
      if (lastSignificant === 'value') return commaHint(line, word);
      if (!/^-?\d/.test(word) && !['true', 'false', 'null'].includes(word)) {
        return { line, col, message: '`' + word + '` on line ' + line + ' is not wrapped in quotes.',
          fix: 'Names and words need quotes around them, like "' + word + '". Only numbers, true, false and null go bare.' };
      }
      step(word.length); lastSignificant = 'value'; continue;
    }
    step();
  }
  if (stack.length) {
    const open = stack[stack.length - 1];
    return { line: open.line, col: open.col,
      message: 'The ' + open.ch + ' opened on line ' + open.line + ' is never closed.',
      fix: 'Add a ' + (open.ch === '{' ? '}' : ']') + ' at the end. Tip: press the Tidy button — matching brackets line up neatly.' };
  }
  return null;
}
function commaHint(line, next) {
  return { line, col: 1, message: 'A comma is missing on or just before line ' + line + '.',
    fix: 'Every item except the last one needs a comma after it, before the next `' + String(next).slice(0, 12) + '`.' };
}

// -------------------------------------------------------------- lint pass ---
const ERR = 'error', WARN = 'warn', TIP = 'tip';
const COMP_IDS = new Set(COMPONENTS.map(c => c.id));

/** @returns {Array<{path,level,title,detail,fix,line?}>} */
export function lintProject() {
  const out = [];
  const add = (path, level, title, detail, fix, line) => out.push({ path, level, title, detail, fix, line });
  const files = fs.list();
  if (!files.length) return out;

  // ---- every JSON file parses
  const parsed = new Map();
  for (const p of files) {
    if (extOf(p) !== 'json') continue;
    const r = parseFriendly(fs.readText(p) || '');
    if (!r.ok) add(p, ERR, 'This file has a typo', r.message, r.fix, r.line);
    else parsed.set(p, r.value);
  }

  // ---- manifests
  for (const kind of ['BP', 'RP']) {
    const p = kind + '/manifest.json';
    const m = parsed.get(p);
    if (!m) { if (!fs.exists(p)) add(p, ERR, 'Missing manifest', `Every pack needs a ${p}.`, 'Use Fix it to create one.'); continue; }
    if (m.format_version !== 2) add(p, WARN, 'Old manifest version', 'This manifest says format_version ' + m.format_version + '.', 'Modern packs use 2.');
    const h = m.header || {};
    if (!isUuid(h.uuid)) add(p, ERR, 'Bad pack ID', 'The header uuid is not a real UUID.', 'Every pack needs its own unique ID. Use Fix it to make one.');
    if (!Array.isArray(h.min_engine_version)) add(p, WARN, 'No minimum version', 'min_engine_version is missing.', 'Add [1, 21, 0] so Minecraft knows how new this pack is.');
    const mods = m.modules || [];
    if (!mods.length) add(p, ERR, 'No modules', 'The manifest has no modules list.', 'A behaviour pack needs a "data" module; a resource pack needs a "resources" module.');
    for (const mod of mods) if (!isUuid(mod.uuid)) add(p, ERR, 'Bad module ID', 'A module uuid is not a real UUID.', 'Use Fix it to make one.');
    const want = kind === 'BP' ? ['data', 'script'] : ['resources'];
    if (mods.length && !mods.some(x => want.includes(x.type))) {
      add(p, ERR, 'Wrong module type', `A ${kind === 'BP' ? 'behaviour' : 'resource'} pack module should be "${want[0]}", not "${mods[0].type}".`, 'Change the module type.');
    }
  }
  const bpm = parsed.get('BP/manifest.json'), rpm = parsed.get('RP/manifest.json');
  if (bpm && rpm && bpm.header && rpm.header && bpm.header.uuid === rpm.header.uuid) {
    add('BP/manifest.json', ERR, 'Both packs share one ID', 'The behaviour pack and resource pack have the same uuid.', 'They must be different, or Minecraft will only load one of them.');
  }
  if (fs.list('BP/scripts/').length && bpm && !(bpm.modules || []).some(m => m.type === 'script')) {
    add('BP/manifest.json', ERR, 'Scripts will not run', 'There are script files but the manifest has no "script" module.', 'Add a script module with an entry of scripts/main.js.');
  }

  // ---- geometry
  const geoIds = new Map();  // "geometry.x" -> path
  for (const p of fs.findAll('RP/models/**/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    const models = parseGeoFile(j);
    if (!models.length) { add(p, WARN, 'No model inside', 'This file is in the models folder but has no bones.', 'A model file needs a "minecraft:geometry" list.'); continue; }
    for (const g of models) {
      geoIds.set(g.identifier, p);
      if (!/^geometry\./.test(g.identifier)) add(p, ERR, 'Model name is wrong', `"${g.identifier}" must start with "geometry."`, 'Rename it to geometry.' + g.identifier.replace(/^geometry\./, ''));
      const names = new Set(g.bones.map(b => b.name));
      for (const b of g.bones) {
        if (b.parent && !names.has(b.parent)) add(p, ERR, 'Bone has a missing parent', `Bone "${b.name}" says its parent is "${b.parent}", which is not in this model.`, 'Check the spelling in the Model tool.');
        for (const c of b.cubes) {
          if (Array.isArray(c.uv)) {
            const w = Math.abs(c.size[0]), h = Math.abs(c.size[1]), d = Math.abs(c.size[2]);
            if (c.uv[0] + 2 * (w + d) > g.tw || c.uv[1] + d + h > g.th) {
              add(p, WARN, 'A box hangs off the texture', `A cube in bone "${b.name}" needs texture space that does not exist.`, `Make the texture bigger than ${g.tw}×${g.th}, or move the box's UV.`);
            }
          }
        }
      }
      const png = fs.findAll('RP/textures/entity/*.png')[0];
      if (png) { /* size check happens in the model tool where the image is loaded */ }
    }
  }

  // ---- animations
  const animIds = new Map();
  for (const p of fs.findAll('RP/animations/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    for (const name of Object.keys(j.animations || {})) {
      animIds.set(name, p);
      if (!/^animation\./.test(name)) add(p, ERR, 'Animation name is wrong', `"${name}" must start with "animation."`, 'Rename it to animation.' + name);
    }
  }

  // ---- render controllers
  const rcIds = new Set();
  for (const p of fs.findAll('RP/render_controllers/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    for (const name of Object.keys(j.render_controllers || {})) rcIds.add(name);
  }

  // ---- entities: BP and RP have to agree
  const bpEntities = new Map();
  for (const p of fs.findAll('BP/entities/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    const e = j['minecraft:entity'];
    if (!e) { add(p, ERR, 'Not a mob file', 'This file has no "minecraft:entity" inside.', 'Behaviour files for mobs start with "minecraft:entity".'); continue; }
    const id = e.description && e.description.identifier;
    if (!id || !ID_RE.test(id)) {
      add(p, ERR, 'Bad mob name', `"${id}" is not a valid identifier.`, 'It must look like mypack:my_mob — all lowercase, no spaces, one colon.');
      continue;
    }
    if (id.startsWith('minecraft:')) add(p, ERR, 'Reserved name', `You cannot call your own mob "${id}".`, 'The minecraft: namespace belongs to the game. Use your own, e.g. mypack:' + id.split(':')[1] + '.');
    bpEntities.set(id, p);
    const comps = e.components || {};
    if (!comps['minecraft:physics']) add(p, WARN, 'Mob may float', 'This mob has no minecraft:physics.', 'Without physics it ignores gravity and walls.');
    if (!comps['minecraft:health']) add(p, WARN, 'No health', 'This mob has no minecraft:health.', 'Add it or the mob dies instantly in some situations.');
    if (e.description.is_summonable === false) add(p, TIP, 'Cannot be summoned', 'is_summonable is false, so /summon will not work.', 'Set it to true while you are testing.');
    for (const key of Object.keys(comps)) {
      if (!key.startsWith('minecraft:')) { add(p, ERR, 'Component missing its namespace', `"${key}" should start with "minecraft:".`, 'Rename it to minecraft:' + key); continue; }
      if (!COMP_IDS.has(key) && !KNOWN_EXTRA.has(key) && !key.startsWith('minecraft:behavior.') && !key.startsWith('minecraft:navigation.') && !key.startsWith('minecraft:movement.') && !key.startsWith('minecraft:ambient_sound')) {
        const near = closest(key, [...COMP_IDS]);
        add(p, WARN, 'Unknown component', `Minecraft may not know "${key}".`, near ? `Did you mean "${near}"?` : 'Check the spelling against the component list.');
      }
    }
  }

  const rpEntities = new Map();
  for (const p of fs.findAll('RP/entity/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    const d = j['minecraft:client_entity'] && j['minecraft:client_entity'].description;
    if (!d) { add(p, ERR, 'Not a look file', 'This file has no "minecraft:client_entity".', 'Files in RP/entity describe how a mob looks.'); continue; }
    rpEntities.set(d.identifier, p);
    for (const [k, g] of Object.entries(d.geometry || {})) {
      if (!geoIds.has(g)) add(p, ERR, 'Model not found', `This mob wants the model "${g}" but nothing makes it.`, `Check RP/models/entity/ — the model file must contain an identifier of exactly "${g}".`);
    }
    for (const [k, t] of Object.entries(d.textures || {})) {
      const png = 'RP/' + String(t).replace(/^\/*/, '') + '.png';
      if (!fs.exists(png)) add(p, ERR, 'Texture not found', `This mob wants the picture "${t}" but there is no ${png}.`, 'Paint one in the Paint tool, or fix the path. Do not put ".png" in the JSON.');
    }
    for (const [k, a] of Object.entries(d.animations || {})) {
      if (typeof a === 'string' && a.startsWith('animation.') && !animIds.has(a)) {
        add(p, ERR, 'Animation not found', `This mob wants "${a}" but no animation file has it.`, 'Make it in the Animate tool, or fix the name.');
      }
    }
    for (const rc of d.render_controllers || []) {
      const name = typeof rc === 'string' ? rc : Object.keys(rc)[0];
      if (name.startsWith('controller.render.') && !rcIds.has(name)) {
        add(p, ERR, 'Render controller not found', `"${name}" does not exist.`, 'Every mob needs a render controller that says which model, texture and material to use.');
      }
    }
    const scripts = d.scripts && d.scripts.animate;
    if (scripts) for (const s of scripts) {
      const key = typeof s === 'string' ? s : Object.keys(s)[0];
      if (!(d.animations || {})[key]) add(p, WARN, 'Animation is not listed', `scripts.animate runs "${key}" but it is not in the animations list above.`, 'Add it to "animations" first with a short name.');
    }
  }

  for (const [id, p] of bpEntities) if (!rpEntities.has(id)) {
    add(p, ERR, 'Mob has no look', `"${id}" exists in the behaviour pack but nothing says what it looks like.`, 'It will be invisible in game. Add an RP/entity file (the Mob wizard does this for you).');
  }
  for (const [id, p] of rpEntities) if (!bpEntities.has(id)) {
    add(p, WARN, 'Look with no mob', `"${id}" describes how a mob looks, but no behaviour file creates it.`, 'Add a BP/entities file, or delete this one.');
  }

  // ---- items
  const itemTex = parsed.get('RP/textures/item_texture.json');
  for (const p of fs.findAll('BP/items/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    const it = j['minecraft:item']; if (!it) { add(p, ERR, 'Not an item file', 'No "minecraft:item" inside.', 'Item files start with "minecraft:item".'); continue; }
    const id = it.description && it.description.identifier;
    if (!id || !ID_RE.test(id)) { add(p, ERR, 'Bad item name', `"${id}" is not a valid identifier.`, 'Use mypack:my_item — lowercase, one colon.'); continue; }
    const icon = it.components && it.components['minecraft:icon'];
    const iconName = typeof icon === 'string' ? icon : icon && (icon.texture || icon.textures);
    if (!iconName) add(p, WARN, 'Item has no picture', 'There is no minecraft:icon component.', 'Without it the item shows as a purple-and-black square.');
    else {
      const entry = itemTex && itemTex.texture_data && itemTex.texture_data[iconName];
      if (!entry) add(p, ERR, 'Icon is not registered', `"${iconName}" is not listed in RP/textures/item_texture.json.`, 'Every item picture has to be listed there before the game can find it.');
      else {
        const t = Array.isArray(entry.textures) ? entry.textures[0] : entry.textures;
        if (t && !fs.exists('RP/' + t + '.png')) add(p, ERR, 'Icon file missing', `item_texture.json points at ${t}.png, which does not exist.`, 'Paint it in the Paint tool.');
      }
    }
  }

  // ---- blocks
  const terrain = parsed.get('RP/textures/terrain_texture.json');
  for (const p of fs.findAll('BP/blocks/*.json')) {
    const j = parsed.get(p); if (!j) continue;
    const b = j['minecraft:block']; if (!b) { add(p, ERR, 'Not a block file', 'No "minecraft:block" inside.', 'Block files start with "minecraft:block".'); continue; }
    const id = b.description && b.description.identifier;
    if (!id || !ID_RE.test(id)) { add(p, ERR, 'Bad block name', `"${id}" is not a valid identifier.`, 'Use mypack:my_block.'); continue; }
    const mi = b.components && b.components['minecraft:material_instances'];
    if (!mi) add(p, WARN, 'Block has no texture', 'There is no minecraft:material_instances.', 'Without it the block is purple and black.');
    else {
      for (const inst of Object.values(mi)) {
        const t = inst && inst.texture;
        if (!t) continue;
        const entry = terrain && terrain.texture_data && terrain.texture_data[t];
        if (!entry) add(p, ERR, 'Block texture not registered', `"${t}" is not in RP/textures/terrain_texture.json.`, 'Add it there so the game can find the picture.');
        else {
          const tx = Array.isArray(entry.textures) ? entry.textures[0] : entry.textures;
          if (tx && !fs.exists('RP/' + tx + '.png')) add(p, ERR, 'Block picture missing', `terrain_texture.json points at ${tx}.png, which does not exist.`, 'Paint it in the Paint tool.');
        }
      }
    }
  }

  // ---- names
  const lang = fs.readText('RP/texts/en_US.lang') || '';
  for (const [id] of bpEntities) if (!lang.includes(`entity.${id}.name`)) {
    add('RP/texts/en_US.lang', TIP, 'Mob has no display name', `Nothing names "${id}" in the language file.`, `Add entity.${id}.name=Your Name Here or it shows as a raw identifier in game.`);
  }

  const order = { error: 0, warn: 1, tip: 2 };
  out.sort((a, b) => order[a.level] - order[b.level] || a.path.localeCompare(b.path));
  return out;
}

function isUuid(s) { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export function closest(word, list) {
  let best = null, bestD = 4;
  for (const w of list) {
    const d = lev(word, w);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[m][n];
}

/** Pretty-print JSON the way Bedrock files are usually written. */
export function tidy(text) {
  const r = parseFriendly(text);
  if (!r.ok) return null;
  return JSON.stringify(r.value, null, 2) + '\n';
}

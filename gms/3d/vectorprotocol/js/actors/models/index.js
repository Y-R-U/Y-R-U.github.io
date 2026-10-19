// Unit model registry: one file per unit in this folder (js/actors/models/<id>.js), default-exporting a model def.
// Sculptor agents replace their own <id>.js only. Add a new unit = add its file + one line here.
import bulwark from './bulwark.js';
import paladin from './paladin.js';
import gunner from './gunner.js';
import lancer from './lancer.js';
import patch from './patch.js';
import scrapper from './scrapper.js';
import riot from './riot.js';
import barb from './barb.js';
import tarantula from './tarantula.js';
import jammer from './jammer.js';
import phase from './phase.js';
import prism from './prism.js';
import oracle from './oracle.js';
import halo from './halo.js';
import drone from './drone.js';
// D21 fantasy (realm 'fantasy') — organic stubs for fantasy sculptors
import knight from './knight.js';
import elf_ranger from './elf_ranger.js';
import elf_sage from './elf_sage.js';
import treant from './treant.js';
import minotaur from './minotaur.js';
import shaman from './shaman.js';
import wolf from './wolf.js';
import { fromArch, ARCH } from '../kit.js';

export const LAUNCH_IDS = ['bulwark', 'paladin', 'gunner', 'lancer', 'patch', 'scrapper', 'riot', 'barb', 'tarantula', 'jammer', 'phase', 'prism', 'oracle', 'halo'];
export const MODELS = {};
const AUTO = {};
for (const m of [bulwark, paladin, gunner, lancer, patch, scrapper, riot, barb, tarantula, jammer, phase, prism, oracle, halo, drone, knight, elf_ranger, elf_sage, treant, minotaur, shaman, wolf]) register(m);
import warden from './warden.js'; register(warden);
import warlord from './warlord.js'; register(warlord);
import widowmaker from './widowmaker.js'; register(widowmaker);
import rattler from './rattler.js'; register(rattler);
import juggernaut from './juggernaut.js'; register(juggernaut);
import sparkplug from './sparkplug.js'; register(sparkplug);
import aegis from './aegis.js'; register(aegis);
import husk from './husk.js'; register(husk);
import meridian from './meridian.js'; register(meridian);
import citadel from './citadel.js'; register(citadel);
import pyre from './pyre.js'; register(pyre);
import needle from './needle.js'; register(needle);
import specter from './specter.js'; register(specter);
import seraph from './seraph.js'; register(seraph);
import wisp from './wisp.js'; register(wisp);
import monolith from './monolith.js'; register(monolith);
import executor from './executor.js'; register(executor);
import singularity from './singularity.js'; register(singularity);
import kingpin from './kingpin.js'; register(kingpin);
import leviathan from './leviathan.js'; register(leviathan);
import paragon from './paragon.js'; register(paragon);
import arbiter from './arbiter.js'; register(arbiter);

export function register(m) {
  if (!m?.id || !m.build) throw new Error('models: bad model def ' + m?.id);
  MODELS[m.id] = { realm: 'scifi', rarity: 'common', scheme: 'dark', opts: {}, style: {}, sockets: {}, ...m };
  return MODELS[m.id];
}

// Unknown ids (roster units not built yet, enemy grunts, fantasy) get a stand-in from role + locomotion hints.
const BY_ROLE = { tank: 'tank', archer: 'archer', mage: 'mage' };
const BY_LOCO = { hover: 'mage', quad: 'spider', tracked: 'tracked' };
export function modelDef(id, hint = {}) {
  if (MODELS[id]) return MODELS[id];
  const arch = (hint.loco && BY_LOCO[hint.loco]) || BY_ROLE[hint.role] || 'tank';
  const key = `${id}|${arch}`;
  if (!AUTO[key]) AUTO[key] = { scheme: 'dark', ...fromArch(arch, { id, name: id, role: hint.role || 'tank', faction: hint.faction || 'corporate', rarity: hint.rarity || 'common', stub: true, auto: true }) };
  return AUTO[key];
}
export { ARCH };

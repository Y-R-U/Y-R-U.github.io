import { THREE, syncColliders, place, tickHighlight, setPropQuality } from './util.js';
import { activatable } from './ch2.js';
import { createTable, createBench } from './table.js';
import { createChair } from './chair.js';
import { createPlate } from './plate.js';
import { createPan } from './pan.js';
import { createCatBowl } from './catBowl.js';
import { createVase } from './vase.js';
import { createCurtains } from './curtains.js';
import { createWindow } from './window.js';
import { createFridge } from './fridge.js';
import { createVine } from './vine.js';
import { createBedroomDoor, createFrontDoor, createLymanDoor, createCupboardDoor } from './doors.js';
import { createDresser, createSocks, createLauncher, createOdieBowl, createSoupBowl, createTvBox, createCarpet, createBiscuitBox, createCheese, createMouseHoles, createShed, createFurPile, createCoffeeMug, createSuitcase, createWhistle } from './ch2.js';
import { createJonBed, createGarfieldBed } from './beds.js';
import { createTV } from './tv.js';
import { createNewspaperProp, createNewspaper } from './newspaper.js';

export { createNewspaper };

// Builds every prop, adds it to the scene at its anchor, returns Map id → prop.
// anchors: Map name → {pos:Vector3, rotY, ...}. Missing anchors fall back to a gallery layout at the origin.
export async function createProps({ scene, quality = 'high', anchors = new Map(), sfx = null } = {}) {
  setPropQuality(quality);
  const props = new Map();
  const A = n => anchors.get?.(n);
  const ctxFor = anchorName => ({ scene, quality, sfx, anchors, floorY: A(anchorName)?.pos ? Math.floor(A(anchorName).pos.y / 2.5) * 3 : 0 });
  const add = (p, anchorName) => {
    const a = A(anchorName);
    if (p.place && a) p.place(a); else place(p, a);
    scene.add(p.root);
    if (p.place && a) p.place(a); // second call records the real parent for reset()
    props.set(p.id, p);
    return p;
  };

  add(createTable(ctxFor('tableTop')), 'tableTop');
  const t = props.get('table');
  if (A('tableTop')) t.root.position.y = A('tableTop').pos.y - t.topY; // tableTop anchor is on the surface
  add(createBench(ctxFor('kitchenBench')), 'kitchenBench');
  add(createChair(ctxFor('jonChair')), 'jonChair');
  add(createPlate(ctxFor('plateSpot')), 'plateSpot');
  add(createPan(ctxFor('panSpot')), A('panSpot') ? 'panSpot' : 'tableTop');
  add(createCatBowl(ctxFor('catBowl')), 'catBowl');
  add(createVase(ctxFor('vase')), 'vase');
  const ca = A('curtains');
  add(createCurtains(ctxFor('window'), { width: ca?.w ?? 2.0, height: ca?.h ?? 2.3, openingW: A('window')?.w ?? 1.2 }), 'curtains');
  const wa = A('window');
  add(createWindow(ctxFor('window'), { w: wa?.w ?? 1.2, h: wa?.h ?? 1.2 }), 'window');
  add(createFridge(ctxFor('fridgeFront')), 'fridgeFront');
  add(createVine({ scene, quality, sfx, ceilingY: A('ceiling')?.pos?.y }, { anchors }), null);
  add(createBedroomDoor(ctxFor('bedroomDoor')), 'bedroomDoor');
  add(createFrontDoor(ctxFor('frontDoor')), 'frontDoor');
  add(createJonBed(ctxFor('jonBed')), 'jonBed');
  add(createGarfieldBed(ctxFor('garfieldBed')), 'garfieldBed');
  add(createTV(ctxFor('tv')), 'tv');
  add(createNewspaperProp(ctxFor(null)), null);

  // ---- Chapter Two (always-present furniture first, then Ch2-only props that start inactive) ----
  if (A('lymanDoor')) add(createLymanDoor(ctxFor('lymanDoor')), 'lymanDoor');
  if (A('cupboardDoor')) add(createCupboardDoor(ctxFor('cupboardDoor'), { w: A('cupboardDoor').w, h: A('cupboardDoor').h, block: A('cupboardDoor').block }), 'cupboardDoor');
  if (A('dresser')) {
    const dr = add(createDresser(ctxFor('dresser')), 'dresser');
    add(createSocks(ctxFor('dresser'), dr), null);
    const l = add(createLauncher(ctxFor('dresser')), null);
    dr.launcher = l;
    dr.breakDrawer.group.add(l.root); l.root.position.set(0.05, 0.05, -0.12); l.root.rotation.set(0, 0.4, 0);
    Object.assign(l.home, { parent: dr.breakDrawer.group, pos: l.root.position.clone(), rotY: 0.4 });
  }
  if (A('biscuitBox')) add(createBiscuitBox(ctxFor('biscuitBox')), 'biscuitBox');
  const ch2 = [];
  const add2 = (p, a) => {
    if (a !== null && !A(a)) return p;
    add(p, a); ch2.push(p);
    if (!p.setActive) { activatable(p, false); const r0 = p.reset; p.reset = () => { r0(); p.setActive(p.defaultActive); }; }
    return p;
  };
  const c2 = add2(createChair(ctxFor('lymanChair'), 'chair2'), 'lymanChair');
  const p2 = add2(createPlate(ctxFor('plateSpot2'), 'plate2'), 'plateSpot2');
  add2(createOdieBowl(ctxFor('odieBowl')), 'odieBowl');
  add2(createCarpet(ctxFor('carpet')), 'carpet');
  add(createSoupBowl(ctxFor('soupSpot')), 'soupSpot');
  add(createTV(ctxFor('tv'), 'newTv'), 'tv');
  add(createTvBox(ctxFor('tvBoxSpot')), 'tvBoxSpot');
  add(createCheese(ctxFor(null)), null);
  add2(createMouseHoles(ctxFor(null)), null);
  add(createShed(ctxFor(null)), null);
  add(createFurPile(ctxFor('furPileSpot')), 'furPileSpot');
  add(createCoffeeMug(ctxFor('mugSpot')), 'mugSpot');
  add(createSuitcase(ctxFor('suitcaseSpot')), 'suitcaseSpot');
  add(createWhistle(ctxFor('whistleSpot')), 'whistleSpot');

  // wiring
  t.riders = [props.get('plate'), props.get('pan'), props.get('plate2'), props.get('soupBowl')].filter(Boolean);
  props.get('window').curtains = props.get('curtains');
  props.get('pan').fridgeSlot = props.get('fridge').slot;
  // the lasagna pan only exists on lasagna levels
  const plate = props.get('plate'), pan = props.get('pan');
  const setFood0 = plate.setFood;
  plate.setFood = k => { setFood0(k); pan.root.visible = k === 'lasagna' || pan.state.inFridge; };
  plate.setFood('steak');
  props.get('plate2')?.setFood('steak');
  // Ch2: the new TV is the same CRT; the old one rides the carpet once swapped
  const newTv = props.get('newTv'), oldTv = props.get('tv'), carpet = props.get('carpet');
  if (newTv) {
    activatable(newTv, false);
    const r0 = newTv.reset; newTv.reset = () => { r0(); newTv.setActive(newTv.defaultActive); };
  }
  if (carpet) carpet.load = oldTv;
  // chapter switch: Ch2 dining set + Odie's bowl + carpet + mouse holes on, everything else is level-driven
  // plate2 stays level-driven (only Ch2 L1 serves two dinners): props.get('plate2').setActive(true)
  props.setChapter = n => { for (const p of ch2) { if (p.id === 'plate2') continue; p.defaultActive = n >= 2; p.setActive(n >= 2); } };
  // L5 swap: old TV onto the carpet, the new one onto the stand
  props.swapTv = () => { if (A('oldTvSpot')) oldTv.moveTo(A('oldTvSpot')); newTv?.setActive(true); syncColliders(oldTv); };

  scene.updateMatrixWorld(true);
  if (quality !== 'high') trimShadowCasters(props);
  for (const p of props.values()) syncColliders(p);
  return props;
}

// Medium/low: small parts and props flush with walls don't cast (each caster is an extra shadow-pass draw call).
const NO_CAST = new Set(['frontDoor', 'window', 'curtains', 'vase', 'catBowl', 'tv', 'newspaper', 'plate', 'pan', 'plate2', 'odieBowl', 'soupBowl', 'carpet', 'mouseHoles', 'cheese', 'coffeeMug', 'whistle', 'socks', 'spitballLauncher', 'newTv', 'biscuitBox', 'cupboardDoor', 'chair2']);
function trimShadowCasters(props) {
  const sc = new THREE.Vector3();
  for (const p of props.values()) {
    p.root.traverse(o => {
      if (!o.isMesh || !o.castShadow) return;
      if (NO_CAST.has(p.id)) { o.castShadow = false; return; }
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.getWorldScale(sc);
      if (o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) < 0.22) o.castShadow = false;
    });
  }
}

export function updateProps(props, dt) {
  tickHighlight(dt);
  for (const p of props.values()) {
    const busy = p.anim.busy;
    p.update(dt);
    if (busy || p.anim.busy || p._dyn) syncColliders(p);
  }
}

export function resetProps(props) { for (const p of props.values()) p.reset(); for (const p of props.values()) syncColliders(p); }
export function allColliders(props) { return [...props.values()].flatMap(p => p.colliders); }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quality } from '../engine/quality.js';
import { resolve, pickPreset, setDial, autoChoice, PRESET_ORDER, SHADOW_ROWS, AUTO_MIN_FPS } from './graphics.js';
import { blank, clampAll } from './save.js';

const settings = patch => ({ ...blank(1).settings, ...patch });

test('a fresh save has made no quality choice, so the engine device guess stands', () => {
  assert.equal(blank(1).settings.preset, null);
  assert.equal(resolve(blank(1).settings, 'high').preset, 'high');
  assert.equal(resolve(blank(1).settings).preset, 'medium', 'and medium when there is no guess either');
});

test('a chosen preset beats the device guess and survives a round trip through the save', () => {
  const doc = clampAll({ settings: { preset: 'low' } });
  assert.equal(doc.settings.preset, 'low');
  assert.equal(resolve(doc.settings, 'ultra').preset, 'low');
});

test('a save carrying the dropped softhigh shadow mode comes back reading Soft', () => {
  const doc = clampAll({ settings: { preset: 'ultra', shadows: 'softhigh' } });
  assert.equal(doc.settings.shadows, 'soft');
  const g = resolve(doc.settings);
  assert.equal(g.shadows, 'soft');
  assert.equal(g.custom, false, 'ultra is plain soft now, so it is not an override');
  assert.ok(SHADOW_ROWS.some(([v]) => v === g.shadows), 'and the row has a button to highlight');
});

test('softhigh still reads Soft when it reaches the row live, off a preset that is not soft', () => {
  const g = resolve({ preset: 'low', shadows: 'softhigh' });
  assert.equal(g.shadows, 'soft');
  assert.equal(g.custom, true, 'low is hard, so soft is an override');
  assert.ok(SHADOW_ROWS.some(([v]) => v === g.shadows));
});

test('every preset points at a shadow mode the row can highlight', () => {
  for (const name of PRESET_ORDER) {
    const g = resolve(pickPreset(name));
    assert.ok(SHADOW_ROWS.some(([v]) => v === g.shadows), `${name} asks for ${g.shadows}`);
  }
});

test('rubbish in the settings block is dropped back to no choice', () => {
  const doc = clampAll({ settings: { preset: 'blistering', shadows: 'lovely', renderScale: 9 } });
  assert.equal(doc.settings.preset, null);
  assert.equal(doc.settings.shadows, null);
  assert.equal(doc.settings.renderScale, 1.25, 'out of range is clamped, not dropped');
});

test('a preset with no dial overrides reports itself, never Custom', () => {
  for (const name of PRESET_ORDER) {
    const g = resolve(settings(pickPreset(name)));
    assert.equal(g.preset, name);
    assert.equal(g.custom, false);
    assert.equal(g.label, Quality.presets[name].label);
    assert.equal(g.renderScale, Quality.presets[name].renderScale);
  }
});

test('moving a dial off the preset says Custom, and moving it back says the preset again', () => {
  let st = settings(pickPreset('high'));
  assert.equal(resolve(st).custom, false);

  st = { ...st, ...setDial(st, 'shadows', 'off') };
  assert.equal(resolve(st).custom, true);
  assert.equal(resolve(st).label, 'Custom');
  assert.equal(resolve(st).preset, 'high', 'the preset underneath is unchanged');

  st = { ...st, ...setDial(st, 'shadows', Quality.presets.high.shadows) };
  assert.equal(resolve(st).custom, false, 'back on the preset value is not an override');
  assert.equal(st.shadows, null);
});

test('picking a preset clears the dials, so the picker can never leave the label reading Custom', () => {
  let st = settings({ preset: 'high' });
  st = { ...st, ...setDial(st, 'renderScale', 0.5) };
  assert.equal(resolve(st).custom, true);
  st = { ...st, ...pickPreset('low') };
  assert.deepEqual([st.renderScale, st.shadows], [null, null]);
  assert.equal(resolve(st).custom, false);
  assert.equal(resolve(st).preset, 'low');
});

test('touching a dial writes the preset down, so the auto-detect stops treating the save as undecided', () => {
  const st = blank(1).settings;
  assert.equal(st.preset, null);
  assert.equal(setDial(st, 'renderScale', 0.5, 'high').preset, 'high');
});

test('the auto-detect drops one step when the frame rate is short and leaves it alone when it is not', () => {
  assert.deepEqual(autoChoice(AUTO_MIN_FPS, 'medium'), { preset: 'medium', lowered: false });
  assert.deepEqual(autoChoice(28, 'medium'), { preset: 'low', lowered: true });
  assert.deepEqual(autoChoice(28, 'high'), { preset: 'medium', lowered: true });
  assert.deepEqual(autoChoice(9, 'potato'), { preset: 'potato', lowered: true }, 'there is nothing below potato');
  assert.equal(autoChoice(0, 'medium'), null, 'no measurement is not a verdict');
});

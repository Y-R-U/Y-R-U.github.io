import { test, eq, ok } from '../../tools/harness.mjs';
import { resolve, setDial, pickPreset, autoChoice, labelOf, PRESET_ORDER } from './graphics.js';
import { Quality } from '../engine/quality.js';

test('a save with no preset resolves to the device fallback', () => {
  const g = resolve({}, 'high');
  eq(g.preset, 'high');
  eq(g.custom, false);
  eq(g.renderScale, Quality.presets.high.renderScale);
});

test('an unknown preset name falls back rather than throwing', () => {
  eq(resolve({ preset: 'wibble' }, 'low').preset, 'low');
  eq(resolve({ preset: 'wibble' }, 'nonsense').preset, 'medium');
  eq(labelOf('wibble'), Quality.presets.medium.label);
});

test('a dial off the preset value makes the label Custom', () => {
  const g = resolve({ preset: 'medium', shadows: 'off' }, 'high');
  eq(g.custom, true);
  eq(g.label, 'Custom');
  eq(g.shadows, 'off');
  eq(g.renderScale, Quality.presets.medium.renderScale, 'the untouched dial still comes from the preset');
});

test('picking a preset clears both overrides', () => {
  eq(pickPreset('potato'), { preset: 'potato', renderScale: null, shadows: null });
});

test('a dial put back on the preset value stops being an override', () => {
  const base = { preset: 'medium', shadows: 'off' };
  const back = setDial(base, 'shadows', Quality.presets.medium.shadows, 'high');
  eq(back.shadows, null);
  eq(resolve({ ...base, ...back }, 'high').custom, false);
});

test('touching a dial writes the preset down, so auto-detect leaves the save alone', () => {
  eq(setDial({}, 'renderScale', 0.75, 'high').preset, 'high');
});

test('auto-detect steps down one preset only when the frame rate is short', () => {
  eq(autoChoice(60, 'high'), { preset: 'high', lowered: false });
  eq(autoChoice(22, 'high'), { preset: 'medium', lowered: true });
  eq(autoChoice(22, 'potato'), { preset: 'potato', lowered: true }, 'potato is the floor');
  eq(autoChoice(0, 'high'), null, 'no measurement, no change');
});

test('every preset in the order really exists', () => {
  ok(PRESET_ORDER.every(n => Quality.presets[n]));
});

import { defineLevel } from './common.js';
import { sillHelpers, vaseLevel } from './shared.js';

// Windowsill → knock the vase off → eat while Jon looks at the mess.
export default defineLevel({
  id: 3, food: 'lasagna', title: 'Oops, Vase',
  objectives: ['Jump onto the windowsill', 'Knock the vase off', "Eat Jon's lasagna"],
  hints: ['l03_hint_1', 'l03_hint_2', 'l03_hint_3'],
  canEat: (L) => L.flags.vaseBroken && L.ai.distracted(),
  setup(L) {
    const sill = sillHelpers(L);
    L.flags.sill = sill;
    sill.onLand(() => L.obj(0));
    vaseLevel(L, {
      objIndex: 1,
      onBroken: (frag) => {
        L.ai.investigate(frag, {
          dur: 9, arriveLine: 'j_vase_see', lookLines: [null, 'j_vase_sweep'],
          onDone: () => { L.ai.goHome(); },
        });
        L.say('j_vase_hear', { force: true });
      },
      spareLine: 'j_vase_spare',
    });
  },
  update(L) {
    const { flags } = L;
    if (flags.sill.isOn()) L.obj(0);
    if (flags.vaseBroken && L.ai.distracted()) L.target((o) => o.copy(L.foodPos()), { height: 0.4 });
    else if (!flags.sill.isOn()) L.target((o) => o.copy(flags.sill.pos()), { height: 0.4 });
    else L.target((o) => o.copy(flags.vasePos()), { height: 0.45 });
  },
});

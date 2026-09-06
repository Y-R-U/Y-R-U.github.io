import { test, eq, ok } from '../../tools/harness.mjs';
import { optionsFor } from './interactmenu.js';

const ids = o => o.map(x => x.id);
const on = o => o.filter(x => x.enabled).map(x => x.id);

test('the menu always offers the same three, in the same order', () => {
  eq(ids(optionsFor({})), ['spell', 'talk', 'trade']);
  eq(ids(optionsFor({ target: { name: 'Vail' }, abilities: [1, 2], canTrade: true })), ['spell', 'talk', 'trade']);
});

// A menu that changes shape every time you open it is a menu you have to read every time. What
// changes is whether an entry is available, and it says why it is not.
test('an entry that is not available is shown, disabled, with a reason', () => {
  const o = optionsFor({});
  eq(on(o), []);
  for (const x of o) ok(x.note && x.note.length > 3, `${x.id} is disabled with no reason`);
  ok(/no essences/i.test(o[0].note));
  ok(/nobody in reach/i.test(o[1].note));
  ok(/nobody here trades/i.test(o[2].note));
});

test('talking needs somebody, and names them', () => {
  const o = optionsFor({ target: { name: 'Speak to Registrar Vail' } });
  eq(on(o), ['talk']);
  eq(o[1].note, 'Speak to Registrar Vail');
});

test('casting needs an awakened ability, and counts them', () => {
  eq(on(optionsFor({ abilities: [] })), []);
  const o = optionsFor({ abilities: [1, 2, 3, 4] });
  eq(on(o), ['spell']);
  ok(/4 awakened/.test(o[0].note), o[0].note);
  ok(/1 awakened/.test(optionsFor({ abilities: [1] })[0].note), 'it should not say "1 awakeneds"');
});

// There is no economy yet, and the menu must not pretend otherwise by opening an empty ledger.
test('trading stays shut until something can trade', () => {
  eq(on(optionsFor({ canTrade: false })), []);
  eq(on(optionsFor({ canTrade: true })), ['trade']);
});

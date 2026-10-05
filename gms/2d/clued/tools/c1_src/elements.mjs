// All 118 elements: numeric facts come from PubChem's periodic table; the hand-written clues cover the best-known ones.
import { getJSON } from '../c1_lib.mjs';
import { WD, COMMONS } from './_common.mjs';

const d = await getJSON('https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON');
const cols = d.Table.Columns.Column;
const rows = d.Table.Row.map(r => Object.fromEntries(cols.map((k, i) => [k, r.Cell[i]])));

function position(z) {
  const starts = [1, 3, 11, 19, 37, 55, 87], ends = [2, 10, 18, 36, 54, 86, 118];
  const p = ends.findIndex(e => z <= e) + 1;
  const i = z - starts[p - 1];
  if (p === 1) return { period: 1, group: z === 1 ? 1 : 18 };
  if (p <= 3) return { period: p, group: i < 2 ? i + 1 : i + 11 };
  if (p <= 5) return { period: p, group: i + 1 };
  if (i < 2) return { period: p, group: i + 1 };
  if ((z >= 57 && z <= 71) || (z >= 89 && z <= 103)) return { period: p, group: null };
  return { period: p, group: z - (p === 6 ? 68 : 100) };
}

// Hand-written, checked facts: [difficulty, blurb, clues hard→easy]
const H = {
  1: [1, 'The lightest and most common element in the universe. Stars like the Sun are mostly made of it.', ['It makes up about three-quarters of the normal matter in the universe.', 'The Hindenburg airship was filled with it.', 'It is the fuel that powers the Sun.', 'Water is made of it and oxygen.', 'It is the first element in the periodic table.']],
  2: [1, 'A light, unreactive gas that makes balloons float and voices squeaky. It was found in the Sun before it was found on Earth.', ['It was discovered in sunlight before it was found on Earth.', 'Its name comes from the Greek word for the Sun.', 'Liquid forms of it cool MRI magnets.', 'Breathing it makes your voice squeaky.', 'It makes party balloons float.']],
  3: [2, 'The lightest metal. It powers the rechargeable batteries in phones and electric cars.', ['It is so light it floats on oil.', 'It is used as a medicine for some mood disorders.', 'It is soft enough to cut with a knife.', 'It is the lightest metal.', 'Phone and car batteries are named after it.']],
  6: [1, 'The element of life. Diamonds, graphite and coal are all made of it.', ['A type of it is used to date ancient objects.', 'Graphite in pencils is made of it.', 'Diamonds are made of it.', 'All living things are built around it.', 'Its dioxide is a greenhouse gas.']],
  7: [1, 'The gas that makes up about 78% of the air. Liquid nitrogen is cold enough to freeze things instantly.', ['It is a key part of fertilisers.', 'Its liquid form boils at −196 °C.', 'Chefs use its liquid form to make instant ice cream.', 'It makes up about 78% of the air.', 'Its symbol is N.']],
  8: [1, 'The gas we need to breathe. It makes up about 21% of the air.', ['It is the most common element in the Earth\'s crust.', 'Fires need it to burn.', 'It makes up about 21% of the air.', 'Plants release it.', 'We breathe it in to stay alive.']],
  9: [2, 'The most reactive element. A tiny amount added to toothpaste and water helps protect teeth.', ['It is the most reactive of all elements.', 'Non-stick pan coatings contain it.', 'It is a pale yellow, poisonous gas.', 'It is a halogen.', 'Compounds of it are added to toothpaste.']],
  10: [1, 'An unreactive gas that glows bright red-orange in glass tubes, used in shop signs.', ['It was discovered in 1898 in liquefied air.', 'It is the fifth most common element in the universe.', 'It is a noble gas.', 'It glows red-orange in a glass tube.', 'Bright glowing shop signs are named after it.']],
  11: [1, 'A soft, very reactive metal that fizzes in water. It is half of table salt.', ['It is soft enough to cut with a butter knife.', 'It makes street lamps glow orange.', 'It explodes when dropped in water.', 'Table salt is it combined with chlorine.', 'Its symbol, Na, comes from the Latin "natrium".']],
  12: [2, 'A light metal that burns with a dazzling white flame. It is at the centre of chlorophyll in plants.', ['It sits at the centre of chlorophyll.', 'Old camera flashes burned it.', 'It burns with a blinding white flame.', 'It is used in light alloys for cars and planes.', 'Its name is linked to a region of ancient Greece.']],
  13: [1, 'A light, silvery metal that does not rust. It is used for drink cans, foil and aircraft.', ['It is the most common metal in the Earth\'s crust.', 'It was once more valuable than gold.', 'Its American spelling has one fewer "i".', 'Aircraft are built from it.', 'Drink cans and cooking foil are made of it.']],
  14: [2, 'An element that is the basis of computer chips and solar panels. Sand is mostly silicon dioxide.', ['It is the second most common element in the Earth\'s crust.', 'Sand and glass contain it.', 'It is a metalloid.', 'Solar panels use it.', 'A Californian tech valley is named after it.']],
  15: [2, 'A reactive element that is used in match heads and fertilisers. Its white form glows in the dark.', ['It was discovered in 1669 by boiling urine.', 'Its white form glows in the dark.', 'It is in DNA and bones.', 'Match heads contain it.', 'Its name means "light bearer".']],
  16: [2, 'A yellow element that smells when it forms compounds like rotten-egg gas. It was once called brimstone.', ['It was called brimstone in the Bible.', 'Volcanoes give off gases containing it.', 'Rotten eggs smell of a compound of it.', 'It is bright yellow.', 'Its symbol is S.']],
  17: [1, 'A green, poisonous gas used to keep swimming pools clean. It is half of table salt.', ['It was used as a weapon in World War I.', 'It is a halogen.', 'It is a yellow-green gas.', 'Table salt is sodium and this.', 'It is added to swimming pools to kill germs.']],
  18: [2, 'An unreactive gas that makes up almost 1% of the air. It is used inside light bulbs and for welding.', ['It makes up nearly 1% of the air.', 'Its name means "lazy" in Greek.', 'It is used inside old light bulbs.', 'It is a noble gas.', 'Welders use it as a shield gas.']],
  19: [1, 'A soft, reactive metal that bursts into lilac flames in water. Bananas are rich in it.', ['It is named after potash.', 'Its symbol, K, comes from "kalium".', 'It burns with a lilac flame in water.', 'Our nerves need it to work.', 'Bananas are famous for containing it.']],
  20: [1, 'A metal that our bones and teeth are built from. Milk and cheese are rich in it.', ['Chalk and limestone contain it.', 'Shells and coral are made of compounds of it.', 'It is an alkaline earth metal.', 'Milk and cheese are rich in it.', 'Our bones and teeth need it.']],
  22: [2, 'A strong, light metal that does not rust. It is used for jet engines, hip replacements and bikes.', ['It is named after the Titans of Greek myth.', 'Its white oxide is used in paint and sunscreen.', 'It is used in hip replacements.', 'It is as strong as steel but much lighter.', 'Expensive bikes and aircraft parts use it.']],
  24: [2, 'A hard, shiny metal used to plate taps and car bumpers. It gives rubies their red colour.', ['Its name means "colour" in Greek.', 'It gives rubies and emeralds their colour.', 'Stainless steel contains it.', 'Shiny car bumpers are plated with it.', 'Its symbol is Cr.']],
  26: [1, 'The most used metal, the main part of steel. The Earth\'s core is mostly iron.', ['The Earth\'s core is mostly made of it.', 'Its symbol, Fe, comes from Latin "ferrum".', 'Our blood needs it to carry oxygen.', 'It rusts when wet.', 'Steel is mostly made of it.']],
  27: [2, 'A hard metal that gives glass and pottery a deep blue colour.', ['Its name comes from a German word for goblin.', 'It is used in rechargeable batteries.', 'Vitamin B12 contains it.', 'It is magnetic.', 'It gives glass a deep blue colour.']],
  28: [2, 'A silvery, magnetic metal used in coins and stainless steel.', ['Its name comes from "Old Nick", a goblin.', 'The Sudbury Basin in Canada is rich in it.', 'Stainless steel contains it.', 'It is magnetic.', 'A US five-cent coin shares its name.']],
  29: [1, 'A reddish metal that carries electricity well. It is used in wires and pipes, and turns green over time.', ['The Statue of Liberty is covered in it.', 'It turns green over time.', 'Bronze is made mostly of it.', 'Electrical wires are made of it.', 'It is a reddish-brown metal.']],
  30: [2, 'A bluish-white metal used to coat steel so it does not rust. Brass is copper and zinc.', ['Brass is copper mixed with it.', 'It coats steel to stop rust.', 'It is used in sunscreen.', 'Our bodies need it for healing.', 'Its name has four letters.']],
  33: [2, 'A poisonous element, famous in history and crime stories as a deadly poison.', ['It was once used in green wallpaper.', 'It is a metalloid.', 'Agatha Christie used it in her novels.', 'It is a famous poison.', 'Its symbol is As.']],
  35: [3, 'One of only two elements that are liquid at room temperature. It is a red-brown, smelly liquid.', ['Its name means "stench" in Greek.', 'It is a halogen.', 'It is used in some flame retardants.', 'It is one of two elements that are liquid at room temperature.', 'It is a red-brown liquid.']],
  36: [2, 'An unreactive gas used in some lights. It shares its name with Superman\'s weakness, kryptonite.', ['Its name means "hidden" in Greek.', 'It was found in 1898.', 'It is used in some camera flashes.', 'It is a noble gas.', 'Superman\'s home planet sounds like it.']],
  47: [1, 'A shiny white metal that conducts electricity better than any other. It is used in jewellery and coins.', ['It conducts electricity better than any other element.', 'Its symbol, Ag, comes from Latin "argentum".', 'Argentina is named after it.', 'It tarnishes black over time.', 'Second-place winners get a medal of it.']],
  50: [2, 'A soft, silvery metal used to coat food cans. Bronze is copper and tin.', ['Bronze is copper mixed with it.', 'Bending a bar of it makes a "cry".', 'Its symbol, Sn, comes from Latin "stannum".', 'Food cans are coated with it.', 'A 10th wedding anniversary is named after it.']],
  53: [2, 'A dark element that turns into purple vapour. Our bodies need a little to make thyroid hormones.', ['Its name means "violet" in Greek.', 'It turns into purple vapour when heated.', 'It is added to table salt.', 'It is used to clean cuts.', 'It is a halogen.']],
  54: [3, 'A heavy, unreactive gas used in bright car headlights and in ion engines for spacecraft.', ['Its name means "stranger" in Greek.', 'It powers ion engines on spacecraft.', 'It is used in bright car headlights.', 'It can put people to sleep as an anaesthetic.', 'It is a noble gas.']],
  55: [3, 'A very soft, reactive metal used to keep the world\'s most accurate time in atomic clocks.', ['Atomic clocks use it to define the second.', 'It melts on a hot day, at about 28 °C.', 'It explodes violently in water.', 'Its name means "sky blue" in Latin.', 'It is an alkali metal.']],
  74: [2, 'The metal with the highest melting point. It was used for the glowing filaments in old light bulbs.', ['Its symbol, W, comes from "wolfram".', 'Its name means "heavy stone" in Swedish.', 'It has the highest melting point of any metal.', 'It is used in drill bits.', 'Old light-bulb filaments were made of it.']],
  78: [2, 'A rare, precious metal used in jewellery and in car exhaust catalysts.', ['Its name means "little silver" in Spanish.', 'Car catalytic converters use it.', 'It is rarer than gold.', 'It is used in jewellery.', 'A 70th anniversary and a record award are named after it.']],
  79: [1, 'A soft, shiny yellow metal that never rusts. People have treasured it for thousands of years.', ['Its symbol, Au, comes from Latin "aurum".', 'It never rusts or tarnishes.', 'It is used in electronics because it conducts well.', 'Olympic winners get a medal of it.', 'It is a precious yellow metal.']],
  80: [1, 'The only metal that is liquid at room temperature. It was once used in thermometers.', ['Its symbol, Hg, comes from Greek for "liquid silver".', 'It was once called quicksilver.', 'It was used in old thermometers.', 'It is the only metal that is liquid at room temperature.', 'It shares its name with the planet closest to the Sun.']],
  82: [1, 'A heavy, soft, poisonous metal once used in pipes and paint. It blocks X-rays.', ['Its symbol, Pb, comes from Latin "plumbum".', 'The word "plumber" comes from its Latin name.', 'It was once added to petrol.', 'X-ray aprons are lined with it.', 'It is a heavy grey metal, and pencils do not contain it.']],
  86: [3, 'A radioactive gas that can seep into homes from the ground.', ['It forms when uranium decays.', 'It is the heaviest noble gas found in nature.', 'It can build up in basements.', 'It is radioactive.', 'It is a gas that seeps from rocks.']],
  88: [2, 'A radioactive element discovered by Marie and Pierre Curie. It glows faintly in the dark.', ['It was once painted on watch dials to make them glow.', 'Marie and Pierre Curie discovered it in 1898.', 'It glows faintly blue.', 'It is very radioactive.', 'Its name comes from the Latin for "ray".']],
  92: [1, 'A heavy, radioactive metal used as fuel in nuclear power stations and in atomic bombs.', ['It was discovered in 1789.', 'It is named after the seventh planet.', 'It was used in the first atomic bombs.', 'It is used as nuclear fuel.', 'It is radioactive.']],
  94: [2, 'A radioactive metal used in nuclear weapons and to power some space probes.', ['It is named after a dwarf planet.', 'It powered Voyager and Curiosity\'s generators.', 'It was used in the Nagasaki bomb.', 'It is made in nuclear reactors.', 'It is radioactive.']],
  96: [3, 'A radioactive element named after Marie and Pierre Curie.', ['It was made in 1944.', 'It is used to power some Mars rover instruments.', 'It is an actinide.', 'It is very radioactive.', 'It is named after a famous scientist couple.']],
  99: [3, 'A synthetic element first found in the debris of the first hydrogen bomb test, in 1952.', ['It was found in the fallout of a hydrogen bomb test.', 'It was discovered in 1952.', 'It is an actinide.', 'It is named after a famous physicist.', 'It is named after the man behind E = mc².']],
  101: [3, 'A synthetic element named after Dmitri Mendeleev, who created the periodic table.', ['It was first made in 1955.', 'Only tiny amounts have ever been made.', 'It is an actinide.', 'It is radioactive.', 'It is named after the father of the periodic table.']],
  118: [3, 'The heaviest element known, made in 2002–2006. Only a handful of atoms have ever existed.', ['Only a few atoms have ever been made.', 'It was made by Russian and American scientists.', 'It is named after Yuri Oganessian.', 'It is in group 18, with the noble gases.', 'It has the highest atomic number of any known element.']],
};

const mercury = n => (n === 'Mercury' ? 'Mercury (element)' : n);
const toC = k => Math.round(parseFloat(k) - 273.15);

const IUPAC = { Aluminum: ['Aluminium', 'Aluminum'], Cesium: ['Caesium', 'Cesium'], Sulfur: ['Sulfur', 'Sulphur'] };
const items = rows.map(r => {
  const z = +r.AtomicNumber;
  const [name, altName] = IUPAC[r.Name] || [r.Name];
  const { period, group } = position(z);
  const hand = H[z];
  // state only where a bulk sample has been seen (no astatine/francium, nothing past einsteinium); the rest are predictions
  const state = /^(Gas|Solid|Liquid)$/.test(r.StandardState) && z <= 99 && z !== 85 && z !== 87 ? r.StandardState : null;
  const year = /^\d{4}$/.test(r.YearDiscovered) ? +r.YearDiscovered : null;
  const facts = {
    atomicNumber: z, symbol: r.Symbol, block: r.GroupBlock, period,
    ...(group ? { group } : {}),
    ...(state ? { state } : {}),
    ...(year ? { year } : (r.YearDiscovered === 'Ancient' ? { ancient: true } : {})),
    atomicMass: +(+r.AtomicMass).toPrecision(4),
    ...(r.MeltingPoint && z <= 96 ? { meltingC: toC(r.MeltingPoint) } : {}),
    ...(r.Density && z <= 96 ? { density: +(+r.Density).toPrecision(3) } : {}),
  };
  const dataClues = [
    `Its atomic mass is about ${facts.atomicMass}.`,
    facts.meltingC != null ? `It melts at about ${facts.meltingC} °C.` : null,
    `It is in period ${period}${group ? `, group ${group}` : ''} of the periodic table.`,
    `It is ${/^[AEIOU]/.test(r.GroupBlock) ? 'an' : 'a'} ${r.GroupBlock.toLowerCase()}.`,
    year ? `It was discovered in ${year}.` : (r.YearDiscovered === 'Ancient' ? 'It has been known since ancient times.' : null),
    state ? `At room temperature it is a ${state.toLowerCase()}.` : null,
    `Its atomic number is ${z}.`,
    `Its chemical symbol is ${r.Symbol}.`,
  ].filter(Boolean);
  const clues = hand ? [...dataClues.slice(0, 2), ...hand[2], ...dataClues.slice(-2)] : dataClues;
  return {
    id: name.toLowerCase(), n: name, wp: mercury(name), alt: altName ? [altName] : undefined,
    g: r.GroupBlock, f: facts, d: hand ? hand[0] : (z <= 36 ? 2 : 3),
    b: hand ? hand[1] : `${name} (${r.Symbol}) is element number ${z}, ${/^[AEIOU]/.test(r.GroupBlock) ? 'an' : 'a'} ${r.GroupBlock.toLowerCase()}${state ? ` that is a ${state.toLowerCase()} at room temperature` : ''}.${year ? ` It was discovered in ${year}.` : ''}`,
    c: clues,
    noImg: z > 99,
  };
});

export default {
  id: 'elements', title: 'Chemical elements', theme: 'science', icon: '⚗️', kids: false,
  leakExempt: [],
  media: 'wiki', photos: 1, depicts: 0, wdP31: ['Q11344'], noFactClues: true,
  factsMeta: {
    atomicNumber: { type: 'num', label: 'Atomic number', unit: '', higherLabel: 'Higher atomic number' },
    symbol: { type: 'text', label: 'Chemical symbol' },
    block: { type: 'cat', label: 'Element type' },
    period: { type: 'num', label: 'Period', unit: '' },
    group: { type: 'num', label: 'Group', unit: '' },
    state: { type: 'cat', label: 'State at room temperature', values: ['Solid', 'Liquid', 'Gas'] },
    year: { type: 'year', label: 'Discovered' },
    ancient: { type: 'bool', label: 'Known since ancient times', yes: 'Known since ancient times', no: 'Discovered later' },
    atomicMass: { type: 'num', label: 'Atomic mass', unit: 'u', higherLabel: 'Heavier atoms' },
    meltingC: { type: 'num', label: 'Melting point', unit: '°C', higherLabel: 'Higher melting point' },
    density: { type: 'num', label: 'Density', unit: 'g/cm³', higherLabel: 'Denser' },
  },
  imgPrompt: "Which of these is {lname}?",
  nameImgPrompt: "Which element is this?",
  tfImgPrompt: "This is {lname}.",
  tpl: {"atomicNumber": {"askHigh": "Which of these has the highest atomic number?", "askLow": "Which of these has the lowest atomic number?", "minRatio": 1.2}, "symbol": {"ask": "What is the chemical symbol for {lname}?", "askReverse": "Which element has the symbol {value}?", "stmt": "The chemical symbol for {lname} is {value}."}, "block": {"ask": "What type of element is {lname}?", "askReverse": "Which of these is {aValue}?", "stmt": "{name} is {aValue}."}, "state": {"ask": "Is {lname} a solid, liquid or gas at room temperature?", "askReverse": "Which of these is a {lvalue} at room temperature?", "stmt": "{name} is a {lvalue} at room temperature."}, "year": {"askHigh": "Which of these was discovered most recently?", "askLow": "Which of these was discovered first?", "minRatio": 1.02}, "ancient": {"askBool": "Which of these has been known since ancient times?", "stmt": "{name} has been known since ancient times."}, "atomicMass": {"askHigh": "Which of these has the heaviest atoms?", "askLow": "Which of these has the lightest atoms?"}, "meltingC": {"askHigh": "Which of these has the highest melting point?", "askLow": "Which of these has the lowest melting point?", "minRatio": 1.5}, "density": {"askHigh": "Which of these is the densest?", "askLow": "Which of these is the least dense?"}, "period": {"askHigh": "Which of these is lowest down the periodic table?"}, "group": {"askHigh": "Which of these is furthest right in the periodic table?"}},
  sources: [{ name: 'PubChem Periodic Table', url: 'https://pubchem.ncbi.nlm.nih.gov/periodic-table/' }, WD, COMMONS],
  items: items.map(it => ({ ...it, alt: it.alt?.length ? it.alt : undefined })),
  questions: [
    { kind: 'mc', prompt: 'What is the chemical symbol for gold?', answer: 'Au', wrong: ['Go', 'Gd', 'Ag'], explain: 'From the Latin "aurum".', difficulty: 1 },
    { kind: 'mc', prompt: 'What is the chemical symbol for iron?', answer: 'Fe', wrong: ['Ir', 'In', 'I'], explain: 'From the Latin "ferrum".', difficulty: 2 },
    { kind: 'mc', prompt: 'What is the chemical symbol for sodium?', answer: 'Na', wrong: ['So', 'Sd', 'S'], explain: 'From the Latin "natrium".', difficulty: 2 },
    { kind: 'mc', prompt: 'What is the chemical symbol for silver?', answer: 'Ag', wrong: ['Si', 'Sv', 'Au'], explain: 'From the Latin "argentum".', difficulty: 2 },
    { kind: 'mc', prompt: 'What is the chemical symbol for potassium?', answer: 'K', wrong: ['P', 'Po', 'Pt'], explain: 'From "kalium".', difficulty: 2 },
    { kind: 'mc', prompt: 'Which element has the chemical symbol O?', answer: 'Oxygen', wrong: ['Osmium', 'Gold', 'Oganesson'], explain: 'Oxygen is element 8.', difficulty: 1 },
    { kind: 'mc', prompt: 'Which is the only metal that is liquid at room temperature?', answer: 'Mercury', wrong: ['Lead', 'Gallium', 'Tin'], explain: 'Bromine is the only liquid non-metal.', difficulty: 1 },
    { kind: 'mc', prompt: 'Which gas makes up most of the air we breathe?', answer: 'Nitrogen', wrong: ['Oxygen', 'Carbon dioxide', 'Hydrogen'], explain: 'Air is about 78% nitrogen and 21% oxygen.', difficulty: 1 },
    { kind: 'mc', prompt: 'What is the most common element in the universe?', answer: 'Hydrogen', wrong: ['Helium', 'Oxygen', 'Carbon'], explain: 'About three-quarters of normal matter is hydrogen.', difficulty: 1 },
    { kind: 'number', prompt: 'How many elements are in the periodic table today?', answer: 118, unit: 'elements', tolerance: 0, explain: 'The latest four were named in 2016.', difficulty: 2 },
    { kind: 'mc', prompt: 'Who published the first widely recognised periodic table in 1869?', answer: 'Dmitri Mendeleev', wrong: ['Marie Curie', 'Isaac Newton', 'John Dalton'], explain: 'He left gaps for elements that had not yet been discovered.', difficulty: 2 },
    { kind: 'mc', prompt: 'Which two elements make up water?', answer: 'Hydrogen and oxygen', wrong: ['Carbon and oxygen', 'Hydrogen and nitrogen', 'Sodium and chlorine'], explain: 'Water is H₂O.', difficulty: 1 },
    { kind: 'mc', prompt: 'Table salt is made of sodium and which other element?', answer: 'Chlorine', wrong: ['Iodine', 'Oxygen', 'Calcium'], explain: 'Its chemical name is sodium chloride.', difficulty: 2 },
    { kind: 'mc', prompt: 'Which element did Marie and Pierre Curie discover in 1898, along with polonium?', answer: 'Radium', wrong: ['Uranium', 'Plutonium', 'Radon'], explain: 'Radium glows faintly from its radioactivity.', difficulty: 2 },
    { kind: 'mc', prompt: 'Which group are helium, neon and argon in?', answer: 'Noble gases', wrong: ['Halogens', 'Alkali metals', 'Lanthanides'], explain: 'Noble gases hardly react with anything.', difficulty: 2 },
    { kind: 'tf', prompt: 'Diamond and graphite are both made of carbon.', answer: true, explain: 'Their atoms are arranged differently.', difficulty: 2 },
    { kind: 'mc', prompt: 'Which metal has the highest melting point?', answer: 'Tungsten', wrong: ['Iron', 'Titanium', 'Gold'], explain: 'Tungsten melts at about 3,400 °C.', difficulty: 3 },
  ],
};

// Pick all: the item facts that make a fair "which N of these are …?" question. Each rule names a pack and one fact;
// an option is right exactly when item.facts[key] equals the asked value (bool rules: === true), so tools can
// re-derive every answer from the data. `ok` drops items that are ambiguous on either side (transcontinental
// countries, superheavy elements, cross-border landmarks); `wrong` narrows the decoys further.

const AMBIG_ISO = new Set(['ARM', 'AZE', 'CYP', 'EGY', 'GEO', 'IDN', 'KAZ', 'PAN', 'PNG', 'RUS', 'TLS', 'TTO', 'TUR']);
const AMBIG_COUNTRY = new Set(['Armenia', 'Azerbaijan', 'Cyprus', 'Egypt', 'Georgia', 'Indonesia', 'Kazakhstan', 'Panama', 'Papua New Guinea', 'Russia', 'Timor-Leste', 'Trinidad and Tobago', 'Turkey']);
const single = v => v != null && !Array.isArray(v);
const z = it => it.facts?.atomicNumber;
const groupOf = it => it.facts?.group;

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'Oceania', 'South America'];   // North America: Central America/Caribbean usage varies
const BLOCKS = { 'Noble gas': 'noble gases', 'Alkali metal': 'alkali metals', 'Alkaline earth metal': 'alkaline earth metals', Halogen: 'halogens', 'Transition metal': 'transition metals' };
const SEA = { Mammal: 'mammals', Fish: 'fish', Reptile: 'reptiles', Mollusc: 'molluscs', Crustacean: 'crustaceans' };
const INSECTS = { Beetles: 'beetles', 'Butterflies & moths': 'butterflies or moths', 'True bugs': 'true bugs', 'Grasshoppers & crickets': 'grasshoppers or crickets' };
const SPACE = { Planet: 'planets', Moon: 'moons', Star: 'stars', 'Dwarf planet': 'dwarf planets' };
const TV_MIXED = new Set(['The Muppet Show', 'Game of Thrones', 'Ted Lasso', 'The Crown', 'Who Wants to Be a Millionaire?']);
const LANDMARK_SKIP = new Set(["St. Peter's Basilica", "Giant's Causeway"]);

export const RULES = [
  { id: 'cont', pack: 'countries', key: 'continent', values: CONTINENTS, ask: 'Which {n} of these countries are in {value}?', say: '{list} {are} in {value}.',
    ok: it => single(it.facts.continent) && !AMBIG_ISO.has(it.iso3) && !AMBIG_COUNTRY.has(it.name) },
  { id: 'landlocked', pack: 'countries', key: 'landlocked', bool: true, ask: 'Which {n} of these countries are landlocked?', say: '{list} {have} no coastline.',
    ok: it => !['Kazakhstan', 'Azerbaijan', 'Turkmenistan'].includes(it.name) },   // Caspian coasts: "landlocked" is argued
  { id: 'left', pack: 'countries', key: 'drivingSide', values: ['left'], ask: 'In which {n} of these countries do people drive on the left?', say: 'People drive on the left in {list}.' },
  { id: 'capcont', pack: 'capitals', key: 'continent', values: CONTINENTS, ask: 'Which {n} of these capital cities are in {value}?', say: '{list} {are} in {value}.',
    ok: it => single(it.facts.continent) && !AMBIG_ISO.has(it.iso3) && !AMBIG_COUNTRY.has(it.facts.country) },
  { id: 'lmcountry', pack: 'landmarks', key: 'country', min: 2, ask: 'Which {n} of these landmarks are in {value}?', say: '{list} {are} in {value}.', kids: true,
    ok: it => single(it.facts.country) && !LANDMARK_SKIP.has(it.name) },
  { id: 'block', pack: 'elements', key: 'block', values: Object.keys(BLOCKS), display: BLOCKS, ask: 'Which {n} of these elements are {plural}?', say: '{list} {are} {plural}.',
    ok: it => z(it) <= 100 && !(it.facts.block === 'Transition metal' && [3, 12].includes(groupOf(it))),
    wrong: (it, v) => v !== 'Transition metal' || !['Lanthanide', 'Actinide'].includes(it.facts.block) },
  { id: 'gas', pack: 'elements', key: 'state', values: ['Gas'], ask: 'Which {n} of these elements are gases at room temperature?', say: '{list} {are} gases at room temperature.',
    ok: it => z(it) <= 100 && it.facts.state != null, wrong: it => !(it.facts.meltingC < 45) },
  { id: 'liquid', pack: 'elements', key: 'state', values: ['Liquid'], ask: 'Which {n} of these elements are liquid at room temperature?', say: '{list} {are} liquid at room temperature.',
    ok: it => z(it) <= 100 && it.facts.state != null, wrong: it => it.facts.state === 'Solid' && !(it.facts.meltingC < 45) },
  { id: 'seakind', pack: 'sea', key: 'kind', values: Object.keys(SEA), display: SEA, ask: 'Which {n} of these sea animals are {plural}?', say: '{list} {are} {plural}.', kids: true, pics: true },
  { id: 'air', pack: 'sea', key: 'breathesAir', bool: true, ask: 'Which {n} of these sea animals breathe air?', say: '{list} must come up to breathe air.', kids: true, pics: true },
  { id: 'amphib', pack: 'reptiles', key: 'cls', values: ['Amphibian', 'Reptile'], display: { Amphibian: 'amphibians', Reptile: 'reptiles' }, ask: 'Which {n} of these are {plural}?', say: '{list} {are} {plural}.', kids: true, pics: true },
  { id: 'flightless', pack: 'birds', key: 'flightless', bool: true, ask: 'Which {n} of these birds can’t fly?', say: '{list} can’t fly.', kids: true, pics: true },
  { id: 'venom', pack: 'snakes', key: 'venomous', bool: true, ask: 'Which {n} of these snakes are venomous?', say: '{list} {are} venomous.', pics: true,
    ok: it => it.facts.danger !== 'Mildly venomous' },
  { id: 'conifer', pack: 'trees', key: 'conifer', bool: true, ask: 'Which {n} of these trees are conifers?', say: '{list} {are} conifers.', kids: true, pics: true,
    ok: it => it.name !== 'Ginkgo' },
  { id: 'dino', pack: 'dinosaurs', key: 'dinosaur', bool: true, ask: 'Which {n} of these were dinosaurs?', say: '{list} {were} dinosaurs.', kids: true, pics: true,
    ok: it => it.name !== 'Archaeopteryx' },
  { id: 'plants', pack: 'dinosaurs', key: 'diet', values: ['Herbivore'], ask: 'Which {n} of these dinosaurs ate plants?', say: '{list} ate plants.', kids: true, pics: true,
    ok: it => it.facts.dinosaur === true, wrong: it => it.facts.diet === 'Carnivore' },
  { id: 'mdiet', pack: 'mammals', key: 'diet', values: ['Herbivore', 'Carnivore'], display: { Herbivore: 'plant-eaters', Carnivore: 'meat-eaters' }, ask: 'Which {n} of these mammals are {plural}?', say: '{list} {are} {plural}.', kids: true, pics: true,
    ok: it => !/panda/i.test(it.name), wrong: (it, v) => it.facts.diet === (v === 'Herbivore' ? 'Carnivore' : 'Herbivore') },
  { id: 'insect', pack: 'insects', key: 'order', values: Object.keys(INSECTS), display: INSECTS, ask: 'Which {n} of these are {plural}?', say: '{list} {are} {plural}.', kids: true, pics: true },
  { id: 'space', pack: 'space', key: 'kind', values: Object.keys(SPACE), display: SPACE, ask: 'Which {n} of these are {plural}?', say: '{list} {are} {plural}.', kids: true, pics: true,
    ok: it => it.name !== 'Alpha Centauri',
    wrong: it => ['Planet', 'Moon', 'Star', 'Dwarf planet', 'Galaxy', 'Comet'].includes(it.facts.kind) },
  { id: 'paint', pack: 'paintings', key: 'artist', min: 2, ask: 'Which {n} of these paintings are by {value}?', say: '{value} painted {list}.' },
  { id: 'author', pack: 'books', key: 'author', min: 2, ask: 'Which {n} of these books did {value} write?', say: '{value} wrote {list}.' },
  { id: 'director', pack: 'movies', key: 'director', min: 2, ask: 'Which {n} of these films did {value} direct?', say: '{value} directed {list}.',
    value: v => !/ and |&|,/.test(v), wrong: (it, v) => !String(it.facts.director || '').includes(v) },
  { id: 'branch', pack: 'languages', key: 'branch', values: ['Germanic', 'Romance', 'Slavic', 'Indo-Aryan', 'Bantu', 'Semitic'], ask: 'Which {n} of these are {value} languages?', say: '{list} {are} {value} languages.' },
  { id: 'dog', pack: 'dogs', key: 'origin', min: 3, ask: 'Which {n} of these dog breeds come from {value}?', say: '{list} {come} from {value}.', kids: true, pics: true,
    ok: it => single(it.facts.origin) },
  { id: 'tv', pack: 'tv', key: 'country', min: 2, ask: 'Which {n} of these TV shows come from {value}?', say: '{list} {come} from {value}.',
    ok: it => !TV_MIXED.has(it.name) },
  { id: 'sport', pack: 'sport', key: 'sport', min: 2, ask: 'Which {n} of these sports stars are famous for {lvalue}?', say: '{list}: {lvalue}.',
    ok: it => it.group === 'athlete' },
  { id: 'hits', packRe: /^hits-\d{4}s$/, key: 'artist', min: 3, ask: 'Which {n} of these songs were hits for {value}?', say: '{value} had hits with {list}.',
    value: v => !/ & | and |feat|,| x | with /i.test(v), wrong: (it, v) => !String(it.facts.artist || '').toLowerCase().includes(v.toLowerCase()) },
];

export const rulesFor = id => RULES.filter(r => (r.packRe ? r.packRe.test(id) : r.pack === id));

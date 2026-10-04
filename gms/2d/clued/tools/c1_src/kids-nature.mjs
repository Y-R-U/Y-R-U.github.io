// Easy picture, sound and fact questions for Kids mode. Pictures and sounds are reused from the built C1 packs,
// so build this pack last (c1_build.mjs sorts it last automatically).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../c1_lib.mjs';

const packs = {};
const ref = r => {
  const [p, id] = r.split('/');
  packs[p] ||= JSON.parse(readFileSync(join(ROOT, 'data/packs', p + '.json'), 'utf8'));
  const it = packs[p].items.find(i => i.id === id);
  if (!it) throw new Error('kids-nature: missing ' + r);
  return it;
};
const img = r => ({ img: [ref(r).media.img[0]] });
const snd = r => (ref(r).media?.audio ? { audio: [ref(r).media.audio[0]] } : null);

const pics = [
  ['mammals/lion', 'Lion', ['Tiger', 'Bear', 'Wolf'], 'Lions live in Africa. The males have a big mane.'],
  ['mammals/tiger', 'Tiger', ['Lion', 'Cheetah', 'Zebra'], 'Tigers are the biggest cats. Every tiger has different stripes.'],
  ['mammals/african-bush-elephant', 'Elephant', ['Hippo', 'Rhino', 'Giraffe'], 'Elephants use their trunks to drink and smell.'],
  ['mammals/giraffe', 'Giraffe', ['Zebra', 'Camel', 'Horse'], 'Giraffes are the tallest animals in the world.'],
  ['mammals/plains-zebra', 'Zebra', ['Horse', 'Giraffe', 'Tiger'], 'Zebras are wild horses with stripes.'],
  ['mammals/red-kangaroo', 'Kangaroo', ['Koala', 'Rabbit', 'Wombat'], 'Kangaroos hop and carry their babies in a pouch.'],
  ['mammals/koala', 'Koala', ['Kangaroo', 'Panda', 'Wombat'], 'Koalas sleep a lot and eat gum leaves.'],
  ['mammals/giant-panda', 'Panda', ['Koala', 'Polar bear', 'Raccoon'], 'Pandas eat bamboo for most of the day.'],
  ['mammals/polar-bear', 'Polar bear', ['Panda', 'Wolf', 'Seal'], 'Polar bears live in the icy Arctic.'],
  ['mammals/platypus', 'Platypus', ['Duck', 'Beaver', 'Otter'], 'The platypus is a mammal that lays eggs.'],
  ['birds/emperor-penguin', 'Penguin', ['Puffin', 'Duck', 'Seagull'], 'Penguins cannot fly, but they swim very well.'],
  ['birds/greater-flamingo', 'Flamingo', ['Swan', 'Parrot', 'Stork'], 'Flamingos are pink because of the food they eat.'],
  ['birds/scarlet-macaw', 'Parrot', ['Owl', 'Penguin', 'Eagle'], 'This parrot is a scarlet macaw from South America.'],
  ['birds/barn-owl', 'Owl', ['Eagle', 'Parrot', 'Duck'], 'Owls hunt at night and have great hearing.'],
  ['birds/laughing-kookaburra', 'Kookaburra', ['Penguin', 'Emu', 'Flamingo'], 'A kookaburra\'s call sounds like laughing.'],
  ['birds/emu', 'Emu', ['Ostrich', 'Penguin', 'Kiwi'], 'Emus are Australian birds that cannot fly but run fast.'],
  ['sharks/great-white-shark', 'Shark', ['Dolphin', 'Whale', 'Seal'], 'Sharks are fish with lots of sharp teeth.'],
  ['sea/common-bottlenose-dolphin', 'Dolphin', ['Shark', 'Seal', 'Penguin'], 'Dolphins are mammals that breathe air.'],
  ['sea/common-octopus', 'Octopus', ['Jellyfish', 'Crab', 'Starfish'], 'An octopus has eight arms.'],
  ['sea/green-sea-turtle', 'Turtle', ['Crab', 'Seal', 'Fish'], 'Sea turtles lay their eggs on beaches.'],
  ['sea/ocellaris-clownfish', 'Clownfish', ['Shark', 'Jellyfish', 'Turtle'], 'Clownfish live in sea anemones. Nemo is one!'],
  ['sea/ochre-sea-star', 'Starfish', ['Crab', 'Octopus', 'Jellyfish'], 'Starfish can grow back lost arms.'],
  ['jellyfish/moon-jellyfish', 'Jellyfish', ['Octopus', 'Starfish', 'Fish'], 'Jellyfish have no brain and no bones.'],
  ['insects/seven-spot-ladybird', 'Ladybird', ['Bee', 'Spider', 'Ant'], 'Ladybirds are beetles that eat garden pests.'],
  ['insects/monarch-butterfly', 'Butterfly', ['Bee', 'Moth', 'Dragonfly'], 'Butterflies start life as caterpillars.'],
  ['bees/honey-bee', 'Bee', ['Wasp', 'Fly', 'Ladybird'], 'Honey bees make honey from flower nectar.'],
  ['reptiles/red-eyed-tree-frog', 'Frog', ['Lizard', 'Snake', 'Turtle'], 'Frogs start life as tadpoles.'],
  ['reptiles/saltwater-crocodile', 'Crocodile', ['Lizard', 'Snake', 'Turtle'], 'Crocodiles are reptiles with very strong jaws.'],
  ['snakes/green-tree-python', 'Snake', ['Lizard', 'Worm', 'Frog'], 'Snakes have no legs. This one is a green tree python.'],
  ['dinosaurs/tyrannosaurus-rex', 'T. rex', ['Triceratops', 'Stegosaurus', 'Diplodocus'], 'T. rex was a huge meat-eating dinosaur.'],
  ['flowers/sunflower', 'Sunflower', ['Rose', 'Tulip', 'Daisy'], 'Sunflowers grow very tall and have big yellow heads.'],
  ['flowers/tulip', 'Tulip', ['Rose', 'Sunflower', 'Daisy'], 'Tulips grow from bulbs in spring.'],
  ['space/saturn', 'Saturn', ['Mars', 'Earth', 'Moon'], 'Saturn is the planet with the famous rings.'],
  ['space/moon', 'The Moon', ['The Sun', 'Mars', 'A star'], 'The Moon goes around the Earth.'],
];

const sounds = [
  ['mammals/lion', 'Lion', ['Elephant', 'Wolf', 'Owl']],
  ['mammals/grey-wolf', 'Wolf', ['Lion', 'Frog', 'Elephant']],
  ['mammals/asian-elephant', 'Elephant', ['Lion', 'Wolf', 'Bird']],
  ['mammals/chimpanzee', 'Chimpanzee', ['Lion', 'Elephant', 'Wolf']],
  ['birds/laughing-kookaburra', 'Kookaburra', ['Owl', 'Duck', 'Frog']],
  ['birds/barn-owl', 'Owl', ['Wolf', 'Frog', 'Elephant']],
  ['birds/common-cuckoo', 'Cuckoo', ['Lion', 'Frog', 'Elephant']],
  ['reptiles/common-frog', 'Frog', ['Bird', 'Lion', 'Wolf']],
];

const facts = [
  ['How many legs does a spider have?', '8', ['6', '4', '10'], 'All spiders have eight legs.'],
  ['How many legs does an insect have?', '6', ['8', '4', '2'], 'Insects like ants and bees have six legs.'],
  ['How many legs does a bird have?', '2', ['4', '6', '0'], 'Birds walk on two legs and have two wings.'],
  ['How many arms does an octopus have?', '8', ['6', '10', '4'], '"Octo" means eight.'],
  ['Which animal lives in the sea?', 'Dolphin', ['Lion', 'Camel', 'Kangaroo'], 'Dolphins live in the sea and breathe air.'],
  ['Which animal lives in the sea?', 'Starfish', ['Giraffe', 'Koala', 'Squirrel'], 'Starfish live on the sea floor.'],
  ['Which animal can fly?', 'Bat', ['Penguin', 'Elephant', 'Snake'], 'Bats are the only mammals that can really fly.'],
  ['Which bird cannot fly?', 'Penguin', ['Eagle', 'Parrot', 'Owl'], 'Penguins use their wings to swim.'],
  ['What is a baby kangaroo called?', 'Joey', ['Cub', 'Puppy', 'Chick'], 'A joey lives in its mother\'s pouch.'],
  ['What is a baby cat called?', 'Kitten', ['Puppy', 'Calf', 'Foal'], 'Puppies are baby dogs.'],
  ['What is a baby dog called?', 'Puppy', ['Kitten', 'Lamb', 'Chick'], 'Kittens are baby cats.'],
  ['What is a baby frog called?', 'Tadpole', ['Kitten', 'Chick', 'Calf'], 'Tadpoles live in water and grow legs.'],
  ['What is a baby sheep called?', 'Lamb', ['Calf', 'Kid', 'Foal'], 'A baby goat is a kid.'],
  ['What does a caterpillar turn into?', 'Butterfly', ['Spider', 'Bee', 'Frog'], 'Caterpillars make a chrysalis, then turn into butterflies or moths.'],
  ['What do bees make?', 'Honey', ['Milk', 'Silk', 'Wool'], 'Bees make honey from flower nectar.'],
  ['What do cows give us to drink?', 'Milk', ['Juice', 'Honey', 'Water'], 'Milk is also made into cheese and butter.'],
  ['What do hens lay?', 'Eggs', ['Apples', 'Stones', 'Seeds'], 'Hens lay eggs, sometimes one a day.'],
  ['What do pandas love to eat?', 'Bamboo', ['Fish', 'Grass', 'Carrots'], 'Pandas eat bamboo for many hours a day.'],
  ['What do koalas eat?', 'Gum leaves', ['Fish', 'Bananas', 'Insects'], 'Koalas eat eucalyptus leaves.'],
  ['Which animal has a very long neck?', 'Giraffe', ['Hippo', 'Pig', 'Bear'], 'A giraffe\'s neck can be about 2 metres long.'],
  ['Which animal has a trunk?', 'Elephant', ['Rhino', 'Lion', 'Monkey'], 'Elephants use their trunks like a hand.'],
  ['Which animal has black and white stripes?', 'Zebra', ['Tiger', 'Leopard', 'Giraffe'], 'Every zebra has different stripes.'],
  ['Which animal is the biggest in the world?', 'Blue whale', ['Elephant', 'Giraffe', 'Shark'], 'Blue whales are bigger than any dinosaur.'],
  ['Which animal is the fastest runner?', 'Cheetah', ['Tortoise', 'Elephant', 'Snail'], 'Cheetahs can run as fast as a car on a highway.'],
  ['Which animal carries its home on its back?', 'Snail', ['Rabbit', 'Bird', 'Fish'], 'A snail can hide inside its shell.'],
  ['Which animal is famous for being slow?', 'Sloth', ['Cheetah', 'Rabbit', 'Horse'], 'Sloths move very slowly and hang upside down.'],
  ['Where do penguins mostly live?', 'Near the South Pole', ['In the desert', 'In the jungle', 'On mountains'], 'Most penguins live in the southern half of the world.'],
  ['Where do polar bears live?', 'The Arctic', ['The desert', 'The jungle', 'Australia'], 'Polar bears live near the North Pole.'],
  ['What colour is a ripe banana?', 'Yellow', ['Blue', 'Purple', 'Red'], 'Green bananas are not ripe yet.'],
  ['What colour are most leaves in summer?', 'Green', ['Blue', 'Pink', 'Black'], 'Leaves are green because of chlorophyll.'],
  ['What do plants need to grow?', 'Sunlight and water', ['Sweets', 'Milk', 'Music'], 'Plants make their food from sunlight.'],
  ['What grows into a tree?', 'A seed', ['A stone', 'A shell', 'A feather'], 'Acorns are oak tree seeds.'],
  ['What is the name of our planet?', 'Earth', ['Mars', 'Jupiter', 'The Moon'], 'Earth is the third planet from the Sun.'],
  ['What shines in the sky in the daytime?', 'The Sun', ['The Moon', 'Mars', 'A comet'], 'The Sun is a star.'],
  ['Which planet is called the red planet?', 'Mars', ['Earth', 'Saturn', 'Neptune'], 'Mars looks red because of rusty dust.'],
  ['What do we breathe with?', 'Lungs', ['Stomach', 'Ears', 'Feet'], 'Our lungs take in air.'],
  ['What pumps blood around your body?', 'Heart', ['Brain', 'Stomach', 'Lungs'], 'Your heart is a strong muscle.'],
  ['What do you see with?', 'Eyes', ['Ears', 'Nose', 'Hands'], 'We have two eyes.'],
  ['What do you hear with?', 'Ears', ['Eyes', 'Nose', 'Mouth'], 'We have two ears.'],
  ['How many fingers are on one hand?', '5', ['4', '6', '10'], 'Four fingers and a thumb make five.'],
  ['Which fruit is red and grows on trees?', 'Apple', ['Banana', 'Carrot', 'Potato'], 'Apples can be red, green or yellow.'],
  ['Which of these is a vegetable?', 'Carrot', ['Apple', 'Banana', 'Strawberry'], 'Carrots are roots that we eat.'],
];

const tfs = [
  ['A whale is a fish.', false, 'Whales are mammals that breathe air.'],
  ['A spider is an insect.', false, 'Spiders have eight legs; insects have six.'],
  ['Frogs start life as tadpoles.', true, 'Tadpoles live in water and grow legs.'],
  ['Penguins can fly.', false, 'Penguins swim instead.'],
  ['The Sun is a star.', true, 'It is the closest star to Earth.'],
  ['Bats are birds.', false, 'Bats are mammals with furry bodies.'],
  ['A tomato is a fruit.', true, 'Tomatoes grow from flowers and have seeds, so they are fruits.'],
  ['Snakes have legs.', false, 'Snakes slither on their bellies.'],
];

export default {
  id: 'kids-nature', title: 'Kids: animals & nature', theme: 'kids', icon: '🧸', kids: true,
  factsMeta: {},
  items: [],
  questions: [
    ...pics.map(([r, a, w, e], i) => ({ id: `pic${i + 1}`, kind: 'mc', prompt: 'What is this?', answer: a, wrong: w, explain: e, difficulty: 1, media: img(r) })),
    ...sounds.filter(([r]) => snd(r)).map(([r, a, w], i) => ({ id: `snd${i + 1}`, kind: 'mc', prompt: 'Listen! Which animal makes this sound?', answer: a, wrong: w, explain: `That was ${/^[AEIOU]/.test(a) ? 'an' : 'a'} ${a.toLowerCase()}.`, difficulty: 1, media: snd(r) })),
    ...facts.map(([p, a, w, e], i) => ({ id: `f${i + 1}`, kind: 'mc', prompt: p, answer: a, wrong: w, explain: e, difficulty: 1 })),
    ...tfs.map(([p, a, e], i) => ({ id: `tf${i + 1}`, kind: 'tf', prompt: p, answer: a, explain: e, difficulty: 1 })),
  ],
  sources: [{ name: 'Clued nature packs (photos and sounds credited per file)', url: 'https://commons.wikimedia.org' }],
};

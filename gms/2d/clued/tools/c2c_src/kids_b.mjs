import { M, T } from './lib.mjs';

// Kids bank, part B (2026-10-11 variety pass). Same rules: ages 6–10, short read-aloud prompts, 2 wrong answers.
export default [
  // animals
  M('ani', 1, "Which animal says 'oink'?", "Pig", ["Duck", "Horse"], "Pigs love to roll in mud to keep cool."),
  M('ani', 1, "Which animal says 'neigh'?", "Horse", ["Cow", "Goat"], "Horses can sleep standing up."),
  M('ani', 1, "Which animal hoots at night?", "Owl", ["Eagle", "Parrot"], "Owls hunt at night with their big eyes."),
  M('ani', 1, "Which animal hops and has long ears?", "Rabbit", ["Mouse", "Cat"], "Rabbits use their long ears to listen for danger."),
  M('ani', 1, "Which animal lives in a hive?", "Bee", ["Ant", "Spider"], "Thousands of bees can live in one hive."),
  M('ani', 1, "Which animal spins a web?", "Spider", ["Snail", "Worm"], "Spiders make silk to build webs that catch insects."),
  M('ani', 1, "Which animal is known as the king of the jungle?", "Lion", ["Tiger", "Monkey"], "Lions actually live on grassy plains, not in jungles!"),
  M('ani', 1, "Which bird is famous for copying words?", "Parrot", ["Penguin", "Owl"], "Some parrots can learn lots of words."),
  M('ani', 1, "What is a baby duck called?", "Duckling", ["Chick", "Cub"], "Ducklings follow their mum in a line."),
  M('ani', 1, "What is a baby bear called?", "Cub", ["Calf", "Kitten"], "Bear cubs are born in winter dens."),
  M('ani', 1, "What is a baby goat called?", "Kid", ["Lamb", "Foal"], "Baby goats love to jump and climb."),
  M('ani', 1, "What is a baby pig called?", "Piglet", ["Puppy", "Joey"], "Piglets drink their mum's milk."),
  M('ani', 2, "What is a baby owl called?", "Owlet", ["Duckling", "Cub"], "Owlets are fluffy and grey or white."),
  M('ani', 1, "Which animal has a shell and moves very slowly?", "Snail", ["Mouse", "Bird"], "A snail carries its home on its back."),
  M('ani', 1, "Which animal has stripes and is a big cat?", "Tiger", ["Lion", "Leopard"], "No two tigers have the same stripes."),
  M('ani', 1, "Which animal has spots and is a big cat?", "Leopard", ["Tiger", "Zebra"], "Leopards can climb trees with their food."),
  M('ani', 1, "Which animal has a very long neck?", "Giraffe", ["Hippo", "Bear"], "A giraffe's neck has seven bones, just like ours."),
  M('ani', 1, "Which animal lives in the sea and has eight arms?", "Octopus", ["Crab", "Starfish"], "An octopus can squirt ink to escape."),
  M('ani', 1, "Which animal has a hump on its back and lives in the desert?", "Camel", ["Horse", "Cow"], "A camel's hump stores fat, not water."),
  M('ani', 1, "Which animal has black and white fur and eats bamboo?", "Giant panda", ["Polar bear", "Zebra"], "Pandas eat bamboo for most of the day."),
  M('ani', 1, "Which animal has a long, sticky tongue for catching flies?", "Frog", ["Rabbit", "Duck"], "A frog's tongue flips out in a flash."),
  M('ani', 1, "What do caterpillars mostly eat?", "Leaves", ["Fish", "Seeds"], "Caterpillars munch leaves to grow big."),
  M('ani', 1, "What do squirrels love to collect?", "Nuts", ["Stones", "Feathers"], "Squirrels bury nuts to eat in winter."),
  M('ani', 1, "What do rabbits love to eat?", "Grass and plants", ["Meat", "Fish"], "Rabbits eat grass, leaves and vegetables."),
  M('ani', 1, "Which animal is a reptile?", "Lizard", ["Dog", "Parrot"], "Reptiles have dry, scaly skin."),
  M('ani', 1, "Which animal is a bird?", "Ostrich", ["Bat", "Butterfly"], "Ostriches are birds, even though they can't fly."),
  M('ani', 1, "Which animal has a mane?", "Horse", ["Pig", "Sheep"], "Male lions have manes too!"),
  M('ani', 1, "Which of these animals lives on a farm?", "Cow", ["Lion", "Penguin"], "Cows, sheep and hens live on farms."),
  M('ani', 1, "Which of these animals lives in the Arctic?", "Polar bear", ["Kangaroo", "Camel"], "Polar bears have thick fur and fat to stay warm."),
  M('ani', 1, "Which of these animals lives in Australia?", "Koala", ["Panda", "Polar bear"], "Koalas sleep for up to 20 hours a day."),
  T('ani', 1, "A dolphin is a fish.", false, "Dolphins are mammals. They breathe air through a blowhole."),
  T('ani', 1, "Owls can turn their heads a long way round.", true, "Owls can turn their heads about three quarters of the way round."),
  T('ani', 1, "Elephants are the biggest animals living on land.", true, "African elephants are the biggest land animals."),
  T('ani', 1, "Fish can breathe air like us.", false, "Most fish use gills to take oxygen from water."),
  T('ani', 1, "Caterpillars turn into butterflies or moths.", true, "They change inside a chrysalis or cocoon."),
  T('ani', 1, "Cats can see better than people in the dark.", true, "Cats' eyes are made to collect lots of light."),

  // body
  M('body', 1, "What do you smell with?", "Nose", ["Ears", "Elbow"], "Your nose can tell apart lots of different smells."),
  M('body', 1, "What do you taste with?", "Tongue", ["Nose", "Knees"], "Your tongue has taste buds."),
  M('body', 1, "How many teeth does a grown-up usually have?", "32", ["20", "10"], "Children have 20 baby teeth."),
  M('body', 1, "What is inside your body that helps you think?", "Brain", ["Heart", "Stomach"], "Your brain controls everything you do."),
  M('body', 1, "Which part of your body has a heel and toes?", "Foot", ["Hand", "Head"], "Each foot has five toes."),
  M('body', 1, "What do bones make together inside your body?", "A skeleton", ["A muscle", "A tooth"], "Your skeleton holds you up."),
  M('body', 1, "Which of these keeps your teeth healthy?", "Brushing twice a day", ["Eating lots of sweets", "Never drinking water"], "Brush in the morning and at bedtime."),
  M('body', 1, "What should you do before eating?", "Wash your hands", ["Jump up and down", "Close your eyes"], "Washing hands gets rid of germs."),
  T('body', 1, "You have more than one bone in your body.", true, "Grown-ups have about 206 bones."),

  // colours & shapes
  M('shape', 1, "Which shape is a wheel?", "Circle", ["Square", "Triangle"], "Circles roll smoothly."),

  // counting
  M('count', 1, "What is 10 − 3?", "7", ["6", "8"], "10 take away 3 is 7."),
  M('count', 1, "How many legs do two birds have altogether?", "4", ["2", "6"], "Each bird has 2 legs: 2 + 2 = 4."),
  M('count', 1, "Which number comes before 10?", "9", ["11", "8"], "9, then 10."),
  M('count', 2, "How many seconds are in a minute?", "60", ["100", "30"], "Count to 60 and a minute has passed."),
  M('count', 1, "Which of these numbers is the biggest?", "50", ["15", "5"], "50 is more than 15 and 5."),

  // science & weather
  M('sci', 1, "What does a thermometer measure?", "How hot or cold it is", ["How heavy it is", "How long it is"], "Thermometers measure temperature."),
  M('sci', 1, "Which of these is a magnet attracted to?", "An iron nail", ["A paper cup", "A rubber band"], "Magnets attract iron and steel."),
  M('sci', 1, "What do plants give out that we need to breathe?", "Oxygen", ["Smoke", "Sand"], "Plants make oxygen when they make food from sunlight."),
  M('sci', 1, "Which of these melts in the sun?", "An ice cube", ["A stone", "A spoon"], "Ice melts into water when it warms up."),
  M('sci', 1, "What do we use to see very tiny things up close?", "A microscope", ["A telescope", "A ruler"], "Telescopes help us see far away."),
  M('sci', 1, "What do we use to look at stars far away?", "A telescope", ["A microscope", "A spoon"], "Telescopes collect lots of light."),
  M('sci', 1, "Which of these is made of wood?", "A pencil", ["A window", "A coin"], "Pencils are wood around a graphite middle."),
  M('sci', 2, "What is the name for water falling from clouds as tiny balls of ice?", "Hail", ["Fog", "Dew"], "Hailstones can bounce when they land."),
  M('weather', 1, "In which season is it usually hottest?", "Summer", ["Winter", "Autumn"], "Summer has the longest days."),
  T('weather', 1, "Snow is made of frozen water.", true, "Snowflakes are tiny ice crystals."),
  T('sci', 1, "Metal spoons can be picked up by a magnet if they contain iron.", true, "Many steel spoons stick to magnets."),

  // space
  M('space', 1, "What goes around the Earth and lights up the night sky?", "The Moon", ["The Sun", "Mars"], "The Moon goes round the Earth about once a month."),
  T('space', 1, "People have walked on the Moon.", true, "Twelve astronauts walked on the Moon between 1969 and 1972."),

  // world
  M('world', 1, "What is the frozen land at the bottom of the world called?", "Antarctica", ["Africa", "Asia"], "Antarctica is covered in thick ice."),
  M('world', 1, "In which city is the Eiffel Tower?", "Paris", ["London", "Rome"], "The Eiffel Tower was finished in 1889."),
  M('world', 1, "What is a very big hill called?", "A mountain", ["A river", "A beach"], "The tallest mountain is Mount Everest."),
  M('world', 1, "What is a place with lots of sand and very little rain called?", "A desert", ["A forest", "A lake"], "The Sahara is a huge desert."),
  M('world', 2, "Which language do people mainly speak in Spain?", "Spanish", ["French", "German"], "Spanish is spoken in many countries."),

  // tales (public-domain stories)
  M('tale', 1, "Who climbed a beanstalk to a giant's castle?", "Jack", ["Hansel", "Peter Pan"], "Jack swapped the family cow for magic beans."),
  M('tale', 1, "Who let down her long hair from a tower?", "Rapunzel", ["Cinderella", "Goldilocks"], "The prince climbed up her hair."),
  M('tale', 1, "Whose porridge did Goldilocks eat?", "The three bears'", ["The three little pigs'", "The seven dwarfs'"], "Baby Bear's porridge was just right."),
  M('tale', 1, "In the story, what did the three little pigs build their houses from?", "Straw, sticks and bricks", ["Snow, ice and glass", "Paper, cloth and sand"], "Only the brick house was strong enough."),
  M('tale', 1, "Who wanted to blow the pigs' houses down?", "The big bad wolf", ["The fox", "The giant"], "He huffed and he puffed!"),
  M('tale', 1, "Whose nose grew when he told a lie?", "Pinocchio", ["Peter Pan", "Jack"], "Pinocchio was a wooden puppet."),
  M('tale', 1, "Who ate a poisoned apple and fell into a deep sleep?", "Snow White", ["Cinderella", "Little Red Riding Hood"], "She lived with seven dwarfs."),
  M('tale', 2, "What did Hansel and Gretel find in the forest?", "A house made of sweets", ["A golden castle", "A magic bean"], "A witch lived inside it."),
];

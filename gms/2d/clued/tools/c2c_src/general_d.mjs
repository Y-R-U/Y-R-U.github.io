import { M, T, N } from './lib.mjs';

// General bank, part D (2026-10-11 variety pass): well-known, easily checked facts. Food and nature were thin.
export default [
  // food & drink
  M('food', 1, "Guacamole is mainly made from which fruit?", "Avocado", ["Lime", "Tomato", "Mango"], "Guacamole is a Mexican dip of mashed avocado."),
  M('food', 1, "Which grain is used to make risotto?", "Rice", ["Wheat", "Oats", "Barley"], "Risotto uses short-grain rice such as arborio."),
  M('food', 1, "Hummus is made mainly from which legume?", "Chickpeas", ["Lentils", "Kidney beans", "Peas"], "Chickpeas are blended with tahini, lemon and garlic."),
  M('food', 2, "Tahini is a paste made from which seeds?", "Sesame seeds", ["Sunflower seeds", "Pumpkin seeds", "Poppy seeds"], "Tahini is ground sesame."),
  M('food', 1, "Which country is the origin of sushi?", "Japan", ["China", "Korea", "Thailand"], "Sushi is a Japanese dish of vinegared rice."),
  M('food', 2, "Kimchi, a fermented vegetable dish, comes from which country?", "Korea", ["Japan", "Vietnam", "China"], "Kimchi is usually made with napa cabbage and chilli."),
  M('food', 1, "Which nut is used to make marzipan?", "Almond", ["Walnut", "Peanut", "Cashew"], "Marzipan is almond meal and sugar."),
  M('food', 2, "Which spice gives paella and many curries a yellow colour?", "Saffron or turmeric", ["Cinnamon", "Nutmeg", "Cloves"], "Saffron colours paella; turmeric colours many curries."),
  M('food', 1, "What is the main ingredient of a traditional omelette?", "Eggs", ["Flour", "Rice", "Potatoes"], "An omelette is beaten eggs cooked in a pan."),
  M('food', 2, "Which cheese is traditionally used on a Margherita pizza?", "Mozzarella", ["Cheddar", "Brie", "Feta"], "Tomato, mozzarella and basil: the colours of the Italian flag."),
  M('food', 2, "Feta cheese is most closely linked with which country?", "Greece", ["France", "Switzerland", "Netherlands"], "Feta is a brined Greek cheese, often made from sheep's milk."),
  M('food', 2, "Which cheese is famous for having holes?", "Emmental", ["Cheddar", "Parmesan", "Stilton"], "Gas bubbles from bacteria leave the holes in Emmental."),
  M('food', 1, "Which drink is made by brewing roasted beans?", "Coffee", ["Tea", "Cocoa", "Cola"], "Coffee beans are the seeds of the coffee plant, roasted and ground."),
  M('food', 1, "Chocolate is made from the beans of which plant?", "Cacao", ["Coffee", "Vanilla", "Carob"], "Cacao beans grow in pods on the cacao tree."),
  M('food', 2, "Vanilla comes from which kind of plant?", "An orchid", ["A palm tree", "A lily", "A grass"], "Vanilla pods are the fruit of a climbing orchid."),
  M('food', 2, "Which vegetable is the main ingredient of borscht?", "Beetroot", ["Cabbage", "Carrot", "Potato"], "Borscht gets its deep red colour from beetroot."),
  M('food', 1, "Which fruit is dried to make raisins?", "Grapes", ["Plums", "Cherries", "Apricots"], "Raisins are dried grapes; prunes are dried plums."),
  M('food', 1, "Prunes are dried versions of which fruit?", "Plums", ["Grapes", "Figs", "Dates"], "Prunes are dried plums."),
  M('food', 2, "What is the main ingredient of the Middle Eastern dish falafel?", "Chickpeas or fava beans", ["Lamb", "Rice", "Aubergine"], "Falafel are fried balls of ground chickpeas or fava beans."),
  M('food', 2, "Which country gave the world the croissant as we know it?", "France", ["Belgium", "Italy", "Germany"], "The croissant was inspired by the Austrian kipferl but perfected in France."),
  T('food', 2, "Peanuts are true nuts.", false, "Peanuts are legumes, related to peas and beans."),
  T('food', 2, "Honey can stay edible for a very long time if kept sealed.", true, "Its low water content and acidity stop most microbes growing."),
  T('food', 1, "Rice grows in flooded fields called paddies in many countries.", true, "Flooding helps control weeds around the rice plants."),
  M('food', 2, "Which vitamin are citrus fruits like oranges famous for?", "Vitamin C", ["Vitamin D", "Vitamin K", "Vitamin B12"], "A lack of vitamin C causes scurvy."),
  M('food', 2, "Basmati rice is traditionally grown in India and which neighbouring country?", "Pakistan", ["Thailand", "Japan", "Egypt"], "Basmati grows in the foothills of the Himalayas in India and Pakistan."),

  // nature & animals
  M('nat', 1, "What do we call an animal that eats only plants?", "Herbivore", ["Carnivore", "Omnivore", "Predator"], "Cows and rabbits are herbivores."),
  M('nat', 1, "What do we call an animal that eats both plants and meat?", "Omnivore", ["Herbivore", "Carnivore", "Insectivore"], "Bears and humans are omnivores."),
  M('nat', 2, "What is the long winter sleep of some animals called?", "Hibernation", ["Migration", "Metamorphosis", "Camouflage"], "Hedgehogs and dormice hibernate."),
  M('nat', 2, "What do we call the change from caterpillar to butterfly?", "Metamorphosis", ["Hibernation", "Evolution", "Pollination"], "Inside the chrysalis the body is rebuilt."),
  M('nat', 1, "What is the largest ocean on Earth?", "Pacific", ["Atlantic", "Indian", "Arctic"], "The Pacific covers about a third of Earth's surface."),
  M('nat', 2, "Which animal is the largest living land animal?", "African bush elephant", ["White rhinoceros", "Hippopotamus", "Giraffe"], "Males can weigh around 6 tonnes."),
  M('nat', 1, "Which is the only mammal that can truly fly?", "Bat", ["Flying squirrel", "Sugar glider", "Colugo"], "Gliders glide; only bats flap their wings to fly."),
  M('nat', 2, "What is a group of wolves called?", "A pack", ["A pride", "A pod", "A colony"], "Wolf packs are usually a family."),
  M('nat', 2, "What is a group of whales or dolphins called?", "A pod", ["A flock", "A pack", "A swarm"], "Orcas live in pods led by older females."),
  M('nat', 2, "What is a group of fish swimming together called?", "A school or shoal", ["A herd", "A pride", "A troop"], "Swimming together helps fish avoid predators."),
  M('nat', 2, "What is a young goose called?", "Gosling", ["Cygnet", "Eaglet", "Poult"], "Goslings are covered in soft yellow down."),
  M('nat', 2, "What is a male deer called?", "Stag or buck", ["Doe", "Ewe", "Sow"], "A female deer is a doe or hind."),
  M('nat', 2, "Which part of a plant makes seeds?", "The flower", ["The root", "The stem", "The bark"], "After pollination, flowers form seeds and fruit."),
  T('nat', 1, "Whales are mammals.", true, "They breathe air and feed their young on milk."),
  T('nat', 2, "A spider is an insect.", false, "Spiders are arachnids with eight legs; insects have six."),
  T('nat', 2, "Koalas are bears.", false, "Koalas are marsupials; their young grow in a pouch."),
  T('nat', 2, "Penguins live in the wild in the Arctic.", false, "Wild penguins live in the southern hemisphere."),
  T('nat', 1, "Bamboo is a type of grass.", true, "Some bamboos can grow nearly a metre in a day."),

  // science & space
  M('sci', 1, "At what temperature does pure water boil at sea level?", "100 °C", ["90 °C", "50 °C", "212 °C"], "That is 212 °F."),
  M('sci', 1, "At what temperature does pure water freeze?", "0 °C", ["10 °C", "4 °C", "32 °C"], "That is 32 °F."),
  M('sci', 2, "Which part of an atom has a negative charge?", "Electron", ["Proton", "Neutron", "Nucleus"], "Protons are positive and neutrons have no charge."),
  M('sci', 2, "What do we call a substance that speeds up a chemical reaction without being used up?", "Catalyst", ["Solvent", "Isotope", "Polymer"], "Enzymes are the catalysts of living things."),
  M('sci', 2, "Sound cannot travel through which of these?", "A vacuum", ["Water", "Steel", "Air"], "Sound needs something to vibrate through."),
  M('sci', 1, "How many colours are traditionally named in a rainbow?", "Seven", ["Five", "Six", "Nine"], "Red, orange, yellow, green, blue, indigo and violet."),
  M('space', 1, "Which is the largest planet in our solar system?", "Jupiter", ["Saturn", "Neptune", "Earth"], "More than 1,300 Earths could fit inside it."),
  N('space', 2, "How many planets are there in our solar system?", 8, "planets", 0, "Pluto was reclassified as a dwarf planet in 2006."),

  // geography
  M('geo', 2, "What is the longest river in South America?", "Amazon", ["Paraná", "Orinoco", "São Francisco"], "The Amazon carries more water than any other river."),
  M('geo', 2, "Which mountain range separates Europe from Asia in Russia?", "The Urals", ["The Alps", "The Carpathians", "The Pyrenees"], "The Ural Mountains run north to south for about 2,500 km."),
  M('geo', 2, "Which mountain range lies between France and Spain?", "The Pyrenees", ["The Alps", "The Apennines", "The Urals"], "The small country of Andorra sits in the Pyrenees."),
  M('geo', 2, "Which country has the most people?", "India", ["China", "United States", "Indonesia"], "India passed China in 2023, according to UN estimates."),
  M('geo', 2, "Which canal links the Mediterranean Sea and the Red Sea?", "Suez Canal", ["Panama Canal", "Kiel Canal", "Corinth Canal"], "It opened in 1869."),
  M('geo', 2, "In which country are the ancient pyramids of Giza?", "Egypt", ["Mexico", "Sudan", "Iraq"], "They stand on the edge of Cairo."),
  M('geo', 2, "Which US state is made up of islands in the Pacific Ocean?", "Hawaii", ["Alaska", "Florida", "California"], "Hawaii became the 50th state in 1959."),
  T('geo', 2, "Iceland is in the European Union.", false, "Iceland is not an EU member, though it is in the European Economic Area."),

  // history
  M('his', 2, "Which ancient people built Machu Picchu?", "The Incas", ["The Aztecs", "The Maya", "The Olmecs"], "It was built in the 1400s."),
  M('his', 2, "Which ship sank on its first voyage in April 1912?", "Titanic", ["Lusitania", "Britannic", "Olympic"], "It struck an iceberg in the North Atlantic."),
  M('his', 2, "The Great Wall was mainly built to protect which country?", "China", ["Japan", "Mongolia", "Korea"], "Its best-known sections were built under the Ming dynasty."),
  M('his', 3, "Which empire was ruled from Constantinople after the fall of Rome in the west?", "The Byzantine Empire", ["The Ottoman Empire", "The Holy Roman Empire", "The Persian Empire"], "It lasted until the Ottomans took the city in 1453."),

  // arts, music & books
  M('art', 2, "Which Dutch painter cut off part of his own ear?", "Vincent van Gogh", ["Rembrandt", "Johannes Vermeer", "Piet Mondrian"], "It happened in Arles in 1888."),
  M('art', 2, "Which colours are the three traditional primary colours in painting?", "Red, yellow and blue", ["Red, green and blue", "Black, white and grey", "Orange, green and purple"], "Mixing them gives the secondary colours."),
  M('mus', 1, "How many strings does a standard violin have?", "Four", ["Five", "Six", "Three"], "They are tuned G, D, A and E."),
  M('mus', 2, "Which instrument family does the clarinet belong to?", "Woodwind", ["Brass", "Strings", "Percussion"], "It has a single reed."),
  M('lit', 2, "Which detective lived at 221B Baker Street?", "Sherlock Holmes", ["Hercule Poirot", "Miss Marple", "Inspector Morse"], "Arthur Conan Doyle created him in 1887."),
  M('lit', 2, "In Greek myth, who flew too close to the Sun on wings of wax?", "Icarus", ["Perseus", "Theseus", "Jason"], "His father Daedalus made the wings."),
  M('lit', 2, "In Greek myth, who was the king of the gods?", "Zeus", ["Poseidon", "Hades", "Apollo"], "He ruled from Mount Olympus."),
  M('lit', 2, "In Norse myth, what is the name of Thor's hammer?", "Mjölnir", ["Gungnir", "Excalibur", "Gram"], "It always returned to his hand."),

  // body & health
  M('body', 2, "Where in the body is the smallest bone?", "The ear", ["The nose", "The toe", "The finger"], "The stapes is about 3 mm long."),
  M('body', 2, "What is the common name for the patella?", "Kneecap", ["Shoulder blade", "Collarbone", "Shin bone"], "It protects the front of the knee joint."),

  // language & maths & tech
  M('lang', 1, "What is the opposite of 'ancient'?", "Modern", ["Old", "Antique", "Historic"], "Ancient means very old."),
  M('lang', 2, "What is a word that means the same as another word called?", "A synonym", ["An antonym", "A homophone", "An acronym"], "'Big' and 'large' are synonyms."),
  M('lang', 2, "What is a word that sounds like another but is spelt differently called?", "A homophone", ["A synonym", "An antonym", "A palindrome"], "'Sea' and 'see' are homophones."),
  M('lang', 2, "What is a word that reads the same backwards called?", "A palindrome", ["An anagram", "A homophone", "A haiku"], "'Level' and 'racecar' are palindromes."),
  M('math', 1, "How many sides does a hexagon have?", "Six", ["Five", "Seven", "Eight"], "Honeycomb cells are hexagons."),
  M('math', 2, "How many degrees are in a right angle?", "90", ["45", "180", "360"], "A full turn is 360 degrees."),
  M('math', 2, "What do the angles of a triangle add up to?", "180 degrees", ["90 degrees", "360 degrees", "270 degrees"], "This is true for every flat triangle."),
  M('tech', 2, "What does 'www' stand for in a web address?", "World Wide Web", ["Wide World Web", "Web World Wide", "World Web Window"], "Tim Berners-Lee invented the web in 1989."),
  M('tech', 2, "Which company makes the iPhone?", "Apple", ["Samsung", "Google", "Microsoft"], "The first iPhone came out in 2007."),
];

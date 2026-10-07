// Gap-filling questions (lane GAPS, 2026-10-07): true/false, number and order questions for the general~<theme>
// slices that had too few of a kind for the tf, number and order formats. Facts are textbook ones, checked on Wikipedia.
import { T, N, O } from './lib.mjs';

export default [
  // ---- history ----
  T('his', 3, "Cleopatra lived closer in time to the first Moon landing than to the building of the Great Pyramid of Giza.", true, "The Great Pyramid dates from about 2560 BC; Cleopatra died in 30 BC, about 2,000 years before 1969."),
  T('his', 2, "The Hundred Years' War lasted exactly 100 years.", false, "It ran from 1337 to 1453, about 116 years, with long truces."),
  T('his', 3, "Oxford University was already teaching students before the Aztec city of Tenochtitlan was founded.", true, "Teaching at Oxford began in about 1096; Tenochtitlan was founded in 1325."),
  T('his', 2, "The Great Wall of China was built during a single dynasty.", false, "Walls were built and rebuilt over about 2,000 years; most of what stands today is from the Ming dynasty."),
  T('his', 1, "The Berlin Wall stood for more than 40 years.", false, "It stood from 1961 until 1989, about 28 years."),
  O('his', 3, "Put these 15th- and 16th-century events in order, earliest first.", ["Fall of Constantinople", "Columbus reaches the Americas", "Luther's 95 Theses", "Spanish Armada"], "Earliest first", "1453, 1492, 1517 and 1588."),
  O('his', 1, "Put these US presidents in order, earliest first.", ["George Washington", "Abraham Lincoln", "Franklin D. Roosevelt", "John F. Kennedy"], "Earliest first", "Washington took office in 1789, Lincoln in 1861, Roosevelt in 1933 and Kennedy in 1961."),
  O('his', 2, "Put these English monarchs in order, earliest first.", ["Henry VIII", "Elizabeth I", "Queen Victoria", "Elizabeth II"], "Earliest first", "Their reigns began in 1509, 1558, 1837 and 1952."),

  // ---- geography ----
  N('geo', 2, "About how long is the River Nile, in kilometres?", 6650, "km", 300, "It is usually given as about 6,650 km, from its sources to the Mediterranean."),
  N('geo', 2, "How many countries are members of the United Nations?", 193, "countries", 0, "South Sudan became the 193rd member in 2011."),
  N('geo', 3, "About how deep is the Challenger Deep, the deepest known point of the ocean, in metres?", 10935, "m", 150, "Recent surveys put it at about 10,935 m, in the Mariana Trench."),
  N('geo', 2, "In which year did the Panama Canal open?", 1914, "", 2, "It opened on 15 August 1914."),
  N('geo', 3, "How many countries share a land border with Germany?", 9, "countries", 0, "Denmark, Poland, Czechia, Austria, Switzerland, France, Luxembourg, Belgium and the Netherlands."),
  O('geo', 1, "Put these rivers in order of length, longest first.", ["Nile", "Danube", "Rhine", "Thames"], "Longest first", "About 6,650 km, 2,850 km, 1,230 km and 346 km."),
  O('geo', 1, "Put these oceans in order of size, largest first.", ["Pacific Ocean", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean"], "Largest first", "The Pacific is bigger than all the land on Earth put together; the Arctic is the smallest ocean."),
  O('geo', 2, "Put these capital cities in order from north to south.", ["Oslo", "Paris", "Rome", "Cairo"], "Furthest north first", "Oslo is at about 60° N, Paris 49° N, Rome 42° N and Cairo 30° N."),

  // ---- art ----
  T('art', 2, "Vincent van Gogh sold hundreds of paintings during his lifetime.", false, "He sold very few and was little known until after his death in 1890."),
  T('art', 1, "The ancient Greek statue the Venus de Milo still has both of its arms.", false, "Its arms were already missing when it was found on the island of Milos in 1820."),
  T('art', 1, "Michelangelo's statue of David is carved from marble.", true, "He carved it from a single block of Carrara marble between 1501 and 1504."),
  T('art', 2, "The Mona Lisa was once stolen from the Louvre.", true, "Vincenzo Peruggia took it in 1911; it was found in Florence in 1913."),
  T('art', 1, "'The Scream' was painted by Edvard Munch.", true, "The Norwegian artist made several versions of it, the first in 1893."),
  T('art', 1, "Andy Warhol is famous for pictures of Campbell's soup cans.", true, "His 32 Campbell's Soup Cans (1962) helped launch Pop Art."),
  T('art', 2, "Salvador Dalí was born in Mexico.", false, "Dalí was born in Figueres, in Catalonia, Spain, in 1904."),

  // ---- music ----
  T('mus', 3, "Elvis Presley was born in Memphis, Tennessee.", false, "He was born in Tupelo, Mississippi, in 1935; his family moved to Memphis when he was 13."),
  T('mus', 3, "Johann Sebastian Bach and George Frideric Handel were born in the same year.", true, "Both were born in Germany in 1685, about 130 km apart."),
  T('mus', 1, "A cello is bigger than a violin.", true, "The cello is played sitting down, held between the knees."),
  T('mus', 1, "Mick Jagger is the lead singer of the Rolling Stones.", true, "Jagger has fronted the band since it formed in London in 1962."),
  T('mus', 1, "The pop group ABBA came from Norway.", false, "ABBA were Swedish; they won Eurovision for Sweden with 'Waterloo' in 1974."),
  T('mus', 1, "The tuba belongs to the woodwind family.", false, "The tuba is the largest and lowest member of the brass family."),
  N('mus', 2, "How many symphonies did Beethoven complete?", 9, "symphonies", 0, "His Ninth, with the 'Ode to Joy', was first performed in 1824."),
  N('mus', 2, "In which year did the Beatles release their first single, 'Love Me Do'?", 1962, "", 1, "'Love Me Do' came out in the UK in October 1962."),
  N('mus', 2, "How many valves does a standard trumpet have?", 3, "valves", 0, "Pressing the three valves in different combinations changes the note."),
  O('mus', 1, "Put these string instruments in order of size, largest first.", ["Double bass", "Cello", "Viola", "Violin"], "Largest first", "The bigger the instrument, the lower it plays."),
  O('mus', 2, "Put these singing voices in order from highest to lowest.", ["Soprano", "Alto", "Tenor", "Bass"], "Highest first", "Soprano and alto are the higher voices, tenor and bass the lower ones."),
  O('mus', 3, "Put these composers in order of birth, oldest first.", ["Antonio Vivaldi", "Joseph Haydn", "Frédéric Chopin", "Claude Debussy"], "Born earliest first", "1678, 1732, 1810 and 1862."),
  O('mus', 2, "Put these ways of playing music in order of invention, earliest first.", ["Vinyl LP", "Compact cassette", "Compact disc", "iPod"], "Earliest first", "1948, 1963, 1982 and 2001."),

  // ---- books ----
  T('lit', 2, "In Mary Shelley's novel, Frankenstein is the name of the monster.", false, "Victor Frankenstein is the scientist; his creature is never given a name."),
  T('lit', 1, "Charles Dickens wrote 'Pride and Prejudice'.", false, "Jane Austen wrote it; it was published in 1813."),
  T('lit', 1, "Sherlock Holmes lives at 221B Baker Street.", true, "He shares the London flat with Dr Watson."),
  T('lit', 2, "'Robinson Crusoe' was written by Daniel Defoe.", true, "It was published in 1719."),

  // ---- screen ----
  T('pop', 1, "The 1997 film 'Titanic' won the Oscar for Best Picture.", true, "It was one of its 11 Academy Awards."),
  T('pop', 2, "'Toy Story' (1995) was the first feature film made entirely with computer animation.", true, "Pixar made it; it was released in November 1995."),
  T('pop', 2, "In the 1939 film 'The Wizard of Oz', Dorothy's magic slippers are silver.", false, "They are ruby in the film; they were silver in L. Frank Baum's book."),
  T('pop', 2, "Pac-Man was created in Japan.", true, "Namco released it in Japan in 1980."),
  T('pop', 2, "Walt Disney was the first voice of Mickey Mouse.", true, "He voiced Mickey from 1928 until 1947."),
  T('pop', 3, "Batman first appeared in a comic book in 1939.", true, "He debuted in Detective Comics #27 in 1939."),
  T('pop', 1, "In 'Finding Nemo', Nemo is a goldfish.", false, "Nemo is a clownfish."),
  N('pop', 1, "In which year was the first Star Wars film released?", 1977, "", 1, "It opened in US cinemas on 25 May 1977."),
  N('pop', 2, "In which year was the first Harry Potter film released?", 2001, "", 1, "'Harry Potter and the Philosopher's Stone' came out in November 2001."),
  N('pop', 2, "In which year was the film 'Jurassic Park' released?", 1993, "", 1, "Steven Spielberg's film came out in June 1993."),

  // ---- animals ----
  N('ani', 2, "About how many months is an African elephant pregnant for?", 22, "months", 1, "About 22 months, the longest pregnancy of any land animal."),
  N('ani', 2, "How many chambers does a cow's stomach have?", 4, "chambers", 0, "The rumen, reticulum, omasum and abomasum."),
  N('ani', 3, "How many eyes does a honey bee have?", 5, "eyes", 0, "Two large compound eyes and three small simple eyes on top of its head."),
  N('ani', 3, "How many teeth does an adult dog usually have?", 42, "teeth", 0, "Adult dogs have 42 teeth; puppies have 28 milk teeth."),
  O('ani', 1, "Put these animals in order of weight, heaviest first.", ["Blue whale", "African elephant", "Hippopotamus", "Polar bear"], "Heaviest first", "Blue whales can top 100 tonnes; elephants weigh about 6 tonnes, hippos about 1.5 and polar bears under 1."),
  O('ani', 1, "Put these eggs in order of size, largest first.", ["Ostrich egg", "Chicken egg", "Quail egg", "Hummingbird egg"], "Largest first", "An ostrich egg weighs about 1.4 kg; a hummingbird egg is smaller than a jelly bean."),
  O('ani', 1, "Put these animals in order of how many legs they have, most first.", ["Spider", "Ant", "Chicken", "Snake"], "Most legs first", "8, 6, 2 and 0."),
  O('ani', 2, "Put these animals in order of top speed, fastest first.", ["Peregrine falcon", "Cheetah", "Horse", "Human"], "Fastest first", "A diving peregrine can pass 300 km/h; cheetahs reach about 100 km/h, racehorses about 70 and the fastest humans about 44."),
  O('ani', 2, "Put these animals in order of how long their pregnancy lasts, longest first.", ["African elephant", "Human", "Dog", "Hamster"], "Longest first", "About 22 months, 9 months, 2 months and under 3 weeks."),
  O('ani', 2, "Put these animals in order of how long they can live, longest first.", ["Greenland shark", "Human", "Dog", "Mouse"], "Longest-lived first", "Greenland sharks may live for centuries; dogs live about 10–13 years and mice 1–2."),
];

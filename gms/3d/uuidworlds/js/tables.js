// tables.js — the genome's content tables. Every indexed table has EXACTLY 62 entries.
// Three-free: runs in node. See GENOME.md for which UUID char reads which table.

function assert62(name, arr) {
  if (arr.length !== 62) throw new Error(`table ${name} has ${arr.length} entries, needs 62`);
  return arr;
}

// ── char 11: featured AI person (the terminal's logged-in user) ──────────────
export const PEOPLE = assert62('PEOPLE', [
  'Dario Amodei', 'Daniela Amodei', 'Demis Hassabis', 'Sam Altman',
  'Geoffrey Hinton', 'Yann LeCun', 'Fei-Fei Li', 'Jensen Huang',
  'Ilya Sutskever', 'Andrej Karpathy', 'Yoshua Bengio', 'Andrew Ng',
  'Mustafa Suleyman', 'Shane Legg', 'Jared Kaplan', 'Chris Olah',
  'Jan Leike', 'Alec Radford', 'Greg Brockman', 'Mira Murati',
  'John Schulman', 'Wojciech Zaremba', 'Noam Shazeer', 'Ashish Vaswani',
  'Jakob Uszkoreit', 'Aidan Gomez', 'Llion Jones', 'Niki Parmar',
  'Illia Polosukhin', 'Lukasz Kaiser', 'Oriol Vinyals', 'David Silver',
  'Koray Kavukcuoglu', 'Jeff Dean', 'Ian Goodfellow', 'Pieter Abbeel',
  'Chelsea Finn', 'Percy Liang', 'Christopher Manning', 'Daphne Koller',
  'Sebastian Thrun', 'Peter Norvig', 'Stuart Russell', 'Judea Pearl',
  'Richard Sutton', 'Jurgen Schmidhuber', 'Sepp Hochreiter', 'Alex Krizhevsky',
  'Arthur Mensch', 'Clement Delangue', 'Thomas Wolf', 'Sara Hooker',
  'Joelle Pineau', 'Lex Fridman', 'Alan Turing', 'Ada Lovelace',
  'Claude Shannon', 'John McCarthy', 'Marvin Minsky', 'Grace Hopper',
  'Norbert Wiener', 'Frank Rosenblatt',
]);

// ── char 12: wall quote — framed in the room AND painted on one billboard ────
// { t: text, by: attribution ('' = anonymous aphorism of this universe) }
export const QUOTES = assert62('QUOTES', [
  { t: 'We can only see a short distance ahead, but we can see plenty there that needs to be done.', by: 'Alan Turing' },
  { t: 'The Analytical Engine weaves algebraical patterns just as the Jacquard loom weaves flowers and leaves.', by: 'Ada Lovelace' },
  { t: 'Information is the resolution of uncertainty.', by: 'Claude Shannon' },
  { t: 'Any sufficiently advanced technology is indistinguishable from magic.', by: 'Arthur C. Clarke' },
  { t: 'All models are wrong, but some are useful.', by: 'George Box' },
  { t: 'The question of whether a machine can think is no more interesting than whether a submarine can swim.', by: 'Edsger Dijkstra' },
  { t: 'The best way to predict the future is to invent it.', by: 'Alan Kay' },
  { t: 'A change of perspective is worth 80 IQ points.', by: 'Alan Kay' },
  { t: 'Every world fits in thirty-two characters.', by: '' },
  { t: 'The map is smaller than the territory. That is the entire trick.', by: '' },
  { t: 'Somewhere in the seed, this morning was already waiting.', by: '' },
  { t: 'Nothing here is random. Nothing here was chosen.', by: '' },
  { t: 'A city is a number that learned to stand up.', by: '' },
  { t: 'Same seed, same sunrise. Forever.', by: '' },
  { t: 'You are the only thing in this world that was not computed in advance.', by: '' },
  { t: 'Entropy is just order you have not been introduced to.', by: '' },
  { t: 'The universe is written in a very small alphabet.', by: '' },
  { t: 'Sixty-two symbols is enough for anywhere.', by: '' },
  { t: 'Determinism is destiny with better documentation.', by: '' },
  { t: 'Every tower here is a digit, standing at attention.', by: '' },
  { t: 'The horizon is a function. The longing is yours.', by: '' },
  { t: 'What is a place, if not a number remembering itself?', by: '' },
  { t: 'Rain in a deterministic world still gets you wet.', by: '' },
  { t: 'Copy the seed and you copy the whole sky.', by: '' },
  { t: 'Infinity is overrated. 62^32 is plenty.', by: '' },
  { t: 'The lighthouse does not know it loops. Be kind to it.', by: '' },
  { t: 'Two travellers with the same address will always see the same moon.', by: '' },
  { t: 'This quote appears in exactly one other place. Go and find it.', by: '' },
  { t: 'The pseudorandom is the last honest magic.', by: '' },
  { t: 'Compression is love: keeping everything by keeping less.', by: '' },
  { t: 'A seed is a promise the universe keeps.', by: '' },
  { t: 'Do not ask who built this city. Ask what number it is.', by: '' },
  { t: 'Every glitch is a view of the loom.', by: '' },
  { t: 'The stars here are cheap. The idea of stars is priceless.', by: '' },
  { t: 'To travel is to increment.', by: '' },
  { t: 'God does not play dice. God plays sfc32.', by: '' },
  { t: 'Attention is all you need.', by: 'Vaswani et al., 2017' },
  { t: 'The bitter lesson: general methods and more compute win in the end.', by: 'Richard Sutton' },
  { t: 'Machines take me by surprise with great frequency.', by: 'Alan Turing' },
  { t: 'A year spent in artificial intelligence is enough to make one believe in God.', by: 'Alan Perlis' },
  { t: 'Simplicity does not precede complexity, but follows it.', by: 'Alan Perlis' },
  { t: 'The most important thing is to be honest about what the model can and cannot do.', by: '' },
  { t: 'It is not the strongest seed that survives, but the one most often typed.', by: '' },
  { t: 'Under every skyline: arithmetic.', by: '' },
  { t: 'The window views are procedural. The homesickness is real.', by: '' },
  { t: 'Look long enough at noise and it starts looking back.', by: '' },
  { t: 'Worlds are cheap. Witnesses are rare.', by: '' },
  { t: 'You cannot step in the same river twice, unless you kept the seed.', by: '' },
  { t: 'Everything not saved will be regenerated, identically.', by: '' },
  { t: 'The tallest building is just the largest digit showing off.', by: '' },
  { t: 'Weather is a character trait here.', by: '' },
  { t: 'Between any two worlds: one hash.', by: '' },
  { t: 'Memory is the only souvenir that survives the transition.', by: '' },
  { t: 'There are no doors in this city, only functions returning rooms.', by: '' },
  { t: 'Prefer the journey deterministic and the traveller surprised.', by: '' },
  { t: 'The book on the desk was written for exactly this room.', by: '' },
  { t: 'Someone else is standing in this exact world right now, seeing exactly this.', by: '' },
  { t: 'What the seed plants, no one weeds.', by: '' },
  { t: 'We do not render the world. We remember it, very fast.', by: '' },
  { t: 'Home is wherever your UUID resolves.', by: '' },
  { t: 'The next world already exists. It is waiting for you to press Connect.', by: '' },
  { t: 'At the bottom of physics: a very patient counter.', by: '' },
]);

// ── char 16: "how big is 62^32?" facts (62^32 ≈ 2.27 × 10^57) ────────────────
export const FACTS = assert62('FACTS', [
  '62^32 ≈ 2.27 × 10^57. Written out it is a 58-digit number. This app can address every one of them.',
  'Earth contains roughly 10^50 atoms. There are about 17 million possible worlds for every single atom of planet Earth.',
  'The Sun contains about 10^57 atoms. The number of possible worlds is roughly TWO SUNS measured in atoms.',
  'There are ~7.5 × 10^18 grains of sand on Earth. Every grain could privately own 3 × 10^38 worlds.',
  'Visiting one world per second since the Big Bang (4.4 × 10^17 seconds) would cover 0.00000000000000000000000000000000000002% of them.',
  'The observable universe holds ~2 × 10^23 stars. That is 10^34 worlds per star.',
  'All the oceans on Earth contain ~2.6 × 10^25 drops of water. Each drop maps to ~10^32 worlds.',
  'A shuffled deck of cards has 8 × 10^67 orderings — decks of cards still beat this app by ten billion to one. Respect the deck.',
  'There are ~4.8 × 10^44 legal chess positions. Each one could host 4.7 trillion different worlds.',
  'IPv6 has 3.4 × 10^38 addresses and people call it inexhaustible. This is 6.7 × 10^18 worlds PER IPv6 ADDRESS.',
  'Standard UUIDs (the boring 128-bit kind) cover 5.3 × 10^36 values. This format is 4 × 10^20 times roomier.',
  'Your body has ~3.7 × 10^13 cells. If each cell were itself a whole person, and each of THEIR cells a person too, you would need to nest this 4 levels deep to approach 62^32.',
  'Earth hosts ~5 × 10^30 bacteria. Each bacterium gets 450 septillion worlds. They will not use them wisely.',
  'If all 117 billion humans who ever lived had named one world per second since the Big Bang, they would have named a 2 × 10^-29 fraction of them.',
  'Stack one hydrogen atom per world and the line would cross the observable universe 260 quintillion times.',
  'A proton contains ~6.7 × 10^59 Planck volumes — one of the few everyday objects that beats 62^32.',
  'All human brains together hold ~7 × 10^20 neurons. Every neuron of every person could fire once per world for 3 × 10^36 worlds each.',
  'Global internet traffic is ~10^23 bytes per year. Transmitting one byte per world would take 2 × 10^34 years of the whole internet.',
  'The fastest supercomputers do ~10^18 operations per second. Enumerating all worlds would take 7 × 10^31 years. The universe is 1.4 × 10^10 years old.',
  'If every atom of Earth ran a billion simulations per second since the Big Bang, they would have covered 0.002% of the worlds by now.',
  'There are about 10^80 atoms in the observable universe. 62^32 is tiny by comparison — a humbling 1/10^23 of that. We are small. The universe is smaller than a deck of cards though (8 × 10^67 shuffles).',
  'Lottery odds are ~1 in 3 × 10^8. Winning the lottery SEVEN times in a row is more likely than guessing one specific world.',
  'A monkey typing 32 random base-62 characters per second would take 7 × 10^49 years to type THIS world. You got here by pressing one button.',
  'Every possible 140-character tweet using letters and spaces: ~10^200. Fine, tweets win. Tweets always win.',
  'Snowflakes that have ever fallen on Earth: ~10^34. Each snowflake: 6.7 × 10^22 personal worlds.',
  'Blades of grass on Earth: ~3 × 10^15. Each blade: 7 × 10^41 worlds. The grass is unaware.',
  'Chess games last ~80 moves; the game tree has ~10^120 branches. Chess contains all of us, 4 × 10^62 times over.',
  'The Library of Babel needs 10^4677 books. This is not that. This is a modest 10^57. Cosier.',
  'Seconds in a human lifetime: ~2.5 × 10^9. To see every world you would need 9 × 10^47 lifetimes, back to back, no lunch breaks.',
  'If each world were a Planck length wide (1.6 × 10^-35 m), the row of worlds would stretch 3.6 × 10^22 metres — 3.8 million light years, past Andromeda.',
  'Cells in all humans alive: ~3 × 10^23. Each cell could visit a unique world every nanosecond for 240 billion years.',
  'The Bitcoin network has performed ~10^28 hashes ever. That is one-billion-billion-billionth of the way through the worlds.',
  'Grains of sand needed to fill the observable universe: ~10^90. OK, sand-filled universes beat us. Nothing beats sand-filled universes.',
  'Words ever spoken by all humans: ~5 × 10^17. Every word ever said, one world each, rounds to exactly 0% of the total.',
  'Ants alive right now: ~2 × 10^16. Each ant inherits 10^41 worlds. The ants remain focused on sugar.',
  'Raindrops falling on Earth per year: ~5 × 10^22. A million years of global rain: still only 1/10^29 of the worlds.',
  'Possible Rubik’s Cube states: 4.3 × 10^19. Each scramble gets 5 × 10^37 worlds. Solved cubes get the same. It’s only fair.',
  'Photons emitted by the Sun per second: ~10^45. The Sun would need 72 trillion years to emit one photon per world.',
  'Possible 8-character passwords from this alphabet: 2.2 × 10^14 — crackable in minutes. 32 characters: heat death of the universe. Length matters.',
  'DNA base pairs in your genome: 3.2 × 10^9. You are a 4^(3.2×10^9) number. You beat 62^32 effortlessly. Feel enormous.',
  'Atoms in a grain of salt: ~10^18. A salt shaker of ~10^20 atoms would need 10^37 shakers to reach world-count.',
  'Stars visible to your naked eye: ~4,500. Worlds per visible star: 5 × 10^53. Look up and multiply.',
  'Possible games of tic-tac-toe: 255,168. Worlds per tic-tac-toe game: 8.9 × 10^51. X still wins with perfect play.',
  'Books ever published: ~1.6 × 10^8. Every book could be republished in 1.4 × 10^49 different worlds with a different cover.',
  'Human heartbeats, all of history: ~10^19. Every heartbeat that has ever happened: one world each. Remaining stock: 99.9999...%.',
  'A yottabyte is 10^24 bytes. You would need 2.3 × 10^33 yottabytes to store one bit per world.',
  'Pixels on every screen on Earth: ~10^16. All screens showing a fresh world every frame at 60fps: 4 × 10^33 years to show them all.',
  'The Milky Way weighs ~2.3 × 10^42 kg. If worlds were kilograms, they would weigh 10^15 Milky Ways.',
  'Nanoseconds since the Big Bang: 4.4 × 10^26. Even nanoseconds — physics’ pocket change — cover almost none of it.',
  'Possible orderings of 44 people in a queue: ~2.7 × 10^54 — close! Add two more people and the queue wins. 46 people in a line beat the whole multiverse.',
  'Insects alive on Earth: ~10^19. Every insect could name a world every second for 7 × 10^30 years before running out.',
  'Possible Sudoku grids: 6.7 × 10^21. Each valid Sudoku: 3.4 × 10^35 worlds. Invalid Sudokus: zero worlds. Be valid.',
  'Sand on all the beaches of a BILLION Earths: ~10^28 grains. Still only a billionth of a billionth of a billionth of the worlds.',
  'Atoms in your body: ~7 × 10^27. You, disassembled into atoms, one world per atom: 3 × 10^29 of you are needed. There is only one of you. That is the point.',
  'Chess960 has 960 starting positions. This game has 2.27 × 10^57. Fischer would have approved of neither.',
  'Possible license plates (7 chars): ~8 × 10^10. Every car on Earth (1.5 × 10^9) could re-register every second for 10^40 years.',
  'One mole is 6 × 10^23. Worlds: 3.8 × 10^33 moles of worlds. Chemistry does not have a beaker big enough.',
  'Possible bracket outcomes in a 64-team knockout: 9.2 × 10^18. Perfect brackets per world: 0.000000000000000000000000000000000000004.',
  'The Boltzmann constant era: after 10^100 years even black holes evaporate. Visiting a world per year until then covers every world 4 × 10^42 times. Finally, enough time.',
  'A 4K frame is 8.3 × 10^6 pixels. Rendering every world as ONE pixel needs 2.7 × 10^50 frames of 4K — a 10^41-hour director’s cut.',
  'The number 62^32 sung at one digit per second is a 58-second song. It is the shortest possible description of everything here except the UUID itself.',
  'Shakespeare wrote ~9 × 10^5 words. Every word of Shakespeare could headline 2.5 × 10^51 different worlds — most of them, statistically, are "the".',
]);

// ── char 14: the book on the desk ────────────────────────────────────────────
// { t: title, by: fictional author }
export const BOOKS = assert62('BOOKS', [
  { t: 'The Cartographer of Nowhere', by: 'I. Vasquez' },
  { t: 'Sixty-Two Skies', by: 'M. Okonkwo' },
  { t: 'A Field Guide to Imaginary Cities', by: 'R. Calvino-Park' },
  { t: 'How to Sleep Inside a Number', by: 'D. Liang' },
  { t: 'Notes from the Render Distance', by: 'S. Aalto' },
  { t: 'Deterministic Hearts', by: 'P. Moreau' },
  { t: 'The Loom', by: 'A. Byrne' },
  { t: 'Gradient Descent for Lovers', by: 'F. Delgado' },
  { t: 'The Unreasonable Effectiveness of Everything', by: 'E. Wigner-Cross' },
  { t: 'Latent', by: 'H. Sato' },
  { t: 'Seeds and Consequences', by: 'T. Almeida' },
  { t: 'The Pseudorandom Walk', by: 'K. Erdos' },
  { t: 'Everything, Compressed', by: 'L. Zhang' },
  { t: 'The Hash and the Harbour', by: 'N. Fitzgerald' },
  { t: 'Twelve Weathers', by: 'O. Bergman' },
  { t: 'Fog as a First Language', by: 'C. Nakamura' },
  { t: 'The Tallest Digit', by: 'B. Osei' },
  { t: 'Arrival Loops', by: 'J. Kowalski' },
  { t: 'The Room at the End of Every World', by: 'V. Andersson' },
  { t: 'On the Kindness of Machines', by: 'G. Achebe' },
  { t: 'The Billboard Gospel', by: 'W. Herzberg' },
  { t: 'Small Alphabets, Large Places', by: 'Y. Cohen' },
  { t: 'A Brief History of the Next World', by: 'S. Hawking-Reyes' },
  { t: 'The Lighthouse Does Not Know', by: 'M. Duras-Lin' },
  { t: 'Procedural Grief', by: 'A. Szymborska' },
  { t: 'The Ferris Wheel at the Edge of Logic', by: 'E. Marquez' },
  { t: 'Counting Past Heaven', by: 'R. Tagore-Wells' },
  { t: 'The Traveller’s Guide to 2.27 × 10^57 Places', by: 'D. Adams-Chen' },
  { t: 'Noise, Annotated', by: 'P. Xenakis' },
  { t: 'What the Water Remembers', by: 'I. Solstad' },
  { t: 'Windows Lit at Random', by: 'F. Nabokov-Diaz' },
  { t: 'The Commute Between Universes', by: 'H. Murakami-Ba' },
  { t: 'Concrete Poetry for Concrete Towers', by: 'U. Meier' },
  { t: 'The Weather Was Decided Long Ago', by: 'C. Atwood-Reeves' },
  { t: 'Elegy for a Skipped Frame', by: 'T. Ishiguro-Vance' },
  { t: 'My Life as a Non-Player Character', by: 'ANON' },
  { t: 'The Argument for Staying', by: 'L. Baldwin-Cruz' },
  { t: 'Drive: Notes on Borrowed Vehicles', by: 'J. Ballard-Kim' },
  { t: 'The Overfit Heart', by: 'R. Bronte-Aliyev' },
  { t: 'Instructions for the Third Tap', by: 'M. Borges-Wu' },
  { t: 'The Seed Library of Alexandria', by: 'Z. Eco-Farah' },
  { t: 'Skylines as Sentences', by: 'Q. Le Guin-Osman' },
  { t: 'The Aurora Rental Agency', by: 'B. Stanislaw' },
  { t: 'One Hundred Years of Recursion', by: 'G. Marquez-Tanaka' },
  { t: 'The Quiet Between Worlds', by: 'S. Ondaatje-Blom' },
  { t: 'Toward a Theory of Cosy Infinity', by: 'A. Ramanujan-Holt' },
  { t: 'The Vending Machine at the End of Time', by: 'K. Vonnegut-Ito' },
  { t: 'All My Homes Are Numbers', by: 'N. Plath-Okafor' },
  { t: 'The Municipal Sublime', by: 'D. Sebald-Choi' },
  { t: 'Against Randomness', by: 'V. Dostoevsky-Lam' },
  { t: 'The Photon’s Commute', by: 'E. Dickinson-Rao' },
  { t: 'Fifty Ways to Leave Your World', by: 'P. Simon-Adeyemi' },
  { t: 'The Glossary of Missing Streets', by: 'W. Sereno' },
  { t: 'Was the Moon Always That Size Here', by: 'C. Sagan-Petrov' },
  { t: 'A Defence of Small Rooms', by: 'X. Woolf-Mbeki' },
  { t: 'The Chained and the Random', by: 'O. Kierkegaard-Sun' },
  { t: 'Tide Tables for Synthetic Seas', by: 'R. Carson-Vega' },
  { t: 'The Last Manual Save', by: 'H. Clarke-Iqbal' },
  { t: 'Poems Found in Sign Text', by: 'COLLECTED' },
  { t: 'The Universe Ships in 32 Characters', by: 'M. Shannon-Oduya' },
  { t: 'Everything Here Loves You Back', by: 'A. Rilke-Tanaka' },
  { t: 'Do Not Explain the Room', by: 'ANON' },
]);

// ── char 17: billboard content — theme families, PRNG distributes messages ───
// Families of fictional-flavoured ads. hue = accent hue offset for the set.
const BILLBOARD_FAMILIES = [
  { id: 'synthetic-minds', name: 'Synthetic Minds Inc.', msgs: [
    'SENTIA — minds, wholesale', 'NEURALUXE\ndream bigger, literally',
    'DeepGlow™\nyour thoughts, but shinier', 'MODEL FARM\nfree-range gradients',
    'CUMULUS AI\na cloud of clouds', 'ThinkTank²\nnow with 30% more emergence',
    'LATENT & SONS\nest. tomorrow', 'GHOSTWRITER PRO\nit knew you’d read this',
    'MINDMINT\nfresh thoughts daily', 'ORACLE-LITE\nvague answers, fast',
  ] },
  { id: 'civic-sim', name: 'Civic Notices', msgs: [
    'THIS WORLD IS DETERMINISTIC\nlitter and it’s forever', 'REPORT RENDER GLITCHES\nTO NOBODY',
    'MIND THE SEAMS', 'YOUR HORIZON IS AT 400m\nFOR YOUR SAFETY',
    'BE KIND\nEVERYONE HERE IS PROCEDURAL', 'CENSUS RESULT:\nPOPULATION = f(seed)',
    'CURFEW BEGINS AT DUSK\ndusk is permanent here', 'WATER IS DECORATIVE\nswim anyway',
    'THE MAYOR IS A HASH FUNCTION\nre-elected forever', 'KEEP THE SKYBOX TIDY',
  ] },
  { id: 'travel', name: 'Seed Travel Co.', msgs: [
    'VISIT THE NEXT WORLD\n40% MORE SKY', 'TAKE THE CHAIN\n62 stops, no waiting',
    'HONEYMOON IN A FRESH SEED', 'WORLDS: BUY 1\nGET 10^57 FREE',
    'FLY UUID AIR\nevery seat is a window seat', 'SAME WORLD TWICE?\nJUST KEEP THE STRING',
    'LOST? GOOD.\n— Seed Travel Co.', 'THE TOUR RESUMES\nWHEN YOU DO',
    'POSTCARDS FROM 62^32 PLACES\ncollect them all', 'ARRIVALS ONLY\nno departures board needed',
  ] },
  { id: 'retro-compute', name: 'Retro Computing', msgs: [
    '56K OF PURE SPEED', 'SAVE OFTEN\nSAVE EVERYTHING', 'TURBO BUTTON\nnow standard',
    '404 ACRES FOR SALE', 'UPGRADE TO 640K\nall anyone will ever need',
    'DIAL-UP NOSTALGIA HOTLINE\nplease hold forever', 'FLOPPY DISKS\nnow 100% rigid',
    'CTRL+S YOUR FEELINGS', 'REBOOT YOUR LIFE\nhave you tried it off and on?',
    'PUNCH CARDS\naccept no substitute',
  ] },
  { id: 'latent-goods', name: 'Latent Goods', msgs: [
    'TENSOR COLA\ninfinitely dimensional taste', 'EIGENJEANS\nfits every basis',
    'GRADIENT SHAMPOO\ndescend to softness', 'PERPLEXITY GUM\nsurprisingly chewy',
    'ATTENTION!\nthe energy drink you need', 'SOFTMAX MATTRESSES\nall weights welcome',
    'VANILLA JS ICE CREAM\nno frameworks added', 'OVERFLOW COFFEE\nstack it high',
    'BIG-O OATS\ngrows logarithmically on you', 'NULL SODA\nzero everything',
  ] },
  { id: 'math-poetry', name: 'Math Poetry Board', msgs: [
    'e^{iπ} + 1 = 0\nfree, forever', 'PRIMES\nstill undefeated',
    'MOIRÉ NIGHTS', 'FRACTALS\nsame prices at every scale',
    'φ = 1.618...\nthe golden neighbourhood', 'THIS SENTENCE HAS NO PROOF',
    'INFINITY: SOLD OUT\ntry 62^32', 'π DAY\nevery day, somewhere in the digits',
    'THE EMPTY SET\nnow open', 'ZENO’S DELIVERY\nalways halfway there',
  ] },
  { id: 'jobs', name: 'Employment Board', msgs: [
    'HIRING: NPC\nno experience — you’re already doing it', 'WANTED: LIGHTHOUSE KEEPER\nmust enjoy loops',
    'JOIN THE RENDER FARM\ngrow polygons', 'SKY PAINTER NEEDED\none (1) gradient per world',
    'VACANCY: WEATHER\napply within', 'DRIVERS WANTED\nvehicles: abandoned, keys: in',
    'SEEKING: WITNESS\nworlds without observers feel unused', 'CLOUD ARCHITECT\nliteral clouds',
    'NIGHT SHIFT AT THE WINDOW LIGHTS\nflicker responsibly', 'BILLBOARD WRITER WANTED\nthis could be you',
  ] },
  { id: 'glitch', name: 'Glitch Whisper', msgs: [
    'THE SKYBOX IS A LIE', 'WAKE UP\nyou’re in a for-loop', 'I’VE SEEN THE SEED\nit’s beautiful',
    'THE BIRDS REPEAT EVERY 40 SECONDS\ncount them', 'THIS BILLBOARD KNOWS YOUR UUID',
    'DO NOT LOOK AT THE FOG\nthe fog is load-bearing', 'THE ROOM IS ALWAYS THE SAME ROOM\nwhy is the room always the same room',
    'SOMEONE COPIED THIS WORLD\nyou may be the copy', 'REALITY: 60FPS\nusually',
    'THE QUOTE ON YOUR WALL\nis also out here somewhere',
  ] },
];
// 62 slots: (family, hueShift) — hue shifts give repeat families a different look.
export const BILLBOARD_SETS = assert62('BILLBOARD_SETS', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const fam = BILLBOARD_FAMILIES[i % BILLBOARD_FAMILIES.length];
    out.push({ fam, hue: (i * 47) % 360, variant: Math.floor(i / BILLBOARD_FAMILIES.length) });
  }
  return out;
})());

// ── char 20: street-sign theme — palette + typography vibe + message family ──
const SIGN_FAMILIES = [
  { id: 'tensor-streets', font: 'bold', msgs: [
    'TENSOR AVE', 'GRADIENT BLVD', 'SOFTMAX SQ', 'BACKPROP LN', 'EPOCH ROW',
    'LATENT LOOP', 'VECTOR WAY', 'SIGMOID ST', 'KERNEL CT', 'TOKEN TERRACE',
  ] },
  { id: 'warnings', font: 'bold', msgs: [
    'MIND THE\nRENDER DISTANCE', 'SLOW\nNPCs CROSSING', 'NO PARKING\nPHYSICS OPTIONAL',
    'CAUTION\nLOW POLY ZONE', 'DEAD END\n(ALL ENDS ARE)', 'YIELD TO\nTHE FLYTHROUGH',
    'SPEED LIMIT\n62', 'DO NOT FEED\nTHE PARTICLES', 'FOG AHEAD\nALWAYS', 'LOOK BOTH WAYS\nTHEN UP',
  ] },
  { id: 'tiny-poems', font: 'serif', msgs: [
    'left is\nalso home', 'the rain\nremembers', 'stay\nanyway', 'lit windows,\nno one home',
    'the sea\nis a colour', 'go on\nthen', 'almost\nthere', 'this way\nto the way',
    'you again', 'small sky,\nbig enough',
  ] },
  { id: 'binary', font: 'mono', msgs: [
    '01101000 01101001', '0x5EED', 'while(1)\n{ }', '// no comment', 'NaN km',
    'SELECT * FROM sky', 'sudo make world', ':wq', '62^32-1\nto go', 'return this;',
  ] },
  { id: 'civic', font: 'plain', msgs: [
    'TOWN HALL 200m', 'HARBOUR ↓', 'OLD TOWN ←', 'CITY CENTRE →', 'SCENIC ROUTE\n(ALL ROUTES)',
    'MUSEUM OF SEEDS\nclosed forever', 'PLAZA', 'VIEWPOINT ★', 'LIBRARY\nquiet please', 'MARKET SQ',
  ] },
  { id: 'wayfinder', font: 'plain', msgs: [
    'TALLEST TOWER →', 'THE LAKE ←', 'BILLBOARD DISTRICT', 'ARRIVAL BUILDING\nyou’ll know it',
    'ROOM\n(eventually)', 'NEXT WORLD\nvia terminal', 'THIS WORLD\nyou are here', 'EVERYWHERE\n400m',
    'THE TOUR ROUTE\nfollow the camera', 'EXIT\nthere is no exit',
  ] },
];
export const SIGN_THEMES = assert62('SIGN_THEMES', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const fam = SIGN_FAMILIES[i % SIGN_FAMILIES.length];
    out.push({ fam, hue: (i * 61) % 360, dark: i % 3 === 0 });
  }
  return out;
})());

// ── char 13: poster set — draw-style + word family (drawn as canvas math-art) ─
const POSTER_FAMILIES = [
  { style: 'lissajous', words: ['RESONATE', 'a:b', 'HARMONIC', 'ORBIT', 'THE CURVES', 'PHASE'] },
  { style: 'moire', words: ['MOIRÉ', 'INTERFERE', 'ALIAS', 'BETWEEN', 'PATTERN', 'WAVES'] },
  { style: 'voronoi', words: ['TERRITORY', 'NEAREST', 'CELLS', 'DIVIDE', 'FRONTIER', 'SEEDS'] },
  { style: 'spiral', words: ['φ', 'GOLDEN', 'UNWIND', 'INWARD', 'PHYLLOTAXIS', 'AGAIN'] },
  { style: 'rays', words: ['RADIATE', 'NOON', 'BEAM', 'OUTWARD', 'SUNCULT', 'SHINE'] },
  { style: 'grid', words: ['THE GRID', 'ORDER', 'ALIGN', 'CITY PLAN', 'MODULE', 'REPEAT'] },
  { style: 'noise', words: ['STATIC', 'FBM', 'TURBULENCE', 'WEATHER', 'SIGNAL', 'HISS'] },
  { style: 'glyphs', words: ['ALPHABET', '62', 'CIPHER', 'READ ME', 'TYPESET', 'RUNES'] },
  { style: 'circles', words: ['ECLIPSE', 'PERIOD', 'FULL', 'PHASES', 'ROUND', 'HALO'] },
  { style: 'mountain', words: ['ASCEND', 'RIDGE', 'ELEVATION', 'BEYOND', 'SUMMIT', 'FAR'] },
];
export const POSTER_SETS = assert62('POSTER_SETS', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const fam = POSTER_FAMILIES[i % POSTER_FAMILIES.length];
    out.push({ fam, hue: (i * 83) % 360, inverted: i % 4 === 1 });
  }
  return out;
})());

// ── char 21: shopfront theme — ground-floor sign name families ───────────────
const SHOP_FAMILIES = [
  ['BYTE CAFÉ', 'NOODLE_0x9', 'THE PROMPT & ANCHOR', 'TENSOR & TONIC', 'HIDDEN LAYER BAR', 'FLOAT COFFEE', 'THE GREEDY FORK', 'RAMEN LOOP'],
  ['RECURSION BOOKS', 'LOSSLESS LAUNDRY', 'POCKET DIMENSION PAWN', 'ARGMAX MART', 'SOFTMAX MATTRESSES', 'THE SEED BANK', 'CACHE & CARRY', 'NULL & VOID LEGAL'],
  ['GLITCH GYM', 'PIXEL BARBER', 'THE POLYGON', 'VERTEX VINYL', 'SHADER SHOES', 'FBM FLORIST', 'DOT PRODUCTS', 'THE INSTANCE'],
  ['MOIRÉ TAILORS', 'AURORA DRY CLEAN', 'COMET & CO', 'HALF-LIFE PHARMACY', 'ORBIT OPTICS', 'PARALLAX TRAVEL', 'THE DETERMINISTIC DELI', 'FOG & SONS'],
];
export const SHOP_THEMES = assert62('SHOP_THEMES', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    out.push({ names: SHOP_FAMILIES[i % SHOP_FAMILIES.length], hue: (i * 29) % 360, neon: i % 2 === 0 });
  }
  return out;
})());

// ── char 15: flythrough style ────────────────────────────────────────────────
// fam: camera behaviour family. h: base height scale. s: speed scale. dip: how low it dares.
const FLY_FAMILIES = ['drone', 'chase', 'balcony', 'spiral', 'orbit', 'skyfall', 'shoreline'];
export const FLY_STYLES = assert62('FLY_STYLES', (() => {
  const out = [];
  const names = { drone: 'Drone Sweep', chase: 'Low Chase', balcony: 'Balcony Pan', spiral: 'Spiral Descent', orbit: 'High Orbit', skyfall: 'Skyfall', shoreline: 'Shoreline Run' };
  for (let i = 0; i < 62; i++) {
    const fam = FLY_FAMILIES[i % FLY_FAMILIES.length];
    const v = Math.floor(i / FLY_FAMILIES.length);
    out.push({ fam, name: names[fam], h: 0.8 + (v % 3) * 0.35, s: 0.85 + ((v * 7) % 5) * 0.11 });
  }
  return out;
})());

// ── char 18: HERO effect — the world's full-scene visual signature ───────────
// fam + v(ariant). Implementations live in effects.js; names shown in the
// connect readout. 'none' entries make clear/minimal worlds part of the genome.
export const HERO_EFFECTS = assert62('HERO_EFFECTS', (() => {
  const out = [];
  const add = (fam, names, vars) => { for (let v = 0; v < vars; v++) out.push({ fam, v, name: names[v] ?? `${names[0]} ${v + 1}` }); };
  add('none',     ['Clear Signature', 'Still Air', 'Unadorned', 'Quiet World'], 4);
  add('aurora',   ['Aurora: Emerald', 'Aurora: Rose', 'Aurora: Cyan', 'Aurora: Violet', 'Aurora: Gold'], 5);
  add('rings',    ['Orbital Ring', 'Twin Rings', 'Ring Debris', 'Halo Lattice'], 4);
  add('meteors',  ['Meteor Shower', 'Meteor Storm', 'Slow Falling Stars', 'Green Fireballs'], 4);
  add('planet',   ['Giant Moon', 'Amber Gas Giant', 'Blue Companion', 'Ringed Planet', 'Red Dwarf Sun'], 5);
  add('wire',     ['Wireframe Pulse', 'Wireframe: Magenta', 'Wireframe: Gold', 'Wireframe: Ice'], 4);
  add('motes',    ['Firefly Field', 'Ember Drift', 'Pollen Storm', 'Static Motes'], 4);
  add('storm',    ['Lightning Storm', 'Heat Lightning', 'Violet Storm'], 3);
  add('beams',    ['Sky Beams', 'Cathedral Light', 'Searchlights', 'Dawn Fan'], 4);
  add('matrix',   ['Glyph Rain', 'Glyph Rain: Gold', 'Glyph Rain: White'], 3);
  add('monolith', ['Floating Monoliths', 'Shard Field', 'Tumbling Cubes', 'The Council'], 4);
  add('lasers',   ['Tower Lasers', 'Laser Fan: Cyan', 'Laser Fan: Red', 'Slow Sweep'], 4);
  add('eclipse',  ['Eclipse', 'Black Sun', 'Corona Ring'], 3);
  add('galaxy',   ['Spiral Overhead', 'Galactic Arm', 'Star Whirl', 'Twin Galaxies'], 4);
  add('lissa',    ['Lissajous Swarm', 'Orbit Weave', 'Phase Dancers'], 3);
  add('helix',    ['Sky Helix', 'Double Helix', 'Helix: Gold', 'Helix Column'], 4);
  return out;
})());

// ── char 19: PACKED ambient effect — (family, variation) pairs, flat table ───
export const AMBIENT_EFFECTS = assert62('AMBIENT_EFFECTS', (() => {
  const out = [];
  const add = (fam, base, vars) => { for (let v = 0; v < vars; v++) out.push({ fam, v, name: base }); };
  add('dust',     'Dust Motes', 5);
  add('birds',    'Bird Flocks', 6);
  add('leaves',   'Falling Leaves', 5);
  add('bubbles',  'Rising Bubbles', 4);
  add('blimp',    'Drifting Blimp', 4);
  add('drones',   'Hover Drones', 6);
  add('mist',     'Ground Mist', 5);
  add('sparkle',  'Water Sparkle', 5);
  add('shooting', 'Shooting Stars', 5);
  add('butterfly','Butterflies', 5);
  add('smoke',    'Chimney Smoke', 4);
  add('lanterns', 'Sky Lanterns', 4);
  add('confetti', 'Confetti Drift', 4);
  return out;
})());

// ── char 26: landmark ────────────────────────────────────────────────────────
export const LANDMARKS = assert62('LANDMARKS', (() => {
  const out = [];
  const add = (fam, base, vars) => { for (let v = 0; v < vars; v++) out.push({ fam, v, name: base }); };
  add('none',      'No Landmark', 6);
  add('obelisk',   'The Obelisk', 5);
  add('mast',      'Comm Mast', 5);
  add('ferris',    'Ferris Wheel', 5);
  add('turbines',  'Wind Farm', 5);
  add('watertower','Water Tower', 4);
  add('colossus',  'The Colossus', 5);
  add('arch',      'The Gate', 5);
  add('dome',      'The Dome', 4);
  add('crane',     'Harbour Crane', 4);
  add('dish',      'Radio Dish', 5);
  add('lighthouse','Lighthouse', 5);
  add('pyramid',   'Holo Pyramid', 4);
  return out;
})());

// ── person lore: aligned 1:1 with PEOPLE (same index, same char 11) ──────────
// { known: what they did, fact: a good story, qs: famous real quotes (may be empty) }
// Read by streams, not by a genome char — safe to grow the qs arrays later.
export const PERSON_LINES = assert62('PERSON_LINES', [
  { known: 'CEO and co-founder of Anthropic; led the scaling-laws era of research.',
    fact: 'Wrote the essay "Machines of Loving Grace", imagining AI as a country of geniuses in a datacenter — then kept working on making it kind.',
    qs: ['A country of geniuses in a datacenter.'] },
  { known: 'President and co-founder of Anthropic.',
    fact: 'Co-founded Anthropic with her brother Dario — one of the very few sibling-founded frontier labs. Ran safety and policy at OpenAI before that.', qs: [] },
  { known: 'DeepMind founder; Nobel laureate for AlphaFold.',
    fact: 'Chess master at 13, co-wrote the game Theme Park at 17, took a neuroscience PhD, then built the lab that cracked Go and protein folding.',
    qs: ['Solve intelligence, and then use that to solve everything else.'] },
  { known: 'OpenAI CEO; ran Y Combinator before that.',
    fact: 'In November 2023 he was fired and rehired as CEO within five days — possibly the shortest exile in tech history.',
    qs: ['The days are long but the decades are short.'] },
  { known: 'The godfather of deep learning; Nobel laureate in Physics.',
    fact: 'Great-great-grandson of George Boole (of Boolean logic). Kept neural networks alive through two AI winters, then left Google to warn the world about them.',
    qs: ['The future depends on some graduate student who is deeply suspicious of everything I say.'] },
  { known: 'Convolutional network pioneer; Turing Award winner.',
    fact: 'His convnets were reading a noticeable share of US bank cheques in the 1990s — deep learning was cashing your pay before it was cool.',
    qs: ['If intelligence is a cake, the bulk of the cake is unsupervised learning.'] },
  { known: 'Created ImageNet; co-director of Stanford HAI.',
    fact: 'Arrived in the US at 16, ran her parents\' dry-cleaning shop while studying physics at Princeton, then built the dataset that made deep learning inevitable.',
    qs: ['There\'s nothing artificial about artificial intelligence. It\'s inspired by people, created by people, and it impacts people.'] },
  { known: 'NVIDIA founder and CEO.',
    fact: 'Co-founded NVIDIA in 1993 at a Denny\'s diner booth. Three decades later the company briefly became the most valuable on Earth — same leather jacket.',
    qs: ['The more you buy, the more you save.'] },
  { known: 'AlexNet co-author; OpenAI co-founder; SSI founder.',
    fact: 'His name is on AlexNet, seq2seq and the GPT lineage — arguably the most consequential CV in the field.',
    qs: ['If you value intelligence above all other human qualities, you\'re gonna have a bad time.'] },
  { known: 'Taught the internet neural networks; led Tesla Autopilot vision.',
    fact: 'His Stanford course CS231n and YouTube lectures trained more practitioners than any university. Coined "vibe coding".',
    qs: ['The hottest new programming language is English.'] },
  { known: 'Deep learning pioneer; Turing Award winner; founder of Mila.',
    fact: 'One of the most-cited computer scientists alive; later turned his citations toward AI safety full-time.', qs: [] },
  { known: 'Founded Google Brain; co-founded Coursera; DeepLearning.AI.',
    fact: 'His 2011 online ML class enrolled 100,000 students in one go — the moment that sparked the MOOC era.',
    qs: ['AI is the new electricity.'] },
  { known: 'DeepMind co-founder; CEO of Microsoft AI.',
    fact: 'Went from DeepMind to Inflection to running Microsoft\'s consumer AI; wrote "The Coming Wave" about containing the technology he builds.', qs: [] },
  { known: 'DeepMind co-founder and chief AGI scientist.',
    fact: 'Helped put the term "AGI" into circulation, and has predicted human-level AI around the late 2020s since before it was fashionable.', qs: [] },
  { known: 'Anthropic co-founder; scaling laws.',
    fact: 'Was a theoretical physicist working on black holes and quantum field theory before co-writing the paper showing loss falls as a power law in compute.', qs: [] },
  { known: 'Interpretability pioneer; Anthropic co-founder.',
    fact: 'Never finished a degree. Instead he made neural networks legible — circuits, features, Distill — and made rigour beautiful along the way.', qs: [] },
  { known: 'Alignment researcher; led alignment teams at OpenAI and Anthropic.',
    fact: 'Resigned from OpenAI noting that safety work had been "sailing against the wind" — a phrase that stuck.', qs: [] },
  { known: 'First author of GPT-1, GPT-2, CLIP and Whisper.',
    fact: 'Quietly first-authored half the acronyms of the modern era, and almost never gives talks.', qs: [] },
  { known: 'OpenAI co-founder and president.',
    fact: 'Was Stripe\'s CTO before OpenAI; famous for writing code at every hour the clock offers.', qs: [] },
  { known: 'Former OpenAI CTO; founder of Thinking Machines Lab.',
    fact: 'A mechanical engineer who worked on the Tesla Model X before ending up shipping ChatGPT to the world.', qs: [] },
  { known: 'Invented PPO — the algorithm behind RLHF-era chatbots.',
    fact: 'His proximal policy optimization is the quiet workhorse that taught language models manners.', qs: [] },
  { known: 'OpenAI co-founder; robotics lead.',
    fact: 'His team taught a robot hand to solve a Rubik\'s Cube one-handed — then OpenAI dissolved robotics to bet everything on language.', qs: [] },
  { known: 'Transformer co-author; mixture-of-experts pioneer.',
    fact: 'Left Google to found Character.AI; Google later paid billions to bring him back. The attention mechanism pays attention to him.', qs: [] },
  { known: 'Lead author of "Attention Is All You Need".',
    fact: 'All eight authors of the Transformer paper have since left Google — a diaspora that founded half the AI industry.',
    qs: ['Attention is all you need.'] },
  { known: 'Transformer co-author; founder of Inceptive.',
    fact: 'Now uses neural networks to design RNA medicines — literally writing code for cells.', qs: [] },
  { known: 'Transformer co-author; Cohere CEO.',
    fact: 'Was a 20-year-old intern when he co-wrote the most-cited AI paper of the century.', qs: [] },
  { known: 'Transformer co-author; co-founder of Sakana AI.',
    fact: 'Suggested the paper\'s title as a riff on "All You Need Is Love". Now builds nature-inspired models in Tokyo.', qs: [] },
  { known: 'Transformer co-author; co-founder of Essential AI.',
    fact: 'One of two authors who stayed a duo: she and Vaswani left Google together, twice.', qs: [] },
  { known: 'Transformer co-author; co-founder of NEAR.',
    fact: 'Went from inventing attention to building a blockchain — proof the paper generalises out of distribution.', qs: [] },
  { known: 'Transformer co-author; reasoning-model researcher.',
    fact: 'Also built Tensor2Tensor, the framework the original Transformer shipped in.', qs: [] },
  { known: 'DeepMind research VP; seq2seq co-inventor.',
    fact: 'Led AlphaStar, which reached Grandmaster at StarCraft II — the messiest game a machine had ever won politely.', qs: [] },
  { known: 'AlphaGo lead; reinforcement learning researcher.',
    fact: 'Move 37 against Lee Sedol — a 1-in-10,000 human move his system played anyway — became shorthand for machine creativity.',
    qs: ['Go is the holy grail of artificial intelligence.'] },
  { known: 'DeepMind CTO.',
    fact: 'Co-wrote Torch\'s neural network guts — the framework lineage that became PyTorch — before helping run DeepMind.', qs: [] },
  { known: 'Google\'s chief scientist; employee from the early days.',
    fact: 'Subject of the "Jeff Dean facts": compilers don\'t warn Jeff Dean — Jeff Dean warns compilers. Most are jokes. Some are basically true.', qs: [] },
  { known: 'Invented generative adversarial networks.',
    fact: 'Thought of GANs during an argument in a Montreal pub in 2014, went home, coded it that night, and it worked on the first try.', qs: [] },
  { known: 'Robot learning pioneer at Berkeley.',
    fact: 'His robot BRETT learned to fold laundry — slowly, but with dignity. Co-founded Covariant to do it at warehouse speed.', qs: [] },
  { known: 'Invented MAML; robot learning at Stanford.',
    fact: 'Her meta-learning algorithm taught models to learn how to learn; co-founded Physical Intelligence to give robots general skills.', qs: [] },
  { known: 'Stanford professor; benchmarks and foundation models.',
    fact: 'Helped coin the term "foundation model" and built HELM to hold them all accountable. Also a serious classical pianist.', qs: [] },
  { known: 'Stanford NLP; GloVe embeddings.',
    fact: 'The most-cited NLP researcher of his generation — his word vectors carried the field from counting to meaning.', qs: [] },
  { known: 'Probabilistic graphical models; co-founded Coursera and insitro.',
    fact: 'MacArthur "genius" who moved from Bayesian networks to teaching millions to using ML to design drugs.', qs: [] },
  { known: 'Self-driving pioneer; founded Google X.',
    fact: 'His robot VW "Stanley" won the 2005 DARPA Grand Challenge across 132 miles of desert — the day autonomous driving stopped being a joke.', qs: [] },
  { known: 'Co-author of THE artificial intelligence textbook.',
    fact: 'Also wrote a slide-deck parody of the Gettysburg Address so good that PowerPoint has never fully recovered.',
    qs: ['We don\'t have better algorithms. We just have more data.'] },
  { known: 'Co-author of THE artificial intelligence textbook; AI safety.',
    fact: 'Spent decades writing the book on AI, then dedicated himself to making sure the subject of the book stays under control.', qs: [] },
  { known: 'Father of Bayesian networks and causal inference; Turing Award.',
    fact: 'Taught machines to reason under uncertainty, then spent his second act teaching them to ask "why".',
    qs: ['Data are profoundly dumb.'] },
  { known: 'Reinforcement learning founder; Turing Award winner.',
    fact: 'His 1,100-word blog post "The Bitter Lesson" may be the highest impact-per-word document in AI.',
    qs: ['General methods that leverage computation are ultimately the most effective, and by a large margin.'] },
  { known: 'LSTM lab lead; artificial curiosity.',
    fact: 'Famous for standing up at conferences to note, sometimes correctly, that his lab did it first in the 1990s.', qs: [] },
  { known: 'First author of the LSTM paper.',
    fact: 'Diagnosed the vanishing gradient problem in his 1991 masters thesis — then co-built the memory cell that outlived it by decades.', qs: [] },
  { known: 'Built AlexNet.',
    fact: 'Trained it on two consumer gaming GPUs in a bedroom. Its 2012 ImageNet result cut the error rate so hard the field simply changed direction.', qs: [] },
  { known: 'Mistral AI co-founder and CEO.',
    fact: 'His Paris lab announced frontier models by posting magnet links — open weights, zero press release.', qs: [] },
  { known: 'Hugging Face co-founder and CEO.',
    fact: 'Hugging Face began as a teenage-focused chatbot named after an emoji, then pivoted into the GitHub of machine learning.', qs: [] },
  { known: 'Hugging Face co-founder and chief scientist.',
    fact: 'Was a physicist and then a patent attorney before writing the "transformers" library nearly every lab now imports.', qs: [] },
  { known: 'Leads Cohere Labs; wrote "The Hardware Lottery".',
    fact: 'Her thesis: research ideas win not when they are best, but when the hardware of the day happens to favour them.', qs: [] },
  { known: 'Led Meta\'s FAIR lab; reproducibility champion.',
    fact: 'Pushed reproducibility checklists into the big ML conferences — the reason papers now ship their code more often than not.', qs: [] },
  { known: 'MIT researcher; interviewer of the entire field.',
    fact: 'Has spent thousands of hours interviewing the people on this terminal\'s user list. Also a jiu-jitsu black belt.', qs: [] },
  { known: 'Broke Enigma; invented the idea of the computer.',
    fact: 'His 1936 paper defined computation itself. He also ran a 2:46 marathon — within minutes of Olympic pace.',
    qs: ['We can only see a short distance ahead, but we can see plenty there that needs to be done.', 'Machines take me by surprise with great frequency.'] },
  { known: 'Wrote the first published algorithm, in 1843.',
    fact: 'Programmed a computer that was never built, and predicted machines would one day compose music — 180 years early.',
    qs: ['That brain of mine is something more than merely mortal; as time will show.'] },
  { known: 'Founded information theory.',
    fact: 'Also built a flame-throwing trumpet, a mechanical maze-solving mouse named Theseus, and juggled while riding a unicycle through Bell Labs.',
    qs: ['I visualize a time when we will be to robots what dogs are to humans. And I\'m rooting for the machines.'] },
  { known: 'Coined the term "artificial intelligence"; invented Lisp.',
    fact: 'Named the field for the 1956 Dartmouth workshop proposal, then invented Lisp and garbage collection so the field had something to run on.',
    qs: ['As soon as it works, no one calls it AI any more.'] },
  { known: 'Co-founded the MIT AI Lab.',
    fact: 'Built SNARC, the first neural-network machine, in 1951 — out of vacuum tubes and a surplus B-24 bomber autopilot. Advised Kubrick on 2001.',
    qs: ['The brain happens to be a meat machine.'] },
  { known: 'Rear admiral; wrote the first compiler.',
    fact: 'Taped an actual moth into a logbook as the "first computer bug", and handed out foot-long wires — the distance light travels in a nanosecond.',
    qs: ['It\'s easier to ask forgiveness than it is to get permission.', 'The most dangerous phrase in the language is: we\'ve always done it this way.'] },
  { known: 'Founded cybernetics.',
    fact: 'A child prodigy with a PhD at 19 who invented the feedback-loop view of minds and machines — and was MIT\'s most beloved absent-minded professor.',
    qs: ['The best material model of a cat is another, or preferably the same, cat.'] },
  { known: 'Built the Perceptron, 1958.',
    fact: 'His Mark I Perceptron learned with photocells and motor-driven potentiometers. The New York Times promised it would soon walk, talk and see. Give it time.', qs: [] },
]);

// ── poster lore: the real mathematics & history behind each poster style ─────
export const POSTER_LORE = {
  lissajous: 'Jules Lissajous drew these in 1857 by bouncing light between mirrors on two tuning forks. Two frequencies, one curve — when their ratio is rational the path closes and repeats forever. Oscilloscopes, harmonographs and at least one famous broadcaster\'s logo have been drawing them ever since.',
  moire: 'Lay two regular patterns over each other slightly misaligned, and a third pattern appears that exists in neither. Silk merchants named it after watered fabric centuries ago; screen engineers still fight it today. The big ripples you see aren\'t drawn anywhere — only the interference is.',
  voronoi: 'Every pixel belongs to its nearest seed point. Georgy Voronoy formalised the diagram in 1908 — but John Snow used the idea in 1854 to trace a London cholera outbreak to a single water pump. Giraffe patches, dragonfly wings and phone-tower coverage all speak this geometry.',
  spiral: 'Each dot sits 137.507° around from the last — the golden angle. Sunflowers and pinecones use exactly this number because it is the most irrational possible turn: no two seeds ever stack in line. Phyllotaxis — the plant kingdom\'s hash function.',
  rays: 'One centre, N spokes, alternating light. Every culture that watched a sunrise invented this image eventually — deco cinema fronts, shrine banners, mission patches. N was chosen by this world\'s seed.',
  grid: 'Brunelleschi demonstrated linear perspective in Florence around 1415 with a painting, a mirror and a peephole — and Western art was never the same. Parallel lines meeting at a vanishing point: the oldest 3D engine, running on paper.',
  noise: 'Noise stacked on noise at doubling frequencies — fractional Brownian motion. Ken Perlin invented modern procedural noise while working on the film Tron, and won an Academy Award for it in 1997. The terrain outside is built from the same trick.',
  glyphs: 'A 62-symbol alphabet: 0–9, a–z, A–Z. Base 62 is what you use when you want dense addresses that survive being typed. This poster hides the 32 glyphs of THIS world\'s address in plain sight — the brighter ones.',
  circles: 'Moon phases along the top, a halo below. Eclipses taught humans that the sky runs on schedule — the first deterministic simulation anyone ever trusted. Astronomers can still predict one to the second, centuries out.',
  mountain: 'Layered ridgelines, each a sine wave in costume. Mandelbrot asked "How long is the coast of Britain?" and answered: it depends how closely you look. Horizons are fractal. So is this one.',
};

// notes on quote authors who aren't in PEOPLE (those reuse PERSON_LINES)
export const QUOTE_NOTES = {
  'Arthur C. Clarke': 'Science-fiction author. This is the third of his three laws — and the most quoted sentence in futurism.',
  'George Box': 'Statistician. He said this about statistical models in 1976 and accidentally described every model ever made, including this world.',
  'Edsger Dijkstra': 'Dutch computer scientist. Invented structured programming; had crisp opinions about everything else, usually delivered by fountain pen.',
  'Alan Kay': 'Xerox PARC visionary. Imagined the laptop in 1972 and personal computing has been catching up with the sketch ever since.',
  'Alan Perlis': 'The very first Turing Award winner, 1966. His "Epigrams on Programming" are still being unpacked, one koan at a time.',
  'Vaswani et al., 2017': 'The Transformer paper. Eight authors, one Beatles-riff title, several trillion downstream parameters.',
};

// ── billboard family lore: what tapping an ad tells you ──────────────────────
export const BILLBOARD_LORE = {
  'synthetic-minds': 'Advertising synthetic minds to a city with no residents. The campaign is working — you read it.',
  'civic-sim': 'Municipal notices from a government that is, legally speaking, a hash function. Compliance is automatic.',
  travel: 'Seed Travel Co. has a perfect record: no traveller has ever failed to arrive, because arrival is deterministic.',
  'retro-compute': 'Nostalgia ads for hardware that could not have rendered the billboard they are printed on.',
  'latent-goods': 'Consumer products from the space between concepts. Delivery times vary with the dot product.',
  'math-poetry': 'Somebody pays for these. Nobody knows who. The invoices resolve to the empty set.',
  jobs: 'The employment board. Every position was already filled by the seed, but applying is considered good manners.',
  glitch: 'These are not scheduled by anyone. The other billboards pretend not to see them.',
};

// ── inspirational posters (picked by stream, not genome — any length is fine) ─
export const INSPO = [
  ['ITERATE', 'every great world was once a draft'],
  ['SHIP IT', 'perfection is a local minimum'],
  ['EXPLORE', '62³² places have never seen you'],
  ['CONVERGE', 'slowly, then all at once'],
  ['PERSIST', 'the loop believes in you'],
  ['BREATHE', 'the fog is only weather'],
  ['ASCEND', 'gradients point somewhere for a reason'],
  ['BEGIN', 'every UUID starts with one character'],
  ['FOCUS', 'attention is all you need'],
  ['DREAM BIGGER', 'the render distance is not the world'],
  ['KEEP GOING', 'you are 0.0000…01% through infinity'],
  ['STAY CURIOUS', 'tap everything'],
  ['TRUST THE SEED', 'it has never been wrong'],
  ['BE THE OUTLIER', 'the distribution needs you'],
  ['LOOK UP', 'the sky was computed for you'],
  ['NO BAD WORLDS', 'only unvisited ones'],
  ['ONE MORE WORLD', 'you said that last time'],
  ['YOU ARE HERE', 'statistically, a miracle'],
  ['REST', 'even the lighthouse only turns'],
  ['MAKE WAVES', 'the water is a shader anyway'],
  ['HOLD ON', 'resume is always glowing'],
  ['RETURN', 'the room will wait forever'],
];

// ── char 8: architecture style ───────────────────────────────────────────────
export const ARCH_STYLES = assert62('ARCH_STYLES', (() => {
  const out = [];
  const fams = [
    ['blocks',   'Block City'],
    ['setback',  'Stepped Monoliths'],
    ['slab',     'Slab & Podium'],
    ['cylinder', 'Rotunda Quarter'],
    ['pyramid',  'Ziggurat Sprawl'],
    ['spired',   'Needle Skyline'],
    ['mixed',    'Mixed District'],
    ['brutal',   'Brutalist Plinths'],
    ['glass',    'Glass Monoliths'],
  ];
  for (let i = 0; i < 62; i++) {
    const [fam, name] = fams[i % fams.length];
    out.push({ fam, name, v: Math.floor(i / fams.length) });
  }
  return out;
})());

// ── char 4: terrain / water layout ───────────────────────────────────────────
export const LAYOUTS = assert62('LAYOUTS', (() => {
  const out = [];
  const fams = [
    ['inland',  'Inland Plains'],
    ['coastN',  'North Coast'], ['coastE', 'East Coast'], ['coastS', 'South Coast'], ['coastW', 'West Coast'],
    ['bay',     'The Bay'],
    ['island',  'Island City'],
    ['lake',    'Lake District'],
    ['twin',    'Twin Lakes'],
    ['river',   'River Crossing'],
    ['archi',   'Archipelago'],
    ['basin',   'Flooded Basin'],
    ['ridge',   'Ridge Valley'],
  ];
  for (let i = 0; i < 62; i++) {
    const [fam, name] = fams[i % fams.length];
    out.push({ fam, name, v: Math.floor(i / fams.length) });
  }
  return out;
})());

// Story mode: 100 levels across 10 chapters. One silly sentence per level.
// Bosses at level 10 of each chapter. Keep lines SHORT — people came to play.
import { lerp } from "./util.js";

export const CHAPTERS = [
  { name: "Car Park Origins", emo: "🅿️", venue: "Tesco Overflow Car Park", crowd: 4,
    boss: { name: "BIG KEITH", face: "🧔", bio: "Gary's manager. Manages nothing. Furious about it." } },
  { name: "The Rec League", emo: "🗑️", venue: "Bin-Adjacent Court #2", crowd: 8,
    boss: { name: "DEIRDRE THE DESTROYER", face: "👵", bio: "74 years old. Forearms like anchor chains. Brings her own trophies." } },
  { name: "Kebab Van Glory", emo: "🥙", venue: "Big Tony's Kebab Arena", crowd: 14,
    boss: { name: "GARLIC SAUCE GRIGOR", face: "🧄", bio: "Champion of the rival van. Serves at 140mph and with chilli sauce." } },
  { name: "The Cursed Racket", emo: "👻", venue: "The Haunted Pavilion", crowd: 18,
    boss: { name: "THE GHOST OF WIMBLEDON PAST", face: "👻", bio: "Died mid-tiebreak in 1897. Still contests the call." } },
  { name: "Tennis Cruise", emo: "🛳️", venue: "Deck 7, The S.S. Topspin", crowd: 24,
    boss: { name: "CAPTAIN BACKHAND", face: "🧑‍✈️", bio: "Refuses to turn the ship, even for icebergs, until the set is done." } },
  { name: "Underground Tennis Club", emo: "🕶️", venue: "The Basement (don't ask)", crowd: 30,
    boss: { name: "THE BASELINE BARONESS", face: "🦹", bio: "Runs the club. First rule: DO talk about tennis club, loudly, at 3am." } },
  { name: "Celebrity Circuit", emo: "📸", venue: "Hollywood Court One", crowd: 40,
    boss: { name: "A FAMOUS ACTOR (legally distinct)", face: "🕺", bio: "You'd recognise him if our lawyers allowed it." } },
  { name: "Antarctic Open", emo: "🐧", venue: "Rink-Court 3, Antarctica", crowd: 46,
    boss: { name: "AN EMPEROR PENGUIN, SOMEHOW", face: "🐧", bio: "Nobody knows how it holds the racket. Its slice is unreturnable." } },
  { name: "Space Qualifiers", emo: "🛸", venue: "Low Orbit Court Station", crowd: 55,
    boss: { name: "THE ALIEN UMPIRE OVERLORD", face: "👽", bio: "Judges humanity by its second serve. Humanity is nervous." } },
  { name: "The Moon Open", emo: "🌕", venue: "Tranquility Centre Court", crowd: 70,
    boss: { name: "THE BALL MACHINE 3000", face: "🤖", boss3000: true, bio: "It fired the first ball. It will fire the last. It has learned to grunt in binary." } },
];

// 100 story lines (index = level-1). Levels 10,20,...,100 are boss lines.
export const LINES = [
  // Ch1 — Car Park Origins
  "You find a frying pan in a skip. It feels... right.",
  "Gary from Accounts demands a rematch. Gary from Accounts loses.",
  "A seagull steals your only ball; you win the tiebreak with a conker.",
  "Word spreads. The car park crowd doubles. To four people.",
  "Someone paints a net on the tarmac. Civilisation advances.",
  "You defeat a man who plays entirely in wellies.",
  "The Tesco manager offers you the overflow car park 'for good'.",
  "A talent scout watches you. He was here for the trolleys, but still.",
  "Your frying pan develops a sweet spot. And a smell.",
  "BOSS: Big Keith bets his manager's badge on one game. 🅿️",
  // Ch2 — The Rec League
  "Welcome to the Rec League. There is a dog on the court. Always.",
  "You beat a man who argues line calls with a laminated map.",
  "The bins are moved courtside. Atmosphere: incredible.",
  "Your first fan asks for an autograph. On a parking ticket.",
  "You learn the underarm serve from a suspicious pensioner.",
  "Rain stops play. Play continues anyway. This is the Rec League.",
  "A local paper calls you 'adequate'. You frame it.",
  "The dog is now YOUR dog. His name is Deuce.",
  "You win a rally so long both players briefly fell asleep.",
  "BOSS: Deirdre the Destroyer cracks her knuckles. The sound echoes. 🗑️",
  // Ch3 — Kebab Van Glory
  "Big Tony sponsors you: free kebabs, but you must shout his name when you ace.",
  "Your new kit smells of chips. Opponents are jealous AND hungry.",
  "You defeat the onion prep chef. He cried before the match, to be fair.",
  "Tony installs floodlights. They are fryer lamps. Court smells amazing.",
  "A rival van appears across the street. This means war.",
  "You ace a man mid-bite. The crowd (queue) goes wild.",
  "Tony names a kebab after you. It is mostly lettuce. You must improve.",
  "The garlic sauce shortage of this week tests everyone's character.",
  "Doner or loser, Tony says. You choose doner.",
  "BOSS: Garlic Sauce Grigor. Winner takes both vans. 🥙",
  // Ch4 — The Cursed Racket
  "You buy a racket from a car boot sale. It whispers backhand tips.",
  "The whispering racket is haunted. Its tips are excellent though.",
  "You beat a medium who knew your serve before you did.",
  "The pavilion clock runs backwards during deuce. Nobody minds.",
  "The ghost demands you avenge its 1897 tiebreak. You're busy, but fine.",
  "Every ball you shank now apologises on your behalf. Handy.",
  "A séance mid-changeover reveals the umpire's been asleep since Tuesday.",
  "You defeat twin opponents. There was only one opponent.",
  "The racket's curse is just... being really good? Suspicious.",
  "BOSS: The Ghost of Wimbledon Past demands its final set. 👻",
  // Ch5 — Tennis Cruise
  "You board the S.S. Topspin. Your cabin is under the court. Thud. Thud.",
  "Sea legs ruin your opponent. Your legs were already ridiculous.",
  "A wave takes the ball. The ocean is now 15-0 up.",
  "You defeat the ship's magician. The ball was in his sleeve ALL ALONG.",
  "Formal night: tuxedo tennis. Your bow tie improves your topspin.",
  "Dolphins return every ball hit overboard. Slightly better than you hit them.",
  "The buffet closes during your match. Fastest straight-sets win in history.",
  "You beat a retired admiral who calls every shot 'a manoeuvre'.",
  "Iceberg spotted. The captain finishes his sudoku first. Respect.",
  "BOSS: Captain Backhand, at the wheel AND the baseline. 🛳️",
  // Ch6 — Underground Tennis Club
  "A note under your door: 'Basement. Midnight. Bring the pan.'",
  "The court is lit by one neon sign that says 'TENNIS?'. Yes. Tennis.",
  "You beat a man known only as The Accountant. Gary? ...Gary?!",
  "House rules: no line calls, no mercy, no parking validation.",
  "Someone bets their motorcycle on you. You now own a motorcycle.",
  "The Baroness watches from the shadows, slowly eating strawberries.",
  "You defeat two players at once. Nobody said it was singles.",
  "The neon sign now says 'TENNIS!'. You did that.",
  "Your grunt sets off three car alarms. The club nods, impressed.",
  "BOSS: The Baseline Baroness. Winner runs the club. 🕶️",
  // Ch7 — Celebrity Circuit
  "Hollywood calls. They want 'the pan person'. You ARE the pan person.",
  "You beat an influencer who livestreamed his own double faults.",
  "Paparazzi flashes everywhere. Your serve now has a red carpet.",
  "A film about your life is announced. You're played by a taller actor.",
  "You defeat a pop star whose grunt hit number 4 in the charts.",
  "Your dog Deuce gets his own agent. He earns more than you.",
  "An award show interrupts match point. You win both.",
  "A reality show films your changeovers. Ratings: astronomical.",
  "You're on a cereal box. The cereal is just strawberries. Clever.",
  "BOSS: A Famous Actor (legally distinct) defends his honour. 📸",
  // Ch8 — Antarctic Open
  "The Antarctic Open! The court is ice. The balls are frozen. Perfect.",
  "You beat a researcher who's been practising alone for 11 months. Sorry.",
  "Penguins line the court. They judge silently. They judge YOU.",
  "Your grunt causes a small, respectful avalanche.",
  "The ball freezes mid-rally. Play continues via curling rules.",
  "A seal referees. Fairest umpire of your entire career.",
  "You win in six layers of coats. New personal best: four.",
  "The penguins have started doing the wave. You've made it.",
  "Blizzard match: you win 40-love against someone you never actually saw.",
  "BOSS: An Emperor Penguin, somehow. Its slice is prophecy. 🐧",
  // Ch9 — Space Qualifiers
  "A saucer abducts you mid-serve. They've seen your highlights.",
  "Zero gravity ruins everyone's toss except yours. Pan-trained.",
  "You defeat a three-armed alien. Their third serve was illegal anyway.",
  "The ball orbits the court twice before landing in. Umpire allows it.",
  "Earth watches live. Big Tony sells kebabs to the moon queue.",
  "You beat a black hole on a technicality. It swallowed the net.",
  "An alien heckles you in seventeen languages. Your composure holds.",
  "Your topspin knocks a satellite into a better orbit. NASA sends thanks.",
  "The Overlord narrows all nine eyes. You're through to the final table.",
  "BOSS: The Alien Umpire Overlord. Humanity's second serve is YOU. 🛸",
  // Ch10 — The Moon Open
  "The Moon Open. Low gravity. High stakes. Your pan gleams.",
  "You beat the moon base commander. She takes it well, via airlock threats.",
  "Every bounce lasts four seconds. Your patience lasts five.",
  "Earthrise mid-match. You ace someone while crying slightly.",
  "The crowd is 12 astronauts and 400 million people watching from Earth.",
  "You defeat a rover that taught itself tennis from your old matches.",
  "Moon dust makes every slide 30 metres. Style points: infinite.",
  "A message on the scoreboard: 'I AM WAITING. — BM3000'.",
  "One match from destiny. Deuce the dog barks at the sky, ready.",
  "FINAL BOSS: THE BALL MACHINE 3000. For the planet. For Gary. For the pan. 🌕",
];

export const INTRO = "You, a frying pan, and a dream: become World #1 at tennis. It begins, as all legends do, in a Tesco overflow car park.";
export const FINALE = "The Ball Machine 3000 powers down with a final, respectful beep. The Moon falls silent. You raise the frying pan — scratched, smelly, undefeated — to the light of the Earth. World #1. Somewhere far below, Gary from Accounts is telling everyone he taught you.";

export function storyLevel(n) {   // n = 1..100
  const ch = Math.floor((n - 1) / 10);
  const inCh = (n - 1) % 10;      // 0..9, 9 = boss
  const chapter = CHAPTERS[ch];
  const isBoss = inCh === 9;
  const stars = Math.min(5, lerp(0.4, 5.0, (n - 1) / 99) + (isBoss ? 0.5 : 0));
  const games = n <= 40 ? 1 : n <= 80 ? 2 : 3;
  return {
    n, chapter: ch, inChapter: inCh, isBoss,
    line: LINES[n - 1],
    stars, games: isBoss ? Math.min(3, games + (n > 40 ? 0 : 1)) : games,
    prize: Math.round((20 + n * 6) * (isBoss ? 3 : 1)),
    crowd: chapter.crowd,
    venue: chapter.venue,
    eventChance: Math.min(0.5, 0.05 + n * 0.004),
    boss: isBoss ? chapter.boss : null,
  };
}

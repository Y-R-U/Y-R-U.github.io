// Story mode: 100 levels across 10 chapters, told in very short beats with proper
// cutscenes at the start, after level 1, after every boss, and at the end.
// The tale: RAY RENNIE (63, world #4 in 1987, career ended by Victor Kane's cheated
// call in the '88 final) bets an unfit office worker — you — that he can beat them.
// You win. He coaches you. You climb, meet rival Jade Sharp, survive Ray's heart
// scare, expose Kane, and take world #1 from Kane's machine, Adrian Voss.
import { lerp } from "./util.js";

export const CHAPTERS = [
  { name: "The Pub Bet", emo: "🍺", venue: "The Crown & Racquet, back court", crowd: 4,
    boss: { name: "BIG DENNIS", face: "🍺", bio: "Landlord. Unbeaten on his own court since 1998. Pulls pints mid-rally." } },
  { name: "Park League", emo: "🌳", venue: "Duffield Park Court #2", crowd: 8,
    boss: { name: "COUNCIL KEV", face: "🧑‍🔧", bio: "Parks warden. Home advantage, and the only key to the floodlights." } },
  { name: "The Club", emo: "🎾", venue: "Roxton Lawn Tennis Club", crowd: 14,
    boss: { name: "CAPTAIN PONSONBY", face: "🧐", bio: "Forty years unbeaten in the club championship. Plays in cream flannels, wins in cold blood." } },
  { name: "County Lines", emo: "🏆", venue: "County Championships, Millfield", crowd: 20,
    boss: { name: "JADE SHARP", face: "😤", bio: "Sixteen. Fearless. Calls your coach 'the museum piece'. Ray heard her." } },
  { name: "The Wobble", emo: "💔", venue: "Duffield Park, midwinter", crowd: 12,
    boss: { name: "MARCUS 'THE WALL' WEBB", face: "🧱", bio: "Returns everything. Emotion included." } },
  { name: "Qualifiers", emo: "✈️", venue: "Pro Tour Qualies, Alicante", crowd: 30,
    boss: { name: "OLD GUS", face: "🦊", bio: "39 and immortal. Knows every trick in the book. Wrote three of the chapters." } },
  { name: "Sharp Ascent", emo: "😈", venue: "Metropole Indoor Arena", crowd: 40,
    boss: { name: "JADE SHARP", face: "😈", bio: "World #8 now. Remembers you perfectly. Has been waiting." } },
  { name: "Kane's Game", emo: "🕴️", venue: "Kane Tower Show Court", crowd: 46,
    boss: { name: "THE AUDITOR", face: "🕴️", bio: "Kane's enforcer. Zero small talk. Backhand like a tax demand." } },
  { name: "The Slam", emo: "🏟️", venue: "The Grand Slam, Centre Court", crowd: 60,
    boss: { name: "IVA GRAND", face: "👸", bio: "World #2. The last gatekeeper. Her serve has its own weather system." } },
  { name: "The Reckoning", emo: "👑", venue: "Federation Centre Court", crowd: 80,
    boss: { name: "ADRIAN VOSS", face: "🗿", boss3000: true, bio: "Kane's perfect machine. Never dropped a set here. Never smiled anywhere." } },
];

// 100 story beats (index = level-1). Levels 10,20,...,100 are boss lines.
export const LINES = [
  // Ch1 — The Pub Bet
  "Ray puts down his pint: 'One game, kid. Loser buys the round.'",
  "You ache in muscles you didn't own last week. Ray wants you at the court at 7am. AM.",
  "Drill day. Ray throws balls at your feet and calls it 'footwork'.",
  "You beat the darts team captain. The pub goes quiet, then loud.",
  "Ray tapes a 50p to the baseline: 'Hit it, keep it.' You earn your first prize money.",
  "First win streak of your life. Ray almost smiles. Almost.",
  "The regulars call you 'Ray's project' now. Ray doesn't correct them.",
  "You run home from work. Your boss assumes you're being chased.",
  "Ray watches your serve in silence, then says: 'Again.' High praise.",
  "BOSS: Big Dennis puts the pub court itself on the line. 🍺",
  // Ch2 — Park League
  "Ray enters you in the park league as 'up-and-comer'. You're twenty-eight.",
  "You win in the rain. Ray calls it 'character weather'.",
  "A dog takes the ball mid-rally. Point replayed. You win that one too.",
  "The league table spells your name wrong. You decide to make them learn it.",
  "You beat last year's runner-up. He demands a recount. Of points.",
  "Ray teaches you the slice. Your opponent falls over. Twice.",
  "Someone films your winner. Forty views. Fame.",
  "Ray says: 'You're not terrible anymore.' You'll remember this forever.",
  "Semi-final won at dusk by phone torchlight. The park approves.",
  "BOSS: Council Kev — home advantage and spare keys to everything. 🌳",
  // Ch3 — The Club
  "Roxton Lawn Tennis Club sniffs at your trainers. Ray sniffs back.",
  "You beat a man in cream flannels who said 'hard luck' before you'd even served.",
  "The committee 'reviews' your membership. You win too loudly, apparently.",
  "Ray used to play here. His photo hangs in the hallway — turned to the wall.",
  "You turn Ray's photo back around. Then win in straight games.",
  "The club coach offers to 'fix' your grip. Ray: 'It's not broken.'",
  "You beat the club treasurer. Your bar tab mysteriously doubles.",
  "The juniors start copying your serve. The committee is furious. You're delighted.",
  "One match from the club final. The flannels are getting nervous.",
  "BOSS: Captain Ponsonby defends forty years of history. 🎾",
  // Ch4 — County Lines
  "The county draw is out. Ray circles one name: 'Sharp. Watch that one.'",
  "You win ugly. Ray: 'Ugly wins count double.' They count once. He knows.",
  "Jade Sharp watches your match from the fence. Unimpressed. Noting everything.",
  "Local paper: 'PUB PLAYER STUNS SEEDS'. Ray buys nine copies.",
  "You beat the county #3. Sharp beat hers in half the time. Noted.",
  "Sharp, in passing: 'Tell your grandad the 80s called.' Ray heard.",
  "You train until the floodlights time out. Then a bit longer.",
  "Quarter-final won on a second-serve ace. Your yell startles the umpire.",
  "Semi won. Across on court two, Jade Sharp is already waiting.",
  "BOSS: Jade Sharp. Teen prodigy. Fastest riser in the county. 🏆",
  // Ch5 — The Wobble
  "You beat Sharp — and Ray missed it. He was at the hospital. 'Routine,' he says.",
  "Ray's heart 'had a moment'. He coaches from a deckchair now. Doctor's orders.",
  "Your head's not in it. You win anyway. Ray notices. Ray notices everything.",
  "Winter league. Frozen hands, one glove between you. You take turns.",
  "A federation letter: invitation to the pro qualifiers. Signed V. KANE.",
  "Ray goes very quiet at that name. 'Kane ended my career. The ball was in.'",
  "You offer to skip the qualifiers and stay. Ray: 'Don't you dare.'",
  "Marcus Webb drags you to three sets in a friendly. Ray: 'Good. You needed that.'",
  "Dawn drills, deckchair supervision, Ray's old routines. You're ready.",
  "BOSS: The Wall. Webb returns everything. Break him anyway. 💔",
  // Ch6 — Qualifiers
  "Alicante. Your first flight. Ray brings sandwiches 'against foreign prices'.",
  "Round one: a Spaniard with a forehand like a car crash. You survive it.",
  "Forty degrees on court. Ray fans you with the draw sheet.",
  "You beat a seeded junior. His coach files a complaint about your grunting.",
  "The tour players call you 'the pub guy'. It's on your towel by Thursday. Own it.",
  "Kane's federation 'randomly' schedules you at 8am. Every day. You win anyway.",
  "Clay lesson: slide, don't stop. Your socks will never recover.",
  "Match point saved with the drop shot Ray taught you behind the pub. Poetry.",
  "One win from a tour card. Ray can't watch. Ray watches anyway.",
  "BOSS: Old Gus — every trick in the book, several of them his. ✈️",
  // Ch7 — Sharp Ascent
  "You're a professional tennis player. Your card arrives. Ray laminates it.",
  "First tour win. The cheque has a comma in it.",
  "Sharp is top ten now. In interviews she 'doesn't remember' you. Sure she doesn't.",
  "You crack the top 100. The pub hangs a banner. It's a bedsheet. It's perfect.",
  "Indoor tennis: no wind, no sun, no excuses. You stop needing them.",
  "Sharp posts your old park footage, laughing. Ray replies with your ranking.",
  "You beat a top-20 serve-bot. Ray's deckchair nearly tips over with joy.",
  "The Metropole crowd learns your name. It sounds good in eight thousand voices.",
  "Semi won, live on national telly. Ray irons his good shirt for the final.",
  "BOSS: Jade Sharp, world #8. She remembers you now. 😈",
  // Ch8 — Kane's Game
  "Kane invites you up the tower. Ray waits outside: 'Say nothing. Win later.'",
  "Kane offers sponsorship 'with conditions'. You decline. Politely-ish.",
  "Suddenly every draw hands you a giant in round one. Funny, that.",
  "A text from Sharp: 'Kane's rigging your draws. He did it to me too.'",
  "You beat Kane's wildcard in front of Kane. He claps slowly. You bow slowly.",
  "The line calls are tight tonight. You win by margins no one can argue with.",
  "Ray finds the '88 final tape in a shoebox. The ball was in. Proof.",
  "Sharp leaks the tape. The federation launches an inquiry into the ceiling.",
  "Kane stops smiling in public. His enforcer starts warming up.",
  "BOSS: The Auditor. Kane's numbers man. Make him carry the one. 🕴️",
  // Ch9 — The Slam
  "The Grand Slam. Ray walks you in through the gates he was once thrown out of.",
  "Round one, Centre Court. Your legs shake for two points, then remember who trained them.",
  "The '88 tape airs before your match. The crowd chants Ray's name.",
  "You win while Ray signs autographs. 'Still got it,' he says. He does.",
  "Fourth round: cramp, a tiebreak, and a story for the grandkids. You're through.",
  "Kane resigns as president, 'to spend more time with his trophies'.",
  "Quarter won. Sharp wins hers. You nod across the corridor. Rivals. Mates. Both.",
  "Ray gets a standing ovation just for sitting down. He stands up to milk it.",
  "Semi-final: the match of your life. Second-best you'll play this week.",
  "BOSS: Iva Grand, world #2. The last gatekeeper. 🏟️",
  // Ch10 — The Reckoning
  "Kane, disgraced, makes one final bet: beat his academy's nine, then Voss. For everything.",
  "Graduate one falls. Eight identical haircuts to go.",
  "The academy players don't celebrate or despair. Voss trained the feelings out of them.",
  "You make graduate four laugh mid-match by winning ridiculously. A first, apparently.",
  "Ray coaches openly from his courtside deckchair, overruling his doctors by joy alone.",
  "Sharp turns up carrying Ray's bag. 'Someone has to,' she shrugs.",
  "Graduate eight takes a set off you. You take the next two, and his respect.",
  "The night before Voss, Ray hands you his 1988 racket: 'Finish the point.'",
  "You walk out with Ray's racket strung fresh. The crowd sounds like the sea.",
  "FINAL BOSS: Adrian Voss. For Ray. For the pub. For the ball that was in. 👑",
];

export const INTRO = "It starts, as all legends do, with a bet in a pub.";
export const FINALE = "Voss's last ball lands long. You stand perfectly still. Ray does not — deckchair overturned, shirt untucked, sixty-three years old and briefly airborne. World #1, won with Ray's 1988 racket. Back at The Crown & Racquet he pins your first 50p behind the bar. 'Told you you had talent. Now get the round in — you still owe me from game one.'";

// Cutscenes. Keyed by "start", the level number they play AFTER winning, or "end".
// Lines without `who` are narration.
export const CUTSCENES = {
  start: { title: "The Crown & Racquet", bg: "🍺", lines: [
    { txt: "Tuesday, 9pm. After work. Two pints in." },
    { who: "RAY", face: "👴", txt: "You've had spreadsheet posture all evening. Do you play anything?" },
    { who: "YOU", face: "😮‍💨", txt: "Bit of tennis at school. I'm mostly a sitting-down athlete these days." },
    { who: "RAY", face: "👴", txt: "I was world #4 in 1987." },
    { who: "YOU", face: "🤨", txt: "You're having me on." },
    { who: "RAY", face: "👴", txt: "One game. Court's out the back. I'm sixty-three and I'll beat you holding this pint." },
    { who: "YOU", face: "😅", txt: "...Go on then. You're on." },
  ]},
  1: { title: "Three Flukes", bg: "🎾", lines: [
    { txt: "Ray, hands on knees, laughing between breaths." },
    { who: "RAY", face: "👴", txt: "Beaten by a desk worker. No fitness. No footwork. All instinct." },
    { who: "YOU", face: "😮‍💨", txt: "That one down the line was a fluke." },
    { who: "RAY", face: "👴", txt: "It was three flukes. There's no such thing as three flukes." },
    { who: "RAY", face: "👴", txt: "You've got something I can't coach — and everything else, I can. Get fit. Tuesday, 7am." },
    { txt: "He never does buy that round." },
  ]},
  10: { title: "Under New Management", bg: "🍺", lines: [
    { txt: "Big Dennis shakes your hand and pulls three pints, one-handed, still sweating." },
    { who: "DENNIS", face: "🍺", txt: "First loss on my own court since '98. Drinks are on the house. ONE drink. Each." },
    { who: "RAY", face: "👴", txt: "Pub's conquered. There's a park league across town. Real fixtures. Real table." },
    { who: "YOU", face: "🙂", txt: "A league table with my name in it?" },
    { who: "RAY", face: "👴", txt: "Spelled wrong, probably. Go make them learn it." },
  ]},
  20: { title: "An Invitation", bg: "✉️", lines: [
    { txt: "Council Kev hands over the floodlight keys with unexpected ceremony." },
    { who: "KEV", face: "🧑‍🔧", txt: "Park's yours, champ. Try not to let the dog on court two." },
    { txt: "Ray holds up a stiff cream envelope. Roxton Lawn Tennis Club crest." },
    { who: "RAY", face: "👴", txt: "They've invited you to trial. Snobbiest club in the county." },
    { who: "YOU", face: "🤨", txt: "You've got history there. Your face just did a thing." },
    { who: "RAY", face: "👴", txt: "My photo's in their hallway. Facing the wall. Let's go turn it round." },
  ]},
  30: { title: "The Photo", bg: "🖼️", lines: [
    { txt: "Ponsonby, beaten, straightens Ray's photo himself. The hallway applauds." },
    { who: "PONSONBY", face: "🧐", txt: "Rennie. Your... project... plays like you did. Before." },
    { who: "RAY", face: "👴", txt: "Better. And the county championships open next month." },
    { who: "YOU", face: "😳", txt: "County? That's proper players." },
    { who: "RAY", face: "👴", txt: "There's a kid called Sharp tearing through the juniors. Watch that one." },
  ]},
  40: { title: "The Phone Call", bg: "🏥", lines: [
    { txt: "You beat Jade Sharp in the county final. The stands are loud. Ray's seat is empty." },
    { who: "SHARP", face: "😤", txt: "Not bad. For someone coached by a museum piece. ...Where is he, anyway?" },
    { txt: "Your phone buzzes. The hospital." },
    { who: "RAY", face: "👴", txt: "Before you ask — it's routine. Hearts do this at my age. Did you win?" },
    { who: "YOU", face: "😨", txt: "Ray. What happened?" },
    { who: "RAY", face: "👴", txt: "DID. YOU. WIN?" },
  ]},
  50: { title: "The Ball Was In", bg: "💔", lines: [
    { txt: "Ray, discharged, deckchair-bound, holds a letter with a gold crest." },
    { who: "RAY", face: "👴", txt: "Pro qualifiers. They want you. Signed by Victor Kane himself." },
    { who: "YOU", face: "🙂", txt: "That's good... isn't it? You've gone grey. Greyer." },
    { who: "RAY", face: "👴", txt: "1988. Final. Match point to me. My ball clips the line — Kane calls it out. No replays back then. His word against mine." },
    { who: "RAY", face: "👴", txt: "I lost the final, the sponsors, the lot. He got a federation. The ball was in." },
    { who: "YOU", face: "😠", txt: "Then I'll go win his qualifiers with your drills." },
    { who: "RAY", face: "👴", txt: "...Pack sandwiches. Spanish prices are criminal." },
  ]},
  60: { title: "The Card", bg: "✈️", lines: [
    { txt: "Old Gus nets his final trick shot and grins across at you." },
    { who: "GUS", face: "🦊", txt: "Thirty-nine years I've kept kids like you out. Go on then. Your card's earned." },
    { txt: "A tour card. Your name on it. Spelled right." },
    { who: "RAY", face: "👴", txt: "Twenty years I've waited to walk back into that world. Wasn't planning on crying at a laminating machine." },
    { who: "YOU", face: "🥲", txt: "Tuesday, 7am?" },
    { who: "RAY", face: "👴", txt: "Tuesday, 7am. Forever." },
  ]},
  70: { title: "Worth Remembering", bg: "😈", lines: [
    { txt: "Metropole Arena, match point converted. Jade Sharp meets you at the net." },
    { who: "SHARP", face: "😈", txt: "Fine. I remember you. County final. You got lucky." },
    { who: "YOU", face: "🙂", txt: "Twice now." },
    { who: "SHARP", face: "😤", txt: "...Watch yourself with Kane. That invitational glitter comes with strings. I know. I was sixteen when he offered me mine." },
    { who: "RAY", face: "👴", txt: "Kid's alright, that one. Terrible manners. Excellent backhand." },
  ]},
  80: { title: "Inquiry Into the Ceiling", bg: "🕴️", lines: [
    { txt: "The Auditor packs his racket like paperwork and leaves without a word." },
    { txt: "Everywhere: the leaked '88 tape. Slow motion. Chalk dust. The ball was IN." },
    { who: "SHARP", face: "😈", txt: "Whoops. Must've fallen out of my pocket. Onto the internet." },
    { who: "RAY", face: "👴", txt: "Thirty-eight years, and it's a teenager with a phone that clears my name." },
    { who: "YOU", face: "🙂", txt: "The Slam sent your invitation, Ray. Coach's box. Front row." },
    { who: "RAY", face: "👴", txt: "...I'll iron the good shirt." },
  ]},
  90: { title: "One Last Bet", bg: "👑", lines: [
    { txt: "You beat the world #2. On the big screen: Victor Kane, live, unscheduled." },
    { who: "KANE", face: "🎩", txt: "One final wager, since you people like those. My academy's nine graduates, then my champion, Voss. Beat them all — the #1 ranking, live on my network." },
    { who: "KANE", face: "🎩", txt: "Lose one match, and you and Rennie go back to your little pub forever." },
    { who: "RAY", face: "👴", txt: "He bet me my career once. Bet him back." },
    { who: "YOU", face: "😠", txt: "Deal. All ten of them." },
    { who: "SHARP", face: "😈", txt: "I'm carrying the deckchair. Someone has to." },
  ]},
  end: { title: "The Round", bg: "🌅", lines: [
    { txt: "Voss's last ball lands long. Silence, then everything at once." },
    { txt: "Ray is airborne. Sixty-three. Deckchair overturned. Doctors overruled." },
    { who: "VOSS", face: "🗿", txt: "...Good match." },
    { txt: "He smiles. Nobody at the academy has ever seen it. Two graduates faint." },
    { who: "RAY", face: "👴", txt: "World #1. With my old racket. The ball was in, and so are you." },
    { txt: "The Crown & Racquet, that night. Your first 50p goes up behind the bar." },
    { who: "RAY", face: "👴", txt: "Told you you had talent. Now get the round in — you still owe me from game one." },
  ]},
};

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
    // Purses grow steeply late on — by the Slam you need cup-entry money, not pub money.
    prize: Math.round((20 + n * 6) * (isBoss ? 3 : 1) * Math.pow(1 + n / 100, 5)),
    crowd: chapter.crowd,
    venue: chapter.venue,
    eventChance: Math.min(0.5, 0.05 + n * 0.004),
    boss: isBoss ? chapter.boss : null,
    // Level 1 is always Ray himself — the pub bet.
    fixed: n === 1 ? { name: "RAY RENNIE", face: "👴",
      bio: "World #4 in 1987. Currently holding a pint. Still dangerous." } : null,
  };
}

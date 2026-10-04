// Word origins. Loanwords: word | origin language (answer) | Wiktionary language code(s) to verify, ;-separated | difficulty | meaning or story (our words)
// The builder checks that the English entry's Etymology on Wiktionary names the language (code or name); unverified rows are dropped.
export const LOANWORDS = `
robot|Czech|cs|2|From robota, "forced labour"; first used in Karel Čapek's 1920 play R.U.R.
shampoo|Hindi|hi|2|From a word meaning "to press" or "massage"
pyjamas|Hindi and Urdu|hi;ur|2|From words meaning "leg garment"
bungalow|Hindi|hi;gu|2|Originally "a house in the Bengal style"
jungle|Hindi|hi|2|From a word for wild, uncultivated land
kindergarten|German|de|1|"Children's garden"
hamburger|German|de|1|Named after the city of Hamburg
tsunami|Japanese|ja|1|"Harbour wave"
karaoke|Japanese|ja|2|"Empty orchestra"
emoji|Japanese|ja|2|"Picture" plus "character"; the likeness to "emotion" is a coincidence
tycoon|Japanese|ja|3|From a title meaning "great lord"
kayak|Inuit|iu;kl;esx;ik|2|An Inuit word for a one-person hunting boat
igloo|Inuit|iu;ike|1|An Inuit word for "house"
tomato|Nahuatl|nah;nci|2|From tomatl, via Spanish
chocolate|Nahuatl|nah;nci|2|From a Nahuatl word, via Spanish
avocado|Nahuatl|nah;nci|3|From āhuacatl, via Spanish
coyote|Nahuatl|nah;nci|3|From coyōtl, via Mexican Spanish
safari|Swahili|sw|2|"Journey", itself from Arabic
algebra|Arabic|ar|2|From al-jabr, "the reunion of broken parts"
alcohol|Arabic|ar|2|From al-kuḥl, a fine powder used as eyeliner
coffee|Arabic|ar|2|From qahwa, via Turkish and Italian
magazine|Arabic|ar|3|From a word for "storehouses"
zero|Arabic|ar|3|From ṣifr, "empty", via Italian
giraffe|Arabic|ar|3|From zarāfa, via Italian
admiral|Arabic|ar|3|From amīr, "commander"
yoghurt|Turkish|tr;ota|2|From a Turkish word for the fermented milk
tulip|Turkish|tr;ota|3|From a word for "turban", which the flower was thought to resemble
bazaar|Persian|fa|2|"Market"
caravan|Persian|fa|3|"Group of travellers"
paradise|Persian|ae;peo;fa|3|From a word for a walled garden, via Greek
umbrella|Italian|it|2|"Little shade"
piano|Italian|it|1|Short for pianoforte, "soft-loud"
graffiti|Italian|it|2|"Scratchings"
volcano|Italian|it|2|From Vulcano, an island named after Vulcan, the Roman god of fire
balcony|Italian|it|3|From balcone
ballot|Italian|it|3|From ballotta, "little ball", once used to vote
croissant|French|fr|1|"Crescent"
restaurant|French|fr|2|"Restoring", from food that restores your strength
mosquito|Spanish|es|2|"Little fly"
alligator|Spanish|es|2|From el lagarto, "the lizard"
hurricane|Taíno|tnq;crb|3|From a Caribbean word, via Spanish
barbecue|Taíno|tnq|3|From a word for a wooden frame, via Spanish
cookie|Dutch|nl|2|From koekje, "little cake"
yacht|Dutch|nl;dum|3|From jacht, a fast pursuit ship
boss|Dutch|nl|3|From baas, "master"
sauna|Finnish|fi|1|A Finnish steam bath
ski|Norwegian|no;nb|1|From an Old Norse word for a split piece of wood
slalom|Norwegian|no;nb|2|"Sloping track"
berserk|Old Norse|non|3|Probably "bear shirt", for fierce warriors
window|Old Norse|non|2|"Wind eye"
kangaroo|Guugu Yimithirr|kky|2|From an Aboriginal Australian language in Queensland
boomerang|Dharug|xdk|3|Probably from an Aboriginal language of the Sydney area
koala|Dharug|xdk|3|From an Aboriginal language of the Sydney area
yoga|Sanskrit|sa|1|"Union" or "yoking"
guru|Sanskrit|sa|2|"Venerable" or "heavy"
avatar|Sanskrit|sa|3|"Descent", of a god to Earth
thug|Hindi|hi|3|From ṭhag, "thief" or "swindler"
loot|Hindi|hi|3|From lūṭ, "plunder"
mammoth|Russian|ru|3|From an old Russian word for the beast
tea|Chinese|nan;zh;cmn|2|From the Min Chinese word te
`;

// Eponyms: word | named after (answer) | wrong;wrong;wrong | difficulty | keyword that must appear in the Wiktionary etymology | story (our words)
export const EPONYMS = `
sandwich|The Earl of Sandwich|The Duke of Wellington;Lord Cardigan;Queen Victoria|1|Sandwich|John Montagu, 4th Earl of Sandwich, is said to have eaten beef between bread so he could keep playing cards
cardigan|The Earl of Cardigan|The Earl of Sandwich;Adolphe Sax;Lord Byron|2|Cardigan|The 7th Earl of Cardigan, who led the Charge of the Light Brigade
boycott|Charles Boycott|Louis Braille;Rudolf Diesel;Jules Léotard|2|Boycott|An Irish land agent shunned by his community in 1880
leotard|Jules Léotard|Charles Boycott;Joseph Guillotin;Adolphe Sax|3|Léotard|A French trapeze artist of the 1800s
saxophone|Adolphe Sax|Rudolf Diesel;Anders Celsius;Jules Léotard|2|Sax|A Belgian instrument maker who patented it in 1846
braille|Louis Braille|Samuel Morse;Louis Pasteur;Charles Boycott|1|Braille|A Frenchman, blind from childhood, who invented the raised-dot alphabet
diesel|Rudolf Diesel|Adolphe Sax;James Watt;Henry Ford|2|Diesel|The German engineer who invented the engine
guillotine|Joseph-Ignace Guillotin|Louis Pasteur;Étienne de Silhouette;Charles Boycott|2|Guillotin|A French doctor who proposed a quicker, more humane method of execution
silhouette|Étienne de Silhouette|Joseph-Ignace Guillotin;Louis Braille;Jules Léotard|3|Silhouette|A penny-pinching French finance minister of 1759
teddy bear|Theodore Roosevelt|Winston Churchill;Edward VII;Teddy Sheringham|1|Roosevelt|The US president who, the story goes, refused to shoot a captive bear
wellington boot|The Duke of Wellington|The Earl of Cardigan;Napoleon;Lord Nelson|2|Wellington|The British general who defeated Napoleon at Waterloo
nicotine|Jean Nicot|Louis Pasteur;Rudolf Diesel;Anders Celsius|3|Nicot|A French diplomat who sent tobacco to Paris in 1560
watt|James Watt|Alessandro Volta;André-Marie Ampère;Isaac Newton|2|Watt|The Scottish inventor who improved the steam engine
pasteurise|Louis Pasteur|Marie Curie;Joseph Lister;Jean Nicot|2|Pasteur|The French scientist who showed heating could kill germs in drinks
volt|Alessandro Volta|James Watt;Michael Faraday;Galileo Galilei|3|Volta|The Italian physicist who built the first battery
shrapnel|Henry Shrapnel|Rudolf Diesel;Charles Boycott;Joseph Guillotin|3|Shrapnel|A British army officer who invented an exploding shell
`;

// True/false word facts (DSL from c2_lib.parseQuestions).
export const WORD_QS = `
tf|2|The word "emoji" comes from the English word "emotion".|false|It is Japanese: e ("picture") plus moji ("character"). The likeness is a coincidence.
tf|2|"Posh" stands for "Port Out, Starboard Home".|false|That is a later invented explanation; no evidence supports it.
tf|1|"Golf" stands for "Gentlemen Only, Ladies Forbidden".|false|A modern joke. The word goes back to Scots in the 1400s.
tf|2|"SOS" stands for "Save Our Souls".|false|SOS was chosen because its Morse code (three dots, three dashes, three dots) is easy to send and recognise.
tf|2|"Goodbye" is a shortened form of "God be with you".|true|The phrase was squeezed down over the 1500s and 1600s.
tf|2|"Muscle" comes from a Latin word meaning "little mouse".|true|Latin musculus: a flexing muscle was thought to look like a mouse moving under the skin.
tf|2|"Disaster" literally means "bad star".|true|From Italian disastro: an ill-starred event, from the idea that stars rule our fate.
tf|2|"Quarantine" comes from an Italian phrase for "forty days".|true|Ships arriving in Venice during plagues had to wait forty days before landing.
tf|2|"Malaria" comes from Italian words for "bad air".|true|People once blamed the disease on foul air from swamps.
tf|3|"Clue" comes from "clew", a ball of thread.|true|In the Greek myth, Theseus used a ball of thread to find his way out of the Labyrinth.
tf|2|The word "robot" was first used in a play.|true|Karel Čapek's 1920 play R.U.R. introduced it.
tf|3|John Milton coined the word "pandemonium".|true|In Paradise Lost (1667) it is the capital of Hell: "all the demons".
tf|3|"Serendipity" was coined by the writer Horace Walpole.|true|He made it up in 1754, from a fairy tale called The Three Princes of Serendip.
tf|2|Lewis Carroll coined the word "chortle".|true|It first appeared in Through the Looking-Glass (1871), blending "chuckle" and "snort".
tf|3|Thomas More coined the word "utopia".|true|His 1516 book Utopia named an ideal island; the Greek means "no place".
tf|3|"Nice" once meant "foolish" or "ignorant".|true|It comes from Latin nescius, "not knowing", and changed meaning over centuries.
tf|2|"Quiz" was invented by a Dublin theatre owner who bet he could get a nonsense word into the language overnight.|false|The story is a legend; the word was already in use before the supposed bet.
tf|1|"Hippopotamus" comes from Greek words meaning "river horse".|true|Hippos means horse and potamos means river.
tf|1|"Dinosaur" means "terrible lizard".|true|Richard Owen coined it in 1842 from Greek deinos ("terrible") and sauros ("lizard").
tf|2|"Astronaut" means "star sailor".|true|From Greek astron ("star") and nautes ("sailor").
mc|1|Which day of the week is named after the Norse god of thunder, Thor?|Thursday|Tuesday;Wednesday;Saturday|Thursday is "Thor's day".
mc|2|Which day of the week is named after the god Woden (Odin)?|Wednesday|Tuesday;Thursday;Friday|Wednesday is "Woden's day".
mc|2|Which day of the week is named after the Roman god Saturn?|Saturday|Sunday;Tuesday;Friday|Saturday is "Saturn's day".
mc|2|Which month is named after Janus, the two-faced Roman god of doorways?|January|June;July;March|Janus looks both back to the old year and forward to the new.
mc|2|Which month is named after Julius Caesar?|July|June;August;March|The Romans renamed the month Quintilis in his honour.
mc|2|Which month is named after the emperor Augustus?|August|July;April;September|The month Sextilis was renamed in his honour.
mc|3|October comes from the Latin word for which number?|Eight|Ten;Six;Twelve|October was the eighth month of the early Roman calendar, which began in March.
mc|2|The word "panic" comes from which Greek god?|Pan|Zeus;Ares;Hermes|Pan was believed to cause sudden fear in lonely places.
mc|3|The word "cereal" comes from which Roman goddess?|Ceres|Juno;Venus;Minerva|Ceres was the goddess of grain and farming.
`;

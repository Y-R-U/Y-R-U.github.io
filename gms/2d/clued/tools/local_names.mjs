// Name tables for tools/local_tags.mjs: country aliases, demonyms, famous cities/regions, ambiguous names.
// Every entry maps to an ISO3 code from data/geo/countries.json. Matching is case-sensitive (proper nouns only).

export const ALIASES = {
  USA: ['United States of America', 'United States', 'USA', 'U.S.A.', 'US', 'U.S.', 'America'],
  GBR: ['United Kingdom', 'UK', 'Great Britain', 'Britain', 'England', 'Scotland', 'Wales', 'Northern Ireland'],
  NLD: ['Netherlands', 'Holland'], CZE: ['Czech Republic', 'Czechia'], CIV: ['Ivory Coast', "Côte d'Ivoire"],
  MMR: ['Myanmar', 'Burma'], RUS: ['Russia', 'Soviet Union', 'USSR', 'Russian Federation'],
  KOR: ['South Korea'], PRK: ['North Korea'], COD: ['DR Congo', 'Democratic Republic of the Congo', 'Zaire'],
  COG: ['Republic of the Congo'], VAT: ['Vatican City', 'the Vatican'], SWZ: ['Eswatini', 'Swaziland'],
  MKD: ['North Macedonia'], TUR: ['Turkey', 'Türkiye'], CPV: ['Cape Verde', 'Cabo Verde'], TLS: ['Timor-Leste', 'East Timor'],
  LKA: ['Sri Lanka', 'Ceylon'], THA: ['Thailand', 'Siam'], DEU: ['Germany', 'West Germany', 'East Germany'],
  IRN: ['Iran', 'Persia'], ARE: ['United Arab Emirates', 'UAE'], HKG: ['Hong Kong'], TWN: ['Taiwan'],
  PSE: ['Palestine'], XKX: ['Kosovo'], NZL: ['New Zealand', 'Aotearoa'],
};

// Demonyms that reliably mean the country. Language-only words (English, Arabic, Latin…) are deliberately absent:
// "the English word for" is not a question about England.
export const DEMONYMS = {
  USA: ['American', 'Americans'], GBR: ['British', 'Scottish', 'Welsh', 'Scot', 'Scots', 'Briton', 'Britons', 'Englishman', 'Englishwoman'],
  AUS: ['Australian', 'Australians', 'Aussie'], NZL: ['New Zealander', 'New Zealanders', 'Kiwi'], CAN: ['Canadian', 'Canadians'],
  IRL: ['Irish'], FRA: ['French', 'Frenchman'], DEU: ['German', 'Germans'], ITA: ['Italian', 'Italians'], ESP: ['Spanish', 'Spaniard', 'Spaniards'],
  PRT: ['Portuguese'], NLD: ['Dutch'], BEL: ['Belgian', 'Belgians'], CHE: ['Swiss'], AUT: ['Austrian', 'Austrians'],
  SWE: ['Swedish', 'Swede', 'Swedes'], NOR: ['Norwegian', 'Norwegians'], DNK: ['Danish', 'Dane', 'Danes'], FIN: ['Finnish', 'Finn', 'Finns'],
  ISL: ['Icelandic'], POL: ['Polish', 'Pole', 'Poles'], CZE: ['Czech'], HUN: ['Hungarian'], ROU: ['Romanian'], GRC: ['Greek', 'Greeks'],
  RUS: ['Russian', 'Russians', 'Soviet'], UKR: ['Ukrainian'], TUR: ['Turkish', 'Turk', 'Turks', 'Ottoman'], EGY: ['Egyptian', 'Egyptians'],
  JPN: ['Japanese'], CHN: ['Chinese'], KOR: ['South Korean', 'Korean'], IND: ['Indian'], PAK: ['Pakistani'], BGD: ['Bangladeshi'],
  MEX: ['Mexican', 'Mexicans', 'Aztec', 'Aztecs'], BRA: ['Brazilian', 'Brazilians'], ARG: ['Argentine', 'Argentinian'], CHL: ['Chilean'],
  PER: ['Peruvian', 'Inca', 'Incas'], COL: ['Colombian'], VEN: ['Venezuelan'], CUB: ['Cuban'], JAM: ['Jamaican', 'Jamaicans'],
  ZAF: ['South African'], NGA: ['Nigerian'], KEN: ['Kenyan'], ETH: ['Ethiopian'], GHA: ['Ghanaian'], MAR: ['Moroccan'],
  ISR: ['Israeli'], IRN: ['Iranian', 'Persian'], IRQ: ['Iraqi'], SAU: ['Saudi'], THA: ['Thai'], VNM: ['Vietnamese'],
  IDN: ['Indonesian'], PHL: ['Filipino'], MYS: ['Malaysian'], SGP: ['Singaporean'], NPL: ['Nepali', 'Nepalese'], MNG: ['Mongolian', 'Mongol', 'Mongols'],
  HRV: ['Croatian'], SRB: ['Serbian'], BGR: ['Bulgarian'], SVK: ['Slovak'], SVN: ['Slovenian'], EST: ['Estonian'], LVA: ['Latvian'],
  LTU: ['Lithuanian'], URY: ['Uruguayan'], FJI: ['Fijian'], HKG: [], TWN: ['Taiwanese'], LBN: ['Lebanese'], SYR: ['Syrian'],
};
// nationality values in the packs that aren't plain demonyms
export const NATIONALITY_EXTRA = {
  'English': 'GBR', 'Venetian': 'ITA', 'Genoese': 'ITA', 'Irish-born British': 'GBR', 'Frankish': 'FRA', 'Roman': 'ITA', 'Macedonian': 'GRC',
  'Mughal': 'IND', 'Hong Kong': 'HKG', 'German-born': 'DEU', 'Scottish-born': 'GBR', 'US': 'USA', 'UK': 'GBR', 'Tibet': 'CHN',
  // lane LEADERS (leaders pack nationalities)
  'Babylonian': 'IRQ', 'Athenian': 'GRC', 'Spartan': 'GRC', 'Carthaginian': 'TUN', 'Byzantine': 'TUR', 'Malian': 'MLI', 'Wallachian': 'ROU',
  'Khmer': 'KHM', 'Prussian': 'DEU', 'Angolan': 'AGO', 'Haitian': 'HTI', 'Zulu': 'ZAF', 'Basotho': 'LSO', 'Malagasy': 'MDG', 'Hawaiian': 'USA',
  'Lakota': 'USA', 'Tanzanian': 'TZA', 'Liberian': 'LBR', 'Congolese': 'COD', 'Libyan': 'LBY',
  'Cambodian': 'KHM', 'Ugandan': 'UGA', 'North Korean': 'PRK',
};
// words.origin (a language) → the country it is tied to; Arabic, Latin, Old Norse, Inuit… stay untagged
export const LANG_ORIGIN = {
  Japanese: 'JPN', Hindi: 'IND', 'Hindi and Urdu': 'IND', Sanskrit: 'IND', Nahuatl: 'MEX', 'Guugu Yimithirr': 'AUS', Dharug: 'AUS',
  Dutch: 'NLD', Italian: 'ITA', German: 'DEU', Turkish: 'TUR', Persian: 'IRN', French: 'FRA', Spanish: 'ESP', Norwegian: 'NOR',
  Czech: 'CZE', Finnish: 'FIN', Russian: 'RUS', Chinese: 'CHN',
};

// Unambiguous famous places (cities, regions, landmarks people name in questions) → country.
export const PLACES = {
  AUS: ['Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Canberra', 'Hobart', 'Darwin, Australia', 'Gold Coast', 'Tasmania', 'Queensland', 'New South Wales',
    'Western Australia', 'South Australia', 'Northern Territory', 'Uluru', 'Ayers Rock', 'Great Barrier Reef', 'Sydney Opera House', 'Sydney Harbour Bridge', 'Bondi', 'Kakadu', 'Outback'],
  NZL: ['Auckland', 'Christchurch', 'Queenstown', 'Rotorua', 'Waitangi'],
  USA: ['New York', 'Los Angeles', 'Chicago', 'San Francisco', 'Las Vegas', 'Hollywood', 'Boston', 'Seattle', 'Miami', 'New Orleans', 'Philadelphia',
    'Texas', 'California', 'Florida', 'Alaska', 'Hawaii', 'Manhattan', 'Brooklyn', 'Grand Canyon', 'Yellowstone', 'Mount Rushmore', 'Golden Gate',
    'White House', 'Statue of Liberty', 'Pearl Harbor', 'Wall Street', 'Broadway', 'Kentucky', 'Tennessee', 'Arizona', 'Nevada',
    'Massachusetts', 'Washington, D.C.', 'Detroit', 'Nashville', 'Memphis', 'Silicon Valley', 'Route 66', 'Super Bowl', 'Alcatraz', 'NASA', 'NFL', 'NBA', 'MLB', 'NHL'],
  CAN: ['Toronto', 'Montreal', 'Vancouver', 'Ottawa', 'Quebec', 'Québec', 'Ontario', 'Alberta', 'British Columbia', 'Nova Scotia', 'Calgary', 'Winnipeg', 'Yukon'],
  GBR: ['London', 'Edinburgh', 'Glasgow', 'Cardiff', 'Belfast', 'Manchester', 'Liverpool', 'Oxford', 'Cambridge University', 'Stonehenge', 'Big Ben',
    'Buckingham Palace', 'Westminster', 'Tower of London', 'Loch Ness', 'Thames', 'Wimbledon', 'Premier League', 'Downing Street', 'Hadrian\'s Wall', 'Windsor Castle', 'Queen Victoria', 'Magna Carta'],
  IRL: ['Dublin'], FRA: ['Paris', 'Marseille', 'Lyon', 'Bordeaux', 'Normandy', 'Provence', 'Eiffel Tower', 'Louvre', 'Versailles', 'Tour de France', 'Notre-Dame'],
  DEU: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Bavaria', 'Oktoberfest', 'Bundesliga', 'Brandenburg Gate', 'Neuschwanstein'],
  ITA: ['Rome', 'Venice', 'Milan', 'Naples', 'Florence', 'Pisa', 'Sicily', 'Sardinia', 'Tuscany', 'Pompeii', 'Colosseum', 'Leaning Tower', 'Mount Vesuvius', 'Vesuvius', 'Serie A'],
  ESP: ['Madrid', 'Barcelona', 'Seville', 'Valencia, Spain', 'Ibiza', 'Majorca', 'Mallorca', 'La Liga', 'Sagrada Família', 'Alhambra'],
  PRT: ['Lisbon', 'Porto'], NLD: ['Amsterdam', 'Rotterdam', 'The Hague'], BEL: ['Brussels', 'Antwerp'], CHE: ['Zurich', 'Zürich', 'Geneva'],
  AUT: ['Vienna', 'Salzburg'], CZE: ['Prague'], HUN: ['Budapest'], POL: ['Warsaw', 'Kraków', 'Krakow'], GRC: ['Athens', 'Acropolis', 'Parthenon', 'Mount Olympus', 'Crete', 'Sparta'],
  SWE: ['Stockholm'], NOR: ['Oslo'], DNK: ['Copenhagen'], FIN: ['Helsinki'], ISL: ['Reykjavik', 'Reykjavík'], RUS: ['Moscow', 'St Petersburg', 'Saint Petersburg', 'Kremlin', 'Siberia', 'Red Square'],
  TUR: ['Istanbul', 'Ankara', 'Constantinople'], EGY: ['Cairo', 'Giza', 'Nile', 'Sphinx', 'Tutankhamun', 'Cleopatra', 'pharaoh', 'Pharaoh'],
  JPN: ['Tokyo', 'Kyoto', 'Osaka', 'Hiroshima', 'Nagasaki', 'Mount Fuji', 'Hokkaido', 'Okinawa', 'samurai', 'Samurai', 'sumo', 'Sumo'],
  CHN: ['Beijing', 'Shanghai', 'Great Wall', 'Forbidden City', 'Tiananmen', 'Yangtze', 'Terracotta Army'], KOR: ['Seoul', 'Busan'],
  IND: ['Mumbai', 'New Delhi', 'Delhi', 'Kolkata', 'Calcutta', 'Bombay', 'Taj Mahal', 'Bollywood', 'Ganges'], THA: ['Bangkok', 'Phuket'], SGP: ['Singapore'],
  IDN: ['Jakarta', 'Bali'], PHL: ['Manila'], VNM: ['Hanoi', 'Ho Chi Minh City'], ARE: ['Dubai', 'Abu Dhabi', 'Burj Khalifa'], SAU: ['Riyadh', 'Mecca'],
  ISR: ['Jerusalem', 'Tel Aviv'], MEX: ['Mexico City', 'Cancún', 'Chichen Itza'], BRA: ['Rio de Janeiro', 'São Paulo', 'Brasília', 'Copacabana', 'Christ the Redeemer'],
  ARG: ['Buenos Aires', 'Patagonia'], PER: ['Lima', 'Machu Picchu', 'Cusco'], CUB: ['Havana'], KEN: ['Nairobi'], NGA: ['Lagos'], ZAF: ['Cape Town', 'Johannesburg', 'Table Mountain'],
  MAR: ['Marrakesh', 'Casablanca'], JOR: ['Petra'], KHM: ['Angkor Wat'], NPL: ['Kathmandu'], TZA: ['Kilimanjaro', 'Serengeti', 'Zanzibar'],
};

// Words that are also everyday words, first names, US states or animals: they only count with country context
// ("Turkey" the bird, "Georgia" the US state, "Michael Jordan", "Chad", "China" the porcelain…).
export const AMBIG = new Set(['Turkey', 'Georgia', 'Jordan', 'Chad', 'Guinea', 'Niger', 'Jersey', 'Israel', 'Holland', 'Mali',
  'Cuba', 'Kenya', 'Peru', 'Chile', 'Lebanon', 'Monaco', 'Dominica', 'Togo', 'Malta', 'America', 'Paris', 'Lima', 'Nile', 'Sparta',
  'Indian', 'Korean', 'Persian', 'Kiwi', 'Inca', 'Incas', 'Aztec', 'Aztecs', 'Mongol', 'Mongols', 'Ottoman', 'Scot', 'Scots', 'Pole', 'Poles', 'Finn', 'Finns',
  'Turk', 'Turks', 'Dane', 'Danes', 'Swede', 'Swedes', 'Outback', 'Broadway', 'Thames', 'Quebec', 'Pharaoh', 'pharaoh', 'Cleopatra', 'Soviet',
  'Greek', 'Greeks', 'Roman', 'Super Bowl', 'NASA']);
// Context that makes an ambiguous name a country (or a place in it).
export const CONTEXT = /\b(country|countries|nation|national|capital|flag|border|borders|republic|kingdom|president|prime minister|currency|independence|population|continent|official language|anthem|empire|king|queen|city|cities|island|sea|coast|river|desert|located|ancient|team|world cup|olympic|olympics|cricket|rugby|football|soccer|cuisine|dish|food|born|invented|built|war|revolution|explorer|pyramid|mountain)\b/i;
// Phrases that look like a match but aren't about the country (longest phrases are tested first).
export const STOP_PHRASES = [
  'Indian Ocean', 'American Indian', 'Native American', 'Native Americans', 'South American', 'North American', 'Latin American', 'Central American', 'Latin America',
  'South America', 'North America', 'Central America', 'the Americas', 'Irish Sea', 'Arabian Sea', 'English Channel', 'French fries', 'French fry', 'French horn', 'French kiss',
  'French toast', 'Swiss roll', 'Swiss cheese', 'Danish pastry', 'Brazil nut', 'Brussels sprout', 'Brussels sprouts', 'Chinese whispers', 'Chinese checkers', 'Turkish delight',
  'Guinea pig', 'guinea pig', 'New Guinea', 'Papua New Guinea', 'Equatorial Guinea', 'Guinea-Bissau', 'New Jersey', 'New Mexico', 'New England', 'New South Wales',
  'Dominican Republic', 'South Sudan', 'Niger River', 'Mexican wave', 'Russian roulette', 'Russian doll', 'Russian dolls', 'Dutch oven', 'Dutch courage', 'German shepherd',
  'German measles', 'Great Dane', 'Spanish flu', 'Spanish-speaking', 'French-speaking', 'Portuguese-speaking', 'Persian cat', 'Turkish Angora', 'Turkish Van', 'Egyptian Mau',
  'Siamese cat', 'Siamese', 'Scottish Fold', 'Scottish terrier', 'Irish setter', 'Irish wolfhound', 'Irish terrier', 'Australian shepherd', 'Australian Shepherd',
  'Belgian Malinois', 'Japanese Chin', 'Japanese Bobtail', 'Chinese Crested', 'American Shorthair', 'American Curl', 'British Shorthair', 'Russian Blue',
  'Canadian Sphynx', 'Indian elephant', 'Indian rhinoceros', 'African elephant', 'Indian cobra', 'Mexican hat', 'Greek alphabet', 'Roman numeral', 'Roman numerals',
  'Holy Roman', 'Jordan River', 'River Jordan', 'Jersey cow', 'Panama hat', 'Peru balsam', 'Kentucky Derby', 'Chicago Bulls', 'Gulf of Mexico',
  'Victoria Falls', 'Lake Victoria', 'Victoria Cross', 'Victorian', 'Hundred Years',
  'American football', 'Amazon', 'Paris Hilton', 'Paris of Troy', 'Middle East', 'Monaco Grand Prix', 'Chile pepper', 'Chile con carne', 'Cuba Gooding',
];
// Prompt words that make a demonym about a language, not a nation: "the French word for", "in Spanish".
export const LANG_USE = /^\s*(word|words|phrase|term|name for|for ['"‘“]|language|translation|spelling|alphabet|letters?|script|-speaking|speakers?)\b/i;
export const LANG_BEFORE = /\b(in|into|from|speak|speaks|spoken|speaking)\s+$/i;
// "English" is a language word, except before these nouns ("Which English king…", "an English port").
export const ENGLISH_NOUN = /^\s+(king|kings|queen|queens|monarch|monarchs|club|clubs|port|school|team|county|counties|city|town|village|poet|writer|author|playwright|novelist|scientist|footballer|cricketer|explorer|navy|army|civil war|crown|throne|countryside|coast|league|football|cricket|rugby)\b/i;

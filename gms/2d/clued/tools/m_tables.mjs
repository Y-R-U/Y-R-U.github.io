// Hand-checked lookup tables for the geo pipeline.

export const UN_MEMBERS = `AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA BRA BRN BGR BFA BDI
CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD CRI CIV HRV CUB CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH
FJI FIN FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ IRL ISR ITA JAM JPN JOR KAZ KEN
KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR
MOZ MMR NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT QAT ROU RUS RWA KNA LCA VCT WSM
SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF SSD ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO TUN TUR
TKM TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE`.split(/\s+/);

// Playable alongside UN members by default: UN observers plus widely-quizzed partially recognised states.
export const EXTRA_STATES = ['VAT', 'PSE', 'XKX', 'TWN', 'ESH'];

// Renamed ids (Natural Earth ADM0_A3 -> our id). Kosovo has no ISO code; XKX is the common user-assigned one.
export const ID_FIX = { KOS: 'XKX', IOA: 'IOA', SAH: 'ESH', PSX: 'PSE', SDS: 'SSD' };
// Pieces dissolved into another country's shape so a tap there counts as that country.
export const MERGE_INTO = { SOL: 'SOM', CYN: 'CYP', CNM: 'CYP', ESB: 'CYP', WSB: 'CYP', USG: 'CUB', BRI: 'BRA', KAB: 'KAZ', ALD: 'FIN' };
export const DROP_A3 = ['PGA', 'SCR', 'BJN', 'SER', 'CLP', 'CSI', 'ATC'];
// Drawn as land but never a target (disputed or unclaimed).
export const NONPLAY_A3 = ['KAS', 'SPI', 'BRT'];

export const NAME_FIX = {
  CHN: 'China', USA: 'United States', BHS: 'Bahamas', GMB: 'Gambia', CZE: 'Czechia', TLS: 'Timor-Leste',
  COD: 'DR Congo', COG: 'Republic of the Congo', CIV: 'Ivory Coast', FSM: 'Micronesia', MAC: 'Macau',
  KAS: 'Siachen Glacier (disputed)', SPI: 'Southern Patagonian Ice Field (disputed)', BRT: 'Bir Tawil (unclaimed)',
  IOA: 'Christmas Island and Cocos Islands', VAT: 'Vatican City', XKX: 'Kosovo', SGS: 'South Georgia',
  UMI: 'US Minor Outlying Islands', VIR: 'US Virgin Islands', ATF: 'French Southern Lands', HMD: 'Heard and McDonald Islands',
};
export const ALT_NAMES = {
  USA: ['USA', 'United States of America', 'America', 'US'], GBR: ['UK', 'Britain', 'Great Britain'], CZE: ['Czech Republic'],
  TLS: ['East Timor'], CIV: ["Côte d'Ivoire"], COD: ['Democratic Republic of the Congo', 'Congo-Kinshasa'],
  COG: ['Congo', 'Congo-Brazzaville'], SWZ: ['Swaziland'], MMR: ['Burma'], MKD: ['Macedonia'], CPV: ['Cabo Verde'],
  KOR: ['Korea'], PRK: ['DPRK'], NLD: ['Holland'], TUR: ['Türkiye'], VAT: ['Vatican', 'Holy See'], BHS: ['The Bahamas'],
  GMB: ['The Gambia'], ARE: ['UAE'], CAF: ['CAR'],
};

export const CONTINENT_FIX = { MDV: 'AS', MUS: 'AF', SYC: 'AF', IOT: 'AS', SHN: 'AF', ATF: 'AN', HMD: 'AN', SGS: 'AN' };
// Transcontinental or commonly disputed placements: any listed answer is accepted, and the kids continent quiz skips them.
export const MULTI_CONTINENT = {
  RUS: ['EU', 'AS'], TUR: ['AS', 'EU'], KAZ: ['AS', 'EU'], GEO: ['AS', 'EU'], ARM: ['AS', 'EU'], AZE: ['AS', 'EU'],
  CYP: ['AS', 'EU'], EGY: ['AF', 'AS'],
};

const FR = {
  'Hauts-de-France': ['FR-HDF', 'Hauts-de-France'], 'Grand Est': ['FR-GES', 'Grand Est'],
  "Provence-Alpes-Côte-d'Azur": ['FR-PAC', "Provence-Alpes-Côte d'Azur"], 'Auvergne-Rhône-Alpes': ['FR-ARA', 'Auvergne-Rhône-Alpes'],
  'Nouvelle-Aquitaine': ['FR-NAQ', 'Nouvelle-Aquitaine'], Occitanie: ['FR-OCC', 'Occitanie'],
  'Bourgogne-Franche-Comté': ['FR-BFC', 'Bourgogne-Franche-Comté'], 'Pays de la Loire': ['FR-PDL', 'Pays de la Loire'],
  Bretagne: ['FR-BRE', 'Brittany'], Normandie: ['FR-NOR', 'Normandy'], Corse: ['FR-COR', 'Corsica'],
  'Centre-Val de Loire': ['FR-CVL', 'Centre-Val de Loire'], 'Île-de-France': ['FR-IDF', 'Île-de-France'],
};
const ES = {
  'Andalucía': ['ES-AN', 'Andalusia'], 'Aragón': ['ES-AR', 'Aragon'], Asturias: ['ES-AS', 'Asturias'],
  'Islas Baleares': ['ES-IB', 'Balearic Islands'], 'País Vasco': ['ES-PV', 'Basque Country'], 'Canary Is.': ['ES-CN', 'Canary Islands'],
  Cantabria: ['ES-CB', 'Cantabria'], 'Castilla y León': ['ES-CL', 'Castile and León'], 'Castilla-La Mancha': ['ES-CM', 'Castilla–La Mancha'],
  'Cataluña': ['ES-CT', 'Catalonia'], Ceuta: ['ES-CE', 'Ceuta'], Extremadura: ['ES-EX', 'Extremadura'], Galicia: ['ES-GA', 'Galicia'],
  'La Rioja': ['ES-RI', 'La Rioja'], Madrid: ['ES-MD', 'Madrid'], Melilla: ['ES-ML', 'Melilla'], Murcia: ['ES-MC', 'Murcia'],
  'Foral de Navarra': ['ES-NC', 'Navarre'], Valenciana: ['ES-VC', 'Valencia'],
};
const IT = {
  Piemonte: ['IT-21', 'Piedmont'], "Valle d'Aosta": ['IT-23', 'Aosta Valley'], Lombardia: ['IT-25', 'Lombardy'],
  'Trentino-Alto Adige': ['IT-32', 'Trentino-Alto Adige'], Veneto: ['IT-34', 'Veneto'], 'Friuli-Venezia Giulia': ['IT-36', 'Friuli-Venezia Giulia'],
  Liguria: ['IT-42', 'Liguria'], 'Emilia-Romagna': ['IT-45', 'Emilia-Romagna'], Toscana: ['IT-52', 'Tuscany'], Umbria: ['IT-55', 'Umbria'],
  Marche: ['IT-57', 'Marche'], Lazio: ['IT-62', 'Lazio'], Abruzzo: ['IT-65', 'Abruzzo'], Molise: ['IT-67', 'Molise'],
  Campania: ['IT-72', 'Campania'], Apulia: ['IT-75', 'Apulia'], Basilicata: ['IT-77', 'Basilicata'], Calabria: ['IT-78', 'Calabria'],
  Sicily: ['IT-82', 'Sicily'], Sardegna: ['IT-88', 'Sardinia'],
};
const GB = { England: ['GB-ENG', 'England'], Scotland: ['GB-SCT', 'Scotland'], Wales: ['GB-WLS', 'Wales'], 'Northern Ireland': ['GB-NIR', 'Northern Ireland'] };

export const STATE_RULES = {
  FRA: { groupBy: 'region', groups: FR },
  ESP: { groupBy: 'region', groups: ES },
  ITA: { groupBy: 'region', groups: IT },
  GBR: { groupBy: 'geonunit', groups: GB },
  USA: { rename: { 'US-DC': 'District of Columbia' } },
  ARG: { rename: { 'AR-C': 'Buenos Aires City' } },
  MEX: { rename: { 'MX-CMX': 'Mexico City', 'MX-DIF': 'Mexico City', 'MX-MEX': 'State of Mexico' } },
  CHN: { drop: ['Paracel Islands'], rename: { 'CN-54': 'Tibet', 'CN-XZ': 'Tibet', 'CN-15': 'Inner Mongolia', 'CN-NM': 'Inner Mongolia' } },
  AUS: { drop: ['Jervis Bay Territory'], mergeInto: { 'Lord Howe Island': 'AU-NSW', 'Macquarie Island': 'AU-TAS' } },
  NLD: { drop: ['Bonaire', 'St. Eustatius', 'Saba'] },
  JPN: { strip: / Prefecture$/ },
  SAU: { rename: { 'SA-04': 'Eastern Province', 'SA-14': 'Asir', 'SA-03': 'Medina', 'SA-02': 'Mecca', 'SA-12': 'Al Jawf', 'SA-05': 'Al-Qassim' } },
};

export const MARINE_PARENT = {
  'Adriatic Sea': 'mediterranean-sea', 'Aegean Sea': 'mediterranean-sea', 'Ionian Sea': 'mediterranean-sea',
  'Tyrrhenian Sea': 'mediterranean-sea', 'Ligurian Sea': 'mediterranean-sea', 'Balearic Sea': 'mediterranean-sea',
  'Alboran Sea': 'mediterranean-sea', 'Sea of Crete': 'mediterranean-sea', 'Gulf of Bothnia': 'baltic-sea',
  'Gulf of Finland': 'baltic-sea', 'Gulf of Riga': 'baltic-sea', 'Sargasso Sea': 'atlantic-ocean',
};

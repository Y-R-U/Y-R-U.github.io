// Long-course (50 m pool) swimming world records, World Aquatics. Only records that still stood when checked in October 2026.
const S = 'List_of_world_records_in_swimming';
const sw = (sex, ev, h, c, y, v, wv, w, place, d = 3, extra = {}) => {
  const who = sex === 'm' ? "men's" : "women's";
  return {
    g: 'swim', s: sex === 'm' ? "Men's swimming" : "Women's swimming", t: `${sex === 'm' ? "Men's" : "Women's"} ${ev} (swimming)`, asOf: 2025, src: S,
    h, c, y, v, u: 's', wv, w, d,
    q: `As of 2025, who held the ${who} long-course ${ev} world record?`,
    vq: `As of 2025, what was the ${who} long-course ${ev} world record?`,
    ...(v < 60 ? { tol: 0.3 } : {}),
    b: `${h} set the ${who} ${ev} world record (50 m pool) in ${place} in ${y}. It still stood as of 2025.`,
    ...extra,
  };
};
export default [
  sw('m', '100 m freestyle', 'Pan Zhanle', 'CHN', 2024, 46.40, [46.80, 46.86, 46.91], ['Caeleb Dressel', 'David Popovici', 'Kyle Chalmers'], 'Paris', 3),
  sw('m', '200 m freestyle', 'Paul Biedermann', 'DEU', 2009, 102.00, [102.96, 102.97, 103.14], ['Michael Phelps', 'David Popovici', 'Ian Thorpe'], 'Rome', 3),
  sw('m', '800 m freestyle', 'Zhang Lin', 'CHN', 2009, 452.12, [454.32, 456.89, 458.16], ['Sun Yang', 'Grant Hackett', 'Bobby Finke'], 'Rome', 3),
  sw('m', '100 m backstroke', 'Thomas Ceccon', 'ITA', 2022, 51.60, [51.85, 51.94, 52.12], ['Ryan Murphy', 'Aaron Peirsol', 'Xu Jiayu'], 'Budapest', 3),
  sw('m', '200 m backstroke', 'Aaron Peirsol', 'USA', 2009, 111.92, [112.53, 113.27, 113.73], ['Ryan Lochte', 'Ryan Murphy', 'Evgeny Rylov'], 'Rome', 3),
  sw('m', '100 m breaststroke', 'Adam Peaty', 'GBR', 2019, 56.88, [57.13, 57.37, 57.46], ['Arno Kamminga', 'Nicolò Martinenghi', 'Kosuke Kitajima'], 'Gwangju', 2),
  sw('m', '100 m butterfly', 'Caeleb Dressel', 'USA', 2021, 49.45, [49.50, 49.82, 49.68], ['Michael Phelps', 'Kristóf Milák', 'Joseph Schooling'], 'Tokyo', 2),
  sw('m', '200 m butterfly', 'Kristóf Milák', 'HUN', 2022, 110.34, [111.51, 110.73, 112.06], ['Michael Phelps', 'Léon Marchand', 'Chad le Clos'], 'Budapest', 3),
  sw('m', '400 m individual medley', 'Léon Marchand', 'FRA', 2023, 242.50, [243.84, 245.46, 244.01], ['Michael Phelps', 'Ryan Lochte', 'Daiya Seto'], 'Fukuoka', 3),
  sw('w', '200 m freestyle', 'Ariarne Titmus', 'AUS', 2024, 112.23, [112.85, 112.98, 113.35], ['Federica Pellegrini', 'Mollie O\'Callaghan', 'Summer McIntosh'], 'Brisbane', 3),
  sw('w', '800 m freestyle', 'Katie Ledecky', 'USA', 2025, 484.12, [484.79, 487.39, 488.94], ['Ariarne Titmus', 'Rebecca Adlington', 'Summer McIntosh'], 'Fort Lauderdale', 2),
  sw('w', '1,500 m freestyle', 'Katie Ledecky', 'USA', 2018, 920.48, [925.38, 928.36, 932.03], ['Lotte Friis', 'Simona Quadarella', 'Ariarne Titmus'], 'Indianapolis', 2),
  sw('w', '200 m backstroke', 'Kaylee McKeown', 'AUS', 2023, 123.14, [123.35, 124.06, 124.94], ['Regan Smith', 'Missy Franklin', 'Kirsty Coventry'], 'Sydney', 3),
  sw('w', '100 m breaststroke', 'Lilly King', 'USA', 2017, 64.13, [64.35, 64.82, 64.98], ['Rūta Meilutytė', 'Tatjana Schoenmaker', 'Leisel Jones'], 'Budapest', 3),
  sw('w', '50 m butterfly', 'Sarah Sjöström', 'SWE', 2014, 24.43, [24.64, 24.84, 25.07], ['Gretchen Walsh', 'Emma McKeon', 'Therese Alshammar'], 'Borås', 3),
  sw('w', '400 m individual medley', 'Summer McIntosh', 'CAN', 2025, 263.65, [264.08, 266.40, 266.95], ['Katinka Hosszú', 'Ye Shiwen', 'Kaylee McKeown'], 'Victoria (Canada)', 3),
  {
    g: 'swim', s: "Men's swimming", t: "Men's 4 × 100 m freestyle relay (swimming)", asOf: 2025, src: S, h: 'United States', c: 'USA', y: 2008, v: 188.24, u: 's', d: 3,
    wv: [188.32, 189.97, 189.03], w: ['Australia', 'France', 'Italy'],
    q: "As of 2025, which country held the men's 4 × 100 m freestyle swimming relay world record?", vq: "As of 2025, what was the men's 4 × 100 m freestyle swimming relay world record?",
    b: "The United States (Michael Phelps, Garrett Weber-Gale, Cullen Jones and Jason Lezak) swam 3:08.24 at the 2008 Beijing Olympics, with Lezak's famous anchor leg catching France. It still stood as of 2025.",
  },
];

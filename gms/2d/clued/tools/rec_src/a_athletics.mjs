// Athletics world records (outdoor, ratified by World Athletics). All stamped "as of 2025".
const S = 'List_of_world_records_in_athletics';
const A = (o) => ({ g: 'ath', asOf: 2025, src: S, ...o });
const M = "men's", W = "women's";
const sprint = (sex, ev, h, c, y, v, wv, w, place, d = 2, extra = {}) => A({
  s: 'Sprints & hurdles', t: `${sex === M ? "Men's" : "Women's"} ${ev}`, h, c, y, v, u: 's', wv, w, d,
  q: `As of 2025, who held the ${sex} ${ev} world record?`,
  vq: `As of 2025, what was the ${sex} ${ev} world record?`,
  ...(v < 60 ? { tol: v < 15 ? 0.1 : 0.3 } : {}),
  b: `${h} set the ${sex} ${ev} world record of ${v < 60 ? v + ' s' : null} in ${place} in ${y}. It still stood as of 2025.`,
  ...extra,
});
const fix = r => ({ ...r, b: r.b.replace('null', r.vt || '') });

export default [
  sprint(M, '100 m', 'Usain Bolt', 'JAM', 2009, 9.58, [9.63, 9.69, 9.74], ['Tyson Gay', 'Yohan Blake', 'Asafa Powell'], 'Berlin', 1, { kids: true,
    more: [{ kind: 'pickall', p: "As of 2025, which {n} of these men's world records did Usain Bolt hold or share?", a: ["Men's 100 m", "Men's 200 m", "Men's 4 × 100 m relay"], w: ["Men's 400 m", "Men's 800 m", "Men's long jump", "Men's 4 × 400 m relay"], d: 3 }] }),
  sprint(M, '200 m', 'Usain Bolt', 'JAM', 2009, 19.19, [19.26, 19.30, 19.32], ['Michael Johnson', 'Yohan Blake', 'Noah Lyles'], 'Berlin'),
  sprint(M, '400 m', 'Wayde van Niekerk', 'ZAF', 2016, 43.03, [43.18, 43.29, 43.45], ['Michael Johnson', 'Butch Reynolds', 'Kirani James'], 'Rio de Janeiro'),
  sprint(W, '100 m', 'Florence Griffith-Joyner', 'USA', 1988, 10.49, [10.54, 10.61, 10.65], ['Shelly-Ann Fraser-Pryce', 'Elaine Thompson-Herah', 'Marion Jones'], 'Indianapolis', 2, { alt: ['Florence Griffith Joyner', 'Flo-Jo'] }),
  sprint(W, '200 m', 'Florence Griffith-Joyner', 'USA', 1988, 21.34, [21.53, 21.62, 21.71], ['Elaine Thompson-Herah', 'Marion Jones', 'Merlene Ottey'], 'Seoul', 2, { alt: ['Florence Griffith Joyner'] }),
  sprint(W, '400 m', 'Marita Koch', 'DEU', 1985, 47.60, [47.78, 47.99, 48.14], ['Jarmila Kratochvílová', 'Marie-José Pérec', 'Cathy Freeman'], 'Canberra', 3),
  sprint(W, '400 m hurdles', 'Sydney McLaughlin-Levrone', 'USA', 2024, 50.37, [50.65, 50.68, 51.41], ['Dalilah Muhammad', 'Femke Bol', 'Yuliya Pechonkina'], 'Paris'),

  ...[
    A({ s: 'Middle & long distance', t: "Men's 800 m", h: 'David Rudisha', c: 'KEN', y: 2012, v: 100.91, u: 's', wv: [101.01, 101.11, 101.73], w: ['Wilson Kipketer', 'Sebastian Coe', 'Emmanuel Wanyonyi'], d: 2,
      q: "As of 2025, who held the men's 800 m world record?", vq: "As of 2025, what was the men's 800 m world record?", b: "David Rudisha of Kenya ran 1:40.91 to win the 800 m final at the London 2012 Olympics, a world record that still stood as of 2025." }),
    A({ s: 'Middle & long distance', t: "Men's 1,500 m", h: 'Hicham El Guerrouj', c: 'MAR', y: 1998, v: 206.00, vt: '3:26.00', u: 's', wv: ['3:27.37', '3:28.81', '3:29.46'], w: ['Noureddine Morceli', 'Jakob Ingebrigtsen', 'Bernard Lagat'], d: 2,
      q: "As of 2025, who held the men's 1,500 m world record?", vq: "As of 2025, what was the men's 1,500 m world record?", b: "Hicham El Guerrouj of Morocco ran 3:26.00 in Rome in 1998. It still stood as of 2025." }),
    A({ s: 'Middle & long distance', t: "Men's 5,000 m", h: 'Joshua Cheptegei', c: 'UGA', y: 2020, v: 755.36, u: 's', wv: [757.35, 759.36, 764.39], w: ['Kenenisa Bekele', 'Haile Gebrselassie', 'Mo Farah'], d: 3,
      q: "As of 2025, who held the men's 5,000 m world record?", vq: "As of 2025, what was the men's 5,000 m world record?", b: "Joshua Cheptegei of Uganda ran 12:35.36 in Monaco in 2020, breaking Kenenisa Bekele's 16-year-old record. It still stood as of 2025." }),
    A({ s: 'Middle & long distance', t: "Men's 10,000 m", h: 'Joshua Cheptegei', c: 'UGA', y: 2020, v: 1571.00, vt: '26:11.00', u: 's', wv: ['26:17.53', '26:22.75', '26:27.85'], w: ['Kenenisa Bekele', 'Haile Gebrselassie', 'Mo Farah'], d: 3,
      q: "As of 2025, who held the men's 10,000 m world record?", vq: "As of 2025, what was the men's 10,000 m world record?", b: "Joshua Cheptegei ran 26:11.00 in Valencia in 2020. It was still the world record as of 2025." }),
    A({ s: 'Middle & long distance', t: "Men's 3,000 m steeplechase", h: 'Lamecha Girma', c: 'ETH', y: 2023, v: 472.11, u: 's', wv: [473.63, 475.28, 478.28], w: ['Saif Saaeed Shaheen', 'Soufiane El Bakkali', 'Moses Kiptanui'], d: 3,
      q: "As of 2025, who held the men's 3,000 m steeplechase world record?", vq: "As of 2025, what was the men's 3,000 m steeplechase world record?", b: "Lamecha Girma of Ethiopia ran 7:52.11 in Paris in 2023, breaking a record that had stood since 2004. It still stood as of 2025." }),
    A({ s: 'Middle & long distance', t: "Women's 800 m", h: 'Jarmila Kratochvílová', c: 'CZE', y: 1983, v: 113.28, u: 's', wv: [114.01, 114.44, 115.05], w: ['Pamela Jelimo', 'Caster Semenya', 'Keely Hodgkinson'], d: 3,
      q: "As of 2025, who held the women's 800 m world record?", vq: "As of 2025, what was the women's 800 m world record?", b: "Jarmila Kratochvílová of Czechoslovakia ran 1:53.28 in Munich in 1983. It was still the world record as of 2025, more than 40 years later." }),
    A({ s: 'Middle & long distance', t: "Women's 10,000 m", h: 'Beatrice Chebet', c: 'KEN', y: 2024, v: 1734.14, u: 's', wv: [1746.63, 1757.0, 1765.25], w: ['Letesenbet Gidey', 'Sifan Hassan', 'Almaz Ayana'], d: 3,
      q: "As of 2025, who held the women's 10,000 m world record?", vq: "As of 2025, what was the women's 10,000 m world record?", b: "Beatrice Chebet of Kenya became the first woman under 29 minutes, running 28:54.14 in Eugene in 2024. It still stood as of 2025." }),
    A({ s: 'Middle & long distance', t: "Women's 3,000 m steeplechase", h: 'Beatrice Chepkoech', c: 'KEN', y: 2018, v: 524.32, u: 's', wv: [532.52, 535.33, 538.58], w: ['Winfred Yavi', 'Ruth Jebet', 'Norah Jeruto'], d: 3,
      q: "As of 2025, who held the women's 3,000 m steeplechase world record?", vq: "As of 2025, what was the women's 3,000 m steeplechase world record?", b: "Beatrice Chepkoech of Kenya ran 8:44.32 in Monaco in 2018, about eight seconds inside the old record. It still stood as of 2025." }),
  ].map(fix),

  ...[
    ['Jumps', "Men's high jump", 'Javier Sotomayor', 'CUB', 1993, 2.45, [2.40, 2.42, 2.43], ['Mutaz Essa Barshim', 'Patrik Sjöberg', 'Bohdan Bondarenko'], 'Salamanca', 2, 0.03],
    ['Jumps', "Men's long jump", 'Mike Powell', 'USA', 1991, 8.95, [8.87, 8.90, 8.86], ['Bob Beamon', 'Carl Lewis', 'Robert Emmiyan'], 'Tokyo', 2, 0.1],
    ['Jumps', "Men's triple jump", 'Jonathan Edwards', 'GBR', 1995, 18.29, [18.08, 18.14, 18.21], ['Christian Taylor', 'Kenny Harrison', 'Willie Banks'], 'Gothenburg', 3, 0.2],
    ['Jumps', "Women's high jump", 'Yaroslava Mahuchikh', 'UKR', 2024, 2.10, [2.06, 2.08, 2.09], ['Stefka Kostadinova', 'Blanka Vlašić', 'Nicola Olyslagers'], 'Paris', 3, 0.03],
    ['Jumps', "Women's pole vault", 'Yelena Isinbayeva', 'RUS', 2009, 5.06, [4.91, 5.01, 5.03], ['Jennifer Suhr', 'Katie Moon', 'Stacy Dragila'], 'Zürich', 2, 0.1],
    ['Jumps', "Women's long jump", 'Galina Chistyakova', 'RUS', 1988, 7.52, [7.45, 7.49, 7.40], ['Jackie Joyner-Kersee', 'Heike Drechsler', 'Malaika Mihambo'], 'Leningrad', 3, 0.1],
    ['Throws', "Men's shot put", 'Ryan Crouser', 'USA', 2023, 23.56, [23.12, 23.37, 22.91], ['Randy Barnes', 'Joe Kovacs', 'Tomas Walsh'], 'Los Angeles', 3, 0.3],
    ['Throws', "Men's hammer throw", 'Yuriy Sedykh', 'RUS', 1986, 86.74, [84.80, 85.20, 86.04], ['Sergey Litvinov', 'Paweł Fajdek', 'Ivan Tsikhan'], 'Stuttgart', 3, 1],
    ['Throws', "Men's javelin throw", 'Jan Železný', 'CZE', 1996, 98.48, [92.97, 95.66, 97.76], ['Neeraj Chopra', 'Johannes Vetter', 'Steve Backley'], 'Jena', 2, 1],
    ['Throws', "Women's shot put", 'Natalya Lisovskaya', 'RUS', 1987, 22.63, [21.69, 22.06, 22.45], ['Ilona Slupianek', 'Valerie Adams', 'Astrid Kumbernuss'], 'Moscow', 3, 0.3],
    ['Throws', "Women's discus throw", 'Gabriele Reinsch', 'DEU', 1988, 76.80, [71.80, 73.36, 74.56], ['Sandra Perković', 'Valarie Allman', 'Ilke Wyludda'], 'Neubrandenburg', 3, 1],
    ['Throws', "Women's hammer throw", 'Anita Włodarczyk', 'POL', 2016, 82.98, [78.48, 80.31, 81.08], ['DeAnna Price', 'Camryn Rogers', 'Betty Heidler'], 'Warsaw', 3, 1],
    ['Throws', "Women's javelin throw", 'Barbora Špotáková', 'CZE', 2008, 72.28, [70.20, 71.70, 71.40], ['Osleidys Menéndez', 'Christina Obergföll', 'Haruka Kitaguchi'], 'Stuttgart', 3, 1],
  ].map(([s, t, h, c, y, v, wv, w, place, d, tol]) => {
    const ev = t.replace(/^(Men|Women)'s /, '');
    const sex = t.startsWith('Men') ? M : W;
    return A({ s, t, h, c, y, v, u: 'm', wv, w, d, tol, q: `As of 2025, who held the ${sex} ${ev} world record?`, vq: `As of 2025, what was the ${sex} ${ev} world record?`,
      b: `${h} set the ${sex} ${ev} world record of ${v.toFixed(2)} m in ${place} in ${y}. It still stood as of 2025.` });
  }),

  A({ s: 'Combined events & relays', t: "Men's decathlon", h: 'Kevin Mayer', c: 'FRA', y: 2018, v: 9126, u: 'points', wv: [9018, 9026, 9045], w: ['Ashton Eaton', 'Roman Šebrle', 'Daley Thompson'], d: 3, tol: 60,
    q: "As of 2025, who held the decathlon world record?", vq: "As of 2025, what was the decathlon world record, in points?", nq: "As of 2025, how many points was the decathlon world record?",
    b: "Kevin Mayer of France scored 9,126 points in Talence in 2018, the first decathlon score over 9,100. It still stood as of 2025." }),
  A({ s: 'Combined events & relays', t: "Women's heptathlon", h: 'Jackie Joyner-Kersee', c: 'USA', y: 1988, v: 7291, u: 'points', wv: [7032, 7128, 7215], w: ['Jessica Ennis-Hill', 'Nafissatou Thiam', 'Carolina Klüft'], d: 3, tol: 60,
    q: "As of 2025, who held the heptathlon world record?", vq: "As of 2025, what was the heptathlon world record, in points?", nq: "As of 2025, how many points was the heptathlon world record?",
    b: "Jackie Joyner-Kersee of the USA scored 7,291 points at the 1988 Seoul Olympics. No one had come within 250 points of it as of 2025." }),
  A({ s: 'Combined events & relays', t: "Men's 4 × 100 m relay", h: 'Jamaica', alt: ['Usain Bolt'], c: 'JAM', y: 2012, v: 36.84, u: 's', wv: [37.04, 37.10, 37.38], w: ['United States', 'Canada', 'Great Britain'], d: 3, tol: 0.2,
    q: "As of 2025, which country held the men's 4 × 100 m relay world record?", vq: "As of 2025, what was the men's 4 × 100 m relay world record?",
    b: "Jamaica (Nesta Carter, Michael Frater, Yohan Blake and Usain Bolt) ran 36.84 s at the London 2012 Olympics. It still stood as of 2025." }),
  A({ s: 'Combined events & relays', t: "Women's 4 × 100 m relay", h: 'United States', alt: ['Carmelita Jeter'], c: 'USA', y: 2012, v: 40.82, u: 's', wv: [41.02, 41.07, 41.37], w: ['Jamaica', 'East Germany', 'Great Britain'], d: 3, tol: 0.2,
    q: "As of 2025, which country held the women's 4 × 100 m relay world record?", vq: "As of 2025, what was the women's 4 × 100 m relay world record?",
    b: "The United States (Tianna Madison, Allyson Felix, Bianca Knight and Carmelita Jeter) ran 40.82 s at the London 2012 Olympics. It still stood as of 2025." }),
  A({ s: 'Combined events & relays', t: "Men's 4 × 400 m relay", h: 'United States', alt: ['Quincy Watts'], c: 'USA', y: 1993, v: 174.29, u: 's', wv: [175.39, 176.17, 175.70], w: ['Jamaica', 'Great Britain', 'Botswana'], d: 3,
    q: "As of 2025, which country held the men's 4 × 400 m relay world record?", vq: "As of 2025, what was the men's 4 × 400 m relay world record?",
    b: "The United States team (Andrew Valmon, Quincy Watts, Butch Reynolds and Michael Johnson) ran 2:54.29 in Stuttgart in 1993. It still stood as of 2025." }),
];

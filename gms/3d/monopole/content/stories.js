// Real cases. Every claim here was checked against a primary or named source in `links`.
// `image` is null on purpose — a later job generates or sources it from `imagePrompt`.
// `credit` must end as 'PD: <source>' or 'illustration'; it starts at 'illustration'.

export default Object.freeze([
  Object.freeze({
    id: 'bunnings_ryobi',
    title: 'One shelf, one brand',
    band: 'legal',
    year: '2008',
    who: 'Bunnings & Techtronic (Ryobi)',
    where: 'Australia',
    body: Object.freeze([
      'In 2008 Techtronic Industries, which makes and licenses Ryobi power tools, and Bunnings told the ACCC they had agreed that Bunnings would be the only Australian retailer selling Ryobi power tools and power garden equipment. Bunnings also agreed not to take on rival brands it considered duplicates of the Ryobi range. Competing suppliers, Bosch among them, objected.',
      'Exclusive dealing is not banned in Australia. It only breaks the law where it has the purpose, effect or likely effect of substantially lessening competition in a market, and the ACCC has to be satisfied of that before it can revoke a notification. It was not satisfied. In May 2008 it issued an assessment not opposing the arrangement, reasoning that no single power tool brand dominated, that plenty of established brands were still available to other retailers, and that Bunnings continued to stock several brands.',
      'The effect on the shelf was exactly what you would expect. Anyone who wanted Ryobi had one place to buy it, and competing hardware stores were left selling brands with less pull. None of that was unlawful. The tactic works precisely because it stops short of the line.',
    ]),
    outcome: 'Legal. The ACCC did not oppose it — exclusive dealing is only illegal where it substantially lessens competition.',
    image: null,
    imagePrompt: 'Illustration. Stylised flat vector diagram: one retail shelf bracket holding a single unbranded tool case clamped shut with a padlock, three identical unbranded cases queued outside a closed roller door. Hardware green, warm grey, two hues. No text, no logos, no storefront, no people, not a photograph.',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'ACCC: allows exclusive supply arrangement between Techtronic and Bunnings (22 May 2008)', url: 'https://www.accc.gov.au/media-release/accc-allows-exclusive-supply-arrangement-between-techtronic-bunnings' }),
      Object.freeze({ label: 'ACCC exclusive dealing notifications register — Bunnings N93331', url: 'https://www.accc.gov.au/public-registers/authorisations-and-notifications-registers/exclusive-dealing-notifications-register/bunnings-group-limited-notification-n93331' }),
    ]),
  }),

  Object.freeze({
    id: 'ford_rouge',
    title: 'Ore in one end, cars out the other',
    band: 'legal',
    year: '1917–1928',
    who: 'Ford Motor Company',
    where: 'Dearborn, Michigan',
    body: Object.freeze([
      'Through the 1920s Ford built the River Rouge plant into an ore-to-assembly works. Ford owned the iron mines in Michigan and Minnesota, coal mines in Kentucky and West Virginia, limestone quarries, forests and sawmills, ore ships on the Great Lakes and a railway, and fed all of it into one 2,000-acre site with its own blast furnace, glass works and power station. Raw material went in at one end and finished cars came out of the other.',
      'In 1927 Ford went further and bought a tract of Brazilian Amazon to grow his own rubber, because a British cartel controlled the latex price. Fordlandia never produced usable rubber at scale and the land was sold back in 1945 at a heavy loss.',
      'None of this was illegal and none of it was challenged. Owning your own supply chain is the oldest legal tactic there is: it does not remove a competitor, it removes their leverage over you. It also removes your own flexibility. The Rouge was very hard to retool, and Ford sold off most of the mines, mills and plantations over the following decades.',
    ]),
    outcome: 'Legal, and never challenged. It cut input costs and supplier leverage, and left Ford holding assets he later had to sell.',
    image: null,
    imagePrompt: 'Illustration. Stylised isometric blueprint diagram of a supply chain as one connected column: mine, ore ship, blast furnace, assembly hall, with a single arrow running top to bottom through all four. Muted ochre and slate on dark ground, technical linework. No text, no logos, no identifiable real building, no people. Note: period Rouge photography may be public domain via the US Library of Congress — if a verified PD plate is sourced, use it instead and set credit to "PD: Library of Congress, <item id>".',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'Ford River Rouge complex', url: 'https://en.wikipedia.org/wiki/Ford_River_Rouge_complex' }),
      Object.freeze({ label: 'Fordlandia', url: 'https://en.wikipedia.org/wiki/Fordlandia' }),
    ]),
  }),

  Object.freeze({
    id: 'bunnings_guarantee',
    title: 'A guarantee that cannot be claimed',
    band: 'legal',
    year: '2025',
    who: 'Bunnings',
    where: 'Australia',
    body: Object.freeze([
      "Bunnings' best-known promise is that if you find a lower price on a stocked item anywhere else, it will beat that price by ten per cent. It has anchored the company's advertising for years.",
      'In May 2025 the ABC programme Four Corners reported that the guarantee could not be triggered on more than 9,000 products, because those are house brands — Citeco, Jumbuck, Trojan and others — sold nowhere else. No competitor stocks an identical item, so there is no lower price to find. The ACCC told the programme that retailers are not required to identify house brands, though marketing one as though it came from an independent third party could be misleading conduct. Bunnings rejected the programme\'s characterisation.',
      'There is no regulator finding against the guarantee and offering one is plainly lawful. The mechanism is the point: a price guarantee costs nothing in any category where you are the only seller. Competition economists have argued since the 1980s that price-matching promises can soften competition rather than sharpen it, because a rival who cuts price wins nothing when the cut is matched automatically.',
    ]),
    outcome: 'Legal. No regulator has found against it. A guarantee cannot cost you anything on lines nobody else sells.',
    image: null,
    imagePrompt: 'Illustration. Stylised flat graphic: a swing price tag stamped with a bold percent symbol, its string tied to a long shelf that holds exactly one product; beside it an empty comparison column with a magnifying glass finding nothing. Hardware green and warm grey, two hues. No words, no logos, no storefront, no people, not a photograph.',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'Four Corners findings on the price-beating guarantee (reported, May 2025)', url: 'https://www.rnz.co.nz/news/business/560778/bunnings-boasts-about-its-price-beating-guarantee-but-for-9000-products-in-australia-there-is-a-catch' }),
      Object.freeze({ label: 'Bunnings price policy', url: 'https://www.bunnings.com.au/policies/price-policy' }),
    ]),
  }),

  Object.freeze({
    id: 'meta_instagram',
    title: 'Buy it rather than beat it',
    band: 'grey',
    year: '2012–2026',
    who: 'Facebook / Meta',
    where: 'United States',
    body: Object.freeze([
      'Facebook bought Instagram for about one billion dollars in April 2012 and WhatsApp for about nineteen billion in 2014. Both deals were cleared by regulators at the time. Internal messages released years later in litigation showed the company weighing buying a rising competitor against building a rival product, and treating acquisition as a way to neutralise a threat.',
      'In December 2020 the US Federal Trade Commission sued, arguing the purchases were part of a buy-or-bury strategy protecting a monopoly in personal social networking, and asked the court to break Instagram and WhatsApp back off. The case took five years to reach judgment.',
      'Meta won. In November 2025, after a six-week trial, Judge James Boasberg held the FTC had not proved Meta currently holds monopoly power: the market it argued — essentially Facebook, Instagram, Snapchat and MeWe — was too narrow when TikTok and YouTube compete for the same attention. The FTC said in January 2026 that it would appeal. Buying a competitor is lawful and reviewable; whether a given purchase was an antitrust violation can stay unresolved for more than a decade.',
    ]),
    outcome: 'Cleared when made, challenged eight years later, and Meta won at trial in November 2025. The FTC is appealing. Legal, but not settled.',
    image: null,
    imagePrompt: 'Illustration. Stylised flat geometric graphic: one large rounded square absorbing a smaller identical square, the smaller drawn as a dotted outline part-way inside, on a plain dark ground. Cool blue and violet, two hues. No app icons, no logos, no screenshots, no real person, no text.',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'FTC v. Meta — case overview', url: 'https://en.wikipedia.org/wiki/FTC_v._Meta' }),
      Object.freeze({ label: 'Meta wins FTC antitrust trial (CNBC, 18 Nov 2025)', url: 'https://www.cnbc.com/2025/11/18/meta-wins-ftc-antitrust-trial-that-focused-on-whatsapp-instagram.html' }),
    ]),
  }),

  Object.freeze({
    id: 'boral_predatory',
    title: 'Below cost, and still legal',
    band: 'grey',
    year: '1994–2003',
    who: 'Boral Besser Masonry & the ACCC',
    where: 'Melbourne, Australia',
    body: Object.freeze([
      'Between 1994 and 1996 Boral Besser Masonry sold concrete masonry products in Melbourne below what they cost to make, during a price war with a smaller entrant, C&M Brick. The ACCC sued under section 46 of the Trade Practices Act, the misuse-of-market-power provision.',
      'The trial judge found no breach. The Full Federal Court unanimously reversed, holding that Boral had a substantial degree of power in the Melbourne market and had taken advantage of it to deter entrants and drive competitors out. In February 2003 the High Court reversed again, six to one, in Boral\'s favour: in a market with spare capacity and easy entry the company did not have substantial market power, and without it there was no realistic prospect of raising prices later to recoup the losses. Pricing below cost was simply hard competition.',
      'That is why below-cost pricing sits in the grey band rather than the illegal one. The American test from Brooke Group in 1993 works the same way — prices below an appropriate measure of cost, plus a dangerous probability of recouping the loss — and it is the second half that usually fails. Parliament was unhappy enough with the Boral result to add a specific predatory-pricing provision in 2007, which was itself replaced by a broader effects test in the 2017 reforms.',
    ]),
    outcome: 'Boral won in the High Court in 2003. Selling below cost is rarely illegal on its own; the regulator has to show you could recoup the loss.',
    image: null,
    imagePrompt: 'Illustration. Stylised flat chart on a plain grid: two price lines, one diving below a dashed cost line and holding there, the other stopping short and ending in a small falling marker. Deep red and slate, two hues, technical linework. No text, no company names, no logos, no people.',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'ACCC: High Court decision highlights difficulties in establishing misuse of market power', url: 'https://www.accc.gov.au/media-release/high-court-decision-highlights-difficulties-in-establishing-misuse-of-market-power' }),
      Object.freeze({ label: 'Boral Besser Masonry Ltd v ACCC — case notes', url: 'https://www.australiancompetitionlaw.org/cases/boral.html' }),
    ]),
  }),

  Object.freeze({
    id: 'phoebus_cartel',
    title: 'The thousand-hour bulb',
    band: 'illegal',
    year: '1924–1939',
    who: 'Osram, Philips, Associated Electrical Industries, Compagnie des Lampes, Tungsram, General Electric',
    where: 'Geneva, Switzerland',
    body: Object.freeze([
      'On 23 December 1924 the largest lamp makers in the world met in Geneva, and on 15 January 1925 incorporated their agreement as a Swiss company: Phoebus S.A. Compagnie Industrielle pour le Developpement de l\'Eclairage. Osram of Germany, Philips of the Netherlands, Associated Electrical Industries of Britain, Compagnie des Lampes of France, Tungsram of Hungary and General Electric — through its Paris subsidiary International General Electric rather than directly, which kept the American parent at arm\'s length from US antitrust law — divided the world into territories and agreed what they would sell in each.',
      'The part everyone remembers is the specification. The cartel fixed the working life of a standard incandescent bulb at 1,000 hours, down from the 1,500 to 2,500 hours some members were already achieving. It was enforced, not merely announced: members shipped sample bulbs to a central Swiss laboratory for testing and paid fines in Swiss francs on a published schedule, scaled by how far a bulb overshot the limit. Average bulb life fell to roughly 1,000 hours within a decade.',
      'There is a genuine engineering argument on the other side. For a given wattage a shorter-lived filament runs hotter and produces more light per watt, so 1,000 hours is a defensible point on the efficiency curve, and British regulators later said as much. But the cartel\'s own correspondence was about sales volume, and a fine for building a longer-lasting product is not an engineering standard. Cartels were lawful in much of Europe at the time, which is a large part of why the agreement was written in Switzerland and why General Electric stayed one step removed; the same agreement today would be flatly illegal under EU Article 101, the Sherman Act and Part IV of Australia\'s Competition and Consumer Act. Phoebus stopped operating in 1939 as the war broke the members apart, and in 1949 a US court found General Electric had violated the Sherman Act in the lamp business, finding its main consideration in setting bulb life had been profit.',
    ]),
    outcome: 'Illegal anywhere today, and largely lawful in Europe at the time. It died with the war; a US court found against General Electric over lamps in 1949.',
    image: null,
    imagePrompt: 'Public domain material genuinely exists for this one — 1920s and 1930s incandescent lamp advertisements and period lamp-factory photography are out of copyright in most jurisdictions. Prefer a sourced PD plate (Wikimedia Commons categories for Phoebus cartel, Osram, or incandescent lamp advertising, or a national archive) and set credit to "PD: <archive>, <item>". Fallback if no verified PD plate can be sourced — illustration: a single incandescent bulb in blueprint linework with an hour dial ringing the glass, the needle stopped hard at a marked 1000, warm amber filament against deep blue-black. No logos, no real people, no fabricated photograph.',
    credit: 'illustration',
    links: Object.freeze([
      Object.freeze({ label: 'Markus Krajewski, The Great Lightbulb Conspiracy (IEEE Spectrum, 2014)', url: 'https://spectrum.ieee.org/the-great-lightbulb-conspiracy' }),
      Object.freeze({ label: 'Phoebus cartel — members, fine schedule, dissolution', url: 'https://en.wikipedia.org/wiki/Phoebus_cartel' }),
    ]),
  }),
]);

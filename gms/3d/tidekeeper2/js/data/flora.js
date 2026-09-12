/* Plants and hardscape. `kind` selects the mesh builder in render/flora.js. */

export const PLANTS = [
  { id:'javafern', name:'Java Fern', sci:'Microsorum pteropus', water:'fw', price:12, tier:1,
    uptake:0.55, o2:0.5, appeal:6, light:0.25, height:0.42, hides:0.7, kind:'fern',
    desc:'Tough, slow and shade-happy. Ties to wood and asks for nothing.' },
  { id:'val', name:'Vallisneria', sci:'Vallisneria spiralis', water:'fw', price:14, tier:1,
    uptake:1.2, o2:1.1, appeal:9, light:0.5, height:1.0, hides:0.6, kind:'ribbon',
    desc:'Ribbons that run to the surface and then lie along it. The best oxygen per dollar in the shop.' },
  { id:'amazon', name:'Amazon Sword', sci:'Echinodorus bleheri', water:'fw', price:16, tier:1,
    uptake:1.0, o2:0.9, appeal:8, light:0.5, height:0.62, hides:0.5, kind:'broad',
    desc:'A big soft green fountain with a real appetite for nitrate once it roots.' },
  { id:'rotala', name:'Rotala Rotundifolia', sci:'Rotala rotundifolia', water:'fw', price:20, tier:2,
    uptake:1.1, o2:1.0, appeal:13, light:0.8, height:0.55, hides:0.45, kind:'stem',
    desc:'Stems that blush copper-pink at the tips under strong light. The thing people photograph.' },
  { id:'carpet', name:'Dwarf Hairgrass', sci:'Eleocharis parvula', water:'fw', price:26, tier:2,
    uptake:0.8, o2:0.8, appeal:14, light:0.85, height:0.13, hides:0.2, kind:'carpet',
    desc:'A lawn. Demands strong light and pays you back with the best floor in freshwater.' },
  { id:'anubias', name:'Anubias Nana', sci:'Anubias barteri nana', water:'fw', price:18, tier:2,
    uptake:0.4, o2:0.4, appeal:9, light:0.2, height:0.26, hides:0.6, kind:'broad',
    desc:'Thick dark leaves that grow on stone at their own unhurried pace. Almost unkillable.' },
  { id:'macro', name:'Green Macroalgae', sci:'Caulerpa prolifera', water:'sw', price:20, tier:4,
    uptake:1.4, o2:0.9, appeal:7, light:0.6, height:0.5, hides:0.55, kind:'grape',
    desc:'The reef keeper’s nitrate sponge. Plain on its own, invaluable in a stocked tank.' },
  { id:'seagrass', name:'Turtle Seagrass', sci:'Thalassia testudinum', water:'sw', price:24, tier:4,
    uptake:1.0, o2:1.2, appeal:11, light:0.7, height:0.78, hides:0.6, kind:'ribbon',
    desc:'Slow, bright and genuinely rare in captivity. Seahorses hold on to it.' },
];
export const PL = {}; PLANTS.forEach(p => PL[p.id] = p);

export const DECOR = [
  { id:'cave', name:'Stone Cave', water:'any', price:18, tier:1, appeal:5, hides:1.0, kind:'cave',
    desc:'Somewhere for a shy fish to be invisible, which is how you get to see it at all.' },
  { id:'driftwood', name:'Spiderwood Branch', water:'fw', price:26, tier:1, appeal:8, hides:0.8, ph:-0.12, kind:'wood',
    desc:'Leaches tannins and softens the water. Plecos rasp on it, loaches live under it.' },
  { id:'rockpile', name:'Seiryu Stone', water:'any', price:24, tier:2, appeal:9, hides:0.6, territory:1, kind:'rock',
    desc:'Grey-green stone with white veins. Breaks sight lines, which is how two territorial fish never meet.' },
  { id:'bubbler', name:'Air Curtain', water:'any', price:16, tier:2, appeal:4, hides:0, o2:0.9, kind:'bubbler',
    desc:'A wall of rising silver. Cheap oxygen and, it turns out, cheap spectacle.' },
  { id:'wreck', name:'Sunken Launch', water:'any', price:130, tier:3, appeal:18, hides:1.1, kind:'wreck',
    desc:'A small drowned boat lying over on its side. Crowds photograph it; shy fish move into it.' },
  { id:'anemone', name:'Bubble-Tip Anemone', water:'sw', price:95, tier:4, appeal:15, hides:0.3,
    host:true, living:true, light:0.7, kind:'anemone',
    desc:'A living animal with a light requirement and a temper about water quality. Host a clownfish in it and both change.' },
  { id:'coral', name:'Staghorn Colony', water:'sw', price:78, tier:4, appeal:13, hides:0.5,
    living:true, light:0.8, kind:'coral',
    desc:'Pure structure and pure colour. It will bleach the moment the water slides.' },
];
export const DEC = {}; DECOR.forEach(d => DEC[d.id] = d);

export const FOODS = [
  { id:'flake',  name:'Flake',        price:1, feeds:['flake','micro','pellet'], sink:0.35, waste:1.0,
    desc:'The generic food. Almost anything will take it. Floats, then sinks, and makes a mess.' },
  { id:'pellet', name:'Sinking Pellets', price:2, feeds:['pellet','flake','detritus'], sink:0.85, waste:0.7,
    desc:'Goes down fast and holds together. Less of it ends up as waste.' },
  { id:'micro',  name:'Live Micro-feed', price:3, feeds:['micro'],          sink:0.2,  waste:1.2,
    desc:'A cloud of tiny live food. The only thing the fussy eaters recognise as food at all.' },
  { id:'meaty',  name:'Frozen Mysis',    price:4, feeds:['meaty','pellet'], sink:0.6,  waste:1.1,
    desc:'Predators and fussy feeders both come alive for it.' },
  { id:'wafer',  name:'Algae Wafer',     price:2, feeds:['algae','detritus'], sink:1.0, waste:0.9,
    desc:'Goes straight to the sand for whoever works down there.' },
];
export const FD = {}; FOODS.forEach(f => FD[f.id] = f);

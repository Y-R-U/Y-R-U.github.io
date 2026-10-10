// Explore map: tap any country → flag, capital, population, languages, currency, landmark photo, anthem.
import { h } from '../ui/kit.js?v=202610100547';
import { header, go } from '../ui/app.js?v=202610100547';
import { getPack, loadMusic, kidsOn, refOf } from './data.js?v=202610100547';
import { soundBtn, creditBtn, sayBtn, say, stopAudio, emptyState } from './ui.js?v=202610100547';
import { factText } from '../formats/registry.js?v=202610100547';
import { BUILD } from '../build.js?v=202610100547';
import { lazyImport } from '../ui/update.js?v=202610100547';

const CONT = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania', AN: 'Antarctica' };

async function sources() {
  const [countries, landmarks, capitals, anthems] = await Promise.all([
    getPack('countries').catch(() => null), getPack('landmarks').catch(() => null),
    getPack('capitals').catch(() => null), loadMusic('anthems').catch(() => null)]);
  const byIso = (p, multi = false) => {
    const m = {};
    for (const it of p?.items || []) if (it.iso3) { if (multi) (m[it.iso3] || (m[it.iso3] = [])).push(it); else m[it.iso3] = m[it.iso3] || it; }
    return m;
  };
  return { countries, landmarks, capitals, anthems, cIso: byIso(countries), lIso: byIso(landmarks, true), capIso: byIso(capitals) };
}

function anthemFor(S, citem, name) {
  const items = S.anthems?.items || [];
  const n = String(name || '').toLowerCase();
  return items.find(a => a.iso3 && a.iso3 === citem?.iso3) || items.find(a => citem && a.id === citem.id)
    || items.find(a => a.name.toLowerCase() === n || a.name.toLowerCase() === (citem?.name || '').toLowerCase()) || null;
}

export function countryCard(S, iso, props = {}, flagImg = null) {
  const kids = kidsOn();
  const c = S.cIso[iso];
  const name = c?.name || props.n || iso;
  const f = c?.facts || {};
  const meta = S.countries?.factsMeta || {};
  const flag = c?.media?.img?.[0] || flagImg;
  const lm = (S.lIso[iso] || []).find(x => x.media?.img?.length);
  const lmImg = lm?.media.img[0];
  const anthem = anthemFor(S, c, name);
  const aud = anthem?.media?.audio?.[0];
  const pop = f.population ?? props.pop;
  const rows = [
    ['Capital', f.capital || S.capIso[iso]?.name],
    ['Continent', f.continent || CONT[props.c]],
    ['Population', pop ? factText(meta.population || { type: 'num', unit: 'people' }, pop) : null],
    ['Languages', f.languages], ['Currency', f.currency],
    kids ? null : ['Area', f.areaKm2 ? factText(meta.areaKm2 || { type: 'num', unit: 'km²' }, f.areaKm2) : null],
    kids ? null : ['Drives on', f.drivingSide], kids ? null : ['Calling code', f.callingCode],
  ].filter(r => r && r[1]);
  const speech = `${name}. ` + rows.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join('. ');
  const credits = [flag, lmImg, aud].filter(Boolean);
  const card = h('div.l-country', { dataset: { iso } },
    h('div.l-ctop', {},
      flag ? h('img.l-flag', { src: flag.src, alt: `Flag of ${name}`, referrerpolicy: 'no-referrer' }) : h('span.l-flag.none', {}, '🏳️'),
      h('div.l-cname', {}, h('h2', {}, name), h('div.tiny.muted', {}, CONT[props.c] || f.continent || '')),
      h('div.l-item-btns', {}, sayBtn(speech), credits.length ? creditBtn(credits, `${name}: credits`) : null)),
    rows.length ? h('table.l-facts', {}, h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))) : h('p.muted', {}, 'No facts for this place yet.'),
    aud ? h('div.l-anthem', {}, soundBtn(aud, { label: `Play the anthem of ${name}`, text: kids ? 'Anthem' : `Anthem${anthem.facts?.anthem ? ': ' + anthem.facts.anthem : ''}` })) : null,
    lmImg ? h('figure.l-landmark', {}, h('img', { src: lmImg.src, alt: lm.name, loading: 'lazy', referrerpolicy: 'no-referrer' }), h('figcaption', {}, lm.name)) : null,
    c ? h('div.l-item-acts', {}, h('button.btn.small', { type: 'button', onclick: () => go('l-item', { ref: refOf(S.countries, c) }) }, 'Field guide ›')) : null);
  return { card, speech };
}

export async function exploreScreen(el, params) {
  el.classList.add('l-explore-scr');
  el.append(header(kidsOn() ? 'World map' : 'Explore map'));
  const mapBox = h('div.l-xmap');
  const side = h('div.l-xside', {}, h('div.l-xhint', {}, h('div.e-ico', {}, '👆'), h('p.muted', {}, 'Tap a country, or search for one.')));
  el.append(h('div.l-xwrap', {}, mapBox, side));
  let exp, S;
  try {
    const mod = await lazyImport(new URL(`../geo/explore.js?v=${BUILD}`, import.meta.url).href);
    const flagsP = fetch(new URL('../../data/geo/flags.json', import.meta.url)).then(r => r.json()).catch(() => ({}));
    const sP = sources();
    exp = mod.createExplore(mapBox, {
      region: 'world',
      async onPick(iso, props) {
        stopAudio();
        S = S || await sP;
        const flags = await flagsP;
        const { card, speech } = countryCard(S, iso, props, flags[iso]);
        side.innerHTML = '';
        side.append(card);
        if (kidsOn()) say(speech);
      },
    });
    await exp.ready;
    if (params.iso) exp.select(params.iso);
  } catch (e) {
    console.warn('[learn] explore map failed', e);
    mapBox.replaceWith(emptyState('🗺️', 'Map not ready', 'The map is still being built. Try again soon.'));
  }
  return () => { stopAudio(); exp?.destroy?.(); };
}

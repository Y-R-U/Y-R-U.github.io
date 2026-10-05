// Explore map for lane L: tap (or search) a country -> onPick(iso3, props). Political colours, names on tap.
import { createMap } from './map.js?v=202610050139';
import { loadIndex, geo } from './data.js?v=202610050139';
import { STATE_VIEWS } from './regions.js?v=202610050139';

export function createExplore(el, { region = 'world', onPick = () => {}, set = 'all', search = true, style = 'political', label = true } = {}) {
  el.innerHTML = '';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const mapEl = document.createElement('div');
  mapEl.style.cssText = 'position:absolute;inset:0';
  el.append(mapEl);
  let selected = null;
  const map = createMap(mapEl, {
    region, target: STATE_VIEWS[region] ? 'states' : 'countries', set, style,
    onTap(hit) { if (hit.id && hit.playable) select(hit.id, { fly: false }); },
  });
  function select(id, { fly = true } = {}) {
    if (selected) { map.setState(selected, null); map.unlabel(selected); }
    selected = id;
    map.setState(id, 'sel');
    const props = map.feature(id)?.props || geo.countries[id] || {};
    if (label) map.label(id, props.n || id);
    if (fly) map.flyTo(id, { maxZoom: 6 });
    onPick(id, props);
  }
  if (search) {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:8px;top:8px;right:56px;z-index:3;max-width:320px';
    const input = document.createElement('input');
    input.type = 'search'; input.placeholder = 'Find a country…'; input.setAttribute('aria-label', 'Find a country');
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:0;font:inherit;font-size:16px;box-shadow:0 1px 5px rgba(0,0,0,.2)';
    const list = document.createElement('div');
    list.style.cssText = 'background:#fff;color:#222;border-radius:12px;margin-top:4px;max-height:40vh;overflow:auto;box-shadow:0 2px 10px rgba(0,0,0,.2)';
    box.append(input, list);
    el.append(box);
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    input.addEventListener('input', async () => {
      await map.ready;
      const t = norm(input.value.trim());
      list.innerHTML = '';
      if (!t) return;
      const ids = map.featureIds().filter(id => map.feature(id).playable);
      const hits = ids.map(id => [id, map.feature(id).props]).filter(([, p]) => p?.n && (norm(p.n).includes(t) || (p.alt || []).some(a => norm(a).includes(t))))
        .sort((a, b) => norm(a[1].n).indexOf(t) - norm(b[1].n).indexOf(t)).slice(0, 8);
      for (const [id, p] of hits) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = p.n;
        b.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:none;font:inherit;cursor:pointer;color:inherit';
        b.addEventListener('click', () => { list.innerHTML = ''; input.value = ''; input.blur(); select(id); });
        list.append(b);
      }
    });
  }
  return { map, ready: map.ready.then(() => loadIndex()), select, destroy: () => { map.destroy(); el.innerHTML = ''; } };
}

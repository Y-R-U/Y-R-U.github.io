import { esc, fmt, RARITY, statLabel, fmtStat, LOWER_IS_BETTER } from './core.js';
import { icon } from './icons.js';

export const itemIcon = it => it.icon || it.slot || 'chip';

export function rarityStyle(r) {
  const R = RARITY.get(r);
  return `--rc:${R.color}`;
}

export function itemTile(it, extra = '') {
  if (!it) return `<div class="hf-tile empty ${extra}"></div>`;
  const R = RARITY.get(it.rarity);
  return `<div class="hf-tile r-${R.key} ${extra}" style="${rarityStyle(it.rarity)}" data-id="${esc(it.id)}">
    <span class="ti">${icon(itemIcon(it))}</span>${it.level ? `<b class="tl hf-num">${it.level}</b>` : ''}${it.tune ? `<b class="tt hf-num">+${it.tune}</b>` : ''}<i class="tb">${icon('up')}</i><i class="te">E</i>${it.qty > 1 ? `<b class="tq hf-num">×${it.qty}</b>` : ''}${it.isNew ? '<i class="tn"></i>' : ''}
  </div>`;
}

function statRows(it, cmp) {
  const keys = Object.keys(it.stats || {});
  if (cmp) for (const k of Object.keys(cmp.stats || {})) if (!keys.includes(k)) keys.push(k);
  return keys.map(k => {
    const v = it.stats?.[k] ?? 0;
    let delta = '';
    if (cmp) {
      const d = v - (cmp.stats?.[k] ?? 0);
      if (Math.abs(d) > 1e-6) {
        const better = LOWER_IS_BETTER.has(k) ? d < 0 : d > 0;
        delta = `<em class="${better ? 'up' : 'down'}">${icon(d > 0 ? 'up' : 'down')}${fmtStat(k, Math.abs(d))}</em>`;
      } else delta = '<em class="eq">=</em>';
    }
    return `<li class="${it.stats?.[k] == null ? 'miss' : ''}"><span>${esc(statLabel(k))}</span><b class="hf-num">${fmtStat(k, v)}</b>${delta}</li>`;
  }).join('');
}

export function itemCardHTML(it, cmp, { equipped = false, actions = '' } = {}) {
  const R = RARITY.get(it.rarity);
  const tm = it.tuneMax || (it.tune != null ? 10 : 0);
  const pips = tm ? `<div class="pips">${Array.from({ length: tm }, (_, i) => `<i class="${i < (it.tune || 0) ? 'on' : ''}"></i>`).join('')}</div>` : '';
  return `<div class="hf-icard r-${R.key} ${equipped ? 'equipped' : ''}" style="${rarityStyle(it.rarity)}">
    <div class="ih">
      <div class="iic">${icon(itemIcon(it))}</div>
      <div class="it">
        <div class="ir">${equipped ? '<span class="eqtag">Equipped</span>' : ''}${esc(R.name)} · ${esc(it.slot || '')}</div>
        <div class="in">${esc(it.name)}${it.tune ? ` <span class="itn hf-num">+${it.tune}</span>` : ''}</div>
      </div>
      ${it.fr != null ? `<div class="il"><small>FR</small><b class="hf-num">${it.fr}</b></div>` : it.level ? `<div class="il"><small>LV</small><b class="hf-num">${it.level}</b></div>` : ''}
    </div>
    ${pips}
    <ul class="is">${statRows(it, cmp)}</ul>
    ${it.affixes?.length ? `<ul class="ia">${it.affixes.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    ${it.flavor ? `<p class="if">${esc(it.flavor)}</p>` : ''}
    <div class="iv"><span>${icon('credits')}<b class="hf-num">${fmt(it.value || 0)}</b></span>${it.element ? `<span class="uc el-${esc(it.element)}">${esc(it.element)}</span>` : ''}</div>
    ${actions ? `<div class="ib">${actions}</div>` : ''}
  </div>`;
}

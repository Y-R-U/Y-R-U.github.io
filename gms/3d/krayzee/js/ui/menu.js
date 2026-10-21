import { el, esc, onTap, CREST, ICON } from './dom.js';
import { rankProgress } from './career.js';

export function createMenu(root, act) {
  const node = el(`<section class="kz-screen kz-menu" aria-label="Main menu">
    <div class="kz-menu-top">
      ${CREST}
      <div class="kz-word"><span class="kz-word-a">The Kingdom of</span><span class="kz-word-b">Krayzee</span><span class="kz-tag">Not your normal flight sim</span></div>
    </div>
    <div class="kz-menu-panel">
      <button class="kz-pilot" data-a="profile" aria-label="Edit pilot profile">
        <span class="kz-roundel"></span>
        <span class="kz-pilot-txt"><span class="kz-pilot-name"></span><span class="kz-pilot-sub"></span><span class="kz-pilot-next"><span class="kz-bar"><i></i></span><em></em></span></span>
        <span class="kz-pilot-edit">Edit</span>
      </button>
      <button class="kz-btn primary" data-a="free">Free Flight</button>
      <div class="kz-grid">
        <button class="kz-btn soon" data-a="story">${ICON.story}Story<span class="kz-soon">SOON</span></button>
        <button class="kz-btn soon" data-a="online">${ICON.online}Online<span class="kz-soon">SOON</span></button>
        <button class="kz-btn" data-a="hangar">${ICON.hangar}Hangar</button>
        <button class="kz-btn" data-a="settings">${ICON.gear}Settings</button>
      </div>
    </div>
  </section>`);
  root.append(node);
  node.querySelectorAll('[data-a]').forEach((b) => onTap(b, () => act(b.dataset.a)));
  return {
    node,
    setProfile(p) {
      node.querySelector('.kz-roundel').style.background =
        `conic-gradient(${p.primary} 0 50%, ${p.secondary} 0 75%, ${p.accent} 0)`;
      node.querySelector('.kz-pilot-name').innerHTML = `<i>${esc(p.title)}</i> ${esc(p.name)}`;
      node.querySelector('.kz-pilot-sub').textContent = [p.company, p.registration].filter(Boolean).join(' · ');
      const g = rankProgress(p.gender), nx = node.querySelector('.kz-pilot-next');
      nx.querySelector('i').style.width = `${Math.round((g.next ? g.next.frac : 1) * 100)}%`;
      nx.querySelector('em').textContent = g.next ? g.next.text : `${g.ppText} PP · top of the peerage`;
      nx.title = g.next?.emperor ? `${g.next.title} needs ${g.next.winsMax} online wins (${g.next.wins}/${g.next.winsMax})` : '';
    },
    show(on) { node.classList.toggle('on', on); },
  };
}

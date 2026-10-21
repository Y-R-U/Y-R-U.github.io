import { el, esc, onTap, ICON } from './dom.js';
import { createPopup } from './popup.js';
import { loadSettings, saveSettings, loadProfile } from './store.js';
import { career, rankProgress } from './career.js';
import { RANKS, titleFor } from './ranks.js';
import { openAccountPanel } from './account.js';

const seg = (key, opts) => `<div class="kz-seg" data-k="${key}">${opts.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div>`;
const range = (key) => `<div class="kz-range"><input type="range" min="0" max="100" step="5" data-k="${key}" aria-label="${key} volume"><output></output></div>`;

const LITE = (() => { try { return new URLSearchParams(location.search).get('lite') === '1'; } catch (e) { return false; } })();

export function createSettings(root, { onChange, onTitle, onResume, onQuit, onClose }) {
  const pop = createPopup(root, { title: 'Settings', sub: 'The Royal Aero Club', cls: 'kz-settings acct', onClose: () => onClose?.() });
  pop.body.innerHTML = `
    <div class="kz-sec kz-peer"><h3>Peerage</h3>
      <div class="kz-rank"><div class="kz-rank-top"><b></b><span></span></div><div class="kz-bar"><i></i></div><p></p><small class="kz-throne"></small><div class="kz-pips" aria-hidden="true"></div></div>
      <div class="kz-row stack"><span>Title<small>What the tower calls you in Free Flight. Story, events and ranked rooms use the rank their rules give you.</small></span>
        <div class="kz-titles" role="radiogroup" aria-label="Title"></div></div>
    </div>
    <div class="kz-sec"><h3>Flying</h3>
      <div class="kz-row"><span>View<small>Also on the in-flight view button</small></span>${seg('view', [['cockpit', 'Cockpit'], ['chase', 'Chase']])}</div>
      <div class="kz-row"><span>Invert pitch<small data-say="invertPitch"></small></span><button class="kz-switch" role="switch" data-k="invertPitch" aria-label="Invert pitch"></button></div>
      <div class="kz-row"><span>Stick on right<small data-say="stickRight"></small></span><button class="kz-switch" role="switch" data-k="stickRight" aria-label="Stick on right"></button></div>
      <div class="kz-row"><span>Units</span>${seg('units', [['aviation', 'kt · ft'], ['metric', 'km/h · m']])}</div>
    </div>
    <div class="kz-sec"><h3>Graphics</h3>
      <div class="kz-row stack"><span>Quality<small>${LITE ? 'Held at Low by the lite link' : 'Auto starts low and steps up once your device keeps pace'}</small></span>${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]).replace('kz-seg"', 'kz-seg wide"')}</div>
    </div>
    <div class="kz-sec"><h3>Sound</h3>
      <div class="kz-row"><span>Effects</span>${range('sfx')}</div>
      <div class="kz-row"><span>Radio voices</span>${range('voice')}</div>
      <div class="kz-row"><span>Music</span>${range('music')}</div>
    </div>
    <div class="kz-sec"><h3>Account</h3>
      <div class="kz-acct-row"><p>Sign in to keep your pilot and settings on every device.</p><button class="kz-btn ghost" data-act="account">Account</button></div>
    </div>`;
  let s = loadSettings();

  const titles = pop.body.querySelector('.kz-titles');
  function paintPeerage() {
    const c = career(), gender = loadProfile().gender, g = rankProgress(gender, c);
    const rk = pop.body.querySelector('.kz-rank');
    rk.querySelector('b').innerHTML = `<i>${esc(g.rankTitle)}</i>`;
    rk.querySelector('.kz-rank-top span').textContent = `${g.ppText} PP`;
    rk.querySelector('.kz-bar i').style.width = `${Math.round((g.next ? g.next.frac : 1) * 100)}%`;
    rk.querySelector('p').textContent = g.next ? g.next.text : 'The top of the peerage. Nobody outranks you.';
    const pips = rk.querySelector('.kz-pips');
    const emp = RANKS[RANKS.length - 1], throne = rk.querySelector('.kz-throne');
    throne.hidden = !g.next || g.next.emperor;
    throne.textContent = `The throne: ${titleFor(gender, RANKS.length - 1)} needs ${emp.minPP.toLocaleString('en-GB')} PP and ${emp.minOnlineWins} online wins.`;
    pips.hidden = !g.next?.emperor;
    if (g.next?.emperor) {
      const { wins, winsMax } = g.next;
      pips.innerHTML = `<span>${esc(g.next.title)} also needs ${winsMax} online wins</span><div>${Array.from({ length: winsMax }, (_, k) => `<i class="${k < wins ? 'on' : ''}">${ICON.crown}</i>`).join('')}<em>${wins}/${winsMax}</em></div>`;
    }
    const unlocked = c.unlockedTitles;
    if (!c.canPickTitle('free')) {
      const next = RANKS[1];
      titles.innerHTML = `<div class="kz-note">${ICON.lock}<p>Earn <b>${esc(titleFor(gender, 1))}</b> (${next.minPP.toLocaleString('en-GB')} PP) to choose your title. Every title you earn stays yours to wear.</p></div>`;
      return;
    }
    const top = unlocked[unlocked.length - 1];
    const cur = c.selectedTitle && unlocked.includes(c.selectedTitle) ? c.selectedTitle : top;
    titles.innerHTML = unlocked.map((id) => {
      const i = RANKS.findIndex((r) => r.id === id);
      return `<button role="radio" data-t="${id}" aria-checked="${id === cur}">${esc(titleFor(gender, i))}${id === top ? '<small>highest</small>' : ''}</button>`;
    }).join('');
    titles.querySelectorAll('button').forEach((b) => onTap(b, () => {
      const id = b.dataset.t;
      if (career().selectTitle(id === top ? null : id)) { paintPeerage(); onTitle?.(); }
    }, 'toggle'));
  }

  function paint() {
    paintPeerage();
    pop.body.querySelectorAll('.kz-seg[data-k="quality"] button').forEach((b) => { b.disabled = LITE; });
    pop.body.querySelectorAll('.kz-seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(s[g.dataset.k] === b.dataset.v))));
    pop.body.querySelectorAll('.kz-switch').forEach((b) => b.setAttribute('aria-checked', String(!!s[b.dataset.k])));
    pop.body.querySelector('[data-say="invertPitch"]').textContent = s.invertPitch ? 'On: stick down = nose down' : 'Off: stick down = nose up';
    pop.body.querySelector('[data-say="stickRight"]').textContent = s.stickRight ? 'Stick on the right, buttons on the left' : 'Stick on the left, buttons on the right';
    pop.body.querySelectorAll('input[type=range]').forEach((r) => {
      const v = Math.round((s[r.dataset.k] ?? 1) * 100);
      r.value = v;
      r.style.setProperty('--v', v + '%');
      r.nextElementSibling.textContent = v;
    });
  }
  const set = (k, v) => { s = saveSettings({ ...s, [k]: v }); paint(); onChange?.(s); };

  pop.body.querySelectorAll('.kz-seg button').forEach((b) => onTap(b, () => set(b.parentElement.dataset.k, b.dataset.v), 'toggle'));
  pop.body.querySelectorAll('.kz-switch').forEach((b) => onTap(b, () => set(b.dataset.k, !s[b.dataset.k]), 'toggle'));
  pop.body.querySelectorAll('input[type=range]').forEach((r) => {
    r.addEventListener('input', () => { r.style.setProperty('--v', r.value + '%'); r.nextElementSibling.textContent = r.value; s = { ...s, [r.dataset.k]: r.value / 100 }; onChange?.(s); });
    r.addEventListener('change', () => set(r.dataset.k, r.value / 100));
  });
  onTap(pop.body.querySelector('[data-act=account]'), () => openAccountPanel());

  return {
    pop,
    get: () => s,
    set,
    open(inGame) {
      s = loadSettings();
      paint();
      pop.foot.replaceChildren();
      if (inGame) {
        const quit = el('<button class="kz-btn danger">Quit to menu</button>');
        const res = el('<button class="kz-btn primary">Resume</button>');
        onTap(quit, () => onQuit?.(), 'back');
        onTap(res, () => onResume?.(), 'confirm');
        pop.foot.append(quit, res);
      } else {
        const done = el('<button class="kz-btn primary">Done</button>');
        onTap(done, () => pop.close(), 'confirm');
        pop.foot.append(done);
      }
      pop.open();
    },
  };
}

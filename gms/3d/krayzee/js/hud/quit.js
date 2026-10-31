// PLAYTEST_3 #6: quitting with pending PP asks first (in-game card over the pause sheet, never alert()).
export function createQuitConfirm(parent = document.body) {
  const el = document.createElement('div');
  el.className = 'krz-quitc';
  el.hidden = true;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="krz-quitc-card"><b>Abandon <span class="krz-quitc-pp"></span> PP?</b>
    <p>These points are still pending. Quit now and they are lost. Land, stop and DEMAND IT to bank them.</p>
    <div class="krz-quitc-btns"><button type="button" class="krz-quitc-stay">Keep flying</button><button type="button" class="krz-quitc-go">Quit and lose them</button></div></div>`;
  parent.append(el);
  const pp = el.querySelector('.krz-quitc-pp');
  // HUDPOLISH E2: the backdrop does not close the card. The click right after the one that opened it (a double tap on QUIT
  // TO MENU, or a late second tap) lands on the backdrop and shut the card before it was seen; under load that second click
  // can come a second later, so no time window is safe. The two buttons are the only way out.
  let go = null;
  const close = () => { el.classList.remove('in'); setTimeout(() => { if (!el.classList.contains('in')) el.hidden = true; }, 200); go = null; };
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => e.stopPropagation());
  el.querySelector('.krz-quitc-stay').addEventListener('click', close);
  el.querySelector('.krz-quitc-go').addEventListener('click', () => { const g = go; close(); g?.(); });
  return {
    el,
    ask(points, onGo) {
      if (!(points > 0)) return onGo();
      pp.textContent = Math.round(points).toLocaleString('en-GB');
      go = onGo;
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add('in'));
    },
    get open() { return !el.hidden; },
  };
}

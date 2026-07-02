// Start menu: title card with New Game / Continue. The first tap doubles as
// the audio unlock (so the cinematic can play sound). Overwriting an existing
// save asks via an inline confirm card — never alert(). Resolves with
// { mode: 'new' | 'continue' }.

export function showMenu({ hasSave, title = 'DEADTOWN', subtitle = 'day one', apiLive = false }) {
  const el = document.getElementById('menu');
  if (!el) return Promise.resolve({ mode: 'new' });
  document.getElementById('menu-title').textContent = title;
  document.getElementById('menu-sub').textContent = subtitle;
  const bNew = document.getElementById('menu-new');
  const bCont = document.getElementById('menu-cont');
  const confirm = document.getElementById('menu-confirm');
  const bYes = document.getElementById('menu-confirm-yes');
  const bNo = document.getElementById('menu-confirm-no');
  const edLink = document.getElementById('menu-editor');
  bCont.classList.toggle('hidden', !hasSave);
  confirm.classList.add('hidden');
  if (edLink) {
    edLink.classList.toggle('hidden', !apiLive);
    if (apiLive) edLink.href = `${location.protocol}//${location.hostname}:8902/editor/`;
  }
  el.classList.remove('hidden');

  return new Promise(resolve => {
    const done = (mode) => {
      bNew.removeEventListener('click', onNew);
      bCont.removeEventListener('click', onCont);
      bYes.removeEventListener('click', onYes);
      bNo.removeEventListener('click', onNo);
      el.classList.add('fade');
      setTimeout(() => { el.classList.add('hidden'); el.classList.remove('fade'); }, 500);
      resolve({ mode });
    };
    const onNew = () => { if (hasSave) confirm.classList.remove('hidden'); else done('new'); };
    const onYes = () => done('new');
    const onNo = () => confirm.classList.add('hidden');
    const onCont = () => done('continue');
    bNew.addEventListener('click', onNew);
    bCont.addEventListener('click', onCont);
    bYes.addEventListener('click', onYes);
    bNo.addEventListener('click', onNo);
  });
}

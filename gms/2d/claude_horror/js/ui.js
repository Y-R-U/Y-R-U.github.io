// THE HOLLOW — UI helpers: popups, toasts, typewriter reveal, panel open/close.
// No native alert/confirm/prompt anywhere.

(function () {
  const popupRoot = document.getElementById('popup-root');

  // ----- POPUPS -----
  function popupConfirm({ title, body, confirmLabel = 'Yes', cancelLabel = 'Cancel' }) {
    return new Promise((resolve) => {
      const card = document.createElement('div');
      card.className = 'popup confirm';
      card.innerHTML = `
        <h4></h4>
        <p></p>
        <div class="popup-buttons">
          <button class="btn primary"></button>
          <button class="btn ghost"></button>
        </div>`;
      card.querySelector('h4').textContent = title || '';
      card.querySelector('p').textContent  = body || '';
      const [okBtn, cancelBtn] = card.querySelectorAll('button');
      okBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;
      okBtn.addEventListener('click', () => { close(true); });
      cancelBtn.addEventListener('click', () => { close(false); });

      const dim = document.createElement('div');
      dim.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:299;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
      dim.addEventListener('click', () => close(false));

      function close(v) {
        card.style.opacity = '0';
        card.style.transition = 'opacity .15s';
        dim.style.opacity = '0';
        dim.style.transition = 'opacity .15s';
        setTimeout(() => { card.remove(); dim.remove(); resolve(v); }, 160);
      }

      document.body.appendChild(dim);
      popupRoot.appendChild(card);
    });
  }

  function popupAlert({ title, body, dismissLabel = 'OK' }) {
    return new Promise((resolve) => {
      const card = document.createElement('div');
      card.className = 'popup confirm';
      card.innerHTML = `
        <h4></h4>
        <p></p>
        <div class="popup-buttons">
          <button class="btn primary"></button>
        </div>`;
      card.querySelector('h4').textContent = title || '';
      card.querySelector('p').textContent  = body || '';
      const okBtn = card.querySelector('button');
      okBtn.textContent = dismissLabel;
      okBtn.addEventListener('click', close);

      const dim = document.createElement('div');
      dim.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:299;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);';
      dim.addEventListener('click', close);

      function close() {
        card.style.opacity = '0';
        card.style.transition = 'opacity .15s';
        dim.style.opacity = '0';
        dim.style.transition = 'opacity .15s';
        setTimeout(() => { card.remove(); dim.remove(); resolve(); }, 160);
      }

      document.body.appendChild(dim);
      popupRoot.appendChild(card);
    });
  }

  // ----- TOASTS -----
  // kind: 'item' | 'memory' | 'plain'
  function toast(text, kind = 'item') {
    const el = document.createElement('div');
    el.className = 'popup toast';
    if (kind === 'item')   el.classList.add('found');
    if (kind === 'memory') el.classList.add('memory');
    el.textContent = text;
    popupRoot.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ----- TYPEWRITER -----
  // Reveal text into an element character-by-character. Returns a
  // controller with .skip() to instantly fill, .promise to await.
  // Speed: 'instant' | 'fast' | 'normal' | 'slow'
  function typewrite(el, text, speed = 'normal') {
    const ms = speed === 'instant' ? 0
            : speed === 'fast'    ? 12
            : speed === 'slow'    ? 38
            : 22;

    el.textContent = '';
    el.classList.remove('reveal-cursor');
    if (ms === 0) {
      el.textContent = text;
      return { skip: () => {}, promise: Promise.resolve() };
    }

    el.classList.add('reveal-cursor');
    let i = 0;
    let cancelled = false;
    let resolveDone;
    const promise = new Promise(r => { resolveDone = r; });

    function tick() {
      if (cancelled) return;
      if (i >= text.length) {
        el.classList.remove('reveal-cursor');
        resolveDone();
        return;
      }
      // type a small batch per tick for smoother feel
      const batch = Math.max(1, Math.round(1));
      el.textContent += text.slice(i, i + batch);
      i += batch;
      // small extra pause on punctuation for breath
      const last = text[i - 1];
      const extra = (last === '.' || last === '?' || last === '!') ? ms * 6
                  : (last === ',' || last === ';')                  ? ms * 3
                  : 0;
      setTimeout(tick, ms + extra);
    }
    setTimeout(tick, 80);

    return {
      skip: () => {
        if (cancelled) return;
        cancelled = true;
        el.textContent = text;
        el.classList.remove('reveal-cursor');
        resolveDone();
      },
      promise,
    };
  }

  // ----- SCREEN SWITCH -----
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  // ----- PANEL -----
  function openPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  }
  // Wire up panel x-buttons + scrim clicks.
  document.querySelectorAll('[data-close-panel]').forEach(btn => {
    btn.addEventListener('click', () => closePanel(btn.dataset.closePanel));
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.addEventListener('click', (e) => { if (e.target === p) closePanel(p.id); });
  });

  window.UI = {
    popupConfirm, popupAlert, toast, typewrite,
    showScreen, openPanel, closePanel,
  };
})();

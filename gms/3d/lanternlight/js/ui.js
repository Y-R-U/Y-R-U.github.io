const $ = (id) => document.getElementById(id);

export function createUI() {
  let hintTimer = 0, subsOn = true;
  const ring = $('lampRing'), lamp = $('lampBtn');
  const CIRC = 276.5;
  return {
    set subsOn(v) { subsOn = v; },
    show(id) { $(id).classList.add('show'); },
    hide(id) { $(id).classList.remove('show'); },
    hud(on) { $('hud').classList.toggle('hidden', !on); },
    chapName(t) { $('chapName').textContent = t; },
    sibMarks(i) {
      const a = $('progSib1'), b = $('progSib2');
      a.style.left = '100%'; b.style.left = '100%';
      a.classList.toggle('hidden', i !== 1); b.classList.toggle('hidden', i !== 3);
    },
    progress(f) { $('progFill').style.width = (f * 100).toFixed(1) + '%'; },
    light(f, ready, low) {
      ring.style.strokeDashoffset = (CIRC * (1 - f)).toFixed(1);
      lamp.classList.toggle('low', low); lamp.classList.toggle('ready', ready && f > 0.06); lamp.classList.toggle('cool', !ready);
    },
    sub(who, text, cls) {
      if (!subsOn || !text) return;
      const w = $('subWho'); w.textContent = who || ''; w.className = cls || ''; w.style.display = who ? '' : 'none';
      $('subText').textContent = text; $('subs').classList.add('show');
    },
    subHide() { $('subs').classList.remove('show'); },
    hint(text, sec = 4) {
      clearTimeout(hintTimer);
      const h = $('hint');
      if (!text) { h.classList.remove('show'); return; }
      h.textContent = text; h.classList.add('show');
      hintTimer = setTimeout(() => h.classList.remove('show'), sec * 1000);
    },
    card(num, title) {
      $('chapNum').textContent = num; $('chapTitle').textContent = title;
      const c = $('chapCard'); c.classList.add('show');
      return new Promise((r) => setTimeout(() => { c.classList.remove('show'); setTimeout(r, 500); }, 2600));
    },
    fade(on, white) { const f = $('fade'); f.classList.toggle('white', !!white); f.classList.toggle('show', on); },
    flashDamage() { lamp.animate([{ transform: 'translateX(-50%) scale(1.15)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 300 }); },
    endLines(lines) {
      const el = $('endText'); el.innerHTML = '';
      lines.forEach((l, i) => { const s = document.createElement('span'); s.className = 'line'; s.textContent = l; el.appendChild(s); setTimeout(() => s.classList.add('show'), 600 + i * 2600); });
    },
    endCredits() {
      const el = $('endText');
      const s = document.createElement('span'); s.className = 'line credit';
      s.innerHTML = '<br>Lanternlight<br>voices made with Qwen Voice Studio · music from Who Fights';
      el.appendChild(s); setTimeout(() => s.classList.add('show'), 200);
      setTimeout(() => $('btnEndDone').classList.remove('hidden'), 1500);
    },
  };
}

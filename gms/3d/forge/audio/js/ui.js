export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function fmt(v, spec) {
  if (spec.enum) return spec.enum[Math.round(v)] ?? v;
  const s = spec.step ?? 0.01;
  const dec = s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3;
  return v.toFixed(dec) + (spec.unit ? ' ' + spec.unit : '');
}

export function paramRow(key, spec, value, onChange) {
  const row = el('div', 'row');
  const lab = el('label');
  lab.append(el('span', null, spec.label || key), el('em', null, fmt(value, spec)));
  const inp = el('input');
  inp.type = 'range';
  inp.min = spec.min; inp.max = spec.max; inp.step = spec.step ?? 0.01;
  inp.value = value;
  inp.addEventListener('input', () => {
    const v = +inp.value;
    lab.querySelector('em').textContent = fmt(v, spec);
    onChange(key, v);
  });
  row.append(lab, inp);
  return row;
}

export function paramPanel(params, values, onChange) {
  const wrap = el('div', 'grid2');
  for (const k in params) wrap.append(paramRow(k, params[k], values[k], onChange));
  return wrap;
}

export function chipGroup(items, current, onPick) {
  const wrap = el('div', 'chips');
  const btns = {};
  let lastGroup = null;
  for (const it of items) {
    if (it.group && it.group !== lastGroup) {
      lastGroup = it.group;
      wrap.append(el('div', 'glabel', it.group));
    }
    const b = el('button', it.id === current ? 'on' : '', it.name);
    b.addEventListener('click', () => {
      for (const k in btns) btns[k].classList.toggle('on', k === it.id);
      onPick(it.id);
    });
    btns[it.id] = b;
    wrap.append(b);
  }
  wrap.select = id => { for (const k in btns) btns[k].classList.toggle('on', k === id); };
  return wrap;
}

let toastTimer = null;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK_AT = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function keyboard(host, octaves, baseMidi, onDown) {
  host.innerHTML = '';
  const whites = octaves * 7;
  const w = 100 / whites;
  const map = new Map();

  for (let i = 0; i < whites; i++) {
    const oct = Math.floor(i / 7), deg = i % 7;
    const midi = baseMidi + oct * 12 + WHITE[deg];
    const k = el('div', 'w', NAMES[midi % 12] + (Math.floor(midi / 12) - 1));
    k.style.left = i * w + '%'; k.style.width = w + '%';
    k.dataset.midi = midi;
    host.append(k); map.set(midi, k);

    if (BLACK_AT[deg] != null && i < whites - 1) {
      const bm = baseMidi + oct * 12 + BLACK_AT[deg];
      const b = el('div', 'b');
      b.style.left = `calc(${(i + 1) * w}% - ${w * 0.29}%)`;
      b.style.width = w * 0.58 + '%';
      b.dataset.midi = bm;
      host.append(b); map.set(bm, b);
    }
  }

  const hit = e => {
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t || !t.dataset.midi) return;
    t.classList.add('hit');
    setTimeout(() => t.classList.remove('hit'), 160);
    onDown(+t.dataset.midi);
  };
  host.addEventListener('pointerdown', e => { e.preventDefault(); hit(e); });
  return { flash: m => { const k = map.get(m); if (k) { k.classList.add('hit'); setTimeout(() => k.classList.remove('hit'), 160); } } };
}

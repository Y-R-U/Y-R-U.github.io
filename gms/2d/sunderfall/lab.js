// Art reference lab. Reads refs/manifest.json and lays every reference out next to
// an empty slot for the Sunderfall version of the same thing.

const $ = s => document.querySelector(s);

// Our answer to a reference lives at refs/ours/<same basename>. Nothing there yet —
// the slot stays empty until a file appears, then it just shows up.
const oursPath = ref => 'refs/ours/' + ref.split('/').pop();

function refCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="shot">
      <span class="badge ref">reference</span>
      <img loading="lazy" src="${item.file}" alt="${item.title}">
    </div>
    <div class="meta">
      <b>${item.title}</b>
      <span class="src">${item.source}</span>
      <span class="note">${item.note}</span>
      ${item.license ? `<span class="lic">${item.license}</span>` : ''}
    </div>`;
  card.querySelector('.shot').addEventListener('click', () => openLightbox(item));
  return card;
}

function oursCard(item) {
  const card = document.createElement('div');
  card.className = 'card ours';
  const src = oursPath(item.file);
  card.innerHTML = `
    <div class="shot">
      <span class="badge">sunderfall</span>
      <div class="empty">
        <span class="plus">+</span>
        <small>not built yet</small>
      </div>
    </div>
    <div class="meta">
      <b>Our ${item.kind === 'level' ? 'scene' : item.kind === 'anim' ? 'animation' : 'sheet'}</b>
      <span class="src">drop in <code>${src}</code></span>
    </div>`;

  // Speculatively load; if the file exists, swap the placeholder out for it.
  const probe = new Image();
  probe.onload = () => {
    const shot = card.querySelector('.shot');
    shot.querySelector('.empty').remove();
    shot.appendChild(probe);
    card.classList.remove('ours');
    shot.addEventListener('click', () =>
      openLightbox({ ...item, file: src, title: 'Sunderfall — ' + item.title, source: 'ours' }));
    bumpOursCount();
  };
  probe.alt = 'Sunderfall version of ' + item.title;
  probe.src = src;
  return card;
}

let oursCount = 0;
function bumpOursCount() { $('#n-ours').textContent = ++oursCount; }

function render(items, target) {
  const frag = document.createDocumentFragment();
  for (const item of items) {
    // Blind mode shuffles which side of the pair the reference lands on.
    const cards = [refCard(item), oursCard(item)];
    if (document.body.classList.contains('blind') && Math.random() < 0.5) cards.reverse();
    const pair = document.createElement('div');
    // Sheets and animation loops get a taller frame — 16:9 crushes a sprite grid.
    pair.className = item.kind === 'level' ? 'pair' : 'pair tall';
    cards.forEach(c => pair.appendChild(c));
    frag.appendChild(pair);
  }
  target.replaceChildren(frag);
}

let DATA = null;
fetch('refs/manifest.json')
  .then(r => r.json())
  .then(data => {
    DATA = data;
    render(data.levels, $('#grid-levels'));
    render(data.sprites, $('#grid-sheets'));
    $('#n-levels').textContent = data.levels.length;
    $('#n-sheets').textContent = data.sprites.length;
  })
  .catch(() => {
    $('#grid-levels').innerHTML =
      '<p style="color:#8d8aa3">Could not load <code>refs/manifest.json</code> — ' +
      'serve this folder over http rather than opening the file directly.</p>';
  });

// ---- toolbar ---------------------------------------------------------------
$('#blind').addEventListener('click', e => {
  document.body.classList.toggle('blind');
  e.currentTarget.classList.toggle('on');
  if (DATA) { render(DATA.levels, $('#grid-levels')); render(DATA.sprites, $('#grid-sheets')); }
});

$('#pixel').addEventListener('click', e => {
  document.body.classList.toggle('pixel');
  e.currentTarget.classList.toggle('on');
});

// ---- lightbox --------------------------------------------------------------
const lb = $('#lightbox'), lbImg = $('#lb-img'), lbStage = document.querySelector('.lb-stage');

function openLightbox(item) {
  lbImg.src = item.file;
  $('#lb-title').textContent = document.body.classList.contains('blind') ? '' : item.title;
  $('#lb-src').textContent = document.body.classList.contains('blind') ? '' : item.source;
  $('#lb-note').textContent = document.body.classList.contains('blind') ? '' : (item.note || '');
  setZoom('fit');
  lb.hidden = false;
}

function setZoom(z) {
  document.querySelectorAll('.lb-zoom button').forEach(b => b.classList.toggle('on', b.dataset.z === z));
  if (z === 'fit') {
    lbStage.classList.remove('zoomed');
    lbImg.style.width = '';
  } else {
    lbStage.classList.add('zoomed');
    lbImg.style.width = (lbImg.naturalWidth * Number(z)) + 'px';
  }
}

document.querySelectorAll('.lb-zoom button').forEach(b =>
  b.addEventListener('click', () => setZoom(b.dataset.z)));
document.querySelector('.lb-close').addEventListener('click', () => lb.hidden = true);
lb.addEventListener('click', e => { if (e.target === lb || e.target === lbStage) lb.hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });

// THE HOLLOW — main game engine.

(function () {
  const story    = window.STORY;
  const Save     = window.Save;
  const Music    = window.Music;
  const UI       = window.UI;

  // ---------- ITEM / MEMORY DISPLAY NAMES ----------
  const ITEM_NAMES = {
    nightlight:    'a brass nightlight',
    locket:        'a silver locket',
    ring:          'a wedding ring',
    vhs:           'a VHS tape',
    journal:       'journal pages',
    cellar_key:    'an iron key',
    threshold_key: 'a small brass key',
    photo:         'a photograph',
  };
  const MEMORY_NAMES = {
    car:      'the rain on the road',
    hospital: 'the hospital, from above',
    death:    'the silence after',
  };

  // ---------- STATE ----------
  let state    = Save.loadState();
  let settings = Save.loadSettings();
  let activeTypewriter = null;

  // Apply settings on load
  Music.setMuted(!settings.music);
  Music.setVolume(settings.volume);

  // ---------- ELEMENTS ----------
  const introScreen   = document.getElementById('intro-screen');
  const introEye      = document.getElementById('intro-eye');
  const introPrompt   = document.getElementById('intro-prompt');
  const titleBg       = document.getElementById('title-bg');
  const btnNew        = document.getElementById('btn-new');
  const btnContinue   = document.getElementById('btn-continue');
  const btnHistoryT   = document.getElementById('btn-history-title');
  const btnHistory    = document.getElementById('btn-history');
  const btnSettings   = document.getElementById('btn-settings');
  const btnReset      = document.getElementById('btn-reset');
  const soundToggle   = document.getElementById('sound-toggle');
  const volumeSlider  = document.getElementById('volume-slider');
  const textSpeedSel  = document.getElementById('text-speed');

  const roomImage     = document.getElementById('room-image');
  const roomTitle     = document.getElementById('room-title');
  const roomText      = document.getElementById('room-text');
  const choicesEl     = document.getElementById('choices');
  const inventoryEl   = document.getElementById('inventory-strip');
  const textWrap      = document.querySelector('.text-wrap');

  const endingImage   = document.getElementById('ending-image');
  const endingKindEl  = document.getElementById('ending-kind');
  const endingTitle   = document.getElementById('ending-title');
  const endingText    = document.getElementById('ending-text');
  const btnEndRestart = document.getElementById('btn-ending-restart');
  const btnEndHistory = document.getElementById('btn-ending-history');

  const historyList   = document.getElementById('history-list');
  const historySummary= document.getElementById('history-summary');

  // ---------- INIT SETTINGS UI ----------
  function syncSettingsUI() {
    soundToggle.setAttribute('aria-pressed', settings.music ? 'true' : 'false');
    volumeSlider.value = Math.round(settings.volume * 100);
    textSpeedSel.value = settings.textSpeed;
  }
  syncSettingsUI();

  function persistSettings() { Save.saveSettings(settings); }

  soundToggle.addEventListener('click', () => {
    settings.music = !settings.music;
    syncSettingsUI();
    persistSettings();
    Music.setMuted(!settings.music);
    if (settings.music) Music.primeOnGesture();
  });
  volumeSlider.addEventListener('input', () => {
    settings.volume = parseInt(volumeSlider.value, 10) / 100;
    persistSettings();
    Music.setVolume(settings.volume);
  });
  textSpeedSel.addEventListener('change', () => {
    settings.textSpeed = textSpeedSel.value;
    persistSettings();
  });
  btnSettings.addEventListener('click', () => {
    UI.openPanel('settings-panel');
    Music.primeOnGesture();
  });
  btnHistory.addEventListener('click', () => {
    renderHistory();
    UI.openPanel('history-panel');
  });
  btnHistoryT.addEventListener('click', () => {
    renderHistory();
    UI.openPanel('history-panel');
  });
  btnReset.addEventListener('click', async () => {
    const ok = await UI.popupConfirm({
      title: 'Reset progress?',
      body:  'This wipes your current run. Endings you have collected are kept.',
      confirmLabel: 'Reset',
      cancelLabel:  'Keep playing',
    });
    if (!ok) return;
    Save.clearState();
    state = Save.freshState();
    Save.saveState(state);
    UI.closePanel('settings-panel');
    showTitle();
  });

  // ---------- INTRO ----------
  function startIntro() {
    UI.showScreen('intro-screen');
    introEye.dataset.open = '0';
    let taps = 0;
    const targetTaps = 7;
    const phases = [
      'tap to wake',
      'again',
      'again…',
      'almost',
      'one more',
      'open your eyes',
      '',
    ];

    function onTap() {
      taps += 1;
      Music.primeOnGesture();
      // brighten via eyelid stages — first tap nudges eye open, last tap snaps it wide
      const stage = Math.min(3, Math.ceil((taps / targetTaps) * 3));
      introEye.dataset.open = String(stage);
      // small jolt
      introEye.animate(
        [{ transform: 'translate(0,0)' }, { transform: 'translate(0,-2px)' }, { transform: 'translate(0,0)' }],
        { duration: 140 }
      );
      introPrompt.textContent = phases[Math.min(taps, phases.length - 1)];
      if (taps >= targetTaps) {
        introScreen.removeEventListener('click', onTap);
        introScreen.style.cursor = 'default';
        // full flash
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;z-index:1000;pointer-events:none;transition:opacity .2s;';
        document.body.appendChild(flash);
        requestAnimationFrame(() => { flash.style.opacity = '.85'; });
        setTimeout(() => {
          flash.style.opacity = '0';
          setTimeout(() => flash.remove(), 600);
          settings.introSeen = true;
          persistSettings();
          showTitle(false);
        }, 350);
      }
    }
    introScreen.addEventListener('click', onTap);
  }

  // ---------- TITLE ----------
  function showTitle() {
    UI.showScreen('title-screen');
    titleBg.style.backgroundImage = "url('images/title.png')";
    const finished = !!(state.history && state.history.some(h => h.kind === 'ending'));
    btnContinue.hidden = !Save.hasSavedRun() || finished;
    btnHistoryT.hidden = !(state.history && state.history.length > 0);
  }

  btnNew.addEventListener('click', () => {
    if (Save.hasSavedRun() && !state.history.some(h => h.kind === 'ending')) {
      UI.popupConfirm({
        title: 'Start a new walk?',
        body:  'Your current path will be lost.',
        confirmLabel: 'Begin again',
        cancelLabel:  'Continue current',
      }).then(ok => {
        if (!ok) { enterRoom(state.currentRoom); return; }
        state = Save.freshState();
        Save.saveState(state);
        enterRoom(state.currentRoom);
      });
    } else {
      state = Save.freshState();
      Save.saveState(state);
      enterRoom(state.currentRoom);
    }
    Music.primeOnGesture();
  });
  btnContinue.addEventListener('click', () => {
    Music.primeOnGesture();
    enterRoom(state.currentRoom);
  });

  // ---------- ROOM RENDER ----------
  function enterRoom(roomId) {
    const room = story.rooms[roomId];
    if (!room) {
      console.warn('Unknown room', roomId);
      return;
    }

    // Record arrival in history BEFORE applying onEnter so events read in order:
    //   choice → arrive at room → discover thing inside it.
    // Skip the room entry for endings — showEnding() pushes its own.
    state.currentRoom = roomId;
    if (room.type !== 'ending') pushHistoryRoom(room);

    if (room.onEnter) {
      const e = room.onEnter;
      if (e.addItem && !state.inventory.includes(e.addItem)) {
        state.inventory.push(e.addItem);
        UI.toast(ITEM_NAMES[e.addItem] || e.addItem, 'item');
        pushEvent(`Found ${ITEM_NAMES[e.addItem] || e.addItem}.`);
      }
      if (e.addMemory && !state.memories.includes(e.addMemory)) {
        state.memories.push(e.addMemory);
        UI.toast(MEMORY_NAMES[e.addMemory] || e.addMemory, 'memory');
        pushEvent(`Remembered ${MEMORY_NAMES[e.addMemory] || e.addMemory}.`);
      }
      if (e.setFlag) state.flags[e.setFlag] = true;
    }

    if (room.type === 'ending') {
      if (window.Music && typeof Music.playEndingFor === 'function') {
        Music.playEndingFor(roomId);
      }
      showEnding(room);
      Save.recordEnding(room.ending);
      return;
    }

    Save.saveState(state);

    UI.showScreen('game-screen');
    renderRoom(room);
  }

  function renderRoom(room) {
    // Scroll text back to top
    if (textWrap) textWrap.scrollTop = 0;

    // Image fade-out, then swap, then fade-in
    roomImage.classList.remove('shown');
    roomTitle.classList.remove('shown');

    // Stop any in-flight typewriter
    if (activeTypewriter) { activeTypewriter.skip(); activeTypewriter = null; }

    const newSrc = room.image ? `images/${room.image}` : '';
    if (newSrc) {
      // preload
      const img = new Image();
      img.onload = () => {
        roomImage.src = newSrc;
        // tiny tick so transition runs
        requestAnimationFrame(() => { roomImage.classList.add('shown'); });
      };
      img.onerror = () => {
        // missing image — show nothing but don't break
        roomImage.removeAttribute('src');
      };
      img.src = newSrc;
    } else {
      roomImage.removeAttribute('src');
    }

    // Title
    roomTitle.textContent = room.title || '';
    setTimeout(() => roomTitle.classList.add('shown'), 200);

    // Inventory strip
    renderInventory();

    // Choices appear AFTER the text finishes typing
    choicesEl.innerHTML = '';
    activeTypewriter = UI.typewrite(roomText, room.desc || '', settings.textSpeed);
    activeTypewriter.promise.then(() => {
      activeTypewriter = null;
      renderChoices(room);
    });

    // Tap text area to skip typewriter
    const onSkip = (ev) => {
      if (ev.target.closest('.choices')) return; // don't steal choice clicks
      if (activeTypewriter) { activeTypewriter.skip(); }
    };
    textWrap.onclick = onSkip;
  }

  function renderInventory() {
    const items = state.inventory || [];
    const memories = state.memories || [];
    if (items.length === 0 && memories.length === 0) {
      inventoryEl.hidden = true;
      inventoryEl.innerHTML = '';
      return;
    }
    inventoryEl.hidden = false;
    inventoryEl.innerHTML = '';
    items.forEach(it => {
      const span = document.createElement('span');
      span.className = 'pill';
      span.textContent = ITEM_NAMES[it] || it;
      inventoryEl.appendChild(span);
    });
    memories.forEach(m => {
      const span = document.createElement('span');
      span.className = 'pill memory';
      span.textContent = MEMORY_NAMES[m] || m;
      inventoryEl.appendChild(span);
    });
  }

  function renderChoices(room) {
    choicesEl.innerHTML = '';
    const visible = (room.choices || []).filter(c => !c.condition || c.condition(state));
    visible.forEach((c, idx) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = c.label;
      b.style.opacity = '0';
      b.style.transform = 'translateY(6px)';
      b.style.transition = 'opacity .35s ease, transform .35s ease, background .2s ease, border-color .2s ease';
      b.addEventListener('click', () => {
        // Disable all choices to prevent double-tap during transition
        choicesEl.querySelectorAll('button').forEach(x => x.disabled = true);
        pushChoice(c.label);
        // Quick fade between rooms
        document.getElementById('game-screen').classList.add('fade-out');
        setTimeout(() => {
          document.getElementById('game-screen').classList.remove('fade-out');
          enterRoom(c.target);
        }, 280);
      });
      choicesEl.appendChild(b);
      // Stagger reveal
      setTimeout(() => {
        b.style.opacity = '1';
        b.style.transform = 'translateY(0)';
      }, 80 + idx * 70);
    });
    // Visible-but-no-choices safety: should never happen in non-ending rooms
    if (visible.length === 0) {
      const note = document.createElement('p');
      note.className = 'muted small';
      note.style.textAlign = 'center';
      note.textContent = 'There is nowhere left to go.';
      choicesEl.appendChild(note);
    }
  }

  // ---------- HISTORY ----------
  function pushHistoryRoom(room) {
    if (!state.history) state.history = [];
    const last = state.history[state.history.length - 1];
    if (last && last.kind === 'room' && last.room === room.title) return;
    state.history.push({ kind: 'room', room: room.title, t: Date.now() });
  }
  function pushChoice(label) {
    state.history.push({ kind: 'choice', text: label, t: Date.now() });
    Save.saveState(state);
  }
  function pushEvent(text) {
    state.history.push({ kind: 'event', text, t: Date.now() });
    Save.saveState(state);
  }

  function renderHistory() {
    historyList.innerHTML = '';
    historySummary.textContent = '';
    if (!state.history || state.history.length === 0) return;

    const items = state.inventory.length;
    const mems  = state.memories.length;
    const meta  = Save.loadMeta();
    const endingsSeen = Object.keys(meta.endingsSeen || {}).length;
    historySummary.textContent =
      `${items} ${items === 1 ? 'item' : 'items'} · ${mems} ${mems === 1 ? 'memory' : 'memories'} · ${endingsSeen} ${endingsSeen === 1 ? 'ending' : 'endings'} discovered`;

    let lastRoom = null;
    state.history.forEach(h => {
      if (h.kind === 'room') {
        const li = document.createElement('li');
        const r = document.createElement('span');
        r.className = 'room-name';
        r.textContent = h.room;
        li.appendChild(r);
        const desc = document.createElement('span');
        desc.textContent = 'You arrived.';
        li.appendChild(desc);
        historyList.appendChild(li);
        lastRoom = h.room;
      } else if (h.kind === 'choice') {
        const li = document.createElement('li');
        const r = document.createElement('span');
        r.className = 'room-name';
        r.textContent = lastRoom || '';
        li.appendChild(r);
        const desc = document.createElement('span');
        desc.textContent = `→ ${h.text}`;
        li.appendChild(desc);
        historyList.appendChild(li);
      } else if (h.kind === 'event') {
        const li = document.createElement('li');
        li.className = 'event-item';
        const r = document.createElement('span');
        r.className = 'room-name';
        r.textContent = '· memento ·';
        li.appendChild(r);
        const desc = document.createElement('span');
        desc.textContent = h.text;
        li.appendChild(desc);
        historyList.appendChild(li);
      } else if (h.kind === 'ending') {
        const li = document.createElement('li');
        li.className = 'event-item';
        const r = document.createElement('span');
        r.className = 'room-name';
        r.textContent = '· the end ·';
        li.appendChild(r);
        const desc = document.createElement('span');
        desc.textContent = h.text;
        li.appendChild(desc);
        historyList.appendChild(li);
      }
    });
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      const body = historyList.parentElement;
      body.scrollTop = body.scrollHeight;
    });
  }

  // ---------- ENDING ----------
  function showEnding(room) {
    UI.showScreen('ending-screen');
    const tag = (story.endings && story.endings[room.ending]) || { title: 'The End', kind: 'neutral' };
    endingKindEl.className = 'ending-kind ' + tag.kind;
    endingKindEl.textContent =
      tag.kind === 'good'    ? 'an ending — peace'
    : tag.kind === 'bad'     ? 'an ending — horror'
    :                          'an ending — quiet';
    endingTitle.textContent = tag.title;
    endingText.textContent  = ''; // will type out

    // image
    endingImage.classList.remove('shown');
    if (room.image) {
      const img = new Image();
      img.onload = () => {
        endingImage.src = `images/${room.image}`;
        requestAnimationFrame(() => endingImage.classList.add('shown'));
      };
      img.onerror = () => endingImage.removeAttribute('src');
      img.src = `images/${room.image}`;
    } else {
      endingImage.removeAttribute('src');
    }

    // Record the ending in history (replaces the would-be room entry).
    state.history.push({ kind: 'ending', text: `${tag.title}.`, room: tag.title, t: Date.now() });
    Save.saveState(state);

    if (activeTypewriter) { activeTypewriter.skip(); activeTypewriter = null; }
    activeTypewriter = UI.typewrite(endingText, room.desc || '', settings.textSpeed);
  }

  btnEndRestart.addEventListener('click', () => {
    state = Save.freshState();
    Save.saveState(state);
    enterRoom(state.currentRoom);
  });
  btnEndHistory.addEventListener('click', () => {
    renderHistory();
    UI.openPanel('history-panel');
  });

  // Skip ending typewriter on tap
  document.querySelector('.ending-content').addEventListener('click', (ev) => {
    if (ev.target.closest('button')) return;
    if (activeTypewriter) activeTypewriter.skip();
  });

  // ---------- TOP-RIGHT VISIBILITY ----------
  function updateTopButtons() {
    btnHistory.hidden = !(state.history && state.history.length > 0);
  }
  // Cheap poll — toggles visibility of the history icon as the run progresses.
  setInterval(updateTopButtons, 1500);

  // ---------- BOOT ----------
  function boot() {
    // Always show intro on first load (cheap and atmospheric);
    // skip on subsequent loads when user already has a save.
    if (!settings.introSeen) {
      startIntro();
    } else {
      showTitle();
    }
  }
  boot();
})();

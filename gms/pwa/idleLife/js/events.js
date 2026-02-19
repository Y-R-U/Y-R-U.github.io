// ============================================================
// LIFE IDLE - Random Events System
// Events scroll across the screen; tap to claim
// ============================================================

const Events = (() => {
  let eventTimer = null;
  let scrollTimer = null;
  let currentEvent = null;

  const banner = () => document.getElementById('event-banner');
  const bannerText = () => document.getElementById('event-text');

  function pickEvent() {
    const rand = Math.random();
    let cumulative = 0;
    for (const ev of RANDOM_EVENTS) {
      cumulative += ev.probability;
      if (rand < cumulative) return ev;
    }
    return RANDOM_EVENTS[0];
  }

  function showEvent() {
    if (currentEvent) return; // already active
    currentEvent = pickEvent();
    const b = banner();
    const bt = bannerText();

    bt.textContent = currentEvent.label;
    bt.style.color = currentEvent.color || '#FFD700';
    b.classList.remove('hidden');
    b.classList.add('event-scroll');

    // Auto-dismiss after 15 seconds if not tapped
    scrollTimer = setTimeout(() => {
      dismissEvent(false);
    }, 15000);
  }

  function dismissEvent(claimed) {
    clearTimeout(scrollTimer);
    const b = banner();
    b.classList.add('hidden');
    b.classList.remove('event-scroll');

    if (claimed && currentEvent) {
      Game.applyEvent(currentEvent);
    }
    currentEvent = null;
  }

  function claimEvent() {
    if (!currentEvent) return;
    dismissEvent(true);
  }

  function scheduleNext() {
    // Events appear every 90–210 seconds randomly
    const delay = (90 + Math.random() * 120) * 1000;
    eventTimer = setTimeout(() => {
      showEvent();
      scheduleNext();
    }, delay);
  }

  function start() {
    // First event in 30–90s so players see it early
    const firstDelay = (30 + Math.random() * 60) * 1000;
    eventTimer = setTimeout(() => {
      showEvent();
      scheduleNext();
    }, firstDelay);

    banner().addEventListener('click', claimEvent);
    banner().addEventListener('touchend', (e) => { e.preventDefault(); claimEvent(); });
  }

  function stop() {
    clearTimeout(eventTimer);
    clearTimeout(scrollTimer);
  }

  return { start, stop, claimEvent };
})();

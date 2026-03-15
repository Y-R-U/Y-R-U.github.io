/**
 * story.js - Intro story sequence with video support
 *
 * Story popups appear BELOW the scene area so the player can
 * see any video playing in the scene while reading the text.
 *
 * Videos tagged on a message start looping in the scene-area
 * bg-video element when that message is shown (not after clicking
 * Continue). They keep looping until the next video replaces them.
 *
 * Background theme videos (video/theme0-10.mp4) are handled by app.js
 * and resume automatically when the story ends.
 */

const Story = (() => {

  const MESSAGES = [
    {
      title: 'The Frontier Awaits',
      text: "The year is 1849. You've just arrived at a dusty frontier town with nothing but the clothes on your back and big dreams of fortune.",
      icon: '\uD83C\uDF05',
      video: 'story0' // optional intro video
    },
    {
      title: 'Starting From Nothing',
      text: "You're an early pioneer with big dreams, but no cash. The townsfolk eye you with suspicion \u2014 another drifter chasing gold.",
      icon: '\uD83E\uDD20',
      video: 'story1'
    },
    {
      title: 'Odd Jobs',
      text: "Start by doing odd jobs \u2014 tap to muck out stables, haul supplies, and scrape together your first few dollars.",
      icon: '\uD83D\uDCAA',
      video: 'story2'
    },
    {
      title: 'Build Your Empire',
      text: "Once you've saved enough, hire workers and start building your business empire. From a humble stable to an oil derrick \u2014 the frontier is yours for the taking!",
      icon: '\uD83C\uDFDB\uFE0F',
      video: 'story3'
    },
    {
      title: 'Keep Your Eyes Open',
      text: "Watch for tumbleweeds, gold nuggets, and other lucky breaks rolling through town. Tap them quick for powerful bonuses!",
      icon: '\uD83C\uDF1F'
    }
  ];

  let overlay = null;
  let currentIndex = 0;
  let active = false;

  function start() {
    const state = GameState.getState();
    if (state.storyShown) return;

    active = true;
    currentIndex = 0;
    createOverlay();
    showMessage(currentIndex);
  }

  function isActive() {
    return active;
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'story-overlay';
    overlay.id = 'story-overlay';
    overlay.innerHTML = `
      <div class="story-box" id="story-box">
        <div class="story-icon" id="story-icon"></div>
        <div class="story-title" id="story-title"></div>
        <div class="story-text" id="story-text"></div>
        <button class="story-btn" id="story-btn">Continue</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('story-btn').addEventListener('click', advance);
  }

  function showMessage(index) {
    if (index >= MESSAGES.length) {
      finish();
      return;
    }

    const msg = MESSAGES[index];

    document.getElementById('story-icon').textContent = msg.icon;
    document.getElementById('story-title').textContent = msg.title;
    document.getElementById('story-text').textContent = msg.text;

    // If this message has a video, play it looping in the scene area
    if (msg.video) {
      App.playSceneVideo(msg.video);
    }
  }

  function advance() {
    currentIndex++;
    showMessage(currentIndex);
  }

  function finish() {
    active = false;

    // Mark story as shown
    const state = GameState.getState();
    state.storyShown = true;
    GameState.save();

    // Clear any story video and hand control back to theme system
    App.clearStoryVideo();

    // Remove overlay with fade
    if (overlay) {
      overlay.classList.add('story-fade-out');
      setTimeout(() => {
        overlay.remove();
        overlay = null;
      }, 500);
    }
  }

  return { start, isActive };
})();

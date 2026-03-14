/**
 * story.js - Intro story sequence with optional video support
 *
 * Story messages are shown as popup dialogs at game start.
 * Between messages, if video/story{N}.mp4 (or .webm) exists,
 * the video is played in the scene area before continuing.
 *
 * Background theme videos (video/theme0-10.mp4) are handled by app.js.
 */

const Story = (() => {

  const MESSAGES = [
    {
      title: 'The Frontier Awaits',
      text: "The year is 1849. You've just arrived at a dusty frontier town with nothing but the clothes on your back and big dreams of fortune.",
      icon: '\uD83C\uDF05'
    },
    {
      title: 'Starting From Nothing',
      text: "You're an early pioneer with big dreams, but no cash. The townsfolk eye you with suspicion \u2014 another drifter chasing gold.",
      icon: '\uD83E\uDD20',
      video: 'story1' // Will check for video/story1.mp4 or .webm
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
  let sceneVideo = null;

  function start() {
    const state = GameState.getState();
    // Only show once per save
    if (state.storyShown) return;

    currentIndex = 0;
    createOverlay();
    showMessage(currentIndex);
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
      <video class="story-video hidden" id="story-video" playsinline webkit-playsinline></video>
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
    const box = document.getElementById('story-box');
    const video = document.getElementById('story-video');

    // Show the dialog box, hide video
    box.classList.remove('hidden');
    video.classList.add('hidden');
    video.pause();
    video.removeAttribute('src');

    document.getElementById('story-icon').textContent = msg.icon;
    document.getElementById('story-title').textContent = msg.title;
    document.getElementById('story-text').textContent = msg.text;
  }

  function advance() {
    const msg = MESSAGES[currentIndex];

    // Check if this message has a video to play before moving to next
    if (msg.video) {
      tryPlayVideo(msg.video, () => {
        currentIndex++;
        showMessage(currentIndex);
      });
    } else {
      currentIndex++;
      showMessage(currentIndex);
    }
  }

  function tryPlayVideo(videoName, onComplete) {
    const basePath = 'video/' + videoName;

    // Try mp4 first, then webm
    tryVideoSrc(basePath + '.mp4').then(src => {
      if (src) return src;
      return tryVideoSrc(basePath + '.webm');
    }).then(src => {
      if (!src) {
        // No video found, just continue
        onComplete();
        return;
      }

      const box = document.getElementById('story-box');
      const video = document.getElementById('story-video');

      // Hide dialog, show video
      box.classList.add('hidden');
      video.classList.remove('hidden');
      video.src = src;
      video.play().catch(() => {
        // Autoplay blocked, skip video
        onComplete();
        return;
      });

      video.onended = () => {
        onComplete();
      };

      // Also allow tap/click to skip video
      video.onclick = () => {
        video.pause();
        onComplete();
      };
    });
  }

  function tryVideoSrc(src) {
    return new Promise((resolve) => {
      const testVideo = document.createElement('video');
      testVideo.preload = 'metadata';
      testVideo.onloadedmetadata = () => resolve(src);
      testVideo.onerror = () => resolve(null);
      testVideo.src = src;
    });
  }

  function finish() {
    // Mark story as shown
    const state = GameState.getState();
    state.storyShown = true;
    GameState.save();

    // Remove overlay with fade
    if (overlay) {
      overlay.classList.add('story-fade-out');
      setTimeout(() => {
        overlay.remove();
        overlay = null;
      }, 500);
    }
  }

  return { start };
})();

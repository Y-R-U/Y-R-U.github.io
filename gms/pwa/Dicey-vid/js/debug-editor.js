/* ============================================
   DICEY-VID - Debug Media Editor
   ============================================ */

const DiceyDebugEditor = {
    enabled: false,
    editMode: false,
    button: null,
    progressTimer: null,

    init() {
        const params = new URLSearchParams(window.location.search);
        this.enabled = params.has('debug') || params.get('debug') === 'true';
        if (!this.enabled) return;
        document.body.classList.add('debug-available');
        this.createButton();
    },

    createButton() {
        const hud = document.getElementById('top-hud');
        const settings = document.getElementById('btn-settings');
        if (!hud || !settings || this.button) return;

        this.button = document.createElement('button');
        this.button.id = 'btn-media-debug';
        this.button.className = 'btn-icon-only';
        this.button.setAttribute('aria-label', 'Toggle media editor');
        this.button.innerHTML = `
            <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 5h16v10H4z"/>
                <path d="M8 19h8"/>
                <path d="M12 15v4"/>
                <path d="M7 9l3 3 3-5 4 6"/>
            </svg>
        `;
        settings.parentNode.insertBefore(this.button, settings);
        this.button.addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.toggleEditMode();
        });
    },

    toggleEditMode(force) {
        this.editMode = typeof force === 'boolean' ? force : !this.editMode;
        document.body.classList.toggle('media-debug-editing', this.editMode);
        if (this.button) this.button.classList.toggle('active', this.editMode);
        UI.showToast(this.editMode ? 'Media edit mode: tap any board space.' : 'Media edit mode off.');
    },

    handleSpaceClick(index, gameState) {
        if (!this.enabled || !this.editMode) return false;
        this.openSpotEditor(index, gameState);
        return true;
    },

    openSpotEditor(index, gameState) {
        const spot = DiceyMedia.getSpot(index);
        if (!spot) return;
        const space = Utils.BOARD_SPACES[index];
        const skill = Utils.getSkillForSpace(index);
        const owner = gameState?.skills?.[index]?.owner;
        const ownerText = owner !== null && owner !== undefined ? `Owned by ${Utils.PLAYER_NAMES[owner]}` : 'Unowned';
        const typeText = skill ? `${skill.type} skill` : space.type;

        const html = `
            <div class="panel media-editor-panel">
                <div class="media-editor-head">
                    <div>
                        <div class="media-editor-kicker">Space ${index} / ${this.escape(typeText)} / ${this.escape(ownerText)}</div>
                        <h2>${this.escape(spot.label)}</h2>
                    </div>
                    <button class="panel-close" aria-label="Close">&times;</button>
                </div>
                <div class="media-editor-body">
                    <section class="media-editor-section">
                        <div class="media-preview-frame ${this.escape(spot.orientation)}">
                            <img id="editor-image-preview" src="${this.escapeAttr(DiceyMedia.getImageSrc(index))}" alt="${this.escapeAttr(spot.label)}">
                        </div>
                        <label class="media-editor-label" for="editor-image-prompt">Image prompt</label>
                        <textarea id="editor-image-prompt" spellcheck="false">${this.escape(spot.imagePrompt || '')}</textarea>
                        <div class="media-editor-actions">
                            <button class="btn btn-primary" id="btn-reroll-image">Re-roll Image</button>
                            <button class="btn btn-secondary" id="btn-save-prompts">Save Current</button>
                        </div>
                    </section>
                    <section class="media-editor-section">
                        <div class="media-preview-frame ${this.escape(spot.orientation)}">
                            <video id="editor-video-preview" src="${this.escapeAttr(DiceyMedia.getVideoSrc(index))}" poster="${this.escapeAttr(DiceyMedia.getImageSrc(index))}" muted loop playsinline controls autoplay></video>
                        </div>
                        <label class="media-editor-label" for="editor-video-prompt">Video prompt</label>
                        <textarea id="editor-video-prompt" spellcheck="false">${this.escape(spot.videoPrompt || '')}</textarea>
                        <div class="media-editor-actions">
                            <button class="btn btn-primary" id="btn-reroll-video">Re-roll Video</button>
                            <button class="btn btn-secondary" id="btn-close-editor">Done</button>
                        </div>
                    </section>
                </div>
                <div class="media-progress hidden" id="media-editor-progress" aria-live="polite">
                    <div class="media-progress-meta">
                        <span id="media-progress-label">Preparing...</span>
                        <span id="media-progress-time">0:00 / ~0:00</span>
                    </div>
                    <div class="media-progress-track">
                        <div class="media-progress-fill" id="media-progress-fill"></div>
                    </div>
                </div>
                <div class="media-editor-status" id="media-editor-status">
                    ${this.escape(spot.status || 'Ready.')}
                </div>
            </div>`;
        const panel = UI.showPanel(html, { modal: true });
        panel.classList.add('media-editor-shell');
        panel.querySelector('.panel-close').addEventListener('click', () => {
            panel.classList.remove('media-editor-shell');
        });

        const imagePrompt = panel.querySelector('#editor-image-prompt');
        const videoPrompt = panel.querySelector('#editor-video-prompt');
        const imagePreview = panel.querySelector('#editor-image-preview');
        const videoPreview = panel.querySelector('#editor-video-preview');
        const status = panel.querySelector('#media-editor-status');
        const progress = panel.querySelector('#media-editor-progress');
        const save = () => {
            DiceyMedia.saveSpotPrompts(index, imagePrompt.value.trim(), videoPrompt.value.trim());
            BoardRenderer.refreshSpace(index);
            status.textContent = 'Saved. The board is using the latest prompt data.';
        };

        panel.querySelector('#btn-save-prompts').addEventListener('click', () => {
            AudioManager.playSfx('click');
            save();
        });
        panel.querySelector('#btn-close-editor').addEventListener('click', () => {
            AudioManager.playSfx('click');
            save();
            panel.classList.remove('media-editor-shell');
            UI.hidePanel();
        });
        panel.querySelector('#btn-reroll-image').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            this.setBusy(button, status, 'Generating image. If the helper is running, this may take a while.');
            this.startProgress('image', spot, progress, status);
            try {
                const result = await DiceyMedia.regenerateImage(index, imagePrompt.value.trim());
                imagePreview.src = result.src;
                videoPreview.poster = result.src;
                BoardRenderer.refreshSpace(index);
                this.finishProgress(progress, result.durationSecs, result.estimatedNextSecs);
                status.textContent = this.resultMessage('Image', result);
            } catch (error) {
                this.stopProgress(progress);
                status.textContent = `Image failed: ${error.message}`;
            } finally {
                this.clearBusy(button);
            }
        });
        panel.querySelector('#btn-reroll-video').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            DiceyMedia.saveSpotPrompts(index, imagePrompt.value.trim(), videoPrompt.value.trim());
            this.setBusy(button, status, 'Generating video from the current image. If LTX is running, this may take a while.');
            this.startProgress('video', spot, progress, status);
            try {
                const result = await DiceyMedia.regenerateVideo(index, videoPrompt.value.trim());
                videoPreview.pause();
                videoPreview.src = result.src;
                videoPreview.poster = DiceyMedia.getImageSrc(index);
                videoPreview.load();
                videoPreview.play().catch(() => {});
                BoardRenderer.refreshSpace(index);
                this.finishProgress(progress, result.durationSecs, result.estimatedNextSecs);
                status.textContent = this.resultMessage('Video', result);
            } catch (error) {
                this.stopProgress(progress);
                status.textContent = `Video failed: ${error.message}`;
            } finally {
                this.clearBusy(button);
            }
        });

        videoPreview.play().catch(() => {});
    },

    setBusy(button, status, message) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = 'Working...';
        status.textContent = message;
    },

    clearBusy(button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Done';
    },

    startProgress(kind, spot, progress, status) {
        this.stopProgress(progress);
        if (!progress) return;
        const estimate = DiceyMedia.getGenerationEstimate(kind, spot);
        const label = progress.querySelector('#media-progress-label');
        const time = progress.querySelector('#media-progress-time');
        const fill = progress.querySelector('#media-progress-fill');
        const started = performance.now();
        const title = kind === 'video' ? 'Video generation' : 'Image generation';
        progress.classList.remove('hidden');
        progress.classList.remove('complete');
        fill.style.width = '0%';
        status.textContent = `${title} started. Estimated ${this.formatDuration(estimate)} from last run + 5s buffer.`;

        const tick = () => {
            const elapsed = Math.max(0, (performance.now() - started) / 1000);
            const pct = Math.min(98, (elapsed / estimate) * 100);
            fill.style.width = `${pct.toFixed(1)}%`;
            label.textContent = elapsed > estimate ? `${title}: still working` : title;
            time.textContent = `${this.formatDuration(elapsed)} / ~${this.formatDuration(estimate)}`;
        };
        tick();
        this.progressTimer = window.setInterval(tick, 250);
    },

    finishProgress(progress, durationSecs, estimatedNextSecs) {
        this.stopProgress(progress, false);
        if (!progress) return;
        const label = progress.querySelector('#media-progress-label');
        const time = progress.querySelector('#media-progress-time');
        const fill = progress.querySelector('#media-progress-fill');
        progress.classList.remove('hidden');
        progress.classList.add('complete');
        fill.style.width = '100%';
        const duration = Number(durationSecs);
        const next = Number(estimatedNextSecs);
        label.textContent = 'Generation complete';
        time.textContent = Number.isFinite(duration)
            ? `${this.formatDuration(duration)} done${Number.isFinite(next) ? ` / next ~${this.formatDuration(next)}` : ''}`
            : 'Done';
    },

    stopProgress(progress, hide = true) {
        if (this.progressTimer) {
            window.clearInterval(this.progressTimer);
            this.progressTimer = null;
        }
        if (progress && hide) progress.classList.add('hidden');
    },

    resultMessage(label, result) {
        const duration = Number(result.durationSecs);
        const next = Number(result.estimatedNextSecs);
        const base = result.message || `${label} updated via ${result.mode}.`;
        if (!Number.isFinite(duration)) return base;
        return `${base} Took ${this.formatDuration(duration)}.${Number.isFinite(next) ? ` Next estimate ~${this.formatDuration(next)}.` : ''}`;
    },

    formatDuration(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        const mins = Math.floor(total / 60);
        const secs = String(total % 60).padStart(2, '0');
        return `${mins}:${secs}`;
    },

    escape(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    escapeAttr(value) {
        return this.escape(value).replace(/`/g, '&#096;');
    }
};

window.DiceyDebugEditor = DiceyDebugEditor;

/* ============================================
   DICEY-VID - Spot Media Manifest + Helpers
   ============================================ */

const DiceyMedia = {
    manifest: null,
    spots: [],
    maxActiveVideos: 4,
    storageKey: 'diceyVidMediaOverridesV1',
    timingKey: 'diceyVidGenerationTimingsV1',
    helperBase: 'http://127.0.0.1:8789/Dicey-vid',
    helperAvailable: false,
    overrides: {},

    async init() {
        this.configureHelperUrl();
        this.loadOverrides();
        try {
            const cacheKey = this.isDebugUrl() ? `?t=${Date.now()}` : '';
            const response = await fetch(`media/manifest.json${cacheKey}`);
            if (!response.ok) throw new Error(`manifest ${response.status}`);
            this.manifest = await response.json();
            this.spots = Array.isArray(this.manifest.spots) ? this.manifest.spots : [];
            this.maxActiveVideos = Number(this.manifest?.limits?.maxActiveVideos) || 4;
        } catch (error) {
            console.warn('DiceyMedia manifest failed, using fallback', error);
            this.manifest = { version: 0, spots: [] };
            this.spots = this.buildFallbackSpots();
        }
        await this.detectHelperBase();
        this.applyOverrides();
    },

    configureHelperUrl() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get('helper');
        if (fromUrl) {
            this.helperBase = fromUrl.replace(/\/$/, '');
            try {
                localStorage.setItem('diceyVidHelperBase', this.helperBase);
            } catch (error) {}
            return;
        }
        try {
            const saved = localStorage.getItem('diceyVidHelperBase');
            if (saved) this.helperBase = saved.replace(/\/$/, '');
        } catch (error) {}
    },

    async detectHelperBase() {
        const params = new URLSearchParams(window.location.search);
        const explicit = params.get('helper');
        const saved = (() => {
            try { return localStorage.getItem('diceyVidHelperBase'); } catch (error) { return ''; }
        })();
        const pageHost = window.location.hostname || '127.0.0.1';
        const hosts = [];
        const addHost = (host) => {
            if (host && !hosts.includes(host)) hosts.push(host);
        };
        addHost(pageHost);
        addHost('127.0.0.1');
        addHost('localhost');
        const ports = [8789, 8790, 8791, 8792, 8788];
        const candidates = [];
        const addCandidate = (base) => {
            if (base && !candidates.includes(base)) candidates.push(base.replace(/\/$/, ''));
        };
        addCandidate(explicit);
        addCandidate(saved);
        addCandidate(this.helperBase);
        hosts.forEach(host => ports.forEach(port => addCandidate(`http://${host}:${port}/Dicey-vid`)));

        for (const base of candidates) {
            try {
                const response = await fetch(`${base}/api/status`, { cache: 'no-store' });
                if (!response.ok) continue;
                const data = await response.json();
                if (data?.project !== 'Dicey-vid') continue;
                this.helperBase = base;
                this.helperAvailable = true;
                try { localStorage.setItem('diceyVidHelperBase', base); } catch (error) {}
                return true;
            } catch (error) {}
        }
        this.helperAvailable = false;
        return false;
    },

    isDebugUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.has('debug') || params.get('debug') === 'true';
    },

    buildFallbackSpots() {
        return Utils.BOARD_SPACES.map((space, index) => {
            const posKind = index % 8 === 0 ? 'square' : ((index >= 1 && index <= 7) || (index >= 17 && index <= 23) ? 'portrait' : 'landscape');
            const skill = Utils.getSkillForSpace(index);
            const label = skill?.name || space.name || space.type;
            const accent = skill?.color || '#8892a4';
            return {
                index,
                id: `space_${index}`,
                label,
                type: space.type,
                skillId: space.skillId || '',
                category: skill?.type || space.type,
                orientation: posKind,
                image: this.makePromptImage({ label, accent, category: skill?.type || space.type }, `${label} fallback image`),
                video: '',
                imagePrompt: `${label}, board game tile image`,
                videoPrompt: `${label}, tiny looping board game animation`,
                accent,
                status: 'Fallback browser generated media.'
            };
        });
    },

    loadOverrides() {
        try {
            this.overrides = JSON.parse(localStorage.getItem(this.storageKey) || '{}') || {};
        } catch (error) {
            this.overrides = {};
        }
    },

    saveOverrides() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.overrides));
        } catch (error) {
            console.warn('DiceyMedia override save failed', error);
        }
    },

    applyOverrides() {
        this.spots = this.spots.map(spot => {
            const override = this.overrides[spot.index] || {};
            return { ...spot, ...override };
        });
    },

    getSpot(index) {
        return this.spots.find(spot => Number(spot.index) === Number(index)) || null;
    },

    getImageSrc(index) {
        const spot = this.getSpot(index);
        if (!spot) return '';
        return this.withVersion(spot.imageOverride || spot.image, spot.version);
    },

    getVideoSrc(index) {
        const spot = this.getSpot(index);
        if (!spot) return '';
        return this.withVersion(spot.videoOverride || spot.video, spot.videoVersion);
    },

    withVersion(path, version) {
        if (!path) return '';
        if (path.startsWith('data:') || !version) return path;
        return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
    },

    getCurrentImageReference(index) {
        const spot = this.getSpot(index);
        if (!spot) return '';
        return spot.imageOverride || spot.image;
    },

    saveSpotPrompts(index, imagePrompt, videoPrompt) {
        const spot = this.getSpot(index);
        if (!spot) return;
        const override = this.overrides[index] || {};
        override.imagePrompt = imagePrompt;
        override.videoPrompt = videoPrompt;
        override.version = override.version || Date.now();
        this.overrides[index] = override;
        Object.assign(spot, override);
        this.saveOverrides();
    },

    async regenerateImage(index, prompt) {
        const spot = this.getSpot(index);
        if (!spot) throw new Error('Unknown board spot');
        this.saveSpotPrompts(index, prompt, spot.videoPrompt);
        try {
            const result = await this.postHelper('/api/regenerate-image', {
                index,
                id: spot.id,
                prompt,
                orientation: spot.orientation,
                dimensions: spot.imageDimensions,
                accent: spot.accent,
                category: spot.category
            });
            if (result?.image) {
                this.setSpotOverride(index, {
                    imageOverride: result.image,
                    imagePrompt: prompt,
                    version: result.version || Date.now(),
                    lastImageDurationSecs: result.durationSecs || spot.lastImageDurationSecs,
                    lastImageMode: result.mode || spot.lastImageMode
                });
                if (result.durationSecs) this.recordGenerationDuration('image', result.durationSecs);
                return { mode: result.mode || 'helper', src: this.getImageSrc(index), message: result.message || 'Image updated.' };
            }
        } catch (error) {
            console.warn('helper image regeneration failed', error);
        }

        const image = this.makePromptImage(spot, prompt);
        this.setSpotOverride(index, {
            imageOverride: image,
            imagePrompt: prompt,
            version: Date.now()
        });
        return { mode: 'browser preview', src: this.getImageSrc(index), message: 'Helper unavailable; saved a local browser preview.' };
    },

    async regenerateVideo(index, prompt) {
        const spot = this.getSpot(index);
        if (!spot) throw new Error('Unknown board spot');
        this.saveSpotPrompts(index, spot.imagePrompt, prompt);
        try {
            const result = await this.postHelper('/api/regenerate-video', {
                index,
                id: spot.id,
                prompt,
                orientation: spot.orientation,
                dimensions: spot.videoDimensions,
                accent: spot.accent,
                category: spot.category,
                image: this.getCurrentImageReference(index)
            });
            if (result?.video) {
                this.setSpotOverride(index, {
                    videoOverride: result.video,
                    videoPrompt: prompt,
                    videoVersion: result.version || Date.now(),
                    lastVideoDurationSecs: result.durationSecs || spot.lastVideoDurationSecs,
                    lastVideoMode: result.mode || spot.lastVideoMode
                });
                if (result.durationSecs) this.recordGenerationDuration('video', result.durationSecs);
                return { mode: result.mode || 'helper', src: this.getVideoSrc(index), message: result.message || 'Video updated.' };
            }
        } catch (error) {
            console.warn('helper video regeneration failed', error);
        }
        return { mode: 'unchanged', src: this.getVideoSrc(index), message: 'Helper unavailable; kept the current video.' };
    },

    recordGenerationDuration(kind, seconds) {
        const value = Number(seconds);
        if (!Number.isFinite(value) || value <= 0) return;
        let data = {};
        try {
            data = JSON.parse(localStorage.getItem(this.timingKey) || '{}') || {};
        } catch (error) {}
        data[kind] = { seconds: value, updatedAt: Date.now() };
        try {
            localStorage.setItem(this.timingKey, JSON.stringify(data));
        } catch (error) {}
    },

    getGenerationEstimate(kind, spot) {
        const defaultBase = kind === 'video' ? 56 : 28;
        const field = kind === 'video' ? 'lastVideoDurationSecs' : 'lastImageDurationSecs';
        let seconds = Number(spot?.[field]);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            try {
                const data = JSON.parse(localStorage.getItem(this.timingKey) || '{}') || {};
                seconds = Number(data[kind]?.seconds);
            } catch (error) {}
        }
        if (!Number.isFinite(seconds) || seconds <= 0) seconds = defaultBase;
        return Math.max(10, Math.ceil(seconds + 5));
    },

    setSpotOverride(index, values) {
        const override = { ...(this.overrides[index] || {}), ...values };
        this.overrides[index] = override;
        const spot = this.getSpot(index);
        if (spot) Object.assign(spot, override);
        this.saveOverrides();
    },

    async postHelper(endpoint, payload) {
        if (!this.helperAvailable) {
            await this.detectHelperBase();
        }
        if (!this.helperAvailable) {
            throw new Error('Dicey-vid helper unavailable. Run python3 regen_helper.py from the Dicey-vid folder.');
        }
        const response = await fetch(`${this.helperBase}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`helper ${response.status}: ${text}`);
        }
        return response.json();
    },

    makePromptImage(spot, prompt) {
        const width = spot.orientation === 'landscape' ? 512 : (spot.orientation === 'portrait' ? 384 : 512);
        const height = spot.orientation === 'portrait' ? 512 : (spot.orientation === 'landscape' ? 384 : 512);
        const accent = spot.accent || '#e94560';
        const seed = this.hash(prompt + spot.id);
        const marker = (spot.category || spot.type || 'S').slice(0, 2).toUpperCase();
        const polyA = this.polyline(width, height, seed, 0.56);
        const polyB = this.polyline(width, height, seed + 31, 0.73);
        const safePrompt = this.escapeXml(prompt.slice(0, 92));
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop stop-color="#070b13" offset="0"/>
      <stop stop-color="${accent}" offset="1"/>
    </linearGradient>
    <radialGradient id="r" cx="50%" cy="38%" r="56%">
      <stop stop-color="#ffffff" stop-opacity="0.36" offset="0"/>
      <stop stop-color="${accent}" stop-opacity="0.18" offset="0.46"/>
      <stop stop-color="#070b13" stop-opacity="0" offset="1"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="url(#r)"/>
  <polygon points="${polyA}" fill="#06101b" opacity="0.58"/>
  <polygon points="${polyB}" fill="#02060d" opacity="0.7"/>
  <circle cx="${width / 2}" cy="${height * 0.38}" r="${Math.min(width, height) * 0.22}" fill="#08111f" opacity="0.78"/>
  <circle cx="${width / 2}" cy="${height * 0.38}" r="${Math.min(width, height) * 0.16}" fill="${accent}" opacity="0.68"/>
  <text x="${width / 2}" y="${height * 0.42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.min(width, height) * 0.15}" font-weight="900" fill="#fff">${marker}</text>
  <text x="${width / 2}" y="${height * 0.88}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(14, Math.min(width, height) * 0.035)}" fill="#ffffff" opacity="0.42">${safePrompt}</text>
</svg>`;
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    },

    polyline(width, height, seed, base) {
        const points = [`0,${height}`];
        for (let i = 0; i < 7; i++) {
            const x = Math.round(width * i / 6);
            const y = Math.round(height * base + Math.sin(seed + i * 1.7) * height * 0.08);
            points.push(`${x},${y}`);
        }
        points.push(`${width},${height}`);
        return points.join(' ');
    },

    hash(value) {
        let h = 0;
        for (let i = 0; i < value.length; i++) {
            h = Math.imul(31, h) + value.charCodeAt(i) | 0;
        }
        return Math.abs(h);
    },

    escapeXml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
};

window.DiceyMedia = DiceyMedia;

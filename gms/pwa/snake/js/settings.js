/**
 * Settings screen: sound, volume, full screen, br8t account, and the shared bug/idea row.
 * Sound prefs are per device, in their own localStorage key (not synced with the save).
 */
const GameSettings = {
    KEY: 'snakeio_settings',
    DEFAULTS: { sound: true, volume: 0.7 },

    load() {
        try {
            return { ...this.DEFAULTS, ...JSON.parse(localStorage.getItem(this.KEY) || '{}') };
        } catch (e) {
            return { ...this.DEFAULTS };
        }
    },

    save(s) {
        try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    },

    apply(audio, s = this.load()) {
        audio.enabled = s.sound !== false;
        audio.setVolume(Number.isFinite(+s.volume) ? +s.volume : this.DEFAULTS.volume);
    },

    _row(label, sub, control) {
        const row = document.createElement('div');
        row.className = 'set-row';
        const l = document.createElement('div');
        l.className = 'set-label';
        l.textContent = label;
        if (sub) {
            const s = document.createElement('small');
            s.textContent = sub;
            l.append(s);
        }
        row.append(l, control);
        return { row, sub: l.querySelector('small') };
    },

    _button(text, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'set-btn';
        b.textContent = text;
        b.addEventListener('click', onClick);
        return b;
    },

    render(game) {
        const list = document.getElementById('settings-list');
        if (!list) return;
        const s = this.load();
        list.replaceChildren();

        const sound = this._button(s.sound ? 'On' : 'Off', () => {
            s.sound = !s.sound;
            sound.textContent = s.sound ? 'On' : 'Off';
            sound.classList.toggle('off', !s.sound);
            this.save(s); this.apply(game.audio, s);
            game.audio.playClick();
        });
        sound.dataset.set = 'sound';
        sound.classList.toggle('off', !s.sound);
        list.append(this._row('Sound', null, sound).row);

        const vol = document.createElement('input');
        vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '5';
        vol.value = String(Math.round(s.volume * 100));
        vol.className = 'set-range';
        vol.setAttribute('aria-label', 'Volume');
        vol.addEventListener('input', () => { s.volume = +vol.value / 100; this.save(s); this.apply(game.audio, s); });
        vol.addEventListener('change', () => game.audio.playEat());
        list.append(this._row('Volume', null, vol).row);

        const d = document.documentElement;
        if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
            const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
            const fs = this._button(inFs() ? 'Exit' : 'Enter', () => {
                try {
                    const p = inFs()
                        ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
                        : (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
                    if (p && p.then) p.then(() => { fs.textContent = inFs() ? 'Exit' : 'Enter'; }, () => {});
                } catch (e) { /* not allowed here */ }
            });
            fs.dataset.set = 'fullscreen';
            list.append(this._row('Full screen', null, fs).row);
        }

        // The account layer and feedback are skipped under ?test, like the cloud glue.
        const params = new URLSearchParams(location.search);
        if (params.has('test') || params.has('soak')) return;

        const acct = this._button('Account', () => {
            const fab = document.getElementById('br8t-account')?.shadowRoot?.querySelector('.fab');
            if (fab) fab.click();
        });
        acct.dataset.set = 'account';
        const a = this._row('br8t account', 'Save your progress across devices', acct);
        list.append(a.row);
        import('/lib/auth/auth.js').then(m => m.auth.ready().then(() => {
            const paint = u => {
                const inn = u && !u.anon;
                a.sub.textContent = inn ? `Signed in as ${u.name || u.email || 'you'}` : 'Playing as guest: sign in to keep your progress';
                acct.textContent = inn ? 'Account' : 'Sign in';
            };
            paint(m.auth.user);
            m.auth.onChange(paint);
        })).catch(() => a.row.remove());

        const fb = this._row('Bug or idea?', null, document.createElement('span'));
        list.append(fb.row);
        import('/lib/feedback/feedback.js')
            .then(m => fb.row.lastChild.replaceWith(m.feedbackButton({ game: 'snakeeee', className: 'set-btn', label: 'Send', signedOutLabel: 'Sign in', accent: '#4CAF50' })))
            .catch(() => fb.row.remove());
    }
};

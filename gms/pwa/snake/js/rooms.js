/**
 * RoomsUI — the ROOMS button on the menu, the rooms screen, and the little
 * room pill and share card shown during play. No modals anywhere: every
 * choice is a button on the page.
 */
class RoomsUI {
    constructor(game) {
        this.game = game;
        this.statsTimer = null;
        this.listTimer = null;
        this.created = false;
        this.pillAt = 0;
        this._bind();
        this._renderToggles();
        this._pollStats();

        // Arriving from a share link: open the rooms screen with the code ready.
        const code = new URLSearchParams(location.search).get('room');
        if (code) {
            const input = document.getElementById('rooms-code');
            if (input) input.value = code.toUpperCase().slice(0, 6);
            setTimeout(() => this.open(), 0);
        }
    }

    $(id) { return document.getElementById(id); }

    _bind() {
        this.$('rooms-btn')?.addEventListener('click', () => {
            this.game.audio.init();
            this.game.audio.playClick();
            this.open();
        });
        this.$('rooms-auto')?.addEventListener('click', () => this._go(net => net.quick(), 'Finding a room near you…'));
        this.$('rooms-join')?.addEventListener('click', () => this._joinCode(this.$('rooms-code').value));
        this.$('rooms-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') this._joinCode(e.target.value); });
        this.$('rooms-create')?.addEventListener('click', () => {
            const name = this.$('rooms-name').value.trim() || ((this.game.saveData.username || 'Player') + "'s room");
            this.created = true;
            this._go(net => net.create(name, this._settings()), 'Starting your room…');
        });
        document.querySelectorAll('.rooms-tabs button').forEach(b => b.addEventListener('click', () => {
            document.querySelectorAll('.rooms-tabs button').forEach(x => x.classList.toggle('on', x === b));
            document.querySelectorAll('.rooms-pane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
        }));
        this.$('room-share-copy')?.addEventListener('click', () => this._copyLink());
        this.$('room-share-close')?.addEventListener('click', () => this.$('room-share')?.classList.remove('show'));
        this.$('net-pill')?.addEventListener('click', () => {
            if (this.game.net && this.game.net.code) this._showShare(false);
        });
        this.$('menu-room-play')?.addEventListener('click', () => {
            this.game.audio.playClick();
            this.game._saveName();
            this.game._playAgain();
        });
        this.$('menu-room-leave')?.addEventListener('click', () => {
            this.game.audio.playClick();
            this.game.leaveRoom();
        });
        this.$('rooms-list')?.addEventListener('click', e => this._onListClick(e));
    }

    _renderToggles() {
        const box = this.$('rooms-toggles');
        if (!box) return;
        box.innerHTML = Upgrades.ROOM_TOGGLES.map(t => `
            <label class="rooms-toggle">
                <input type="checkbox" data-key="${t.key}" checked>
                <span>${t.label}${t.note ? ` <small>${t.note}</small>` : ''}</span>
            </label>`).join('');
    }

    _settings() {
        const out = {};
        document.querySelectorAll('#rooms-toggles input').forEach(i => { out[i.dataset.key] = i.checked; });
        return out;
    }

    static settingsText(set) {
        if (!set) return 'all upgrades on';
        const off = Upgrades.ROOM_TOGGLES.filter(t => set[t.key] === false).map(t => t.label);
        return off.length ? 'off: ' + off.join(', ') : 'all upgrades on';
    }

    // ------------------------------------------------------------ menu button

    _pollStats() {
        const tick = () => {
            const menu = this.$('menu-screen');
            if (menu && menu.classList.contains('active') && !document.hidden) this._fetchStats();
        };
        tick();
        this.statsTimer = setInterval(tick, 10000);
    }

    _fetchStats() {
        fetch(netHttpUrl('/stats'), { cache: 'no-store' })
            .then(r => r.json())
            .then(s => this._showStats(s))
            .catch(() => this._showStats(null));
    }

    _showStats(s) {
        const el = this.$('rooms-count');
        if (!el) return;
        if (!s) { el.textContent = 'offline'; return; }
        el.textContent = `${s.rooms} room${s.rooms === 1 ? '' : 's'} · ${s.players} player${s.players === 1 ? '' : 's'}`;
    }

    onScreen(id) {
        if (id === 'menu-screen') this._fetchStats();
        if (id !== 'rooms-screen') clearInterval(this.listTimer);
        const banner = this.$('menu-room');
        if (banner) {
            banner.hidden = !this.game.inRoom;
            const name = this.$('menu-room-name');
            if (name && this.game.inRoom) name.textContent = this.game.mp.roomName;
        }
        const play = this.$('play-btn');
        if (play) play.style.display = this.game.inRoom ? 'none' : '';
    }

    // ------------------------------------------------------------ rooms screen

    open() {
        this.game._showScreen('rooms-screen');
        this.flash('');
        this.game._saveName();
        const net = this.game.ensureNet();
        this._status('Connecting…');
        net.connect(this.game.saveData.username || 'Player')
            .then(() => {
                this._status('');
                net.list();
                clearInterval(this.listTimer);
                this.listTimer = setInterval(() => net.list(), 3000);
            })
            .catch(() => this._status("Can't reach the room server right now. Solo play still works."));
        if (!this._wired) {
            this._wired = true;
            net.on('rooms', m => this._renderList(m));
            net.on('error', m => {
                this.created = false;
                this._status(m.msg || 'Something went wrong.');
                if (m.code === 'nocode') this.$('rooms-code')?.focus();
            });
        }
    }

    _status(text) {
        const el = this.$('rooms-status');
        if (el) { el.textContent = text; el.hidden = !text; }
    }

    /** A note on the menu, e.g. after a dropped connection. */
    flash(text) {
        const el = this.$('menu-note');
        if (el) { el.textContent = text; el.hidden = !text; }
    }

    _go(action, msg) {
        this.game.audio.init();
        this.game.audio.resume();
        this.game.audio.playClick();
        this.game._saveName();
        const net = this.game.ensureNet();
        this._status(msg);
        net.connect(this.game.saveData.username || 'Player')
            .then(() => action(net))
            .catch(() => this._status("Can't reach the room server right now."));
    }

    _joinCode(code) {
        code = String(code || '').trim().toUpperCase();
        if (code.length < 4) { this._status('Room codes are 6 letters and numbers.'); return; }
        this.created = false;
        this._go(net => net.join({ code }), 'Joining…');
    }

    _renderList(m) {
        const list = this.$('rooms-list');
        if (!list) return;
        this._lastList = m.rooms;
        if (!m.rooms.length) {
            list.innerHTML = '<div class="rooms-empty">No rooms open. AUTO JOIN starts one.</div>';
            return;
        }
        const openCode = list.querySelector('.room-row.asking');
        const asking = openCode ? openCode.dataset.id : null;
        const typed = openCode ? openCode.querySelector('input').value : '';
        list.innerHTML = m.rooms.map(r => {
            const full = r.n >= r.max;
            const here = m.region === r.region;
            const meta = r.priv
                ? `${r.n}/${r.max} · code needed`
                : `${r.n}/${r.max} · ${RoomsUI.settingsText(r.set)}${here ? '' : ' · far away'}`;
            return `<div class="room-row ${r.priv ? 'priv' : ''} ${full ? 'full' : ''}" data-id="${r.id}" data-priv="${r.priv ? 1 : 0}">
                <div class="room-main">
                    <span class="room-name">${r.priv ? '🔒 ' : ''}${Utils.escapeHtml(r.name)}</span>
                    <span class="room-meta">${meta}</span>
                </div>
                <span class="room-go">${full ? 'FULL' : 'JOIN'}</span>
            </div>`;
        }).join('');
        if (asking) {
            const row = list.querySelector(`.room-row[data-id="${asking}"]`);
            if (row) this._askCode(row, typed);
        }
    }

    _onListClick(e) {
        const row = e.target.closest('.room-row');
        if (!row || row.classList.contains('full')) return;
        if (e.target.closest('.room-code')) {
            if (e.target.tagName === 'BUTTON') this._joinCode(row.querySelector('input').value);
            return;
        }
        if (row.dataset.priv === '1') { this._askCode(row, ''); return; }
        this.created = false;
        this._go(net => net.join({ id: row.dataset.id }), 'Joining…');
    }

    /** Private rooms ask for their code right there in the row. */
    _askCode(row, typed) {
        if (row.classList.contains('asking')) return;
        document.querySelectorAll('.room-row.asking').forEach(r => {
            r.classList.remove('asking');
            r.querySelector('.room-code')?.remove();
        });
        row.classList.add('asking');
        const box = document.createElement('div');
        box.className = 'room-code';
        box.innerHTML = `<input maxlength="6" placeholder="CODE" autocomplete="off" autocapitalize="characters"><button class="btn btn-accent">JOIN</button>`;
        row.appendChild(box);
        const input = box.querySelector('input');
        input.value = typed;
        input.addEventListener('keydown', e => { if (e.key === 'Enter') this._joinCode(input.value); });
        input.focus();
    }

    // ------------------------------------------------------------ in the room

    onJoined() {
        clearInterval(this.listTimer);
        this._status('');
        const net = this.game.net;
        if (net.code) {
            // Strip ?room= so a reload does not try to join again.
            if (location.search.includes('room=')) history.replaceState(null, '', location.pathname);
            this._showShare(this.created);
        } else {
            this.$('room-share')?.classList.remove('show');
        }
        this.created = false;
    }

    _link() {
        const net = this.game.net;
        return `${location.origin}${location.pathname}?room=${net.code}`;
    }

    _showShare(sticky) {
        const net = this.game.net;
        const box = this.$('room-share');
        if (!box || !net || !net.code) return;
        this.$('room-share-code').textContent = net.code;
        this.$('room-share-name').textContent = net.room ? net.room.name : '';
        this.$('room-share-copy').textContent = 'Copy link';
        box.classList.add('show');
        clearTimeout(this._shareTimer);
        if (!sticky) this._shareTimer = setTimeout(() => box.classList.remove('show'), 10000);
    }

    _copyLink() {
        const link = this._link();
        const btn = this.$('room-share-copy');
        const done = ok => { if (btn) btn.textContent = ok ? 'Copied!' : link; };
        if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
            navigator.share({ title: 'Snake-eee room', text: `Join my Snake-eee room (code ${this.game.net.code})`, url: link })
                .then(() => done(true)).catch(() => {});
            return;
        }
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
        else done(false);
    }

    /** The room pill during play, refreshed twice a second. */
    tickPill(now) {
        if (now - this.pillAt < 500) return;
        this.pillAt = now;
        const pill = this.$('net-pill');
        if (!pill || !this.game.mp) return;
        const st = this.game.mp.status();
        pill.textContent = st.text;
        pill.classList.toggle('slow', st.slow);
        const tip = this.$('net-tip');
        if (tip) {
            const show = st.slow && this.game.state === 'playing';
            tip.hidden = !show;
            if (show) tip.textContent = this.game.net.turn
                ? 'Relayed connection — a little laggy.'
                : 'Relayed via the US — laggy. On the same Wi-Fi? One player switching to mobile data usually fixes it.';
        }
    }
}

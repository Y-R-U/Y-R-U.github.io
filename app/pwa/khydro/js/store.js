// K-Hydro Track — Data Storage & Cloudflare D1 Sync

var KStore = (function() {
    var PLANTS_KEY   = 'khydro_plants';
    var USERNAME_KEY = 'khydro_username';
    var DARKMODE_KEY = 'khydro_darkmode';
    var API_BASE     = '/api/khydro';

    var _username = null;

    // --- Username ---
    function getUsername() { return localStorage.getItem(USERNAME_KEY); }
    function setUsername(name) { localStorage.setItem(USERNAME_KEY, name); _username = name; }
    function clearUsername() { localStorage.removeItem(USERNAME_KEY); _username = null; }

    // --- Dark Mode ---
    function getDarkMode() { return localStorage.getItem(DARKMODE_KEY) === 'true'; }
    function setDarkMode(val) { localStorage.setItem(DARKMODE_KEY, String(val)); }

    // --- Plants CRUD ---
    function readPlants() {
        try { return JSON.parse(localStorage.getItem(PLANTS_KEY)) || []; }
        catch(e) { return []; }
    }

    function writePlants(plants) {
        localStorage.setItem(PLANTS_KEY, JSON.stringify(plants));
        _pushToCloud(plants);
    }

    function clearPlants() { localStorage.removeItem(PLANTS_KEY); }

    // --- Cloud Sync ---
    function initSync(username) { _username = username; }

    function syncFromCloud() {
        if (!_username) return Promise.resolve(null);
        return fetch(API_BASE + '?user=' + encodeURIComponent(_username))
            .then(function(res) {
                if (!res.ok) return null;
                return res.json();
            })
            .then(function(remote) {
                if (!remote) return null;
                var remoteItems = Array.isArray(remote.items) ? remote.items : [];
                var local = readPlants();
                var merged = _mergeItems(local, remoteItems);

                localStorage.setItem(PLANTS_KEY, JSON.stringify(merged));

                var needsUpdate = merged.length !== remoteItems.length ||
                    merged.some(function(m, i) {
                        return !remoteItems[i] || m.updatedAt !== remoteItems[i].updatedAt;
                    });
                if (needsUpdate) _pushToCloud(merged);
                return merged;
            })
            .catch(function() { return null; });
    }

    function _pushToCloud(items) {
        if (!_username) return;
        try {
            // Strip photos from cloud data (too large for D1)
            var stripped = items.map(function(p) {
                var copy = {};
                for (var k in p) { if (k !== 'photos') copy[k] = p[k]; }
                return copy;
            });
            fetch(API_BASE + '?user=' + encodeURIComponent(_username), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: stripped })
            }).catch(function() {});
        } catch(e) {}
    }

    function _mergeItems(local, remote) {
        var map = {};
        local.forEach(function(item) { map[item.id] = item; });
        remote.forEach(function(item) {
            var existing = map[item.id];
            if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
                if (existing && existing.photos) item.photos = existing.photos;
                map[item.id] = item;
            }
        });
        var result = [];
        for (var id in map) result.push(map[id]);
        return result;
    }

    // --- Data Migration (from old localStorage keys) ---
    function migrateOldData() {
        var oldPlants = localStorage.getItem('kHydroPlants');
        if (oldPlants && !localStorage.getItem(PLANTS_KEY)) {
            localStorage.setItem(PLANTS_KEY, oldPlants);
        }
        var oldDark = localStorage.getItem('kHydroDarkMode');
        if (oldDark !== null && localStorage.getItem(DARKMODE_KEY) === null) {
            localStorage.setItem(DARKMODE_KEY, oldDark);
        }
    }

    return {
        getUsername: getUsername, setUsername: setUsername, clearUsername: clearUsername,
        getDarkMode: getDarkMode, setDarkMode: setDarkMode,
        readPlants: readPlants, writePlants: writePlants, clearPlants: clearPlants,
        initSync: initSync, syncFromCloud: syncFromCloud, migrateOldData: migrateOldData
    };
})();

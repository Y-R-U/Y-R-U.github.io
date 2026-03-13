// K-Hydro Track — UI Utilities (toasts, confirms, login panel)

var KUI = (function() {
    var USER_RE = /^[a-z0-9_-]{2,30}$/;

    // --- Toast Notifications ---
    function showToast(message, type) {
        type = type || 'info';
        var container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function() {
            toast.classList.add('removing');
            setTimeout(function() { toast.remove(); }, 300);
        }, 3000);
    }

    // --- Custom Confirm Dialog (replaces window.confirm) ---
    function showConfirm(message) {
        return new Promise(function(resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';

            var panel = document.createElement('div');
            panel.className = 'confirm-panel';

            var msg = document.createElement('div');
            msg.className = 'confirm-message';
            msg.textContent = message;

            var actions = document.createElement('div');
            actions.className = 'confirm-actions';

            var noBtn = document.createElement('button');
            noBtn.className = 'confirm-no';
            noBtn.textContent = 'Cancel';

            var yesBtn = document.createElement('button');
            yesBtn.className = 'confirm-yes';
            yesBtn.textContent = 'Confirm';

            actions.appendChild(noBtn);
            actions.appendChild(yesBtn);
            panel.appendChild(msg);
            panel.appendChild(actions);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            function cleanup(result) {
                overlay.style.animation = 'fadeIn 0.2s ease reverse forwards';
                setTimeout(function() { overlay.remove(); resolve(result); }, 200);
            }

            yesBtn.onclick = function() { cleanup(true); };
            noBtn.onclick = function() { cleanup(false); };
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) cleanup(false);
            });
        });
    }

    // --- Login Panel (replaces window.prompt) ---
    function showLogin() {
        return new Promise(function(resolve) {
            var overlay = document.createElement('div');
            overlay.className = 'login-overlay';
            overlay.id = 'loginOverlay';

            var panel = document.createElement('div');
            panel.className = 'login-panel';

            panel.innerHTML =
                '<div class="login-icon">🌿</div>' +
                '<h2>K-Hydro Track</h2>' +
                '<p>Enter a username to sync your plant data across devices</p>' +
                '<input type="text" class="login-input" id="loginUsername" ' +
                    'placeholder="username" maxlength="30" autocomplete="off" ' +
                    'autocapitalize="off" spellcheck="false">' +
                '<div class="login-error" id="loginError"></div>' +
                '<button class="login-submit" id="loginBtn">Get Started</button>';

            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            var input = overlay.querySelector('#loginUsername');
            var btn = overlay.querySelector('#loginBtn');
            var error = overlay.querySelector('#loginError');

            input.addEventListener('input', function() {
                input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
                error.textContent = '';
            });

            function submit() {
                var val = input.value.trim();
                if (!USER_RE.test(val)) {
                    error.textContent = 'Use 2-30 characters: a-z, 0-9, - or _';
                    input.focus();
                    return;
                }
                overlay.style.animation = 'fadeIn 0.4s ease reverse forwards';
                setTimeout(function() { overlay.remove(); resolve(val); }, 400);
            }

            btn.onclick = submit;
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') submit();
            });
            setTimeout(function() { input.focus(); }, 100);
        });
    }

    // --- User Menu ---
    function initUserMenu(username) {
        var display = document.getElementById('usernameDisplay');
        var avatar = document.querySelector('.user-avatar');
        var dropdownName = document.getElementById('dropdownUsername');
        if (display) display.textContent = username;
        if (avatar) avatar.textContent = username.charAt(0).toUpperCase();
        if (dropdownName) dropdownName.textContent = '@' + username;

        var btn = document.getElementById('userMenuBtn');
        var dropdown = document.getElementById('userDropdown');
        if (btn && dropdown) {
            btn.onclick = function(e) {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            };
            document.addEventListener('click', function() {
                dropdown.classList.remove('open');
            });
            dropdown.addEventListener('click', function(e) { e.stopPropagation(); });
        }
    }

    return { showToast: showToast, showConfirm: showConfirm, showLogin: showLogin, initUserMenu: initUserMenu, USER_RE: USER_RE };
})();

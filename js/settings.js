/**
 * SETTINGS MODULE — Profile, Preferences & Configuration
 *
 * Features:
 *   - Profile display
 *   - Change password
 *   - Theme customization (accent colors)
 *   - Session preferences (toggles)
 *   - Webcam settings
 *   - Notification settings
 *   - Logout
 */
var Settings = (function () {
  'use strict';

  // ── Constants ──
  var PREFS_KEY = 'sys_user_prefs';

  var DEFAULT_PREFS = {
    faceDetect: true,
    autoCapture: false,
    notifications: true,
    sounds: true,
    compactMode: false,
    accentColor: 'lime'
  };

  var THEME_COLORS = [
    { id: 'lime', color: '#7fff00', label: 'Lime' },
    { id: 'cyan', color: '#00e5ff', label: 'Cyan' },
    { id: 'orange', color: '#ff6a00', label: 'Orange' },
    { id: 'magenta', color: '#ff00ff', label: 'Magenta' },
    { id: 'red', color: '#ff3a3a', label: 'Red' },
    { id: 'amber', color: '#ffaa00', label: 'Amber' }
  ];

  // ── State ──
  var _prefs = {};
  var _callbacks = {};

  // ── Storage ──
  function _loadPrefs() {
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs));
    } catch (e) { /* quota */ }
  }

  // ── Init ──
  function init() {
    var saved = _loadPrefs();
    _prefs = saved ? _merge(DEFAULT_PREFS, saved) : _merge({}, DEFAULT_PREFS);
    _applyAccentColor(_prefs.accentColor);
    return _publicAPI();
  }

  function _merge(target, source) {
    for (var k in source) {
      if (source.hasOwnProperty(k)) {
        target[k] = source[k];
      }
    }
    return target;
  }

  // ── Rendering ──
  function renderSettings() {
    var session = (typeof Auth !== 'undefined') ? Auth.getStudentSession() : null;
    if (!session) return;

    _renderProfile(session);
    _renderSessionInfo(session);
    _renderToggles();
    _renderThemeSwatches();
    _bindPasswordForm();
    _bindLogout();
  }

  function _renderProfile(session) {
    var avatarEl = document.getElementById('settingsAvatar');
    var nameEl = document.getElementById('settingsName');
    var usnEl = document.getElementById('settingsUsn');
    var deptEl = document.getElementById('settingsDept');
    var emailEl = document.getElementById('settingsEmail');

    if (avatarEl) {
      var initials = session.name ? session.name.charAt(0).toUpperCase() : '?';
      avatarEl.textContent = initials;
    }
    if (nameEl) nameEl.textContent = session.name || '--';
    if (usnEl) usnEl.textContent = session.userId || '--';
    if (deptEl) deptEl.textContent = session.dept || '--';
    if (emailEl) emailEl.textContent = session.email || '--';
  }

  function _renderSessionInfo(session) {
    var loginEl = document.getElementById('settingsLoginTime');
    var expiryEl = document.getElementById('settingsExpiry');
    var sessionEl = document.getElementById('settingsSessionId');

    if (loginEl) loginEl.textContent = _formatDate(session.loginTime);
    if (expiryEl) expiryEl.textContent = _formatDate(session.expiresAt);
    if (sessionEl) sessionEl.textContent = session.sessionId || '--';
  }

  function _renderToggles() {
    _bindToggle('settingsToggleFaceDetect', 'faceDetect');
    _bindToggle('settingsToggleAutoCapture', 'autoCapture');
    _bindToggle('settingsToggleNotifs', 'notifications');
    _bindToggle('settingsToggleSounds', 'sounds');
    _bindToggle('settingsToggleCompact', 'compactMode');
  }

  function _bindToggle(elId, prefKey) {
    var el = document.getElementById(elId);
    if (!el) return;

    el.checked = !!_prefs[prefKey];

    if (el._bound) return;
    el._bound = true;

    el.addEventListener('change', function () {
      _prefs[prefKey] = el.checked;
      _savePrefs();
      _fire('change', { key: prefKey, value: el.checked });
    });
  }

  function _renderThemeSwatches() {
    var container = document.getElementById('settingsSwatches');
    if (!container) return;

    var html = '';
    for (var i = 0; i < THEME_COLORS.length; i++) {
      var tc = THEME_COLORS[i];
      var active = tc.id === _prefs.accentColor ? ' settings-swatch--active' : '';
      html += '<div class="settings-swatch' + active + '" data-theme="' + tc.id + '" ';
      html += 'style="background: ' + tc.color + ';" title="' + tc.label + '"></div>';
    }
    container.innerHTML = html;

    if (container._bound) return;
    container._bound = true;

    container.addEventListener('click', function (e) {
      var swatch = e.target.closest('[data-theme]');
      if (!swatch) return;
      var themeId = swatch.getAttribute('data-theme');
      if (themeId === _prefs.accentColor) return;

      _prefs.accentColor = themeId;
      _savePrefs();
      _applyAccentColor(themeId);

      // Update active state
      var allSwatches = container.querySelectorAll('.settings-swatch');
      for (var i = 0; i < allSwatches.length; i++) {
        allSwatches[i].classList.toggle('settings-swatch--active', allSwatches[i].getAttribute('data-theme') === themeId);
      }

      _fire('themeChange', { color: themeId });
    });
  }

  function _applyAccentColor(colorId) {
    var found = null;
    for (var i = 0; i < THEME_COLORS.length; i++) {
      if (THEME_COLORS[i].id === colorId) {
        found = THEME_COLORS[i];
        break;
      }
    }
    if (!found) return;

    var root = document.documentElement;
    // Parse hex to rgb
    var r = parseInt(found.color.slice(1, 3), 16);
    var g = parseInt(found.color.slice(3, 5), 16);
    var b = parseInt(found.color.slice(5, 7), 16);

    root.style.setProperty('--glow-lime', found.color);
    root.style.setProperty('--glow-lime-rgb', r + ', ' + g + ', ' + b);

    // Dim variant
    root.style.setProperty('--glow-lime-dim', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.1)');
    root.style.setProperty('--glow-lime-mid', 'rgba(' + r + ', ' + g + ', ' + b + ', 0.4)');
  }

  // ── Password Form ──
  function _bindPasswordForm() {
    var form = document.getElementById('settingsPwForm');
    if (!form || form._bound) return;
    form._bound = true;

    var msgEl = document.getElementById('settingsPwMsg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var currentEl = document.getElementById('settingsPwCurrent');
      var newEl = document.getElementById('settingsPwNew');
      var confirmEl = document.getElementById('settingsPwConfirm');

      var current = currentEl ? currentEl.value : '';
      var newPw = newEl ? newEl.value : '';
      var confirm = confirmEl ? confirmEl.value : '';

      // Clear previous message
      if (msgEl) {
        msgEl.className = 'settings-msg';
        msgEl.textContent = '';
      }

      if (!current || !newPw || !confirm) {
        _showPwMsg(msgEl, 'error', 'All fields are required.');
        return;
      }

      if (newPw !== confirm) {
        _showPwMsg(msgEl, 'error', 'New passwords do not match.');
        return;
      }

      var session = Auth.getStudentSession();
      if (!session) {
        _showPwMsg(msgEl, 'error', 'Session expired. Please login again.');
        return;
      }

      var result = Auth.changePassword(session.userId, current, newPw);
      if (result.success) {
        _showPwMsg(msgEl, 'success', result.message);
        if (currentEl) currentEl.value = '';
        if (newEl) newEl.value = '';
        if (confirmEl) confirmEl.value = '';
      } else {
        _showPwMsg(msgEl, 'error', result.message);
      }
    });

    // Password visibility toggles
    _bindPwToggle('settingsPwToggleCurrent', 'settingsPwCurrent');
    _bindPwToggle('settingsPwToggleNew', 'settingsPwNew');
    _bindPwToggle('settingsPwToggleConfirm', 'settingsPwConfirm');
  }

  function _showPwMsg(el, type, text) {
    if (!el) return;
    el.className = 'settings-msg settings-msg--' + type;
    el.textContent = text;
  }

  function _bindPwToggle(toggleId, inputId) {
    var toggle = document.getElementById(toggleId);
    var input = document.getElementById(inputId);
    if (!toggle || !input) return;

    if (toggle._bound) return;
    toggle._bound = true;

    toggle.addEventListener('click', function () {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggle.textContent = isPassword ? '◉' : '◎';
    });
  }

  // ── Logout ──
  function _bindLogout() {
    var btn = document.getElementById('settingsLogoutBtn');
    if (!btn || btn._bound) return;
    btn._bound = true;

    btn.addEventListener('click', function () {
      Auth.destroyStudentSession();
      window.location.href = 'student-login.html';
    });
  }

  // ── Utils ──
  function _formatDate(isoString) {
    if (!isoString) return '--';
    try {
      var d = new Date(isoString);
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var h = String(d.getHours()).padStart(2, '0');
      var m = String(d.getMinutes()).padStart(2, '0');
      return months[d.getMonth()] + ' ' + d.getDate() + ', ' + h + ':' + m;
    } catch (e) {
      return '--';
    }
  }

  // ── Event System ──
  function on(event, callback) {
    if (!_callbacks[event]) _callbacks[event] = [];
    _callbacks[event].push(callback);
  }

  function off(event, callback) {
    if (!_callbacks[event]) return;
    _callbacks[event] = _callbacks[event].filter(function (cb) { return cb !== callback; });
  }

  function _fire(event, data) {
    var cbs = _callbacks[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](data || {}); } catch (e) { /* swallow */ }
    }
  }

  // ── Public API ──
  function getPrefs() {
    return _merge({}, _prefs);
  }

  function _publicAPI() {
    return {
      init: init,
      renderSettings: renderSettings,
      getPrefs: getPrefs,
      on: on,
      off: off
    };
  }

  return {
    init: init,
    renderSettings: renderSettings,
    getPrefs: getPrefs,
    on: on,
    off: off
  };
})();

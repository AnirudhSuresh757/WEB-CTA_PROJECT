/**
 * SECURITY MONITOR — Anti-Cheat & Violation Tracking
 */
var SecurityMonitor = (function () {
  'use strict';

  // ── Constants ──
  var STORAGE_KEY = 'sys_security_log';
  var INACTIVITY_THRESHOLD = 30000;   // 30s
  var TAB_SWITCH_GRACE = 1000;        // 1s grace before counting
  var WARNING_DISPLAY_TIME = 6000;    // 6s toast display
  var MAX_WARNINGS_BEFORE_FLAG = 3;

  // ── Violation Types ──
  var VIOLATION = {
    TAB_SWITCH:     'tab_switch',
    INACTIVITY:     'inactivity',
    MULTI_FACE:     'multi_face',
    NO_FACE:        'no_face',
    FOCUS_LOST:     'focus_lost',
    DEV_TOOLS:      'dev_tools'
  };

  var VIOLATION_LABELS = {};
  VIOLATION_LABELS[VIOLATION.TAB_SWITCH] = 'Tab Switch Detected';
  VIOLATION_LABELS[VIOLATION.INACTIVITY] = 'Extended Inactivity';
  VIOLATION_LABELS[VIOLATION.MULTI_FACE] = 'Multiple Faces Detected';
  VIOLATION_LABELS[VIOLATION.NO_FACE]    = 'Face Not Visible';
  VIOLATION_LABELS[VIOLATION.FOCUS_LOST] = 'Window Focus Lost';
  VIOLATION_LABELS[VIOLATION.DEV_TOOLS]  = 'Developer Tools Opened';

  var VIOLATION_SEVERITY = {};
  VIOLATION_SEVERITY[VIOLATION.TAB_SWITCH] = 'high';
  VIOLATION_SEVERITY[VIOLATION.INACTIVITY] = 'medium';
  VIOLATION_SEVERITY[VIOLATION.MULTI_FACE] = 'high';
  VIOLATION_SEVERITY[VIOLATION.NO_FACE]    = 'medium';
  VIOLATION_SEVERITY[VIOLATION.FOCUS_LOST] = 'low';
  VIOLATION_SEVERITY[VIOLATION.DEV_TOOLS]  = 'critical';

  // ── State ──
  var _active = false;
  var _violations = [];
  var _warningCounts = {};
  var _callbacks = {};
  var _dom = {};

  var _tabSwitchTimer = null;
  var _inactivityTimer = null;
  var _userActive = true;
  var _tabVisible = true;
  var _windowFocused = true;
  var _toastQueue = [];
  var _toastTimer = null;
  var _devToolsOpen = false;

  // ── Initialize ──

  /**
   * Initialize the security monitor.
   * @param {Object} config
   *   - toastContainerEl: container for toast notifications
   *   - violationListEl:  container for violation log display
   *   - badgeEl:          violation count badge
   *   - panelEl:          security panel element
   */
  function init(config) {
    _dom.toastContainerEl = config.toastContainerEl || null;
    _dom.violationListEl  = config.violationListEl  || null;
    _dom.badgeEl          = config.badgeEl          || null;
    _dom.panelEl          = config.panelEl          || null;

    _loadLog();
    _updateBadge();
    _renderViolationLog();

    return _publicAPI();
  }

  /**
   * Start monitoring.
   */
  function start() {
    if (_active) return;
    _active = true;

    _bindTabSwitch();
    _bindInactivity();
    _bindFocus();
    _bindDevTools();

    _fire('start');
  }

  /**
   * Stop monitoring.
   */
  function stop() {
    _active = false;
    _unbindAll();
    _clearInactivityTimer();
    _clearTabSwitchTimer();
    _fire('stop');
  }

  // ── Violation Recording ──

  /**
   * Record a violation.
   */
  function recordViolation(type, detail) {
    var now = Date.now();
    var severity = VIOLATION_SEVERITY[type] || 'low';
    var label = VIOLATION_LABELS[type] || type;

    var violation = {
      id: 'v-' + now + '-' + Math.random().toString(36).substr(2, 4),
      type: type,
      label: label,
      severity: severity,
      detail: detail || '',
      timestamp: now,
      timeFormatted: _formatTime(now)
    };

    _violations.push(violation);
    _saveLog();

    // Track warning count per type
    if (!_warningCounts[type]) _warningCounts[type] = 0;
    _warningCounts[type]++;

    // Show toast
    _showToast(violation);

    // Update UI
    _updateBadge();
    _renderViolationLog();

    // Fire event
    _fire('violation', violation);

    // Check if student should be flagged
    if (_warningCounts[type] >= MAX_WARNINGS_BEFORE_FLAG) {
      _fire('flagged', { type: type, count: _warningCounts[type], label: label });
    }

    return violation;
  }

  /**
   * Get all violations.
   */
  function getViolations() {
    return _violations.slice();
  }

  /**
   * Get violation count by type.
   */
  function getCountByType(type) {
    return _warningCounts[type] || 0;
  }

  /**
   * Get total violation count.
   */
  function getTotalCount() {
    return _violations.length;
  }

  /**
   * Get summary stats.
   */
  function getSummary() {
    var summary = {};
    for (var key in VIOLATION) {
      if (VIOLATION.hasOwnProperty(key)) {
        summary[VIOLATION[key]] = _warningCounts[VIOLATION[key]] || 0;
      }
    }
    return {
      total: _violations.length,
      byType: summary,
      flagged: _isFlagged()
    };
  }

  function _isFlagged() {
    for (var type in _warningCounts) {
      if (_warningCounts[type] >= MAX_WARNINGS_BEFORE_FLAG) return true;
    }
    return false;
  }

  /**
   * Clear all violation logs.
   */
  function clearLog() {
    _violations = [];
    _warningCounts = {};
    _saveLog();
    _updateBadge();
    _renderViolationLog();
    _fire('logCleared');
  }

  // ── Tab Switch Detection ──

  function _bindTabSwitch() {
    document.addEventListener('visibilitychange', _handleVisibilityChange);
  }

  function _handleVisibilityChange() {
    if (!_active) return;

    _tabVisible = !document.hidden;

    if (!_tabVisible) {
      _clearTabSwitchTimer();
      _tabSwitchTimer = setTimeout(function () {
        if (!_tabVisible && _active) {
          recordViolation(VIOLATION.TAB_SWITCH, 'User switched away from tab');
          _fire('tabSwitch');
        }
      }, TAB_SWITCH_GRACE);
    } else {
      _clearTabSwitchTimer();
    }
  }

  function _clearTabSwitchTimer() {
    if (_tabSwitchTimer) {
      clearTimeout(_tabSwitchTimer);
      _tabSwitchTimer = null;
    }
  }

  // ── Inactivity Detection ──

  function _bindInactivity() {
    var events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    var handler = _debounce(_onUserActivity, 500);

    for (var i = 0; i < events.length; i++) {
      document.addEventListener(events[i], handler, { passive: true });
    }

    _resetInactivityTimer();
  }

  function _onUserActivity() {
    var wasInactive = !_userActive;
    _userActive = true;
    _resetInactivityTimer();

    if (wasInactive) {
      _fire('activityResumed');
    }
  }

  function _resetInactivityTimer() {
    _clearInactivityTimer();
    _inactivityTimer = setTimeout(function () {
      if (!_active) return;
      _userActive = false;
      recordViolation(VIOLATION.INACTIVITY, 'No input for ' + (INACTIVITY_THRESHOLD / 1000) + ' seconds');
      _fire('inactivity');

      // Notify TimeTracker to pause
      if (typeof TimeTracker !== 'undefined' && TimeTracker.onFaceLost) {
        TimeTracker.onFaceLost();
      }
    }, INACTIVITY_THRESHOLD);
  }

  function _clearInactivityTimer() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
  }

  // ── Focus Detection ──

  function _bindFocus() {
    window.addEventListener('focus', _handleFocus);
    window.addEventListener('blur', _handleBlur);
  }

  function _handleFocus() {
    if (!_active) return;
    _windowFocused = true;
    _fire('focusGained');
  }

  function _handleBlur() {
    if (!_active || !_windowFocused) return;
    _windowFocused = false;

    // Only record if tab is still visible (blur without tab switch)
    if (_tabVisible) {
      recordViolation(VIOLATION.FOCUS_LOST, 'Window lost focus while tab visible');
      _fire('focusLost');
    }
  }

  // ── DevTools Detection ──

  function _bindDevTools() {
    // Method 1: Debugger statement check
    var threshold = 100;
    var before = performance.now();

    // Method 2: Window size difference
    _checkDevToolsLoop();
  }

  function _checkDevToolsLoop() {
    if (!_active) return;

    // Size-based detection (works on desktop)
    var widthThreshold = window.outerWidth - window.innerWidth > 160;
    var heightThreshold = window.outerHeight - window.innerHeight > 160;

    var isOpen = widthThreshold || heightThreshold;

    if (isOpen && !_devToolsOpen) {
      _devToolsOpen = true;
      recordViolation(VIOLATION.DEV_TOOLS, 'Developer tools may be open');
      _fire('devToolsOpened');
    } else if (!isOpen && _devToolsOpen) {
      _devToolsOpen = false;
      _fire('devToolsClosed');
    }

    // Re-check periodically
    setTimeout(function () {
      if (_active) _checkDevToolsLoop();
    }, 2000);
  }

  // ── Unbind All ──

  function _unbindAll() {
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    window.removeEventListener('focus', _handleFocus);
    window.removeEventListener('blur', _handleBlur);
  }

  // ── Toast Notifications ──

  function _showToast(violation) {
    if (!_dom.toastContainerEl) return;

    var toast = document.createElement('div');
    toast.className = 'security-toast security-toast--' + violation.severity;
    toast.innerHTML =
      '<div class="security-toast__icon">' + _getSeverityIcon(violation.severity) + '</div>' +
      '<div class="security-toast__body">' +
        '<div class="security-toast__title">' + _escape(violation.label) + '</div>' +
        '<div class="security-toast__text">' + _escape(violation.detail) + '</div>' +
      '</div>' +
      '<div class="security-toast__time">' + violation.timeFormatted + '</div>';

    _dom.toastContainerEl.appendChild(toast);

    // Animate in
    requestAnimationFrame(function () {
      toast.classList.add('security-toast--visible');
    });

    // Auto remove
    setTimeout(function () {
      toast.classList.remove('security-toast--visible');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, WARNING_DISPLAY_TIME);
  }

  function _getSeverityIcon(severity) {
    switch (severity) {
      case 'critical': return '⊘';
      case 'high':     return '⚠';
      case 'medium':   return '◆';
      default:         return '•';
    }
  }

  // ── Violation Log Rendering ──

  function _renderViolationLog() {
    if (!_dom.violationListEl) return;

    if (_violations.length === 0) {
      _dom.violationListEl.innerHTML =
        '<div class="security-log__empty">No violations recorded</div>';
      return;
    }

    var html = '';
    // Show newest first
    for (var i = _violations.length - 1; i >= 0; i--) {
      var v = _violations[i];
      html += '<div class="security-log__item security-log__item--' + v.severity + '">';
      html += '<span class="security-log__icon">' + _getSeverityIcon(v.severity) + '</span>';
      html += '<span class="security-log__label">' + _escape(v.label) + '</span>';
      html += '<span class="security-log__time">' + v.timeFormatted + '</span>';
      html += '</div>';
    }

    _dom.violationListEl.innerHTML = html;
  }

  // ── Badge ──

  function _updateBadge() {
    if (!_dom.badgeEl) return;
    var count = _violations.length;
    _dom.badgeEl.textContent = count;
    _dom.badgeEl.style.display = count > 0 ? '' : 'none';
  }

  // ── Storage ──

  function _saveLog() {
    try {
      // Store last 50 violations max
      var toSave = _violations.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        violations: toSave,
        warningCounts: _warningCounts,
        savedAt: Date.now()
      }));
    } catch (e) { /* quota */ }
  }

  function _loadLog() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      var data = JSON.parse(raw);
      if (data && Array.isArray(data.violations)) {
        _violations = data.violations;
        _warningCounts = data.warningCounts || {};
      }
    } catch (e) {
      _violations = [];
      _warningCounts = {};
    }
  }

  // ── Helpers ──

  function _formatTime(ms) {
    var d = new Date(ms);
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function _escape(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function _debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  // ── Event System ──

  /**
   * Events: start, stop, violation, tabSwitch, inactivity,
   *         focusLost, focusGained, devToolsOpened, devToolsClosed,
   *         activityResumed, flagged, logCleared
   */
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

  // ── Destroy ──

  function destroy() {
    stop();
    _callbacks = {};
    _dom = {};
    _violations = [];
    _warningCounts = {};
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      VIOLATION: VIOLATION,
      init: init,
      start: start,
      stop: stop,
      recordViolation: recordViolation,
      getViolations: getViolations,
      getCountByType: getCountByType,
      getTotalCount: getTotalCount,
      getSummary: getSummary,
      clearLog: clearLog,
      on: on,
      off: off,
      destroy: destroy
    };
  }

  return {
    VIOLATION: VIOLATION,
    init: init,
    start: start,
    stop: stop,
    recordViolation: recordViolation,
    getViolations: getViolations,
    getCountByType: getCountByType,
    getTotalCount: getTotalCount,
    getSummary: getSummary,
    clearLog: clearLog,
    on: on,
    off: off,
    destroy: destroy
  };
})();

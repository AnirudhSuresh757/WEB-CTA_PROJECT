/**
 * TIME TRACKER — Active Uptime & Duration Tracking
 *
 * Tracks active time only when:
 *   - Lab session is active
 *   - Face is detected
 *
 * Pauses on:
 *   - No face detected
 *   - Tab hidden / inactivity
 *   - Session expired
 */
var TimeTracker = (function () {
  'use strict';

  // ── Constants ──
  var STORAGE_KEY = 'sys_time_tracker';
  var LAB_DURATION = 2 * 60 * 60; // 2 hours
  var INACTIVITY_TIMEOUT = 30000;  // 30s mouse/keyboard inactivity
  var TICK_INTERVAL = 1000;

  // ── State ──
  var _running = false;
  var _active = false;          // actively counting (face present + session active + tab visible)
  var _sessionActive = false;
  var _faceDetected = false;
  var _tabVisible = true;
  var _userActive = true;

  var _activeSeconds = 0;       // accumulated active time
  var _sessionElapsed = 0;      // total session elapsed
  var _sessionRemaining = 0;    // session time remaining
  var _sessionId = null;        // current session ID for scoping

  var _tickTimer = null;
  var _inactivityTimer = null;
  var _lastTickTime = 0;

  var _callbacks = {};
  var _dom = {};

  // ── Status ──
  var TRACKER_STATUS = {
    IDLE:      'idle',
    TRACKING:  'tracking',
    PAUSED:    'paused',
    STOPPED:   'stopped',
    EXPIRED:   'expired'
  };

  var TRACKER_STATUS_TEXT = {};
  TRACKER_STATUS_TEXT[TRACKER_STATUS.IDLE]     = 'TRACKER IDLE';
  TRACKER_STATUS_TEXT[TRACKER_STATUS.TRACKING] = 'ACTIVELY TRACKING';
  TRACKER_STATUS_TEXT[TRACKER_STATUS.PAUSED]   = 'PAUSED';
  TRACKER_STATUS_TEXT[TRACKER_STATUS.STOPPED]  = 'TRACKER STOPPED';
  TRACKER_STATUS_TEXT[TRACKER_STATUS.EXPIRED]  = 'SESSION EXPIRED';

  // ── Initialize ──

  /**
   * Initialize the time tracker.
   * @param {Object} config
   *   - activeTimeEl:    element to display active duration
   *   - totalTimeEl:     element to display total session duration
   *   - remainingTimeEl: element to display remaining time
   *   - statusEl:        element for status text
   *   - progressEl:      element for progress bar
   *   - activeBarEl:     element for active-time progress bar
   */
  function init(config) {
    _dom.activeTimeEl    = config.activeTimeEl    || null;
    _dom.totalTimeEl     = config.totalTimeEl     || null;
    _dom.remainingTimeEl = config.remainingTimeEl || null;
    _dom.statusEl        = config.statusEl        || null;
    _dom.progressEl      = config.progressEl      || null;
    _dom.activeBarEl     = config.activeBarEl     || null;

    // Attempt to recover state from localStorage
    _recoverState();

    // Bind visibility change
    document.addEventListener('visibilitychange', _handleVisibilityChange);

    // Bind user activity
    _bindActivityListeners();

    // Initial display
    _updateDisplay();
    _setStatus(TRACKER_STATUS.IDLE);

    return _publicAPI();
  }

  // ── Start Tracking ──

  /**
   * Start the time tracker. Should be called when session begins.
   */
  function start() {
    if (_running) return;

    // Capture the current session ID for scoping uptime data
    _sessionId = (typeof Auth !== 'undefined' && Auth.getSessionId) ? Auth.getSessionId() : null;

    _running = true;
    _sessionActive = true;
    _lastTickTime = Date.now();

    _startTick();
    _evaluateState();
    _saveState();

    _fire('start', _buildInfo());
  }

  /**
   * Stop the tracker completely.
   */
  function stop() {
    _running = false;
    _sessionActive = false;
    _active = false;

    _stopTick();
    _clearInactivityTimer();

    _setStatus(TRACKER_STATUS.STOPPED);
    _saveState();

    _fire('stop', _buildInfo());
  }

  // ── Event Hooks (called by SessionManager / FaceDetection) ──

  /**
   * Called when face is detected.
   */
  function onFaceDetected() {
    _faceDetected = true;
    _evaluateState();
  }

  /**
   * Called when face is lost (after delay).
   */
  function onFaceLost() {
    _faceDetected = false;
    _evaluateState();
  }

  /**
   * Called when session timer ticks.
   * @param {Object} sessionInfo - from SessionManager tick event
   */
  function onSessionTick(sessionInfo) {
    if (sessionInfo) {
      _sessionElapsed = sessionInfo.elapsed || 0;
      _sessionRemaining = sessionInfo.remaining || 0;
    }
    _updateDisplay();
  }

  /**
   * Called when session expires.
   */
  function onSessionExpired() {
    _sessionActive = false;
    _active = false;
    _stopTick();
    _clearInactivityTimer();
    _setStatus(TRACKER_STATUS.EXPIRED);
    _saveState();
    _fire('expired', _buildInfo());
  }

  // ── State Evaluation ──

  /**
   * Determine if we should be actively counting.
   */
  function _evaluateState() {
    var shouldBeActive = _running
      && _sessionActive
      && _faceDetected
      && _tabVisible
      && _userActive;

    if (shouldBeActive && !_active) {
      // Resume
      _active = true;
      _setStatus(TRACKER_STATUS.TRACKING);
      _fire('resumed', _buildInfo());
    } else if (!shouldBeActive && _active) {
      // Pause
      _active = false;
      _setStatus(_getPauseReason());
      _fire('paused', { reason: _getPauseReasonDetail(), info: _buildInfo() });
    }

    _saveState();
  }

  function _getPauseReason() {
    if (!_sessionActive) return TRACKER_STATUS.EXPIRED;
    if (!_faceDetected) return TRACKER_STATUS.PAUSED;
    if (!_tabVisible) return TRACKER_STATUS.PAUSED;
    if (!_userActive) return TRACKER_STATUS.PAUSED;
    return TRACKER_STATUS.IDLE;
  }

  function _getPauseReasonDetail() {
    if (!_sessionActive) return 'session_expired';
    if (!_faceDetected) return 'no_face';
    if (!_tabVisible) return 'tab_hidden';
    if (!_userActive) return 'inactivity';
    return 'unknown';
  }

  // ── Tick Loop ──

  function _startTick() {
    _stopTick();
    _tickTimer = setInterval(_tick, TICK_INTERVAL);
  }

  function _stopTick() {
    if (_tickTimer) {
      clearInterval(_tickTimer);
      _tickTimer = null;
    }
  }

  function _tick() {
    var now = Date.now();

    if (_active) {
      var delta = Math.round((now - _lastTickTime) / 1000);
      if (delta > 0) {
        _activeSeconds += delta;
        _saveState();
      }
    }

    _lastTickTime = now;
    _updateDisplay();
    _fire('tick', _buildInfo());
  }

  // ── Tab Visibility ──

  function _handleVisibilityChange() {
    _tabVisible = !document.hidden;

    if (!_tabVisible) {
      // Tab hidden — pause immediately
      _evaluateState();
    } else {
      // Tab visible — reset lastTickTime to avoid jump
      _lastTickTime = Date.now();
      _evaluateState();
    }
  }

  // ── User Activity (inactivity detection) ──

  function _bindActivityListeners() {
    var events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    var handler = _debounce(_onUserActivity, 500);

    events.forEach(function (evt) {
      document.addEventListener(evt, handler, { passive: true });
    });
  }

  function _onUserActivity() {
    var wasInactive = !_userActive;
    _userActive = true;

    _resetInactivityTimer();

    if (wasInactive) {
      _evaluateState();
    }
  }

  function _resetInactivityTimer() {
    _clearInactivityTimer();
    _inactivityTimer = setTimeout(function () {
      _userActive = false;
      _evaluateState();
    }, INACTIVITY_TIMEOUT);
  }

  function _clearInactivityTimer() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
  }

  function _debounce(fn, delay) {
    var timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  // ── Persistence ──

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: _sessionId,
        activeSeconds: _activeSeconds,
        sessionElapsed: _sessionElapsed,
        sessionRemaining: _sessionRemaining,
        sessionActive: _sessionActive,
        savedAt: Date.now()
      }));
    } catch (e) { /* quota exceeded */ }
  }

  function _recoverState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      var saved = JSON.parse(raw);
      if (!saved || typeof saved.activeSeconds !== 'number') return;

      // Get the current session ID to scope recovery
      var currentSessionId = (typeof Auth !== 'undefined' && Auth.getSessionId) ? Auth.getSessionId() : null;

      // If the saved data belongs to a different session, discard it
      if (saved.sessionId && currentSessionId && saved.sessionId !== currentSessionId) {
        clearState();
        return;
      }

      _sessionId = saved.sessionId || currentSessionId;
      _activeSeconds = saved.activeSeconds;
      _sessionElapsed = saved.sessionElapsed || 0;
      _sessionRemaining = saved.sessionRemaining || 0;
    } catch (e) {
      // corrupt data, ignore
    }
  }

  function clearState() {
    _activeSeconds = 0;
    _sessionElapsed = 0;
    _sessionRemaining = 0;
    _sessionId = null;
    localStorage.removeItem(STORAGE_KEY);
    _updateDisplay();
  }

  // ── Display Updates ──

  function _updateDisplay() {
    if (_dom.activeTimeEl) {
      _dom.activeTimeEl.textContent = _formatTime(_activeSeconds);
    }

    if (_dom.totalTimeEl) {
      _dom.totalTimeEl.textContent = _formatTime(_sessionElapsed);
    }

    if (_dom.remainingTimeEl) {
      _dom.remainingTimeEl.textContent = _formatTime(_sessionRemaining);
    }

    if (_dom.progressEl) {
      var pct = LAB_DURATION > 0 ? Math.min((_sessionElapsed / LAB_DURATION) * 100, 100) : 0;
      _dom.progressEl.style.width = pct + '%';
    }

    if (_dom.activeBarEl) {
      var activePct = LAB_DURATION > 0 ? Math.min((_activeSeconds / LAB_DURATION) * 100, 100) : 0;
      _dom.activeBarEl.style.width = activePct + '%';
    }
  }

  function _setStatus(code) {
    if (_dom.statusEl) {
      _dom.statusEl.textContent = TRACKER_STATUS_TEXT[code] || 'UNKNOWN';
      _dom.statusEl.className = 'tracker-status';
      _dom.statusEl.classList.add('tracker-status--' + code);
    }
  }

  function _formatTime(seconds) {
    if (seconds <= 0) return '00:00:00';
    var h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    var m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    var s = String(seconds % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  // ── Accessors ──

  function getActiveSeconds() { return _activeSeconds; }
  function getSessionElapsed() { return _sessionElapsed; }
  function getSessionRemaining() { return _sessionRemaining; }
  function isActive() { return _active; }
  function isRunning() { return _running; }
  function getActiveFormatted() { return _formatTime(_activeSeconds); }
  function getTotalFormatted() { return _formatTime(_sessionElapsed); }
  function getRemainingFormatted() { return _formatTime(_sessionRemaining); }

  function getActivePercentage() {
    return LAB_DURATION > 0 ? Math.min((_activeSeconds / LAB_DURATION) * 100, 100) : 0;
  }

  function _buildInfo() {
    return {
      activeSeconds: _activeSeconds,
      activeFormatted: _formatTime(_activeSeconds),
      sessionElapsed: _sessionElapsed,
      sessionElapsedFormatted: _formatTime(_sessionElapsed),
      sessionRemaining: _sessionRemaining,
      sessionRemainingFormatted: _formatTime(_sessionRemaining),
      activePercentage: getActivePercentage(),
      isTracking: _active,
      isRunning: _running
    };
  }

  // ── Event System ──

  /**
   * Events: start, stop, tick, paused, resumed, expired
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
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      TRACKER_STATUS: TRACKER_STATUS,
      init: init,
      start: start,
      stop: stop,
      onFaceDetected: onFaceDetected,
      onFaceLost: onFaceLost,
      onSessionTick: onSessionTick,
      onSessionExpired: onSessionExpired,
      getActiveSeconds: getActiveSeconds,
      getSessionElapsed: getSessionElapsed,
      getSessionRemaining: getSessionRemaining,
      getActiveFormatted: getActiveFormatted,
      getTotalFormatted: getTotalFormatted,
      getRemainingFormatted: getRemainingFormatted,
      getActivePercentage: getActivePercentage,
      isActive: isActive,
      isRunning: isRunning,
      clearState: clearState,
      on: on,
      off: off,
      destroy: destroy
    };
  }

  return {
    TRACKER_STATUS: TRACKER_STATUS,
    init: init,
    start: start,
    stop: stop,
    onFaceDetected: onFaceDetected,
    onFaceLost: onFaceLost,
    onSessionTick: onSessionTick,
    onSessionExpired: onSessionExpired,
    getActiveSeconds: getActiveSeconds,
    getSessionElapsed: getSessionElapsed,
    getSessionRemaining: getSessionRemaining,
    getActiveFormatted: getActiveFormatted,
    getTotalFormatted: getTotalFormatted,
    getRemainingFormatted: getRemainingFormatted,
    getActivePercentage: getActivePercentage,
    isActive: isActive,
    isRunning: isRunning,
    clearState: clearState,
    on: on,
    off: off,
    destroy: destroy
  };
})();

/**
 * SESSION MANAGER — Lab Session Lifecycle & Countdown
 */
var SessionManager = (function () {
  'use strict';

  // ── Constants ──
  var LAB_KEY = 'sys_lab_session';
  var ATTENDANCE_KEY = 'sys_attendance_records';
  var LAB_DURATION = 2 * 60 * 60; // 2 hours in seconds
  var WARNING_THRESHOLDS = [15 * 60, 5 * 60]; // 15min, 5min in seconds

  // ── State ──
  var _timer = null;
  var _callbacks = {};
  var _warningsFired = {};
  var _webcamStream = null;

  // ── Storage Helpers ──
  function _save(state) {
    try {
      localStorage.setItem(LAB_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage full or unavailable
    }
  }

  function _load() {
    try {
      var raw = localStorage.getItem(LAB_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _clear() {
    localStorage.removeItem(LAB_KEY);
  }

  // ── Attendance Records Management ──
  function _getAttendanceRecords() {
    try {
      var raw = localStorage.getItem(ATTENDANCE_KEY);
      if (!raw) return [];
      var records = JSON.parse(raw);
      if (!Array.isArray(records)) return [];
      // Deduplicate on load — keep latest entry per USN+sessionKey
      var deduped = _deduplicateAttendance(records);
      if (deduped.length !== records.length) {
        _saveAttendanceRecords(deduped);
      }
      return deduped;
    } catch (e) {
      return [];
    }
  }

  function _saveAttendanceRecords(records) {
    try {
      // Deduplicate before persisting
      var deduped = _deduplicateAttendance(records);
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(deduped));
    } catch (e) {
      // Storage full or unavailable
    }
  }

  /**
   * Remove duplicate attendance records.
   * Uniqueness key: USN + sessionKey (derived from sessionStart timestamp).
   * Keeps the latest markedAt entry when duplicates exist.
   */
  function _deduplicateAttendance(records) {
    var seen = {};
    var result = [];

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || !r.usn) continue;

      var key = r.usn + '|' + (r.sessionKey || r.sessionStart || '');
      var existing = seen[key];

      if (!existing) {
        seen[key] = r;
        result.push(r);
      } else {
        // Keep the one with the more recent markedAt
        if ((r.markedAt || 0) >= (existing.markedAt || 0)) {
          seen[key] = r;
          for (var j = 0; j < result.length; j++) {
            if (result[j] === existing) {
              result[j] = r;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Generate a unique session key based on date and session start time.
   */
  function _generateSessionKey(sessionStartTimestamp) {
    var date = new Date(sessionStartTimestamp * 1000);
    var dateStr = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
    var timeStr = String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0');
    return dateStr + '_' + timeStr;
  }

  /**
   * Check if attendance already exists for a given USN and session.
   */
  function _isDuplicateAttendance(usn, sessionStartTimestamp) {
    var records = _getAttendanceRecords();
    var sessionKey = _generateSessionKey(sessionStartTimestamp);
    var normalizedUsn = usn.trim().toUpperCase();

    for (var i = 0; i < records.length; i++) {
      if (records[i].usn === normalizedUsn && records[i].sessionKey === sessionKey) {
        return true;
      }
    }
    return false;
  }

  // ── Time Formatting ──
  function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return '00:00:00';
    var h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    var m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    var s = String(totalSeconds % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function _now() {
    return Math.floor(Date.now() / 1000);
  }

  // ── Session Lifecycle ──

  /**
   * Start a new lab session or recover an existing one.
   * Returns the session state object.
   */
  function start() {
    var currentSessionId = (typeof Auth !== 'undefined' && Auth.getSessionId) ? Auth.getSessionId() : null;
    var existing = _load();

    // Recovery: session exists, hasn't expired, and belongs to the current student session
    if (existing && existing.startedAt && !_isExpired(existing)) {
      // Session ID mismatch — stale lab session from a different login
      // Also treat missing sessionId as stale (from old sessions before IDs were added)
      if (!existing.sessionId || !currentSessionId || existing.sessionId !== currentSessionId) {
        _clear();
      } else {
        _warningsFired = {};
        existing.status = 'active';
        _save(existing);
        _startTick();
        _fire('start', _buildSessionInfo(existing));
        return existing;
      }
    } else if (existing && existing.startedAt && _isExpired(existing)) {
      // Expired — clear it
      _clear();
    }

    // Fresh session
    var state = {
      sessionId: currentSessionId,
      startedAt: _now(),
      duration: LAB_DURATION,
      status: 'active',
      attendanceMarked: false,
      warningsSent: []
    };

    _save(state);
    _warningsFired = {};
    _startTick();
    _fire('start', _buildSessionInfo(state));
    return state;
  }

  /**
   * Stop the current session (manual or auto-expiry).
   */
  function stop(reason) {
    _stopTick();

    var state = _load();
    if (state) {
      state.status = 'expired';
      state.stoppedAt = _now();
      state.stopReason = reason || 'manual';
      _save(state);
    }

    _fire('stop', {
      reason: reason || 'manual',
      session: state ? _buildSessionInfo(state) : null
    });
  }

  /**
   * Check if a session is currently active.
   */
  function isActive() {
    var state = _load();
    return state !== null && state.status === 'active' && !_isExpired(state);
  }

  /**
   * Get the remaining seconds for the current session.
   */
  function getRemaining() {
    var state = _load();
    if (!state || !state.startedAt) return 0;
    var elapsed = _now() - state.startedAt;
    var remaining = LAB_DURATION - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Get formatted remaining time HH:MM:SS.
   */
  function getRemainingFormatted() {
    return formatTime(getRemaining());
  }

  /**
   * Get elapsed seconds since session start.
   */
  function getElapsed() {
    var state = _load();
    if (!state || !state.startedAt) return 0;
    return _now() - state.startedAt;
  }

  /**
   * Get progress percentage (0-100).
   */
  function getProgress() {
    var elapsed = getElapsed();
    return Math.min((elapsed / LAB_DURATION) * 100, 100);
  }

  /**
   * Check if attendance can be marked.
   * @param {string} usn - Student USN to check for duplicates
   * @returns {object} { canMark: boolean, reason: string }
   */
  function canMarkAttendance(usn) {
    var state = _load();
    if (!state || state.status !== 'active') {
      return { canMark: false, reason: 'No active lab session.' };
    }
    if (_isExpired(state)) {
      return { canMark: false, reason: 'Lab session has expired.' };
    }
    if (state.attendanceMarked) {
      return { canMark: false, reason: 'Attendance already marked for this session.' };
    }
    if (usn && _isDuplicateAttendance(usn, state.startedAt)) {
      return { canMark: false, reason: 'Attendance already marked for this session.' };
    }
    return { canMark: true, reason: '' };
  }

  /**
   * Mark attendance. Returns result object.
   * @param {string} usn - Student USN
   * @param {string} studentName - Student name
   * @returns {object} { success: boolean, message: string }
   */
  function markAttendance(usn, studentName) {
    if (!usn) {
      return { success: false, message: 'USN is required to mark attendance.' };
    }

    var state = _load();
    if (!state || state.status !== 'active') {
      return { success: false, message: 'No active lab session.' };
    }

    if (_isExpired(state)) {
      return { success: false, message: 'Lab session has expired.' };
    }

    if (state.attendanceMarked) {
      return { success: false, message: 'Attendance already marked for this session.' };
    }

    if (_isDuplicateAttendance(usn, state.startedAt)) {
      return { success: false, message: 'Attendance already marked for this session.' };
    }

    // Mark attendance in session state
    state.attendanceMarked = true;
    state.attendanceAt = _now();
    _save(state);

    // Save attendance record
    var records = _getAttendanceRecords();
    var sessionKey = _generateSessionKey(state.startedAt);
    var labName = '';
    try {
      var studentSession = (typeof Auth !== 'undefined') ? Auth.getStudentSession() : null;
      if (studentSession && studentSession.lab) labName = studentSession.lab;
    } catch (e) { /* ignore */ }

    records.push({
      usn: usn.trim().toUpperCase(),
      name: studentName || 'Unknown',
      lab: labName,
      sessionKey: sessionKey,
      sessionStart: state.startedAt,
      markedAt: _now(),
      markedAtFormatted: new Date(_now() * 1000).toLocaleString()
    });
    _saveAttendanceRecords(records);

    _fire('attendance', {
      time: state.attendanceAt,
      usn: usn.trim().toUpperCase(),
      session: _buildSessionInfo(state)
    });

    return { success: true, message: 'Attendance marked successfully.' };
  }

  /**
   * Check if attendance is already marked for current session.
   */
  function isAttendanceMarked() {
    var state = _load();
    return state ? state.attendanceMarked === true : false;
  }

  /**
   * Get all attendance records.
   */
  function getAttendanceRecords() {
    return _getAttendanceRecords();
  }

  /**
   * Check if a specific USN has attendance for current session.
   */
  function hasAttendanceForSession(usn) {
    var state = _load();
    if (!state || !state.startedAt) return false;
    return _isDuplicateAttendance(usn, state.startedAt);
  }

  // ── Internal Helpers ──

  function _isExpired(state) {
    if (!state || !state.startedAt) return true;
    return (_now() - state.startedAt) >= LAB_DURATION;
  }

  function _buildSessionInfo(state) {
    var elapsed = _now() - state.startedAt;
    var remaining = Math.max(LAB_DURATION - elapsed, 0);
    return {
      sessionId: state.sessionId || null,
      startedAt: state.startedAt,
      elapsed: elapsed,
      remaining: remaining,
      remainingFormatted: formatTime(remaining),
      progress: Math.min((elapsed / LAB_DURATION) * 100, 100),
      attendanceMarked: state.attendanceMarked,
      status: state.status
    };
  }

  // ── Tick / Countdown ──

  function _startTick() {
    _stopTick();
    _tick(); // immediate first tick
    _timer = setInterval(_tick, 1000);
  }

  function _stopTick() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  function _tick() {
    var state = _load();
    if (!state || state.status !== 'active') {
      _stopTick();
      return;
    }

    var remaining = getRemaining();

    // Fire tick callback with current info
    _fire('tick', _buildSessionInfo(state));

    // Check warnings
    _checkWarnings(remaining);

    // Check expiry
    if (remaining <= 0) {
      _handleExpiry();
    }
  }

  function _checkWarnings(remaining) {
    for (var i = 0; i < WARNING_THRESHOLDS.length; i++) {
      var threshold = WARNING_THRESHOLDS[i];
      if (remaining <= threshold && remaining > 0 && !_warningsFired[threshold]) {
        _warningsFired[threshold] = true;

        var minutes = Math.ceil(threshold / 60);
        var message = minutes + ' minute' + (minutes !== 1 ? 's' : '') + ' remaining!';

        // Record warning in state
        var state = _load();
        if (state) {
          state.warningsSent.push({
            threshold: threshold,
            sentAt: _now(),
            remaining: remaining
          });
          _save(state);
        }

        _fire('warning', {
          message: message,
          minutes: minutes,
          remaining: remaining,
          remainingFormatted: formatTime(remaining)
        });
      }
    }
  }

  function _handleExpiry() {
    _stopTick();

    var state = _load();
    if (state) {
      state.status = 'expired';
      state.stoppedAt = _now();
      state.stopReason = 'timeout';
      _save(state);
    }

    _fire('expired', {
      message: 'Lab session has expired.',
      session: state ? _buildSessionInfo(state) : null
    });

    // Auto cleanup after a brief delay to allow UI to render expiry state
    setTimeout(function () {
      cleanup();
    }, 3000);
  }

  // ── Cleanup (webcam, attendance, logout) ──

  function cleanup() {
    // Stop webcam stream
    stopWebcam();

    // Clear attendance state from storage
    _clearAttendanceState();

    // Destroy student session and redirect to login
    Auth.destroyStudentSession();
    window.location.href = 'student-login.html';
  }

  function stopWebcam() {
    _webcamStream = null;

    // Stop video elements directly
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      if (videos[i].srcObject) {
        var tracks = videos[i].srcObject.getTracks();
        for (var j = 0; j < tracks.length; j++) {
          tracks[j].stop();
        }
        videos[i].srcObject = null;
      }
    }

    // Reset webcam UI elements
    var webcamStatus = document.getElementById('webcamStatus');
    if (webcamStatus) {
      webcamStatus.textContent = 'CAMERA INACTIVE';
      webcamStatus.classList.remove('active');
    }

    var webcamOverlay = document.getElementById('webcamOverlay');
    if (webcamOverlay) {
      webcamOverlay.style.display = '';
    }
  }

  function _clearAttendanceState() {
    // Clear any attendance-related storage keys
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('attendance') !== -1) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function (k) {
      localStorage.removeItem(k);
    });

    // Reset attendance in lab session if still in storage
    var state = _load();
    if (state) {
      state.attendanceMarked = false;
      state.attendanceAt = null;
      _save(state);
    }
  }

  // ── Register Webcam Stream ──

  /**
   * Register the active webcam stream so it can be stopped on expiry.
   */
  function registerWebcam(stream) {
    _webcamStream = stream;
  }

  // ── Event System ──

  /**
   * Register a callback for a session event.
   * Events: start, tick, warning, expired, stop, attendance
   */
  function on(event, callback) {
    if (!_callbacks[event]) {
      _callbacks[event] = [];
    }
    _callbacks[event].push(callback);
  }

  /**
   * Remove a callback.
   */
  function off(event, callback) {
    if (!_callbacks[event]) return;
    _callbacks[event] = _callbacks[event].filter(function (cb) {
      return cb !== callback;
    });
  }

  function _fire(event, data) {
    var cbs = _callbacks[event];
    if (!cbs) return;
    for (var i = 0; i < cbs.length; i++) {
      try {
        cbs[i](data);
      } catch (e) {
        // Prevent callback errors from breaking the timer
      }
    }
  }

  // ── Destroy ──

  /**
   * Fully reset the session manager state.
   */
  function destroy() {
    _stopTick();
    _clear();
    _callbacks = {};
    _warningsFired = {};
    _webcamStream = null;
  }

  // ── Public API ──

  return {
    LAB_DURATION: LAB_DURATION,

    // Lifecycle
    start: start,
    stop: stop,
    isActive: isActive,
    destroy: destroy,

    // Query
    getSessionId: function () {
      var state = _load();
      return state ? state.sessionId : null;
    },
    getRemaining: getRemaining,
    getRemainingFormatted: getRemainingFormatted,
    getElapsed: getElapsed,
    getProgress: getProgress,
    formatTime: formatTime,

    // Attendance
    canMarkAttendance: canMarkAttendance,
    markAttendance: markAttendance,
    isAttendanceMarked: isAttendanceMarked,
    hasAttendanceForSession: hasAttendanceForSession,
    getAttendanceRecords: getAttendanceRecords,

    // Webcam
    stopWebcam: stopWebcam,
    registerWebcam: registerWebcam,

    // Cleanup (explicit)
    cleanup: cleanup,

    // Events
    on: on,
    off: off
  };
})();

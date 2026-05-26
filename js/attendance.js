/**
 * ATTENDANCE MODULE — Attendance Tracking, History & Analytics
 *
 * Features:
 *   - Current attendance status
 *   - Face detection integration
 *   - Attendance percentage & statistics
 *   - Daily attendance records
 *   - Duplicate prevention (delegates to SessionManager)
 *   - Session-based tracking
 */
var Attendance = (function () {
  'use strict';

  // ── Constants ──
  var HISTORY_KEY = 'sys_attendance_history';
  var LATE_THRESHOLD_MINUTES = 10; // 10 min after session start = late

  // ── Storage ──
  function _getHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveHistory(records) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
    } catch (e) { /* quota */ }
  }

  // ── Core Status ──

  /**
   * Get the current attendance status for the active session.
   * @returns {object} { marked, faceStatus, canMark, sessionInfo }
   */
  function getStatus() {
    var session = (typeof Auth !== 'undefined') ? Auth.getStudentSession() : null;
    var usn = session ? session.userId : null;

    var marked = SessionManager.isAttendanceMarked();
    var canMark = usn ? SessionManager.canMarkAttendance(usn) : { canMark: false, reason: 'Not logged in.' };
    var sessionActive = SessionManager.isActive();
    var remaining = SessionManager.getRemaining();

    // Face detection status
    var faceStatus = _getFaceStatus();

    return {
      marked: marked,
      canMark: canMark.canMark,
      canMarkReason: canMark.reason,
      sessionActive: sessionActive,
      sessionRemaining: remaining,
      sessionRemainingFormatted: SessionManager.formatTime(remaining),
      faceStatus: faceStatus,
      usn: usn
    };
  }

  /**
   * Get face detection status summary.
   * Uses FaceDetection public API: isRunning(), isTimerPaused(), getFaceCount()
   */
  function _getFaceStatus() {
    if (typeof FaceDetection === 'undefined') {
      return { status: 'unavailable', label: 'N/A', active: false };
    }

    try {
      var running = FaceDetection.isRunning();
      if (!running) {
        return { status: 'idle', label: 'IDLE', active: false };
      }

      var timerPaused = FaceDetection.isTimerPaused();
      var faceCount = FaceDetection.getFaceCount();

      if (timerPaused) {
        return { status: 'timer_paused', label: 'TIMER PAUSED', active: false };
      }
      if (faceCount > 1) {
        return { status: 'multi_face', label: 'MULTI FACE', active: false };
      }
      if (faceCount === 1) {
        return { status: 'face_found', label: 'FACE DETECTED', active: true };
      }
      if (faceCount === 0) {
        return { status: 'no_face', label: 'NO FACE', active: false };
      }

      return { status: 'detecting', label: 'SCANNING', active: true };
    } catch (e) {
      return { status: 'error', label: 'ERROR', active: false };
    }
  }

  // ── Mark Attendance ──

  /**
   * Attempt to mark attendance for the current session.
   * Handles duplicate prevention via SessionManager.
   * @returns {object} { success, message }
   */
  function mark() {
    var session = (typeof Auth !== 'undefined') ? Auth.getStudentSession() : null;
    if (!session) {
      return { success: false, message: 'Not logged in.' };
    }

    var result = SessionManager.markAttendance(session.userId, session.name);

    if (result.success) {
      // Record in attendance history
      _recordAttendance(session);
    }

    return result;
  }

  function _recordAttendance(session) {
    var history = _getHistory();
    var now = new Date();
    var elapsed = SessionManager.getElapsed();

    // Determine if late
    var isLate = elapsed > (LATE_THRESHOLD_MINUTES * 60);

    history.push({
      usn: session.userId,
      name: session.name,
      lab: session.lab || 'Unknown Lab',
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Math.floor(Date.now() / 1000),
      sessionStart: Math.floor(Date.now() / 1000) - elapsed,
      late: isLate,
      faceStatus: _getFaceStatus().label
    });

    // Keep last 200 records
    if (history.length > 200) {
      history = history.slice(-200);
    }

    _saveHistory(history);
  }

  // ── Statistics ──

  /**
   * Get attendance statistics.
   * @returns {object} Stats summary
   */
  function getStats() {
    var history = _getHistory();
    var today = new Date().toISOString().split('T')[0];

    var totalDays = history.length;
    var presentDays = 0;
    var lateDays = 0;
    var todayMarked = false;

    // Count unique dates
    var uniqueDates = {};
    for (var i = 0; i < history.length; i++) {
      var r = history[i];
      uniqueDates[r.date] = true;
      if (r.late) lateDays++;
      if (r.date === today) todayMarked = true;
    }

    presentDays = Object.keys(uniqueDates).length;

    // Attendance percentage — based on expected sessions (assume 5 days/week, current week)
    var expectedDays = _getExpectedDays();
    var percentage = expectedDays > 0 ? Math.round((presentDays / expectedDays) * 100) : 0;
    if (percentage > 100) percentage = 100;

    // Current streak
    var streak = _calculateStreak(history);

    return {
      presentDays: presentDays,
      lateDays: lateDays,
      absentDays: Math.max(expectedDays - presentDays, 0),
      totalDays: totalDays,
      expectedDays: expectedDays,
      percentage: percentage,
      streak: streak,
      todayMarked: todayMarked
    };
  }

  function _getExpectedDays() {
    // Count weekdays in current week (Mon-Fri)
    var now = new Date();
    var dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    // Expected = weekdays elapsed this week (Mon to today)
    var expected = 0;
    for (var d = 1; d <= 5; d++) { // Mon=1 to Fri=5
      if (d <= dayOfWeek || dayOfWeek === 0) {
        expected++;
      }
    }
    // If Sunday, count full week
    if (dayOfWeek === 0) expected = 5;
    return Math.max(expected, 1); // At least 1
  }

  function _calculateStreak(history) {
    if (history.length === 0) return 0;

    // Get unique dates sorted descending
    var dates = [];
    var seen = {};
    for (var i = 0; i < history.length; i++) {
      if (!seen[history[i].date]) {
        seen[history[i].date] = true;
        dates.push(history[i].date);
      }
    }
    dates.sort().reverse();

    // Count consecutive days from today
    var streak = 0;
    var today = new Date();
    var checkDate = new Date(today);

    for (var j = 0; j < dates.length; j++) {
      var dateStr = checkDate.toISOString().split('T')[0];
      if (dates[j] === dateStr) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (dates[j] < dateStr) {
        break;
      }
    }

    return streak;
  }

  // ── Daily Records ──

  /**
   * Get today's attendance records.
   * @returns {array} Today's records
   */
  function getTodayRecords() {
    var history = _getHistory();
    var today = new Date().toISOString().split('T')[0];
    var records = [];

    for (var i = 0; i < history.length; i++) {
      if (history[i].date === today) {
        records.push(history[i]);
      }
    }

    return records;
  }

  /**
   * Get recent attendance history.
   * @param {number} limit - Max records
   * @returns {array} Recent records
   */
  function getRecentHistory(limit) {
    var history = _getHistory();
    if (limit) {
      return history.slice(-limit).reverse();
    }
    return history.reverse();
  }

  /**
   * Get attendance records grouped by date.
   * @param {number} days - Number of days to include
   * @returns {array} Array of { date, records } objects
   */
  function getGroupedByDate(days) {
    var history = _getHistory();
    var grouped = {};
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days || 7));
    var cutoffStr = cutoff.toISOString().split('T')[0];

    for (var i = 0; i < history.length; i++) {
      var r = history[i];
      if (r.date >= cutoffStr) {
        if (!grouped[r.date]) grouped[r.date] = [];
        grouped[r.date].push(r);
      }
    }

    var result = [];
    var dates = Object.keys(grouped).sort().reverse();
    for (var j = 0; j < dates.length; j++) {
      result.push({ date: dates[j], records: grouped[dates[j]] });
    }

    return result;
  }

  // ── Renderers ──

  /**
   * Render the current status card.
   */
  function renderStatus(container) {
    if (!container) return;

    var status = getStatus();
    var stats = getStats();

    // Status badge
    var statusEl = container.querySelector('#attStatusBadge');
    if (statusEl) {
      if (status.marked) {
        statusEl.textContent = 'PRESENT';
        statusEl.className = 'tracker-status tracker-status--tracking';
      } else if (status.sessionActive) {
        statusEl.textContent = 'NOT MARKED';
        statusEl.className = 'tracker-status tracker-status--paused';
      } else {
        statusEl.textContent = 'NO SESSION';
        statusEl.className = 'tracker-status';
      }
    }

    // Face status
    var faceEl = container.querySelector('#attFaceStatus');
    if (faceEl) {
      faceEl.textContent = status.faceStatus.label;
      faceEl.className = 'tracker__row-value' + (status.faceStatus.active ? ' tracker__row-value--active' : '');
    }

    // Session remaining
    var remainEl = container.querySelector('#attSessionRemaining');
    if (remainEl) {
      remainEl.textContent = status.sessionActive ? status.sessionRemainingFormatted : '--:--:--';
    }

    // Mark button state
    var markBtn = container.querySelector('#attMarkBtn');
    if (markBtn) {
      if (status.marked) {
        markBtn.textContent = 'MARKED';
        markBtn.disabled = true;
        markBtn.className = 'webcam__btn webcam__btn--primary';
      } else if (status.canMark) {
        markBtn.textContent = 'MARK ATTENDANCE';
        markBtn.disabled = false;
        markBtn.className = 'webcam__btn webcam__btn--primary';
      } else {
        markBtn.textContent = 'UNAVAILABLE';
        markBtn.disabled = true;
        markBtn.className = 'webcam__btn webcam__btn--secondary';
      }
    }

    // Mark reason
    var reasonEl = container.querySelector('#attMarkReason');
    if (reasonEl) {
      if (status.marked) {
        reasonEl.textContent = 'Attendance recorded for this session';
      } else if (!status.canMark && status.canMarkReason) {
        reasonEl.textContent = status.canMarkReason;
      } else {
        reasonEl.textContent = '';
      }
    }
  }

  /**
   * Render the statistics card.
   */
  function renderStats(container) {
    if (!container) return;

    var stats = getStats();

    var pctEl = container.querySelector('#attPercentage');
    if (pctEl) pctEl.textContent = stats.percentage + '%';

    var presentEl = container.querySelector('#attPresentDays');
    if (presentEl) presentEl.textContent = stats.presentDays;

    var lateEl = container.querySelector('#attLateDays');
    if (lateEl) lateEl.textContent = stats.lateDays;

    var absentEl = container.querySelector('#attAbsentDays');
    if (absentEl) absentEl.textContent = stats.absentDays;

    var streakEl = container.querySelector('#attStreak');
    if (streakEl) streakEl.textContent = stats.streak + ' days';

    var totalEl = container.querySelector('#attTotalDays');
    if (totalEl) totalEl.textContent = stats.totalDays;
  }

  /**
   * Render today's attendance records.
   */
  function renderTodayRecords(listEl) {
    if (!listEl) return;

    var records = getTodayRecords();
    if (records.length === 0) {
      listEl.innerHTML = '<div class="security-log__empty">No attendance recorded today</div>';
      return;
    }

    var html = '';
    for (var i = records.length - 1; i >= 0; i--) {
      var r = records[i];
      var statusClass = r.late ? 'security-log__item--medium' : 'security-log__item--low';
      var icon = r.late ? '⏱' : '✓';

      html += '<div class="security-log__item ' + statusClass + '">';
      html += '  <span class="security-log__icon">' + icon + '</span>';
      html += '  <span class="security-log__label">' + _esc(r.time) + (r.late ? ' (Late)' : '') + (r.lab ? ' — ' + _esc(r.lab) : '') + '</span>';
      html += '  <span class="security-log__time">' + _esc(r.faceStatus || '') + '</span>';
      html += '</div>';
    }

    listEl.innerHTML = html;
  }

  /**
   * Render attendance history grouped by date.
   */
  function renderHistory(listEl) {
    if (!listEl) return;

    var grouped = getGroupedByDate(7);
    if (grouped.length === 0) {
      listEl.innerHTML = '<div class="security-log__empty">No attendance history yet</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < grouped.length; i++) {
      var day = grouped[i];
      var count = day.records.length;
      var hasLate = false;
      for (var j = 0; j < day.records.length; j++) {
        if (day.records[j].late) { hasLate = true; break; }
      }

      var statusClass = hasLate ? 'security-log__item--medium' : 'security-log__item--low';
      var icon = hasLate ? '⏱' : '✓';

      // Get lab name from first record of the day
      var labName = day.records[0] && day.records[0].lab ? day.records[0].lab : '';

      html += '<div class="security-log__item ' + statusClass + '">';
      html += '  <span class="security-log__icon">' + icon + '</span>';
      html += '  <span class="security-log__label">' + _formatDate(day.date) + (labName ? ' — ' + _esc(labName) : '') + '</span>';
      html += '  <span class="security-log__time">' + count + ' record' + (count > 1 ? 's' : '') + '</span>';
      html += '</div>';
    }

    listEl.innerHTML = html;
  }

  function _formatDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
  }

  function _esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Public API ──
  return {
    getStatus: getStatus,
    getStats: getStats,
    mark: mark,
    getTodayRecords: getTodayRecords,
    getRecentHistory: getRecentHistory,
    getGroupedByDate: getGroupedByDate,
    renderStatus: renderStatus,
    renderStats: renderStats,
    renderTodayRecords: renderTodayRecords,
    renderHistory: renderHistory
  };
})();

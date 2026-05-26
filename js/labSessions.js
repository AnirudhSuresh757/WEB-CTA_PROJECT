/**
 * LAB SESSIONS MODULE — Session Schedule, History & Status
 *
 * Manages session lifecycle display:
 *   - Active session with live countdown
 *   - Upcoming scheduled sessions
 *   - Completed session history
 */
var LabSessions = (function () {
  'use strict';

  // ── Constants ──
  var HISTORY_KEY = 'sys_session_history';
  var LAB_DURATION = 2 * 60 * 60; // 2 hours

  // ── Default Schedule ──
  var DEFAULT_SCHEDULE = [
    { id: 'slot-01', day: 'Mon', startHour: 9,  endHour: 11, label: 'Morning Lab' },
    { id: 'slot-02', day: 'Mon', startHour: 14, endHour: 16, label: 'Afternoon Lab' },
    { id: 'slot-03', day: 'Tue', startHour: 10, endHour: 12, label: 'Morning Lab' },
    { id: 'slot-04', day: 'Wed', startHour: 9,  endHour: 11, label: 'Morning Lab' },
    { id: 'slot-05', day: 'Wed', startHour: 14, endHour: 16, label: 'Afternoon Lab' },
    { id: 'slot-06', day: 'Thu', startHour: 10, endHour: 12, label: 'Morning Lab' },
    { id: 'slot-07', day: 'Fri', startHour: 9,  endHour: 11, label: 'Morning Lab' },
    { id: 'slot-08', day: 'Fri', startHour: 14, endHour: 16, label: 'Afternoon Lab' }
  ];

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ── State ──
  var _callbacks = {};

  // ── Storage Helpers ──
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

  // ── Session Status ──

  /**
   * Get the current session status.
   * @returns {object} { status: 'active'|'upcoming'|'completed'|'none', session: {...} }
   */
  function getStatus() {
    var smActive = SessionManager.isActive();
    var remaining = SessionManager.getRemaining();

    if (smActive && remaining > 0) {
      return {
        status: 'active',
        label: 'ACTIVE',
        sessionId: SessionManager.getSessionId(),
        elapsed: SessionManager.getElapsed(),
        remaining: remaining,
        remainingFormatted: SessionManager.getRemainingFormatted(),
        progress: SessionManager.getProgress()
      };
    }

    // Check if session just expired
    var labState = _loadLabState();
    if (labState && labState.status === 'expired') {
      return {
        status: 'completed',
        label: 'COMPLETED',
        sessionId: labState.sessionId,
        startedAt: labState.startedAt,
        stoppedAt: labState.stoppedAt,
        duration: labState.stoppedAt ? labState.stoppedAt - labState.startedAt : LAB_DURATION
      };
    }

    // No active session — check for upcoming
    var upcoming = getNextUpcoming();
    if (upcoming) {
      return {
        status: 'upcoming',
        label: 'UPCOMING',
        next: upcoming
      };
    }

    return { status: 'none', label: 'NO SESSION' };
  }

  function _loadLabState() {
    try {
      var raw = localStorage.getItem('sys_lab_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ── Schedule ──

  /**
   * Get the next upcoming scheduled session.
   * @returns {object|null} Next session slot or null
   */
  function getNextUpcoming() {
    var now = new Date();
    var currentDay = DAY_NAMES[now.getDay()];
    var currentHour = now.getHours();

    // First check today's remaining slots
    for (var i = 0; i < DEFAULT_SCHEDULE.length; i++) {
      var slot = DEFAULT_SCHEDULE[i];
      if (slot.day === currentDay && slot.startHour > currentHour) {
        return _formatSlot(slot, now);
      }
    }

    // Check next days
    var dayIndex = DAY_NAMES.indexOf(currentDay);
    for (var offset = 1; offset <= 7; offset++) {
      var nextDayIndex = (dayIndex + offset) % 7;
      var nextDay = DAY_NAMES[nextDayIndex];
      for (var j = 0; j < DEFAULT_SCHEDULE.length; j++) {
        if (DEFAULT_SCHEDULE[j].day === nextDay) {
          return _formatSlot(DEFAULT_SCHEDULE[j], _getNextDate(now, offset));
        }
      }
    }

    return null;
  }

  /**
   * Get today's scheduled sessions.
   * @returns {array} Array of session slots for today
   */
  function getTodaySchedule() {
    var now = new Date();
    var currentDay = DAY_NAMES[now.getDay()];
    var currentHour = now.getHours();
    var result = [];

    for (var i = 0; i < DEFAULT_SCHEDULE.length; i++) {
      var slot = DEFAULT_SCHEDULE[i];
      if (slot.day === currentDay) {
        var status = 'upcoming';
        if (slot.endHour <= currentHour) {
          status = 'completed';
        } else if (slot.startHour <= currentHour && slot.endHour > currentHour) {
          status = 'active';
        }
        result.push({
          id: slot.id,
          label: slot.label,
          startHour: slot.startHour,
          endHour: slot.endHour,
          startTime: _formatHour(slot.startHour),
          endTime: _formatHour(slot.endHour),
          status: status
        });
      }
    }

    return result;
  }

  function _formatSlot(slot, refDate) {
    var date = refDate || new Date();
    return {
      id: slot.id,
      day: slot.day,
      label: slot.label,
      startHour: slot.startHour,
      endHour: slot.endHour,
      startTime: _formatHour(slot.startHour),
      endTime: _formatHour(slot.endHour),
      dateStr: date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0'),
      isToday: _isToday(date)
    };
  }

  function _formatHour(h) {
    var period = h >= 12 ? 'PM' : 'AM';
    var hour = h % 12 || 12;
    return hour + ':00 ' + period;
  }

  function _isToday(date) {
    var now = new Date();
    return date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
  }

  function _getNextDate(from, daysAhead) {
    var d = new Date(from);
    d.setDate(d.getDate() + daysAhead);
    return d;
  }

  // ── History ──

  /**
   * Record a session in history. Updates existing record if same sessionId exists.
   */
  function recordSession(sessionInfo) {
    var history = _getHistory();
    var sessionId = sessionInfo.sessionId || 'unknown';
    var now = Math.floor(Date.now() / 1000);

    // Check if this session already exists in history (from session start)
    var existing = null;
    for (var i = 0; i < history.length; i++) {
      if (history[i].sessionId === sessionId) {
        existing = history[i];
        break;
      }
    }

    if (existing) {
      // Update existing record with final data
      existing.stoppedAt = now;
      existing.duration = sessionInfo.elapsed || existing.duration || 0;
      existing.attended = sessionInfo.attendanceMarked || existing.attended || false;
      existing.completedAt = new Date().toISOString();
    } else {
      // New record
      history.push({
        sessionId: sessionId,
        startedAt: sessionInfo.startedAt || now,
        stoppedAt: now,
        duration: sessionInfo.elapsed || 0,
        attended: sessionInfo.attendanceMarked || false,
        completedAt: new Date().toISOString()
      });
    }

    // Keep last 50 records
    if (history.length > 50) {
      history = history.slice(-50);
    }

    _saveHistory(history);
  }

  /**
   * Get session history.
   * @param {number} limit - Max records to return
   * @returns {array} Session history records
   */
  function getHistory(limit) {
    var history = _getHistory();
    if (limit) {
      return history.slice(-limit).reverse();
    }
    return history.reverse();
  }

  /**
   * Get session statistics.
   * @returns {object} Stats summary
   */
  function getStats() {
    var history = _getHistory();
    var totalTime = 0;
    var sessionCount = history.length;

    for (var i = 0; i < history.length; i++) {
      totalTime += (history[i].duration || 0);
    }

    var avgTime = sessionCount > 0 ? Math.round(totalTime / sessionCount) : 0;

    // Attendance rate — count history entries that have an attendanceAt timestamp
    var attendedCount = 0;
    for (var j = 0; j < history.length; j++) {
      if (history[j].attended) attendedCount++;
    }
    var attendanceRate = sessionCount > 0
      ? Math.round((attendedCount / sessionCount) * 100)
      : 0;

    return {
      totalSessions: sessionCount,
      totalTime: totalTime,
      totalTimeFormatted: SessionManager.formatTime(totalTime),
      avgTime: avgTime,
      avgTimeFormatted: SessionManager.formatTime(avgTime),
      attendanceRate: attendanceRate
    };
  }

  // ── Renderers ──

  /**
   * Render the current session card.
   */
  function renderCurrentSession(container) {
    if (!container) return;

    var status = getStatus();
    var statusEl = container.querySelector('#labSessionStatus');
    var sessionIdEl = container.querySelector('#labSessionId');
    var startEl = container.querySelector('#labSessionStart');
    var durationEl = container.querySelector('#labSessionDuration');
    var remainingEl = container.querySelector('#labSessionRemaining');
    var progressEl = container.querySelector('#labSessionProgress');

    // Update status badge
    if (statusEl) {
      statusEl.textContent = status.label;
      statusEl.className = 'tracker-status';
      if (status.status === 'active') statusEl.classList.add('tracker-status--tracking');
      else if (status.status === 'completed') statusEl.classList.add('tracker-status--expired');
      else if (status.status === 'upcoming') statusEl.classList.add('tracker-status--paused');
    }

    if (status.status === 'active') {
      if (sessionIdEl) sessionIdEl.textContent = status.sessionId || '--';
      if (startEl) {
        var startDate = new Date((Math.floor(Date.now() / 1000) - status.elapsed) * 1000);
        startEl.textContent = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (durationEl) durationEl.textContent = SessionManager.formatTime(LAB_DURATION);
      if (remainingEl) {
        remainingEl.textContent = status.remainingFormatted;
        remainingEl.className = 'tracker__row-value tracker__row-value--' +
          (status.remaining <= 300 ? 'total' : status.remaining <= 900 ? 'active' : 'remaining');
      }
      if (progressEl) progressEl.style.width = status.progress + '%';
    } else if (status.status === 'completed') {
      if (sessionIdEl) sessionIdEl.textContent = status.sessionId || '--';
      if (startEl) startEl.textContent = status.startedAt
        ? new Date(status.startedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '--';
      if (durationEl) durationEl.textContent = SessionManager.formatTime(status.duration || 0);
      if (remainingEl) {
        remainingEl.textContent = '00:00:00';
        remainingEl.className = 'tracker__row-value tracker__row-value--total';
      }
      if (progressEl) progressEl.style.width = '100%';
    } else if (status.status === 'upcoming') {
      if (sessionIdEl) sessionIdEl.textContent = 'Scheduled';
      if (startEl) startEl.textContent = status.next.startTime;
      if (durationEl) durationEl.textContent = '02:00:00';
      if (remainingEl) {
        remainingEl.textContent = status.next.day + ' ' + status.next.startTime;
        remainingEl.className = 'tracker__row-value tracker__row-value--active';
      }
      if (progressEl) progressEl.style.width = '0%';
    } else {
      if (sessionIdEl) sessionIdEl.textContent = '--';
      if (startEl) startEl.textContent = '--';
      if (durationEl) durationEl.textContent = '02:00:00';
      if (remainingEl) remainingEl.textContent = '--';
      if (progressEl) progressEl.style.width = '0%';
    }
  }

  /**
   * Render session history stats.
   */
  function renderHistoryStats(container) {
    if (!container) return;

    var stats = getStats();
    var totalEl = container.querySelector('#labTotalSessions');
    var timeEl = container.querySelector('#labTotalTime');
    var avgEl = container.querySelector('#labAvgSession');
    var rateEl = container.querySelector('#labAttendanceRate');

    if (totalEl) totalEl.textContent = stats.totalSessions;
    if (timeEl) timeEl.textContent = stats.totalTimeFormatted;
    if (avgEl) avgEl.textContent = stats.avgTimeFormatted;
    if (rateEl) rateEl.textContent = stats.attendanceRate + '%';
  }

  /**
   * Render today's schedule list.
   */
  function renderSchedule(listEl) {
    if (!listEl) return;

    var schedule = getTodaySchedule();
    if (schedule.length === 0) {
      listEl.innerHTML = '<div class="security-log__empty">No sessions scheduled today</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < schedule.length; i++) {
      var s = schedule[i];
      var iconClass = s.status === 'active' ? 'tracker-status--tracking'
        : s.status === 'completed' ? 'tracker-status--expired' : '';

      html += '<div class="tracker__row">';
      html += '  <span class="tracker__row-label">' + _esc(s.label) + '</span>';
      html += '  <span class="tracker__row-value ' + iconClass + '" style="font-size:14px;">';
      html += '    ' + s.startTime + ' — ' + s.endTime;
      html += '  </span>';
      html += '</div>';
    }

    listEl.innerHTML = html;
  }

  /**
   * Render recent session history.
   */
  function renderHistory(listEl) {
    if (!listEl) return;

    var history = getHistory(5);
    if (history.length === 0) {
      listEl.innerHTML = '<div class="security-log__empty">No completed sessions yet</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      var date = h.completedAt ? new Date(h.completedAt) : new Date(h.stoppedAt * 1000);
      var dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      var timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      var dur = SessionManager.formatTime(h.duration || 0);

      html += '<div class="security-log__item security-log__item--low">';
      html += '  <span class="security-log__icon">✓</span>';
      html += '  <span class="security-log__label">' + dateStr + ' at ' + timeStr + '</span>';
      html += '  <span class="security-log__time">' + dur + '</span>';
      html += '</div>';
    }

    listEl.innerHTML = html;
  }

  function _esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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
  return {
    getStatus: getStatus,
    getNextUpcoming: getNextUpcoming,
    getTodaySchedule: getTodaySchedule,
    getHistory: getHistory,
    getStats: getStats,
    recordSession: recordSession,
    renderCurrentSession: renderCurrentSession,
    renderHistoryStats: renderHistoryStats,
    renderSchedule: renderSchedule,
    renderHistory: renderHistory,
    on: on,
    off: off
  };
})();

/**
 * ADMIN MODULE — Faculty/Admin Dashboard Controller
 *
 * Reads real data from localStorage (shared with student dashboard)
 * and renders all admin sections: Dashboard, Attendance, Experiments,
 * Reports, Settings.
 */
var Admin = (function () {
  'use strict';

  // ── State ──
  var _session = null;
  var _students = [];
  var _filtered = [];
  var _refreshTimer = null;
  var _dom = {};

  // ── Initialize ──

  function init() {
    _session = Auth.guardAdminPage();
    if (!_session) return;

    Auth.initDatabase();
    _refreshFromStorage();
    _cacheElements();
    _populateUserInfo();
    _startClock();
    _renderStats();
    _renderTable();
    _renderHeatmap();
    _renderSessionInfo();
    _bindEvents();
    _startAutoRefresh();

    return _publicAPI();
  }

  function _cacheElements() {
    _dom.clock = document.getElementById('navClock');
    _dom.date = document.getElementById('navDate');
    _dom.searchInput = document.getElementById('searchInput');
    _dom.deptFilter = document.getElementById('deptFilter');
    _dom.statusFilter = document.getElementById('statusFilter');
    _dom.tableBody = document.getElementById('studentTableBody');
    _dom.heatmapGrid = document.getElementById('heatmapGrid');
    _dom.sidebar = document.getElementById('sidebar');
    _dom.overlay = document.getElementById('sidebarOverlay');
    _dom.sidebarToggle = document.getElementById('sidebarToggle');
    _dom.btnLogout = document.getElementById('btnLogout');
    _dom.btnExportCsv = document.getElementById('btnExportCsv');
    _dom.btnExportPdf = document.getElementById('btnExportPdf');
    _dom.liveCount = document.getElementById('liveCount');
    _dom.totalStudents = document.getElementById('totalStudents');
    _dom.avgAttendance = document.getElementById('avgAttendance');
    _dom.totalViolations = document.getElementById('totalViolations');
    _dom.avgCompletion = document.getElementById('avgCompletion');
  }

  function _populateUserInfo() {
    document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = _session.name; });
    document.querySelectorAll('[data-user-id]').forEach(function (el) { el.textContent = _session.userId; });
    document.querySelectorAll('[data-user-role]').forEach(function (el) { el.textContent = (_session.role || '').toUpperCase(); });
  }

  // ── Real Data Refresh ──

  function _refreshFromStorage() {
    _students = _loadStudents();
    _filtered = _students.slice();
  }

  function _loadStudents() {
    // Load real registered users
    var users = [];
    try {
      var raw = localStorage.getItem('sys_users');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) users = parsed.filter(function (u) { return u.role === 'student'; });
      }
    } catch (e) { /* ignore */ }

    // If no real students, return empty
    if (users.length === 0) return [];

    // Enrich with attendance, session, and experiment data
    var attendanceHistory = _loadJSON('sys_attendance_history', []);
    var sessionHistory = _loadJSON('sys_session_history', []);
    var labTasks = _loadJSON('sys_lab_tasks', null);
    var violations = _loadJSON('sys_security_log', { violations: [] });
    var violationList = Array.isArray(violations) ? violations : (violations.violations || []);

    return users.map(function (u) {
      var usn = (u.id || '').toUpperCase();

      // Attendance for this student
      var studentAtt = attendanceHistory.filter(function (a) { return (a.usn || '').toUpperCase() === usn; });
      var uniqueDays = {};
      studentAtt.forEach(function (a) { if (a.date) uniqueDays[a.date] = true; });
      var presentDays = Object.keys(uniqueDays).length;
      var lateDays = studentAtt.filter(function (a) { return a.late; }).length;

      // Expected days: weekdays in current week
      var now = new Date();
      var dayOfWeek = now.getDay();
      var expected = 0;
      for (var d = 1; d <= 5; d++) {
        if (d <= dayOfWeek || dayOfWeek === 0) expected++;
      }
      if (dayOfWeek === 0) expected = 5;
      expected = Math.max(expected, 1);
      var attendancePct = Math.min(Math.round((presentDays / expected) * 100), 100);

      // Experiments
      var experiments = 0;
      var totalExp = 10;
      if (labTasks && Array.isArray(labTasks.experiments)) {
        totalExp = labTasks.experiments.length;
        experiments = labTasks.experiments.filter(function (e) { return e.completed; }).length;
      }

      // Violations for this student
      var studentViolations = violationList.filter(function (v) { return (v.usn || '').toUpperCase() === usn; }).length;

      // Active session check
      var activeSession = _loadJSON('sys_lab_session', null);
      var status = 'inactive';
      var activeTime = 0;

      if (activeSession && activeSession.userId && activeSession.userId.toUpperCase() === usn) {
        status = activeSession.active !== false ? 'active' : 'idle';
        if (activeSession.startedAt) {
          activeTime = Math.floor((Date.now() - activeSession.startedAt) / 1000);
        }
      }

      return {
        id: usn,
        name: u.name || usn,
        dept: (u.dept || 'CSE').toUpperCase(),
        attendance: attendancePct,
        presentDays: presentDays,
        lateDays: lateDays,
        experiments: experiments,
        totalExp: totalExp,
        activeTime: activeTime,
        status: status,
        violations: studentViolations,
        email: u.email || '',
        mobile: u.mobile || '',
        hasFace: !!u.hasFace
      };
    });
  }

  function _loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var data = JSON.parse(raw);
      return data !== null ? data : fallback;
    } catch (e) {
      return fallback;
    }
  }

  // ── Clock ──

  function _startClock() {
    function tick() {
      var now = new Date();
      if (_dom.clock) {
        _dom.clock.textContent =
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0');
      }
      if (_dom.date) {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        _dom.date.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ' ' + now.getFullYear();
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Stats Rendering ──

  function _renderStats() {
    var stats = _calculateStats();

    if (_dom.liveCount) _dom.liveCount.textContent = stats.active;
    if (_dom.totalStudents) _dom.totalStudents.textContent = stats.total;
    if (_dom.avgAttendance) _dom.avgAttendance.textContent = stats.avgAttendance + '%';
    if (_dom.totalViolations) _dom.totalViolations.textContent = stats.totalViolations;
    if (_dom.avgCompletion) _dom.avgCompletion.textContent = stats.avgCompletion + '%';

    // Update donut chart
    var donut = document.getElementById('completionDonut');
    if (donut) {
      var offset = 100 - stats.avgCompletion;
      donut.setAttribute('stroke-dashoffset', String(offset));
    }

    // Update donut legend with real experiment data
    var labTasks = _loadJSON('sys_lab_tasks', null);
    var totalExps = 0;
    var completedExps = 0;
    if (labTasks && Array.isArray(labTasks.experiments)) {
      totalExps = labTasks.experiments.length;
      completedExps = labTasks.experiments.filter(function (e) { return e.completed; }).length;
    }
    var completedEl = document.getElementById('donutCompleted');
    if (completedEl) completedEl.textContent = 'Completed: ' + completedExps + '/' + totalExps + ' exps';
    var pendingEl = document.getElementById('donutPending');
    if (pendingEl) pendingEl.textContent = 'Pending: ' + (totalExps - completedExps) + ' exps';
  }

  function _calculateStats() {
    var total = _students.length;
    var active = 0;
    var totalAttendance = 0;
    var totalViolations = 0;
    var totalCompletion = 0;

    for (var i = 0; i < _students.length; i++) {
      var s = _students[i];
      if (s.status === 'active') active++;
      totalAttendance += s.attendance || 0;
      totalViolations += s.violations || 0;
      totalCompletion += s.totalExp > 0 ? (s.experiments / s.totalExp) * 100 : 0;
    }

    return {
      total: total,
      active: active,
      idle: _students.filter(function (s) { return s.status === 'idle'; }).length,
      inactive: _students.filter(function (s) { return s.status === 'inactive'; }).length,
      avgAttendance: total > 0 ? Math.round(totalAttendance / total) : 0,
      totalViolations: totalViolations,
      avgCompletion: total > 0 ? Math.round(totalCompletion / total) : 0
    };
  }

  // ── Dashboard Table ──

  function _renderTable() {
    if (!_dom.tableBody) return;

    if (_filtered.length === 0) {
      _dom.tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No registered students found</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < _filtered.length; i++) {
      var s = _filtered[i];
      var completionPct = s.totalExp > 0 ? Math.round((s.experiments / s.totalExp) * 100) : 0;
      var statusClass = s.status === 'active' ? 'active' : (s.status === 'idle' ? 'warning' : 'inactive');
      var fillClass = completionPct >= 80 ? '--lime' : '';

      html += '<tr>';
      html += '<td><span class="student-table__id">' + _esc(s.id) + '</span></td>';
      html += '<td>' + _esc(s.name) + '</td>';
      html += '<td>' + _esc(s.dept) + '</td>';
      html += '<td><span class="student-table__status"><span class="student-table__dot student-table__dot--' + statusClass + '"></span>' + s.status.toUpperCase() + '</span></td>';
      html += '<td>' + s.attendance + '%</td>';
      html += '<td><div class="student-table__progress"><div class="student-table__progress-bar"><div class="student-table__progress-fill progress__bar' + fillClass + '" style="width:' + completionPct + '%"></div></div><span class="student-table__progress-pct">' + completionPct + '%</span></div></td>';
      html += '<td>' + _formatDuration(s.activeTime) + '</td>';
      html += '</tr>';
    }

    _dom.tableBody.innerHTML = html;
  }

  // ── Heatmap ──

  function _renderHeatmap() {
    if (!_dom.heatmapGrid) return;

    var attendanceHistory = _loadJSON('sys_attendance_history', []);
    var dayMap = {};
    attendanceHistory.forEach(function (a) {
      if (a.date) {
        if (!dayMap[a.date]) dayMap[a.date] = 0;
        dayMap[a.date]++;
      }
    });

    var html = '';
    for (var i = 27; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dateStr = d.toISOString().split('T')[0];
      var count = dayMap[dateStr] || 0;
      var level = count === 0 ? 0 : (count <= 2 ? 1 : (count <= 4 ? 2 : (count <= 6 ? 3 : 4)));
      html += '<div class="heatmap__cell heatmap__cell--l' + level + '" title="' + dateStr + ': ' + count + ' students"></div>';
    }

    _dom.heatmapGrid.innerHTML = html;
  }

  // ── Session Info ──

  function _renderSessionInfo() {
    var el = document.getElementById('sessionInfo');
    if (!el) return;

    var stats = _calculateStats();
    var activeSession = _loadJSON('sys_lab_session', null);
    var sessionStart = activeSession && activeSession.startedAt
      ? new Date(activeSession.startedAt).toLocaleTimeString()
      : '--:--:--';

    el.innerHTML =
      '<div class="session-bar"><span class="session-bar__label">Session Start</span><span class="session-bar__value">' + _esc(sessionStart) + '</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Registered Students</span><span class="session-bar__value">' + stats.total + '</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Avg Attendance</span><span class="session-bar__value">' + stats.avgAttendance + '%</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Total Violations</span><span class="session-bar__value">' + stats.totalViolations + '</span></div>';
  }

  // ── Attendance Section ──

  function _renderAttendanceSection() {
    var history = _loadJSON('sys_attendance_history', []);

    // Stats
    var uniqueDays = {};
    var lateCount = 0;
    history.forEach(function (a) {
      if (a.date) uniqueDays[a.date] = true;
      if (a.late) lateCount++;
    });

    _setText('attTotalRecords', history.length);
    _setText('attUniqueDays', Object.keys(uniqueDays).length);
    _setText('attLateCount', lateCount);

    // Unique USNs
    var uniqueUsns = {};
    history.forEach(function (a) { if (a.usn) uniqueUsns[a.usn] = true; });
    var studentCount = Object.keys(uniqueUsns).length;
    var expectedDays = studentCount > 0 ? Math.max(1, _getWeekdaysElapsed()) : 0;
    var avgPct = studentCount > 0 && expectedDays > 0
      ? Math.min(Math.round((Object.keys(uniqueDays).length / (studentCount * expectedDays)) * 100), 100)
      : 0;
    _setText('attAvgPercentage', avgPct + '%');

    // Populate lab filter
    var labFilter = document.getElementById('attLabFilter');
    if (labFilter && labFilter.options.length <= 1) {
      var labs = {};
      history.forEach(function (a) { if (a.lab) labs[a.lab] = true; });
      Object.keys(labs).forEach(function (lab) {
        var opt = document.createElement('option');
        opt.value = lab;
        opt.textContent = lab;
        labFilter.appendChild(opt);
      });
    }

    _renderAttendanceTable(history);
  }

  function _renderAttendanceTable(history) {
    var tbody = document.getElementById('attTableBody');
    if (!tbody) return;

    var search = (document.getElementById('attSearchInput') || {}).value || '';
    var labFilter = (document.getElementById('attLabFilter') || {}).value || '';
    search = search.toLowerCase().trim();

    var filtered = history.filter(function (a) {
      var matchSearch = !search ||
        (a.usn || '').toLowerCase().indexOf(search) !== -1 ||
        (a.name || '').toLowerCase().indexOf(search) !== -1;
      var matchLab = !labFilter || a.lab === labFilter;
      return matchSearch && matchLab;
    }).reverse();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No attendance records found</td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function (a) {
      var statusClass = a.late ? 'student-table__dot--warning' : 'student-table__dot--active';
      html += '<tr>';
      html += '<td><span class="student-table__id">' + _esc(a.usn || '—') + '</span></td>';
      html += '<td>' + _esc(a.name || '—') + '</td>';
      html += '<td>' + _esc(a.lab || '—') + '</td>';
      html += '<td>' + _esc(a.date || '—') + '</td>';
      html += '<td>' + _esc(a.time || '—') + '</td>';
      html += '<td><span class="student-table__status"><span class="student-table__dot ' + statusClass + '"></span>' + (a.late ? 'LATE' : 'PRESENT') + '</span></td>';
      html += '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ── Experiments Section ──

  function _renderExperimentsSection() {
    var labTasks = _loadJSON('sys_lab_tasks', null);
    var experiments = (labTasks && Array.isArray(labTasks.experiments)) ? labTasks.experiments : [];

    var total = experiments.length;
    var completed = experiments.filter(function (e) { return e.completed; }).length;
    var pending = total - completed;
    var rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    _setText('expTotalExps', total);
    _setText('expCompletedExps', completed);
    _setText('expPendingExps', pending);
    _setText('expCompletionRate', rate + '%');

    var tbody = document.getElementById('expTableBody');
    if (!tbody) return;

    if (experiments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No experiments found</td></tr>';
      return;
    }

    var html = '';
    experiments.forEach(function (exp, i) {
      var status = exp.completed ? 'COMPLETED' : 'PENDING';
      var statusDot = exp.completed ? 'student-table__dot--active' : 'student-table__dot--warning';
      var completedAt = exp.completedAt ? new Date(exp.completedAt).toLocaleString() : '—';
      var verified = exp.verified ? '<span class="student-table__dot student-table__dot--active"></span> Yes' : '—';

      html += '<tr>';
      html += '<td>' + (i + 1) + '</td>';
      html += '<td>' + _esc(exp.title || 'Experiment ' + (i + 1)) + '</td>';
      html += '<td>' + _esc(exp.description || '—') + '</td>';
      html += '<td><span class="student-table__status"><span class="student-table__dot ' + statusDot + '"></span>' + status + '</span></td>';
      html += '<td>' + completedAt + '</td>';
      html += '<td>' + verified + '</td>';
      html += '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ── Reports Section ──

  function _renderReportsSection() {
    var history = _loadJSON('sys_attendance_history', []);
    var sessionHistory = _loadJSON('sys_session_history', []);
    var violations = _loadJSON('sys_security_log', { violations: [] });
    var violationList = Array.isArray(violations) ? violations : (violations.violations || []);

    // Attendance Summary
    var attSummary = document.getElementById('reportAttendanceSummary');
    if (attSummary) {
      var uniqueDays = {};
      var lateCount = 0;
      history.forEach(function (a) {
        if (a.date) uniqueDays[a.date] = true;
        if (a.late) lateCount++;
      });

      attSummary.innerHTML =
        _reportRow('Total Records', history.length) +
        _reportRow('Unique Days', Object.keys(uniqueDays).length) +
        _reportRow('Late Markings', lateCount) +
        _reportRow('Unique Students', _students.length);
    }

    // Session Summary
    var sessSummary = document.getElementById('reportSessionSummary');
    if (sessSummary) {
      var totalTime = 0;
      sessionHistory.forEach(function (s) { totalTime += (s.duration || 0); });

      sessSummary.innerHTML =
        _reportRow('Total Sessions', sessionHistory.length) +
        _reportRow('Total Lab Time', _formatDuration(totalTime)) +
        _reportRow('With Attendance', sessionHistory.filter(function (s) { return s.attended; }).length) +
        _reportRow('Active Session', _loadJSON('sys_lab_session', null) ? 'Yes' : 'No');
    }

    // Student Stats
    var studStats = document.getElementById('reportStudentStats');
    if (studStats) {
      var stats = _calculateStats();
      studStats.innerHTML =
        _reportRow('Total Registered', stats.total) +
        _reportRow('Avg Attendance', stats.avgAttendance + '%') +
        _reportRow('Avg Completion', stats.avgCompletion + '%') +
        _reportRow('Avg Violations', stats.total > 0 ? (stats.totalViolations / stats.total).toFixed(1) : '0');
    }

    // Security Summary
    var secSummary = document.getElementById('reportSecuritySummary');
    if (secSummary) {
      var bySeverity = { critical: 0, warning: 0, info: 0 };
      violationList.forEach(function (v) {
        if (bySeverity[v.severity] !== undefined) bySeverity[v.severity]++;
      });

      secSummary.innerHTML =
        _reportRow('Total Violations', violationList.length) +
        _reportRow('Critical', bySeverity.critical) +
        _reportRow('Warnings', bySeverity.warning) +
        _reportRow('Info', bySeverity.info);
    }
  }

  function _reportRow(label, value) {
    return '<div class="session-bar"><span class="session-bar__label">' + _esc(label) + '</span><span class="session-bar__value">' + _esc(String(value)) + '</span></div>';
  }

  // ── Settings Section ──

  function _renderSettingsSection() {
    // Profile
    var profile = document.getElementById('settingsProfile');
    if (profile) {
      profile.innerHTML =
        _reportRow('Name', _session.name || '—') +
        _reportRow('ID', _session.userId || '—') +
        _reportRow('Role', (_session.role || '—').toUpperCase()) +
        _reportRow('Department', _session.dept || '—') +
        _reportRow('Designation', _session.designation || '—');
    }

    // Controls
    var controls = document.getElementById('settingsControls');
    if (controls) {
      controls.innerHTML =
        '<div style="padding: 12px 0;">' +
          '<button class="btn btn--secondary" id="btnResetData" style="width:100%; margin-bottom:8px;">Reset All Application Data</button>' +
          '<button class="btn btn--danger" id="btnAdminLogout" style="width:100%;">Logout</button>' +
        '</div>';

      // Bind reset button
      var resetBtn = document.getElementById('btnResetData');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          if (confirm('This will clear ALL application data including registered students, attendance, and sessions. Continue?')) {
            DataReset.forceReset();
            _showToast('success', 'Data Reset', 'All application data has been cleared.');
            setTimeout(function () { location.reload(); }, 1000);
          }
        });
      }

      // Bind logout button
      var logoutBtn = document.getElementById('btnAdminLogout');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
          Auth.destroyAdminSession();
          window.location.href = 'admin-login.html';
        });
      }
    }
  }

  // ── Section Router ──

  function renderSection(section) {
    switch (section) {
      case 'attendance':
        _renderAttendanceSection();
        break;
      case 'experiments':
        _renderExperimentsSection();
        break;
      case 'reports':
        _renderReportsSection();
        break;
      case 'settings':
        _renderSettingsSection();
        break;
      case 'dashboard':
        _refreshFromStorage();
        _renderStats();
        _renderTable();
        _renderHeatmap();
        _renderSessionInfo();
        break;
      case 'student-mgmt':
        StudentCrud.refresh();
        break;
    }
  }

  // ── Search & Filter ──

  function _bindEvents() {
    if (_dom.searchInput) _dom.searchInput.addEventListener('input', _applyFilters);
    if (_dom.deptFilter) _dom.deptFilter.addEventListener('change', _applyFilters);
    if (_dom.statusFilter) _dom.statusFilter.addEventListener('change', _applyFilters);

    // Sidebar toggle
    if (_dom.sidebarToggle && _dom.sidebar) {
      _dom.sidebarToggle.addEventListener('click', function () {
        _dom.sidebar.classList.toggle('open');
        if (_dom.overlay) _dom.overlay.classList.toggle('active');
      });
    }
    if (_dom.overlay) {
      _dom.overlay.addEventListener('click', function () {
        _dom.sidebar.classList.remove('open');
        _dom.overlay.classList.remove('active');
      });
    }

    // Export
    if (_dom.btnExportCsv) _dom.btnExportCsv.addEventListener('click', _exportCSV);
    if (_dom.btnExportPdf) _dom.btnExportPdf.addEventListener('click', _exportPDF);

    // Report CSV
    var btnReportCsv = document.getElementById('btnReportCsv');
    if (btnReportCsv) btnReportCsv.addEventListener('click', _exportFullReport);

    // Logout
    if (_dom.btnLogout) {
      _dom.btnLogout.addEventListener('click', function () {
        Auth.destroyAdminSession();
        window.location.href = 'admin-login.html';
      });
    }

    // Attendance table filters
    var attSearch = document.getElementById('attSearchInput');
    var attLabFilter = document.getElementById('attLabFilter');
    if (attSearch) attSearch.addEventListener('input', function () { _renderAttendanceSection(); });
    if (attLabFilter) attLabFilter.addEventListener('change', function () { _renderAttendanceSection(); });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _dom.sidebar) {
        _dom.sidebar.classList.remove('open');
        if (_dom.overlay) _dom.overlay.classList.remove('active');
      }
    });
  }

  function _applyFilters() {
    var query = (_dom.searchInput ? _dom.searchInput.value : '').toLowerCase().trim();
    var dept = _dom.deptFilter ? _dom.deptFilter.value : '';
    var status = _dom.statusFilter ? _dom.statusFilter.value : '';

    _filtered = _students.filter(function (s) {
      var matchQuery = !query || s.name.toLowerCase().indexOf(query) !== -1 || s.id.toLowerCase().indexOf(query) !== -1;
      var matchDept = !dept || s.dept === dept;
      var matchStatus = !status || s.status === status;
      return matchQuery && matchDept && matchStatus;
    });

    _renderTable();
  }

  // ── Auto Refresh ──

  function _startAutoRefresh() {
    _refreshTimer = setInterval(function () {
      _refreshFromStorage();
      _applyFilters();
      _renderStats();
      _renderSessionInfo();
    }, 15000);
  }

  // ── Export ──

  function _exportCSV() {
    var headers = ['USN', 'Name', 'Department', 'Status', 'Attendance %', 'Experiments', 'Active Time (s)', 'Violations'];
    var rows = [headers.join(',')];

    for (var i = 0; i < _filtered.length; i++) {
      var s = _filtered[i];
      rows.push([
        s.id,
        '"' + s.name + '"',
        s.dept,
        s.status,
        s.attendance,
        s.experiments + '/' + s.totalExp,
        s.activeTime,
        s.violations
      ].join(','));
    }

    _downloadFile(rows.join('\n'), 'student_report.csv', 'text/csv');
  }

  function _exportPDF() {
    var stats = _calculateStats();
    var now = new Date();

    var html = '<!DOCTYPE html><html><head><title>Student Report</title>';
    html += '<style>body{font-family:monospace;padding:40px;color:#222;}h1{font-size:18px;border-bottom:2px solid #333;padding-bottom:8px;}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px;}th,td{padding:8px 10px;border:1px solid #ccc;text-align:left;}th{background:#f0f0f0;font-weight:bold;}.summary{margin:16px 0;font-size:13px;}.summary span{display:inline-block;margin-right:24px;}</style></head><body>';
    html += '<h1>Student Lab Report</h1><p>Generated: ' + now.toLocaleString() + '</p>';
    html += '<div class="summary"><span>Total: ' + stats.total + '</span><span>Active: ' + stats.active + '</span><span>Avg Attendance: ' + stats.avgAttendance + '%</span><span>Violations: ' + stats.totalViolations + '</span></div>';
    html += '<table><thead><tr><th>USN</th><th>Name</th><th>Dept</th><th>Status</th><th>Attendance</th><th>Experiments</th><th>Active Time</th><th>Violations</th></tr></thead><tbody>';

    _filtered.forEach(function (s) {
      html += '<tr><td>' + _esc(s.id) + '</td><td>' + _esc(s.name) + '</td><td>' + _esc(s.dept) + '</td><td>' + s.status.toUpperCase() + '</td><td>' + s.attendance + '%</td><td>' + s.experiments + '/' + s.totalExp + '</td><td>' + _formatDuration(s.activeTime) + '</td><td>' + s.violations + '</td></tr>';
    });

    html += '</tbody></table></body></html>';
    var win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(function () { win.print(); }, 500); }
  }

  function _exportFullReport() {
    var headers = ['USN', 'Name', 'Dept', 'Attendance %', 'Experiments', 'Violations', 'Status'];
    var rows = [headers.join(',')];

    _students.forEach(function (s) {
      rows.push([s.id, '"' + s.name + '"', s.dept, s.attendance, s.experiments + '/' + s.totalExp, s.violations, s.status].join(','));
    });

    _downloadFile(rows.join('\n'), 'full_report.csv', 'text/csv');
  }

  // ── Helpers ──

  function _formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00:00';
    var h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    var m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    var s = String(seconds % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }

  function _getWeekdaysElapsed() {
    var now = new Date();
    var day = now.getDay();
    var count = 0;
    for (var d = 1; d <= 5; d++) {
      if (d <= day || day === 0) count++;
    }
    if (day === 0) count = 5;
    return Math.max(count, 1);
  }

  function _downloadFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function _showToast(type, title, message) {
    var container = document.getElementById('toastContainer');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    var iconMap = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    toast.innerHTML =
      '<div class="toast__icon">' + (iconMap[type] || 'ℹ') + '</div>' +
      '<div class="toast__content"><div class="toast__title">' + title + '</div><div class="toast__message">' + message + '</div></div>' +
      '<button class="toast__close" onclick="this.parentElement.remove()">×</button>';
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('visible'); });
    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () { if (toast.parentElement) toast.remove(); }, 300);
    }, 4000);
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      getStudents: function () { return _students.slice(); },
      getFiltered: function () { return _filtered.slice(); },
      getStats: _calculateStats,
      renderSection: renderSection,
      refresh: function () { _refreshFromStorage(); _applyFilters(); _renderStats(); _renderSessionInfo(); },
      exportCSV: _exportCSV,
      exportPDF: _exportPDF
    };
  }

  // ── Boot ──

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    getStudents: function () { return _students.slice(); },
    getFiltered: function () { return _filtered.slice(); },
    getStats: _calculateStats,
    renderSection: renderSection,
    refresh: function () { _refreshFromStorage(); _applyFilters(); _renderStats(); _renderSessionInfo(); },
    exportCSV: _exportCSV,
    exportPDF: _exportPDF
  };
})();

/**
 * ADMIN MODULE — Faculty/Admin Dashboard Controller
 */
var Admin = (function () {
  'use strict';

  // ── State ──
  var _session = null;
  var _students = [];
  var _filtered = [];
  var _refreshTimer = null;
  var _dom = {};

  // ── Dummy Student Data (synced with Auth module) ──
  var STUDENT_DATA = [
    { id: '1RV20CS001', name: 'Aarav Mehta',   dept: 'CSE', attendance: 92, experiments: 8,  totalExp: 10, activeTime: 5420, status: 'active',  violations: 0 },
    { id: '1RV20CS002', name: 'Priya Sharma',  dept: 'CSE', attendance: 87, experiments: 7,  totalExp: 10, activeTime: 4800, status: 'active',  violations: 1 },
    { id: '1RV20CS003', name: 'Rohan Gupta',   dept: 'CSE', attendance: 78, experiments: 5,  totalExp: 10, activeTime: 3600, status: 'idle',    violations: 2 },
    { id: '1RV20IS001', name: 'Sneha Patel',   dept: 'ISE', attendance: 95, experiments: 10, totalExp: 10, activeTime: 6100, status: 'active',  violations: 0 },
    { id: '1RV20IS002', name: 'Vikram Singh',  dept: 'ISE', attendance: 65, experiments: 4,  totalExp: 10, activeTime: 2400, status: 'inactive', violations: 4 },
    { id: '1RV20EC001', name: 'Ananya Reddy',  dept: 'ECE', attendance: 88, experiments: 6,  totalExp: 10, activeTime: 4200, status: 'active',  violations: 1 }
  ];

  // ── Initialize ──

  function init() {
    _session = Auth.guardAdminPage();
    if (!_session) return;

    _students = _loadStudents();
    _filtered = _students.slice();

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
    var nameEls = document.querySelectorAll('[data-user-name]');
    var idEls = document.querySelectorAll('[data-user-id]');
    var roleEls = document.querySelectorAll('[data-user-role]');

    nameEls.forEach(function (el) { el.textContent = _session.name; });
    idEls.forEach(function (el) { el.textContent = _session.userId; });
    roleEls.forEach(function (el) { el.textContent = _session.role.toUpperCase(); });
  }

  // ── Clock ──

  function _startClock() {
    function tick() {
      var now = new Date();
      if (_dom.clock) {
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        _dom.clock.textContent = h + ':' + m + ':' + s;
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
      totalAttendance += s.attendance;
      totalViolations += s.violations;
      totalCompletion += (s.experiments / s.totalExp) * 100;
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

  // ── Table Rendering ──

  function _renderTable() {
    if (!_dom.tableBody) return;

    if (_filtered.length === 0) {
      _dom.tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No students match filters</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < _filtered.length; i++) {
      var s = _filtered[i];
      var completionPct = Math.round((s.experiments / s.totalExp) * 100);
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

    var html = '';
    // Generate 28 cells (4 weeks)
    for (var i = 0; i < 28; i++) {
      var level = _getHeatmapLevel(i);
      var date = _getHeatmapDate(i);
      html += '<div class="heatmap__cell heatmap__cell--l' + level + '" title="' + date + ': ' + _getHeatmapValue(level) + ' students"></div>';
    }

    _dom.heatmapGrid.innerHTML = html;
  }

  function _getHeatmapLevel(index) {
    // Simulate attendance data
    var levels = [4,3,2,3,4,0,0, 3,4,3,2,4,1,0, 4,3,4,3,4,0,0, 2,3,4,3,4,1,0];
    return levels[index % levels.length];
  }

  function _getHeatmapDate(index) {
    var d = new Date();
    d.setDate(d.getDate() - (27 - index));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function _getHeatmapValue(level) {
    return Math.round((level / 4) * _students.length);
  }

  // ── Session Info ──

  function _renderSessionInfo() {
    var el = document.getElementById('sessionInfo');
    if (!el) return;

    var stats = _calculateStats();
    var now = new Date();
    var sessionStart = new Date();
    sessionStart.setHours(9, 0, 0, 0);

    var elapsed = Math.floor((now - sessionStart) / 1000);
    if (elapsed < 0) elapsed = 0;

    el.innerHTML =
      '<div class="session-bar"><span class="session-bar__label">Session Start</span><span class="session-bar__value">09:00:00</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Active Students</span><span class="session-bar__value">' + stats.active + ' / ' + stats.total + '</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Avg Attendance</span><span class="session-bar__value">' + stats.avgAttendance + '%</span></div>' +
      '<div class="session-bar"><span class="session-bar__label">Total Violations</span><span class="session-bar__value">' + stats.totalViolations + '</span></div>';
  }

  // ── Search & Filter ──

  function _bindEvents() {
    if (_dom.searchInput) {
      _dom.searchInput.addEventListener('input', _applyFilters);
    }
    if (_dom.deptFilter) {
      _dom.deptFilter.addEventListener('change', _applyFilters);
    }
    if (_dom.statusFilter) {
      _dom.statusFilter.addEventListener('change', _applyFilters);
    }

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
    if (_dom.btnExportCsv) {
      _dom.btnExportCsv.addEventListener('click', _exportCSV);
    }
    if (_dom.btnExportPdf) {
      _dom.btnExportPdf.addEventListener('click', _exportPDF);
    }

    // Logout
    if (_dom.btnLogout) {
      _dom.btnLogout.addEventListener('click', function () {
        Auth.destroyAdminSession();
        window.location.href = 'admin-login.html';
      });
    }

    // Keyboard shortcut: Escape to close sidebar
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
      _simulateUpdates();
      _students = _loadStudents();
      _applyFilters();
      _renderStats();
      _renderSessionInfo();
    }, 10000); // every 10s
  }

  function _simulateUpdates() {
    // Simulate random status changes
    for (var i = 0; i < _students.length; i++) {
      var s = _students[i];
      if (Math.random() < 0.1) {
        var statuses = ['active', 'idle', 'inactive'];
        s.status = statuses[Math.floor(Math.random() * statuses.length)];
      }
      if (s.status === 'active') {
        s.activeTime += Math.floor(Math.random() * 30);
      }
    }
    _saveStudents();
  }

  // ── Data Persistence ──

  function _loadStudents() {
    try {
      var raw = localStorage.getItem('sys_admin_students');
      if (raw) {
        var data = JSON.parse(raw);
        if (Array.isArray(data) && data.length > 0) {
          // Deduplicate by USN — keep latest activeTime entry
          var deduped = _deduplicateStudents(data);
          if (deduped.length !== data.length) {
            _saveStudentsToStorage(deduped);
          }
          return deduped;
        }
      }
    } catch (e) { /* ignore */ }
    return _clone(STUDENT_DATA);
  }

  function _saveStudents() {
    _students = _deduplicateStudents(_students);
    _saveStudentsToStorage(_students);
  }

  function _saveStudentsToStorage(students) {
    try {
      localStorage.setItem('sys_admin_students', JSON.stringify(students));
    } catch (e) { /* quota */ }
  }

  /**
   * Remove duplicate student records by USN.
   * Keeps the entry with the highest activeTime (most recent activity).
   */
  function _deduplicateStudents(students) {
    var seen = {};
    var result = [];

    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      if (!s || !s.id) continue;

      var existing = seen[s.id];
      if (!existing) {
        seen[s.id] = s;
        result.push(s);
      } else {
        // Keep the one with more active time (indicates more recent data)
        if ((s.activeTime || 0) >= (existing.activeTime || 0)) {
          seen[s.id] = s;
          for (var j = 0; j < result.length; j++) {
            if (result[j] === existing) {
              result[j] = s;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  // ── Export CSV ──

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

    var csv = rows.join('\n');
    _downloadFile(csv, 'student_report.csv', 'text/csv');
  }

  // ── Export PDF (simple printable) ──

  function _exportPDF() {
    var stats = _calculateStats();
    var now = new Date();

    var html = '<!DOCTYPE html><html><head><title>Student Report</title>';
    html += '<style>';
    html += 'body{font-family:monospace;padding:40px;color:#222;}';
    html += 'h1{font-size:18px;border-bottom:2px solid #333;padding-bottom:8px;}';
    html += 'table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px;}';
    html += 'th,td{padding:8px 10px;border:1px solid #ccc;text-align:left;}';
    html += 'th{background:#f0f0f0;font-weight:bold;}';
    html += '.summary{margin:16px 0;font-size:13px;}';
    html += '.summary span{display:inline-block;margin-right:24px;}';
    html += '</style></head><body>';
    html += '<h1>Student Lab Report</h1>';
    html += '<p>Generated: ' + now.toLocaleString() + '</p>';
    html += '<div class="summary">';
    html += '<span>Total Students: ' + stats.total + '</span>';
    html += '<span>Active: ' + stats.active + '</span>';
    html += '<span>Avg Attendance: ' + stats.avgAttendance + '%</span>';
    html += '<span>Total Violations: ' + stats.totalViolations + '</span>';
    html += '</div>';
    html += '<table><thead><tr>';
    html += '<th>USN</th><th>Name</th><th>Dept</th><th>Status</th><th>Attendance</th><th>Experiments</th><th>Active Time</th><th>Violations</th>';
    html += '</tr></thead><tbody>';

    for (var i = 0; i < _filtered.length; i++) {
      var s = _filtered[i];
      html += '<tr>';
      html += '<td>' + _esc(s.id) + '</td>';
      html += '<td>' + _esc(s.name) + '</td>';
      html += '<td>' + _esc(s.dept) + '</td>';
      html += '<td>' + s.status.toUpperCase() + '</td>';
      html += '<td>' + s.attendance + '%</td>';
      html += '<td>' + s.experiments + '/' + s.totalExp + '</td>';
      html += '<td>' + _formatDuration(s.activeTime) + '</td>';
      html += '<td>' + s.violations + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></body></html>';

    var win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(function () { win.print(); }, 500);
    }
  }

  // ── Helpers ──

  function _formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '00:00:00';
    var h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    var m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    var s = String(seconds % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
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

  function _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function _esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      getStudents: function () { return _students.slice(); },
      getFiltered: function () { return _filtered.slice(); },
      getStats: _calculateStats,
      refresh: function () {
        _students = _loadStudents();
        _applyFilters();
        _renderStats();
        _renderSessionInfo();
      },
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
    exportCSV: _exportCSV,
    exportPDF: _exportPDF
  };
})();

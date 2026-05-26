/**
 * TASKS MODULE — Lab Experiment Management System
 */
var Tasks = (function () {
  'use strict';

  // ── Constants ──
  var STORAGE_KEY = 'sys_lab_tasks';

  // ── Default Experiments ──
  var DEFAULT_EXPERIMENTS = [
    {
      id: 'exp-01',
      title: 'HTML Structure & Semantic Elements',
      description: 'Create a multi-page website using semantic HTML5 elements.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-02',
      title: 'CSS Styling & Box Model',
      description: 'Implement layouts using CSS box model, flexbox, and grid.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-03',
      title: 'Responsive Design with Media Queries',
      description: 'Build a mobile-first responsive page with breakpoints.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-04',
      title: 'JavaScript DOM Manipulation',
      description: 'Dynamically create, modify, and remove DOM elements.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-05',
      title: 'Event Handling & Form Validation',
      description: 'Implement event listeners and client-side form validation.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-06',
      title: 'Asynchronous JavaScript & Fetch API',
      description: 'Fetch data from an API and render it dynamically.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-07',
      title: 'LocalStorage & Session Management',
      description: 'Implement persistent state using the Web Storage API.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-08',
      title: 'CSS Animations & Transitions',
      description: 'Create keyframe animations and smooth transitions.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-09',
      title: 'Webcam Integration & Canvas',
      description: 'Access the webcam, render to canvas, and capture frames.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    },
    {
      id: 'exp-10',
      title: 'Full-Stack Mini Project',
      description: 'Build a complete dashboard with authentication and live data.',
      completed: false,
      completedAt: null,
      remark: '',
      verified: false,
      verifiedBy: null,
      verifiedAt: null
    }
  ];

  // ── State ──
  var _experiments = [];
  var _callbacks = {};
  var _dom = {};
  var _currentFilter = 'all';

  // ── Initialize ──

  /**
   * Initialize the tasks module.
   * @param {Object} config
   *   - listEl:        container for experiment items
   *   - progressEl:    progress bar element
   *   - progressPctEl: progress percentage text
   *   - countEl:       completed count text (e.g. "3/10")
   *   - resetBtnEl:    reset button element
   */
  function init(config) {
    _dom.listEl        = config.listEl        || null;
    _dom.progressEl    = config.progressEl    || null;
    _dom.progressPctEl = config.progressPctEl || null;
    _dom.countEl       = config.countEl       || null;
    _dom.resetBtnEl    = config.resetBtnEl    || null;

    _load();
    _render();
    _bindReset();
    _updateProgress();

    return _publicAPI();
  }

  // ── Data Operations ──

  /**
   * Toggle experiment completion.
   * Once marked completed, the assignment is permanently locked.
   */
  function toggle(id) {
    var exp = _find(id);
    if (!exp) return;

    // Lock: completed assignments cannot be unchecked
    if (exp.completed) return;

    exp.completed = true;
    exp.completedAt = Date.now();

    _save();
    _render();
    _updateProgress();
    _fire('toggle', { experiment: exp });
    _fire('change', { experiments: _experiments, stats: getStats() });
  }

  /**
   * Add a remark/comment to an experiment.
   */
  function setRemark(id, text) {
    var exp = _find(id);
    if (!exp) return;

    exp.remark = (text || '').trim();
    _save();
    _render();
    _fire('remark', { experiment: exp });
    _fire('change', { experiments: _experiments, stats: getStats() });
  }

  /**
   * Mark experiment as faculty-verified.
   */
  function verify(id, facultyName) {
    var exp = _find(id);
    if (!exp || !exp.completed) return;

    exp.verified = true;
    exp.verifiedBy = facultyName || 'Faculty';
    exp.verifiedAt = Date.now();

    _save();
    _render();
    _fire('verify', { experiment: exp });
    _fire('change', { experiments: _experiments, stats: getStats() });
  }

  /**
   * Remove verification from an experiment.
   */
  function unverify(id) {
    var exp = _find(id);
    if (!exp) return;

    exp.verified = false;
    exp.verifiedBy = null;
    exp.verifiedAt = null;

    _save();
    _render();
    _fire('unverify', { experiment: exp });
    _fire('change', { experiments: _experiments, stats: getStats() });
  }

  /**
   * Reset all experiments to default state.
   */
  function resetAll() {
    _experiments = _cloneDefaults();
    _save();
    _render();
    _updateProgress();
    _fire('reset', { experiments: _experiments });
    _fire('change', { experiments: _experiments, stats: getStats() });
  }

  /**
   * Get all experiments.
   */
  function getAll() {
    return _experiments.slice();
  }

  /**
   * Get a single experiment by ID.
   */
  function getById(id) {
    return _find(id);
  }

  /**
   * Get summary statistics.
   */
  function getStats() {
    var total = _experiments.length;
    var completed = 0;
    var verified = 0;
    var pending = 0;

    for (var i = 0; i < _experiments.length; i++) {
      if (_experiments[i].completed) {
        completed++;
        if (_experiments[i].verified) verified++;
      } else {
        pending++;
      }
    }

    return {
      total: total,
      completed: completed,
      verified: verified,
      pending: pending,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  // ── Rendering ──

  function _render() {
    if (!_dom.listEl) return;

    var html = '';

    for (var i = 0; i < _experiments.length; i++) {
      var exp = _experiments[i];
      var isDone = exp.completed;
      var isVerified = exp.verified;

      html += '<li class="task' + (isDone ? ' task--done task--locked' : '') + '" data-exp-id="' + exp.id + '">';

      // Checkbox — disabled (locked) when completed
      html += '<div class="task__check' + (isDone ? ' done locked' : '') + '" ' +
        (isDone ? '' : 'data-task-toggle="' + exp.id + '"') + '>';
      html += isDone ? '✓' : '';
      html += '</div>';

      // Content
      html += '<div class="task__body">';

      // Title row
      html += '<div class="task__title-row">';
      html += '<span class="task__name' + (isDone ? ' done' : '') + '">' + _escape(exp.title) + '</span>';

      // Tags
      if (isVerified) {
        html += '<span class="task__tag task__tag--verified">Verified</span>';
      } else if (isDone) {
        html += '<span class="task__tag task__tag--locked">Locked</span>';
      } else {
        html += '<span class="task__tag task__tag--orange">Pending</span>';
      }
      html += '</div>';

      // Description
      html += '<div class="task__desc">' + _escape(exp.description) + '</div>';

      // Meta (timestamps, verification info)
      html += '<div class="task__meta">';
      if (isDone && exp.completedAt) {
        html += '<span class="task__meta-item">Completed: ' + _formatTimestamp(exp.completedAt) + '</span>';
      }
      if (isVerified && exp.verifiedBy) {
        html += '<span class="task__meta-item task__meta-item--verified">Verified by ' + _escape(exp.verifiedBy) + '</span>';
      }
      html += '</div>';

      // Remark field — read-only when completed
      html += '<div class="task__remark-wrap">';
      if (isDone) {
        html += '<input class="task__remark" type="text" placeholder="No remark" value="' + _escape(exp.remark) + '" readonly maxlength="200">';
      } else {
        html += '<input class="task__remark" type="text" placeholder="Add remark..." value="' + _escape(exp.remark) + '" data-remark="' + exp.id + '" maxlength="200">';
      }
      html += '</div>';

      // Actions
      html += '<div class="task__actions">';
      if (isDone && !isVerified) {
        html += '<button class="task__action-btn task__action-btn--verify" data-verify="' + exp.id + '">Mark Verified</button>';
      }
      if (isVerified) {
        html += '<button class="task__action-btn task__action-btn--unverify" data-unverify="' + exp.id + '">Remove Verification</button>';
      }
      html += '</div>';

      html += '</div>'; // .task__body
      html += '</li>';
    }

    _dom.listEl.innerHTML = html;
    _bindListEvents();
  }

  function _updateProgress() {
    var stats = getStats();
    var pct = stats.percentage;

    if (_dom.progressEl) {
      _dom.progressEl.style.width = pct + '%';
      _dom.progressEl.classList.remove('progress__bar--orange', 'progress__bar--red');
      if (pct < 50) {
        _dom.progressEl.classList.add('progress__bar--orange');
      }
    }

    if (_dom.progressPctEl) {
      _dom.progressPctEl.textContent = pct + '%';
    }

    if (_dom.countEl) {
      _dom.countEl.innerHTML = stats.completed + '<span style="font-size: 20px; color: var(--text-muted);">/' + stats.total + '</span>';
    }
  }

  // ── Assignments Section Rendering ──

  /**
   * Render the full assignments section (stats, progress, analytics, filtered list).
   */
  function renderAssignments() {
    var stats = getStats();

    // Stats row
    var pctEl = document.getElementById('assignPct');
    var compEl = document.getElementById('assignCompleted');
    var pendEl = document.getElementById('assignPending');
    var verEl = document.getElementById('assignVerified');
    if (pctEl) pctEl.textContent = stats.percentage + '%';
    if (compEl) compEl.textContent = stats.completed;
    if (pendEl) pendEl.textContent = stats.pending;
    if (verEl) verEl.textContent = stats.verified;

    // Progress bar
    var progressBar = document.getElementById('assignProgressBar');
    var progressPct = document.getElementById('assignProgressPct');
    var countEl = document.getElementById('assignCount');
    if (progressBar) {
      progressBar.style.width = stats.percentage + '%';
      progressBar.classList.remove('progress__bar--orange', 'progress__bar--red');
      if (stats.percentage < 50) progressBar.classList.add('progress__bar--orange');
    }
    if (progressPct) progressPct.textContent = stats.percentage + '%';
    if (countEl) {
      countEl.innerHTML = stats.completed + '<span style="font-size: 20px; color: var(--text-muted);">/' + stats.total + '</span>';
    }

    // Reset button
    var resetBtn = document.getElementById('assignResetBtn');
    if (resetBtn && !resetBtn._bound) {
      resetBtn._bound = true;
      resetBtn.addEventListener('click', function () {
        if (confirm('Reset all experiments to default state? This cannot be undone.')) {
          resetAll();
        }
      });
    }

    // Filter tabs
    _bindFilters();

    // Analytics
    _renderAnalytics(stats);

    // Filtered experiment list
    _renderAssignList();
  }

  function _bindFilters() {
    var container = document.getElementById('assignFilters');
    if (!container || container._bound) return;
    container._bound = true;

    container.addEventListener('click', function (e) {
      var btn = e.target.closest('.assign-filter');
      if (!btn) return;

      var filter = btn.getAttribute('data-filter');
      if (!filter || filter === _currentFilter) return;

      _currentFilter = filter;

      // Update active state
      var tabs = container.querySelectorAll('.assign-filter');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('assign-filter--active', tabs[i].getAttribute('data-filter') === filter);
      }

      _renderAssignList();
    });
  }

  function _renderAssignList() {
    var listEl = document.getElementById('assignTaskList');
    if (!listEl) return;

    var filtered = _experiments;
    if (_currentFilter === 'pending') {
      filtered = _experiments.filter(function (e) { return !e.completed; });
    } else if (_currentFilter === 'completed') {
      filtered = _experiments.filter(function (e) { return e.completed && !e.verified; });
    } else if (_currentFilter === 'verified') {
      filtered = _experiments.filter(function (e) { return e.verified; });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = '<li class="task-list__empty">No experiments match this filter</li>';
      return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
      var exp = filtered[i];
      var isDone = exp.completed;
      var isVerified = exp.verified;

      html += '<li class="task' + (isDone ? ' task--done task--locked' : '') + '" data-exp-id="' + exp.id + '">';

      // Checkbox — disabled (locked) when completed
      html += '<div class="task__check' + (isDone ? ' done locked' : '') + '" ' +
        (isDone ? '' : 'data-task-toggle="' + exp.id + '"') + '>';
      html += isDone ? '✓' : '';
      html += '</div>';

      // Content
      html += '<div class="task__body">';

      // Title row
      html += '<div class="task__title-row">';
      html += '<span class="task__name' + (isDone ? ' done' : '') + '">' + _escape(exp.title) + '</span>';

      // Tags
      if (isVerified) {
        html += '<span class="task__tag task__tag--verified">Verified</span>';
      } else if (isDone) {
        html += '<span class="task__tag task__tag--locked">Locked</span>';
      } else {
        html += '<span class="task__tag task__tag--orange">Pending</span>';
      }
      html += '</div>';

      // Description
      html += '<div class="task__desc">' + _escape(exp.description) + '</div>';

      // Meta (timestamps, verification)
      html += '<div class="task__meta">';
      if (isDone && exp.completedAt) {
        html += '<span class="task__timestamp">Submitted: ' + _formatTimestamp(exp.completedAt) + '</span>';
      }
      if (isVerified && exp.verifiedBy) {
        html += '<span class="task__verified-badge">' + _escape(exp.verifiedBy) + ' — ' + _formatTimestamp(exp.verifiedAt) + '</span>';
      }
      html += '</div>';

      // Remark field — read-only when completed
      html += '<div class="task__remark-wrap">';
      if (isDone) {
        html += '<input class="task__remark" type="text" placeholder="No remark" value="' + _escape(exp.remark) + '" readonly maxlength="200">';
      } else {
        html += '<input class="task__remark" type="text" placeholder="Add remark..." value="' + _escape(exp.remark) + '" data-remark="' + exp.id + '" maxlength="200">';
      }
      html += '</div>';

      // Actions
      html += '<div class="task__actions">';
      if (isDone && !isVerified) {
        html += '<button class="task__action-btn task__action-btn--verify" data-verify="' + exp.id + '">Mark Verified</button>';
      }
      if (isVerified) {
        html += '<button class="task__action-btn task__action-btn--unverify" data-unverify="' + exp.id + '">Remove Verification</button>';
      }
      html += '</div>';

      html += '</div>'; // .task__body
      html += '</li>';
    }

    listEl.innerHTML = html;

    // Bind events on the assignment list
    _bindAssignListEvents(listEl);
  }

  function _bindAssignListEvents(listEl) {
    // Toggle checkboxes
    var toggles = listEl.querySelectorAll('[data-task-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', _handleToggle);
    }

    // Remark inputs
    var remarks = listEl.querySelectorAll('[data-remark]');
    for (var j = 0; j < remarks.length; j++) {
      remarks[j].addEventListener('blur', _handleRemark);
      remarks[j].addEventListener('keydown', function (e) {
        if (e.key === 'Enter') e.target.blur();
      });
    }

    // Verify buttons
    var verifyBtns = listEl.querySelectorAll('[data-verify]');
    for (var k = 0; k < verifyBtns.length; k++) {
      verifyBtns[k].addEventListener('click', _handleVerify);
    }

    // Unverify buttons
    var unverifyBtns = listEl.querySelectorAll('[data-unverify]');
    for (var l = 0; l < unverifyBtns.length; l++) {
      unverifyBtns[l].addEventListener('click', _handleUnverify);
    }
  }

  function _renderAnalytics(stats) {
    var container = document.getElementById('assignAnalytics');
    if (!container) return;

    var total = stats.total || 1;
    var pendingPct = Math.round((stats.pending / total) * 100);
    var completedPct = Math.round(((stats.completed - stats.verified) / total) * 100);
    var verifiedPct = Math.round((stats.verified / total) * 100);

    // Donut circumference = 2 * PI * 40 = 251.2
    var circumference = 251.2;
    var offset = circumference - (stats.percentage / 100) * circumference;

    var html = '';

    // Donut chart
    html += '<div class="assign-donut-wrap">';
    html += '<svg class="assign-donut" viewBox="0 0 100 100">';
    html += '<circle class="assign-donut__track" cx="50" cy="50" r="40"/>';
    html += '<circle class="assign-donut__fill" cx="50" cy="50" r="40" style="stroke-dashoffset: ' + offset + '"/>';
    html += '</svg>';
    html += '<div class="assign-donut-label">';
    html += '<div class="assign-donut-label__pct">' + stats.percentage + '%</div>';
    html += '<div class="assign-donut-label__text">Complete</div>';
    html += '</div>';
    html += '</div>';

    // Breakdown bars
    html += '<div class="assign-breakdown">';

    html += '<div class="assign-breakdown__row">';
    html += '<span class="assign-breakdown__label">Pending</span>';
    html += '<div class="assign-breakdown__track"><div class="assign-breakdown__bar assign-breakdown__bar--orange" style="width: ' + pendingPct + '%"></div></div>';
    html += '<span class="assign-breakdown__count">' + stats.pending + '</span>';
    html += '</div>';

    html += '<div class="assign-breakdown__row">';
    html += '<span class="assign-breakdown__label">Completed</span>';
    html += '<div class="assign-breakdown__track"><div class="assign-breakdown__bar assign-breakdown__bar--lime" style="width: ' + completedPct + '%"></div></div>';
    html += '<span class="assign-breakdown__count">' + (stats.completed - stats.verified) + '</span>';
    html += '</div>';

    html += '<div class="assign-breakdown__row">';
    html += '<span class="assign-breakdown__label">Verified</span>';
    html += '<div class="assign-breakdown__track"><div class="assign-breakdown__bar assign-breakdown__bar--cyan" style="width: ' + verifiedPct + '%"></div></div>';
    html += '<span class="assign-breakdown__count">' + stats.verified + '</span>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;
  }

  // ── Event Binding ──

  function _bindListEvents() {
    if (!_dom.listEl) return;

    // Toggle checkboxes
    var toggles = _dom.listEl.querySelectorAll('[data-task-toggle]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener('click', _handleToggle);
    }

    // Remark inputs
    var remarks = _dom.listEl.querySelectorAll('[data-remark]');
    for (var j = 0; j < remarks.length; j++) {
      remarks[j].addEventListener('blur', _handleRemark);
      remarks[j].addEventListener('keydown', function (e) {
        if (e.key === 'Enter') e.target.blur();
      });
    }

    // Verify buttons
    var verifyBtns = _dom.listEl.querySelectorAll('[data-verify]');
    for (var k = 0; k < verifyBtns.length; k++) {
      verifyBtns[k].addEventListener('click', _handleVerify);
    }

    // Unverify buttons
    var unverifyBtns = _dom.listEl.querySelectorAll('[data-unverify]');
    for (var l = 0; l < unverifyBtns.length; l++) {
      unverifyBtns[l].addEventListener('click', _handleUnverify);
    }
  }

  function _handleToggle(e) {
    var id = e.currentTarget.getAttribute('data-task-toggle');
    if (id) toggle(id);
  }

  function _handleRemark(e) {
    var id = e.target.getAttribute('data-remark');
    if (id) setRemark(id, e.target.value);
  }

  function _handleVerify(e) {
    var id = e.currentTarget.getAttribute('data-verify');
    if (id) {
      // Use session name if available
      var facultyName = 'Faculty';
      try {
        var session = JSON.parse(localStorage.getItem('sys_session'));
        if (session && session.name) facultyName = session.name;
      } catch (err) { /* ignore */ }
      verify(id, facultyName);
    }
  }

  function _handleUnverify(e) {
    var id = e.currentTarget.getAttribute('data-unverify');
    if (id) unverify(id);
  }

  function _bindReset() {
    if (_dom.resetBtnEl) {
      _dom.resetBtnEl.addEventListener('click', function () {
        if (confirm('Reset all experiments to default state? This cannot be undone.')) {
          resetAll();
        }
      });
    }
  }

  // ── Storage ──

  function _save() {
    try {
      // Deduplicate before persisting to prevent duplicate records
      _experiments = _deduplicateById(_experiments);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_experiments));
    } catch (e) { /* quota exceeded */ }
  }

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        _experiments = JSON.parse(raw);
        // Validate structure
        if (!Array.isArray(_experiments) || _experiments.length === 0) {
          _experiments = _cloneDefaults();
        } else {
          // Deduplicate on load — remove duplicate ID entries, keep most complete state
          var deduped = _deduplicateById(_experiments);
          if (deduped.length !== _experiments.length) {
            _experiments = deduped;
            _save(); // persist the cleaned array
          }
        }
      } else {
        _experiments = _cloneDefaults();
      }
    } catch (e) {
      _experiments = _cloneDefaults();
    }
  }

  function _cloneDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_EXPERIMENTS));
  }

  // ── Deduplication ──

  /**
   * Remove duplicate experiments by ID, keeping the entry with the most
   * recent state (completed takes priority, then latest completedAt).
   * Preserves timestamps and remarks from the most complete entry.
   */
  function _deduplicateById(experiments) {
    var seen = {};
    var result = [];

    for (var i = 0; i < experiments.length; i++) {
      var exp = experiments[i];
      if (!exp || !exp.id) continue;

      var existing = seen[exp.id];
      if (!existing) {
        // First occurrence — keep it
        seen[exp.id] = exp;
        result.push(exp);
      } else {
        // Duplicate found — keep the one with more recent/more complete state
        if (_isMoreComplete(exp, existing)) {
          // Replace in seen map and result array
          seen[exp.id] = exp;
          for (var j = 0; j < result.length; j++) {
            if (result[j].id === exp.id) {
              result[j] = exp;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Determine if experiment A has more complete/recent state than B.
   * Priority: completed > not completed; later completedAt > earlier; has remark > no remark.
   */
  function _isMoreComplete(a, b) {
    if (a.completed && !b.completed) return true;
    if (!a.completed && b.completed) return false;
    if (a.completed && b.completed) {
      // Both completed — prefer the one with a more recent timestamp
      if (a.completedAt && b.completedAt) return a.completedAt >= b.completedAt;
      if (a.completedAt && !b.completedAt) return true;
    }
    // Both pending or equal completion — prefer the one with a remark
    if (a.remark && !b.remark) return true;
    return false;
  }

  // ── Helpers ──

  function _find(id) {
    for (var i = 0; i < _experiments.length; i++) {
      if (_experiments[i].id === id) return _experiments[i];
    }
    return null;
  }

  function _formatTimestamp(ms) {
    var d = new Date(ms);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + h + ':' + m;
  }

  function _escape(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Event System ──

  /**
   * Events: toggle, remark, verify, unverify, reset, change
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
    _callbacks = {};
    _dom = {};
    _experiments = [];
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      init: init,
      toggle: toggle,
      setRemark: setRemark,
      verify: verify,
      unverify: unverify,
      resetAll: resetAll,
      getAll: getAll,
      getById: getById,
      getStats: getStats,
      renderAssignments: renderAssignments,
      formatTimestamp: _formatTimestamp,
      on: on,
      off: off,
      destroy: destroy
    };
  }

  return {
    init: init,
    toggle: toggle,
    setRemark: setRemark,
    verify: verify,
    unverify: unverify,
    resetAll: resetAll,
    getAll: getAll,
    getById: getById,
    getStats: getStats,
    renderAssignments: renderAssignments,
    formatTimestamp: _formatTimestamp,
    on: on,
    off: off,
    destroy: destroy
  };
})();

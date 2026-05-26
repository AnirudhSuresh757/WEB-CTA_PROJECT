/**
 * NAVIGATION MODULE — Sidebar Section Switching
 *
 * Handles dynamic section switching without page reloads.
 * Manages active states, smooth transitions, and URL hash routing.
 */
var Navigation = (function () {
  'use strict';

  // ── State ──
  var _currentSection = 'dashboard';
  var _sections = {};
  var _links = {};
  var _navEl = null;
  var _mainEl = null;
  var _callbacks = {};
  var _initialized = false;

  // ── Section Definitions ──
  var SECTIONS = {
    dashboard:    { title: 'Student Dashboard',    hash: '#dashboard' },
    'lab-sessions': { title: 'Lab Sessions',       hash: '#lab-sessions' },
    attendance:   { title: 'Attendance',            hash: '#attendance' },
    assignments:  { title: 'Assignments',           hash: '#assignments' },
    resources:    { title: 'Resources',             hash: '#resources' },
    settings:     { title: 'Settings',              hash: '#settings' }
  };

  // ── Initialize ──
  function init(config) {
    if (_initialized) return;

    _navEl = config.navEl || null;
    _mainEl = config.mainEl || null;

    if (!_navEl || !_mainEl) return;

    // Cache section containers
    var sectionEls = _mainEl.querySelectorAll('[data-section]');
    for (var i = 0; i < sectionEls.length; i++) {
      var name = sectionEls[i].getAttribute('data-section');
      _sections[name] = sectionEls[i];
    }

    // Cache nav links
    var linkEls = _navEl.querySelectorAll('[data-nav]');
    for (var j = 0; j < linkEls.length; j++) {
      var sectionName = linkEls[j].getAttribute('data-nav');
      _links[sectionName] = linkEls[j];
    }

    // Bind click events
    _navEl.addEventListener('click', _handleNavClick);

    // Handle browser back/forward with hash
    window.addEventListener('hashchange', _handleHashChange);

    // Load initial section from hash or default to dashboard
    var initial = _getSectionFromHash();
    _switchTo(initial, false);

    _initialized = true;
  }

  // ── Navigation Click Handler ──
  function _handleNavClick(e) {
    var link = e.target.closest('[data-nav]');
    if (!link) return;

    e.preventDefault();
    var section = link.getAttribute('data-nav');
    if (section && section !== _currentSection) {
      navigateTo(section);
    }
  }

  // ── Hash Change Handler ──
  function _handleHashChange() {
    var section = _getSectionFromHash();
    if (section !== _currentSection) {
      _switchTo(section, true);
    }
  }

  // ── Public Navigate ──
  function navigateTo(section) {
    if (!SECTIONS[section] || section === _currentSection) return;
    _switchTo(section, true);
  }

  // ── Core Switch Logic ──
  function _switchTo(section, updateHash) {
    if (!SECTIONS[section]) section = 'dashboard';

    var previous = _currentSection;
    _currentSection = section;

    // Update active link
    _updateActiveLink(section);

    // Transition sections (skip if same section — avoid hiding active content)
    if (previous !== section) {
      _transitionSection(previous, section);
    }

    // Update navbar title
    _updateNavbarTitle(section);

    // Update hash
    if (updateHash) {
      window.history.replaceState(null, '', SECTIONS[section].hash);
    }

    // Fire events
    _fire('navigate', { section: section, previous: previous });
  }

  // ── Update Active Link ──
  function _updateActiveLink(section) {
    // Remove active from all links
    var keys = Object.keys(_links);
    for (var i = 0; i < keys.length; i++) {
      _links[keys[i]].classList.remove('active');
    }

    // Add active to current
    if (_links[section]) {
      _links[section].classList.add('active');
    }
  }

  // ── Section Transition ──
  function _transitionSection(from, to) {
    var fromEl = _sections[from];
    var toEl = _sections[to];

    // Hide current section
    if (fromEl) {
      fromEl.classList.remove('section--active');
      fromEl.classList.add('section--exit');
      // Remove exit class after animation
      setTimeout(function () {
        fromEl.classList.remove('section--exit');
        fromEl.style.display = 'none';
      }, 200);
    }

    // Show new section
    if (toEl) {
      toEl.style.display = '';
      // Force reflow for animation
      void toEl.offsetWidth;
      toEl.classList.add('section--active');
      toEl.classList.remove('section--exit');

      // Animate children
      _animateChildren(toEl);
    }
  }

  // ── Animate Section Children ──
  function _animateChildren(sectionEl) {
    var children = sectionEl.querySelectorAll('.animate-in');
    for (var i = 0; i < children.length; i++) {
      children[i].style.animation = 'none';
      void children[i].offsetWidth;
      children[i].style.animation = '';
    }
  }

  // ── Update Navbar Title ──
  function _updateNavbarTitle(section) {
    var titleEl = document.querySelector('.navbar__title');
    if (titleEl && SECTIONS[section]) {
      titleEl.textContent = SECTIONS[section].title;
    }
  }

  // ── Get Section From URL Hash ──
  function _getSectionFromHash() {
    var hash = window.location.hash.replace('#', '');
    return SECTIONS[hash] ? hash : 'dashboard';
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

  // ── Query ──
  function getCurrentSection() {
    return _currentSection;
  }

  function getSections() {
    return Object.keys(SECTIONS);
  }

  // ── Public API ──
  return {
    init: init,
    navigateTo: navigateTo,
    getCurrentSection: getCurrentSection,
    getSections: getSections,
    on: on,
    off: off
  };
})();

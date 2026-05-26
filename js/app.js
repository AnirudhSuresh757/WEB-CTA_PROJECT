/**
 * APP MODULE — UI Controller & Event Handling
 */
var App = (function () {
  'use strict';

  // ── DOM References ──
  var els = {};

  var state = {
    role: 'student',
    loading: false
  };

  // ── Initialize ──
  function init() {
    Auth.initDatabase();

    if (Auth.isStudentLoggedIn()) {
      window.location.href = 'dashboard.html';
      return;
    }

    cacheElements();
    bindEvents();
    startClock();
    setRole('student');
  }

  function cacheElements() {
    els.form = document.getElementById('loginForm');
    els.usn = document.getElementById('usn');
    els.password = document.getElementById('password');
    els.btnLogin = document.getElementById('btnLogin');
    els.errorMsg = document.getElementById('errorMsg');
    els.errorText = document.getElementById('errorText');
    els.toggleFaculty = document.getElementById('toggleFaculty');
    els.toggleAdmin = document.getElementById('toggleAdmin');
    els.toggleSlider = document.getElementById('toggleSlider');
    els.clockDisplay = document.getElementById('clockDisplay');
  }

  // ── Event Binding ──
  function bindEvents() {
    els.form.addEventListener('submit', handleSubmit);
    els.toggleFaculty.addEventListener('click', function () { setRole('student'); });
    els.toggleAdmin.addEventListener('click', function () { setRole('faculty'); });
    els.usn.addEventListener('input', hideError);
    els.password.addEventListener('input', hideError);

    // Enter key on password triggers form submit naturally
    // Tab navigation handled by browser
  }

  // ── Role Toggle ──
  function setRole(role) {
    state.role = role;

    var isStudent = role === 'student';
    els.toggleFaculty.classList.toggle('active', isStudent);
    els.toggleAdmin.classList.toggle('active', !isStudent);
    els.toggleFaculty.setAttribute('aria-selected', isStudent);
    els.toggleAdmin.setAttribute('aria-selected', !isStudent);
    els.toggleSlider.classList.toggle('right', !isStudent);

    els.usn.placeholder = isStudent ? 'Enter your USN' : 'Enter Faculty/Admin ID';
    hideError();
  }

  // ── Error Display ──
  function showError(message) {
    els.errorText.textContent = message;
    els.errorMsg.classList.add('visible');
    els.errorMsg.style.animation = 'none';
    els.errorMsg.offsetHeight; // reflow
    els.errorMsg.style.animation = '';
  }

  function hideError() {
    els.errorMsg.classList.remove('visible');
  }

  // ── Loading State ──
  function setLoading(on) {
    state.loading = on;
    els.btnLogin.classList.toggle('loading', on);
    els.btnLogin.disabled = on;
    els.usn.disabled = on;
    els.password.disabled = on;
  }

  // ── Form Submission (Student Login) ──
  function handleSubmit(e) {
    e.preventDefault();
    hideError();

    var usn = els.usn.value.trim();
    var password = els.password.value;

    // Student-specific validation
    var validation = Auth.validateStudentCredentials(usn, password);
    if (!validation.valid) {
      showError(validation.errors[0]);
      if (validation.errors[0].indexOf('USN') !== -1) {
        els.usn.focus();
      } else {
        els.password.focus();
      }
      return;
    }

    setLoading(true);

    // Authenticate student
    setTimeout(function () {
      var result = Auth.loginStudent(usn, password);

      if (!result.success) {
        setLoading(false);
        showError(result.message);
        els.password.value = '';
        els.password.focus();
        return;
      }

      // Success — create student session and redirect to dashboard
      Auth.createStudentSession(result.user);

      els.btnLogin.textContent = 'ACCESS GRANTED';
      els.btnLogin.classList.remove('loading');
      els.btnLogin.style.background = '#7fff00';
      els.btnLogin.style.boxShadow = '0 0 40px rgba(127, 255, 0, 0.5)';

      setTimeout(function () {
        window.location.href = 'dashboard.html';
      }, 600);

    }, 1000);
  }

  // ── Clock ──
  function startClock() {
    if (!els.clockDisplay) return;

    function tick() {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      els.clockDisplay.textContent = h + ':' + m + ':' + s;
    }

    tick();
    setInterval(tick, 1000);
  }

  // ── Password Visibility Toggle ──
  function enablePasswordToggle(iconEl) {
    if (!iconEl) return;

    iconEl.style.cursor = 'pointer';
    iconEl.style.pointerEvents = 'auto';
    iconEl.style.userSelect = 'none';

    var visible = false;

    iconEl.addEventListener('click', function () {
      visible = !visible;
      els.password.type = visible ? 'text' : 'password';
      iconEl.textContent = visible ? 'X' : '*';
      iconEl.style.color = visible ? 'var(--glow-lime)' : '';
    });
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init();
      var passIcon = document.querySelector('#password + .field__icon');
      if (passIcon) {
        enablePasswordToggle(passIcon);
      }
    });
  } else {
    init();
    var passIcon = document.querySelector('#password + .field__icon');
    if (passIcon) {
      enablePasswordToggle(passIcon);
    }
  }

  return {
    init: init,
    setRole: setRole,
    showError: showError,
    hideError: hideError,
    setLoading: setLoading
  };
})();

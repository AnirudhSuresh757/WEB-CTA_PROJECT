/**
 * UI MODULE — Dashboard Utilities & Interactions
 */
var UI = (function () {
  'use strict';

  // ── Clock & Date ──
  function startClock(clockEl, dateEl) {
    function tick() {
      var now = new Date();
      if (clockEl) {
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        var s = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = h + ':' + m + ':' + s;
      }
      if (dateEl) {
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateEl.textContent = days[now.getDay()] + ', ' + months[now.getMonth()] + ' ' + now.getDate() + ' ' + now.getFullYear();
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Session Countdown ──
  function startSessionTimer(displayEl, progressEl, labelEl) {
    var SESSION_DURATION = 3 * 60 * 60; // 3 hours in seconds
    var remaining = SESSION_DURATION;

    function tick() {
      if (remaining <= 0) {
        displayEl.textContent = '00:00:00';
        if (labelEl) labelEl.textContent = 'SESSION EXPIRED';
        if (progressEl) progressEl.style.width = '0%';
        return;
      }

      remaining--;
      var h = String(Math.floor(remaining / 3600)).padStart(2, '0');
      var m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
      var s = String(remaining % 60).padStart(2, '0');
      displayEl.textContent = h + ':' + m + ':' + s;

      if (progressEl) {
        var pct = (remaining / SESSION_DURATION) * 100;
        progressEl.style.width = pct + '%';
        if (pct < 20) {
          progressEl.style.background = 'var(--error-red)';
        } else if (pct < 50) {
          progressEl.style.background = 'var(--accent-orange)';
        }
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  // ── Lab Duration ──
  function startLabTimer(displayEl, progressEl) {
    var LAB_DURATION = 2 * 60 * 60; // 2 hours
    var elapsed = 0;

    function tick() {
      elapsed++;
      var remaining = LAB_DURATION - elapsed;
      if (remaining <= 0) {
        displayEl.textContent = '00:00:00';
        if (progressEl) progressEl.style.width = '100%';
        return;
      }

      var h = String(Math.floor(remaining / 3600)).padStart(2, '0');
      var m = String(Math.floor((remaining % 3600) / 60)).padStart(2, '0');
      var s = String(remaining % 60).padStart(2, '0');
      displayEl.textContent = h + ':' + m + ':' + s;

      if (progressEl) {
        var pct = (elapsed / LAB_DURATION) * 100;
        progressEl.style.width = pct + '%';
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  // ── Sidebar Toggle ──
  function initSidebar(toggleBtn, sidebar, overlay) {
    if (!toggleBtn || !sidebar) return;

    toggleBtn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });

    if (overlay) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      }
    });
  }

  // ── Notification Panel ──
  function initNotifications(badgeEl, panelEl, toggleBtn) {
    if (!panelEl || !toggleBtn) return;

    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      panelEl.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
      if (!panelEl.contains(e.target) && e.target !== toggleBtn) {
        panelEl.classList.remove('open');
      }
    });

    // Mark all read
    var markAllBtn = panelEl.querySelector('.notif__mark-all');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', function () {
        var items = panelEl.querySelectorAll('.notif__item.unread');
        items.forEach(function (item) {
          item.classList.remove('unread');
        });
        if (badgeEl) {
          badgeEl.textContent = '0';
          badgeEl.style.display = 'none';
        }
      });
    }
  }

  // ── Animate Stat Cards ──
  function animateStats() {
    var counters = document.querySelectorAll('[data-count]');
    counters.forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      var duration = 1200;
      var start = 0;
      var startTime = null;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.floor(eased * target) + (el.dataset.suffix || '');
        if (progress < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    });
  }

  // ── Webcam Placeholder ──
  function initWebcam(videoEl, canvasEl, captureBtn, statusEl) {
    if (!videoEl) return;

    var stream = null;

    function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (statusEl) statusEl.textContent = 'Camera not supported';
        return;
      }

      navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
        .then(function (s) {
          stream = s;
          videoEl.srcObject = stream;
          if (statusEl) statusEl.textContent = 'CAMERA ACTIVE';
        })
        .catch(function () {
          if (statusEl) statusEl.textContent = 'CAMERA DENIED';
        });
    }

    if (captureBtn) {
      captureBtn.addEventListener('click', function () {
        if (!canvasEl || !stream) return;
        var ctx = canvasEl.getContext('2d');
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0);
        if (statusEl) statusEl.textContent = 'CAPTURED ' + new Date().toLocaleTimeString();
      });
    }

    startCamera();

    // Cleanup on page unload
    window.addEventListener('beforeunload', function () {
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
      }
    });
  }

  // ── Logout ──
  function initLogout(btn) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      Auth.destroyStudentSession();
      window.location.href = 'student-login.html';
    });
  }

  // ── Page Guard ──
  function guardDashboard() {
    return Auth.guardStudentPage();
  }

  // ── Populate User Info ──
  function populateUserInfo(session) {
    var nameEls = document.querySelectorAll('[data-user-name]');
    var idEls = document.querySelectorAll('[data-user-id]');
    var deptEls = document.querySelectorAll('[data-user-dept]');

    nameEls.forEach(function (el) { el.textContent = session.name; });
    idEls.forEach(function (el) { el.textContent = session.userId; });
    deptEls.forEach(function (el) { el.textContent = session.dept; });
  }

  return {
    startClock: startClock,
    startSessionTimer: startSessionTimer,
    startLabTimer: startLabTimer,
    initSidebar: initSidebar,
    initNotifications: initNotifications,
    animateStats: animateStats,
    initWebcam: initWebcam,
    initLogout: initLogout,
    guardDashboard: guardDashboard,
    populateUserInfo: populateUserInfo
  };
})();

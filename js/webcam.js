/**
 * WEBCAM MODULE — Camera Access, Preview & Capture
 */
var Webcam = (function () {
  'use strict';

  // ── State ──
  var _stream = null;
  var _active = false;
  var _errorState = null;
  var _callbacks = {};
  var _dom = {};
  var _captureHistory = [];
  var _maxHistory = 10;

  // ── Status Codes ──
  var STATUS = {
    INACTIVE:     'inactive',
    REQUESTING:   'requesting',
    ACTIVE:       'active',
    DENIED:       'denied',
    NOT_SUPPORTED:'not_supported',
    NO_DEVICE:    'no_device',
    TRACK_ENDED:  'track_ended',
    STOPPED:      'stopped'
  };

  // ── Status Display Text ──
  var STATUS_TEXT = {};
  STATUS_TEXT[STATUS.INACTIVE]       = 'CAMERA INACTIVE';
  STATUS_TEXT[STATUS.REQUESTING]     = 'REQUESTING ACCESS...';
  STATUS_TEXT[STATUS.ACTIVE]         = 'CAMERA ACTIVE';
  STATUS_TEXT[STATUS.DENIED]         = 'ACCESS DENIED';
  STATUS_TEXT[STATUS.NOT_SUPPORTED]  = 'NOT SUPPORTED';
  STATUS_TEXT[STATUS.NO_DEVICE]      = 'NO CAMERA FOUND';
  STATUS_TEXT[STATUS.TRACK_ENDED]    = 'CAMERA DISCONNECTED';
  STATUS_TEXT[STATUS.STOPPED]        = 'CAMERA STOPPED';

  // ── Initialize ──

  /**
   * Bind to DOM elements. Call once on page load.
   * @param {Object} elements - Map of element references
   *   { video, canvas, overlay, status, captureBtn, toggleBtn }
   */
  function init(elements) {
    _dom.video      = elements.video      || null;
    _dom.canvas     = elements.canvas     || null;
    _dom.overlay    = elements.overlay    || null;
    _dom.status     = elements.status     || null;
    _dom.captureBtn = elements.captureBtn || null;
    _dom.toggleBtn  = elements.toggleBtn  || null;

    _bindButtons();
    _setStatus(STATUS.INACTIVE);

    // Cleanup on page unload
    window.addEventListener('beforeunload', _hardStop);

    return {
      start: start,
      stop: stop,
      toggle: toggle,
      capture: capture,
      isActive: isActive,
      getStatus: getStatus,
      getStream: getStream,
      destroy: destroy
    };
  }

  // ── Start Camera ──

  /**
   * Request webcam access and begin preview.
   * @param {Object} [constraints] - Optional getUserMedia constraints
   * @returns {Promise}
   */
  function start(constraints) {
    return new Promise(function (resolve, reject) {
      if (_active && _stream) {
        resolve(_stream);
        return;
      }

      // Check API support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _setError(STATUS.NOT_SUPPORTED);
        _fire('error', { code: STATUS.NOT_SUPPORTED, message: 'Camera API not supported.' });
        reject(new Error('NotSupported'));
        return;
      }

      _setStatus(STATUS.REQUESTING);
      _fire('requesting');

      var defaultConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      var finalConstraints = _mergeConstraints(defaultConstraints, constraints);

      navigator.mediaDevices.getUserMedia(finalConstraints)
        .then(function (stream) {
          _stream = stream;
          _active = true;
          _errorState = null;

          // Attach to video element
          if (_dom.video) {
            _dom.video.srcObject = stream;
            _dom.video.play().catch(function () { /* autoplay blocked, user can click */ });
          }

          _setStatus(STATUS.ACTIVE);
          _showOverlay(false);
          _updateButtons();
          _fire('start', { stream: stream });

          // Listen for track ending (camera unplugged, etc.)
          stream.getTracks().forEach(function (track) {
            track.addEventListener('ended', _handleTrackEnded);
          });

          // Register with SessionManager if available
          if (typeof SessionManager !== 'undefined' && SessionManager.registerWebcam) {
            SessionManager.registerWebcam(stream);
          }

          resolve(stream);
        })
        .catch(function (err) {
          var code = _mapErrorToCode(err);
          _setError(code);
          _fire('error', { code: code, message: err.message, original: err });
          reject(err);
        });
    });
  }

  // ── Stop Camera ──

  /**
   * Stop the camera and release resources.
   * @param {boolean} [silent=false] - If true, suppress events
   */
  function stop(silent) {
    if (!_stream) {
      _setStatus(STATUS.STOPPED);
      _showOverlay(true);
      _updateButtons();
      if (!silent) _fire('stop', { reason: 'manual' });
      return;
    }

    _hardStop();
    _setStatus(STATUS.STOPPED);
    _showOverlay(true);
    _updateButtons();

    if (!silent) _fire('stop', { reason: 'manual' });
  }

  // ── Toggle Camera ──

  function toggle() {
    if (_active) {
      stop();
    } else {
      start().catch(function () { /* error already handled in start() */ });
    }
  }

  // ── Capture Frame ──

  /**
   * Capture the current video frame to canvas.
   * @returns {Object|null} Capture result with dataURL and timestamp
   */
  function capture() {
    if (!_active || !_stream || !_dom.video || !_dom.canvas) {
      _fire('error', { code: 'capture_failed', message: 'Camera not active.' });
      return null;
    }

    var video = _dom.video;
    var canvas = _dom.canvas;

    // Ensure video has dimensions
    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    var dataURL = canvas.toDataURL('image/png');
    var result = {
      dataURL: dataURL,
      width: canvas.width,
      height: canvas.height,
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleTimeString()
    };

    // Store in history
    _captureHistory.push(result);
    if (_captureHistory.length > _maxHistory) {
      _captureHistory.shift();
    }

    _fire('capture', result);
    return result;
  }

  // ── Accessors ──

  function isActive() {
    return _active;
  }

  function getStatus() {
    return _errorState || (_active ? STATUS.ACTIVE : STATUS.INACTIVE);
  }

  function getStatusText() {
    return STATUS_TEXT[getStatus()] || 'UNKNOWN';
  }

  function getStream() {
    return _stream;
  }

  function getCaptures() {
    return _captureHistory.slice();
  }

  function getLastCapture() {
    return _captureHistory.length ? _captureHistory[_captureHistory.length - 1] : null;
  }

  // ── Destroy ──

  function destroy() {
    _hardStop();
    _active = false;
    _stream = null;
    _errorState = null;
    _callbacks = {};
    _captureHistory = [];
    _dom = {};
    window.removeEventListener('beforeunload', _hardStop);
  }

  // ── Internal Helpers ──

  function _hardStop() {
    if (_stream) {
      _stream.getTracks().forEach(function (track) {
        track.removeEventListener('ended', _handleTrackEnded);
        track.stop();
      });
      _stream = null;
    }
    _active = false;

    if (_dom.video) {
      _dom.video.srcObject = null;
    }
  }

  function _handleTrackEnded() {
    _active = false;
    _stream = null;
    _setError(STATUS.TRACK_ENDED);
    _showOverlay(true);
    _updateButtons();
    _fire('trackended');
    _fire('error', { code: STATUS.TRACK_ENDED, message: 'Camera disconnected.' });
  }

  function _mapErrorToCode(err) {
    if (!err) return STATUS.DENIED;
    var name = err.name || '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return STATUS.DENIED;
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return STATUS.NO_DEVICE;
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return STATUS.TRACK_ENDED;
    }
    if (name === 'NotSupportedError') {
      return STATUS.NOT_SUPPORTED;
    }
    return STATUS.DENIED;
  }

  function _mergeConstraints(defaults, overrides) {
    if (!overrides) return defaults;
    var result = {};
    for (var key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        result[key] = overrides[key] || defaults[key];
      }
    }
    for (var key2 in overrides) {
      if (overrides.hasOwnProperty(key2) && !result[key2]) {
        result[key2] = overrides[key2];
      }
    }
    return result;
  }

  // ── DOM Updates ──

  function _setStatus(code) {
    if (_dom.status) {
      _dom.status.textContent = STATUS_TEXT[code] || 'UNKNOWN';
      _dom.status.className = 'webcam__status';
      if (code === STATUS.ACTIVE) {
        _dom.status.classList.add('active');
      } else if (code === STATUS.DENIED || code === STATUS.NO_DEVICE || code === STATUS.TRACK_ENDED) {
        _dom.status.classList.add('error');
      } else if (code === STATUS.REQUESTING) {
        _dom.status.classList.add('requesting');
      }
    }
  }

  function _setError(code) {
    _errorState = code;
    _active = false;
    _setStatus(code);
    _showOverlay(true);
    _updateButtons();
  }

  function _showOverlay(show) {
    if (_dom.overlay) {
      _dom.overlay.style.display = show ? '' : 'none';
    }
  }

  function _updateButtons() {
    if (_dom.toggleBtn) {
      _dom.toggleBtn.textContent = _active ? 'Disable' : 'Enable';
    }
    if (_dom.captureBtn) {
      _dom.captureBtn.disabled = !_active;
      _dom.captureBtn.style.opacity = _active ? '1' : '0.4';
      _dom.captureBtn.style.pointerEvents = _active ? 'auto' : 'none';
    }
  }

  function _bindButtons() {
    if (_dom.toggleBtn) {
      _dom.toggleBtn.addEventListener('click', function () {
        toggle();
      });
    }

    if (_dom.captureBtn) {
      _dom.captureBtn.addEventListener('click', function () {
        capture();
      });
    }
  }

  // ── Event System ──

  /**
   * Register a callback.
   * Events: start, stop, requesting, capture, error, trackended
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
        cbs[i](data || {});
      } catch (e) {
        // Prevent callback errors from breaking execution
      }
    }
  }

  // ── Static Helpers ──

  /**
   * Check if the browser supports getUserMedia.
   */
  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Enumerate available video devices (labels may require prior permission).
   */
  function getDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve([]);
    }
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      return devices.filter(function (d) { return d.kind === 'videoinput'; });
    });
  }

  // ── Public API ──

  return {
    STATUS: STATUS,
    init: init,
    start: start,
    stop: stop,
    toggle: toggle,
    capture: capture,
    isActive: isActive,
    getStatus: getStatus,
    getStatusText: getStatusText,
    getStream: getStream,
    getCaptures: getCaptures,
    getLastCapture: getLastCapture,
    isSupported: isSupported,
    getDevices: getDevices,
    on: on,
    off: off,
    destroy: destroy
  };
})();

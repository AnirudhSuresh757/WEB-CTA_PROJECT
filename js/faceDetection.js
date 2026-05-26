/**
 * FACE DETECTION MODULE — TinyFaceDetector via face-api.js
 */
var FaceDetection = (function () {
  'use strict';

  // ── Constants ──
  var MODEL_URL = './models/weights';
  var MODEL_CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
  var DETECTION_INTERVAL = 200;      // ms between detections
  var NO_FACE_PAUSE_DELAY = 5000;    // ms before pausing uptime timer
  var MIN_CONFIDENCE = 0.4;
  var MAX_CONSECUTIVE_ERRORS = 10;   // stop loop after this many errors

  // ── State ──
  var _videoEl = null;
  var _overlayCanvas = null;
  var _overlayCtx = null;
  var _modelsLoaded = false;
  var _running = false;
  var _rafId = null;
  var _lastDetectionTime = 0;
  var _lastFaceCount = 0;
  var _lastConfidence = 0;
  var _noFaceSince = null;
  var _timerPaused = false;
  var _consecutiveErrors = 0;
  var _callbacks = {};
  var _dom = {};

  // ── Status ──
  var FACE_STATUS = {
    IDLE:          'idle',
    LOADING:       'loading',
    DETECTING:     'detecting',
    FACE_FOUND:    'face_found',
    NO_FACE:       'no_face',
    MULTI_FACE:    'multi_face',
    TIMER_PAUSED:  'timer_paused',
    ERROR:         'error'
  };

  var FACE_STATUS_TEXT = {};
  FACE_STATUS_TEXT[FACE_STATUS.IDLE]         = 'DETECTION IDLE';
  FACE_STATUS_TEXT[FACE_STATUS.LOADING]      = 'LOADING MODELS...';
  FACE_STATUS_TEXT[FACE_STATUS.DETECTING]    = 'SCANNING...';
  FACE_STATUS_TEXT[FACE_STATUS.FACE_FOUND]   = 'FACE DETECTED';
  FACE_STATUS_TEXT[FACE_STATUS.NO_FACE]      = 'NO FACE DETECTED';
  FACE_STATUS_TEXT[FACE_STATUS.MULTI_FACE]   = 'MULTIPLE FACES WARNING';
  FACE_STATUS_TEXT[FACE_STATUS.TIMER_PAUSED] = 'TIMER PAUSED — NO FACE';
  FACE_STATUS_TEXT[FACE_STATUS.ERROR]        = 'DETECTION ERROR';

  // ── Initialize ──

  /**
   * Initialize the face detection system.
   * @param {Object} config
   *   - videoEl:          <video> element (from Webcam module)
   *   - overlayCanvas:    <canvas> for drawing face boxes
   *   - statusEl:         element for status text
   *   - confidenceBarEl:  element for confidence fill bar
   *   - confidenceTextEl: element for confidence % text
   */
  function init(config) {
    _videoEl          = config.videoEl          || null;
    _overlayCanvas    = config.overlayCanvas    || null;
    _dom.statusEl     = config.statusEl         || null;
    _dom.confBar      = config.confidenceBarEl  || null;
    _dom.confText     = config.confidenceTextEl || null;
    _dom.faceCountEl  = config.faceCountEl      || null;

    if (_overlayCanvas) {
      _overlayCtx = _overlayCanvas.getContext('2d');
    }

    _setStatus(FACE_STATUS.IDLE);
    _updateConfidence(0);

    window.addEventListener('beforeunload', stop);

    return _publicAPI();
  }

  // ── Load Models ──

  /**
   * Load TinyFaceDetector models. Tries local path first, then CDN fallback.
   * @returns {Promise}
   */
  function loadModels() {
    if (_modelsLoaded) return Promise.resolve();

    _setStatus(FACE_STATUS.LOADING);
    _fire('loading');

    if (typeof faceapi === 'undefined') {
      var err = 'face-api.js not loaded. Include face-api.min.js before faceDetection.js.';
      console.error('[FaceDetection]', err);
      _setStatus(FACE_STATUS.ERROR);
      _fire('error', { message: err });
      return Promise.reject(new Error(err));
    }

    console.log('[FaceDetection] Loading models from local path:', MODEL_URL);

    return faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
      .then(function () {
        _modelsLoaded = true;
        console.log('[FaceDetection] Models loaded successfully from local path');
        _fire('modelsLoaded');
        _setStatus(FACE_STATUS.IDLE);
      })
      .catch(function (localErr) {
        console.warn('[FaceDetection] Local model load failed, trying CDN fallback:', localErr.message);
        return faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_CDN_URL)
          .then(function () {
            _modelsLoaded = true;
            console.log('[FaceDetection] Models loaded successfully from CDN fallback');
            _fire('modelsLoaded');
            _setStatus(FACE_STATUS.IDLE);
          })
          .catch(function (cdnErr) {
            console.error('[FaceDetection] Both local and CDN model loads failed');
            console.error('[FaceDetection] Local error:', localErr.message);
            console.error('[FaceDetection] CDN error:', cdnErr.message);
            _setStatus(FACE_STATUS.ERROR);
            _fire('error', {
              message: 'Failed to load face detection models. Ensure models/weights/ directory contains the model files.',
              localError: localErr.message,
              cdnError: cdnErr.message
            });
            throw cdnErr;
          });
      });
  }

  // ── Start Detection Loop ──

  /**
   * Begin continuous face detection on the video stream.
   * Models must be loaded first. Video must be playing with metadata loaded.
   * @returns {Promise}
   */
  function start() {
    if (_running) {
      console.log('[FaceDetection] Already running, skipping start()');
      return Promise.resolve();
    }

    return loadModels().then(function () {
      if (!_videoEl) {
        console.error('[FaceDetection] No video element configured');
        _setStatus(FACE_STATUS.ERROR);
        _fire('error', { message: 'No video element configured.' });
        return;
      }

      if (!_videoEl.srcObject) {
        console.error('[FaceDetection] No video stream active — start webcam first');
        _setStatus(FACE_STATUS.ERROR);
        _fire('error', { message: 'No video stream active. Start webcam first.' });
        return;
      }

      // Wait for video to be actually playing before starting detection
      function _beginDetection() {
        _running = true;
        _noFaceSince = null;
        _timerPaused = false;
        _lastFaceCount = 0;
        _lastConfidence = 0;
        _consecutiveErrors = 0;

        console.log('[FaceDetection] Detection loop started');
        _setStatus(FACE_STATUS.DETECTING);
        _fire('start');
        _detectLoop();
      }

      if (_videoEl.readyState >= 2 && !_videoEl.paused) {
        _beginDetection();
      } else {
        console.log('[FaceDetection] Waiting for video to be ready...');
        _setStatus(FACE_STATUS.LOADING);
        var onReady = function () {
          _videoEl.removeEventListener('playing', onReady);
          _beginDetection();
        };
        _videoEl.addEventListener('playing', onReady);
        // Ensure video plays
        _videoEl.play().catch(function () { /* autoplay may be blocked */ });
      }
    });
  }

  /**
   * Stop the detection loop.
   */
  function stop() {
    _running = false;
    _consecutiveErrors = 0;
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _clearOverlay();
    _setStatus(FACE_STATUS.IDLE);
    _updateConfidence(0);
    console.log('[FaceDetection] Detection stopped');
    _fire('stop');
  }

  // ── Detection Loop ──

  function _detectLoop() {
    if (!_running) return;

    var now = performance.now();
    if (now - _lastDetectionTime < DETECTION_INTERVAL) {
      _rafId = requestAnimationFrame(_detectLoop);
      return;
    }
    _lastDetectionTime = now;

    _runDetection()
      .then(function () {
        _consecutiveErrors = 0; // reset on success
        _rafId = requestAnimationFrame(_detectLoop);
      })
      .catch(function (err) {
        _consecutiveErrors++;
        console.warn('[FaceDetection] Detection error (' + _consecutiveErrors + '/' + MAX_CONSECUTIVE_ERRORS + '):', err.message || err);

        if (_consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[FaceDetection] Too many consecutive errors, stopping detection loop');
          _running = false;
          _setStatus(FACE_STATUS.ERROR);
          _fire('error', { message: 'Detection loop stopped due to repeated errors.', count: _consecutiveErrors });
          return;
        }

        _rafId = requestAnimationFrame(_detectLoop);
      });
  }

  function _runDetection() {
    if (!_videoEl || _videoEl.paused || _videoEl.ended || !_videoEl.videoWidth) {
      return Promise.resolve();
    }

    if (!_modelsLoaded) {
      return Promise.reject(new Error('Models not loaded'));
    }

    var options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: MIN_CONFIDENCE
    });

    return faceapi.detectAllFaces(_videoEl, options)
      .then(function (detections) {
        _processDetections(detections);
      });
  }

  function _processDetections(detections) {
    var count = detections.length;
    _lastFaceCount = count;

    // Resize overlay to match video display size
    _resizeOverlay();

    // Clear previous drawings
    _clearOverlay();

    if (count === 0) {
      _handleNoFace();
    } else if (count === 1) {
      _handleSingleFace(detections[0]);
    } else {
      _handleMultiFace(detections);
    }

    // Update face count display
    _updateFaceCount(count);
  }

  // ── Detection Handlers ──

  function _handleNoFace() {
    _lastConfidence = 0;
    _updateConfidence(0);

    if (!_noFaceSince) {
      _noFaceSince = Date.now();
    }

    var elapsed = Date.now() - _noFaceSince;

    if (elapsed >= NO_FACE_PAUSE_DELAY && !_timerPaused) {
      _timerPaused = true;
      _setStatus(FACE_STATUS.TIMER_PAUSED);
      console.log('[FaceDetection] Timer paused — no face for', Math.round(elapsed / 1000), 'seconds');
      _fire('timerPaused', { reason: 'no_face', elapsed: elapsed });
    } else if (!_timerPaused) {
      _setStatus(FACE_STATUS.NO_FACE);
    }

    _fire('noFace', { elapsed: elapsed, timerPaused: _timerPaused });
  }

  function _handleSingleFace(detection) {
    var confidence = detection.score;
    _lastConfidence = confidence;
    _updateConfidence(confidence);

    // Draw bounding box
    _drawFaceBox(detection.box, confidence, false);

    // Reset no-face tracking
    _noFaceSince = null;

    // Resume timer if it was paused
    if (_timerPaused) {
      _timerPaused = false;
      console.log('[FaceDetection] Timer resumed — face detected (confidence:', Math.round(confidence * 100) + '%)');
      _fire('timerResumed', { confidence: confidence });
    }

    _setStatus(FACE_STATUS.FACE_FOUND);
    _fire('faceDetected', { confidence: confidence, box: detection.box });
  }

  function _handleMultiFace(detections) {
    // Use the largest face as primary
    var largest = _getLargestFace(detections);
    var confidence = largest.score;
    _lastConfidence = confidence;
    _updateConfidence(confidence);

    // Draw all faces — primary in green, others in orange
    for (var i = 0; i < detections.length; i++) {
      var det = detections[i];
      var isPrimary = det === largest;
      _drawFaceBox(det.box, det.score, !isPrimary);
    }

    // Reset no-face tracking
    _noFaceSince = null;

    // Resume timer if it was paused
    if (_timerPaused) {
      _timerPaused = false;
      console.log('[FaceDetection] Timer resumed — face detected (multi-face, confidence:', Math.round(confidence * 100) + '%)');
      _fire('timerResumed', { confidence: confidence });
    }

    console.log('[FaceDetection] Multiple faces detected:', detections.length);
    _setStatus(FACE_STATUS.MULTI_FACE);
    _fire('multiFace', { count: detections.length, confidence: confidence });
  }

  function _getLargestFace(detections) {
    var largest = detections[0];
    var maxArea = 0;

    for (var i = 0; i < detections.length; i++) {
      var box = detections[i].box;
      var area = box.width * box.height;
      if (area > maxArea) {
        maxArea = area;
        largest = detections[i];
      }
    }

    return largest;
  }

  // ── Drawing ──

  function _drawFaceBox(box, confidence, isWarning) {
    if (!_overlayCtx) return;

    var ctx = _overlayCtx;
    var color = isWarning ? '#ff6a00' : '#7fff00';
    var dimColor = isWarning ? 'rgba(255,106,0,0.08)' : 'rgba(127,255,0,0.08)';

    // Scale box to overlay canvas size
    var scaleX = _overlayCanvas.width / _videoEl.videoWidth;
    var scaleY = _overlayCanvas.height / _videoEl.videoHeight;

    var x = box.x * scaleX;
    var y = box.y * scaleY;
    var w = box.width * scaleX;
    var h = box.height * scaleY;

    // Fill
    ctx.fillStyle = dimColor;
    ctx.fillRect(x, y, w, h);

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Corner accents
    var cornerLen = Math.min(w, h) * 0.2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();

    // Confidence label
    var label = Math.round(confidence * 100) + '%';
    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = color;
    ctx.fillText(label, x + 4, y - 6);
  }

  function _resizeOverlay() {
    if (!_overlayCanvas || !_videoEl) return;

    var rect = _videoEl.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);

    if (_overlayCanvas.width !== w || _overlayCanvas.height !== h) {
      _overlayCanvas.width = w;
      _overlayCanvas.height = h;
    }
  }

  function _clearOverlay() {
    if (_overlayCtx && _overlayCanvas) {
      _overlayCtx.clearRect(0, 0, _overlayCanvas.width, _overlayCanvas.height);
    }
  }

  // ── DOM Updates ──

  function _setStatus(code) {
    if (_dom.statusEl) {
      _dom.statusEl.textContent = FACE_STATUS_TEXT[code] || 'UNKNOWN';
      _dom.statusEl.className = 'face-status';
      _dom.statusEl.classList.add('face-status--' + code);
    }
  }

  function _updateConfidence(score) {
    var pct = Math.round(score * 100);

    if (_dom.confBar) {
      _dom.confBar.style.width = pct + '%';
      _dom.confBar.className = 'face-conf__bar';
      if (pct >= 70) {
        _dom.confBar.classList.add('face-conf__bar--high');
      } else if (pct >= 40) {
        _dom.confBar.classList.add('face-conf__bar--mid');
      } else {
        _dom.confBar.classList.add('face-conf__bar--low');
      }
    }

    if (_dom.confText) {
      _dom.confText.textContent = pct + '%';
    }
  }

  function _updateFaceCount(count) {
    if (_dom.faceCountEl) {
      _dom.faceCountEl.textContent = count === 0 ? '0' : count;
      _dom.faceCountEl.className = 'face-count';
      if (count === 1) {
        _dom.faceCountEl.classList.add('face-count--ok');
      } else if (count > 1) {
        _dom.faceCountEl.classList.add('face-count--warn');
      } else {
        _dom.faceCountEl.classList.add('face-count--none');
      }
    }
  }

  // ── Accessors ──

  function isRunning() { return _running; }
  function isModelsLoaded() { return _modelsLoaded; }
  function isTimerPaused() { return _timerPaused; }
  function getFaceCount() { return _lastFaceCount; }
  function getConfidence() { return _lastConfidence; }

  // ── Event System ──

  /**
   * Events: loading, modelsLoaded, start, stop, faceDetected, noFace,
   *         multiFace, timerPaused, timerResumed, error
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
    stop();
    _modelsLoaded = false;
    _consecutiveErrors = 0;
    _callbacks = {};
    _dom = {};
    _videoEl = null;
    _overlayCanvas = null;
    _overlayCtx = null;
    window.removeEventListener('beforeunload', stop);
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      FACE_STATUS: FACE_STATUS,
      init: init,
      loadModels: loadModels,
      start: start,
      stop: stop,
      isRunning: isRunning,
      isModelsLoaded: isModelsLoaded,
      isTimerPaused: isTimerPaused,
      getFaceCount: getFaceCount,
      getConfidence: getConfidence,
      on: on,
      off: off,
      destroy: destroy
    };
  }

  return {
    FACE_STATUS: FACE_STATUS,
    init: init,
    loadModels: loadModels,
    start: start,
    stop: stop,
    isRunning: isRunning,
    isModelsLoaded: isModelsLoaded,
    isTimerPaused: isTimerPaused,
    getFaceCount: getFaceCount,
    getConfidence: getConfidence,
    on: on,
    off: off,
    destroy: destroy
  };
})();

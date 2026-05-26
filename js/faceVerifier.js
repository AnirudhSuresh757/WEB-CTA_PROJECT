/**
 * FACE VERIFIER — Registration, Descriptor Storage & Login Verification
 *
 * Uses face-api.js face recognition models to:
 *   - Generate 128-d face descriptors during registration
 *   - Store descriptors in localStorage keyed by USN
 *   - Compare live descriptors against stored ones at login
 *   - Monitor face identity during active sessions
 */
var FaceVerifier = (function () {
  'use strict';

  // ── Constants ──
  var DESCRIPTOR_KEY = 'sys_face_descriptors';
  var MATCH_THRESHOLD = 0.6;        // Euclidean distance threshold (lower = stricter)
  var CONFIDENCE_MIN = 0.4;         // Minimum face detection confidence
  var CAPTURE_ATTEMPTS = 3;         // Number of frames to average for stability
  var CAPTURE_DELAY_MS = 500;       // Delay between capture attempts
  var SESSION_CHECK_INTERVAL = 10000; // 10s between session identity checks

  // ── Model URLs ──
  var MODEL_URL = './models/weights';
  var CDN_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

  // ── State ──
  var _modelsLoaded = false;
  var _videoEl = null;
  var _sessionDescriptor = null;    // Descriptor from registration (stored for session monitoring)
  var _sessionCheckTimer = null;
  var _callbacks = {};
  var _dom = {};
  var _monitoring = false;
  var _lastVerificationResult = null;

  // ── Verification Status ──
  var STATUS = {
    IDLE:             'idle',
    LOADING:          'loading',
    SCANNING:         'scanning',
    CAPTURING:        'capturing',
    FACE_VERIFIED:    'face_verified',
    VERIFICATION_FAILED: 'verification_failed',
    NO_FACE:          'no_face',
    MULTI_FACE:       'multi_face',
    ERROR:            'error',
    UNAUTHORIZED:     'unauthorized'
  };

  var STATUS_TEXT = {};
  STATUS_TEXT[STATUS.IDLE]                = 'VERIFICATION IDLE';
  STATUS_TEXT[STATUS.LOADING]             = 'LOADING RECOGNITION MODELS...';
  STATUS_TEXT[STATUS.SCANNING]            = 'SCANNING FACE...';
  STATUS_TEXT[STATUS.CAPTURING]           = 'CAPTURING DESCRIPTOR...';
  STATUS_TEXT[STATUS.FACE_VERIFIED]       = 'FACE VERIFIED';
  STATUS_TEXT[STATUS.VERIFICATION_FAILED] = 'VERIFICATION FAILED';
  STATUS_TEXT[STATUS.NO_FACE]             = 'NO FACE DETECTED';
  STATUS_TEXT[STATUS.MULTI_FACE]          = 'MULTIPLE FACES DETECTED';
  STATUS_TEXT[STATUS.ERROR]               = 'RECOGNITION ERROR';
  STATUS_TEXT[STATUS.UNAUTHORIZED]        = 'UNAUTHORIZED USER DETECTED';

  // ── Initialization ──

  /**
   * Initialize the face verifier.
   * @param {Object} config
   *   - videoEl:          <video> element for face capture
   *   - statusEl:         element for verification status text
   *   - confidenceEl:     element for match confidence display
   */
  function init(config) {
    _videoEl = config.videoEl || null;
    _dom.statusEl = config.statusEl || null;
    _dom.confidenceEl = config.confidenceEl || null;
    _dom.overlayEl = config.overlayEl || null;

    _setStatus(STATUS.IDLE);
    return _publicAPI();
  }

  /**
   * Set the video element for face capture.
   */
  function setVideoElement(videoEl) {
    _videoEl = videoEl;
  }

  // ── Model Loading ──

  /**
   * Load face landmark and recognition models.
   * Tries local first, then CDN fallback.
   * @returns {Promise}
   */
  function loadModels() {
    if (_modelsLoaded) return Promise.resolve();

    if (typeof faceapi === 'undefined') {
      var err = 'face-api.js not loaded.';
      _setStatus(STATUS.ERROR);
      _fire('error', { message: err });
      return Promise.reject(new Error(err));
    }

    _setStatus(STATUS.LOADING);
    _fire('loading');

    console.log('[FaceVerifier] Loading recognition models...');

    // Load detection + landmark + recognition models (all required for descriptors)
    var loadFrom = function (url) {
      var promises = [];
      // Only load TinyFaceDetector if not already loaded (dashboard may have loaded it)
      if (!faceapi.nets.tinyFaceDetector.isLoaded) {
        promises.push(faceapi.nets.tinyFaceDetector.loadFromUri(url));
      }
      promises.push(faceapi.nets.faceLandmark68Net.loadFromUri(url));
      promises.push(faceapi.nets.faceRecognitionNet.loadFromUri(url));
      return Promise.all(promises);
    };

    return loadFrom(MODEL_URL)
      .then(function () {
        _modelsLoaded = true;
        console.log('[FaceVerifier] Recognition models loaded from local path');
        _setStatus(STATUS.IDLE);
        _fire('modelsLoaded');
      })
      .catch(function (localErr) {
        console.warn('[FaceVerifier] Local load failed, trying CDN:', localErr.message);
        return loadFrom(CDN_URL).then(function () {
          _modelsLoaded = true;
          console.log('[FaceVerifier] Recognition models loaded from CDN');
          _setStatus(STATUS.IDLE);
          _fire('modelsLoaded');
        }).catch(function (cdnErr) {
          console.error('[FaceVerifier] Both local and CDN loads failed');
          _setStatus(STATUS.ERROR);
          _fire('error', { message: 'Failed to load face recognition models.' });
          throw cdnErr;
        });
      });
  }

  // ── Descriptor Generation ──

  /**
   * Detect all faces in the current video frame.
   * @returns {Promise<Array>} Array of face detection results
   */
  function _detectAllFaces() {
    if (!_videoEl || !_videoEl.srcObject) {
      return Promise.resolve([]);
    }

    if (!_modelsLoaded) {
      return Promise.reject(new Error('Models not loaded'));
    }

    var options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: CONFIDENCE_MIN
    });

    return faceapi.detectAllFaces(_videoEl, options);
  }

  /**
   * Generate a single face descriptor from the current video frame.
   * @returns {Promise<Float32Array|null>}
   */
  function _captureDescriptor() {
    if (!_videoEl || !_videoEl.srcObject) {
      return Promise.resolve(null);
    }

    if (!_modelsLoaded) {
      return Promise.reject(new Error('Models not loaded'));
    }

    var options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: CONFIDENCE_MIN
    });

    return faceapi.detectSingleFace(_videoEl, options)
      .withFaceLandmarks()
      .withFaceDescriptor()
      .then(function (result) {
        if (!result) return null;
        return result.descriptor;
      });
  }

  /**
   * Capture multiple descriptors and return the average for stability.
   * @returns {Promise<{descriptor: Float32Array, confidence: number}>}
   */
  function captureStableDescriptor() {
    return loadModels().then(function () {
      _setStatus(STATUS.CAPTURING);
      _fire('capturing');

      var descriptors = [];
      var attempts = 0;

      function attemptCapture() {
        if (attempts >= CAPTURE_ATTEMPTS) {
          if (descriptors.length === 0) {
            _setStatus(STATUS.NO_FACE);
            _fire('noFace');
            return null;
          }
          // Average all captured descriptors
          var avg = _averageDescriptors(descriptors);
          _fire('descriptorCaptured', { descriptor: avg, captures: descriptors.length });
          return { descriptor: avg, confidence: 1.0 };
        }

        attempts++;
        _setStatus(STATUS.SCANNING);

        return _captureDescriptor().then(function (desc) {
          if (desc) {
            descriptors.push(desc);
          }
          return new Promise(function (resolve) {
            setTimeout(resolve, CAPTURE_DELAY_MS);
          });
        }).then(attemptCapture);
      }

      return attemptCapture();
    });
  }

  /**
   * Average multiple Float32Array descriptors.
   */
  function _averageDescriptors(descriptors) {
    if (descriptors.length === 1) return descriptors[0];

    var len = descriptors[0].length;
    var avg = new Float32Array(len);

    for (var i = 0; i < len; i++) {
      var sum = 0;
      for (var j = 0; j < descriptors.length; j++) {
        sum += descriptors[j][i];
      }
      avg[i] = sum / descriptors.length;
    }

    return avg;
  }

  // ── Descriptor Storage ──

  /**
   * Get all stored face descriptors.
   * @returns {Object} Map of USN -> descriptor array
   */
  function _getStoredDescriptors() {
    try {
      var raw = localStorage.getItem(DESCRIPTOR_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * Save a face descriptor for a USN.
   */
  function _saveDescriptor(usn, descriptor) {
    var stored = _getStoredDescriptors();
    stored[usn.toUpperCase()] = Array.from(descriptor);
    try {
      localStorage.setItem(DESCRIPTOR_KEY, JSON.stringify(stored));
    } catch (e) {
      console.error('[FaceVerifier] Failed to save descriptor:', e.message);
    }
  }

  /**
   * Get the stored descriptor for a USN.
   * @returns {Float32Array|null}
   */
  function getStoredDescriptor(usn) {
    var stored = _getStoredDescriptors();
    var arr = stored[usn.toUpperCase()];
    if (!arr) return null;
    return new Float32Array(arr);
  }

  /**
   * Check if a USN has a registered face.
   */
  function hasRegisteredFace(usn) {
    var stored = _getStoredDescriptors();
    return !!stored[usn.toUpperCase()];
  }

  /**
   * Remove a registered face for a USN.
   */
  function removeDescriptor(usn) {
    var stored = _getStoredDescriptors();
    delete stored[usn.toUpperCase()];
    try {
      localStorage.setItem(DESCRIPTOR_KEY, JSON.stringify(stored));
    } catch (e) { /* ignore */ }
  }

  // ── Face Comparison ──

  /**
   * Compute Euclidean distance between two descriptors.
   * Lower distance = more similar faces.
   * @param {Float32Array} desc1
   * @param {Float32Array} desc2
   * @returns {number} Euclidean distance
   */
  function computeDistance(desc1, desc2) {
    if (!desc1 || !desc2) return Infinity;
    if (desc1.length !== desc2.length) return Infinity;

    var sum = 0;
    for (var i = 0; i < desc1.length; i++) {
      var diff = desc1[i] - desc2[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Check if two descriptors match (distance below threshold).
   */
  function descriptorsMatch(desc1, desc2) {
    var distance = computeDistance(desc1, desc2);
    return distance <= MATCH_THRESHOLD;
  }

  // ── Registration Flow ──

  /**
   * Register a face for a student USN.
   * Validates exactly one face is present, captures stable descriptor, and stores it.
   * @param {string} usn
   * @returns {Promise<{success: boolean, message: string}>}
   */
  function registerFace(usn) {
    if (!usn || !usn.trim()) {
      return Promise.resolve({ success: false, message: 'USN is required for face registration.' });
    }

    var normalizedUsn = usn.trim().toUpperCase();

    // Check if already registered
    if (hasRegisteredFace(normalizedUsn)) {
      return Promise.resolve({
        success: false,
        message: 'A face is already registered for this USN. Only one face per student is allowed.'
      });
    }

    return loadModels().then(function () {
      // First check: exactly one face must be detected
      return _detectAllFaces();
    }).then(function (detections) {
      if (!detections || detections.length === 0) {
        _setStatus(STATUS.NO_FACE);
        _fire('noFace');
        return {
          success: false,
          message: 'No face detected. Please ensure your face is clearly visible to the camera.'
        };
      }

      if (detections.length > 1) {
        _setStatus(STATUS.MULTI_FACE);
        _fire('multiFace');
        return {
          success: false,
          message: 'Multiple faces detected. Only one person should be in the frame.'
        };
      }

      // Exactly one face — proceed with stable descriptor capture
      return captureStableDescriptor().then(function (result) {
        if (!result || !result.descriptor) {
          _setStatus(STATUS.NO_FACE);
          return {
            success: false,
            message: 'Face lost during capture. Please hold still and try again.'
          };
        }

        _saveDescriptor(normalizedUsn, result.descriptor);
        _setStatus(STATUS.FACE_VERIFIED);
        _fire('registered', { usn: normalizedUsn });

        console.log('[FaceVerifier] Face registered for USN:', normalizedUsn);
        return { success: true, message: 'Face registered successfully.' };
      });
    }).catch(function (err) {
      _setStatus(STATUS.ERROR);
      return { success: false, message: 'Face registration failed: ' + err.message };
    });
  }

  // ── Login Verification Flow ──

  /**
   * Verify a student's face at login against their registered descriptor.
   * @param {string} usn
   * @returns {Promise<{success: boolean, message: string, distance: number}>}
   */
  function verifyLogin(usn) {
    if (!usn || !usn.trim()) {
      return Promise.resolve({ success: false, message: 'USN is required for face verification.', distance: -1 });
    }

    var normalizedUsn = usn.trim().toUpperCase();

    // Check if student has a registered face
    if (!hasRegisteredFace(normalizedUsn)) {
      return Promise.resolve({
        success: false,
        message: 'No face registered for this USN. Please register first.',
        distance: -1
      });
    }

    var storedDesc = getStoredDescriptor(normalizedUsn);

    return loadModels().then(function () {
      _setStatus(STATUS.SCANNING);
      _fire('scanning');

      // Capture live descriptor (single attempt for login speed)
      return _captureDescriptor();
    }).then(function (liveDescriptor) {
      if (!liveDescriptor) {
        _setStatus(STATUS.NO_FACE);
        _fire('noFace');
        _lastVerificationResult = { success: false, distance: -1 };
        return {
          success: false,
          message: 'No face detected. Please ensure your face is clearly visible to the camera.',
          distance: -1
        };
      }

      var distance = computeDistance(storedDesc, liveDescriptor);
      var match = distance <= MATCH_THRESHOLD;

      if (match) {
        _setStatus(STATUS.FACE_VERIFIED);
        _sessionDescriptor = liveDescriptor;
        _lastVerificationResult = { success: true, distance: distance };
        _fire('verified', { usn: normalizedUsn, distance: distance });
        console.log('[FaceVerifier] Login verified for', normalizedUsn, '— distance:', distance.toFixed(4));
        return { success: true, message: 'Face verified. Identity confirmed.', distance: distance };
      } else {
        _setStatus(STATUS.UNAUTHORIZED);
        _lastVerificationResult = { success: false, distance: distance };
        _fire('unauthorized', { usn: normalizedUsn, distance: distance });
        console.warn('[FaceVerifier] UNAUTHORIZED login attempt for', normalizedUsn, '— distance:', distance.toFixed(4));
        return {
          success: false,
          message: 'Unauthorized user detected. Face does not match registered identity.',
          distance: distance
        };
      }
    }).catch(function (err) {
      _setStatus(STATUS.ERROR);
      _lastVerificationResult = { success: false, distance: -1 };
      return { success: false, message: 'Face verification error: ' + err.message, distance: -1 };
    });
  }

  // ── Session Monitoring ──

  /**
   * Start continuous face identity monitoring during an active session.
   * Periodically checks if the current face still matches the registered one.
   * @param {string} usn
   */
  function startSessionMonitoring(usn) {
    if (_monitoring) return;

    var normalizedUsn = usn.trim().toUpperCase();
    var storedDesc = getStoredDescriptor(normalizedUsn);

    if (!storedDesc) {
      console.warn('[FaceVerifier] Cannot start monitoring — no stored descriptor for', normalizedUsn);
      return;
    }

    _monitoring = true;
    _sessionDescriptor = null;

    console.log('[FaceVerifier] Session monitoring started for', normalizedUsn);

    _sessionCheckTimer = setInterval(function () {
      if (!_monitoring || !_videoEl || !_videoEl.srcObject) return;
      if (!_modelsLoaded) return;

      _captureDescriptor().then(function (liveDesc) {
        if (!liveDesc) {
          // No face — this is handled by FaceDetection module, not here
          return;
        }

        var distance = computeDistance(storedDesc, liveDesc);
        var match = distance <= MATCH_THRESHOLD;

        if (!match) {
          _setStatus(STATUS.UNAUTHORIZED);
          _fire('sessionFaceChanged', {
            usn: normalizedUsn,
            distance: distance,
            message: 'Face mismatch detected during active session'
          });
          console.warn('[FaceVerifier] SESSION ALERT: Face changed for', normalizedUsn,
            '— distance:', distance.toFixed(4));
        } else {
          // Update session descriptor reference
          _sessionDescriptor = liveDesc;
        }
      }).catch(function () { /* silent — transient errors OK during monitoring */ });
    }, SESSION_CHECK_INTERVAL);
  }

  /**
   * Stop session monitoring.
   */
  function stopSessionMonitoring() {
    _monitoring = false;
    _sessionDescriptor = null;
    if (_sessionCheckTimer) {
      clearInterval(_sessionCheckTimer);
      _sessionCheckTimer = null;
    }
    console.log('[FaceVerifier] Session monitoring stopped');
  }

  /**
   * Check if currently monitoring.
   */
  function isMonitoring() {
    return _monitoring;
  }

  // ── Status & UI ──

  function _setStatus(code) {
    if (_dom.statusEl) {
      _dom.statusEl.textContent = STATUS_TEXT[code] || 'UNKNOWN';
      _dom.statusEl.className = 'face-verify-status';
      _dom.statusEl.classList.add('face-verify-status--' + code);
    }
  }

  function getStatus() {
    return _lastVerificationResult;
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

  // ── Destroy ──

  function destroy() {
    stopSessionMonitoring();
    _modelsLoaded = false;
    _sessionDescriptor = null;
    _lastVerificationResult = null;
    _callbacks = {};
    _dom = {};
    _videoEl = null;
  }

  // ── Public API ──

  function _publicAPI() {
    return {
      STATUS: STATUS,
      init: init,
      setVideoElement: setVideoElement,
      loadModels: loadModels,
      registerFace: registerFace,
      verifyLogin: verifyLogin,
      hasRegisteredFace: hasRegisteredFace,
      getStoredDescriptor: getStoredDescriptor,
      removeDescriptor: removeDescriptor,
      computeDistance: computeDistance,
      descriptorsMatch: descriptorsMatch,
      startSessionMonitoring: startSessionMonitoring,
      stopSessionMonitoring: stopSessionMonitoring,
      isMonitoring: isMonitoring,
      getStatus: getStatus,
      on: on,
      off: off,
      destroy: destroy
    };
  }

  return {
    STATUS: STATUS,
    init: init,
    setVideoElement: setVideoElement,
    loadModels: loadModels,
    registerFace: registerFace,
    verifyLogin: verifyLogin,
    hasRegisteredFace: hasRegisteredFace,
    getStoredDescriptor: getStoredDescriptor,
    removeDescriptor: removeDescriptor,
    computeDistance: computeDistance,
    descriptorsMatch: descriptorsMatch,
    startSessionMonitoring: startSessionMonitoring,
    stopSessionMonitoring: stopSessionMonitoring,
    isMonitoring: isMonitoring,
    getStatus: getStatus,
    on: on,
    off: off,
    destroy: destroy
  };
})();

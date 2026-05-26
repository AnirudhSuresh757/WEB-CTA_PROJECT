/**
 * DATA RESET — Stale Data Cleanup & Version Management
 *
 * Ensures the application starts with a completely clean state
 * by stamping a data version and clearing all localStorage when
 * the version changes.
 *
 * Call DataReset.init() as the FIRST script on every page that
 * reads localStorage. It must run before any other module loads.
 */
var DataReset = (function () {
  'use strict';

  // ── Version ──
  // Bump this to force a full localStorage wipe on next page load.
  var VERSION = '3.0.0';
  var VERSION_KEY = 'sys_data_version';

  // ── All known localStorage keys used by the application ──
  var STORAGE_KEYS = [
    // Auth & sessions
    'sys_student_session',
    'sys_admin_session',
    'sys_users',

    // Lab sessions
    'sys_lab_session',
    'sys_session_history',

    // Attendance
    'sys_attendance_records',
    'sys_attendance_history',

    // Time tracker
    'sys_time_tracker',

    // Tasks / assignments
    'sys_lab_tasks',

    // Face verification
    'sys_face_descriptors',

    // Security monitor
    'sys_security_log',

    // Settings & preferences
    'sys_user_prefs',

    // Student CRUD
    'sys_student_records',

    // Resources
    'sys_resources',
    'sys_resource_downloads',

    // Admin
    'sys_admin_students',

    // Legacy / misc (catch any old keys)
    'sys_session'
  ];

  // sessionStorage keys
  var SESSION_KEYS = [
    'sys_face_verified',
    'sys_face_verified_usn'
  ];

  /**
   * Initialize: check version, clear stale data if needed.
   * Safe to call multiple times — only runs cleanup once per version.
   */
  function init() {
    var storedVersion = null;
    try {
      storedVersion = localStorage.getItem(VERSION_KEY);
    } catch (e) { /* access denied */ }

    if (storedVersion !== VERSION) {
      _clearAll();
      try {
        localStorage.setItem(VERSION_KEY, VERSION);
      } catch (e) { /* quota or access denied */ }
      console.log('[DataReset] Data reset to v' + VERSION);
    }
  }

  /**
   * Force a full reset regardless of version.
   * Useful for manual "clear all data" buttons.
   */
  function forceReset() {
    _clearAll();
    try {
      localStorage.setItem(VERSION_KEY, VERSION);
    } catch (e) { /* ignore */ }
    console.log('[DataReset] Forced full reset');
  }

  /**
   * Get the current data version.
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Check if stored version matches current version.
   */
  function isUpToDate() {
    try {
      return localStorage.getItem(VERSION_KEY) === VERSION;
    } catch (e) {
      return false;
    }
  }

  // ── Internal ──

  function _clearAll() {
    // Clear known localStorage keys
    for (var i = 0; i < STORAGE_KEYS.length; i++) {
      try {
        localStorage.removeItem(STORAGE_KEYS[i]);
      } catch (e) { /* ignore */ }
    }

    // Clear sessionStorage keys
    for (var j = 0; j < SESSION_KEYS.length; j++) {
      try {
        sessionStorage.removeItem(SESSION_KEYS[j]);
      } catch (e) { /* ignore */ }
    }

    // Scan for any sys_* keys we may have missed
    _scanAndClear();
  }

  /**
   * Scan localStorage for any keys starting with 'sys_' that aren't
   * in our known list. This catches keys from old versions or modules
   * we forgot to enumerate.
   */
  function _scanAndClear() {
    try {
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('sys_') === 0 && key !== VERSION_KEY) {
          keysToRemove.push(key);
        }
      }
      for (var j = 0; j < keysToRemove.length; j++) {
        localStorage.removeItem(keysToRemove[j]);
      }
    } catch (e) { /* iterate-and-remove can fail in some browsers */ }

    try {
      var sessionKeysToRemove = [];
      for (var k = 0; k < sessionStorage.length; k++) {
        var sKey = sessionStorage.key(k);
        if (sKey && sKey.indexOf('sys_') === 0) {
          sessionKeysToRemove.push(sKey);
        }
      }
      for (var m = 0; m < sessionKeysToRemove.length; m++) {
        sessionStorage.removeItem(sessionKeysToRemove[m]);
      }
    } catch (e) { /* ignore */ }
  }

  // ── Public API ──
  return {
    init: init,
    forceReset: forceReset,
    getVersion: getVersion,
    isUpToDate: isUpToDate
  };
})();

// Auto-initialize immediately on load
DataReset.init();

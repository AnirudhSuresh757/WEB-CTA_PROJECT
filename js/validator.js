/**
 * VALIDATOR MODULE — Reusable Form Validation
 * Provides field-level validation with inline error messages and dynamic highlighting.
 */
var Validator = (function () {
  'use strict';

  // ═══════════════════════════════════════════
  //  VALIDATION RULES
  // ═══════════════════════════════════════════

  /**
   * Validate USN format.
   * Expected: digits + letters + digits (e.g., 1RV20CS001, 1RV20IS042)
   */
  function validateUSN(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'USN is required.' };
    }
    var usn = value.trim();
    if (usn.length < 6) {
      return { valid: false, message: 'USN must be at least 6 characters.' };
    }
    if (usn.length > 15) {
      return { valid: false, message: 'USN must not exceed 15 characters.' };
    }
    // Allow alphanumeric USN formats
    if (!/^[A-Za-z0-9]+$/.test(usn)) {
      return { valid: false, message: 'USN must contain only letters and numbers.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate full name.
   */
  function validateName(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'Full name is required.' };
    }
    var name = value.trim();
    if (name.length < 2) {
      return { valid: false, message: 'Name must be at least 2 characters.' };
    }
    if (name.length > 60) {
      return { valid: false, message: 'Name must not exceed 60 characters.' };
    }
    if (!/^[A-Za-z\s.'-]+$/.test(name)) {
      return { valid: false, message: 'Name can only contain letters, spaces, dots, hyphens.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate department selection.
   */
  function validateDept(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'Please select a department.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate Gmail address.
   * Must be a valid email ending with @gmail.com.
   */
  function validateEmail(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'Email address is required.' };
    }
    var email = value.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email)) {
      return { valid: false, message: 'Please enter a valid Gmail address (@gmail.com).' };
    }
    if (email.length > 100) {
      return { valid: false, message: 'Email address is too long.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate general email (for admin CRUD).
   */
  function validateGeneralEmail(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'Email address is required.' };
    }
    var email = value.trim().toLowerCase();
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return { valid: false, message: 'Please enter a valid email address.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate Indian mobile number.
   * Must be 10 digits starting with 6, 7, 8, or 9.
   */
  function validateMobile(value) {
    if (!value || !value.trim()) {
      return { valid: false, message: 'Mobile number is required.' };
    }
    var mobile = value.trim().replace(/\s/g, '');
    if (!/^\d+$/.test(mobile)) {
      return { valid: false, message: 'Mobile number must contain only digits.' };
    }
    if (mobile.length !== 10) {
      return { valid: false, message: 'Mobile number must be exactly 10 digits.' };
    }
    if (!/^[6-9]/.test(mobile)) {
      return { valid: false, message: 'Mobile number must start with 6, 7, 8, or 9.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate password strength.
   * Requirements: min 6 chars, at least 1 uppercase, 1 lowercase, 1 number.
   */
  function validatePassword(value) {
    if (!value) {
      return { valid: false, message: 'Password is required.' };
    }
    if (value.length < 6) {
      return { valid: false, message: 'Password must be at least 6 characters.' };
    }
    if (value.length > 50) {
      return { valid: false, message: 'Password must not exceed 50 characters.' };
    }
    if (!/[A-Z]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-z]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[0-9]/.test(value)) {
      return { valid: false, message: 'Password must contain at least one number.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate password confirmation.
   */
  function validateConfirmPassword(password, confirmPassword) {
    if (!confirmPassword) {
      return { valid: false, message: 'Please confirm your password.' };
    }
    if (password !== confirmPassword) {
      return { valid: false, message: 'Passwords do not match.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate non-empty field (generic).
   */
  function validateRequired(value, fieldName) {
    if (!value || !value.trim()) {
      return { valid: false, message: (fieldName || 'This field') + ' is required.' };
    }
    return { valid: true, message: '' };
  }

  /**
   * Validate semester selection.
   */
  function validateSemester(value) {
    if (!value) {
      return { valid: false, message: 'Please select a semester.' };
    }
    var sem = parseInt(value, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      return { valid: false, message: 'Please select a valid semester (1-8).' };
    }
    return { valid: true, message: '' };
  }

  // ═══════════════════════════════════════════
  //  FIELD UI HELPERS
  // ═══════════════════════════════════════════

  /**
   * Show error on a field.
   * Adds .field--error class and inserts/shows .field__error element.
   */
  function showFieldError(fieldEl, message) {
    if (!fieldEl) return;

    fieldEl.classList.add('field--error');
    fieldEl.classList.remove('field--valid');

    // Find or create error message element
    var errorEl = fieldEl.querySelector('.field__error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field__error';
      // Insert after the input-wrap
      var inputWrap = fieldEl.querySelector('.field__input-wrap');
      if (inputWrap && inputWrap.nextSibling) {
        fieldEl.insertBefore(errorEl, inputWrap.nextSibling);
      } else {
        fieldEl.appendChild(errorEl);
      }
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }

  /**
   * Clear error from a field.
   * Removes .field--error class and hides .field__error element.
   */
  function clearFieldError(fieldEl) {
    if (!fieldEl) return;

    fieldEl.classList.remove('field--error');

    var errorEl = fieldEl.querySelector('.field__error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  /**
   * Mark field as valid.
   */
  function markFieldValid(fieldEl) {
    if (!fieldEl) return;

    fieldEl.classList.remove('field--error');
    fieldEl.classList.add('field--valid');

    var errorEl = fieldEl.querySelector('.field__error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  /**
   * Reset field state (remove both error and valid).
   */
  function resetField(fieldEl) {
    if (!fieldEl) return;

    fieldEl.classList.remove('field--error', 'field--valid');

    var errorEl = fieldEl.querySelector('.field__error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════
  //  ATTACH REAL-TIME VALIDATION
  // ═══════════════════════════════════════════

  /**
   * Attach real-time validation to an input field.
   * Validates on blur. Clears error on input.
   *
   * @param {HTMLElement} fieldEl - The .field container element
   * @param {HTMLElement} inputEl - The input/select element
   * @param {Function} validateFn - Validation function that returns { valid, message }
   * @param {Object} options - Optional config
   * @param {string} options.event - Event to validate on ('blur' default, 'input', 'change')
   * @param {boolean} options.validateOnInput - Also validate while typing (after first blur)
   */
  function attachField(fieldEl, inputEl, validateFn, options) {
    if (!fieldEl || !inputEl || !validateFn) return;

    var opts = options || {};
    var hasBlurred = false;

    // Validate on blur
    inputEl.addEventListener('blur', function () {
      hasBlurred = true;
      var result = validateFn(inputEl.value);
      if (!result.valid) {
        showFieldError(fieldEl, result.message);
      } else {
        markFieldValid(fieldEl);
      }
    });

    // Clear error on input (and optionally re-validate)
    inputEl.addEventListener('input', function () {
      if (!hasBlurred) {
        // Don't show errors until first blur, but clear if user is fixing
        clearFieldError(fieldEl);
        return;
      }
      var result = validateFn(inputEl.value);
      if (!result.valid) {
        showFieldError(fieldEl, result.message);
      } else {
        markFieldValid(fieldEl);
      }
    });

    // For select elements
    if (inputEl.tagName === 'SELECT') {
      inputEl.addEventListener('change', function () {
        hasBlurred = true;
        var result = validateFn(inputEl.value);
        if (!result.valid) {
          showFieldError(fieldEl, result.message);
        } else {
          markFieldValid(fieldEl);
        }
      });
    }
  }

  /**
   * Validate all fields in a form and show errors.
   * Returns true if all valid.
   *
   * @param {Array} fields - Array of { fieldEl, inputEl, validateFn }
   * @returns {boolean}
   */
  function validateAll(fields) {
    var allValid = true;
    var firstInvalid = null;

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var result = f.validateFn(f.inputEl.value);
      if (!result.valid) {
        showFieldError(f.fieldEl, result.message);
        allValid = false;
        if (!firstInvalid) firstInvalid = f.inputEl;
      } else {
        markFieldValid(f.fieldEl);
      }
    }

    // Focus first invalid field
    if (firstInvalid) {
      firstInvalid.focus();
    }

    return allValid;
  }

  /**
   * Reset all fields in a form.
   */
  function resetAll(fields) {
    for (var i = 0; i < fields.length; i++) {
      resetField(fields[i].fieldEl);
    }
  }

  // ═══════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════

  return {
    // Validation functions
    validateUSN: validateUSN,
    validateName: validateName,
    validateDept: validateDept,
    validateEmail: validateEmail,
    validateGeneralEmail: validateGeneralEmail,
    validateMobile: validateMobile,
    validatePassword: validatePassword,
    validateConfirmPassword: validateConfirmPassword,
    validateRequired: validateRequired,
    validateSemester: validateSemester,

    // UI helpers
    showFieldError: showFieldError,
    clearFieldError: clearFieldError,
    markFieldValid: markFieldValid,
    resetField: resetField,

    // Form helpers
    attachField: attachField,
    validateAll: validateAll,
    resetAll: resetAll
  };
})();

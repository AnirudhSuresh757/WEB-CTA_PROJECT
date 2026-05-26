/**
 * STUDENT CRUD MODULE — Complete CRUD Operations for Student Management
 * Uses: push(), splice(), find(), findIndex(), map(), filter(), forEach()
 * Storage: localStorage
 */
var StudentCrud = (function () {
  'use strict';

  var STORAGE_KEY = 'sys_users';  // Shared with Auth module — single source of truth
  var _students = [];
  var _filtered = [];
  var _editingId = null;
  var _dom = {};
  var _callbacks = {};

  // ═══════════════════════════════════════════
  //  INITIALIZATION
  // ═══════════════════════════════════════════

  function init() {
    _students = _loadFromStorage();
    _filtered = _students.slice();
    _cacheElements();
    _attachFieldValidation();
    _bindEvents();
    _renderTable();
    _updateStats();
  }

  function _cacheElements() {
    _dom.form = document.getElementById('studentCrudForm');
    _dom.formTitle = document.getElementById('crudFormTitle');
    _dom.submitBtn = document.getElementById('crudSubmitBtn');
    _dom.cancelBtn = document.getElementById('crudCancelBtn');
    _dom.formToggle = document.getElementById('crudFormToggle');
    _dom.formContainer = document.getElementById('crudFormContainer');

    // Form fields
    _dom.usn = document.getElementById('crudUsn');
    _dom.name = document.getElementById('crudName');
    _dom.dept = document.getElementById('crudDept');
    _dom.email = document.getElementById('crudEmail');
    _dom.mobile = document.getElementById('crudMobile');
    _dom.semester = document.getElementById('crudSemester');

    // Search & Filter
    _dom.searchInput = document.getElementById('crudSearchInput');
    _dom.deptFilter = document.getElementById('crudDeptFilter');

    // Table
    _dom.tableBody = document.getElementById('crudTableBody');
    _dom.tableCount = document.getElementById('crudTableCount');

    // Stats
    _dom.totalCount = document.getElementById('crudTotalCount');
    _dom.cseCount = document.getElementById('crudCseCount');
    _dom.iseCount = document.getElementById('crudIseCount');
    _dom.eceCount = document.getElementById('crudEceCount');

    // Delete Modal
    _dom.deleteModal = document.getElementById('deleteModal');
    _dom.deleteName = document.getElementById('deleteStudentName');
    _dom.deleteUsn = document.getElementById('deleteStudentUsn');
    _dom.deleteConfirm = document.getElementById('deleteConfirmBtn');
    _dom.deleteCancel = document.getElementById('deleteCancelBtn');

    // Toast
    _dom.toastContainer = document.getElementById('toastContainer');
  }

  // ═══════════════════════════════════════════
  //  FIELD VALIDATION
  // ═══════════════════════════════════════════

  var _formFields = [];

  function _attachFieldValidation() {
    if (typeof Validator === 'undefined') return;

    var fields = [
      { dom: 'usn', validateFn: Validator.validateUSN },
      { dom: 'name', validateFn: Validator.validateName },
      { dom: 'dept', validateFn: Validator.validateDept },
      { dom: 'email', validateFn: Validator.validateGeneralEmail },
      { dom: 'mobile', validateFn: Validator.validateMobile },
      { dom: 'semester', validateFn: Validator.validateSemester }
    ];

    _formFields = [];
    for (var i = 0; i < fields.length; i++) {
      var inputEl = _dom[fields[i].dom];
      if (!inputEl) continue;
      var fieldEl = inputEl.closest('.crud-field');
      if (!fieldEl) continue;

      Validator.attachField(fieldEl, inputEl, fields[i].validateFn);
      _formFields.push({
        fieldEl: fieldEl,
        inputEl: inputEl,
        validateFn: fields[i].validateFn
      });
    }
  }

  // ═══════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════

  function _bindEvents() {
    // Form submission
    if (_dom.form) {
      _dom.form.addEventListener('submit', _handleSubmit);
    }

    // Cancel edit
    if (_dom.cancelBtn) {
      _dom.cancelBtn.addEventListener('click', _cancelEdit);
    }

    // Form toggle
    if (_dom.formToggle) {
      _dom.formToggle.addEventListener('click', function () {
        if (_dom.formContainer) {
          _dom.formContainer.classList.toggle('collapsed');
          _dom.formToggle.textContent = _dom.formContainer.classList.contains('collapsed') ? '+' : '−';
        }
      });
    }

    // Search
    if (_dom.searchInput) {
      _dom.searchInput.addEventListener('input', _applyFilters);
    }

    // Dept filter
    if (_dom.deptFilter) {
      _dom.deptFilter.addEventListener('change', _applyFilters);
    }

    // Delete modal buttons
    if (_dom.deleteConfirm) {
      _dom.deleteConfirm.addEventListener('click', _confirmDelete);
    }
    if (_dom.deleteCancel) {
      _dom.deleteCancel.addEventListener('click', _closeDeleteModal);
    }

    // Close modal on overlay click
    if (_dom.deleteModal) {
      _dom.deleteModal.addEventListener('click', function (e) {
        if (e.target === _dom.deleteModal) {
          _closeDeleteModal();
        }
      });
    }

    // Escape key closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _dom.deleteModal && _dom.deleteModal.classList.contains('active')) {
        _closeDeleteModal();
      }
    });

    // Table delegation for edit/delete buttons
    if (_dom.tableBody) {
      _dom.tableBody.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-action="edit"]');
        var deleteBtn = e.target.closest('[data-action="delete"]');

        if (editBtn) {
          var editId = editBtn.getAttribute('data-id');
          _startEdit(editId);
        }

        if (deleteBtn) {
          var deleteId = deleteBtn.getAttribute('data-id');
          _openDeleteModal(deleteId);
        }
      });
    }
  }

  // ═══════════════════════════════════════════
  //  LOCAL STORAGE
  // ═══════════════════════════════════════════

  function _loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var users = JSON.parse(raw);
        if (Array.isArray(users)) {
          // Filter: only return students (not admins)
          return users.filter(function (u) { return u.role === 'student'; });
        }
      }
    } catch (e) { /* ignore */ }
    return [];
  }

  function _saveToStorage() {
    try {
      // Load all users (students + admins)
      var raw = localStorage.getItem(STORAGE_KEY);
      var allUsers = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(allUsers)) allUsers = [];

      // Remove all existing students, keep admins and other roles
      var nonStudents = allUsers.filter(function (u) { return u.role !== 'student'; });

      // Merge: non-students + current students
      var merged = nonStudents.concat(_students);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) { /* quota exceeded */ }
  }

  // ═══════════════════════════════════════════
  //  CREATE
  // ═══════════════════════════════════════════

  function _createStudent(data) {
    var usnUpper = data.usn.toUpperCase().trim();

    // Check duplicate USN using find()
    var existing = _students.find(function (s) {
      return (s.usn || s.id || '').toUpperCase() === usnUpper;
    });
    if (existing) {
      return { success: false, message: 'USN already exists: ' + (existing.usn || existing.id) };
    }

    // Check duplicate email using find()
    var emailDup = _students.find(function (s) {
      return (s.email || '').toLowerCase() === data.email.toLowerCase();
    });
    if (emailDup) {
      return { success: false, message: 'Email already registered: ' + emailDup.name };
    }

    // Check duplicate mobile using find()
    var mobileDup = _students.find(function (s) {
      return s.mobile === data.mobile;
    });
    if (mobileDup) {
      return { success: false, message: 'Mobile already registered: ' + mobileDup.name };
    }

    // Auth-compatible format: id = USN, role = 'student'
    var newStudent = {
      id: usnUpper,
      usn: usnUpper,
      password: 'student123',  // Default password — student should change
      name: data.name.trim(),
      role: 'student',
      dept: data.dept.toUpperCase().trim(),
      email: data.email.toLowerCase().trim(),
      mobile: data.mobile.trim(),
      semester: parseInt(data.semester, 10) || 1,
      hasFace: false,
      createdAt: new Date().toISOString()
    };

    // push() — Add to array
    _students.push(newStudent);
    _saveToStorage();
    _applyFilters();
    _updateStats();

    return { success: true, student: newStudent };
  }

  // ═══════════════════════════════════════════
  //  READ
  // ═══════════════════════════════════════════

  function _getAllStudents() {
    return _students.slice();
  }

  function _getStudentById(id) {
    // find() — Find student by ID
    return _students.find(function (s) {
      return s.id === id;
    }) || null;
  }

  function _getStudentByUsn(usn) {
    // find() — Find student by USN (id IS the USN in aligned format)
    var upper = usn.toUpperCase();
    return _students.find(function (s) {
      return (s.usn || s.id || '').toUpperCase() === upper;
    }) || null;
  }

  function _getFilteredStudents() {
    return _filtered.slice();
  }

  // ═══════════════════════════════════════════
  //  UPDATE
  // ═══════════════════════════════════════════

  function _updateStudent(id, data) {
    // findIndex() — Find index of student to update
    var idx = _students.findIndex(function (s) {
      return s.id === id;
    });

    if (idx === -1) {
      return { success: false, message: 'Student not found.' };
    }

    var usnUpper = data.usn.toUpperCase().trim();

    // Check duplicate USN (exclude current) using find()
    var usnDup = _students.find(function (s) {
      return s.id !== id && (s.usn || s.id || '').toUpperCase() === usnUpper;
    });
    if (usnDup) {
      return { success: false, message: 'USN already exists: ' + (usnDup.usn || usnDup.id) };
    }

    // Check duplicate email (exclude current) using find()
    var emailDup = _students.find(function (s) {
      return s.id !== id && (s.email || '').toLowerCase() === data.email.toLowerCase();
    });
    if (emailDup) {
      return { success: false, message: 'Email already registered: ' + emailDup.name };
    }

    // Check duplicate mobile (exclude current) using find()
    var mobileDup = _students.find(function (s) {
      return s.id !== id && s.mobile === data.mobile;
    });
    if (mobileDup) {
      return { success: false, message: 'Mobile already registered: ' + mobileDup.name };
    }

    // Update fields (id IS the USN, so update both id and usn)
    _students[idx].id = usnUpper;
    _students[idx].usn = usnUpper;
    _students[idx].name = data.name.trim();
    _students[idx].dept = data.dept.toUpperCase().trim();
    _students[idx].email = data.email.toLowerCase().trim();
    _students[idx].mobile = data.mobile.trim();
    _students[idx].semester = parseInt(data.semester, 10) || _students[idx].semester;
    _students[idx].updatedAt = new Date().toISOString();

    _saveToStorage();
    _applyFilters();
    _updateStats();

    return { success: true, student: _students[idx] };
  }

  // ═══════════════════════════════════════════
  //  DELETE
  // ═══════════════════════════════════════════

  var _pendingDeleteId = null;

  function _openDeleteModal(id) {
    var student = _getStudentById(id);
    if (!student) return;

    _pendingDeleteId = id;
    if (_dom.deleteName) _dom.deleteName.textContent = student.name;
    if (_dom.deleteUsn) _dom.deleteUsn.textContent = student.usn || student.id;
    if (_dom.deleteModal) _dom.deleteModal.classList.add('active');
  }

  function _closeDeleteModal() {
    _pendingDeleteId = null;
    if (_dom.deleteModal) _dom.deleteModal.classList.remove('active');
  }

  function _confirmDelete() {
    if (!_pendingDeleteId) return;

    // findIndex() — Find index of student to delete
    var idx = _students.findIndex(function (s) {
      return s.id === _pendingDeleteId;
    });

    if (idx === -1) {
      _showToast('error', 'Error', 'Student not found.');
      _closeDeleteModal();
      return;
    }

    var deleted = _students[idx];

    // splice() — Remove student from array
    _students.splice(idx, 1);
    _saveToStorage();
    _applyFilters();
    _updateStats();
    _closeDeleteModal();

    _showToast('success', 'Student Deleted', deleted.name + ' (' + (deleted.usn || deleted.id) + ') has been removed.');

    // If we were editing this student, cancel the edit
    if (_editingId === _pendingDeleteId) {
      _cancelEdit();
    }

    _emit('delete', { student: deleted });
  }

  // ═══════════════════════════════════════════
  //  SEARCH & FILTER
  // ═══════════════════════════════════════════

  function _applyFilters() {
    var query = (_dom.searchInput ? _dom.searchInput.value : '').toLowerCase().trim();
    var dept = _dom.deptFilter ? _dom.deptFilter.value : '';

    // filter() — Filter students by search query and department
    _filtered = _students.filter(function (s) {
      var usn = (s.usn || s.id || '').toLowerCase();
      var matchQuery = !query ||
        (s.name || '').toLowerCase().indexOf(query) !== -1 ||
        usn.indexOf(query) !== -1 ||
        (s.email || '').toLowerCase().indexOf(query) !== -1;
      var matchDept = !dept || s.dept === dept;
      return matchQuery && matchDept;
    });

    _renderTable();
  }

  // ═══════════════════════════════════════════
  //  FORM HANDLING
  // ═══════════════════════════════════════════

  function _handleSubmit(e) {
    e.preventDefault();

    // Validate all fields with inline errors
    if (_formFields.length > 0 && typeof Validator !== 'undefined') {
      var allValid = Validator.validateAll(_formFields);
      if (!allValid) return;
    }

    var data = {
      usn: _dom.usn ? _dom.usn.value : '',
      name: _dom.name ? _dom.name.value : '',
      dept: _dom.dept ? _dom.dept.value : '',
      email: _dom.email ? _dom.email.value : '',
      mobile: _dom.mobile ? _dom.mobile.value : '',
      semester: _dom.semester ? _dom.semester.value : '1'
    };

    var result;
    if (_editingId) {
      result = _updateStudent(_editingId, data);
      if (result.success) {
        _showToast('success', 'Student Updated', result.student.name + ' has been updated.');
        _cancelEdit();
        _emit('update', { student: result.student });
      } else {
        _showToast('error', 'Update Failed', result.message);
      }
    } else {
      result = _createStudent(data);
      if (result.success) {
        _showToast('success', 'Student Added', result.student.name + ' (' + (result.student.usn || result.student.id) + ') has been added.');
        _resetForm();
        _emit('create', { student: result.student });
      } else {
        _showToast('error', 'Creation Failed', result.message);
      }
    }
  }

  function _startEdit(id) {
    var student = _getStudentById(id);
    if (!student) return;

    _editingId = id;

    if (_dom.usn) _dom.usn.value = student.usn || student.id || '';
    if (_dom.name) _dom.name.value = student.name || '';
    if (_dom.dept) _dom.dept.value = student.dept || '';
    if (_dom.email) _dom.email.value = student.email || '';
    if (_dom.mobile) _dom.mobile.value = student.mobile || '';
    if (_dom.semester) _dom.semester.value = student.semester || 1;

    if (_dom.formTitle) _dom.formTitle.textContent = '// EDIT STUDENT RECORD';
    if (_dom.submitBtn) _dom.submitBtn.textContent = 'UPDATE RECORD';
    if (_dom.cancelBtn) _dom.cancelBtn.style.display = 'inline-flex';

    // Clear validation states
    if (typeof Validator !== 'undefined') {
      Validator.resetAll(_formFields);
    }

    // Expand form if collapsed
    if (_dom.formContainer && _dom.formContainer.classList.contains('collapsed')) {
      _dom.formContainer.classList.remove('collapsed');
      if (_dom.formToggle) _dom.formToggle.textContent = '−';
    }

    // Scroll to form
    if (_dom.form) {
      _dom.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function _cancelEdit() {
    _editingId = null;
    _resetForm();
    if (_dom.formTitle) _dom.formTitle.textContent = '// ADD NEW STUDENT';
    if (_dom.submitBtn) _dom.submitBtn.textContent = 'ADD RECORD';
    if (_dom.cancelBtn) _dom.cancelBtn.style.display = 'none';
  }

  function _resetForm() {
    if (_dom.form) _dom.form.reset();
    _editingId = null;
    // Reset field validation states
    if (typeof Validator !== 'undefined') {
      Validator.resetAll(_formFields);
    }
  }

  // ═══════════════════════════════════════════
  //  RENDERING
  // ═══════════════════════════════════════════

  function _renderTable() {
    if (!_dom.tableBody) return;

    // Update count
    if (_dom.tableCount) {
      _dom.tableCount.textContent = _filtered.length + ' / ' + _students.length;
    }

    if (_filtered.length === 0) {
      _dom.tableBody.innerHTML =
        '<tr><td colspan="7" class="empty-state">' +
        (_students.length === 0 ? 'No students registered. Add a student above.' : 'No students match filters.') +
        '</td></tr>';
      return;
    }

    var html = '';

    // forEach() — Render each student row
    _filtered.forEach(function (s) {
      html += '<tr>';
      html += '<td><span class="student-table__id">' + _esc(s.usn || s.id) + '</span></td>';
      html += '<td>' + _esc(s.name || '') + '</td>';
      html += '<td>' + _esc(s.dept || '') + '</td>';
      html += '<td>' + _esc(s.email || '') + '</td>';
      html += '<td>' + _esc(s.mobile || '') + '</td>';
      html += '<td>Sem ' + (s.semester || 1) + '</td>';
      html += '<td>';
      html += '<div class="crud-actions">';
      html += '<button class="crud-action crud-action--edit" data-action="edit" data-id="' + s.id + '" title="Edit">✎</button>';
      html += '<button class="crud-action crud-action--delete" data-action="delete" data-id="' + s.id + '" title="Delete">✕</button>';
      html += '</div>';
      html += '</td>';
      html += '</tr>';
    });

    _dom.tableBody.innerHTML = html;
  }

  function _updateStats() {
    // map() — Extract departments
    var depts = _students.map(function (s) { return s.dept; });

    // filter() — Count by department
    var cse = depts.filter(function (d) { return d === 'CSE'; }).length;
    var ise = depts.filter(function (d) { return d === 'ISE'; }).length;
    var ece = depts.filter(function (d) { return d === 'ECE'; }).length;

    if (_dom.totalCount) _dom.totalCount.textContent = _students.length;
    if (_dom.cseCount) _dom.cseCount.textContent = cse;
    if (_dom.iseCount) _dom.iseCount.textContent = ise;
    if (_dom.eceCount) _dom.eceCount.textContent = ece;
  }

  // ═══════════════════════════════════════════
  //  TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════

  function _showToast(type, title, message) {
    if (!_dom.toastContainer) return;

    var toast = document.createElement('div');
    toast.className = 'toast toast--' + type;

    var iconMap = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    var icon = iconMap[type] || 'ℹ';

    toast.innerHTML =
      '<div class="toast__icon">' + icon + '</div>' +
      '<div class="toast__content">' +
        '<div class="toast__title">' + title + '</div>' +
        '<div class="toast__message">' + message + '</div>' +
      '</div>' +
      '<button class="toast__close" onclick="this.parentElement.remove()">×</button>';

    _dom.toastContainer.appendChild(toast);

    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });

    setTimeout(function () {
      toast.classList.remove('visible');
      setTimeout(function () {
        if (toast.parentElement) toast.remove();
      }, 300);
    }, 4000);
  }

  // ═══════════════════════════════════════════
  //  EVENT EMITTER
  // ═══════════════════════════════════════════

  function on(event, callback) {
    if (!_callbacks[event]) _callbacks[event] = [];
    _callbacks[event].push(callback);
  }

  function _emit(event, data) {
    if (_callbacks[event]) {
      _callbacks[event].forEach(function (cb) { cb(data); });
    }
  }

  // ═══════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════

  function _esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════

  return {
    init: init,
    getAll: _getAllStudents,
    getById: _getStudentById,
    getByUsn: _getStudentByUsn,
    getFiltered: _getFilteredStudents,
    create: _createStudent,
    update: _updateStudent,
    delete: function (id) {
      var idx = _students.findIndex(function (s) { return s.id === id; });
      if (idx === -1) return false;
      _students.splice(idx, 1);
      _saveToStorage();
      _applyFilters();
      _updateStats();
      return true;
    },
    search: function (query) {
      if (_dom.searchInput) _dom.searchInput.value = query;
      _applyFilters();
    },
    refresh: function () {
      _students = _loadFromStorage();
      _applyFilters();
      _updateStats();
    },
    on: on
  };
})();

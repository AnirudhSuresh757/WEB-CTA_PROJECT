/**
 * AUTH MODULE — Session & Credential Management
 */
var Auth = (function () {
  'use strict';

  // ── Session Keys (separate for students and admins) ──
  var STUDENT_SESSION_KEY = 'sys_student_session';
  var ADMIN_SESSION_KEY = 'sys_admin_session';
  var USERS_KEY = 'sys_users';

  // ── Hardcoded Admin/Faculty Credentials ──
  var ADMIN_CREDENTIALS = [
    { id: 'FAC001', password: 'faculty123', name: 'Dr. Suresh Kumar', role: 'faculty', dept: 'CSE', designation: 'Professor' },
    { id: 'FAC002', password: 'faculty123', name: 'Dr. Neha Joshi',   role: 'faculty', dept: 'ISE', designation: 'Associate Professor' },
    { id: 'FAC003', password: 'faculty123', name: 'Prof. Rajesh Rao', role: 'faculty', dept: 'ECE', designation: 'Assistant Professor' },
    { id: 'ADM001', password: 'admin123',   name: 'Admin Central',    role: 'admin',   dept: 'ADMIN', designation: 'System Administrator' },
    { id: 'ADM002', password: 'admin123',   name: 'Dr. Lakshmi Devi', role: 'admin',   dept: 'ADMIN', designation: 'Principal' }
  ];

  // ── Initialize Student Database ──
  function initDatabase() {
    if (!localStorage.getItem(USERS_KEY)) {
      localStorage.setItem(USERS_KEY, JSON.stringify([]));
    }
  }

  function getUsers() {
    var data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // ── Validation (Admin/Faculty) ──
  function validateCredentials(userId, password) {
    var errors = [];

    if (!userId || !userId.trim()) {
      errors.push('User ID is required.');
    } else if (userId.trim().length < 3) {
      errors.push('User ID must be at least 3 characters.');
    }

    if (!password) {
      errors.push('Password is required.');
    } else if (password.length < 4) {
      errors.push('Password must be at least 4 characters.');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // ── Validation (Student) ──
  function validateStudentCredentials(usn, password) {
    var errors = [];

    if (!usn || !usn.trim()) {
      errors.push('USN is required.');
    } else if (usn.trim().length < 6) {
      errors.push('USN must be at least 6 characters.');
    }

    if (!password) {
      errors.push('Password is required.');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters.');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  function validateRegistration(usn, name, dept, email, mobile, password) {
    var errors = [];

    if (!usn || !usn.trim()) {
      errors.push('USN is required.');
    } else if (usn.trim().length < 6) {
      errors.push('USN must be at least 6 characters.');
    }

    if (!name || !name.trim()) {
      errors.push('Full name is required.');
    } else if (name.trim().length < 2) {
      errors.push('Name must be at least 2 characters.');
    }

    if (!dept || !dept.trim()) {
      errors.push('Department is required.');
    }

    if (!email || !email.trim()) {
      errors.push('Gmail address is required.');
    } else if (!/^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email.trim())) {
      errors.push('Please enter a valid Gmail address.');
    }

    if (!mobile || !mobile.trim()) {
      errors.push('Mobile number is required.');
    } else if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      errors.push('Please enter a valid 10-digit mobile number.');
    }

    if (!password) {
      errors.push('Password is required.');
    } else if (password.length < 6) {
      errors.push('Password must be at least 6 characters.');
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.push('Password must contain uppercase, lowercase, and number.');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // ── Student Registration ──
  function registerStudent(usn, name, dept, email, mobile, password, faceDescriptor) {
    var users = getUsers();
    var normalizedId = usn.trim().toUpperCase();
    var normalizedEmail = email.trim().toLowerCase();
    var normalizedMobile = mobile.trim();

    // Check if USN already exists
    for (var i = 0; i < users.length; i++) {
      if (users[i].id.toUpperCase() === normalizedId) {
        return { success: false, message: 'This USN is already registered. Please login instead.' };
      }
    }

    // Check if Gmail already exists
    for (var j = 0; j < users.length; j++) {
      if (users[j].email && users[j].email.toLowerCase() === normalizedEmail) {
        return { success: false, message: 'This Gmail is already registered with another account.' };
      }
    }

    // Check if mobile number already exists
    for (var k = 0; k < users.length; k++) {
      if (users[k].mobile && users[k].mobile === normalizedMobile) {
        return { success: false, message: 'This mobile number is already registered with another account.' };
      }
    }

    // Create new student
    var newStudent = {
      id: normalizedId,
      password: password,
      name: name.trim(),
      role: 'student',
      dept: dept.trim().toUpperCase(),
      email: normalizedEmail,
      mobile: normalizedMobile,
      hasFace: !!faceDescriptor
    };

    users.push(newStudent);
    saveUsers(users);

    return { success: true, user: newStudent };
  }

  // ── Student Authentication ──
  function loginStudent(usn, password) {
    var users = getUsers();
    var normalizedId = usn.trim().toUpperCase();

    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id.toUpperCase() === normalizedId) {
        user = users[i];
        break;
      }
    }

    if (!user) {
      return { success: false, message: 'USN not found. Please register first.' };
    }

    if (user.role !== 'student') {
      return { success: false, message: 'This ID is not a student account. Use admin login.' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Incorrect password. Access denied.' };
    }

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        dept: user.dept
      }
    };
  }

  // ── Admin/Faculty Authentication (hardcoded credentials only) ──
  function loginAdmin(userId, password) {
    var normalizedId = userId.trim().toUpperCase();

    // Search only in hardcoded admin credentials
    var admin = null;
    for (var i = 0; i < ADMIN_CREDENTIALS.length; i++) {
      if (ADMIN_CREDENTIALS[i].id.toUpperCase() === normalizedId) {
        admin = ADMIN_CREDENTIALS[i];
        break;
      }
    }

    if (!admin) {
      return { success: false, message: 'Admin ID not found. Access restricted to authorized personnel.' };
    }

    if (admin.password !== password) {
      return { success: false, message: 'Incorrect password. Access denied.' };
    }

    return {
      success: true,
      user: {
        id: admin.id,
        name: admin.name,
        role: admin.role,
        dept: admin.dept,
        designation: admin.designation || null
      }
    };
  }

  // ── Password Management ──

  function changePassword(userId, currentPassword, newPassword) {
    var users = getUsers();
    var normalizedId = userId.trim().toUpperCase();

    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id.toUpperCase() === normalizedId) {
        user = users[i];
        break;
      }
    }

    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    if (user.password !== currentPassword) {
      return { success: false, message: 'Current password is incorrect.' };
    }

    if (newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters.' };
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return { success: false, message: 'New password must contain uppercase, lowercase, and number.' };
    }

    if (currentPassword === newPassword) {
      return { success: false, message: 'New password must differ from current password.' };
    }

    user.password = newPassword;
    saveUsers(users);

    return { success: true, message: 'Password updated successfully.' };
  }

  /**
   * Reset password without current password (used after face verification).
   * Requires: USN exists, new password meets criteria.
   */
  function resetPassword(userId, newPassword) {
    var users = getUsers();
    var normalizedId = userId.trim().toUpperCase();

    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id.toUpperCase() === normalizedId) {
        user = users[i];
        break;
      }
    }

    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    if (user.role !== 'student') {
      return { success: false, message: 'Password reset is only available for student accounts.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters.' };
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return { success: false, message: 'Password must contain uppercase, lowercase, and number.' };
    }

    user.password = newPassword;
    saveUsers(users);

    return { success: true, message: 'Password has been reset successfully.' };
  }

  /**
   * Find a student by USN (returns minimal public info, no password).
   */
  function findStudent(usn) {
    var users = getUsers();
    var normalizedId = (usn || '').trim().toUpperCase();
    for (var i = 0; i < users.length; i++) {
      if (users[i].id.toUpperCase() === normalizedId && users[i].role === 'student') {
        return {
          id: users[i].id,
          name: users[i].name,
          dept: users[i].dept,
          role: users[i].role,
          hasFace: !!users[i].hasFace
        };
      }
    }
    return null;
  }

  // ── Student Session Management ──

  /**
   * Generate a unique session ID.
   */
  function _generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  function createStudentSession(user, labName) {
    // Check for existing active session for this USN
    var existing = getStudentSession();
    if (existing && existing.userId === user.id) {
      // Restore existing session — do not create a new one
      return existing;
    }

    var session = {
      sessionId: _generateSessionId(),
      userId: user.id,
      name: user.name,
      role: 'student',
      dept: user.dept,
      email: user.email || null,
      mobile: user.mobile || null,
      lab: labName || 'Web Technology Lab',
      sessionStart: Date.now(),
      loginTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() // 8 hours
    };

    localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getStudentSession() {
    var data = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!data) return null;

    try {
      var session = JSON.parse(data);
      if (new Date(session.expiresAt) < new Date()) {
        destroyStudentSession();
        return null;
      }
      return session;
    } catch (e) {
      destroyStudentSession();
      return null;
    }
  }

  /**
   * Get the current session ID, or null if no active session.
   */
  function getSessionId() {
    var session = getStudentSession();
    return session ? session.sessionId : null;
  }

  function destroyStudentSession() {
    localStorage.removeItem(STUDENT_SESSION_KEY);
  }

  function isStudentLoggedIn() {
    return getStudentSession() !== null;
  }

  // ── Admin Session Management ──
  function createAdminSession(user) {
    var session = {
      userId: user.id,
      name: user.name,
      role: user.role,
      dept: user.dept,
      designation: user.designation || null,
      loginTime: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() // 8 hours
    };

    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getAdminSession() {
    var data = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!data) return null;

    try {
      var session = JSON.parse(data);
      if (new Date(session.expiresAt) < new Date()) {
        destroyAdminSession();
        return null;
      }
      return session;
    } catch (e) {
      destroyAdminSession();
      return null;
    }
  }

  function destroyAdminSession() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
  }

  function isAdminLoggedIn() {
    return getAdminSession() !== null;
  }

  // ── Navigation ──
  function guardStudentPage() {
    var session = getStudentSession();
    if (!session) {
      window.location.href = 'student-login.html';
      return null;
    }
    return session;
  }

  function guardAdminPage() {
    var session = getAdminSession();
    if (!session) {
      window.location.href = 'admin-login.html';
      return null;
    }
    return session;
  }

  // ── Public API ──
  return {
    // Database
    initDatabase: initDatabase,

    // Validation
    validateCredentials: validateCredentials,
    validateStudentCredentials: validateStudentCredentials,
    validateRegistration: validateRegistration,

    // Student Authentication
    registerStudent: registerStudent,
    loginStudent: loginStudent,

    // Admin Authentication (hardcoded credentials)
    loginAdmin: loginAdmin,

    // Student Session
    createStudentSession: createStudentSession,
    getStudentSession: getStudentSession,
    getSessionId: getSessionId,
    destroyStudentSession: destroyStudentSession,
    isStudentLoggedIn: isStudentLoggedIn,

    // Admin Session (separate from student)
    createAdminSession: createAdminSession,
    getAdminSession: getAdminSession,
    destroyAdminSession: destroyAdminSession,
    isAdminLoggedIn: isAdminLoggedIn,

    // Password
    changePassword: changePassword,
    resetPassword: resetPassword,
    findStudent: findStudent,

    // Page Guards
    guardStudentPage: guardStudentPage,
    guardAdminPage: guardAdminPage
  };
})();

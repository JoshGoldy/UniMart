/**
 * Backend tests for app.js — Role, Permission & Utility functions
 * Covers: isSellerAccount, isBuyerAccount, getUserRole, ROLE_PERMISSIONS,
 *         FEATURE_TO_PERMISSION, getAllowedPages, canAccessPage, getRoleLandingPage,
 *         hasFeature, formatStatusLabel, validateEmail, validatePassword,
 *         validateRequired, formatDate, formatDateTime, formatPrice, getImageUrl,
 *         saveToLocalStorage, getFromLocalStorage, removeFromLocalStorage,
 *         debounce, showNotification, iconMarkup, getCurrentPage
 */

import { jest } from '@jest/globals';
import {
  isSellerAccount,
  isBuyerAccount,
  getUserRole,
  ROLE_PERMISSIONS,
  FEATURE_TO_PERMISSION,
  getAllowedPages,
  canAccessPage,
  getRoleLandingPage,
  hasFeature,
  formatStatusLabel,
  validateEmail,
  validatePassword,
  validateRequired,
  formatDate,
  formatDateTime,
  formatPrice,
  getImageUrl,
  saveToLocalStorage,
  getFromLocalStorage,
  removeFromLocalStorage,
  debounce,
  showNotification,
  iconMarkup,
  getCurrentPage,
} from '../../../frontend/scripts/app.js';

// ─── isSellerAccount ──────────────────────────────────────────────────────────

describe('isSellerAccount', () => {
  test('true for seller accountType', () => { expect(isSellerAccount({ accountType: 'seller' })).toBe(true); });
  test('true for seller_buyer accountType', () => { expect(isSellerAccount({ accountType: 'seller_buyer' })).toBe(true); });
  test('false for buyer accountType', () => { expect(isSellerAccount({ accountType: 'buyer' })).toBe(false); });
  test('false for null user', () => { expect(isSellerAccount(null)).toBe(false); });
  test('false for undefined user', () => { expect(isSellerAccount(undefined)).toBe(false); });
});

// ─── isBuyerAccount ───────────────────────────────────────────────────────────

describe('isBuyerAccount', () => {
  test('true for buyer accountType', () => { expect(isBuyerAccount({ accountType: 'buyer' })).toBe(true); });
  test('true for seller_buyer accountType', () => { expect(isBuyerAccount({ accountType: 'seller_buyer' })).toBe(true); });
  test('false for seller-only accountType', () => { expect(isBuyerAccount({ accountType: 'seller' })).toBe(false); });
  test('true when accountType not set (defaults to buyer)', () => { expect(isBuyerAccount({})).toBe(true); });
  test('true for null user (defaults to buyer)', () => { expect(isBuyerAccount(null)).toBe(true); });
});

// ─── getUserRole ──────────────────────────────────────────────────────────────

describe('getUserRole', () => {
  test('returns userRole from user object', () => { expect(getUserRole({ userRole: 'admin' })).toBe('admin'); });
  test('returns student when userRole is undefined', () => { expect(getUserRole({})).toBe('student'); });
  test('returns student for null user', () => { expect(getUserRole(null)).toBe('student'); });
  test('returns staff for staff user', () => { expect(getUserRole({ userRole: 'staff' })).toBe('staff'); });
});

// ─── ROLE_PERMISSIONS ─────────────────────────────────────────────────────────

describe('ROLE_PERMISSIONS structure', () => {
  test('has student, staff, and admin role definitions', () => {
    expect(ROLE_PERMISSIONS.student).toBeDefined();
    expect(ROLE_PERMISSIONS.staff).toBeDefined();
    expect(ROLE_PERMISSIONS.admin).toBeDefined();
  });
  test('student landingPage is search.html', () => { expect(ROLE_PERMISSIONS.student.landingPage).toBe('search.html'); });
  test('staff landingPage is facility.html', () => { expect(ROLE_PERMISSIONS.staff.landingPage).toBe('facility.html'); });
  test('admin landingPage is admin.html', () => { expect(ROLE_PERMISSIONS.admin.landingPage).toBe('admin.html'); });
  test('every role has a features array', () => {
    Object.values(ROLE_PERMISSIONS).forEach(role => {
      expect(Array.isArray(role.features)).toBe(true);
    });
  });
});

// ─── FEATURE_TO_PERMISSION ────────────────────────────────────────────────────

describe('FEATURE_TO_PERMISSION mapping', () => {
  test('marketplace maps to marketplace_browsing', () => { expect(FEATURE_TO_PERMISSION.marketplace).toBe('marketplace_browsing'); });
  test('messages maps to messaging', () => { expect(FEATURE_TO_PERMISSION.messages).toBe('messaging'); });
  test('trade-facility maps to trade_facility_workflow', () => { expect(FEATURE_TO_PERMISSION['trade-facility']).toBe('trade_facility_workflow'); });
  test('admin-config maps to admin_configuration', () => { expect(FEATURE_TO_PERMISSION['admin-config']).toBe('admin_configuration'); });
});

// ─── getAllowedPages ──────────────────────────────────────────────────────────

describe('getAllowedPages', () => {
  test('always includes profile.html and access-denied.html', () => {
    const pages = getAllowedPages({ userRole: 'student', accountType: 'buyer' });
    expect(pages).toContain('profile.html');
    expect(pages).toContain('access-denied.html');
  });
  test('buyer student gets search.html', () => {
    expect(getAllowedPages({ userRole: 'student', accountType: 'buyer' })).toContain('search.html');
  });
  test('seller student gets dashboard.html and listings.html', () => {
    const pages = getAllowedPages({ userRole: 'student', accountType: 'seller' });
    expect(pages).toContain('dashboard.html');
    expect(pages).toContain('listings.html');
  });
  test('seller_buyer student gets both search.html and dashboard.html', () => {
    const pages = getAllowedPages({ userRole: 'student', accountType: 'seller_buyer' });
    expect(pages).toContain('search.html');
    expect(pages).toContain('dashboard.html');
  });
  test('staff user gets facility.html', () => {
    expect(getAllowedPages({ userRole: 'staff', accountType: 'buyer' })).toContain('facility.html');
  });
  test('admin user gets admin.html', () => {
    expect(getAllowedPages({ userRole: 'admin', accountType: 'buyer' })).toContain('admin.html');
  });
  test('student cannot access admin.html', () => {
    expect(getAllowedPages({ userRole: 'student', accountType: 'buyer' })).not.toContain('admin.html');
  });
  test('staff cannot access admin.html', () => {
    expect(getAllowedPages({ userRole: 'staff', accountType: 'buyer' })).not.toContain('admin.html');
  });
});

// ─── canAccessPage ────────────────────────────────────────────────────────────

describe('canAccessPage', () => {
  test('true when page is in user allowed list', () => {
    expect(canAccessPage({ userRole: 'student', accountType: 'buyer' }, 'search.html')).toBe(true);
  });
  test('false when page is not in user allowed list', () => {
    expect(canAccessPage({ userRole: 'student', accountType: 'buyer' }, 'admin.html')).toBe(false);
  });
  test('admin can access admin.html', () => {
    expect(canAccessPage({ userRole: 'admin', accountType: 'buyer' }, 'admin.html')).toBe(true);
  });
  test('staff cannot access admin.html', () => {
    expect(canAccessPage({ userRole: 'staff', accountType: 'buyer' }, 'admin.html')).toBe(false);
  });
  test('everyone can access profile.html', () => {
    ['student', 'staff', 'admin'].forEach(role => {
      expect(canAccessPage({ userRole: role, accountType: 'buyer' }, 'profile.html')).toBe(true);
    });
  });
});

// ─── getRoleLandingPage ───────────────────────────────────────────────────────

describe('getRoleLandingPage', () => {
  test('buyer student lands on search.html', () => {
    expect(getRoleLandingPage({ userRole: 'student', accountType: 'buyer' })).toBe('search.html');
  });
  test('seller student lands on dashboard.html', () => {
    expect(getRoleLandingPage({ userRole: 'student', accountType: 'seller' })).toBe('dashboard.html');
  });
  test('staff lands on facility.html', () => {
    expect(getRoleLandingPage({ userRole: 'staff', accountType: 'buyer' })).toBe('facility.html');
  });
  test('admin lands on admin.html', () => {
    expect(getRoleLandingPage({ userRole: 'admin', accountType: 'buyer' })).toBe('admin.html');
  });
});

// ─── hasFeature ───────────────────────────────────────────────────────────────

describe('hasFeature', () => {
  test('student has marketplace feature', () => { expect(hasFeature({ userRole: 'student', accountType: 'buyer' }, 'marketplace')).toBe(true); });
  test('student has messages feature', () => { expect(hasFeature({ userRole: 'student', accountType: 'buyer' }, 'messages')).toBe(true); });
  test('student does not have trade-facility feature', () => { expect(hasFeature({ userRole: 'student', accountType: 'buyer' }, 'trade-facility')).toBe(false); });
  test('staff has trade-facility feature', () => { expect(hasFeature({ userRole: 'staff', accountType: 'buyer' }, 'trade-facility')).toBe(true); });
  test('seller student has listing-management feature', () => { expect(hasFeature({ userRole: 'student', accountType: 'seller' }, 'listing-management')).toBe(true); });
  test('buyer student does not have listing-management feature', () => { expect(hasFeature({ userRole: 'student', accountType: 'buyer' }, 'listing-management')).toBe(false); });
  test('admin has admin-config feature', () => { expect(hasFeature({ userRole: 'admin', accountType: 'buyer' }, 'admin-config')).toBe(true); });
});

// ─── formatStatusLabel ────────────────────────────────────────────────────────

describe('formatStatusLabel', () => {
  test('active → Active', () => { expect(formatStatusLabel('active')).toBe('Active'); });
  test('sold → Sold', () => { expect(formatStatusLabel('sold')).toBe('Sold'); });
  test('reserved → Reserved', () => { expect(formatStatusLabel('reserved')).toBe('Reserved'); });
  test('pending_approval → Pending Approval', () => { expect(formatStatusLabel('pending_approval')).toBe('Pending Approval'); });
  test('rejected → Rejected', () => { expect(formatStatusLabel('rejected')).toBe('Rejected'); });
  test('draft → Draft', () => { expect(formatStatusLabel('draft')).toBe('Draft'); });
  test('unknown value returned as-is', () => { expect(formatStatusLabel('unknown_status')).toBe('unknown_status'); });
});

// ─── validateEmail ────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  test('accepts standard email addresses', () => {
    expect(validateEmail('user@domain.com')).toBe(true);
    expect(validateEmail('student@university.ac.za')).toBe(true);
  });
  test('rejects email without @', () => { expect(validateEmail('nodomain')).toBe(false); });
  test('rejects email without domain part', () => { expect(validateEmail('user@')).toBe(false); });
  test('rejects empty string', () => { expect(validateEmail('')).toBe(false); });
});

// ─── validatePassword ─────────────────────────────────────────────────────────

describe('validatePassword', () => {
  test('accepts passwords 8+ characters long', () => { expect(validatePassword('12345678')).toBe(true); });
  test('accepts long passwords', () => { expect(validatePassword('averylongpassword')).toBe(true); });
  test('rejects passwords under 8 characters', () => { expect(validatePassword('1234567')).toBe(false); });
  test('rejects empty string (returns falsy)', () => { expect(validatePassword('')).toBeFalsy(); });
  test('rejects null (returns falsy)', () => { expect(validatePassword(null)).toBeFalsy(); });
});

// ─── validateRequired ─────────────────────────────────────────────────────────

describe('validateRequired', () => {
  test('accepts non-empty string', () => { expect(validateRequired('hello')).toBe(true); });
  test('accepts string with leading/trailing spaces', () => { expect(validateRequired('  hi  ')).toBe(true); });
  test('rejects empty string (returns falsy)', () => { expect(validateRequired('')).toBeFalsy(); });
  test('rejects whitespace-only string (trim().length === 0)', () => { expect(validateRequired('   ')).toBeFalsy(); });
  test('rejects null (returns falsy)', () => { expect(validateRequired(null)).toBeFalsy(); });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  test('returns empty string for null', () => { expect(formatDate(null)).toBe(''); });
  test('returns empty string for empty string', () => { expect(formatDate('')).toBe(''); });
  test('returns a non-empty string for valid ISO date', () => {
    expect(formatDate('2025-06-15T12:00:00Z').length).toBeGreaterThan(0);
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  test('returns empty string for null', () => { expect(formatDateTime(null)).toBe(''); });
  test('returns a non-empty string for valid ISO datetime', () => {
    expect(formatDateTime('2025-06-15T14:30:00Z').length).toBeGreaterThan(0);
  });
});

// ─── formatPrice ──────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  test('formats integer price with R prefix and 2dp', () => { expect(formatPrice(100)).toBe('R100.00'); });
  test('formats decimal price correctly', () => { expect(formatPrice(9.99)).toBe('R9.99'); });
  test('formats zero as R0.00', () => { expect(formatPrice(0)).toBe('R0.00'); });
  test('returns R0.00 for null', () => { expect(formatPrice(null)).toBe('R0.00'); });
  test('returns R0.00 for string input', () => { expect(formatPrice('100')).toBe('R0.00'); });
  test('returns R0.00 for undefined', () => { expect(formatPrice(undefined)).toBe('R0.00'); });
});

// ─── getImageUrl ──────────────────────────────────────────────────────────────

describe('getImageUrl', () => {
  test('returns placeholder path for null', () => { expect(getImageUrl(null)).toContain('placeholder'); });
  test('returns placeholder path for empty string', () => { expect(getImageUrl('')).toContain('placeholder'); });
  test('returns absolute URL unchanged', () => { expect(getImageUrl('https://cdn.example.com/img.jpg')).toBe('https://cdn.example.com/img.jpg'); });
  test('prepends /frontend/assets/ for relative path', () => { expect(getImageUrl('photo.jpg')).toBe('/frontend/assets/photo.jpg'); });
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

describe('saveToLocalStorage', () => {
  test('returns true on successful save', () => {
    expect(saveToLocalStorage('testKey', { name: 'Alice' })).toBe(true);
  });
  test('saved value is retrievable via raw localStorage', () => {
    saveToLocalStorage('user', { id: '1' });
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: '1' });
  });
});

describe('getFromLocalStorage', () => {
  test('returns stored object value', () => {
    saveToLocalStorage('prefs', { theme: 'dark' });
    expect(getFromLocalStorage('prefs')).toEqual({ theme: 'dark' });
  });
  test('returns provided default when key does not exist', () => {
    expect(getFromLocalStorage('nonexistent', 'fallback')).toBe('fallback');
  });
  test('returns null by default for missing key', () => {
    expect(getFromLocalStorage('nonexistent')).toBeNull();
  });
});

describe('removeFromLocalStorage', () => {
  test('returns true and removes the key', () => {
    saveToLocalStorage('toRemove', 'value');
    expect(removeFromLocalStorage('toRemove')).toBe(true);
    expect(getFromLocalStorage('toRemove')).toBeNull();
  });
});

// ─── debounce ─────────────────────────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('does not call function before delay expires', () => {
    const fn = jest.fn();
    debounce(fn, 300)('arg1');
    expect(fn).not.toHaveBeenCalled();
  });

  test('calls function once after delay', () => {
    const fn = jest.fn();
    debounce(fn, 300)('arg1');
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  test('only fires once for multiple rapid calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced(); debounced(); debounced();
    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('resets the timer on each call', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 300);
    debounced();
    jest.advanceTimersByTime(200);
    debounced();
    jest.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── showNotification ─────────────────────────────────────────────────────────

describe('showNotification', () => {
  test('creates a notification container in the DOM', () => {
    showNotification('Test', 'info');
    expect(document.getElementById('notification-container')).toBeTruthy();
  });

  test('notification element contains the message text', () => {
    showNotification('Hello World', 'success');
    expect(document.getElementById('notification-container').textContent).toContain('Hello World');
  });

  test('notification has the correct type CSS class', () => {
    showNotification('Error!', 'error');
    expect(document.querySelector('.notification-error')).toBeTruthy();
  });

  test('multiple calls reuse the same container element', () => {
    showNotification('First', 'info');
    showNotification('Second', 'info');
    expect(document.querySelectorAll('#notification-container').length).toBe(1);
  });
});

// ─── iconMarkup ───────────────────────────────────────────────────────────────

describe('iconMarkup', () => {
  test('returns SVG markup for success type', () => { expect(iconMarkup('success')).toContain('svg'); });
  test('returns SVG markup for error type', () => { expect(iconMarkup('error')).toContain('svg'); });
  test('returns info SVG for unknown type', () => { expect(iconMarkup('unknown')).toContain('svg'); });
  test('wraps in ui-icon span', () => { expect(iconMarkup('info')).toContain('ui-icon'); });
});

// ─── getCurrentPage ───────────────────────────────────────────────────────────

describe('getCurrentPage', () => {
  // jsdom locks window.location entirely — cannot reassign or spy on it.
  // Test the function contract: it always returns a non-empty string.
  test('returns a non-empty string', () => {
    const page = getCurrentPage();
    expect(typeof page).toBe('string');
    expect(page.length).toBeGreaterThan(0);
  });

  test('return value does not contain path separators', () => {
    const page = getCurrentPage();
    expect(page).not.toContain('/');
  });

  test('return value ends with .html or is a known fallback', () => {
    const page = getCurrentPage();
    expect(page.endsWith('.html') || page === 'search.html').toBe(true);
  });
});

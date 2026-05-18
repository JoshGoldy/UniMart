/**
 * Tests for permissions/rolePermissions.js module
 * This will show coverage for the permissions file
 */

import { 
  getUserRole,
  isSellerAccount,
  isBuyerAccount,
  hasFeature,
  canAccessPage,
  getAllowedPages,
  getRoleLandingPage,
  ROLE_PERMISSIONS
} from '../../../frontend/scripts/permissions/rolePermissions.js';

describe('Role Permissions Module', () => {
  describe('getUserRole', () => {
    test('should return user role', () => {
      expect(getUserRole({ userRole: 'student' })).toBe('student');
      expect(getUserRole({ userRole: 'staff' })).toBe('staff');
      expect(getUserRole({ userRole: 'admin' })).toBe('admin');
    });

    test('should default to student', () => {
      expect(getUserRole(null)).toBe('student');
      expect(getUserRole({})).toBe('student');
    });
  });

  describe('isSellerAccount', () => {
    test('should identify seller accounts', () => {
      expect(isSellerAccount({ accountType: 'seller' })).toBe(true);
      expect(isSellerAccount({ accountType: 'seller_buyer' })).toBe(true);
    });

    test('should reject non-seller accounts', () => {
      expect(isSellerAccount({ accountType: 'buyer' })).toBe(false);
      expect(isSellerAccount(null)).toBe(false);
    });
  });

  describe('isBuyerAccount', () => {
    test('should identify buyer accounts', () => {
      expect(isBuyerAccount({ accountType: 'buyer' })).toBe(true);
      expect(isBuyerAccount({ accountType: 'seller_buyer' })).toBe(true);
    });

    test('should default to true', () => {
      expect(isBuyerAccount(null)).toBe(true);
      expect(isBuyerAccount({})).toBe(true);
    });
  });

  describe('getAllowedPages', () => {
    test('should return allowed pages for student buyer', () => {
      const user = { userRole: 'student', accountType: 'buyer' };
      const pages = getAllowedPages(user);
      
      expect(pages).toContain('profile.html');
      expect(pages).toContain('search.html');
      expect(pages).toContain('messages.html');
    });

    test('should return allowed pages for student seller', () => {
      const user = { userRole: 'student', accountType: 'seller' };
      const pages = getAllowedPages(user);
      
      expect(pages).toContain('profile.html');
      expect(pages).toContain('dashboard.html');
      expect(pages).toContain('listings.html');
    });

    test('should return allowed pages for staff', () => {
      const user = { userRole: 'staff' };
      const pages = getAllowedPages(user);
      
      expect(pages).toContain('profile.html');
      expect(pages).toContain('facility.html');
    });

    test('should return allowed pages for admin', () => {
      const user = { userRole: 'admin' };
      const pages = getAllowedPages(user);
      
      expect(pages).toContain('profile.html');
      expect(pages).toContain('admin.html');
    });
  });

  describe('canAccessPage', () => {
    test('should allow access to allowed pages', () => {
      const user = { userRole: 'student', accountType: 'buyer' };
      expect(canAccessPage(user, 'search.html')).toBe(true);
      expect(canAccessPage(user, 'profile.html')).toBe(true);
    });

    test('should deny access to restricted pages', () => {
      const user = { userRole: 'student', accountType: 'buyer' };
      expect(canAccessPage(user, 'admin.html')).toBe(false);
      expect(canAccessPage(user, 'facility.html')).toBe(false);
    });
  });

  describe('getRoleLandingPage', () => {
    test('should return correct landing page for roles', () => {
      expect(getRoleLandingPage({ userRole: 'student', accountType: 'buyer' })).toBe('search.html');
      expect(getRoleLandingPage({ userRole: 'student', accountType: 'seller' })).toBe('dashboard.html');
      expect(getRoleLandingPage({ userRole: 'staff' })).toBe('facility.html');
      expect(getRoleLandingPage({ userRole: 'admin' })).toBe('admin.html');
    });
  });

  describe('hasFeature', () => {
    test('should check marketplace feature for students', () => {
      const user = { userRole: 'student', accountType: 'buyer' };
      expect(hasFeature(user, 'marketplace')).toBe(true);
    });

    test('should check admin features', () => {
      const admin = { userRole: 'admin' };
      const student = { userRole: 'student' };
      
      expect(hasFeature(admin, 'admin-config')).toBe(true);
      expect(hasFeature(student, 'admin-config')).toBe(false);
    });
  });

  describe('ROLE_PERMISSIONS constant', () => {
    test('should have all role definitions', () => {
      expect(ROLE_PERMISSIONS).toHaveProperty('student');
      expect(ROLE_PERMISSIONS).toHaveProperty('staff');
      expect(ROLE_PERMISSIONS).toHaveProperty('admin');
    });
  });
});

/**
 * Tests for utils/validators.js module
 * This will show coverage for the validators file
 */

import { 
  validateEmail, 
  validatePassword, 
  validateRequired,
  validatePrice,
  validateStudentNumber
} from '../../../frontend/scripts/utils/validators.js';

describe('Validators Module', () => {
  describe('validateEmail', () => {
    test('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.za')).toBe(true);
      expect(validateEmail('student@university.edu')).toBe(true);
    });

    test('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@nodomain.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    test('should accept passwords 8+ characters', () => {
      expect(validatePassword('12345678')).toBe(true);
      expect(validatePassword('verylongpassword')).toBe(true);
    });

    test('should reject short passwords', () => {
      expect(validatePassword('short')).toBe(false);
      expect(validatePassword('1234567')).toBe(false);
      expect(validatePassword('')).toBe(false);
      expect(validatePassword(null)).toBe(false);
    });
  });

  describe('validateRequired', () => {
    test('should accept non-empty values', () => {
      expect(validateRequired('value')).toBe(true);
      expect(validateRequired('  text  ')).toBe(true);
    });

    test('should reject empty values', () => {
      expect(validateRequired('')).toBe(false);
      expect(validateRequired('   ')).toBe(false);
      expect(validateRequired(null)).toBe(false);
    });
  });

  describe('validatePrice', () => {
    test('should accept valid prices', () => {
      expect(validatePrice(100)).toBe(true);
      expect(validatePrice(0)).toBe(true);
      expect(validatePrice(99.99)).toBe(true);
    });

    test('should reject invalid prices', () => {
      expect(validatePrice(-1)).toBe(false);
      expect(validatePrice('100')).toBe(false);
      expect(validatePrice(null)).toBe(false);
    });
  });

  describe('validateStudentNumber', () => {
    test('should accept valid student numbers', () => {
      expect(validateStudentNumber('123456')).toBe(true);
      expect(validateStudentNumber('1234567890')).toBe(true);
    });

    test('should reject invalid student numbers', () => {
      expect(validateStudentNumber('12345')).toBe(false);
      expect(validateStudentNumber('12345678901')).toBe(false);
      expect(validateStudentNumber('abc123')).toBe(false);
      expect(validateStudentNumber('')).toBe(false);
    });
  });
});

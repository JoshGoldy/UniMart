/**
 * Tests for utils/formatters.js module
 * This will show coverage for the formatters file
 */

import { 
  formatDate, 
  formatDateTime, 
  formatPrice, 
  formatStatusLabel,
  escapeHtml
} from '../../../frontend/scripts/utils/formatters.js';

describe('Formatters Module', () => {
  describe('formatPrice', () => {
    test('should format prices correctly', () => {
      expect(formatPrice(100)).toBe('R100.00');
      expect(formatPrice(99.99)).toBe('R99.99');
      expect(formatPrice(0)).toBe('R0.00');
      expect(formatPrice(1234.567)).toBe('R1234.57');
    });

    test('should handle invalid input', () => {
      expect(formatPrice('invalid')).toBe('R0.00');
      expect(formatPrice(null)).toBe('R0.00');
      expect(formatPrice(undefined)).toBe('R0.00');
    });
  });

  describe('formatDate', () => {
    test('should format dates', () => {
      const result = formatDate('2026-05-10');
      expect(result).toContain('May');
      expect(result).toContain('10');
      expect(result).toContain('2026');
    });

    test('should handle empty input', () => {
      expect(formatDate('')).toBe('');
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatDateTime', () => {
    test('should format date and time', () => {
      const result = formatDateTime('2026-05-10T14:30:00');
      expect(result).toContain('May');
      expect(result).toContain('10');
      expect(result).toContain('2026');
    });

    test('should handle empty input', () => {
      expect(formatDateTime('')).toBe('');
      expect(formatDateTime(null)).toBe('');
    });
  });

  describe('formatStatusLabel', () => {
    test('should format status labels', () => {
      expect(formatStatusLabel('active')).toBe('Active');
      expect(formatStatusLabel('pending_approval')).toBe('Pending Approval');
      expect(formatStatusLabel('in_progress')).toBe('In Progress');
    });

    test('should handle empty input', () => {
      expect(formatStatusLabel('')).toBe('');
      expect(formatStatusLabel(null)).toBe('');
    });
  });

  describe('escapeHtml', () => {
    test('should escape HTML characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toContain('&lt;');
      expect(escapeHtml('Test & Demo')).toContain('&amp;');
      expect(escapeHtml('"quotes"')).toContain('&quot;');
      expect(escapeHtml("'apostrophe'")).toContain('&#39;');
    });

    test('should handle empty input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
    });
  });
});

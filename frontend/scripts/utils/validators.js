/**
 * Validation utilities
 * Used by: auth.js, forms across the app
 */

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password) {
  return password && password.length >= 8;
}

export function validateRequired(value) {
  return value && value.trim().length > 0;
}

export function validatePrice(price) {
  return typeof price === 'number' && price >= 0;
}

export function validateStudentNumber(number) {
  if (!number) return false;  // ← Fixed: handle empty/null/undefined
  return /^\d{6,10}$/.test(number);
}

export default {
  validateEmail,
  validatePassword,
  validateRequired,
  validatePrice,
  validateStudentNumber
};

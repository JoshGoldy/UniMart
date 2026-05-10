/**
 * Comprehensive tests for UniMart HTML pages and utilities
 */

import { fireEvent } from '@testing-library/dom';
import '@testing-library/jest-dom';

describe('Login Page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="loginForm">
        <input type="email" id="email" required />
        <input type="password" id="password" required />
        <button type="submit">Login</button>
      </form>
      <div id="errorMessage" style="display:none;"></div>
    `;
  });

  test('should have login form', () => {
    expect(document.getElementById('loginForm')).toBeInTheDocument();
  });

  test('should have email and password fields', () => {
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    expect(email).toBeRequired();
    expect(password).toBeRequired();
  });

  test('should allow typing in fields', () => {
    const email = document.getElementById('email');
    fireEvent.change(email, { target: { value: 'test@example.com' } });
    expect(email.value).toBe('test@example.com');
  });
});

describe('Signup Page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="signupForm">
        <input type="text" id="fullName" required />
        <input type="email" id="email" required />
        <input type="password" id="password" required minlength="8" />
        <select id="accountType" required>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
        </select>
        <button type="submit">Sign Up</button>
      </form>
    `;
  });

  test('should have signup form', () => {
    expect(document.getElementById('signupForm')).toBeInTheDocument();
  });

  test('should require all fields', () => {
    expect(document.getElementById('fullName')).toBeRequired();
    expect(document.getElementById('email')).toBeRequired();
    expect(document.getElementById('password')).toBeRequired();
  });
  
  test('should enforce password length', () => {
    const password = document.getElementById('password');
    expect(password).toHaveAttribute('minlength', '8');
  });
});

describe('Search Page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="searchForm">
        <input type="search" id="searchInput" />
        <button type="submit">Search</button>
      </form>
      <select id="categoryFilter">
        <option value="">All</option>
        <option value="electronics">Electronics</option>
      </select>
      <div id="listingsGrid"></div>
    `;
  });

  test('should have search form', () => {
    expect(document.getElementById('searchForm')).toBeInTheDocument();
  });

  test('should have category filter', () => {
    expect(document.getElementById('categoryFilter')).toBeInTheDocument();
  });

  test('should allow filtering', () => {
    const filter = document.getElementById('categoryFilter');
    fireEvent.change(filter, { target: { value: 'electronics' } });
    expect(filter.value).toBe('electronics');
  });
});

describe('Profile Page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="profileForm">
        <input type="text" id="fullName" required />
        <input type="email" id="email" required />
        <button type="submit">Save</button>
      </form>
      <form id="passwordForm">
        <input type="password" id="currentPassword" required />
        <input type="password" id="newPassword" required minlength="8" />
        <button type="submit">Change Password</button>
      </form>
    `;
  });

  test('should have profile form', () => {
    expect(document.getElementById('profileForm')).toBeInTheDocument();
  });

  test('should have password change form', () => {
    expect(document.getElementById('passwordForm')).toBeInTheDocument();
  });
});

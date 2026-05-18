/**
 * Jest test setup
 * Configures the testing environment for DOM testing
 */

import '@testing-library/jest-dom';

// Mock Supabase
global.supabase = {
  createClient: () => ({
    auth: {
      signUp: () => Promise.resolve({ data: null, error: null }),
      signInWithPassword: () => Promise.resolve({ data: null, error: null }),
      signInWithOAuth: () => Promise.resolve({ error: null }),
      signOut: () => Promise.resolve({ error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      updateUser: () => Promise.resolve({ error: null }),
      verifyOtp: () => Promise.resolve({ error: null }),
      resetPasswordForEmail: () => Promise.resolve({ error: null })
    },
    from: () => ({
      select: function() { return this; },
      insert: function() { return this; },
      update: function() { return this; },
      delete: function() { return this; },
      eq: function() { return this; },
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ error: null })
    })
  })
};

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true
});

// Suppress jsdom "Not implemented: navigation" console errors.
// jsdom cannot actually navigate; this just silences the noisy error output.
// The navigation itself is a no-op in jsdom — tests still pass correctly.
const originalConsoleError = console.error;
console.error = (...args) => {
  const msg = args[0] && args[0].toString ? args[0].toString() : '';
  if (msg.includes('Not implemented: navigation')) return;
  originalConsoleError(...args);
};

// Clean up after each test
afterEach(() => {
  document.body.innerHTML = '';
  localStorageMock.clear();
  sessionStorageMock.clear();
});

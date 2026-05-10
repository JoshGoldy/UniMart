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

// Mock window.location
delete window.location;
window.location = {
  href: '',
  origin: 'http://localhost',
  pathname: '/frontend/pages/search.html',
  search: '',
  hash: '',
  replace: () => {},
  assign: () => {},
  reload: () => {}
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
  value: localStorageMock
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
  value: sessionStorageMock
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: () => {},
  warn: () => {},
  log: () => {}
};

// Clean up after each test
afterEach(() => {
  document.body.innerHTML = '';
  localStorageMock.clear();
  sessionStorageMock.clear();
});

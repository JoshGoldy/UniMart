/**
 * @jest-environment jsdom
 *
 * Tests for App module (app.js) — runs in jsdom so DOM APIs work.
 */

// app.js references Auth.getUserInitials and Auth.requireAuth — mock them
global.Auth = {
  getUserInitials: jest.fn(() => 'JG'),
  requireAuth: jest.fn().mockResolvedValue({
    fullName: 'Joshua Goldberg',
    accountType: 'buyer',
  }),
  signOut: jest.fn(),
};

const {
  iconMarkup,
  showToast,
  populateUserShell,
  initDropdowns,
  setActiveNav,
  initMobileSidebar,
  initPage,
} = require('../app.js');

// ═══════════════════════════════════════════════════════════════════════════
// iconMarkup
// ═══════════════════════════════════════════════════════════════════════════

describe('iconMarkup', () => {
  test('returns a span wrapper', () => {
    expect(iconMarkup('success')).toContain('<span class="ui-icon">');
    expect(iconMarkup('success')).toContain('</span>');
  });
  test('returns success SVG', () => {
    expect(iconMarkup('success')).toContain('m4.5 10 3.5 3.5 7-7');
  });
  test('returns error SVG', () => {
    expect(iconMarkup('error')).toContain('M6 6l8 8');
  });
  test('returns info SVG', () => {
    expect(iconMarkup('info')).toContain('circle cx');
  });
  test('falls back to info for unknown name', () => {
    expect(iconMarkup('banana')).toBe(iconMarkup('info'));
  });
  test('falls back to info for empty string', () => {
    expect(iconMarkup('')).toBe(iconMarkup('info'));
  });
  test('falls back to info for null', () => {
    expect(iconMarkup(null)).toBe(iconMarkup('info'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// showToast
// ═══════════════════════════════════════════════════════════════════════════

describe('showToast', () => {
  beforeEach(() => {
    // Clean up any existing toast container
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();
  });

  test('creates toast-container if it does not exist', () => {
    showToast('Hello!', 'success', 100);
    expect(document.getElementById('toast-container')).not.toBeNull();
  });

  test('appends a toast with the correct class', () => {
    showToast('Test message', 'error', 100);
    const container = document.getElementById('toast-container');
    const toast = container.querySelector('.toast.error');
    expect(toast).not.toBeNull();
  });

  test('toast contains the message text', () => {
    showToast('Hello world', 'info', 100);
    const container = document.getElementById('toast-container');
    expect(container.innerHTML).toContain('Hello world');
  });

  test('reuses existing toast-container', () => {
    showToast('First', 'success', 100);
    showToast('Second', 'success', 100);
    const containers = document.querySelectorAll('#toast-container');
    expect(containers.length).toBe(1);
  });

  test('default type is "default"', () => {
    showToast('Default toast');
    const container = document.getElementById('toast-container');
    expect(container.querySelector('.toast.default')).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// populateUserShell
// ═══════════════════════════════════════════════════════════════════════════

describe('populateUserShell', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span data-user-name></span>
      <span data-user-role></span>
      <span data-user-initials></span>
    `;
  });

  test('sets user name in [data-user-name] elements', () => {
    populateUserShell({ fullName: 'Joshua Goldberg', accountType: 'buyer' });
    expect(document.querySelector('[data-user-name]').textContent).toBe('Joshua Goldberg');
  });

  test('sets role label "Buyer" for buyer account', () => {
    populateUserShell({ fullName: 'Joshua Goldberg', accountType: 'buyer' });
    expect(document.querySelector('[data-user-role]').textContent).toBe('Buyer');
  });

  test('sets role label "Seller / Buyer" for seller_buyer account', () => {
    populateUserShell({ fullName: 'Jane Doe', accountType: 'seller_buyer' });
    expect(document.querySelector('[data-user-role]').textContent).toBe('Seller / Buyer');
  });

  test('sets initials via Auth.getUserInitials', () => {
    global.Auth.getUserInitials.mockReturnValue('JG');
    populateUserShell({ fullName: 'Joshua Goldberg', accountType: 'buyer' });
    expect(document.querySelector('[data-user-initials]').textContent).toBe('JG');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// initDropdowns
// ═══════════════════════════════════════════════════════════════════════════

describe('initDropdowns', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-dropdown-trigger="myMenu">Toggle</button>
      <div id="myMenu" class="dropdown-menu"></div>
    `;
  });

  test('toggles "open" class on menu when trigger is clicked', () => {
    initDropdowns();
    const trigger = document.querySelector('[data-dropdown-trigger]');
    const menu    = document.getElementById('myMenu');
    trigger.click();
    expect(menu.classList.contains('open')).toBe(true);
  });

  test('removes "open" class when document is clicked', () => {
    initDropdowns();
    const trigger = document.querySelector('[data-dropdown-trigger]');
    const menu    = document.getElementById('myMenu');
    trigger.click();
    document.dispatchEvent(new Event('click'));
    expect(menu.classList.contains('open')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// setActiveNav
// ═══════════════════════════════════════════════════════════════════════════

describe('setActiveNav', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <a class="nav-item" data-page="search.html">Search</a>
      <a class="nav-item" data-page="listings.html">Listings</a>
    `;
  });

  test('adds "active" class to the matching nav item', () => {
    delete window.location;
    window.location = { pathname: '/search.html' };
    setActiveNav();
    expect(document.querySelector('[data-page="search.html"]').classList.contains('active')).toBe(true);
  });

  test('does not add "active" to non-matching nav items', () => {
    delete window.location;
    window.location = { pathname: '/search.html' };
    setActiveNav();
    expect(document.querySelector('[data-page="listings.html"]').classList.contains('active')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// initMobileSidebar
// ═══════════════════════════════════════════════════════════════════════════

describe('initMobileSidebar', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="sidebar-toggle">☰</button>
      <div id="sidebar"></div>
      <div id="sidebar-overlay"></div>
    `;
  });

  test('toggles "open" on sidebar when toggle button is clicked', () => {
    initMobileSidebar();
    document.getElementById('sidebar-toggle').click();
    expect(document.getElementById('sidebar').classList.contains('open')).toBe(true);
  });

  test('closes sidebar when overlay is clicked', () => {
    initMobileSidebar();
    document.getElementById('sidebar-toggle').click();
    document.getElementById('sidebar-overlay').click();
    expect(document.getElementById('sidebar').classList.contains('open')).toBe(false);
  });

  test('does nothing when toggle element is missing', () => {
    document.body.innerHTML = '<div id="sidebar"></div>';
    expect(() => initMobileSidebar()).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// initPage
// ═══════════════════════════════════════════════════════════════════════════

describe('initPage', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span data-user-name></span>
      <span data-user-role></span>
      <span data-user-initials></span>
      <button data-action="signout">Sign out</button>
    `;
    global.Auth.requireAuth = jest.fn().mockResolvedValue({
      fullName: 'Joshua Goldberg',
      accountType: 'buyer',
    });
  });

  test('returns the user object', async () => {
    const user = await initPage();
    expect(user.fullName).toBe('Joshua Goldberg');
  });

  test('returns undefined when requireAuth returns null', async () => {
    global.Auth.requireAuth = jest.fn().mockResolvedValue(null);
    const result = await initPage();
    expect(result).toBeUndefined();
  });

  test('attaches signout handler to [data-action="signout"] buttons', async () => {
    await initPage();
    const btn = document.querySelector('[data-action="signout"]');
    btn.click();
    expect(global.Auth.signOut).toHaveBeenCalled();
  });
});

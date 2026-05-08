/**
 * UniMart App utilities
 * Shared helpers used across authenticated pages.
 */

function iconMarkup(name) {
  const icons = {
    success: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="m4.5 10 3.5 3.5 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><path d="M10 9.25v4M10 6.75h.01" stroke-linecap="round"/></svg>'
  };

  return `<span class="ui-icon">${icons[name] || icons.info}</span>`;
}

function isSellerAccount(user) {
  return user?.accountType === 'seller_buyer';
}

function getUserRole(user) {
  return user?.userRole || 'student';
}

const ROLE_PERMISSIONS = {
  student: {
    landingPage: 'search.html',
    pages: ['search.html', 'profile.html', 'messages.html', 'access-denied.html'],
    features: ['marketplace', 'messages', 'offers'],
  },
  staff: {
    landingPage: 'facility.html',
    pages: ['facility.html', 'profile.html', 'access-denied.html'],
    features: ['trade-facility'],
  },
  admin: {
    landingPage: 'admin.html',
    pages: ['admin.html', 'profile.html', 'access-denied.html'],
    features: ['admin-config'],
  },
};

function getCurrentPage() {
  return window.location.pathname.split('/').pop() || 'search.html';
}

function getAllowedPages(user) {
  const role = getUserRole(user);
  const config = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student;
  const pages = [...config.pages];
  if (role === 'student' && isSellerAccount(user)) pages.push('dashboard.html', 'listings.html');
  return pages;
}

function canAccessPage(user, page = getCurrentPage()) {
  return getAllowedPages(user).includes(page);
}

function getRoleLandingPage(user) {
  const role = getUserRole(user);
  return (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student).landingPage;
}

function hasFeature(user, feature) {
  const role = getUserRole(user);
  return Boolean((ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student).features.includes(feature));
}

function navIcon(name) {
  const icons = {
    search: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8.5" cy="8.5" r="5.25"/><path d="m13.75 13.75 3 3" stroke-linecap="round"/></svg>',
    dashboard: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="6" height="6" rx="1.5"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.5"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.5"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.5"/></svg>',
    listings: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h12M4 10h8M4 14h5" stroke-linecap="round"/></svg>',
    messages: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5h12v8H8l-4 3v-11Z" stroke-linejoin="round"/><path d="M7 8.5h6M7 11h4" stroke-linecap="round"/></svg>',
    facility: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 8.5 10 3l6.5 5.5"/><path d="M5 8v8h10V8"/><path d="M8 16v-5h4v5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    admin: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 2.5 16 5v4.5c0 3.55-2.42 6.78-6 7.9-3.58-1.12-6-4.35-6-7.9V5l6-2.5Z"/><path d="M7.5 10.2 9.2 12l3.3-4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    profile: '<svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="7" r="3.5"/><path d="M3.5 16c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" stroke-linecap="round"/></svg>',
  };
  return icons[name] || icons.search;
}

function renderNavItem(item) {
  return `
      <a href="${item.href}" class="nav-item" data-page="${item.href}">
        ${navIcon(item.icon)}
        ${item.label}
        ${item.badgeId ? `<span class="nav-badge" id="${item.badgeId}" style="display:none">0</span>` : ''}
      </a>`;
}

function buildDynamicNavigation(user) {
  const role = getUserRole(user);
  let mainItems = [];
  let manageItems = [{ href: 'profile.html', label: 'My Profile', icon: 'profile' }];

  if (role === 'staff') {
    mainItems = [{ href: 'facility.html', label: 'Trade Facility', icon: 'facility' }];
  } else if (role === 'admin') {
    mainItems = [{ href: 'admin.html', label: 'Admin Config', icon: 'admin' }];
  } else {
    mainItems = [{ href: 'search.html', label: 'Search Listings', icon: 'search' }];
    manageItems.unshift({ href: 'messages.html', label: isSellerAccount(user) ? 'Seller Messages' : 'Messages', icon: 'messages', badgeId: 'nav-message-count' });
  }

  if (role === 'student' && isSellerAccount(user)) {
    mainItems.push({ href: 'dashboard.html', label: 'Seller Dashboard', icon: 'dashboard' });
    manageItems.unshift({ href: 'listings.html', label: 'Listing Management', icon: 'listings' });
  }

  document.querySelectorAll('.sidebar-nav').forEach(nav => {
    nav.innerHTML = `
      <div class="sidebar-section-label">Main</div>
      ${mainItems.map(renderNavItem).join('')}
      <div class="sidebar-section-label">Manage</div>
      ${manageItems.map(renderNavItem).join('')}
    `;
  });
}

function setUnreadMessageBadge(count) {
  document.querySelectorAll('#nav-message-count').forEach(badge => {
    const safeCount = Number(count) || 0;
    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.style.display = safeCount > 0 ? 'inline-flex' : 'none';
  });
}

async function refreshUnreadMessageCount(user) {
  if (!Auth.getUnreadMessageCount || !user?.id) return;
  const result = await Auth.getUnreadMessageCount(user.id);
  if (!result.error) setUnreadMessageBadge(result.count);
}

/* ---- Toast notifications ---- */
function showToast(message, type = 'default', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${iconMarkup(type)}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'all .25s ease';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

/* ---- Populate user info across the shell ---- */
function populateUserShell(user) {
  const nameEls = document.querySelectorAll('[data-user-name]');
  const roleEls = document.querySelectorAll('[data-user-role]');
  const initEls = document.querySelectorAll('[data-user-initials]');
  const initials = Auth.getUserInitials(user.fullName);
  const roleNames = { student: user.accountType === 'seller_buyer' ? 'Student Seller / Buyer' : 'Student', staff: 'Trade Facility Staff', admin: 'Admin' };
  const roleLabel = roleNames[getUserRole(user)] || 'Student';

  nameEls.forEach(el => el.textContent = user.fullName);
  roleEls.forEach(el => el.textContent = roleLabel);
  initEls.forEach(el => el.textContent = initials);
}

/* ---- Dropdown toggle ---- */
function initDropdowns() {
  document.querySelectorAll('[data-dropdown-trigger]').forEach(trigger => {
    const menuId = trigger.getAttribute('data-dropdown-trigger');
    const menu = document.getElementById(menuId);
    if (!menu) return;

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}

/* ---- Active nav link ---- */
function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'search.html';
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === page);
  });
}

/* ---- Mobile sidebar toggle ---- */
function initMobileSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!toggle || !sidebar) return;

  const close = () => {
    sidebar.classList.remove('open');
    overlay?.classList.remove('show');
  };

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay?.classList.toggle('show');
  });

  overlay?.addEventListener('click', close);
}

/* ---- Initialise authenticated page ---- */
async function initPage() {
  const user = await Auth.requireAuth();
  if (!user) return;

  if (!canAccessPage(user)) {
    const target = getCurrentPage() === 'index.html'
      ? getRoleLandingPage(user)
      : `access-denied.html?from=${encodeURIComponent(getCurrentPage())}`;
    window.location.href = target;
    return null;
  }

  populateUserShell(user);
  buildDynamicNavigation(user);
  initDropdowns();
  setActiveNav();
  initMobileSidebar();
  if (hasFeature(user, 'messages')) refreshUnreadMessageCount(user);

  document.querySelectorAll('[data-action="signout"]').forEach(btn => {
    btn.addEventListener('click', () => Auth.signOut());
  });

  return user;
}

/* ---- Node.js exports for testing ---- */
if (typeof module !== 'undefined') {
  module.exports = { iconMarkup, showToast, populateUserShell, initDropdowns, setActiveNav, initMobileSidebar, buildDynamicNavigation, canAccessPage, getAllowedPages, getRoleLandingPage, hasFeature, setUnreadMessageBadge, refreshUnreadMessageCount, initPage };
}

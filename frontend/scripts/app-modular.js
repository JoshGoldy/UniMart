/**
 * UniMart App - Main application module
 * This file IMPORTS from other modules instead of containing everything
 */

// Import validators
import { 
  validateEmail, 
  validatePassword, 
  validateRequired,
  validatePrice,
  validateStudentNumber
} from './utils/validators.js';

// Import formatters
import { 
  formatDate, 
  formatDateTime, 
  formatPrice, 
  formatStatusLabel,
  escapeHtml
} from './utils/formatters.js';

// Import permissions
import { 
  ROLE_PERMISSIONS,
  FEATURE_TO_PERMISSION,
  getUserRole,
  isSellerAccount,
  isBuyerAccount,
  hasFeature,
  getAllowedPages,
  getCurrentPage,
  canAccessPage,
  getRoleLandingPage,
  setRuntimePermissions
} from './permissions/rolePermissions.js';

// Import UI components
import { 
  iconMarkup,
  navIcon,
  showToast,
  showNotification,
  initDropdowns,
  initMobileSidebar
} from './ui/components.js';

// Import navigation service
import { 
  buildDynamicNavigation,
  setActiveNav,
  setUnreadMessageBadge
} from './services/navigation.js';

// Import auth directly so modular pages do not depend on fragile globals
import { Auth } from './auth.js';

/**
 * Initialize the application page
 * This function uses imports from multiple modules
 */
export async function initPage() {
  // Auth is expected to be globally available or imported in the HTML
  const user = await Auth.requireAuth();
  if (!user) return;

  // Load runtime permissions from API if available
  if (Auth.getRolePermissions) {
    const permissions = await Auth.getRolePermissions();
    if (!permissions.error) {
      const permissionMap = permissions.permissions.reduce((map, item) => {
        map[`${item.role}:${item.permission}`] = item.enabled;
        return map;
      }, {});
      setRuntimePermissions(permissionMap);
    }
  }

  // Check page access using imported function
  if (!canAccessPage(user)) {
    const target = getCurrentPage() === 'index.html'
      ? getRoleLandingPage(user)
      : `access-denied.html?from=${encodeURIComponent(getCurrentPage())}`;
    window.location.href = target;
    return null;
  }

  // Initialize UI using imported functions
  populateUserShell(user);
  buildDynamicNavigation(user);  // Imported from navigation service
  ensureNotificationPanel(user);
  initDropdowns();                // Imported from UI components
  setActiveNav();                 // Imported from navigation service
  initMobileSidebar();           // Imported from UI components
  refreshMessageNotifications(user);
  if (hasFeature(user, 'messages') && !window.__unimartNotificationTimer) {
    window.__unimartNotificationTimer = setInterval(() => refreshMessageNotifications(user), 30000);
  }

  // Setup sign out buttons
  document.querySelectorAll('[data-action="signout"]').forEach(btn => {
    btn.addEventListener('click', () => Auth.signOut());
  });

  return user;
}

/**
 * Populate user information in the UI
 * Uses Auth module for getUserInitials
 */
function populateUserShell(user) {
  const nameEls = document.querySelectorAll('[data-user-name]');
  const roleEls = document.querySelectorAll('[data-user-role]');
  const initEls = document.querySelectorAll('[data-user-initials]');
  
  const initials = Auth.getUserInitials(user.fullName);
  const roleNames = { 
    student: user.accountType === 'seller_buyer' ? 'Student Seller / Buyer' : 'Student', 
    staff: 'Trade Facility Staff', 
    admin: 'Admin' 
  };
  
  if (getUserRole(user) === 'student' && user.accountType === 'seller') {
    roleNames.student = 'Student Seller';
  }
  
  const roleLabel = roleNames[getUserRole(user)] || 'Student';

  nameEls.forEach(el => el.textContent = user.fullName);
  roleEls.forEach(el => el.textContent = roleLabel);
  initEls.forEach(el => el.textContent = initials);
}

function ensureNotificationPanel(user) {
  if (!hasFeature(user, 'messages')) return;
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;

  let wrap = document.querySelector('.notification-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'notification-wrap dropdown';
    wrap.innerHTML = `
      <button class="topbar-icon-btn" type="button" title="Notifications" data-dropdown-trigger="topbar-notification-menu" aria-label="Notifications">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M6 8a4 4 0 1 1 8 0c0 4 1.5 4.5 1.5 5.5h-11C4.5 12.5 6 12 6 8Z" stroke-linejoin="round"/>
          <path d="M8.5 16a1.7 1.7 0 0 0 3 0" stroke-linecap="round"/>
        </svg>
        <span class="notification-dot" id="topbar-notification-count">0</span>
      </button>
      <div class="dropdown-menu notification-menu" id="topbar-notification-menu">
        <div class="notification-header">Notifications</div>
        <div id="topbar-notification-list"></div>
      </div>
    `;
    const avatar = actions.querySelector('.topbar-avatar');
    if (avatar) actions.insertBefore(wrap, avatar);
    else actions.prepend(wrap);
  }

  wrap.classList.add('dropdown');
  const trigger = wrap.querySelector('[data-notification-trigger], .topbar-icon-btn');
  if (trigger) trigger.setAttribute('data-dropdown-trigger', 'topbar-notification-menu');
  if (!document.getElementById('topbar-notification-list')) {
    const menu = document.getElementById('topbar-notification-menu');
    if (menu) menu.innerHTML = '<div class="notification-header">Notifications</div><div id="topbar-notification-list"></div>';
  }
}

async function refreshMessageNotifications(user) {
  if (!user || !hasFeature(user, 'messages')) return;
  const result = await Auth.getConversations(user.id);
  if (result.error) return;

  const conversations = result.conversations || [];
  const unread = conversations.filter(item => Number(item.unreadCount || 0) > 0);
  const unreadTotal = unread.reduce((total, item) => total + Number(item.unreadCount || 0), 0);
  setUnreadMessageBadge(unreadTotal);
  renderNotificationPanel(unread, unreadTotal);
}

function renderNotificationPanel(unreadConversations, unreadTotal) {
  const countEls = document.querySelectorAll('#topbar-notification-count');
  countEls.forEach(el => {
    el.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
    el.style.display = unreadTotal > 0 ? 'inline-flex' : 'none';
  });

  const list = document.getElementById('topbar-notification-list');
  if (!list) return;

  if (!unreadConversations.length) {
    list.innerHTML = `
      <div class="notification-empty">
        <strong>No new messages</strong>
        <span>You are all caught up.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = unreadConversations.slice(0, 5).map(item => `
    <a class="notification-item unread" href="messages.html?conversation=${encodeURIComponent(item.id)}">
      <strong>${escapeHtml(item.listingTitle || 'Marketplace conversation')}</strong>
      <span>${escapeHtml(item.unreadCount === 1 ? '1 new message' : `${item.unreadCount} new messages`)} from ${escapeHtml(item.otherDisplayName || 'a UniMart user')}</span>
    </a>
  `).join('') + `
    <a class="notification-view-all" href="messages.html">Open messages</a>
  `;
}

// Re-export everything for convenience
export {
  // Validators
  validateEmail,
  validatePassword,
  validateRequired,
  validatePrice,
  validateStudentNumber,
  
  // Formatters
  formatDate,
  formatDateTime,
  formatPrice,
  formatStatusLabel,
  escapeHtml,
  
  // Permissions
  ROLE_PERMISSIONS,
  FEATURE_TO_PERMISSION,
  getUserRole,
  isSellerAccount,
  isBuyerAccount,
  hasFeature,
  getAllowedPages,
  getCurrentPage,
  canAccessPage,
  getRoleLandingPage,
  
  // UI
  iconMarkup,
  navIcon,
  showToast,
  showNotification,
  initDropdowns,
  initMobileSidebar,
  
  // Navigation
  buildDynamicNavigation,
  setActiveNav,
  setUnreadMessageBadge
};


// Backwards compatibility for the existing page scripts.
// The modular split moved helpers into imports, while pages still call helpers like initPage(), showToast(), etc. directly.
const AppApi = {
  initPage,
  validateEmail,
  validatePassword,
  validateRequired,
  validatePrice,
  validateStudentNumber,
  formatDate,
  formatDateTime,
  formatPrice,
  formatStatusLabel,
  escapeHtml,
  ROLE_PERMISSIONS,
  FEATURE_TO_PERMISSION,
  getUserRole,
  isSellerAccount,
  isBuyerAccount,
  hasFeature,
  getAllowedPages,
  getCurrentPage,
  canAccessPage,
  getRoleLandingPage,
  iconMarkup,
  navIcon,
  showToast,
  showNotification,
  initDropdowns,
  initMobileSidebar,
  buildDynamicNavigation,
  setActiveNav,
  setUnreadMessageBadge
};

if (typeof window !== 'undefined') {
  window.App = { ...(window.App || {}), ...AppApi };
  Object.assign(window, AppApi);
}

// Default export for convenience
export default {
  // All exported functions available here
  initPage,
  validateEmail,
  validatePassword,
  formatPrice,
  formatDate,
  showNotification,
  canAccessPage,
  getUserRole,
  // ... etc
};

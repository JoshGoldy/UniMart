/**
 * UniMart App utilities
 * Shared helpers used across authenticated pages.
 */

// UI utilities
export function iconMarkup(name) {
  const icons = {
    success: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="m4.5 10 3.5 3.5 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="7"/><path d="M10 9.25v4M10 6.75h.01" stroke-linecap="round"/></svg>'
  };
  return `<span class="ui-icon">${icons[name] || icons.info}</span>`;
}

// Account type checks
export function isSellerAccount(user) {
  return ['seller', 'seller_buyer'].includes(user?.accountType);
}

export function isBuyerAccount(user) {
  return ['buyer', 'seller_buyer'].includes(user?.accountType || 'buyer');
}

export function getUserRole(user) {
  return user?.userRole || 'student';
}

// Role permissions configuration
export const ROLE_PERMISSIONS = {
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

export const FEATURE_TO_PERMISSION = {
  marketplace: 'marketplace_browsing',
  offers: 'marketplace_browsing',
  messages: 'messaging',
  'listing-management': 'listing_management',
  'trade-facility': 'trade_facility_workflow',
  'admin-config': 'admin_configuration',
  moderation: 'moderation',
};

let runtimePermissionMap = null;

// Page navigation helpers
export function getCurrentPage() {
  return window.location.pathname.split('/').pop() || 'search.html';
}

export function getAllowedPages(user) {
  const role = getUserRole(user);
  const config = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student;
  const pages = ['profile.html', 'access-denied.html'];
  
  if (role === 'staff' && hasFeature(user, 'trade-facility')) pages.push('facility.html');
  if (role === 'admin' && hasFeature(user, 'admin-config')) pages.push('admin.html');
  if (role === 'student' && hasFeature(user, 'marketplace') && isBuyerAccount(user)) pages.push('search.html');
  if (role === 'student' && hasFeature(user, 'messages')) pages.push('messages.html');
  if (role === 'student' && hasFeature(user, 'listing-management') && isSellerAccount(user)) {
    pages.push('dashboard.html', 'listings.html');
  }
  
  if (!pages.length && config.pages?.length) pages.push(...config.pages);
  return pages;
}

export function canAccessPage(user, page = getCurrentPage()) {
  return getAllowedPages(user).includes(page);
}

export function getRoleLandingPage(user) {
  const role = getUserRole(user);
  if (role === 'student') {
    if (isBuyerAccount(user) && hasFeature(user, 'marketplace')) return 'search.html';
    if (isSellerAccount(user) && hasFeature(user, 'listing-management')) return 'dashboard.html';
  }
  return (ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student).landingPage;
}

export function hasFeature(user, feature) {
  const role = getUserRole(user);
  const defaultAllowed = Boolean((ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.student).features.includes(feature))
    || (role === 'student' && feature === 'listing-management' && isSellerAccount(user));
  
  const permission = FEATURE_TO_PERMISSION[feature];
  if (!permission || !runtimePermissionMap) return defaultAllowed;
  
  const key = `${role}:${permission}`;
  return Object.prototype.hasOwnProperty.call(runtimePermissionMap, key)
    ? runtimePermissionMap[key]
    : defaultAllowed;
}

// Status formatting
export function formatStatusLabel(value) {
  const labels = {
    active: 'Active',
    sold: 'Sold',
    reserved: 'Reserved',
    pending_approval: 'Pending Approval',
    rejected: 'Rejected',
    draft: 'Draft',
  };
  return labels[value] || value;
}

// Notification helpers
export function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container') || createNotificationContainer();
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `${iconMarkup(type)} <span>${message}</span>`;
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 5000);
}

function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.style.position = 'fixed';
  container.style.top = '20px';
  container.style.right = '20px';
  container.style.zIndex = '9999';
  document.body.appendChild(container);
  return container;
}

// Form validation
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

// Date formatting
export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

export function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Price formatting
export function formatPrice(price) {
  if (typeof price !== 'number') return 'R0.00';
  return `R${price.toFixed(2)}`;
}

// Image handling
export function getImageUrl(path) {
  if (!path) return '/frontend/assets/placeholder.png';
  if (path.startsWith('http')) return path;
  return `/frontend/assets/${path}`;
}

// Local storage helpers
export function saveToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
    return false;
  }
}

export function getFromLocalStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Failed to read from localStorage:', error);
    return defaultValue;
  }
}

export function removeFromLocalStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Failed to remove from localStorage:', error);
    return false;
  }
}

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Export as default App object for backwards compatibility
export const App = {
  iconMarkup,
  isSellerAccount,
  isBuyerAccount,
  getUserRole,
  getCurrentPage,
  getAllowedPages,
  canAccessPage,
  getRoleLandingPage,
  hasFeature,
  formatStatusLabel,
  showNotification,
  validateEmail,
  validatePassword,
  validateRequired,
  formatDate,
  formatDateTime,
  formatPrice,
  getImageUrl,
  saveToLocalStorage,
  getFromLocalStorage,
  removeFromLocalStorage,
  debounce,
  ROLE_PERMISSIONS,
  FEATURE_TO_PERMISSION
};

export default App;

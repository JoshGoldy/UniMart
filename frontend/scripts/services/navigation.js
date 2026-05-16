/**
 * Navigation service
 * Imports from: permissions/rolePermissions.js, ui/components.js
 * Used by: All authenticated pages
 */

import { getUserRole, isSellerAccount, isBuyerAccount, hasFeature } from '../permissions/rolePermissions.js';
import { navIcon } from '../ui/components.js';

export function renderNavItem(item) {
  return `
    <a href="${item.href}" class="nav-item" data-page="${item.href}">
      ${navIcon(item.icon)}
      ${item.label}
      ${item.badgeId ? `<span class="nav-badge" id="${item.badgeId}" style="display:none">0</span>` : ''}
    </a>`;
}

export function buildDynamicNavigation(user) {
  const role = getUserRole(user);
  let mainItems = [];
  let manageItems = [{ href: 'profile.html', label: 'My Profile', icon: 'profile' }];

  if (role === 'staff' && hasFeature(user, 'trade-facility')) {
    mainItems = [{ href: 'facility.html', label: 'Trade Facility', icon: 'facility' }];
  } else if (role === 'admin' && hasFeature(user, 'admin-config')) {
    mainItems = [{ href: 'admin.html', label: 'Admin Dashboard', icon: 'admin' }];
  } else {
    if (hasFeature(user, 'marketplace') && isBuyerAccount(user)) {
      mainItems = [{ href: 'search.html', label: 'Search Listings', icon: 'search' }];
    }
    if (hasFeature(user, 'messages')) {
      manageItems.unshift({ 
        href: 'messages.html', 
        label: isSellerAccount(user) ? 'Seller Messages' : 'Messages', 
        icon: 'messages', 
        badgeId: 'nav-message-count' 
      });
    }
  }

  if (role === 'student' && isSellerAccount(user) && hasFeature(user, 'listing-management')) {
    mainItems.push({ href: 'dashboard.html', label: 'Seller Dashboard', icon: 'dashboard' });
    manageItems.unshift({ href: 'listings.html', label: 'Listing Management', icon: 'listings' });
  }

  document.querySelectorAll('.sidebar-nav').forEach(nav => {
    nav.innerHTML = `
      <section class="sidebar-section-label">Main</section>
      ${mainItems.map(renderNavItem).join('')}
      <section class="sidebar-section-label">Manage</section>
      ${manageItems.map(renderNavItem).join('')}
    `;
  });
}

export function setActiveNav() {
  const page = window.location.pathname.split('/').pop() || 'search.html';
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-page') === page);
  });
}

export function setUnreadMessageBadge(count) {
  document.querySelectorAll('#nav-message-count').forEach(badge => {
    const safeCount = Number(count) || 0;
    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.style.display = safeCount > 0 ? 'inline-flex' : 'none';
  });
}

export default {
  renderNavItem,
  buildDynamicNavigation,
  setActiveNav,
  setUnreadMessageBadge
};

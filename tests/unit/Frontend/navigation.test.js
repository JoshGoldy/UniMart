/**
 * Tests for services/navigation.js module
 * This will show coverage for navigation service
 */

import { 
  renderNavItem,
  buildDynamicNavigation,
  setActiveNav,
  setUnreadMessageBadge
} from '../../../frontend/scripts/services/navigation.js';

describe('Navigation Service Module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderNavItem', () => {
    test('should render navigation item with icon and label', () => {
      const item = { 
        href: 'search.html', 
        label: 'Search', 
        icon: 'search' 
      };
      
      const result = renderNavItem(item);
      
      expect(result).toContain('search.html');
      expect(result).toContain('Search');
      expect(result).toContain('nav-item');
    });

    test('should include badge if badgeId provided', () => {
      const item = { 
        href: 'messages.html', 
        label: 'Messages', 
        icon: 'messages',
        badgeId: 'msg-count'
      };
      
      const result = renderNavItem(item);
      
      expect(result).toContain('msg-count');
      expect(result).toContain('nav-badge');
    });

    test('should not include badge if no badgeId', () => {
      const item = { 
        href: 'profile.html', 
        label: 'Profile', 
        icon: 'profile' 
      };
      
      const result = renderNavItem(item);
      
      expect(result).not.toContain('nav-badge');
    });
  });

  describe('buildDynamicNavigation', () => {
    beforeEach(() => {
      document.body.innerHTML = '<nav class="sidebar-nav"></nav>';
    });

    test('should build navigation for student buyer', () => {
      const user = { 
        userRole: 'student', 
        accountType: 'buyer' 
      };
      
      buildDynamicNavigation(user);
      
      const nav = document.querySelector('.sidebar-nav');
      expect(nav.innerHTML).toContain('Search Listings');
      expect(nav.innerHTML).toContain('My Profile');
    });

    test('should build navigation for student seller', () => {
      const user = { 
        userRole: 'student', 
        accountType: 'seller' 
      };
      
      buildDynamicNavigation(user);
      
      const nav = document.querySelector('.sidebar-nav');
      expect(nav.innerHTML).toContain('Seller Dashboard');
      expect(nav.innerHTML).toContain('Listing Management');
    });

    test('should build navigation for staff', () => {
      const user = { 
        userRole: 'staff' 
      };
      
      buildDynamicNavigation(user);
      
      const nav = document.querySelector('.sidebar-nav');
      expect(nav.innerHTML).toContain('Trade Facility');
    });

    test('should build navigation for admin', () => {
      const user = { 
        userRole: 'admin' 
      };
      
      buildDynamicNavigation(user);
      
      const nav = document.querySelector('.sidebar-nav');
      expect(nav.innerHTML).toContain('Admin Dashboard');
    });

    test('should include messages for seller_buyer', () => {
      const user = { 
        userRole: 'student', 
        accountType: 'seller_buyer' 
      };
      
      buildDynamicNavigation(user);
      
      const nav = document.querySelector('.sidebar-nav');
      expect(nav.innerHTML).toContain('Seller Messages');
    });
  });

  describe('setActiveNav', () => {
    test('should set active class on current page link', () => {
      document.body.innerHTML = `
        <a href="search.html" class="nav-item" data-page="search.html">Search</a>
        <a href="profile.html" class="nav-item" data-page="profile.html">Profile</a>
      `;
      
      setActiveNav();
      
      const searchLink = document.querySelector('[data-page="search.html"]');
      const profileLink = document.querySelector('[data-page="profile.html"]');
      
      // One should be active
      expect(searchLink.classList.contains('active') || profileLink.classList.contains('active')).toBe(true);
    });
  });

  describe('setUnreadMessageBadge', () => {
    test('should show badge with count', () => {
      document.body.innerHTML = '<span id="nav-message-count"></span>';
      
      setUnreadMessageBadge(5);
      
      const badge = document.getElementById('nav-message-count');
      expect(badge.textContent).toBe('5');
      expect(badge.style.display).toBe('inline-flex');
    });

    test('should hide badge when count is 0', () => {
      document.body.innerHTML = '<span id="nav-message-count"></span>';
      
      setUnreadMessageBadge(0);
      
      const badge = document.getElementById('nav-message-count');
      expect(badge.style.display).toBe('none');
    });

    test('should show 99+ for counts over 99', () => {
      document.body.innerHTML = '<span id="nav-message-count"></span>';
      
      setUnreadMessageBadge(150);
      
      const badge = document.getElementById('nav-message-count');
      expect(badge.textContent).toBe('99+');
    });

    test('should handle multiple badge elements', () => {
      document.body.innerHTML = `
        <span id="nav-message-count"></span>
        <span id="nav-message-count"></span>
      `;
      
      setUnreadMessageBadge(3);
      
      const badges = document.querySelectorAll('#nav-message-count');
      badges.forEach(badge => {
        expect(badge.textContent).toBe('3');
      });
    });

    test('should handle invalid counts gracefully', () => {
      document.body.innerHTML = '<span id="nav-message-count"></span>';
      
      setUnreadMessageBadge(null);
      
      const badge = document.getElementById('nav-message-count');
      expect(badge.style.display).toBe('none');
    });
  });
});

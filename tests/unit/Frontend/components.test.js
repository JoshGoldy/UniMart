/**
 * Tests for ui/components.js module
 * This will show coverage for UI components
 */

import { 
  iconMarkup,
  navIcon,
  showToast,
  initDropdowns,
  initMobileSidebar
} from '../../../frontend/scripts/ui/components.js';

describe('UI Components Module', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('iconMarkup', () => {
    test('should return success icon', () => {
      const result = iconMarkup('success');
      expect(result).toContain('svg');
      expect(result).toContain('ui-icon');
    });

    test('should return error icon', () => {
      const result = iconMarkup('error');
      expect(result).toContain('svg');
    });

    test('should return info icon for unknown types', () => {
      const result = iconMarkup('unknown');
      expect(result).toContain('svg');
    });
  });

  describe('navIcon', () => {
    test('should return search icon', () => {
      const result = navIcon('search');
      expect(result).toContain('svg');
      expect(result).toContain('nav-icon');
    });

    test('should return dashboard icon', () => {
      const result = navIcon('dashboard');
      expect(result).toContain('svg');
    });

    test('should return default icon for unknown', () => {
      const result = navIcon('unknown');
      expect(result).toContain('svg');
    });
  });

  describe('showToast', () => {
    test('should create toast container if missing', () => {
      showToast('Test message');
      const container = document.getElementById('toast-container');
      expect(container).toBeInTheDocument();
    });

    test('should add toast with message', () => {
      showToast('Hello World', 'success');
      const container = document.getElementById('toast-container');
      expect(container.innerHTML).toContain('Hello World');
    });

    test('should handle different toast types', () => {
      showToast('Success', 'success');
      showToast('Error', 'error');
      showToast('Info', 'info');
      
      const container = document.getElementById('toast-container');
      expect(container).toBeInTheDocument();
    });
  });

  describe('initDropdowns', () => {
    test('should initialize dropdown triggers', () => {
      document.body.innerHTML = `
        <button data-dropdown-trigger="menu1">Toggle</button>
        <div id="menu1" class="dropdown-menu"></div>
      `;
      
      initDropdowns();
      
      const trigger = document.querySelector('[data-dropdown-trigger]');
      const menu = document.getElementById('menu1');
      
      trigger.click();
      expect(menu.classList.contains('open')).toBe(true);
    });

    test('should close dropdowns on document click', () => {
      document.body.innerHTML = `
        <button data-dropdown-trigger="menu1">Toggle</button>
        <div id="menu1" class="dropdown-menu open"></div>
      `;
      
      initDropdowns();
      
      document.body.click();
      
      const menu = document.getElementById('menu1');
      expect(menu.classList.contains('open')).toBe(false);
    });

    test('should handle missing menu gracefully', () => {
      document.body.innerHTML = `
        <button data-dropdown-trigger="nonexistent">Toggle</button>
      `;
      
      expect(() => initDropdowns()).not.toThrow();
    });
  });

  describe('initMobileSidebar', () => {
    test('should toggle sidebar on button click', () => {
      document.body.innerHTML = `
        <button id="sidebar-toggle">Toggle</button>
        <div id="sidebar"></div>
        <div id="sidebar-overlay"></div>
      `;
      
      initMobileSidebar();
      
      const toggle = document.getElementById('sidebar-toggle');
      const sidebar = document.getElementById('sidebar');
      
      toggle.click();
      expect(sidebar.classList.contains('open')).toBe(true);
      
      toggle.click();
      expect(sidebar.classList.contains('open')).toBe(false);
    });

    test('should close sidebar on overlay click', () => {
      document.body.innerHTML = `
        <button id="sidebar-toggle">Toggle</button>
        <div id="sidebar" class="open"></div>
        <div id="sidebar-overlay" class="show"></div>
      `;
      
      initMobileSidebar();
      
      const overlay = document.getElementById('sidebar-overlay');
      overlay.click();
      
      const sidebar = document.getElementById('sidebar');
      expect(sidebar.classList.contains('open')).toBe(false);
    });

    test('should handle missing elements gracefully', () => {
      document.body.innerHTML = '<div>No sidebar elements</div>';
      expect(() => initMobileSidebar()).not.toThrow();
    });
  });
});

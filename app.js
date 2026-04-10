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
  const roleLabel = user.accountType === 'seller_buyer' ? 'Seller / Buyer' : 'Buyer';

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

  populateUserShell(user);
  initDropdowns();
  setActiveNav();
  initMobileSidebar();

  document.querySelectorAll('[data-action="signout"]').forEach(btn => {
    btn.addEventListener('click', () => Auth.signOut());
  });

  return user;
}

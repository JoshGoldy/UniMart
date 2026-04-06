/**
 * UniMart — Auth module
 * Uses localStorage as a stand-in until Supabase is wired up.
 * All public functions are designed to be replaced by real Supabase calls.
 */
 
const Auth = (() => {
  const USERS_KEY   = 'unimart_users';
  const SESSION_KEY = 'unimart_session';
 
  /* ---------- helpers ---------- */
  function getUsers() {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  }
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }
  function getSession() {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  }
  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }
  // simple hash (NOT for production — placeholder until Supabase auth)
  function hashPassword(pw) {
    let hash = 0;
    for (let i = 0; i < pw.length; i++) {
      hash = ((hash << 5) - hash) + pw.charCodeAt(i);
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }
  // generate 6-digit OTP
  function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
 
  /* ---------- public API ---------- */
 
  function signUp({ fullName, email, password, accountType }) {
    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { error: 'An account with this email already exists.' };
    }
    const user = {
      id: 'usr_' + Date.now(),
      fullName,
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      accountType,        // 'buyer' | 'seller_buyer'
      createdAt: new Date().toISOString(),
      verified: false,
    };
    users.push(user);
    saveUsers(users);
 
    // Store pending OTP for verification
    const otp = generateOTP();
    sessionStorage.setItem('unimart_pending_otp', otp);
    sessionStorage.setItem('unimart_pending_email', email.toLowerCase());
    sessionStorage.setItem('unimart_pending_action', 'signup');
 
    // TODO: replace with real email via Supabase / SendGrid
    console.info(`[UniMart DEV] Verification OTP for ${email}: ${otp}`);
    return { success: true, otp /* exposed for dev banner */ };
  }
 
  function signIn({ email, password }) {
    const users = getUsers();
    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) return { error: 'No account found with that email.' };
    if (user.passwordHash !== hashPassword(password)) return { error: 'Incorrect password.' };
 
    const otp = generateOTP();
    sessionStorage.setItem('unimart_pending_otp', otp);
    sessionStorage.setItem('unimart_pending_email', email.toLowerCase());
    sessionStorage.setItem('unimart_pending_action', 'login');
 
    // TODO: replace with real email via Supabase / SendGrid
    console.info(`[UniMart DEV] Login OTP for ${email}: ${otp}`);
    return { success: true, otp /* exposed for dev banner */ };
  }
 
  function verifyOTP(code) {
    const stored = sessionStorage.getItem('unimart_pending_otp');
    const email  = sessionStorage.getItem('unimart_pending_email');
    const action = sessionStorage.getItem('unimart_pending_action');
 
    if (!stored || !email) return { error: 'Session expired. Please try again.' };
    if (code.trim() !== stored) return { error: 'Incorrect code. Please try again.' };
 
    const users = getUsers();
    const user  = users.find(u => u.email === email);
    if (!user) return { error: 'Account not found.' };
 
    // Mark as verified
    user.verified = true;
    saveUsers(users);
    saveSession(user);
 
    // Clean up
    sessionStorage.removeItem('unimart_pending_otp');
    sessionStorage.removeItem('unimart_pending_email');
    sessionStorage.removeItem('unimart_pending_action');
 
    return { success: true, user, action };
  }
 
  function signOut() {
    clearSession();
    window.location.href = 'login.html';
  }
 
  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  }
 
  function getUser() {
    return getSession();
  }
 
  function getUserInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
 
  return { signUp, signIn, verifyOTP, signOut, requireAuth, getUser, getUserInitials };
})();
/**
 * UniMart — Auth module (Supabase)
 * Modular authentication utilities
 */

// Configuration
export const SUPABASE_URL = 'https://xdxnzkowvmphveiwzufm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_WqqtaVhge6rIPosltnGktw_xVHBE5L_';
export const LISTING_IMAGE_BUCKET = 'listing-images';
export const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Supabase client initialization
export let _sb;
export function initializeSupabase(supabaseLib) {
  _sb = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// Get Supabase client
export function getSupabaseClient() {
  return _sb;
}

export function _userFacingError(error, fallback = 'Something went wrong. Please try again.') {
  const message = typeof error === 'string' ? error : error?.message;
  if (!message) return fallback;
  const technicalPatterns = [
    /supabase/i,
    /schema cache/i,
    /relation .* does not exist/i,
    /column .* does not exist/i,
    /violates .* constraint/i,
    /check constraint/i,
    /foreign key/i,
    /duplicate key/i,
    /invalid input syntax/i,
    /\buuid\b/i,
    /row-level security/i,
    /\brls\b/i,
    /permission denied for/i,
  ];
  if (technicalPatterns.some(pattern => pattern.test(message))) return fallback;
  if (/failed to fetch|network/i.test(message)) return 'We could not connect right now. Please check your connection and try again.';
  return message;
}

export async function _edgeFunctionErrorMessage(error, fallback = 'Online checkout could not be started.') {
  const context = error?.context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (body?.error) return _userFacingError(body.error, fallback);
      if (body?.message) return _userFacingError(body.message, fallback);
    } catch (_err) {
      // Fall back to the normal error message below.
    }
  }
  return _userFacingError(error, fallback);
}

// Build page URLs safely for GitHub Pages, local dev, and the deployed /frontend/pages structure.
// This also corrects older broken redirects that accidentally used /fontend/.
export function getPageUrl(pageName) {
  const origin = window.location.origin;
  const pathname = window.location.pathname.replace('/fontend/', '/frontend/');

  if (pathname.includes('/frontend/pages/')) {
    const appRoot = pathname.split('/frontend/pages/')[0];
    return `${origin}${appRoot}/frontend/pages/${pageName}`;
  }

  if (pathname.includes('/pages/')) {
    const pageRoot = pathname.split('/pages/')[0];
    return `${origin}${pageRoot}/pages/${pageName}`;
  }

  return new URL(pageName, window.location.href).href;
}

export function redirectToPage(pageName, replace = true) {
  const url = getPageUrl(pageName);
  if (replace) window.location.replace(url);
  else window.location.href = url;
}

// Helper functions
function _normalizeUsername(username) {
  if (!username) return null;
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function _buildUser(authUser) {
  const meta = authUser.user_metadata || {};
  return {
    id: authUser.id,
    email: authUser.email,
    fullName: meta.full_name || authUser.email.split('@')[0],
    accountType: meta.account_type || 'buyer',
    userRole: meta.user_role || 'student',
    username: meta.username || null,
    university: meta.university || null,
    campus: meta.campus || null,
    studentNumber: meta.student_number || null,
  };
}

async function _ensureProfile(authUser) {
  if (!authUser) return null;
  const { data, error } = await _sb.from('users').select('*').eq('id', authUser.id).maybeSingle();
  if (error) {
    console.warn('Failed to load profile:', error.message);
    return _buildUser(authUser);
  }
  if (!data) {
    const pending = getPendingOAuthProfile();
    const meta = { ...pending, ...(authUser.user_metadata || {}) };
    const newProfile = {
      id: authUser.id,
      email: authUser.email,
      full_name: meta.full_name || meta.fullName || authUser.email.split('@')[0],
      account_type: meta.account_type || meta.accountType || 'buyer',
      user_role: meta.user_role || meta.userRole || 'student',
      username: meta.username || null,
      university: meta.university || null,
      uni_campus: meta.campus || meta.uni_campus || null,
      student_number: meta.student_number || meta.studentNumber || null,
    };
    await _sb.from('users').insert(newProfile);
    clearPendingOAuthProfile();
    return {
      id: newProfile.id,
      email: newProfile.email,
      fullName: newProfile.full_name,
      accountType: newProfile.account_type,
      userRole: newProfile.user_role,
      username: newProfile.username,
      university: newProfile.university,
      campus: newProfile.uni_campus,
      studentNumber: newProfile.student_number,
    };
  }
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    accountType: data.account_type,
    userRole: data.user_role,
    username: data.username,
    university: data.university,
    campus: data.uni_campus,
    studentNumber: data.student_number,
  };
}

// Sign-up
export async function signUp({ fullName, email, password, accountType, userRole = 'student', university, campus, studentNumber }) {
  const cleanRole = ['student', 'staff'].includes(userRole) ? userRole : 'student';
  const cleanAccountType = cleanRole === 'student' && ['buyer', 'seller', 'seller_buyer'].includes(accountType)
    ? accountType
    : 'buyer';
  const { data, error } = await _sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getPageUrl('login.html'),
      data: { 
        full_name: fullName, 
        account_type: cleanAccountType, 
        user_role: cleanRole, 
        university: university || null, 
        campus: campus || null, 
        student_number: studentNumber || null 
      }
    }
  });
  if (error) return { error: _userFacingError(error) };
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: 'An account already exists for this email. Sign in or use Forgot password.' };
  }
  return { success: true, requiresEmailVerification: !data?.session };
}

export async function resendSignupOTP(email) {
  const { error } = await _sb.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getPageUrl('login.html'),
    },
  });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

// Sign-in
export async function signIn({ email, password }) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) return { error: _userFacingError(error) };
  const profile = await _ensureProfile(data.user);
  return { success: true, user: profile || _buildUser(data.user) };
}

export async function signInWithGoogle({ redirectTo } = {}) {
  const { error } = await _sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTo || getOAuthRedirectUrl(),
    },
  });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const code = params.get('code') || hash.get('code');
  const accessToken = hash.get('access_token') || params.get('access_token');
  const refreshToken = hash.get('refresh_token') || params.get('refresh_token');

  if (code && _sb.auth.exchangeCodeForSession) {
    const { error: exchangeError } = await _sb.auth.exchangeCodeForSession(code);
    if (exchangeError) return { error: _userFacingError(exchangeError, 'We could not complete Google sign-in. Please try again.') };
  } else if (accessToken && refreshToken) {
    const { error: sessionError } = await _sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sessionError) return { error: _userFacingError(sessionError, 'We could not complete Google sign-in. Please try again.') };
  }

  const { data: { session }, error } = await _sb.auth.getSession();
  if (error) return { error: _userFacingError(error) };
  if (!session?.user) return { error: 'We could not complete Google sign-in. Please try again.' };

  const profile = await _ensureProfile(session.user);
  if (!profile) return { error: 'We could not load your UniMart profile. Please try again.' };
  return { success: true, user: profile };
}

// OTP verification
export async function verifyOTP(email, token) {
  const { data, error } = await _sb.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) return { error: _userFacingError(error) };
  if (data.user) {
    const meta = data.user.user_metadata || {};
    await _sb.from('users').upsert({
      id: data.user.id,
      full_name: meta.full_name,
      email: data.user.email,
      account_type: meta.account_type || 'buyer',
      user_role: meta.user_role || 'student',
      university: meta.university || null,
      uni_campus: meta.campus || null,
      student_number: meta.student_number || null,
    });
  }
  return { success: true };
}

// Sign-out
export async function signOut() {
  await _sb.auth.signOut();
  redirectToPage('login.html');
}

// Session / auth guard
export async function requireAuth() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) {
    redirectToPage('login.html');
    return null;
  }
  return _ensureProfile(session.user);
}

export async function getUser() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return null;
  return _ensureProfile(session.user);
}

// Profile updates
export async function updateProfile({ id, fullName, email, accountType, username }) {
  const cleanUsername = _normalizeUsername(username);
  const cleanAccountType = ['buyer', 'seller', 'seller_buyer'].includes(accountType) ? accountType : 'buyer';
  const [{ error: dbErr }, { error: authErr }] = await Promise.all([
    _sb.from('users').update({
      full_name: fullName,
      email: email.toLowerCase(),
      account_type: cleanAccountType,
      username: cleanUsername || null,
    }).eq('id', id),
    _sb.auth.updateUser({ data: { full_name: fullName, account_type: cleanAccountType, username: cleanUsername || null } }),
  ]);
  if (dbErr || authErr) return { error: _userFacingError(dbErr || authErr) };
  return { success: true };
}

export async function updateCampusInfo({ id, university, campus, studentNumber }) {
  const { error } = await _sb.from('users').update({
    university: university || null,
    uni_campus: campus || null,
    student_number: studentNumber || null,
  }).eq('id', id);
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

// Password management
export async function updatePassword({ currentPassword, newPassword, email }) {
  const { error: reAuthErr } = await _sb.auth.signInWithPassword({ email, password: currentPassword });
  if (reAuthErr) return { error: 'Incorrect current password.' };
  const { error: updateErr } = await _sb.auth.updateUser({ password: newPassword });
  if (updateErr) return { error: _userFacingError(updateErr) };
  return { success: true };
}

export async function requestPasswordReset({ email, redirectTo }) {
  const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo || getPageUrl('login.html') });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function handlePasswordRecoverySession() {
  const { data: sessionData } = await _sb.auth.getSession();
  if (sessionData?.session) return { success: true };

  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const accessToken = hash.get('access_token') || params.get('access_token');
  const refreshToken = hash.get('refresh_token') || params.get('refresh_token');
  const code = params.get('code') || hash.get('code');

  if (accessToken && refreshToken) {
    const { error } = await _sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) return { error: _userFacingError(error) };
    return { success: true };
  }

  if (code && _sb.auth.exchangeCodeForSession) {
    const { error } = await _sb.auth.exchangeCodeForSession(code);
    if (error) return { error: _userFacingError(error) };
    return { success: true };
  }

  return { error: 'Open the password reset link from your email again so we can verify the recovery session.' };
}

export async function completePasswordRecovery({ newPassword }) {
  const recovered = await handlePasswordRecoverySession();
  if (recovered.error) return recovered;
  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

// -----------------------------
// Data helpers restored after modular split
// -----------------------------
export function getUserInitials(nameOrEmail = '') {
  const parts = String(nameOrEmail || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getOAuthRedirectUrl() {
  return getPageUrl('auth-callback.html');
}

export function setPendingOAuthProfile(profile = {}) {
  sessionStorage.setItem('unimart_pending_oauth_profile', JSON.stringify(profile));
}

function getPendingOAuthProfile() {
  try {
    return JSON.parse(sessionStorage.getItem('unimart_pending_oauth_profile') || '{}');
  } catch (_) {
    return {};
  }
}

function clearPendingOAuthProfile() {
  sessionStorage.removeItem('unimart_pending_oauth_profile');
}

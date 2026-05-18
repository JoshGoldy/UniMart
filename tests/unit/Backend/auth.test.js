/**
 * Backend tests for auth.js — Supabase Auth functions
 * Covers: constants, initializeSupabase, getPageUrl, getUserInitials,
 *         signUp, resendSignupOTP, signIn, signInWithGoogle, handleOAuthCallback,
 *         verifyOTP, requireAuth, getUser, updateProfile, updateCampusInfo,
 *         updatePassword, requestPasswordReset, completePasswordRecovery
 */

import { jest } from '@jest/globals';
import {
  initializeSupabase,
  getSupabaseClient,
  getPageUrl,
  getUserInitials,
  signUp,
  resendSignupOTP,
  signIn,
  signInWithGoogle,
  handleOAuthCallback,
  verifyOTP,
  requireAuth,
  getUser,
  updateProfile,
  updateCampusInfo,
  updatePassword,
  requestPasswordReset,
  completePasswordRecovery,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  LISTING_IMAGE_BUCKET,
  LISTING_IMAGE_MAX_BYTES,
} from '../../../frontend/scripts/auth.js';

// ─── Mock factory helpers ─────────────────────────────────────────────────────

function mkAuth(overrides = {}) {
  return {
    signUp: jest.fn().mockResolvedValue({ data: { session: null, user: null }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithOAuth: jest.fn().mockResolvedValue({ error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    updateUser: jest.fn().mockResolvedValue({ error: null }),
    verifyOtp: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
    resend: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function mkFrom(rowData = null) {
  return jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: rowData, error: null }),
    single: jest.fn().mockResolvedValue({ data: rowData, error: null }),
  });
}

function mkSb(authOverrides = {}, fromFn = null) {
  return {
    createClient: jest.fn().mockReturnValue({
      auth: mkAuth(authOverrides),
      from: fromFn || mkFrom(),
      storage: {
        from: jest.fn().mockReturnValue({
          upload: jest.fn().mockResolvedValue({ error: null }),
          getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }),
        }),
      },
    }),
  };
}

// Standard profile row used across multiple tests
const PROFILE_ROW = {
  id: 'u1', email: 't@uni.ac.za', full_name: 'Test User',
  account_type: 'buyer', user_role: 'student',
};
const MOCK_USER = {
  id: 'u1', email: 't@uni.ac.za',
  user_metadata: { full_name: 'Test User', account_type: 'buyer', user_role: 'student' },
};

// ─── Constants ────────────────────────────────────────────────────────────────

describe('Auth constants', () => {
  test('SUPABASE_URL matches supabase.co domain', () => {
    expect(SUPABASE_URL).toMatch(/^https:\/\/.+\.supabase\.co$/);
  });
  test('SUPABASE_ANON_KEY is non-empty string', () => {
    expect(typeof SUPABASE_ANON_KEY).toBe('string');
    expect(SUPABASE_ANON_KEY.length).toBeGreaterThan(10);
  });
  test('LISTING_IMAGE_BUCKET equals listing-images', () => {
    expect(LISTING_IMAGE_BUCKET).toBe('listing-images');
  });
  test('LISTING_IMAGE_MAX_BYTES equals 5MB', () => {
    expect(LISTING_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

// ─── initializeSupabase ───────────────────────────────────────────────────────

describe('initializeSupabase', () => {
  test('calls createClient with SUPABASE_URL and SUPABASE_ANON_KEY', () => {
    const sb = mkSb();
    initializeSupabase(sb);
    expect(sb.createClient).toHaveBeenCalledWith(SUPABASE_URL, SUPABASE_ANON_KEY);
  });
  test('getSupabaseClient returns the initialized client', () => {
    const sb = mkSb();
    const client = initializeSupabase(sb);
    expect(getSupabaseClient()).toBe(client);
  });
});

// ─── getPageUrl ───────────────────────────────────────────────────────────────

describe('getPageUrl', () => {
  // jsdom locks window.location — test the output format without reassigning it
  test('returns a string URL containing the page name', () => {
    const url = getPageUrl('login.html');
    expect(typeof url).toBe('string');
    expect(url).toContain('login.html');
  });
  test('output starts with http', () => {
    expect(getPageUrl('signup.html').startsWith('http')).toBe(true);
  });
  test('each page name produces a different URL', () => {
    expect(getPageUrl('login.html')).not.toBe(getPageUrl('signup.html'));
  });
  test('page name appears at end of returned URL', () => {
    const url = getPageUrl('dashboard.html');
    expect(url.endsWith('dashboard.html')).toBe(true);
  });
});

// ─── getUserInitials ──────────────────────────────────────────────────────────

describe('getUserInitials', () => {
  test('full name returns first + last initials', () => { expect(getUserInitials('John Doe')).toBe('JD'); });
  test('single word returns first two uppercase chars', () => { expect(getUserInitials('Alice')).toBe('AL'); });
  test('three-word name uses first and last word', () => { expect(getUserInitials('Mary Jane Watson')).toBe('MW'); });
  test('empty string returns ?', () => { expect(getUserInitials('')).toBe('?'); });
  test('undefined returns ?', () => { expect(getUserInitials()).toBe('?'); });
});

// ─── signUp ───────────────────────────────────────────────────────────────────

describe('signUp', () => {
  test('returns success with requiresEmailVerification true when no session', async () => {
    initializeSupabase(mkSb());
    const r = await signUp({ fullName: 'Alice', email: 'a@uni.ac.za', password: 'pass1234', accountType: 'buyer', userRole: 'student' });
    expect(r.success).toBe(true);
    expect(r.requiresEmailVerification).toBe(true);
  });

  test('requiresEmailVerification is false when session returned immediately', async () => {
    const signUpFn = jest.fn().mockResolvedValue({
      data: { session: { access_token: 't' }, user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    });
    initializeSupabase(mkSb({ signUp: signUpFn }));
    const r = await signUp({ fullName: 'A', email: 'a@b.com', password: 'pass1234', accountType: 'buyer' });
    expect(r.requiresEmailVerification).toBe(false);
  });

  test('returns error string on Supabase failure', async () => {
    initializeSupabase(mkSb({ signUp: jest.fn().mockResolvedValue({ data: null, error: { message: 'Email already in use' } }) }));
    const r = await signUp({ fullName: 'A', email: 'a@b.com', password: 'pass1234', accountType: 'buyer' });
    expect(typeof r.error).toBe('string');
  });

  test('sanitizes invalid userRole to student', async () => {
    const sb = mkSb();
    initializeSupabase(sb);
    await signUp({ fullName: 'A', email: 'a@b.com', password: 'pass1234', accountType: 'buyer', userRole: 'superadmin' });
    expect(sb.createClient().auth.signUp.mock.calls[0][0].options.data.user_role).toBe('student');
  });

  test('allows staff userRole', async () => {
    const sb = mkSb();
    initializeSupabase(sb);
    await signUp({ fullName: 'B', email: 'b@b.com', password: 'pass1234', accountType: 'buyer', userRole: 'staff' });
    expect(sb.createClient().auth.signUp.mock.calls[0][0].options.data.user_role).toBe('staff');
  });

  test('forces accountType to buyer for staff role', async () => {
    const sb = mkSb();
    initializeSupabase(sb);
    await signUp({ fullName: 'B', email: 'b@b.com', password: 'pass1234', accountType: 'seller', userRole: 'staff' });
    expect(sb.createClient().auth.signUp.mock.calls[0][0].options.data.account_type).toBe('buyer');
  });

  test('strips Supabase-specific wording from error messages', async () => {
    initializeSupabase(mkSb({ signUp: jest.fn().mockResolvedValue({ data: null, error: { message: 'supabase: row-level security violated' } }) }));
    const r = await signUp({ fullName: 'A', email: 'a@b.com', password: 'pass1234', accountType: 'buyer' });
    expect(r.error).not.toMatch(/supabase/i);
  });
});

// ─── resendSignupOTP ──────────────────────────────────────────────────────────

describe('resendSignupOTP', () => {
  test('returns success when resend call succeeds', async () => {
    initializeSupabase(mkSb());
    expect((await resendSignupOTP('u@uni.ac.za')).success).toBe(true);
  });
  test('returns error when resend call fails', async () => {
    initializeSupabase(mkSb({ resend: jest.fn().mockResolvedValue({ error: { message: 'rate limit' } }) }));
    expect((await resendSignupOTP('u@uni.ac.za')).error).toBeDefined();
  });
});

// ─── signIn ───────────────────────────────────────────────────────────────────

describe('signIn', () => {
  test('returns user profile on successful sign-in', async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: PROFILE_ROW, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    });
    initializeSupabase(mkSb({ signInWithPassword: jest.fn().mockResolvedValue({ data: { user: MOCK_USER }, error: null }) }, from));
    const r = await signIn({ email: 't@uni.ac.za', password: 'pass1234' });
    expect(r.success).toBe(true);
    expect(r.user).toBeDefined();
  });

  test('returns error on wrong credentials', async () => {
    initializeSupabase(mkSb({ signInWithPassword: jest.fn().mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } }) }));
    const r = await signIn({ email: 'x@x.com', password: 'bad' });
    expect(r.error).toBeDefined();
    expect(r.success).toBeUndefined();
  });
});

// ─── signInWithGoogle ─────────────────────────────────────────────────────────

describe('signInWithGoogle', () => {
  test('returns success when OAuth initiates without error', async () => {
    initializeSupabase(mkSb());
    expect((await signInWithGoogle()).success).toBe(true);
  });

  test('passes custom redirectTo through to Supabase when provided', async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({ error: null });
    initializeSupabase(mkSb({ signInWithOAuth }));
    await signInWithGoogle({ redirectTo: 'https://myapp.com/cb' });
    expect(signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe('https://myapp.com/cb');
  });

  test('uses google as the OAuth provider', async () => {
    const signInWithOAuth = jest.fn().mockResolvedValue({ error: null });
    initializeSupabase(mkSb({ signInWithOAuth }));
    await signInWithGoogle();
    expect(signInWithOAuth.mock.calls[0][0].provider).toBe('google');
  });

  test('returns error when Supabase OAuth call fails', async () => {
    initializeSupabase(mkSb({ signInWithOAuth: jest.fn().mockResolvedValue({ error: { message: 'Provider error' } }) }));
    expect((await signInWithGoogle()).error).toBeDefined();
  });
});

// ─── handleOAuthCallback ──────────────────────────────────────────────────────

describe('handleOAuthCallback', () => {
  test('returns error when getSession finds no session', async () => {
    initializeSupabase(mkSb());
    expect((await handleOAuthCallback()).error).toBeDefined();
  });

  test('returns user when session and DB profile both exist', async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: PROFILE_ROW, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    });
    initializeSupabase(mkSb({ getSession: jest.fn().mockResolvedValue({ data: { session: { user: MOCK_USER } }, error: null }) }, from));
    const r = await handleOAuthCallback();
    expect(r.success).toBe(true);
    expect(r.user).toBeDefined();
  });
});

// ─── verifyOTP ────────────────────────────────────────────────────────────────

describe('verifyOTP', () => {
  test('returns success on valid OTP token', async () => {
    initializeSupabase(mkSb());
    expect((await verifyOTP('t@uni.ac.za', '123456')).success).toBe(true);
  });

  test('returns error on expired/invalid token', async () => {
    initializeSupabase(mkSb({ verifyOtp: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'expired' } }) }));
    expect((await verifyOTP('t@uni.ac.za', 'bad')).error).toBeDefined();
  });

  test('upserts user profile row when verifyOtp returns a user', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ upsert });
    const verifyOtp = jest.fn().mockResolvedValue({
      data: { user: { id: 'u2', email: 'v@uni.ac.za', user_metadata: { full_name: 'V', account_type: 'buyer', user_role: 'student' } } },
      error: null,
    });
    initializeSupabase(mkSb({ verifyOtp }, from));
    await verifyOTP('v@uni.ac.za', '654321');
    expect(upsert).toHaveBeenCalled();
  });
});

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  // window.location.replace is stubbed globally in tests/setup.js
  // to prevent jsdom "Not implemented: navigation" errors in CI

  test('returns null when no session (redirect is triggered)', async () => {
    initializeSupabase(mkSb());
    expect(await requireAuth()).toBeNull();
  });

  test('returns profile object when authenticated session exists', async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: PROFILE_ROW, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    });
    initializeSupabase(mkSb({ getSession: jest.fn().mockResolvedValue({ data: { session: { user: MOCK_USER } }, error: null }) }, from));
    const result = await requireAuth();
    expect(result.id).toBe('u1');
  });
});

// ─── getUser ──────────────────────────────────────────────────────────────────

describe('getUser', () => {
  test('returns null when no active session', async () => {
    initializeSupabase(mkSb());
    expect(await getUser()).toBeNull();
  });

  test('returns user profile when session exists', async () => {
    const profileRow = { ...PROFILE_ROW, id: 'u3', email: 'gu@uni.ac.za', account_type: 'seller' };
    const authUser = { id: 'u3', email: 'gu@uni.ac.za', user_metadata: { full_name: 'GU', account_type: 'seller', user_role: 'student' } };
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: profileRow, error: null }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    });
    initializeSupabase(mkSb({ getSession: jest.fn().mockResolvedValue({ data: { session: { user: authUser } }, error: null }) }, from));
    const user = await getUser();
    expect(user.id).toBe('u3');
    expect(user.accountType).toBe('seller');
  });
});

// ─── updateProfile ────────────────────────────────────────────────────────────

describe('updateProfile', () => {
  test('returns success when DB and auth both update successfully', async () => {
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) });
    initializeSupabase(mkSb({}, from));
    expect((await updateProfile({ id: 'u1', fullName: 'New', email: 'n@uni.ac.za', accountType: 'buyer', username: 'newuser' })).success).toBe(true);
  });

  test('returns error when DB update fails', async () => {
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: { message: 'DB err' } }) });
    initializeSupabase(mkSb({}, from));
    expect((await updateProfile({ id: 'u1', fullName: 'A', email: 'a@b.com', accountType: 'buyer' })).error).toBeDefined();
  });

  test('returns error when auth.updateUser fails', async () => {
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) });
    initializeSupabase(mkSb({ updateUser: jest.fn().mockResolvedValue({ error: { message: 'auth err' } }) }, from));
    expect((await updateProfile({ id: 'u1', fullName: 'A', email: 'a@b.com', accountType: 'buyer' })).error).toBeDefined();
  });

  test('sanitizes invalid accountType to buyer before sending to Supabase', async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) });
    initializeSupabase(mkSb({ updateUser }, from));
    await updateProfile({ id: 'u1', fullName: 'A', email: 'a@b.com', accountType: 'badtype' });
    expect(updateUser.mock.calls[0][0].data.account_type).toBe('buyer');
  });

  test('normalizes username to lowercase alphanumeric only', async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) });
    initializeSupabase(mkSb({ updateUser }, from));
    await updateProfile({ id: 'u1', fullName: 'A', email: 'a@b.com', accountType: 'buyer', username: 'My User!' });
    expect(updateUser.mock.calls[0][0].data.username).toBe('myuser');
  });
});

// ─── updateCampusInfo ─────────────────────────────────────────────────────────

describe('updateCampusInfo', () => {
  test('returns success on valid campus info update', async () => {
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) });
    initializeSupabase(mkSb({}, from));
    expect((await updateCampusInfo({ id: 'u1', university: 'Wits', campus: 'East', studentNumber: '1234567' })).success).toBe(true);
  });

  test('returns error when DB update fails', async () => {
    const from = jest.fn().mockReturnValue({ update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: { message: 'fail' } }) });
    initializeSupabase(mkSb({}, from));
    expect((await updateCampusInfo({ id: 'u1', university: 'Wits', campus: 'Main', studentNumber: '1234567' })).error).toBeDefined();
  });
});

// ─── updatePassword ───────────────────────────────────────────────────────────

describe('updatePassword', () => {
  test('returns specific error message when current password is wrong', async () => {
    initializeSupabase(mkSb({ signInWithPassword: jest.fn().mockResolvedValue({ error: { message: 'wrong' } }) }));
    expect((await updatePassword({ currentPassword: 'bad', newPassword: 'new12345', email: 'a@b.com' })).error).toBe('Incorrect current password.');
  });

  test('returns success when current password is correct and new password update works', async () => {
    initializeSupabase(mkSb({ signInWithPassword: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }) }));
    expect((await updatePassword({ currentPassword: 'correct', newPassword: 'new12345', email: 'a@b.com' })).success).toBe(true);
  });

  test('returns error when auth.updateUser fails during password change', async () => {
    initializeSupabase(mkSb({
      signInWithPassword: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
      updateUser: jest.fn().mockResolvedValue({ error: { message: 'too weak' } }),
    }));
    expect((await updatePassword({ currentPassword: 'correct', newPassword: 'weak', email: 'a@b.com' })).error).toBeDefined();
  });
});

// ─── requestPasswordReset ─────────────────────────────────────────────────────

describe('requestPasswordReset', () => {
  test('returns success on valid reset request', async () => {
    initializeSupabase(mkSb());
    expect((await requestPasswordReset({ email: 'r@uni.ac.za', redirectTo: 'https://app.com/reset' })).success).toBe(true);
  });

  test('returns error when Supabase reset email fails', async () => {
    initializeSupabase(mkSb({ resetPasswordForEmail: jest.fn().mockResolvedValue({ error: { message: 'not found' } }) }));
    expect((await requestPasswordReset({ email: 'nobody@uni.ac.za', redirectTo: 'https://app.com/reset' })).error).toBeDefined();
  });
});

// ─── completePasswordRecovery ─────────────────────────────────────────────────

describe('completePasswordRecovery', () => {
  test('returns error when no recovery session can be established', async () => {
    // With no session and no tokens in URL params, recovery cannot proceed
    initializeSupabase(mkSb());
    expect((await completePasswordRecovery({ newPassword: 'newpass123' })).error).toBeDefined();
  });

  test('returns success when active session exists and updateUser succeeds', async () => {
    initializeSupabase(mkSb({ getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null }) }));
    expect((await completePasswordRecovery({ newPassword: 'mynewpass123' })).success).toBe(true);
  });
});

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
let _sb;
export function initializeSupabase(supabaseLib) {
  _sb = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}

// Get Supabase client
export function getSupabaseClient() {
  return _sb;
}

function _userFacingError(error, fallback = 'Something went wrong. Please try again.') {
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

async function _edgeFunctionErrorMessage(error, fallback = 'Online checkout could not be started.') {
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
  const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo });
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

function toUser(row = {}) {
  return {
    id: row.id,
    email: row.email || '',
    fullName: row.full_name || row.fullName || row.email || 'UniMart User',
    accountType: row.account_type || row.accountType || 'buyer',
    userRole: row.user_role || row.userRole || 'student',
    username: row.username || null,
    university: row.university || null,
    campus: row.uni_campus || row.campus || null,
    studentNumber: row.student_number || row.studentNumber || null,
  };
}

function toListing(row = {}) {
  const seller = row.users || row.seller || row.user || {};
  const listingType = ['sale', 'trade', 'both'].includes(row.listing_type || row.listingType)
    ? (row.listing_type || row.listingType)
    : (row.is_tradeable ?? row.isTradeable ? 'both' : 'sale');
  return {
    id: row.listing_id || row.id,
    sellerId: row.seller_id || row.sellerId,
    title: row.title || '',
    description: row.description || '',
    price: Number(row.price) || 0,
    category: row.category || 'Other',
    condition: row.condition || 'Used',
    listingType,
    isTradeable: listingType === 'trade' || listingType === 'both',
    status: row.status || 'active',
    imageUrl: row.image_url || row.imageUrl || '',
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    sellerDisplayName: seller.username || seller.full_name || seller.email || row.seller_display_name || null,
    sellerRatingAverage: row.seller_rating_average === undefined ? null : Number(row.seller_rating_average),
    sellerReviewCount: Number(row.seller_review_count) || 0,
  };
}

function listingPayload(payload = {}) {
  const listingType = ['sale', 'trade', 'both'].includes(payload.listingType)
    ? payload.listingType
    : (payload.isTradeable ? 'both' : 'sale');
  return {
    seller_id: payload.sellerId,
    title: payload.title,
    description: payload.description || null,
    price: Number(payload.price) || 0,
    category: payload.category || 'Other',
    condition: payload.condition || 'Used',
    listing_type: listingType,
    is_tradeable: listingType === 'trade' || listingType === 'both',
    status: payload.status || 'active',
    image_url: payload.imageUrl || null,
  };
}

function legacyListingPayload(payload = {}) {
  const { listing_type, ...values } = listingPayload(payload);
  return values;
}

function isMissingListingTypeError(error) {
  return /listing_type/i.test(error?.message || '');
}

async function tryListingSelect(baseSelect) {
  let query = _sb.from('listings').select(`${baseSelect}, users:seller_id(full_name,email,username)`);
  let { data, error } = await query;
  if (!error) return { data, error };
  return _sb.from('listings').select(baseSelect);
}

async function updateListingById(listingId, values, sellerId) {
  let q = _sb.from('listings').update(values).eq('listing_id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  let { data, error } = await q.select().maybeSingle();
  if (!error) return { data, error };
  q = _sb.from('listings').update(values).eq('id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  return q.select().maybeSingle();
}

async function deleteListingById(listingId, sellerId) {
  let q = _sb.from('listings').delete().eq('listing_id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  let { error } = await q;
  if (!error) return { error };
  q = _sb.from('listings').delete().eq('id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  return q;
}

export async function getMarketplaceListings() {
  const { data, error } = await _sb
    .from('listings')
    .select('*, users:seller_id(full_name,email,username)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await _sb.from('listings').select('*').eq('status', 'active').order('created_at', { ascending: false });
    if (fallback.error) return { error: _userFacingError(fallback.error) };
    return { listings: await attachSellerRatings((fallback.data || []).map(toListing)) };
  }
  return { listings: await attachSellerRatings((data || []).map(toListing)) };
}

export async function getSavedListingIds(userId) {
  if (!userId) return { listingIds: [] };
  const { data, error } = await _sb
    .from('saved_listings')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) return { error: _userFacingError(error), listingIds: [] };
  return { listingIds: (data || []).map(row => row.listing_id).filter(Boolean) };
}

export async function saveListing({ userId, listingId } = {}) {
  if (!userId || !listingId) return { error: 'Choose a listing to save.' };
  const { error } = await _sb
    .from('saved_listings')
    .upsert({ user_id: userId, listing_id: listingId }, { onConflict: 'user_id,listing_id' });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function unsaveListing({ userId, listingId } = {}) {
  if (!userId || !listingId) return { error: 'Choose a listing to remove.' };
  const { error } = await _sb
    .from('saved_listings')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function getMyListings(sellerId) {
  const { data, error } = await _sb
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) return { error: _userFacingError(error) };
  return { listings: (data || []).map(toListing) };
}

export async function createListing(payload) {
  let { data, error } = await _sb
    .from('listings')
    .insert(listingPayload(payload))
    .select()
    .single();
  if (isMissingListingTypeError(error)) {
    ({ data, error } = await _sb
      .from('listings')
      .insert(legacyListingPayload(payload))
      .select()
      .single());
  }
  if (error) return { error: _userFacingError(error) };
  return { success: true, listing: toListing(data) };
}

export async function updateListing(payload) {
  let { data, error } = await updateListingById(payload.listingId, listingPayload(payload), payload.sellerId);
  if (isMissingListingTypeError(error)) {
    ({ data, error } = await updateListingById(payload.listingId, legacyListingPayload(payload), payload.sellerId));
  }
  if (error) return { error: _userFacingError(error) };
  return { success: true, listing: toListing(data) };
}

export async function deleteListing({ listingId, sellerId }) {
  const { error } = await deleteListingById(listingId, sellerId);
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function uploadListingImage(file, userId) {
  if (!file) return { imageUrl: '' };
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await _sb.storage.from(LISTING_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return { error: _userFacingError(error) };
  const { data } = _sb.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);
  return { imageUrl: data.publicUrl };
}

export async function getListingDashboard(sellerId) {
  const result = await getMyListings(sellerId);
  if (result.error) return result;
  const listings = result.listings || [];
  const active = listings.filter(item => item.status === 'active');
  const sold = listings.filter(item => item.status === 'sold');
  const now = new Date();
  const thisMonth = listings.filter(item => {
    const d = new Date(item.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const categoryMap = listings.reduce((map, item) => {
    map[item.category] = (map[item.category] || 0) + 1;
    return map;
  }, {});

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const value = listings.filter(item => {
      const created = new Date(item.createdAt);
      return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
    }).length;
    return { label: d.toLocaleDateString('en-ZA', { month: 'short' }), value };
  });

  return {
    metrics: {
      activeListings: active.length,
      soldListings: sold.length,
      activeValue: active.reduce((sum, item) => sum + item.price, 0),
      thisMonth,
    },
    categories: Object.entries(categoryMap).map(([label, value]) => ({ label, value })),
    monthly,
    recent: listings.slice(0, 6),
  };
}

export async function startConversation({ listingId, buyerId, initialMessage }) {
  const listingsResult = await _sb.from('listings').select('*').eq('listing_id', listingId).maybeSingle();
  let listing = listingsResult.data;
  if (listingsResult.error || !listing) {
    const fallback = await _sb.from('listings').select('*').eq('id', listingId).maybeSingle();
    listing = fallback.data;
    if (fallback.error || !listing) return { error: (fallback.error || listingsResult.error)?.message || 'Listing not found.' };
  }

  const sellerId = listing.seller_id;
  if (!sellerId || sellerId === buyerId) return { error: 'You cannot message yourself about your own listing.' };

  let { data: conversation, error: findErr } = await _sb
    .from('conversations')
    .select('*')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (findErr) return { error: _userFacingError(findErr) };

  if (!conversation) {
    const inserted = await _sb
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, status: 'open', last_message_at: new Date().toISOString() })
      .select()
      .single();
    if (inserted.error) return { error: _userFacingError(inserted.error) };
    conversation = inserted.data;
  }

  const sent = await sendMessage({ conversationId: _conversationId(conversation), senderId: buyerId, body: initialMessage });
  if (sent.error) return sent;
  return { success: true, conversation: { ...conversation, id: _conversationId(conversation) } };
}

function _parseOfferAmount(text = '') {
  const match = String(text).match(/(?:r|zar)?\s*(\d[\d\s,]*(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/[\s,]/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

function toOffer(row = {}) {
  return {
    id: row.offer_id || row.id,
    conversationId: row.conversation_id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    offerType: row.offer_type || 'purchase',
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    note: row.note || '',
    status: row.status || 'pending',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTransaction(row = {}) {
  const amount = row.amount === null || row.amount === undefined ? null : Number(row.amount);
  const onlinePaidAmount = Number(row.online_paid_amount || 0);
  const cashDueAmount = Number(row.cash_due_amount || Math.max(0, (amount || 0) - onlinePaidAmount));
  return {
    id: row.transaction_id || row.id,
    offerId: row.offer_id,
    conversationId: row.conversation_id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    amount,
    status: row.status || 'accepted',
    paymentStatus: row.payment_status || (amount ? 'unpaid' : 'not_required'),
    onlinePaidAmount,
    cashDueAmount,
    cashSettledAt: row.cash_settled_at || null,
    cashSettledBy: row.cash_settled_by || null,
    paymentGateway: row.payment_gateway || null,
    paymentReference: row.payment_reference || null,
    facilityBookingId: row.facility_booking_id || null,
    facilityBooking: row.facilityBooking || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toReview(row = {}) {
  return {
    id: row.review_id || row.id,
    transactionId: row.transaction_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    listingId: row.listing_id,
    rating: Number(row.rating) || 0,
    body: row.body || '',
    status: row.status || 'visible',
    createdAt: row.created_at,
  };
}

function toContentReport(row = {}) {
  return {
    id: row.report_id || row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type || row.targetType || 'listing',
    targetId: row.target_id || row.targetId,
    listingId: row.listing_id || row.listingId || (row.target_type === 'listing' ? row.target_id : null),
    reason: row.reason || '',
    status: row.status || 'open',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reporterName: row.reporterName || row.reporter_name || null,
    targetTitle: row.targetTitle || row.target_title || null,
    targetSnippet: row.targetSnippet || row.target_snippet || null,
    targetStatus: row.targetStatus || row.target_status || null,
  };
}

function toModerationAction(row = {}) {
  return {
    id: row.action_id || row.id,
    adminId: row.admin_id,
    action: row.action || '',
    targetType: row.target_type || '',
    targetId: row.target_id,
    note: row.note || '',
    createdAt: row.created_at,
    adminName: row.adminName || row.admin_name || null,
  };
}

async function attachSellerRatings(listings) {
  const sellerIds = [...new Set((listings || []).map(listing => listing.sellerId).filter(Boolean))];
  if (!sellerIds.length) return listings || [];

  const { data, error } = await _sb
    .from('reviews')
    .select('reviewee_id,rating')
    .eq('status', 'visible')
    .in('reviewee_id', sellerIds);
  if (error) return listings || [];

  const totals = (data || []).reduce((map, row) => {
    const key = row.reviewee_id;
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(row.rating) || 0;
    map[key].count += 1;
    return map;
  }, {});

  return (listings || []).map(listing => {
    const rating = totals[listing.sellerId];
    if (!rating) return listing;
    return {
      ...listing,
      sellerRatingAverage: rating.total / rating.count,
      sellerReviewCount: rating.count,
    };
  });
}

async function _getConversationById(conversationId) {
  let result = await _sb
    .from('conversations')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (result.error && /conversation_id/i.test(result.error.message || '')) {
    result = await _sb
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
  }

  return result;
}

export async function startOffer({ listingId, buyerId, offerText, messageText = '' }) {
  const cleanMessage = String(messageText || '').trim();
  const cleanOffer = String(offerText || '').trim();
  const initialMessage = cleanMessage ? `${cleanMessage}\n\nOffer: ${cleanOffer}` : `Offer: ${cleanOffer}`;
  const conversationResult = await startConversation({
    listingId,
    buyerId,
    initialMessage,
  });
  if (conversationResult.error) return conversationResult;

  const conversation = conversationResult.conversation;
  const conversationId = _conversationId(conversation);
  const amount = _parseOfferAmount(cleanOffer);
  const offerType = amount === null ? 'trade' : 'purchase';

  const { data, error } = await _sb
    .from('offers')
    .insert({
      conversation_id: conversationId,
      listing_id: conversation.listing_id,
      buyer_id: conversation.buyer_id,
      seller_id: conversation.seller_id,
      offer_type: offerType,
      amount,
      note: cleanOffer,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { error: _userFacingError(error) };
  return { success: true, conversation: { ...conversation, id: conversationId }, offer: toOffer(data) };
}

function _uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function _conversationId(row = {}) {
  return row.conversation_id || row.id;
}

function _offerId(row = {}) {
  return row.offer_id || row.id;
}

function _seenOfferNotificationKey(userId) {
  return `unimart_seen_offer_notifications:${userId}`;
}

function _getSeenOfferNotificationIds(userId) {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(_seenOfferNotificationKey(userId)) || '[]'));
  } catch (_err) {
    return new Set();
  }
}

function _markOfferNotificationsSeen(userId, offers = []) {
  if (typeof localStorage === 'undefined' || !userId || !offers.length) return;
  const seen = _getSeenOfferNotificationIds(userId);
  offers.map(_offerId).filter(Boolean).forEach(id => seen.add(id));
  localStorage.setItem(_seenOfferNotificationKey(userId), JSON.stringify([...seen].slice(-250)));
}

function _conversationReadWatermarkKey(userId) {
  return `unimart_conversation_read_at:${userId}`;
}

function _getConversationReadWatermarks(userId) {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(_conversationReadWatermarkKey(userId)) || '{}') || {};
  } catch (_err) {
    return {};
  }
}

function _markConversationReadLocally(userId, conversationId, timestamp = new Date().toISOString()) {
  if (typeof localStorage === 'undefined' || !userId || !conversationId) return;
  const watermarks = _getConversationReadWatermarks(userId);
  watermarks[conversationId] = timestamp;
  localStorage.setItem(_conversationReadWatermarkKey(userId), JSON.stringify(watermarks));
}

function _afterLatestTimestamp(rows = [], fallback = new Date().toISOString()) {
  const latest = rows
    .map(row => new Date(row?.created_at || row?.createdAt || 0).getTime())
    .filter(value => Number.isFinite(value) && value > 0)
    .reduce((max, value) => Math.max(max, value), 0);
  return new Date((latest || new Date(fallback).getTime()) + 1).toISOString();
}

function _isAfterLocalRead(userId, conversationId, createdAt) {
  const readAt = _getConversationReadWatermarks(userId)[conversationId];
  if (!readAt || !createdAt) return true;
  return new Date(createdAt).getTime() > new Date(readAt).getTime();
}

async function _updateConversationTimestamp(conversationId, timestamp) {
  let { error } = await _sb
    .from('conversations')
    .update({ last_message_at: timestamp })
    .eq('conversation_id', conversationId);

  if (error && /conversation_id/i.test(error.message || '')) {
    const fallback = await _sb
      .from('conversations')
      .update({ last_message_at: timestamp })
      .eq('id', conversationId);
    error = fallback.error;
  }

  if (error) console.warn('Failed to update conversation timestamp:', error.message);
}

async function _fetchUsersByIds(userIds = []) {
  const ids = _uniqueValues(userIds);
  if (!ids.length) return {};

  const { data, error } = await _sb
    .from('users')
    .select('id,full_name,email,username')
    .in('id', ids);

  if (error) {
    console.warn('Failed to hydrate conversation users:', error.message);
    return {};
  }

  return Object.fromEntries((data || []).map(user => [user.id, user]));
}

async function _fetchListingsByIds(listingIds = []) {
  const ids = _uniqueValues(listingIds);
  if (!ids.length) return {};

  let { data, error } = await _sb
    .from('listings')
    .select('listing_id,title,image_url')
    .in('listing_id', ids);

  if (error) {
    const fallback = await _sb
      .from('listings')
      .select('id,title,image_url')
      .in('id', ids);
    data = fallback.data || [];
    error = fallback.error;
  }

  if (error) {
    console.warn('Failed to hydrate conversation listings:', error.message);
    return {};
  }

  return Object.fromEntries((data || []).map(listing => [listing.listing_id || listing.id, listing]));
}

async function _countUnreadMessagesForConversation(conversationId, currentUserId) {
  const id = String(conversationId || '');
  const readAt = _getConversationReadWatermarks(currentUserId)[id];
  const countUnread = async column => {
    let query = _sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq(column, id)
      .neq('sender_id', currentUserId)
      .is('read_at', null);
    if (readAt) query = query.gt('created_at', readAt);
    return query;
  };

  let result = await countUnread('conversation_id');
  if ((result.error && /invalid input syntax|uuid/i.test(result.error.message || '')) || result.count === 0) {
    const fallback = await countUnread('id');
    if (!fallback.error && Number(fallback.count || 0) > 0) result = fallback;
  }
  return Number(result.count || 0);
}

function toConversation(row = {}, currentUserId) {
  const listing = row.listings || row.listing || {};
  const buyer = row.buyer || {};
  const seller = row.seller || {};
  const isBuyer = row.buyer_id === currentUserId;
  const other = isBuyer ? seller : buyer;
  return {
    id: _conversationId(row),
    listingId: row.listing_id,
    listingTitle: listing.title || row.listing_title || 'Listing',
    listingImageUrl: listing.image_url || listing.imageUrl || '',
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    otherUserId: isBuyer ? row.seller_id : row.buyer_id,
    otherDisplayName: other.full_name || other.username || other.email || null,
    role: isBuyer ? 'buyer' : 'seller',
    status: row.status || 'open',
    lastMessageAt: row.last_message_at || row.created_at,
    unreadCount: Number(row.unread_count || 0),
  };
}

async function _hydrateConversations(rows = [], currentUserId) {
  const [usersById, listingsById] = await Promise.all([
    _fetchUsersByIds(rows.flatMap(row => [row.buyer_id, row.seller_id])),
    _fetchListingsByIds(rows.map(row => row.listing_id)),
  ]);

  return Promise.all(rows.map(async row => {
    const unreadCount = await _countUnreadMessagesForConversation(_conversationId(row), currentUserId);

    return toConversation({
      ...row,
      listing: listingsById[row.listing_id] || {},
      buyer: usersById[row.buyer_id] || {},
      seller: usersById[row.seller_id] || {},
      unread_count: unreadCount,
    }, currentUserId);
  }));
}

export async function getConversations(userId) {
  const { data, error } = await _sb
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) return { error: _userFacingError(error) };

  const conversations = await _hydrateConversations(data || [], userId);
  return { conversations };
}

export async function getUnreadMessageNotifications(userId) {
  const { data: conversationRows, error: conversationError } = await _sb
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (conversationError) return { error: _userFacingError(conversationError), total: 0, notifications: [] };

  const conversations = conversationRows || [];
  const conversationIds = _uniqueValues(conversations.map(row => _conversationId(row)));
  if (!conversationIds.length) return { total: 0, notifications: [] };

  const { data: unreadRows, error: unreadError } = await _sb
    .from('messages')
    .select('id,conversation_id,sender_id,body,created_at,read_at')
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: pendingOfferRows, error: offerError } = await _sb
    .from('offers')
    .select('*')
    .eq('seller_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: buyerActionRows, error: buyerActionError } = await _sb
    .from('offers')
    .select('*')
    .eq('buyer_id', userId)
    .in('status', ['accepted', 'declined'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (unreadError && offerError && buyerActionError) return { error: _userFacingError(unreadError), total: 0, notifications: [] };
  if (unreadError) console.warn('Falling back to offer notifications only:', unreadError.message);
  if (offerError) console.warn('Unable to load offer notifications:', offerError.message);
  if (buyerActionError) console.warn('Unable to load buyer action notifications:', buyerActionError.message);

  const unreadByConversation = new Map();
  (unreadRows || []).filter(message => _isAfterLocalRead(userId, message.conversation_id, message.created_at)).forEach(message => {
    const id = message.conversation_id;
    if (!unreadByConversation.has(id)) unreadByConversation.set(id, []);
    unreadByConversation.get(id).push(message);
  });

  const pendingOffersByConversation = new Map();
  const seenOfferIds = _getSeenOfferNotificationIds(userId);
  (pendingOfferRows || [])
    .filter(offer => !seenOfferIds.has(_offerId(offer)))
    .filter(offer => _isAfterLocalRead(userId, offer.conversation_id, offer.created_at))
    .forEach(offer => {
    if (!pendingOffersByConversation.has(offer.conversation_id)) pendingOffersByConversation.set(offer.conversation_id, []);
    pendingOffersByConversation.get(offer.conversation_id).push(offer);
  });

  const buyerActionsByConversation = new Map();
  (buyerActionRows || [])
    .filter(offer => _isAfterLocalRead(userId, offer.conversation_id, offer.responded_at || offer.updated_at || offer.created_at))
    .forEach(offer => {
      if (!buyerActionsByConversation.has(offer.conversation_id)) buyerActionsByConversation.set(offer.conversation_id, []);
      buyerActionsByConversation.get(offer.conversation_id).push(offer);
    });

  if (!unreadByConversation.size && !pendingOffersByConversation.size && !buyerActionsByConversation.size) return { total: 0, notifications: [] };

  const [usersById, listingsById] = await Promise.all([
    _fetchUsersByIds(conversations.flatMap(row => [row.buyer_id, row.seller_id])),
    _fetchListingsByIds(conversations.map(row => row.listing_id)),
  ]);

  const notifications = conversations
    .map(row => {
      const conversationId = _conversationId(row);
      const unreadMessages = unreadByConversation.get(conversationId) || [];
      const pendingOffers = pendingOffersByConversation.get(conversationId) || [];
      const buyerActions = buyerActionsByConversation.get(conversationId) || [];
      if (!unreadMessages.length && !pendingOffers.length && !buyerActions.length) return null;

      const conversation = toConversation({
        ...row,
        listing: listingsById[row.listing_id] || {},
        buyer: usersById[row.buyer_id] || {},
        seller: usersById[row.seller_id] || {},
        unread_count: unreadMessages.length || pendingOffers.length || buyerActions.length,
      }, userId);

      const newestOffer = pendingOffers[0];
      const newestMessage = unreadMessages[0];
      const newestBuyerAction = buyerActions[0];
      const newestActionAt = new Date(newestBuyerAction?.responded_at || newestBuyerAction?.updated_at || newestBuyerAction?.created_at || 0);
      const hasNewerAction = newestBuyerAction && (!newestMessage || newestActionAt >= new Date(newestMessage.created_at || 0));
      const hasNewerOffer = newestOffer && (!newestMessage || new Date(newestOffer.created_at || 0) >= new Date(newestMessage.created_at || 0)) && (!newestBuyerAction || new Date(newestOffer.created_at || 0) >= newestActionAt);
      const offerAmount = newestOffer?.amount ? `R ${Number(newestOffer.amount).toLocaleString('en-ZA')}` : 'a trade';

      return {
        ...conversation,
        notificationKind: hasNewerOffer ? 'offer' : hasNewerAction ? 'offer-response' : 'message',
        preview: hasNewerOffer
          ? `New offer: ${offerAmount}`
          : hasNewerAction
            ? `Offer ${newestBuyerAction.status}`
            : newestMessage?.body || '',
        lastMessageAt: (hasNewerOffer ? newestOffer?.created_at : hasNewerAction ? (newestBuyerAction.responded_at || newestBuyerAction.updated_at) : newestMessage?.created_at) || conversation.lastMessageAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  return {
    total: notifications.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    notifications,
  };
}

export async function getConversationMessages({ conversationId, userId, markRead = false }) {
  let convResult = await _getConversationById(conversationId);

  if (convResult.error) return { error: _userFacingError(convResult.error) };
  const conversationRow = convResult.data;
  if (!conversationRow || ![conversationRow.buyer_id, conversationRow.seller_id].includes(userId)) return { error: 'Conversation not found.' };

  const resolvedConversationId = _conversationId(conversationRow);

  if (markRead) {
    _markConversationReadLocally(userId, resolvedConversationId);
    await _sb
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', resolvedConversationId)
      .neq('sender_id', userId)
      .is('read_at', null);
  }

  const { data, error } = await _sb
    .from('messages')
    .select('*')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: true });

  if (error) return { error: _userFacingError(error) };

  const offersResult = await _sb
    .from('offers')
    .select('*')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: false });

  if (markRead && !offersResult.error) {
    _markOfferNotificationsSeen(userId, offersResult.data || []);
    _markConversationReadLocally(userId, resolvedConversationId, _afterLatestTimestamp([
      ...(data || []),
      ...(offersResult.data || []),
    ]));
  }

  const transactionsResult = await _sb
    .from('transactions')
    .select('*')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: false });

  let transactions = transactionsResult.error ? [] : (transactionsResult.data || []).map(toTransaction);
  let transactionIds = transactions.map(transaction => transaction.id).filter(Boolean);
  const bookingIds = transactions.map(transaction => transaction.facilityBookingId).filter(Boolean);
  if (bookingIds.length || transactions.length) {
    let bookingQuery = _sb.from('facility_bookings').select('*');
    if (bookingIds.length) bookingQuery = bookingQuery.in('booking_id', bookingIds);
    else bookingQuery = bookingQuery.in('transaction_id', transactionIds);
    const bookingsResult = await bookingQuery;
    let bookingRows = bookingsResult.error ? [] : (bookingsResult.data || []);
    if (bookingIds.length && transactions.length) {
      const byTransactionResult = await _sb
        .from('facility_bookings')
        .select('*')
        .in('transaction_id', transactionIds);
      if (!byTransactionResult.error) bookingRows = [...bookingRows, ...(byTransactionResult.data || [])];
    }
    const bookingsById = new Map(bookingRows.map(row => [row.booking_id || row.id, _toFacilityBooking(row)]));
    const bookingsByTransaction = new Map(bookingRows.map(row => [row.transaction_id, _toFacilityBooking(row)]));
    transactions = transactions.map(transaction => {
      const booking = bookingsById.get(transaction.facilityBookingId) || bookingsByTransaction.get(transaction.id) || null;
      return {
        ...transaction,
        facilityBookingId: transaction.facilityBookingId || booking?.id || null,
        facilityBooking: booking,
      };
    });
  }
  transactionIds = transactions.map(transaction => transaction.id).filter(Boolean);
  const reviewsResult = transactionIds.length
    ? await _sb
        .from('reviews')
        .select('*')
        .in('transaction_id', transactionIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null };

  const [conversation] = await _hydrateConversations([conversationRow], userId);
  return {
    conversation,
    offers: offersResult.error ? [] : (offersResult.data || []).map(toOffer),
    transactions,
    reviews: reviewsResult.error ? [] : (reviewsResult.data || []).map(toReview),
    messages: (data || []).map(message => ({
      id: message.message_id || message.id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      body: message.body || message.message || message.content || '',
      createdAt: message.created_at,
      readAt: message.read_at,
    })),
  };
}

export async function updateOfferStatus({ offerId, userId, status }) {
  if (!['accepted', 'declined'].includes(status)) return { error: 'Unknown offer action.' };

  const { data: offerRow, error: offerError } = await _sb
    .from('offers')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (offerError) return { error: _userFacingError(offerError) };
  if (!offerRow) return { error: 'Offer not found.' };
  if (offerRow.seller_id !== userId) return { error: 'Only the seller can respond to this offer.' };
  if (offerRow.status !== 'pending') return { error: 'This offer has already been handled.' };

  const now = new Date().toISOString();
  const { data: updatedOffer, error: updateError } = await _sb
    .from('offers')
    .update({ status, responded_at: now, updated_at: now })
    .eq('offer_id', offerId)
    .select()
    .single();
  if (updateError) return { error: _userFacingError(updateError) };

  let transaction = null;
  if (status === 'accepted') {
    await _sb
      .from('offers')
      .update({ status: 'declined', updated_at: now })
      .eq('conversation_id', offerRow.conversation_id)
      .neq('offer_id', offerId)
      .eq('status', 'pending');

    const inserted = await _sb
      .from('transactions')
      .insert({
        offer_id: offerRow.offer_id,
        conversation_id: offerRow.conversation_id,
        listing_id: offerRow.listing_id,
        buyer_id: offerRow.buyer_id,
        seller_id: offerRow.seller_id,
        amount: offerRow.amount,
        status: 'accepted',
      })
      .select()
      .single();
    if (inserted.error) return { error: _userFacingError(inserted.error) };
    transaction = toTransaction(inserted.data);
  }

  await sendMessage({
    conversationId: offerRow.conversation_id,
    senderId: userId,
    body: status === 'accepted' ? 'Offer accepted. You can now book the trade facility handover.' : 'Offer declined.',
  });

  return { success: true, offer: toOffer(updatedOffer), transaction };
}

export async function createPaymentCheckout({ transactionId, buyerId, onlineAmount } = {}) {
  if (!transactionId || !buyerId) return { error: 'Missing payment details.' };
  const amountToPay = Math.max(0, Number(onlineAmount) || 0);

  const { data: transactionRow, error: transactionError } = await _sb
    .from('transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (transactionError) return { error: _userFacingError(transactionError) };
  if (!transactionRow) return { error: 'Transaction not found.' };

  const transaction = toTransaction(transactionRow);
  if (transaction.buyerId !== buyerId) return { error: 'Only the buyer can make this payment.' };
  const { data: offerRow, error: offerError } = await _sb
    .from('offers')
    .select('offer_id,status')
    .eq('offer_id', transaction.offerId)
    .maybeSingle();
  if (offerError) return { error: _userFacingError(offerError) };
  if (!offerRow || offerRow.status !== 'accepted') return { error: 'The seller must accept the offer before payment.' };
  if (!transaction.amount || transaction.amount <= 0) return { error: 'This trade does not need an online payment.' };
  if (amountToPay <= 0 || amountToPay > transaction.amount) return { error: 'Choose an online payment amount within the accepted offer amount.' };

  const cashDueAmount = Math.max(0, transaction.amount - amountToPay);
  const paymentStatus = cashDueAmount > 0 ? 'partial_pending' : 'pending';
  const now = new Date().toISOString();

  const { data: paymentRow, error: paymentError } = await _sb
    .from('payment_records')
    .insert({
      transaction_id: transaction.id,
      offer_id: transaction.offerId,
      buyer_id: transaction.buyerId,
      seller_id: transaction.sellerId,
      amount: amountToPay,
      cash_due_amount: cashDueAmount,
      gateway: 'paystack',
      status: 'checkout_created',
    })
    .select()
    .single();
  if (paymentError) return { error: _userFacingError(paymentError, 'Payment records are not set up yet. Run the payments SQL first.') };

  await _sb
    .from('transactions')
    .update({
      payment_status: paymentStatus,
      online_paid_amount: amountToPay,
      cash_due_amount: cashDueAmount,
      payment_gateway: 'paystack',
      payment_reference: paymentRow.payment_id || paymentRow.id,
      updated_at: now,
    })
    .eq('transaction_id', transaction.id);

  const checkoutResult = await _sb.functions.invoke('create-paystack-checkout', {
    body: {
      paymentId: paymentRow.payment_id || paymentRow.id,
      transactionId: transaction.id,
      amount: amountToPay,
      cashDueAmount,
      currency: 'ZAR',
      returnUrl: window.location.href.split('#')[0],
    },
  });

  if (checkoutResult.error) {
    const message = await _edgeFunctionErrorMessage(checkoutResult.error);
    return {
      payment: paymentRow,
      cashDueAmount,
      error: message,
    };
  }

  return {
    success: true,
    payment: checkoutResult.data?.payment || paymentRow,
    checkoutUrl: checkoutResult.data?.redirectUrl || checkoutResult.data?.checkout?.authorization_url,
    cashDueAmount,
  };
}

export async function verifyPaymentCheckout({ transactionId, reference } = {}) {
  if (!transactionId) return { error: 'Missing payment details.' };
  const result = await _sb.functions.invoke('verify-paystack-payment', {
    body: { transactionId, reference },
  });
  if (result.error) return { error: await _edgeFunctionErrorMessage(result.error, 'Payment could not be verified yet.') };
  if (result.data?.error) return { error: result.data.error };
  return { success: true, payment: result.data?.payment, transaction: result.data?.transaction };
}

export async function markTransactionCashSettled({ transactionId, staffId } = {}) {
  if (!transactionId || !staffId) return { error: 'Missing cash settlement details.' };
  const { error } = await _sb
    .from('transactions')
    .update({
      cash_due_amount: 0,
      cash_settled_at: new Date().toISOString(),
      cash_settled_by: staffId,
      updated_at: new Date().toISOString(),
    })
    .eq('transaction_id', transactionId);
  if (error) return { error: _userFacingError(error, 'Could not confirm the cash settlement.') };
  return { success: true };
}

export async function createReview({ transactionId, reviewerId, revieweeId, listingId, rating, body } = {}) {
  const cleanRating = Number(rating);
  if (!transactionId || !reviewerId || !revieweeId || !listingId) return { error: 'Missing review details.' };
  if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) return { error: 'Rating must be between 1 and 5.' };

  const { data, error } = await _sb
    .from('reviews')
    .upsert({
      transaction_id: transactionId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      listing_id: listingId,
      rating: cleanRating,
      body: body || null,
      status: 'visible',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'transaction_id,reviewer_id,reviewee_id' })
    .select()
    .single();
  if (error) return { error: _userFacingError(error) };
  return { success: true, review: toReview(data) };
}

export async function reportContent({ reporterId, targetType, targetId, listingId, reason } = {}) {
  const cleanTargetType = ['listing', 'review'].includes(targetType) ? targetType : 'listing';
  if (!reporterId || !targetId || !reason) return { error: 'Choose what you are reporting and add a reason.' };
  const { data, error } = await _sb
    .from('content_reports')
    .insert({
      reporter_id: reporterId,
      target_type: cleanTargetType,
      target_id: targetId,
      listing_id: listingId || (cleanTargetType === 'listing' ? targetId : null),
      reason,
      status: 'open',
    })
    .select()
    .single();
  if (error) return { error: _userFacingError(error) };
  return { success: true, report: toContentReport(data) };
}

export async function sendMessage({ conversationId, senderId, body }) {
  const now = new Date().toISOString();
  const { data, error } = await _sb
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body, created_at: now })
    .select()
    .single();
  if (error) return { error: _userFacingError(error) };
  await _updateConversationTimestamp(conversationId, now);
  return { success: true, message: data };
}

export async function getRolePermissions() {
  const { data, error } = await _sb.from('role_permissions').select('*');
  if (error) return { permissions: [] };
  return { permissions: data || [] };
}

export async function updateRolePermission({ role, permission, enabled }) {
  const { error } = await _sb.from('role_permissions').upsert({ role, permission, enabled }, { onConflict: 'role,permission' });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function updateUserRole({ userId, role }) {
  const { error } = await _sb.from('users').update({ user_role: role }).eq('id', userId);
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

const DEFAULT_FACILITY_CONFIG = {
  opensAt: '09:00',
  closesAt: '17:00',
  slotMinutes: 30,
  slotCapacity: 1,
  operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
};

function _normaliseOperatingDays(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return DEFAULT_FACILITY_CONFIG.operatingDays;
}

function _toFacilityConfig(row = {}) {
  return {
    opensAt: row.opens_at || row.opensAt || DEFAULT_FACILITY_CONFIG.opensAt,
    closesAt: row.closes_at || row.closesAt || DEFAULT_FACILITY_CONFIG.closesAt,
    slotMinutes: Number(row.slot_minutes || row.slotMinutes || DEFAULT_FACILITY_CONFIG.slotMinutes),
    slotCapacity: Number(row.slot_capacity || row.slotCapacity || DEFAULT_FACILITY_CONFIG.slotCapacity),
    operatingDays: _normaliseOperatingDays(row.operating_days || row.operatingDays),
  };
}

function _monthKey(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function _recentMonthKeys(monthCount = 6) {
  const now = new Date();
  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - index), 1);
    return {
      key: _monthKey(date),
      label: date.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' }),
    };
  });
}

function _timeToMinutes(value, fallback) {
  const [hours, minutes] = String(value || fallback).split(':').map(Number);
  return ((Number.isFinite(hours) ? hours : 0) * 60) + (Number.isFinite(minutes) ? minutes : 0);
}

function _countBy(items = [], getKey) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function _buildAdminAnalytics({ transactions = [], facilityRows = [], reports = [], actions = [], facilityConfig = DEFAULT_FACILITY_CONFIG } = {}) {
  const bookings = facilityRows.map(row => _toFacilityBooking(row));
  const completedTransactions = transactions.filter(transaction => transaction.status === 'completed');
  const months = _recentMonthKeys(6);
  const completedByMonth = _countBy(completedTransactions, transaction => _monthKey(transaction.updated_at || transaction.created_at));
  const completedTransactionsOverTime = months.map(month => ({
    ...month,
    count: completedByMonth[month.key] || 0,
  }));

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(now.getDate() - 29);
  const relevantBookings = bookings.filter(booking => {
    const dropoff = new Date(booking.dropoffScheduledAt);
    return Number.isFinite(dropoff.getTime()) && dropoff >= windowStart && dropoff <= now;
  });
  const operatingDays = new Set(_normaliseOperatingDays(facilityConfig.operatingDays).map(day => String(day).toLowerCase()));
  let operatingDayCount = 0;
  for (let index = 0; index < 30; index += 1) {
    const day = new Date(windowStart);
    day.setDate(windowStart.getDate() + index);
    if (operatingDays.has(_weekdayName(day))) operatingDayCount += 1;
  }
  const slotsPerDay = Math.max(0, Math.floor(
    (_timeToMinutes(facilityConfig.closesAt, '17:00') - _timeToMinutes(facilityConfig.opensAt, '09:00')) /
    Math.max(10, Number(facilityConfig.slotMinutes) || 30)
  ));
  const capacity = operatingDayCount * slotsPerDay * Math.max(1, Number(facilityConfig.slotCapacity) || 1);

  const reportStatusCounts = _countBy(reports, report => report.status || 'open');
  const reportTypeCounts = _countBy(reports, report => report.targetType || report.target_type || 'listing');
  const actionCounts = _countBy(actions, action => action.action || 'moderation_action');

  return {
    completedTransactionsOverTime,
    facilityUtilization: {
      period: 'Last 30 days',
      used: relevantBookings.length,
      capacity,
      percentage: capacity ? Math.round((relevantBookings.length / capacity) * 100) : 0,
    },
    moderationSummary: {
      totalReports: reports.length,
      openReports: reports.filter(report => ['open', 'reviewing'].includes(report.status)).length,
      resolvedReports: reports.filter(report => report.status === 'resolved').length,
      dismissedReports: reports.filter(report => report.status === 'dismissed').length,
      totalActions: actions.length,
      reportStatusCounts,
      reportTypeCounts,
      actionCounts,
    },
  };
}

async function _loadFacilityConfig() {
  const { data, error } = await _sb
    .from('facility_config')
    .select('*')
    .eq('config_id', 'default')
    .maybeSingle();
  if (error) return { config: DEFAULT_FACILITY_CONFIG, error };
  return { config: _toFacilityConfig(data || {}) };
}

export async function getAdminOverview() {
  const [usersRes, listingsRes, permsRes, facilityConfigRes, reportsRes, actionsRes, transactionsRes, facilityBookingsRes] = await Promise.all([
    _sb.from('users').select('*').order('full_name'),
    _sb.from('listings').select('*').order('created_at', { ascending: false }).limit(20),
    _sb.from('role_permissions').select('*'),
    _loadFacilityConfig(),
    _sb.from('content_reports').select('*').order('created_at', { ascending: false }).limit(50),
    _sb.from('moderation_actions').select('*').order('created_at', { ascending: false }).limit(50),
    _sb.from('transactions').select('*').order('created_at', { ascending: false }).limit(500),
    _loadFacilityBookingRows(),
  ]);
  if (usersRes.error) return { error: _userFacingError(usersRes.error) };
  const users = (usersRes.data || []).map(toUser);
  const listings = (listingsRes.data || []).map(toListing);
  const userMap = new Map(users.map(user => [user.id, user]));
  const rawReports = reportsRes.error ? [] : (reportsRes.data || []);
  const reviewIds = rawReports.filter(report => report.target_type === 'review').map(report => report.target_id).filter(Boolean);
  const reportListingIds = rawReports
    .flatMap(report => [report.listing_id, report.target_type === 'listing' ? report.target_id : null])
    .filter(Boolean);
  const [reportedReviewsRes, reportedListings] = await Promise.all([
    reviewIds.length ? _sb.from('reviews').select('*').in('review_id', reviewIds) : { data: [], error: null },
    _loadListingsByIds(reportListingIds),
  ]);
  const reportedReviews = (reportedReviewsRes.data || []).map(toReview);
  const reviewMap = new Map(reportedReviews.map(review => [review.id, review]));
  const reviewListingIds = reportedReviews.map(review => review.listingId).filter(Boolean);
  const reviewListings = await _loadListingsByIds(reviewListingIds);
  const listingsById = new Map([...reportedListings, ...reviewListings]);

  const reports = rawReports.map(row => {
    const report = toContentReport(row);
    const review = report.targetType === 'review' ? reviewMap.get(report.targetId) : null;
    const listing = report.targetType === 'listing'
      ? listingsById.get(report.targetId) || listingsById.get(report.listingId)
      : listingsById.get(review?.listingId || report.listingId);
    return {
      ...report,
      listingId: report.listingId || review?.listingId || listing?.id || null,
      reporterName: userMap.get(report.reporterId)?.fullName || userMap.get(report.reporterId)?.email || report.reporterId,
      targetTitle: listing?.title || (report.targetType === 'review' ? 'Review' : 'Listing'),
      targetSnippet: review ? `${review.rating}/5 - ${review.body || 'No review text.'}` : (listing?.description || ''),
      targetStatus: review?.status || listing?.status || null,
    };
  });
  const actions = actionsRes.error ? [] : (actionsRes.data || []).map(action => {
    const mapped = toModerationAction(action);
    const admin = userMap.get(mapped.adminId);
    return {
      ...mapped,
      adminName: admin?.fullName || admin?.email || mapped.adminId || 'System',
    };
  });
  const transactions = transactionsRes.error ? [] : (transactionsRes.data || []);
  const analytics = _buildAdminAnalytics({
    transactions,
    facilityRows: facilityBookingsRes.rows || [],
    reports,
    actions,
    facilityConfig: facilityConfigRes.config || DEFAULT_FACILITY_CONFIG,
  });
  return {
    metrics: {
      users: users.length,
      activeListings: listings.filter(item => item.status === 'active').length,
      openReports: reports.filter(item => ['open', 'reviewing'].includes(item.status)).length,
      moderationActions: actions.length,
    },
    users,
    recentListings: listings,
    reports,
    moderationActions: actions,
    analytics,
    rolePermissions: permsRes.data || [],
    facilityConfig: facilityConfigRes.config || DEFAULT_FACILITY_CONFIG,
  };
}

async function _recordModerationAction({ adminId, action, targetType, targetId, note }) {
  const { error } = await _sb.from('moderation_actions').insert({
    admin_id: adminId || null,
    action,
    target_type: targetType,
    target_id: targetId,
    note: note || null,
  });
  if (error) console.warn('Failed to record moderation action:', error.message);
}

export async function removeListingAsAdmin({ listingId, adminId, note }) {
  const statusCandidates = ['archived', 'removed', 'inactive', 'sold'];
  let lastError = null;
  let removed = false;
  for (const status of statusCandidates) {
    const { error } = await updateListingById(listingId, { status });
    if (!error) {
      removed = true;
      break;
    }
    lastError = error;
  }
  if (!removed) return { error: _userFacingError(lastError, 'Unable to remove listing.') };
  await _sb
    .from('content_reports')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('target_type', 'listing')
    .eq('target_id', listingId);
  await _recordModerationAction({ adminId, action: 'removed_listing', targetType: 'listing', targetId: listingId, note });
  return { success: true };
}

export async function removeReviewAsAdmin({ reviewId, adminId, note } = {}) {
  const statusCandidates = ['removed', 'hidden'];
  let lastError = null;
  let removed = false;
  for (const status of statusCandidates) {
    const { error } = await _sb
      .from('reviews')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('review_id', reviewId);
    if (!error) {
      removed = true;
      break;
    }
    lastError = error;
  }
  if (!removed) return { error: _userFacingError(lastError, 'Unable to remove review.') };
  await _sb
    .from('content_reports')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('target_type', 'review')
    .eq('target_id', reviewId);
  await _recordModerationAction({ adminId, action: 'removed_review', targetType: 'review', targetId: reviewId, note });
  return { success: true };
}

export async function updateContentReport({ reportId, adminId, status, note } = {}) {
  const cleanStatus = ['open', 'reviewing', 'resolved', 'dismissed'].includes(status) ? status : 'reviewing';
  const payloads = [
    { status: cleanStatus, updated_at: new Date().toISOString() },
    { status: cleanStatus },
  ];
  const idColumns = ['report_id', 'id'];
  let lastError = null;

  for (const payload of payloads) {
    for (const column of idColumns) {
      const result = await _sb
        .from('content_reports')
        .update(payload)
        .eq(column, reportId)
        .select();
      if (!result.error && (result.data || []).length) {
        await _recordModerationAction({ adminId, action: 'updated_report_status', targetType: 'report', targetId: reportId, note });
        return { success: true };
      }
      if (!result.error && !(result.data || []).length) continue;
      lastError = result.error;
    }
  }

  if (lastError) return { error: _userFacingError(lastError, 'Unable to update this report. Check that your admin role is active and the report status field allows this value.') };
  return { error: 'Report could not be found.' };
}


const FACILITY_BOOKING_TABLES = [
  'facility_bookings',
  'trade_facility_bookings',
  'trade_bookings',
  'bookings',
  'handover_bookings'
];

function _firstValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

async function _loadFacilityBookingRows() {
  let lastError = null;
  for (const table of FACILITY_BOOKING_TABLES) {
    const { data, error } = await _sb.from(table).select('*');
    if (!error) return { table, rows: data || [] };
    lastError = error;
  }
  return { table: null, rows: [], error: _userFacingError(lastError, 'Facility bookings could not be loaded.') };
}

function _dateKey(value) {
  return new Date(value).toISOString();
}

function _weekdayName(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}

function _combineDateAndTime(date, time) {
  const [hours, minutes] = String(time || '09:00').split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

function _addMinutes(date, minutes) {
  return new Date(date.getTime() + (minutes * 60 * 1000));
}

function _countSlots(rows = [], column) {
  return rows.reduce((map, row) => {
    const value = row[column];
    if (!value) return map;
    const key = _dateKey(value);
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
}

async function _loadUsersByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const { data, error } = await _sb.from('users').select('*').in('id', uniqueIds);
  if (error) return new Map();
  return new Map((data || []).map(row => [row.id, toUser(row)]));
}

async function _loadListingsByIds(ids = []) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  let { data, error } = await _sb.from('listings').select('*').in('listing_id', uniqueIds);
  if (error) ({ data, error } = await _sb.from('listings').select('*').in('id', uniqueIds));
  if (error) return new Map();

  return new Map((data || []).map(row => [row.listing_id || row.id, toListing(row)]));
}

function _normaliseFacilityStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['pending', 'pending_dropoff', 'booked', 'confirmed', 'dropoff_due', 'drop_off_due', 'scheduled', 'dropoff_scheduled', 'awaiting_dropoff'].includes(value)) return 'pending_dropoff';
  if (['received', 'dropped_off', 'dropoff_confirmed', 'at_facility'].includes(value)) return 'received';
  if (['ready', 'ready_for_collection', 'collection_ready', 'ready_for_pickup', 'pickup_ready'].includes(value)) return 'ready_for_collection';
  if (['released', 'completed', 'collected', 'closed'].includes(value)) return 'released';
  return value || 'pending_dropoff';
}

function _hasReleaseMarker(row = {}) {
  return Boolean(row.released_at || row.released_by || row.released_to || row.collected_at || row.collected_by);
}

function _buildFacilitySlots(config, rows = [], column, days = 14) {
  const now = new Date();
  const operatingDays = new Set(_normaliseOperatingDays(config.operatingDays).map(day => String(day).toLowerCase()));
  const capacity = Math.max(1, Number(config.slotCapacity) || 1);
  const slotMinutes = Math.max(10, Number(config.slotMinutes) || 30);
  const counts = _countSlots(rows.filter(row => _normaliseFacilityStatus(row.status) !== 'released'), column);
  const slots = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    if (!operatingDays.has(_weekdayName(day))) continue;

    let cursor = _combineDateAndTime(day, config.opensAt);
    const closesAt = _combineDateAndTime(day, config.closesAt);
    while (_addMinutes(cursor, slotMinutes) <= closesAt) {
      if (cursor > now) {
        const key = _dateKey(cursor);
        const booked = counts.get(key) || 0;
        slots.push({
          startsAt: key,
          available: Math.max(0, capacity - booked),
          capacity,
        });
      }
      cursor = _addMinutes(cursor, slotMinutes);
    }
  }

  return slots;
}

export async function getFacilityAvailability() {
  const { config } = await _loadFacilityConfig();
  const loaded = await _loadFacilityBookingRows();
  if (loaded.error) return { error: loaded.error, config, slots: [], dropoffSlots: [], collectionSlots: [] };
  const rows = loaded.rows || [];
  const dropoffSlots = _buildFacilitySlots(config, rows, 'dropoff_scheduled_at');
  const collectionSlots = _buildFacilitySlots(config, rows, 'collection_scheduled_at');
  return {
    config,
    slots: dropoffSlots,
    dropoffSlots,
    collectionSlots,
  };
}

function _toFacilityBooking(row = {}, listingsById = new Map(), usersById = new Map(), transactionsById = new Map()) {
  const listingId = _firstValue(row, ['listing_id', 'listingId', 'item_id', 'itemId']);
  const transactionId = _firstValue(row, ['transaction_id', 'transactionId']);
  const transaction = transactionsById.get(transactionId) || {};
  const listing = listingsById.get(listingId) || {};
  const sellerId = _firstValue(row, ['seller_id', 'sellerId']) || listing.sellerId;
  const buyerId = _firstValue(row, ['buyer_id', 'buyerId', 'collector_id', 'collectorId']);
  const seller = usersById.get(sellerId) || {};
  const buyer = usersById.get(buyerId) || {};
  const status = _hasReleaseMarker(row)
    ? 'released'
    : _normaliseFacilityStatus(_firstValue(row, ['status', 'booking_status', 'workflow_status', 'handover_status']));

  return {
    id: _firstValue(row, ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id']),
    transactionId,
    listingId,
    sellerId,
    buyerId,
    title: _firstValue(row, ['listing_title', 'title', 'item_title']) || listing.title || 'Listing',
    category: _firstValue(row, ['category', 'listing_category']) || listing.category || 'Other',
    condition: _firstValue(row, ['condition', 'listing_condition']) || listing.condition || 'Used',
    price: Number(_firstValue(row, ['price', 'listing_price']) ?? listing.price ?? 0),
    imageUrl: _firstValue(row, ['image_url', 'imageUrl', 'listing_image_url']) || listing.imageUrl || '',
    sellerName: seller.fullName || seller.username || seller.email || _firstValue(row, ['seller_name', 'seller_email']) || 'Seller',
    buyerName: buyer.fullName || buyer.username || buyer.email || _firstValue(row, ['buyer_name', 'buyer_email', 'collector_name']) || 'Buyer',
    dropoffScheduledAt: _firstValue(row, ['dropoff_scheduled_at', 'drop_off_scheduled_at', 'scheduled_dropoff_at', 'dropoff_at', 'drop_off_at', 'created_at']),
    collectionScheduledAt: _firstValue(row, ['collection_scheduled_at', 'scheduled_collection_at', 'pickup_scheduled_at', 'collection_at', 'pickup_at']),
    status,
    paymentStatus: transaction.paymentStatus || 'unpaid',
    onlinePaidAmount: Number(transaction.onlinePaidAmount || 0),
    cashDueAmount: Number(transaction.cashDueAmount || 0),
    cashSettledAt: transaction.cashSettledAt || null,
    raw: row,
  };
}

export async function getFacilityOverview() {
  const loaded = await _loadFacilityBookingRows();
  const { config } = await _loadFacilityConfig();
  if (loaded.error) {
    console.warn('Facility overview load failed:', loaded.error);
    return {
      error: loaded.error,
      metrics: { dropoffs: 0, collections: 0, ready: 0, completed: 0 },
      dropoffs: [],
      collections: [],
      facilityConfig: config,
    };
  }

  const rows = loaded.rows || [];
  const listingIds = rows.map(row => _firstValue(row, ['listing_id', 'listingId', 'item_id', 'itemId']));
  const transactionIds = _uniqueValues(rows.map(row => _firstValue(row, ['transaction_id', 'transactionId'])));
  const rawSellerIds = rows.map(row => _firstValue(row, ['seller_id', 'sellerId']));
  const buyerIds = rows.map(row => _firstValue(row, ['buyer_id', 'buyerId', 'collector_id', 'collectorId']));

  const listingsById = await _loadListingsByIds(listingIds);
  const { data: transactionRows } = transactionIds.length
    ? await _sb.from('transactions').select('*').in('transaction_id', transactionIds)
    : { data: [] };
  const transactionsById = new Map((transactionRows || []).map(row => [row.transaction_id || row.id, toTransaction(row)]));
  const sellerIds = [
    ...rawSellerIds,
    ...[...listingsById.values()].map(listing => listing.sellerId),
  ];
  const usersById = await _loadUsersByIds([...sellerIds, ...buyerIds]);
  const bookings = rows.map(row => _toFacilityBooking(row, listingsById, usersById, transactionsById));

  const activeDropoffStatuses = ['pending_dropoff'];
  const activeCollectionStatuses = ['received', 'ready_for_collection'];
  const dropoffs = bookings.filter(item => activeDropoffStatuses.includes(item.status));
  const collections = bookings.filter(item => activeCollectionStatuses.includes(item.status));

  return {
    metrics: {
      dropoffs: dropoffs.length,
      collections: collections.length,
      ready: bookings.filter(item => item.status === 'ready_for_collection').length,
      completed: bookings.filter(item => item.status === 'released').length,
    },
    dropoffs,
    collections,
    bookings,
    table: loaded.table,
    facilityConfig: config,
  };
}

export async function updateFacilityConfig({ opensAt, closesAt, slotMinutes, slotCapacity, operatingDays } = {}) {
  const values = {
    config_id: 'default',
    opens_at: opensAt || DEFAULT_FACILITY_CONFIG.opensAt,
    closes_at: closesAt || DEFAULT_FACILITY_CONFIG.closesAt,
    slot_minutes: Math.max(10, Number(slotMinutes) || DEFAULT_FACILITY_CONFIG.slotMinutes),
    slot_capacity: Math.max(1, Number(slotCapacity) || DEFAULT_FACILITY_CONFIG.slotCapacity),
    operating_days: Array.isArray(operatingDays) && operatingDays.length ? operatingDays : DEFAULT_FACILITY_CONFIG.operatingDays,
    updated_at: new Date().toISOString(),
  };
  const { error } = await _sb.from('facility_config').upsert(values, { onConflict: 'config_id' });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function createFacilityBooking({ transactionId, listingId, actorId, buyerId, dropoffScheduledAt, collectionScheduledAt } = {}) {
  if (!transactionId) return { error: 'An accepted offer is required before booking the trade facility.' };
  if (!listingId) return { error: 'Missing listing details.' };
  if (!dropoffScheduledAt) return { error: 'Choose the seller drop-off time.' };

  const { data: transactionRow, error: transactionError } = await _sb
    .from('transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (transactionError) return { error: _userFacingError(transactionError) };
  if (!transactionRow) return { error: 'Transaction not found.' };

  const transaction = toTransaction(transactionRow);
  const resolvedActorId = actorId || transaction.sellerId;
  const resolvedBuyerId = buyerId || transaction.buyerId;
  if (resolvedActorId !== transaction.sellerId) return { error: 'The seller must choose the drop-off time first.' };

  const listingsResult = await _sb.from('listings').select('*').eq('listing_id', listingId).maybeSingle();
  let listing = listingsResult.data;
  if (listingsResult.error || !listing) {
    const fallback = await _sb.from('listings').select('*').eq('id', listingId).maybeSingle();
    listing = fallback.data;
    if (fallback.error || !listing) return { error: (fallback.error || listingsResult.error)?.message || 'Listing not found.' };
  }

  const mappedListing = toListing(listing);
  if (!mappedListing.sellerId || mappedListing.sellerId !== transaction.sellerId || resolvedBuyerId !== transaction.buyerId) {
    return { error: 'This booking does not match the accepted offer.' };
  }

  const dropoff = new Date(dropoffScheduledAt);
  const collection = collectionScheduledAt ? new Date(collectionScheduledAt) : null;
  if (!Number.isFinite(dropoff.getTime())) return { error: 'Choose a valid seller drop-off time.' };
  if (collection && !Number.isFinite(collection.getTime())) return { error: 'Choose a valid collection time.' };
  if (collection && collection <= dropoff) return { error: 'Collection must be after drop-off.' };

  const { data: existingRows } = await _sb
    .from('facility_bookings')
    .select('booking_id,status')
    .eq('listing_id', mappedListing.id)
    .eq('buyer_id', resolvedBuyerId);
  const existing = (existingRows || []).find(row => ['pending_dropoff', 'received', 'ready_for_collection'].includes(_normaliseFacilityStatus(row.status)));
  if (existing) return { error: 'You already have an active facility booking for this listing.' };

  const { data, error } = await _sb
    .from('facility_bookings')
    .insert({
      transaction_id: transactionId,
      listing_id: mappedListing.id,
      seller_id: mappedListing.sellerId,
      buyer_id: resolvedBuyerId,
      dropoff_scheduled_at: dropoff.toISOString(),
      ...(collection ? { collection_scheduled_at: collection.toISOString() } : {}),
    })
    .select()
    .single();
  if (error) return { error: _userFacingError(error) };
  if (transactionId) {
    const transactionValues = {
      facility_booking_id: data.booking_id || data.id,
      updated_at: new Date().toISOString(),
    };
    if (collection) transactionValues.status = 'facility_booked';
    await _sb
      .from('transactions')
      .update(transactionValues)
      .eq('transaction_id', transactionId);
  }
  return { success: true, booking: _toFacilityBooking(data, new Map([[mappedListing.id, mappedListing]])) };
}

export async function confirmFacilityCollection({ transactionId, bookingId, buyerId, collectionScheduledAt } = {}) {
  if (!transactionId || !bookingId || !buyerId) return { error: 'Missing collection booking details.' };
  if (!collectionScheduledAt) return { error: 'Choose your collection time.' };

  const { data: bookingRow, error: bookingError } = await _sb
    .from('facility_bookings')
    .select('*')
    .eq('booking_id', bookingId)
    .maybeSingle();
  if (bookingError) return { error: _userFacingError(bookingError) };
  if (!bookingRow) return { error: 'Facility booking not found.' };
  if (bookingRow.buyer_id !== buyerId || bookingRow.transaction_id !== transactionId) return { error: 'Only the buyer can confirm collection for this handover.' };

  const collection = new Date(collectionScheduledAt);
  const dropoff = new Date(bookingRow.dropoff_scheduled_at);
  if (!Number.isFinite(collection.getTime())) return { error: 'Choose a valid collection time.' };
  if (Number.isFinite(dropoff.getTime()) && collection <= dropoff) return { error: 'Collection must be after the seller drop-off time.' };

  const { error } = await _sb
    .from('facility_bookings')
    .update({ collection_scheduled_at: collection.toISOString(), updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId);
  if (error) return { error: _userFacingError(error) };

  await _sb
    .from('transactions')
    .update({ status: 'facility_booked', updated_at: new Date().toISOString() })
    .eq('transaction_id', transactionId);

  return { success: true };
}

function _columnCompatiblePayload(values, row) {
  if (!row) return values;
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => key === 'status' || Object.prototype.hasOwnProperty.call(row, key))
  );
}

async function _updateFacilityRow(table, bookingId, values, statusCandidates = []) {
  const idColumns = ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id'];
  const rowsResult = await _sb.from(table).select('*');
  const rows = rowsResult.error ? [] : (rowsResult.data || []);
  const targetRow = rows.find(row => idColumns.some(column => String(row[column] || '') === String(bookingId)));
  const availableIdColumns = targetRow
    ? idColumns.filter(column => Object.prototype.hasOwnProperty.call(targetRow, column) && String(targetRow[column] || '') === String(bookingId))
    : idColumns;
  const statuses = statusCandidates.length ? statusCandidates : [values.status];
  const basePayload = _columnCompatiblePayload(values, targetRow);
  let lastError = null;

  for (const status of statuses) {
    const payload = { ...basePayload, status };
    for (const idColumn of availableIdColumns) {
      let { error } = await _sb.from(table).update(payload).eq(idColumn, bookingId);
      if (!error) return { success: true };
      lastError = error;
    }
  }

  if (values.released_at || values.released_to || values.released_by) {
    const { status, ...withoutStatus } = values;
    const releasePayload = _columnCompatiblePayload(withoutStatus, targetRow);
    if (Object.keys(releasePayload).length) {
      for (const idColumn of availableIdColumns) {
        let { error } = await _sb.from(table).update(releasePayload).eq(idColumn, bookingId);
        if (!error) return { success: true, statusFallbackUsed: true };
        lastError = error;
      }
    }
  }

  return { error: _userFacingError(lastError, 'Unable to update this handover.') };
}

export async function updateFacilityBooking({ bookingId, staffId, action, releaseToUserId } = {}) {
  if (!bookingId) return { error: 'Missing booking ID.' };
  const loaded = await _loadFacilityBookingRows();
  if (loaded.error || !loaded.table) return { error: loaded.error || 'Facility booking table could not be found.' };

  const now = new Date().toISOString();
  const values = { updated_at: now };

  if (action === 'confirm_receipt') {
    values.status = 'received';
    values.received_at = now;
    values.received_by = staffId || null;
  } else if (action === 'mark_ready') {
    values.status = 'ready_for_collection';
    values.ready_at = now;
    values.marked_ready_by = staffId || null;
  } else if (action === 'release_item') {
    const loaded = await _loadFacilityBookingRows();
    const bookingRow = (loaded.rows || []).find(item => ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id'].some(column => String(item[column] || '') === String(bookingId)));
    const transactionId = bookingRow?.transaction_id;
    if (transactionId) {
      const { data: transactionRow } = await _sb.from('transactions').select('*').eq('transaction_id', transactionId).maybeSingle();
      const transaction = toTransaction(transactionRow || {});
      if (Number(transaction.cashDueAmount || 0) > 0 && !transaction.cashSettledAt) {
        return { error: `Outstanding cash of R ${Number(transaction.cashDueAmount).toLocaleString('en-ZA')} must be confirmed before release.` };
      }
      if (transaction.paymentStatus && ['pending', 'partial_pending', 'unpaid'].includes(transaction.paymentStatus) && Number(transaction.onlinePaidAmount || 0) > 0) {
        return { error: 'Online payment must be confirmed before release.' };
      }
    }
    values.status = 'released';
    values.released_at = now;
    values.released_by = staffId || null;
    if (releaseToUserId) values.released_to = releaseToUserId;
  } else {
    return { error: 'Unknown facility workflow action.' };
  }

  const statusFallbacks = {
    confirm_receipt: ['received', 'dropoff_confirmed', 'at_facility'],
    mark_ready: ['ready_for_collection', 'ready', 'collection_ready'],
    release_item: ['released', 'completed', 'collected', 'closed'],
  };

  const result = await _updateFacilityRow(loaded.table, bookingId, values, statusFallbacks[action] || []);
  if (result.success && action === 'release_item') {
    const rowsResult = await _sb.from(loaded.table).select('*');
    const row = (rowsResult.data || []).find(item => {
      return ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id'].some(column => String(item[column] || '') === String(bookingId));
    });
    const transactionId = row?.transaction_id;
    if (transactionId) {
      await _sb
        .from('transactions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('transaction_id', transactionId);
    }
  }
  return result;
}

// Export as default Auth object for backwards compatibility
export const Auth = {
  signUp,
  resendSignupOTP,
  signIn,
  signInWithGoogle,
  handleOAuthCallback,
  verifyOTP,
  signOut,
  requireAuth,
  getUser,
  updateProfile,
  updateCampusInfo,
  updatePassword,
  requestPasswordReset,
  handlePasswordRecoverySession,
  completePasswordRecovery,
  initializeSupabase,
  getSupabaseClient,
  getPageUrl,
  redirectToPage,
  getUserInitials,
  getOAuthRedirectUrl,
  setPendingOAuthProfile,
  getMarketplaceListings,
  getSavedListingIds,
  saveListing,
  unsaveListing,
  getMyListings,
  createListing,
  updateListing,
  deleteListing,
  uploadListingImage,
  getListingDashboard,
  startConversation,
  startOffer,
  getConversations,
  getUnreadMessageNotifications,
  getConversationMessages,
  sendMessage,
  updateOfferStatus,
  createPaymentCheckout,
  verifyPaymentCheckout,
  markTransactionCashSettled,
  createReview,
  reportContent,
  getRolePermissions,
  updateRolePermission,
  updateUserRole,
  getAdminOverview,
  removeListingAsAdmin,
  removeReviewAsAdmin,
  updateContentReport,
  getFacilityAvailability,
  createFacilityBooking,
  confirmFacilityCollection,
  getFacilityOverview,
  updateFacilityConfig,
  updateFacilityBooking
};
export default Auth;

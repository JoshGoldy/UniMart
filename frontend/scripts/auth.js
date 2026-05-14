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
  const { error } = await _sb.auth.signUp({
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
  if (error) return { error: error.message };
  return { success: true };
}

export async function resendSignupOTP(email) {
  const { error } = await _sb.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getPageUrl('login.html'),
    },
  });
  if (error) return { error: error.message };
  return { success: true };
}

// Sign-in
export async function signIn({ email, password }) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  return { success: true };
}

export async function handleOAuthCallback() {
  const { data: { session }, error } = await _sb.auth.getSession();
  if (error) return { error: error.message };
  if (!session?.user) return { error: 'We could not complete Google sign-in. Please try again.' };

  const profile = await _ensureProfile(session.user);
  if (!profile) return { error: 'We could not load your UniMart profile. Please try again.' };
  return { success: true, user: profile };
}

// OTP verification
export async function verifyOTP(email, token) {
  const { data, error } = await _sb.auth.verifyOtp({ email, token, type: 'signup' });
  if (error) return { error: error.message };
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
  if (dbErr || authErr) return { error: (dbErr || authErr).message };
  return { success: true };
}

export async function updateCampusInfo({ id, university, campus, studentNumber }) {
  const { error } = await _sb.from('users').update({
    university: university || null,
    uni_campus: campus || null,
    student_number: studentNumber || null,
  }).eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// Password management
export async function updatePassword({ currentPassword, newPassword, email }) {
  const { error: reAuthErr } = await _sb.auth.signInWithPassword({ email, password: currentPassword });
  if (reAuthErr) return { error: 'Incorrect current password.' };
  const { error: updateErr } = await _sb.auth.updateUser({ password: newPassword });
  if (updateErr) return { error: updateErr.message };
  return { success: true };
}

export async function requestPasswordReset({ email, redirectTo }) {
  const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { error: error.message };
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
    if (error) return { error: error.message };
    return { success: true };
  }

  if (code && _sb.auth.exchangeCodeForSession) {
    const { error } = await _sb.auth.exchangeCodeForSession(code);
    if (error) return { error: error.message };
    return { success: true };
  }

  return { error: 'Open the password reset link from your email again so we can verify the recovery session.' };
}

export async function completePasswordRecovery({ newPassword }) {
  const recovered = await handlePasswordRecoverySession();
  if (recovered.error) return recovered;
  const { error } = await _sb.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
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
    sellerDisplayName: seller.full_name || seller.username || seller.email || row.seller_display_name || null,
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
    if (fallback.error) return { error: fallback.error.message };
    return { listings: (fallback.data || []).map(toListing) };
  }
  return { listings: (data || []).map(toListing) };
}

export async function getMyListings(sellerId) {
  const { data, error } = await _sb
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  return { success: true, listing: toListing(data) };
}

export async function updateListing(payload) {
  let { data, error } = await updateListingById(payload.listingId, listingPayload(payload), payload.sellerId);
  if (isMissingListingTypeError(error)) {
    ({ data, error } = await updateListingById(payload.listingId, legacyListingPayload(payload), payload.sellerId));
  }
  if (error) return { error: error.message };
  return { success: true, listing: toListing(data) };
}

export async function deleteListing({ listingId, sellerId }) {
  const { error } = await deleteListingById(listingId, sellerId);
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
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

  if (findErr) return { error: findErr.message };

  if (!conversation) {
    const inserted = await _sb
      .from('conversations')
      .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, status: 'open', last_message_at: new Date().toISOString() })
      .select()
      .single();
    if (inserted.error) return { error: inserted.error.message };
    conversation = inserted.data;
  }

  const sent = await sendMessage({ conversationId: _conversationId(conversation), senderId: buyerId, body: initialMessage });
  if (sent.error) return sent;
  return { success: true, conversation: { ...conversation, id: _conversationId(conversation) } };
}

function _parseOfferAmount(text = '') {
  const match = String(text).replace(/,/g, '').match(/(?:r|zar)?\s*(\d+(?:\.\d{1,2})?)/i);
  return match ? Number(match[1]) : null;
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
  return {
    id: row.transaction_id || row.id,
    offerId: row.offer_id,
    conversationId: row.conversation_id,
    listingId: row.listing_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    status: row.status || 'accepted',
    facilityBookingId: row.facility_booking_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

export async function startOffer({ listingId, buyerId, offerText }) {
  const conversationResult = await startConversation({
    listingId,
    buyerId,
    initialMessage: `Offer: ${offerText}`,
  });
  if (conversationResult.error) return conversationResult;

  const conversation = conversationResult.conversation;
  const conversationId = _conversationId(conversation);
  const amount = _parseOfferAmount(offerText);
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
      note: offerText,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { success: true, conversation: { ...conversation, id: conversationId }, offer: toOffer(data) };
}

function _uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function _conversationId(row = {}) {
  return row.conversation_id || row.id;
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
    const unread = await _sb
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', _conversationId(row))
      .neq('sender_id', currentUserId)
      .is('read_at', null);

    return toConversation({
      ...row,
      listing: listingsById[row.listing_id] || {},
      buyer: usersById[row.buyer_id] || {},
      seller: usersById[row.seller_id] || {},
      unread_count: unread.count || 0,
    }, currentUserId);
  }));
}

export async function getConversations(userId) {
  const { data, error } = await _sb
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) return { error: error.message };

  const conversations = await _hydrateConversations(data || [], userId);
  return { conversations };
}

export async function getConversationMessages({ conversationId, userId, markRead = false }) {
  let convResult = await _getConversationById(conversationId);

  if (convResult.error) return { error: convResult.error.message };
  const conversationRow = convResult.data;
  if (!conversationRow || ![conversationRow.buyer_id, conversationRow.seller_id].includes(userId)) return { error: 'Conversation not found.' };

  const resolvedConversationId = _conversationId(conversationRow);

  if (markRead) {
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

  if (error) return { error: error.message };

  const offersResult = await _sb
    .from('offers')
    .select('*')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: false });

  const transactionsResult = await _sb
    .from('transactions')
    .select('*')
    .eq('conversation_id', resolvedConversationId)
    .order('created_at', { ascending: false });

  const [conversation] = await _hydrateConversations([conversationRow], userId);
  return {
    conversation,
    offers: offersResult.error ? [] : (offersResult.data || []).map(toOffer),
    transactions: transactionsResult.error ? [] : (transactionsResult.data || []).map(toTransaction),
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
  if (offerError) return { error: offerError.message };
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
  if (updateError) return { error: updateError.message };

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
    if (inserted.error) return { error: inserted.error.message };
    transaction = toTransaction(inserted.data);
  }

  await sendMessage({
    conversationId: offerRow.conversation_id,
    senderId: userId,
    body: status === 'accepted' ? 'Offer accepted. You can now book the trade facility handover.' : 'Offer declined.',
  });

  return { success: true, offer: toOffer(updatedOffer), transaction };
}

export async function sendMessage({ conversationId, senderId, body }) {
  const now = new Date().toISOString();
  const { data, error } = await _sb
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body, created_at: now })
    .select()
    .single();
  if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateUserRole({ userId, role }) {
  const { error } = await _sb.from('users').update({ user_role: role }).eq('id', userId);
  if (error) return { error: error.message };
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
  const [usersRes, listingsRes, permsRes, facilityConfigRes] = await Promise.all([
    _sb.from('users').select('*').order('full_name'),
    _sb.from('listings').select('*').order('created_at', { ascending: false }).limit(20),
    _sb.from('role_permissions').select('*'),
    _loadFacilityConfig(),
  ]);
  if (usersRes.error) return { error: usersRes.error.message };
  const users = (usersRes.data || []).map(toUser);
  const listings = (listingsRes.data || []).map(toListing);
  return {
    metrics: {
      users: users.length,
      activeListings: listings.filter(item => item.status === 'active').length,
      openReports: 0,
      moderationActions: 0,
    },
    users,
    recentListings: listings,
    reports: [],
    moderationActions: [],
    rolePermissions: permsRes.data || [],
    facilityConfig: facilityConfigRes.config || DEFAULT_FACILITY_CONFIG,
  };
}

export async function removeListingAsAdmin({ listingId }) { return deleteListing({ listingId }); }
export async function removeReviewAsAdmin() { return { success: true }; }
export async function updateContentReport() { return { success: true }; }


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
  return { table: null, rows: [], error: lastError?.message || 'Facility booking table could not be found.' };
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
  if (['pending', 'pending_dropoff', 'dropoff_due', 'drop_off_due', 'scheduled', 'dropoff_scheduled', 'awaiting_dropoff'].includes(value)) return 'pending_dropoff';
  if (['received', 'dropped_off', 'dropoff_confirmed', 'at_facility'].includes(value)) return 'received';
  if (['ready', 'ready_for_collection', 'collection_ready'].includes(value)) return 'ready_for_collection';
  if (['released', 'completed', 'collected', 'closed'].includes(value)) return 'released';
  return value || 'pending_dropoff';
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

function _toFacilityBooking(row = {}, listingsById = new Map(), usersById = new Map()) {
  const listingId = _firstValue(row, ['listing_id', 'listingId', 'item_id', 'itemId']);
  const listing = listingsById.get(listingId) || {};
  const sellerId = _firstValue(row, ['seller_id', 'sellerId']) || listing.sellerId;
  const buyerId = _firstValue(row, ['buyer_id', 'buyerId', 'collector_id', 'collectorId']);
  const seller = usersById.get(sellerId) || {};
  const buyer = usersById.get(buyerId) || {};
  const status = _normaliseFacilityStatus(_firstValue(row, ['status', 'booking_status', 'workflow_status', 'handover_status']));

  return {
    id: _firstValue(row, ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id']),
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
    collectionScheduledAt: _firstValue(row, ['collection_scheduled_at', 'scheduled_collection_at', 'pickup_scheduled_at', 'collection_at', 'pickup_at', 'updated_at']),
    status,
    raw: row,
  };
}

export async function getFacilityOverview() {
  const loaded = await _loadFacilityBookingRows();
  if (loaded.error) {
    console.warn('Facility overview load failed:', loaded.error);
    return {
      error: loaded.error,
      metrics: { dropoffs: 0, collections: 0, ready: 0, completed: 0 },
      dropoffs: [],
      collections: [],
    };
  }

  const rows = loaded.rows || [];
  const listingIds = rows.map(row => _firstValue(row, ['listing_id', 'listingId', 'item_id', 'itemId']));
  const rawSellerIds = rows.map(row => _firstValue(row, ['seller_id', 'sellerId']));
  const buyerIds = rows.map(row => _firstValue(row, ['buyer_id', 'buyerId', 'collector_id', 'collectorId']));

  const listingsById = await _loadListingsByIds(listingIds);
  const sellerIds = [
    ...rawSellerIds,
    ...[...listingsById.values()].map(listing => listing.sellerId),
  ];
  const usersById = await _loadUsersByIds([...sellerIds, ...buyerIds]);
  const bookings = rows.map(row => _toFacilityBooking(row, listingsById, usersById));

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
  if (error) return { error: error.message };
  return { success: true };
}

export async function createFacilityBooking({ transactionId, listingId, buyerId, dropoffScheduledAt, collectionScheduledAt, note } = {}) {
  if (!transactionId) return { error: 'An accepted offer is required before booking the trade facility.' };
  if (!listingId || !buyerId) return { error: 'Missing listing or buyer details.' };
  if (!dropoffScheduledAt || !collectionScheduledAt) return { error: 'Choose both a drop-off and collection slot.' };

  const listingsResult = await _sb.from('listings').select('*').eq('listing_id', listingId).maybeSingle();
  let listing = listingsResult.data;
  if (listingsResult.error || !listing) {
    const fallback = await _sb.from('listings').select('*').eq('id', listingId).maybeSingle();
    listing = fallback.data;
    if (fallback.error || !listing) return { error: (fallback.error || listingsResult.error)?.message || 'Listing not found.' };
  }

  const mappedListing = toListing(listing);
  if (!mappedListing.sellerId || mappedListing.sellerId === buyerId) return { error: 'You cannot book a facility handover for your own listing.' };

  const dropoff = new Date(dropoffScheduledAt);
  const collection = new Date(collectionScheduledAt);
  if (!Number.isFinite(dropoff.getTime()) || !Number.isFinite(collection.getTime())) return { error: 'Choose valid facility slots.' };
  if (collection <= dropoff) return { error: 'Collection must be after drop-off.' };

  const { data: existing } = await _sb
    .from('facility_bookings')
    .select('booking_id,status')
    .eq('listing_id', mappedListing.id)
    .eq('buyer_id', buyerId)
    .in('status', ['pending_dropoff', 'received', 'ready_for_collection'])
    .maybeSingle();
  if (existing) return { error: 'You already have an active facility booking for this listing.' };

  const { data, error } = await _sb
    .from('facility_bookings')
    .insert({
      transaction_id: transactionId,
      listing_id: mappedListing.id,
      seller_id: mappedListing.sellerId,
      buyer_id: buyerId,
      dropoff_scheduled_at: dropoff.toISOString(),
      collection_scheduled_at: collection.toISOString(),
      status: 'pending_dropoff',
      note: note || null,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  if (transactionId) {
    await _sb
      .from('transactions')
      .update({ facility_booking_id: data.booking_id || data.id, status: 'facility_booked', updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId);
  }
  return { success: true, booking: _toFacilityBooking(data, new Map([[mappedListing.id, mappedListing]])) };
}

async function _updateFacilityRow(table, bookingId, values) {
  const idColumns = ['booking_id', 'facility_booking_id', 'trade_booking_id', 'handover_id', 'id'];
  let lastError = null;

  for (const idColumn of idColumns) {
    let { error } = await _sb.from(table).update(values).eq(idColumn, bookingId);
    if (!error) return { success: true };
    lastError = error;
  }

  if (values.updated_at !== undefined) {
    const minimal = { status: values.status };
    for (const idColumn of idColumns) {
      let { error } = await _sb.from(table).update(minimal).eq(idColumn, bookingId);
      if (!error) return { success: true };
      lastError = error;
    }
  }

  return { error: lastError?.message || 'Unable to update facility booking.' };
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
    values.status = 'released';
    values.released_at = now;
    values.released_by = staffId || null;
    if (releaseToUserId) values.released_to = releaseToUserId;
  } else {
    return { error: 'Unknown facility workflow action.' };
  }

  return _updateFacilityRow(loaded.table, bookingId, values);
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
  getMyListings,
  createListing,
  updateListing,
  deleteListing,
  uploadListingImage,
  getListingDashboard,
  startConversation,
  startOffer,
  getConversations,
  getConversationMessages,
  sendMessage,
  updateOfferStatus,
  getRolePermissions,
  updateRolePermission,
  updateUserRole,
  getAdminOverview,
  removeListingAsAdmin,
  removeReviewAsAdmin,
  updateContentReport,
  getFacilityAvailability,
  createFacilityBooking,
  getFacilityOverview,
  updateFacilityConfig,
  updateFacilityBooking
};
export default Auth;

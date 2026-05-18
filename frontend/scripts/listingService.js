import { getSupabaseClient, _userFacingError, LISTING_IMAGE_BUCKET, LISTING_IMAGE_MAX_BYTES } from './authService.js';

export function toUser(row = {}) {
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

export function toListing(row = {}) {
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
    sellerFullName: seller.full_name || row.seller_full_name || null,
    sellerUsername: seller.username || row.seller_username || null,
    sellerUniversity: seller.university || row.seller_university || null,
    sellerCampus: seller.uni_campus || seller.campus || row.seller_campus || null,
    sellerRatingAverage: row.seller_rating_average === undefined ? null : Number(row.seller_rating_average),
    sellerReviewCount: Number(row.seller_review_count) || 0,
    sellerCompletedTransactions: Number(row.seller_completed_transactions || 0),
    sellerRecentCategories: Array.isArray(row.seller_recent_categories) ? row.seller_recent_categories : [],
    sellerLastCompletedAt: row.seller_last_completed_at || null,
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
  let query = getSupabaseClient().from('listings').select(`${baseSelect}, users:seller_id(full_name,email,username,university,uni_campus)`);
  let { data, error } = await query;
  if (!error) return { data, error };
  return getSupabaseClient().from('listings').select(baseSelect);
}

export async function updateListingById(listingId, values, sellerId) {
  let q = getSupabaseClient().from('listings').update(values).eq('listing_id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  let { data, error } = await q.select().maybeSingle();
  if (!error) return { data, error };
  q = getSupabaseClient().from('listings').update(values).eq('id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  return q.select().maybeSingle();
}

export async function deleteListingById(listingId, sellerId) {
  let q = getSupabaseClient().from('listings').delete().eq('listing_id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  let { error } = await q;
  if (!error) return { error };
  q = getSupabaseClient().from('listings').delete().eq('id', listingId);
  if (sellerId) q = q.eq('seller_id', sellerId);
  return q;
}

export async function getMarketplaceListings() {
  const { data, error } = await getSupabaseClient()
    .from('listings')
    .select('*, users:seller_id(full_name,email,username,university,uni_campus)')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    const fallback = await getSupabaseClient().from('listings').select('*').eq('status', 'active').order('created_at', { ascending: false });
    if (fallback.error) return { error: _userFacingError(fallback.error) };
    return { listings: await attachSellerRatings((fallback.data || []).map(toListing)) };
  }
  return { listings: await attachSellerRatings((data || []).map(toListing)) };
}

export async function getSavedListingIds(userId) {
  if (!userId) return { listingIds: [] };
  const { data, error } = await getSupabaseClient()
    .from('saved_listings')
    .select('listing_id')
    .eq('user_id', userId);
  if (error) return { error: _userFacingError(error), listingIds: [] };
  return { listingIds: (data || []).map(row => row.listing_id).filter(Boolean) };
}

export async function saveListing({ userId, listingId } = {}) {
  if (!userId || !listingId) return { error: 'Choose a listing to save.' };
  const { error } = await getSupabaseClient()
    .from('saved_listings')
    .upsert({ user_id: userId, listing_id: listingId }, { onConflict: 'user_id,listing_id' });
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function unsaveListing({ userId, listingId } = {}) {
  if (!userId || !listingId) return { error: 'Choose a listing to remove.' };
  const { error } = await getSupabaseClient()
    .from('saved_listings')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) return { error: _userFacingError(error) };
  return { success: true };
}

export async function getMyListings(sellerId) {
  const { data, error } = await getSupabaseClient()
    .from('listings')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) return { error: _userFacingError(error) };
  return { listings: (data || []).map(toListing) };
}

export async function createListing(payload) {
  let { data, error } = await getSupabaseClient()
    .from('listings')
    .insert(listingPayload(payload))
    .select()
    .single();
  if (isMissingListingTypeError(error)) {
    ({ data, error } = await getSupabaseClient()
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
  const { error } = await getSupabaseClient().storage.from(LISTING_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) return { error: _userFacingError(error) };
  const { data } = getSupabaseClient().storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);
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


async function attachSellerTrustStats(listings) {
  const sellerIds = [...new Set((listings || []).map(listing => listing.sellerId).filter(Boolean))];
  if (!sellerIds.length) return listings || [];

  const [reviewsResult, transactionsResult, soldListingsResult] = await Promise.all([
    getSupabaseClient()
    .from('reviews')
    .select('reviewee_id,rating')
    .eq('status', 'visible')
      .in('reviewee_id', sellerIds),
    getSupabaseClient()
      .from('transactions')
      .select('seller_id,listing_id,updated_at,created_at,status')
      .eq('status', 'completed')
      .in('seller_id', sellerIds)
      .limit(500),
    getSupabaseClient()
      .from('listings')
      .select('listing_id,category')
      .in('seller_id', sellerIds),
  ]);

  const totals = (reviewsResult.data || []).reduce((map, row) => {
    const key = row.reviewee_id;
    if (!map[key]) map[key] = { total: 0, count: 0 };
    map[key].total += Number(row.rating) || 0;
    map[key].count += 1;
    return map;
  }, {});

  const listingCategories = new Map((soldListingsResult.data || []).map(row => [row.listing_id, row.category || 'Other']));
  const history = (transactionsResult.data || []).reduce((map, row) => {
    const key = row.seller_id;
    if (!map[key]) map[key] = { count: 0, categories: {}, lastCompletedAt: null };
    map[key].count += 1;
    const category = listingCategories.get(row.listing_id) || 'Other';
    map[key].categories[category] = (map[key].categories[category] || 0) + 1;
    const completedAt = row.updated_at || row.created_at;
    if (completedAt && (!map[key].lastCompletedAt || new Date(completedAt) > new Date(map[key].lastCompletedAt))) {
      map[key].lastCompletedAt = completedAt;
    }
    return map;
  }, {});

  return (listings || []).map(listing => {
    const rating = totals[listing.sellerId];
    const sellerHistory = history[listing.sellerId];
    return {
      ...listing,
      ...(rating ? {
        sellerRatingAverage: rating.total / rating.count,
        sellerReviewCount: rating.count,
      } : {}),
      sellerCompletedTransactions: sellerHistory?.count || 0,
      sellerRecentCategories: sellerHistory
        ? Object.entries(sellerHistory.categories).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, count]) => ({ label, count }))
        : [],
      sellerLastCompletedAt: sellerHistory?.lastCompletedAt || null,
    };
  });
}

const attachSellerRatings = attachSellerTrustStats;

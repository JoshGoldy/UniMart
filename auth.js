/**
 * UniMart — Auth module (Supabase)
 */
 
const SUPABASE_URL      = 'https://xdxnzkowvmphveiwzufm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_WqqtaVhge6rIPosltnGktw_xVHBE5L_';
const LISTING_IMAGE_BUCKET = 'listing-images';
const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
 
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 
const Auth = (() => {
 
  /* ---------- sign-up ---------- */
  async function signUp({ fullName, email, password, accountType, university, campus, studentNumber }) {
    const { error } = await _sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, account_type: accountType, university: university || null, campus: campus || null, student_number: studentNumber || null }
      }
    });
    if (error) return { error: error.message };
    return { success: true };
  }
 
  /* ---------- sign-in ---------- */
  async function signIn({ email, password }) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { success: true, user: _buildUser(data.user) };
  }
 
  /* ---------- OTP verification (sign-up email confirmation) ---------- */
  async function verifyOTP(email, token) {
    const { data, error } = await _sb.auth.verifyOtp({ email, token, type: 'signup' });
    if (error) return { error: error.message };
    if (data.user) {
      const meta = data.user.user_metadata || {};
      await _sb.from('users').upsert({
        id: data.user.id,
        full_name: meta.full_name,
        email: data.user.email,
        account_type: meta.account_type || 'buyer',
        university: meta.university || null,
        uni_campus: meta.campus || null,
        student_number: meta.student_number || null,
      });
    }
    return { success: true };
  }
 
  /* ---------- sign-out ---------- */
  async function signOut() {
    await _sb.auth.signOut();
    window.location.href = 'login.html';
  }
 
  /* ---------- session / auth guard ---------- */
  async function requireAuth() {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return _getProfile(session.user);
  }
 
  async function getUser() {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return null;
    return _getProfile(session.user);
  }
 
  /* ---------- profile update ---------- */
  async function updateProfile({ id, fullName, email, accountType }) {
    const [{ error: dbErr }, { error: authErr }] = await Promise.all([
      _sb.from('users').update({
        full_name: fullName,
        email: email.toLowerCase(),
        account_type: accountType,
      }).eq('id', id),
      _sb.auth.updateUser({ data: { full_name: fullName, account_type: accountType } }),
    ]);
    if (dbErr || authErr) return { error: (dbErr || authErr).message };
    return { success: true };
  }
 
  /* ---------- campus info update ---------- */
  async function updateCampusInfo({ id, university, campus, studentNumber }) {
    const { error } = await _sb.from('users').update({
      university: university || null,
      uni_campus: campus || null,
      student_number: studentNumber || null,
    }).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  }
 
  /* ---------- password update ---------- */
  async function updatePassword({ currentPassword, newPassword, email }) {
    const { error: reAuthErr } = await _sb.auth.signInWithPassword({ email, password: currentPassword });
    if (reAuthErr) return { error: 'Incorrect current password.' };
    const { error: updateErr } = await _sb.auth.updateUser({ password: newPassword });
    if (updateErr) return { error: updateErr.message };
    return { success: true };
  }

  async function requestPasswordReset({ email, redirectTo }) {
    const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { error: error.message };
    return { success: true };
  }

  async function completePasswordRecovery({ newPassword }) {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return { success: true };
  }

  /* ---------- dashboard analytics ---------- */
  async function getListingDashboard(userId) {
    const { data, error } = await _sb
      .from('listings')
      .select('listing_id, title, price, category, status, created_at')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };

    const listings = data || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totals = listings.reduce((acc, listing) => {
      const price = Number(listing.price) || 0;
      const status = (listing.status || '').toLowerCase();
      const createdAt = listing.created_at ? new Date(listing.created_at) : null;

      if (status === 'active') {
        acc.activeListings += 1;
        acc.activeValue += price;
      }
      if (status === 'sold') acc.soldListings += 1;
      if (createdAt && createdAt >= monthStart) acc.thisMonth += 1;

      return acc;
    }, {
      activeListings: 0,
      soldListings: 0,
      activeValue: 0,
      thisMonth: 0,
    });

    const categoryMap = listings.reduce((acc, listing) => {
      const key = listing.category || 'Uncategorized';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const categories = Object.entries(categoryMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));

    const monthlyMap = {};
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      monthlyMap[key] = {
        label: date.toLocaleString('en-US', { month: 'short' }),
        value: 0,
      };
    }

    listings.forEach(listing => {
      if (!listing.created_at) return;
      const date = new Date(listing.created_at);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (monthlyMap[key]) monthlyMap[key].value += 1;
    });

    return {
      success: true,
      metrics: totals,
      categories,
      monthly: Object.values(monthlyMap),
      recent: listings.slice(0, 5).map(listing => ({
        id: listing.listing_id,
        title: listing.title || 'Untitled listing',
        category: listing.category || 'Uncategorized',
        status: listing.status || 'active',
        price: Number(listing.price) || 0,
        createdAt: listing.created_at,
      })),
    };
  }

  async function getMarketplaceListings() {
    const { data, error } = await _sb
      .from('listings')
      .select('listing_id, seller_id, title, description, price, category, condition, is_tradeable, status, image_url, created_at')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };

    return {
      success: true,
      listings: (data || []).map(listing => ({
        id: listing.listing_id,
        sellerId: listing.seller_id,
        title: listing.title || 'Untitled listing',
        description: listing.description || '',
        price: Number(listing.price) || 0,
        category: listing.category || 'Other',
        condition: listing.condition || 'Not specified',
        isTradeable: Boolean(listing.is_tradeable),
        status: listing.status || 'active',
        imageUrl: listing.image_url || '',
        createdAt: listing.created_at,
      })),
    };
  }

  async function getMyListings(userId) {
    const { data, error } = await _sb
      .from('listings')
      .select('listing_id, seller_id, title, description, price, category, condition, is_tradeable, status, image_url, created_at')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });

    if (error) return { error: error.message };

    return {
      success: true,
      listings: (data || []).map(_mapListingRecord),
    };
  }

  async function createListing({ sellerId, title, description, price, category, condition, isTradeable, status, imageUrl }) {
    const payload = {
      seller_id: sellerId,
      title: title.trim(),
      description: description.trim() || null,
      price: Number(price),
      category: category,
      condition: condition,
      is_tradeable: Boolean(isTradeable),
      status: status || 'active',
      image_url: imageUrl.trim() || null,
    };

    const { data, error } = await _sb
      .from('listings')
      .insert(payload)
      .select('listing_id, seller_id, title, description, price, category, condition, is_tradeable, status, image_url, created_at')
      .single();

    if (error) return { error: error.message };
    return { success: true, listing: _mapListingRecord(data) };
  }

  async function updateListing({ listingId, sellerId, title, description, price, category, condition, isTradeable, status, imageUrl }) {
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      price: Number(price),
      category: category,
      condition: condition,
      is_tradeable: Boolean(isTradeable),
      status: status || 'active',
      image_url: imageUrl.trim() || null,
    };

    const { data, error } = await _sb
      .from('listings')
      .update(payload)
      .eq('listing_id', listingId)
      .eq('seller_id', sellerId)
      .select('listing_id, seller_id, title, description, price, category, condition, is_tradeable, status, image_url, created_at')
      .single();

    if (error) return { error: error.message };
    return { success: true, listing: _mapListingRecord(data) };
  }

  async function deleteListing({ listingId, sellerId }) {
    const { error } = await _sb
      .from('listings')
      .delete()
      .eq('listing_id', listingId)
      .eq('seller_id', sellerId);

    if (error) return { error: error.message };
    return { success: true };
  }

  async function uploadListingImage(file, userId) {
    if (file.size > LISTING_IMAGE_MAX_BYTES) {
      return { error: 'Image must be 5 MB or smaller.' };
    }

    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safeExt = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;
    const path = `${userId}/${filename}`;

    const { error: uploadError } = await _sb.storage
      .from(LISTING_IMAGE_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) return { error: uploadError.message };

    const { data } = _sb.storage
      .from(LISTING_IMAGE_BUCKET)
      .getPublicUrl(path);

    return {
      success: true,
      path,
      imageUrl: data.publicUrl,
    };
  }
 
  /* ---------- helpers ---------- */
  async function _getProfile(authUser) {
    const { data } = await _sb.from('users').select('*').eq('id', authUser.id).single();
    if (data) {
      return {
        id: data.id,
        fullName: data.full_name,
        email: data.email || authUser.email,
        accountType: data.account_type || 'buyer',
        university: data.university || '',
        campus: data.uni_campus || '',
        studentNumber: data.student_number || '',
      };
    }
    const meta = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: meta.full_name || authUser.email,
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      university: meta.university || '',
      campus: meta.campus || '',
      studentNumber: meta.student_number || '',
    };
  }
 
  function _buildUser(authUser) {
    if (!authUser) return null;
    const meta = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: meta.full_name || authUser.email,
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      university: meta.university || '',
      campus: meta.campus || '',
      studentNumber: meta.student_number || '',
    };
  }
 
  function getUserInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function _mapListingRecord(listing) {
    return {
      id: listing.listing_id,
      sellerId: listing.seller_id,
      title: listing.title || 'Untitled listing',
      description: listing.description || '',
      price: Number(listing.price) || 0,
      category: listing.category || 'Other',
      condition: listing.condition || 'Not specified',
      isTradeable: Boolean(listing.is_tradeable),
      status: listing.status || 'active',
      imageUrl: listing.image_url || '',
      createdAt: listing.created_at,
    };
  }
 
  return { signUp, signIn, verifyOTP, signOut, requireAuth, getUser, getUserInitials, updateProfile, updateCampusInfo, updatePassword, requestPasswordReset, completePasswordRecovery, getListingDashboard, getMarketplaceListings, getMyListings, createListing, updateListing, deleteListing, uploadListingImage };
})();

if (typeof module !== 'undefined') {
  module.exports = { Auth };
}

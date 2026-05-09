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
  async function signUp({ fullName, email, password, accountType, userRole = 'student', university, campus, studentNumber }) {
    const cleanRole = ['student', 'staff'].includes(userRole) ? userRole : 'student';
    const cleanAccountType = cleanRole === 'student' && ['buyer', 'seller', 'seller_buyer'].includes(accountType)
      ? accountType
      : 'buyer';
    const { error } = await _sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, account_type: cleanAccountType, user_role: cleanRole, university: university || null, campus: campus || null, student_number: studentNumber || null }
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
        user_role: meta.user_role || 'student',
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
  async function updateProfile({ id, fullName, email, accountType, username }) {
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
    const sellerMap = await _getUserDisplayMap((data || []).map(listing => listing.seller_id));

    return {
      success: true,
      listings: (data || []).map(listing => ({
        id: listing.listing_id,
        sellerId: listing.seller_id,
        sellerDisplayName: sellerMap[listing.seller_id] || _formatDisplayName('', '', '', listing.seller_id),
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

  async function startConversation({ listingId, buyerId, initialMessage }) {
    const body = String(initialMessage || '').trim();
    if (!listingId || !buyerId) return { error: 'Missing conversation details.' };
    if (!body) return { error: 'Enter a message before starting the conversation.' };

    const { data: listing, error: listingError } = await _sb
      .from('listings')
      .select('listing_id, seller_id, title, status')
      .eq('listing_id', listingId)
      .single();

    if (listingError) return { error: listingError.message };
    if (!listing) return { error: 'Listing not found.' };
    if (listing.seller_id === buyerId) return { error: 'You cannot message yourself about your own listing.' };

    let conversation;
    const { data: existing, error: existingError } = await _sb
      .from('conversations')
      .select('conversation_id, listing_id, buyer_id, seller_id, status, buyer_unread_count, seller_unread_count, last_message_at, created_at, updated_at')
      .eq('listing_id', listingId)
      .eq('buyer_id', buyerId)
      .eq('seller_id', listing.seller_id)
      .maybeSingle();

    if (existingError) return { error: existingError.message };
    conversation = existing;

    if (!conversation) {
      const { data: created, error: createError } = await _sb
        .from('conversations')
        .insert({
          listing_id: listingId,
          buyer_id: buyerId,
          seller_id: listing.seller_id,
          status: 'open',
          buyer_unread_count: 0,
          seller_unread_count: 0,
        })
        .select('conversation_id, listing_id, buyer_id, seller_id, status, buyer_unread_count, seller_unread_count, last_message_at, created_at, updated_at')
        .single();

      if (createError) return { error: createError.message };
      conversation = created;
    }

    const sent = await sendMessage({ conversationId: conversation.conversation_id, senderId: buyerId, body });
    if (sent.error) return sent;

    return {
      success: true,
      conversation: _mapConversationRecord({
        ...sent.conversation,
        listings: listing,
      }, buyerId),
    };
  }

  async function getConversations(userId) {
    const { data, error } = await _sb
      .from('conversations')
      .select('conversation_id, listing_id, buyer_id, seller_id, status, buyer_unread_count, seller_unread_count, last_message_at, created_at, updated_at, listings(title, price, image_url)')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) return { error: error.message };
    const userMap = await _getUserDisplayMap((data || []).flatMap(item => [item.buyer_id, item.seller_id]));

    return {
      success: true,
      conversations: (data || []).map(item => _mapConversationRecord(item, userId, userMap)),
    };
  }

  async function getConversationMessages({ conversationId, userId, markRead = true }) {
    const access = await _getAccessibleConversation(conversationId, userId);
    if (access.error) return access;

    if (markRead) {
      const read = await markConversationRead({ conversationId, userId });
      if (read.error) return read;
    }

    const { data, error } = await _sb
      .from('messages')
      .select('message_id, conversation_id, sender_id, body, read_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) return { error: error.message };

    return {
      success: true,
      conversation: _mapConversationRecord(access.conversation, userId, await _getUserDisplayMap([access.conversation.buyer_id, access.conversation.seller_id])),
      messages: (data || []).map(_mapMessageRecord),
    };
  }

  async function sendMessage({ conversationId, senderId, body }) {
    const text = String(body || '').trim();
    if (!text) return { error: 'Message cannot be empty.' };

    const access = await _getAccessibleConversation(conversationId, senderId);
    if (access.error) return access;

    const conversation = access.conversation;
    const senderIsBuyer = conversation.buyer_id === senderId;
    const now = new Date().toISOString();

    const { data: message, error: messageError } = await _sb
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        body: text,
      })
      .select('message_id, conversation_id, sender_id, body, read_at, created_at')
      .single();

    if (messageError) return { error: messageError.message };

    const updatePayload = {
      status: 'open',
      last_message_at: now,
      updated_at: now,
      buyer_unread_count: senderIsBuyer ? Number(conversation.buyer_unread_count) || 0 : (Number(conversation.buyer_unread_count) || 0) + 1,
      seller_unread_count: senderIsBuyer ? (Number(conversation.seller_unread_count) || 0) + 1 : Number(conversation.seller_unread_count) || 0,
    };

    const { data: updated, error: updateError } = await _sb
      .from('conversations')
      .update(updatePayload)
      .eq('conversation_id', conversationId)
      .select('conversation_id, listing_id, buyer_id, seller_id, status, buyer_unread_count, seller_unread_count, last_message_at, created_at, updated_at, listings(title, price, image_url)')
      .single();

    if (updateError) return { error: updateError.message };

    return {
      success: true,
      message: _mapMessageRecord(message),
      conversation: updated,
    };
  }

  async function markConversationRead({ conversationId, userId }) {
    const access = await _getAccessibleConversation(conversationId, userId);
    if (access.error) return access;

    const conversation = access.conversation;
    const userIsBuyer = conversation.buyer_id === userId;
    const payload = userIsBuyer ? { buyer_unread_count: 0 } : { seller_unread_count: 0 };

    const [{ error: conversationError }, { error: messagesError }] = await Promise.all([
      _sb.from('conversations').update(payload).eq('conversation_id', conversationId),
      _sb
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .neq('sender_id', userId)
        .is('read_at', null),
    ]);

    if (conversationError || messagesError) return { error: (conversationError || messagesError).message };
    return { success: true };
  }

  async function getUnreadMessageCount(userId) {
    const result = await getConversations(userId);
    if (result.error) return result;

    const count = result.conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
    return { success: true, count };
  }

  async function getFacilityNotifications(userId) {
    if (!userId) return { success: true, notifications: [], unreadCount: 0 };
    const { data, error } = await _sb
      .from('facility_notifications')
      .select('notification_id, message, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return { error: error.message };
    const notifications = (data || []).map(item => ({
      id: item.notification_id,
      message: item.message || 'Facility update',
      readAt: item.read_at,
      createdAt: item.created_at,
    }));
    return {
      success: true,
      notifications,
      unreadCount: notifications.filter(item => !item.readAt).length,
    };
  }

  async function markFacilityNotificationsRead(userId) {
    if (!userId) return { success: true };
    const { error } = await _sb
      .from('facility_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);
    if (error) return { error: error.message };
    return { success: true };
  }

  async function getRolePermissions() {
    const { data, error } = await _sb
      .from('role_permissions')
      .select('role, permission, enabled');
    if (error) return { error: error.message };
    return {
      success: true,
      permissions: (data || []).map(item => ({
        role: item.role,
        permission: item.permission,
        enabled: Boolean(item.enabled),
      })),
    };
  }

  async function getFacilityAvailability() {
    const { data: config, error: configError } = await _sb
      .from('facility_config')
      .select('operating_days, opens_at, closes_at, slot_minutes, slot_capacity')
      .eq('config_id', 'default')
      .maybeSingle();
    if (configError) return { error: configError.message };

    const { data: bookings, error: bookingsError } = await _sb
      .from('facility_bookings')
      .select('dropoff_scheduled_at, collection_scheduled_at, status')
      .in('status', ['booked', 'dropoff_scheduled', 'received', 'ready_for_collection']);
    if (bookingsError) return { error: bookingsError.message };

    const settings = {
      operatingDays: config?.operating_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      opensAt: String(config?.opens_at || '09:00').slice(0, 5),
      closesAt: String(config?.closes_at || '17:00').slice(0, 5),
      slotMinutes: Number(config?.slot_minutes) || 30,
      slotCapacity: Number(config?.slot_capacity) || 4,
    };
    const slots = _buildFacilitySlots(settings, bookings || []);
    return { success: true, settings, slots };
  }

  async function getFacilityOverview() {
    const { data, error } = await _sb
      .from('facility_bookings')
      .select('booking_id, listing_id, buyer_id, seller_id, status, dropoff_scheduled_at, collection_scheduled_at, item_received_at, ready_for_collection_at, released_at, created_at, updated_at')
      .order('dropoff_scheduled_at', { ascending: true })
      .limit(80);

    if (error) return { error: error.message };

    const bookings = data || [];
    const listingMap = await _getListingMap(bookings.map(item => item.listing_id));
    const userMap = await _getUserDisplayMap(bookings.flatMap(item => [item.buyer_id, item.seller_id]));
    const mapped = bookings.map(item => _mapFacilityBooking(item, listingMap, userMap));
    const dropoffs = mapped.filter(item => ['booked', 'dropoff_scheduled'].includes(item.status));
    const collections = mapped.filter(item => ['received', 'ready_for_collection'].includes(item.status));
    const completed = mapped.filter(item => item.status === 'released');

    return {
      success: true,
      metrics: {
        dropoffs: dropoffs.length,
        collections: collections.length,
        ready: mapped.filter(item => item.status === 'ready_for_collection').length,
        completed: completed.length,
      },
      dropoffs,
      collections,
      completed: completed.slice(0, 8),
    };
  }

  async function updateFacilityBooking({ bookingId, staffId, action, releaseToUserId }) {
    if (!bookingId || !staffId) return { error: 'Missing staff workflow details.' };
    const validActions = ['confirm_receipt', 'mark_ready', 'release_item'];
    if (!validActions.includes(action)) return { error: 'Invalid facility workflow action.' };

    const { data: booking, error: fetchError } = await _sb
      .from('facility_bookings')
      .select('booking_id, listing_id, buyer_id, seller_id, status')
      .eq('booking_id', bookingId)
      .single();

    if (fetchError) return { error: fetchError.message };
    if (!booking) return { error: 'Booking not found.' };

    const now = new Date().toISOString();
    let nextStatus;
    let updatePayload;
    let notificationUserId;
    let notificationMessage;
    let actionLabel;

    if (action === 'confirm_receipt') {
      if (!['booked', 'dropoff_scheduled'].includes(booking.status)) return { error: 'This booking is not waiting for drop-off receipt.' };
      nextStatus = 'received';
      updatePayload = { status: nextStatus, item_received_at: now, received_by: staffId, updated_at: now };
      notificationUserId = booking.seller_id;
      notificationMessage = 'Trade facility staff confirmed your item was received.';
      actionLabel = 'confirmed_receipt';
    }

    if (action === 'mark_ready') {
      if (booking.status !== 'received') return { error: 'Item must be received before it can be marked ready for collection.' };
      nextStatus = 'ready_for_collection';
      updatePayload = { status: nextStatus, ready_for_collection_at: now, ready_by: staffId, updated_at: now };
      notificationUserId = booking.buyer_id;
      notificationMessage = 'Your trade facility item is ready for collection.';
      actionLabel = 'marked_ready_for_collection';
    }

    if (action === 'release_item') {
      if (booking.status !== 'ready_for_collection') return { error: 'Item must be ready for collection before release.' };
      if (releaseToUserId && releaseToUserId !== booking.buyer_id) return { error: 'Release user does not match the expected collector.' };
      nextStatus = 'released';
      updatePayload = { status: nextStatus, released_at: now, released_by: staffId, released_to_user_id: booking.buyer_id, updated_at: now };
      notificationUserId = booking.seller_id;
      notificationMessage = 'Trade facility staff confirmed your item was released to the collector.';
      actionLabel = 'released_item';
    }

    const { data: updated, error: updateError } = await _sb
      .from('facility_bookings')
      .update(updatePayload)
      .eq('booking_id', bookingId)
      .select('booking_id, listing_id, buyer_id, seller_id, status, dropoff_scheduled_at, collection_scheduled_at, item_received_at, ready_for_collection_at, released_at, created_at, updated_at')
      .single();

    if (updateError) return { error: updateError.message };

    await Promise.all([
      _sb.from('facility_staff_actions').insert({
        booking_id: bookingId,
        staff_id: staffId,
        action: actionLabel,
        from_status: booking.status,
        to_status: nextStatus,
      }),
      _sb.from('facility_notifications').insert({
        user_id: notificationUserId,
        booking_id: bookingId,
        message: notificationMessage,
      }),
    ]);

    return { success: true, booking: updated };
  }

  async function getAdminOverview() {
    const [
      { data: users, error: usersError },
      { data: listings, error: listingsError },
      { data: facilityConfig, error: facilityConfigError },
      { data: rolePermissions, error: rolePermissionsError },
      { data: reports, error: reportsError },
      { data: moderationActions, error: moderationActionsError },
    ] = await Promise.all([
      _sb.from('users').select('id, full_name, email, account_type, user_role, username').order('email', { ascending: true }),
      _sb.from('listings').select('listing_id, seller_id, title, price, category, status, created_at').order('created_at', { ascending: false }).limit(80),
      _sb.from('facility_config').select('config_id, operating_days, opens_at, closes_at, slot_minutes, slot_capacity, updated_at').eq('config_id', 'default').maybeSingle(),
      _sb.from('role_permissions').select('role, permission, enabled').order('role', { ascending: true }).order('permission', { ascending: true }),
      _sb.from('content_reports').select('report_id, reporter_id, target_type, target_id, listing_id, reason, status, resolution_note, created_at, resolved_at').order('created_at', { ascending: false }).limit(50),
      _sb.from('moderation_actions').select('action_id, admin_id, target_type, target_id, action, note, created_at').order('created_at', { ascending: false }).limit(30),
    ]);

    const firstError = usersError || listingsError || facilityConfigError || rolePermissionsError || reportsError || moderationActionsError;
    if (firstError) return { error: firstError.message };

    const safeUsers = users || [];
    const safeListings = listings || [];
    const safeReports = reports || [];
    const safeActions = moderationActions || [];
    const roleCounts = safeUsers.reduce((acc, user) => {
      const role = user.user_role || 'student';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, { student: 0, staff: 0, admin: 0 });

    const listingCounts = safeListings.reduce((acc, listing) => {
      const status = listing.status || 'active';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, { active: 0, sold: 0, draft: 0 });

    return {
      success: true,
      metrics: {
        users: safeUsers.length,
        students: roleCounts.student || 0,
        staff: roleCounts.staff || 0,
        admins: roleCounts.admin || 0,
        listings: safeListings.length,
        activeListings: listingCounts.active || 0,
        openReports: safeReports.filter(report => report.status === 'open').length,
        resolvedReports: safeReports.filter(report => ['resolved', 'dismissed'].includes(report.status)).length,
        moderationActions: safeActions.length,
      },
      facilityConfig: {
        operatingDays: facilityConfig?.operating_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        opensAt: String(facilityConfig?.opens_at || '09:00').slice(0, 5),
        closesAt: String(facilityConfig?.closes_at || '17:00').slice(0, 5),
        slotMinutes: Number(facilityConfig?.slot_minutes) || 30,
        slotCapacity: Number(facilityConfig?.slot_capacity) || 4,
        updatedAt: facilityConfig?.updated_at || null,
      },
      rolePermissions: (rolePermissions || []).map(item => ({
        role: item.role,
        permission: item.permission,
        enabled: Boolean(item.enabled),
      })),
      reports: safeReports.map(report => ({
        id: report.report_id,
        reporterId: report.reporter_id,
        targetType: report.target_type,
        targetId: report.target_id,
        listingId: report.listing_id,
        reason: report.reason || 'No reason provided',
        status: report.status || 'open',
        resolutionNote: report.resolution_note || '',
        createdAt: report.created_at,
        resolvedAt: report.resolved_at,
      })),
      moderationActions: safeActions.map(action => ({
        id: action.action_id,
        adminId: action.admin_id,
        targetType: action.target_type,
        targetId: action.target_id,
        action: action.action,
        note: action.note || '',
        createdAt: action.created_at,
      })),
      users: safeUsers.map(user => ({
        id: user.id,
        fullName: user.full_name || user.email,
        email: user.email,
        accountType: user.account_type || 'buyer',
        userRole: user.user_role || 'student',
        username: user.username || '',
      })),
      recentListings: safeListings.map(listing => ({
        id: listing.listing_id,
        sellerId: listing.seller_id,
        title: listing.title || 'Untitled listing',
        price: Number(listing.price) || 0,
        category: listing.category || 'Other',
        status: listing.status || 'active',
        createdAt: listing.created_at,
      })),
    };
  }

  async function updateUserRole({ userId, role }) {
    if (!['student', 'staff', 'admin'].includes(role)) return { error: 'Choose a valid role.' };

    const { error } = await _sb
      .from('users')
      .update({ user_role: role })
      .eq('id', userId);

    if (error) return { error: error.message };
    return { success: true };
  }

  async function updateFacilityConfig({ adminId, operatingDays, opensAt, closesAt, slotMinutes, slotCapacity }) {
    if (!adminId) return { error: 'Missing admin account.' };
    const cleanDays = (operatingDays || []).filter(Boolean);
    if (!cleanDays.length) return { error: 'Choose at least one operating day.' };
    if (!opensAt || !closesAt || opensAt >= closesAt) return { error: 'Opening time must be before closing time.' };

    const { error } = await _sb
      .from('facility_config')
      .upsert({
        config_id: 'default',
        operating_days: cleanDays,
        opens_at: opensAt,
        closes_at: closesAt,
        slot_minutes: Number(slotMinutes) || 30,
        slot_capacity: Number(slotCapacity) || 1,
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'config_id' });

    if (error) return { error: error.message };
    await _logAdminAction({ adminId, targetType: 'facility_config', targetId: null, action: 'updated_facility_schedule', note: `Hours ${opensAt}-${closesAt}, capacity ${Number(slotCapacity) || 1}` });
    return { success: true };
  }

  async function updateRolePermission({ role, permission, enabled, adminId }) {
    if (!['student', 'staff', 'admin'].includes(role)) return { error: 'Choose a valid role.' };
    if (!permission) return { error: 'Missing permission.' };

    const { error } = await _sb
      .from('role_permissions')
      .upsert({ role, permission, enabled: Boolean(enabled), updated_at: new Date().toISOString() }, { onConflict: 'role,permission' });

    if (error) return { error: error.message };
    await _logAdminAction({ adminId, targetType: 'role_permission', targetId: null, action: 'updated_role_permission', note: `${role} ${permission}: ${Boolean(enabled) ? 'enabled' : 'disabled'}` });
    return { success: true };
  }

  async function updateContentReport({ reportId, adminId, status, note }) {
    if (!reportId || !adminId) return { error: 'Missing report details.' };
    if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) return { error: 'Choose a valid report status.' };

    const resolved = ['resolved', 'dismissed'].includes(status);
    const { error } = await _sb
      .from('content_reports')
      .update({
        status,
        resolution_note: note || null,
        resolved_by: resolved ? adminId : null,
        resolved_at: resolved ? new Date().toISOString() : null,
      })
      .eq('report_id', reportId);

    if (error) return { error: error.message };
    await _logAdminAction({ adminId, targetType: 'report', targetId: reportId, action: 'updated_report_status', note: `${status}: ${note || ''}` });
    return { success: true };
  }

  async function removeListingAsAdmin({ listingId, adminId, note }) {
    if (!listingId || !adminId) return { error: 'Missing moderation details.' };

    const { error: logError } = await _sb.from('moderation_actions').insert({
      admin_id: adminId,
      target_type: 'listing',
      target_id: listingId,
      action: 'removed_listing',
      note: note || 'Listing removed by admin',
    });
    if (logError) return { error: logError.message };

    const { error } = await _sb
      .from('listings')
      .delete()
      .eq('listing_id', listingId);

    if (error) return { error: error.message };
    return { success: true };
  }

  async function removeReviewAsAdmin({ reviewId, adminId, note }) {
    if (!reviewId || !adminId) return { error: 'Missing moderation details.' };

    const { error: logError } = await _sb.from('moderation_actions').insert({
      admin_id: adminId,
      target_type: 'review',
      target_id: reviewId,
      action: 'removed_review',
      note: note || 'Review removed by admin',
    });
    if (logError) return { error: logError.message };

    const { error } = await _sb
      .from('reviews')
      .delete()
      .eq('review_id', reviewId);

    if (error) return { error: error.message };
    return { success: true };
  }

  async function _logAdminAction({ adminId, targetType, targetId, action, note }) {
    if (!adminId) return;
    await _sb.from('moderation_actions').insert({
      admin_id: adminId,
      target_type: targetType,
      target_id: targetId,
      action,
      note: note || null,
    });
  }
 
  /* ---------- helpers ---------- */
  async function _getAccessibleConversation(conversationId, userId) {
    const { data, error } = await _sb
      .from('conversations')
      .select('conversation_id, listing_id, buyer_id, seller_id, status, buyer_unread_count, seller_unread_count, last_message_at, created_at, updated_at, listings(title, price, image_url)')
      .eq('conversation_id', conversationId)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .single();

    if (error) return { error: error.message };
    if (!data) return { error: 'You do not have access to this conversation.' };
    return { success: true, conversation: data };
  }

  async function _getUserDisplayMap(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return {};

    const { data } = await _sb
      .from('users')
      .select('id, username, full_name, email')
      .in('id', ids);

    return (data || []).reduce((map, user) => {
      map[user.id] = _formatDisplayName(user.username, user.full_name, user.email, user.id);
      return map;
    }, {});
  }

  async function _getListingMap(listingIds) {
    const ids = [...new Set((listingIds || []).filter(Boolean))];
    if (!ids.length) return {};

    const { data } = await _sb
      .from('listings')
      .select('listing_id, title, price, category, condition, image_url')
      .in('listing_id', ids);

    return (data || []).reduce((map, listing) => {
      map[listing.listing_id] = {
        title: listing.title || 'Untitled listing',
        price: Number(listing.price) || 0,
        category: listing.category || 'Other',
        condition: listing.condition || 'Not specified',
        imageUrl: listing.image_url || '',
      };
      return map;
    }, {});
  }

  function _mapFacilityBooking(booking, listingMap, userMap) {
    const listing = listingMap[booking.listing_id] || {};
    return {
      id: booking.booking_id,
      listingId: booking.listing_id,
      buyerId: booking.buyer_id,
      sellerId: booking.seller_id,
      buyerName: userMap[booking.buyer_id] || _formatDisplayName('', '', '', booking.buyer_id),
      sellerName: userMap[booking.seller_id] || _formatDisplayName('', '', '', booking.seller_id),
      status: booking.status || 'booked',
      dropoffScheduledAt: booking.dropoff_scheduled_at,
      collectionScheduledAt: booking.collection_scheduled_at,
      itemReceivedAt: booking.item_received_at,
      readyForCollectionAt: booking.ready_for_collection_at,
      releasedAt: booking.released_at,
      title: listing.title || 'Trade booking',
      price: listing.price || 0,
      category: listing.category || 'Other',
      condition: listing.condition || 'Not specified',
      imageUrl: listing.imageUrl || '',
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    };
  }

  function _normalizeUsername(value) {
    return String(value || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
  }

  function _formatDisplayName(username, fullName, email, id) {
    if (username) return `@${username}`;
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
    if (parts.length === 1) return parts[0];
    if (email) return String(email).split('@')[0];
    return id ? `User ${String(id).slice(0, 8)}` : 'User';
  }

  function _mapConversationRecord(record, currentUserId, userMap = {}) {
    const userIsBuyer = record.buyer_id === currentUserId;
    const listing = record.listings || {};
    const otherUserId = userIsBuyer ? record.seller_id : record.buyer_id;
    return {
      id: record.conversation_id,
      listingId: record.listing_id,
      buyerId: record.buyer_id,
      sellerId: record.seller_id,
      otherUserId,
      otherDisplayName: userMap[otherUserId] || _formatDisplayName('', '', '', otherUserId),
      role: userIsBuyer ? 'buyer' : 'seller',
      status: record.status || 'open',
      unreadCount: Number(userIsBuyer ? record.buyer_unread_count : record.seller_unread_count) || 0,
      listingTitle: listing.title || 'Listing conversation',
      listingPrice: Number(listing.price) || 0,
      listingImageUrl: listing.image_url || '',
      lastMessageAt: record.last_message_at || record.updated_at || record.created_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  function _mapMessageRecord(record) {
    return {
      id: record.message_id,
      conversationId: record.conversation_id,
      senderId: record.sender_id,
      body: record.body || '',
      readAt: record.read_at,
      createdAt: record.created_at,
    };
  }

  async function _getProfile(authUser) {
    const { data } = await _sb.from('users').select('*').eq('id', authUser.id).single();
    if (data) {
      return {
        id: data.id,
        fullName: data.full_name,
        username: data.username || '',
        displayName: _formatDisplayName(data.username, data.full_name, data.email || authUser.email, data.id),
        email: data.email || authUser.email,
        accountType: data.account_type || 'buyer',
        userRole: data.user_role || 'student',
        university: data.university || '',
        campus: data.uni_campus || '',
        studentNumber: data.student_number || '',
      };
    }
    const meta = authUser.user_metadata || {};
    return {
      id: authUser.id,
      fullName: meta.full_name || authUser.email,
      username: meta.username || '',
      displayName: _formatDisplayName(meta.username, meta.full_name, authUser.email, authUser.id),
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      userRole: meta.user_role || 'student',
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
      username: meta.username || '',
      displayName: _formatDisplayName(meta.username, meta.full_name, authUser.email, authUser.id),
      email: authUser.email,
      accountType: meta.account_type || 'buyer',
      userRole: meta.user_role || 'student',
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
      sellerDisplayName: listing.sellerDisplayName || _formatDisplayName('', '', '', listing.seller_id),
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
 
  function _buildFacilitySlots(settings, bookings) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const bookedBySlot = (bookings || []).reduce((map, booking) => {
      [booking.dropoff_scheduled_at, booking.collection_scheduled_at].filter(Boolean).forEach(value => {
        const key = new Date(value).toISOString().slice(0, 16);
        map[key] = (map[key] || 0) + 1;
      });
      return map;
    }, {});
    const slots = [];
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const day = new Date(today);
      day.setDate(today.getDate() + dayOffset);
      if (!settings.operatingDays.includes(dayNames[day.getDay()])) continue;
      const [openHours, openMinutes] = settings.opensAt.split(':').map(Number);
      const [closeHours, closeMinutes] = settings.closesAt.split(':').map(Number);
      const cursor = new Date(day);
      cursor.setHours(openHours, openMinutes, 0, 0);
      const close = new Date(day);
      close.setHours(closeHours, closeMinutes, 0, 0);
      while (cursor < close) {
        const key = cursor.toISOString().slice(0, 16);
        const booked = bookedBySlot[key] || 0;
        slots.push({
          startsAt: cursor.toISOString(),
          booked,
          capacity: settings.slotCapacity,
          available: Math.max(settings.slotCapacity - booked, 0),
        });
        cursor.setMinutes(cursor.getMinutes() + settings.slotMinutes);
      }
    }
    return slots;
  }

  return { signUp, signIn, verifyOTP, signOut, requireAuth, getUser, getUserInitials, updateProfile, updateCampusInfo, updatePassword, requestPasswordReset, completePasswordRecovery, getListingDashboard, getMarketplaceListings, getMyListings, createListing, updateListing, deleteListing, uploadListingImage, startConversation, getConversations, getConversationMessages, sendMessage, markConversationRead, getUnreadMessageCount, getFacilityNotifications, markFacilityNotificationsRead, getRolePermissions, getFacilityAvailability, getFacilityOverview, updateFacilityBooking, getAdminOverview, updateUserRole, updateFacilityConfig, updateRolePermission, updateContentReport, removeListingAsAdmin, removeReviewAsAdmin };
})();

if (typeof module !== 'undefined') {
  module.exports = { Auth };
}

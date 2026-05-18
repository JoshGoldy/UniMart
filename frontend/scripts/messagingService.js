import { getSupabaseClient, _userFacingError, _edgeFunctionErrorMessage } from './authService.js';
import { toListing } from './listingService.js';

export async function startConversation({ listingId, buyerId, initialMessage }) {
  const listingsResult = await getSupabaseClient().from('listings').select('*').eq('listing_id', listingId).maybeSingle();
  let listing = listingsResult.data;
  if (listingsResult.error || !listing) {
    const fallback = await getSupabaseClient().from('listings').select('*').eq('id', listingId).maybeSingle();
    listing = fallback.data;
    if (fallback.error || !listing) return { error: (fallback.error || listingsResult.error)?.message || 'Listing not found.' };
  }

  const sellerId = listing.seller_id;
  if (!sellerId || sellerId === buyerId) return { error: 'You cannot message yourself about your own listing.' };

  let { data: conversation, error: findErr } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (findErr) return { error: _userFacingError(findErr) };

  if (!conversation) {
    const inserted = await getSupabaseClient()
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

export function toOffer(row = {}) {
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

export function toTransaction(row = {}) {
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

export function toReview(row = {}) {
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

export function toContentReport(row = {}) {
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

export function toModerationAction(row = {}) {
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


async function _getConversationById(conversationId) {
  // Try conversation_id column first
  let result = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  // If that column doesn't exist or returned no row, try id column
  if (result.error || !result.data) {
    const fallback = await getSupabaseClient()
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (!fallback.error && fallback.data) return fallback;
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

  const { data, error } = await getSupabaseClient()
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

export function _uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function _conversationId(row = {}) {
  return row.conversation_id || row.id;
}

function _offerId(row = {}) {
  return row.offer_id || row.id;
}

function _offerNotificationKey(row = {}, status = row.status || 'pending') {
  const id = _offerId(row);
  return id ? `${id}:${status}` : '';
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
  offers.map(offer => _offerNotificationKey(offer)).filter(Boolean).forEach(id => seen.add(id));
  localStorage.setItem(_seenOfferNotificationKey(userId), JSON.stringify([...seen].slice(-250)));
}

function _isOfferNotificationSeen(seenOfferIds, offer = {}, status = offer.status || 'pending', includeLegacyId = false) {
  const key = _offerNotificationKey(offer, status);
  const legacyId = _offerId(offer);
  return Boolean((key && seenOfferIds.has(key)) || (includeLegacyId && legacyId && seenOfferIds.has(legacyId)));
}

function _offerResponseTimestamp(offer = {}) {
  return offer.responded_at || offer.updated_at || '';
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

function _deletedConversationKey(userId) {
  return `unimart_deleted_conversations:${userId}`;
}

function _getLocalDeletedConversationIds(userId) {
  if (typeof localStorage === 'undefined' || !userId) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(_deletedConversationKey(userId)) || '[]'));
  } catch (_) {
    return new Set();
  }
}

function _markConversationDeletedLocally(userId, conversationId) {
  if (typeof localStorage === 'undefined' || !userId || !conversationId) return;
  const deleted = _getLocalDeletedConversationIds(userId);
  deleted.add(conversationId);
  localStorage.setItem(_deletedConversationKey(userId), JSON.stringify([...deleted]));
}

async function _getDeletedConversationIds(userId) {
  const localDeleted = _getLocalDeletedConversationIds(userId);
  if (!userId) return localDeleted;

  const { data, error } = await getSupabaseClient()
    .from('conversation_deletions')
    .select('conversation_id')
    .eq('user_id', userId);

  if (error) {
    console.warn('Using local deleted conversation list:', error.message);
    return localDeleted;
  }

  return new Set([
    ...localDeleted,
    ...(data || []).map(row => row.conversation_id).filter(Boolean),
  ]);
}

function _afterLatestTimestamp(rows = [], fallback = new Date().toISOString()) {
  const latest = rows
    .flatMap(row => [row?.responded_at, row?.updated_at, row?.created_at, row?.respondedAt, row?.updatedAt, row?.createdAt])
    .map(value => new Date(value || 0).getTime())
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
  let { error } = await getSupabaseClient()
    .from('conversations')
    .update({ last_message_at: timestamp })
    .eq('conversation_id', conversationId);

  if (error && /conversation_id/i.test(error.message || '')) {
    const fallback = await getSupabaseClient()
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

  const { data, error } = await getSupabaseClient()
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

  // Keep this tolerant. The project has been run against schemas that use either
  // listing_id or id as the PK. Selecting * avoids breaking when one of those
  // columns does not exist after a schema/import reset.
  const map = {};
  for (const column of ['listing_id', 'id']) {
    const { data, error } = await getSupabaseClient()
      .from('listings')
      .select('*')
      .in(column, ids);

    if (error) {
      console.warn(`Listing hydration skipped for ${column}:`, error.message);
      continue;
    }

    (data || []).forEach(listing => {
      const normalised = {
        ...listing,
        title: listing.title || 'Listing',
        image_url: listing.image_url || listing.imageUrl || '',
        status: listing.status || null,
      };
      if (normalised.listing_id) map[normalised.listing_id] = normalised;
      if (normalised.id) map[normalised.id] = normalised;
    });
  }

  return map;
}

function _isSoldListingStatus(status) {
  // Only filter out conversations where we positively know the listing is sold.
  // When status is null (listing lookup failed), keep the conversation visible
  // so buyers can still see their inbox after making an offer.
  if (!status) return false;
  return String(status).trim().toLowerCase() === 'sold';
}

async function _countUnreadMessagesForConversation(conversationId, currentUserId) {
  const id = String(conversationId || '');
  const countUnread = async column => {
    return getSupabaseClient()
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq(column, id)
      .neq('sender_id', currentUserId)
      .is('read_at', null);
  };

  let result = await countUnread('conversation_id');
  // Only fall back if there was an actual column error, not just zero results
  if (result.error && /invalid input syntax|uuid|column.*does not exist/i.test(result.error.message || '')) {
    const fallback = await countUnread('id');
    if (!fallback.error) result = fallback;
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
    listingStatus: listing.status || row.listing_status || null,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    otherUserId: isBuyer ? row.seller_id : row.buyer_id,
    otherDisplayName: other.username || other.full_name || other.email || null,
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
    const listingKey = row.listing_id;
    const listing = listingsById[listingKey] || {};

    return toConversation({
      ...row,
      listing,
      buyer: usersById[row.buyer_id] || {},
      seller: usersById[row.seller_id] || {},
      unread_count: unreadCount,
    }, currentUserId);
  }));
}

export async function getConversations(userId) {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (error) return { error: _userFacingError(error) };

  const deletedConversationIds = await _getDeletedConversationIds(userId);
  const conversations = (await _hydrateConversations(data || [], userId))
    .filter(conversation => !deletedConversationIds.has(conversation.id))
    .filter(conversation => !_isSoldListingStatus(conversation.listingStatus));
  return { conversations };
}

export async function getUnreadMessageNotifications(userId) {
  const { data: conversationRows, error: conversationError } = await getSupabaseClient()
    .from('conversations')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('last_message_at', { ascending: false });

  if (conversationError) return { error: _userFacingError(conversationError), total: 0, notifications: [] };

  const deletedConversationIds = await _getDeletedConversationIds(userId);
  const conversations = (conversationRows || []).filter(row => !deletedConversationIds.has(_conversationId(row)));
  const conversationIds = _uniqueValues(conversations.map(row => _conversationId(row)));
  if (!conversationIds.length) return { total: 0, notifications: [] };

  let { data: unreadRows, error: unreadError } = await getSupabaseClient()
    .from('messages')
    .select('id,conversation_id,sender_id,body,created_at,read_at')
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (unreadError && /column .*id|id .*does not exist/i.test(unreadError.message || '')) {
    const fallback = await getSupabaseClient()
      .from('messages')
      .select('message_id,conversation_id,sender_id,body,created_at,read_at')
      .in('conversation_id', conversationIds)
      .neq('sender_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    unreadRows = fallback.data;
    unreadError = fallback.error;
  }

  const { data: pendingOfferRows, error: offerError } = await getSupabaseClient()
    .from('offers')
    .select('*')
    .eq('seller_id', userId)
    .in('conversation_id', conversationIds)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: buyerActionRows, error: buyerActionError } = await getSupabaseClient()
    .from('offers')
    .select('*')
    .eq('buyer_id', userId)
    .in('conversation_id', conversationIds)
    .in('status', ['accepted', 'declined'])
    .order('updated_at', { ascending: false })
    .limit(50);

  if (unreadError && offerError && buyerActionError) return { error: _userFacingError(unreadError), total: 0, notifications: [] };
  if (unreadError) console.warn('Falling back to offer notifications only:', unreadError.message);
  if (offerError) console.warn('Unable to load offer notifications:', offerError.message);
  if (buyerActionError) console.warn('Unable to load buyer action notifications:', buyerActionError.message);

  const unreadByConversation = new Map();
  (unreadRows || []).forEach(message => {
    const id = message.conversation_id;
    if (!unreadByConversation.has(id)) unreadByConversation.set(id, []);
    unreadByConversation.get(id).push(message);
  });

  const pendingOffersByConversation = new Map();
  const seenOfferIds = _getSeenOfferNotificationIds(userId);
  (pendingOfferRows || [])
    .filter(offer => !_isOfferNotificationSeen(seenOfferIds, offer, 'pending', true))
    .filter(offer => _isAfterLocalRead(userId, offer.conversation_id, offer.created_at))
    .forEach(offer => {
    if (!pendingOffersByConversation.has(offer.conversation_id)) pendingOffersByConversation.set(offer.conversation_id, []);
    pendingOffersByConversation.get(offer.conversation_id).push(offer);
  });

  const buyerActionsByConversation = new Map();
  (buyerActionRows || [])
    .filter(offer => !_isOfferNotificationSeen(seenOfferIds, offer, offer.status, false))
    .filter(offer => {
      const respondedAt = _offerResponseTimestamp(offer);
      return respondedAt ? _isAfterLocalRead(userId, offer.conversation_id, respondedAt) : true;
    })
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
    .filter(row => !_isSoldListingStatus(listingsById[row.listing_id]?.status))
    .flatMap(row => {
      const conversationId = _conversationId(row);
      const unreadMessages = unreadByConversation.get(conversationId) || [];
      const pendingOffers = pendingOffersByConversation.get(conversationId) || [];
      const buyerActions = buyerActionsByConversation.get(conversationId) || [];
      if (!unreadMessages.length && !pendingOffers.length && !buyerActions.length) return [];

      const conversation = toConversation({
        ...row,
        listing: listingsById[row.listing_id] || {},
        buyer: usersById[row.buyer_id] || {},
        seller: usersById[row.seller_id] || {},
        unread_count: 1,
      }, userId);

      const messageNotifications = unreadMessages.map(message => ({
        ...conversation,
        notificationId: message.id || message.message_id,
        notificationKind: 'message',
        unreadCount: 1,
        preview: message.body || '',
        lastMessageAt: message.created_at || conversation.lastMessageAt,
      }));

      const offerNotifications = pendingOffers.map(offer => {
        const offerAmount = offer?.amount ? `R ${Number(offer.amount).toLocaleString('en-ZA')}` : 'a trade';
        return {
          ...conversation,
          notificationId: _offerNotificationKey(offer, 'pending'),
          notificationKind: 'offer',
          unreadCount: 1,
          preview: `New offer: ${offerAmount}`,
          lastMessageAt: offer.created_at || conversation.lastMessageAt,
        };
      });

      const actionNotifications = buyerActions.map(offer => ({
        ...conversation,
        notificationId: _offerNotificationKey(offer, offer.status),
        notificationKind: 'offer-response',
        unreadCount: 1,
        preview: `Offer ${offer.status}`,
        lastMessageAt: _offerResponseTimestamp(offer) || offer.created_at || conversation.lastMessageAt,
      }));

      return [...messageNotifications, ...offerNotifications, ...actionNotifications];
    })
    .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

  return {
    total: notifications.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    notifications,
  };
}

export async function deleteConversationForUser({ conversationId, userId } = {}) {
  if (!conversationId || !userId) return { error: 'Choose a conversation to delete.' };

  const convResult = await _getConversationById(conversationId);
  if (convResult.error) return { error: _userFacingError(convResult.error) };
  const conversation = convResult.data;
  if (!conversation || ![conversation.buyer_id, conversation.seller_id].includes(userId)) {
    return { error: 'Conversation not found.' };
  }

  _markConversationDeletedLocally(userId, conversationId);
  _markConversationReadLocally(userId, conversationId);

  const { error } = await getSupabaseClient()
    .from('conversation_deletions')
    .upsert(
      { conversation_id: conversationId, user_id: userId, deleted_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' },
    );

  if (error) {
    console.warn('Conversation hidden locally only:', error.message);
    return { success: true, localOnly: true };
  }
  return { success: true };
}

export async function getConversationMessages({ conversationId, userId, markRead = false }) {
  try {
    const convResult = await _getConversationById(conversationId);

    if (convResult.error) return { error: _userFacingError(convResult.error) };
    const conversationRow = convResult.data;
    if (!conversationRow || ![conversationRow.buyer_id, conversationRow.seller_id].includes(userId)) {
      return { error: 'Conversation not found.' };
    }

    const resolvedConversationId = _conversationId(conversationRow);

    if (markRead) {
      _markConversationReadLocally(userId, resolvedConversationId);
      const readResult = await getSupabaseClient()
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conversation_id', resolvedConversationId)
        .neq('sender_id', userId)
        .is('read_at', null);
      if (readResult?.error) console.warn('Could not mark messages as read:', readResult.error.message);
    }

    let { data, error } = await getSupabaseClient()
      .from('messages')
      .select('*')
      .eq('conversation_id', resolvedConversationId)
      .order('created_at', { ascending: true });

    if (error) return { error: _userFacingError(error) };

    // Optional messaging side-panels must never stop the core message thread
    // from rendering. After auth.js was split, several environments had some
    // of these tables/columns missing, which left the UI stuck on "Loading".
    let offersResult = { data: [], error: null };
    try {
      offersResult = await getSupabaseClient()
        .from('offers')
        .select('*')
        .eq('conversation_id', resolvedConversationId)
        .order('created_at', { ascending: false });
      if (offersResult.error) console.warn('Offers unavailable for this thread:', offersResult.error.message);
    } catch (err) {
      console.warn('Offers unavailable for this thread:', err?.message || err);
    }

    if (markRead && !offersResult.error) {
      const visibleOfferNotifications = (offersResult.data || []).filter(offer => {
        if (conversationRow.seller_id === userId) return offer.status === 'pending';
        if (conversationRow.buyer_id === userId) return ['accepted', 'declined'].includes(offer.status);
        return false;
      });
      _markOfferNotificationsSeen(userId, visibleOfferNotifications);
      _markConversationReadLocally(userId, resolvedConversationId, _afterLatestTimestamp([
        ...(data || []),
        ...(offersResult.data || []),
      ]));
    }

    let transactionsResult = { data: [], error: null };
    try {
      transactionsResult = await getSupabaseClient()
        .from('transactions')
        .select('*')
        .eq('conversation_id', resolvedConversationId)
        .order('created_at', { ascending: false });
      if (transactionsResult.error) console.warn('Transactions unavailable for this thread:', transactionsResult.error.message);
    } catch (err) {
      console.warn('Transactions unavailable for this thread:', err?.message || err);
    }

    let transactions = transactionsResult.error ? [] : (transactionsResult.data || []).map(toTransaction);
    let transactionIds = transactions.map(transaction => transaction.id).filter(Boolean);
    const bookingIds = transactions.map(transaction => transaction.facilityBookingId).filter(Boolean);
    if (bookingIds.length || transactionIds.length) {
      try {
        let bookingQuery = getSupabaseClient().from('facility_bookings').select('*');
        if (bookingIds.length) bookingQuery = bookingQuery.in('booking_id', bookingIds);
        else bookingQuery = bookingQuery.in('transaction_id', transactionIds);
        const bookingsResult = await bookingQuery;
        let bookingRows = bookingsResult.error ? [] : (bookingsResult.data || []);
        if (bookingIds.length && transactionIds.length) {
          const byTransactionResult = await getSupabaseClient()
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
      } catch (err) {
        console.warn('Facility booking details unavailable for this thread:', err?.message || err);
      }
    }

    transactionIds = transactions.map(transaction => transaction.id).filter(Boolean);
    let reviewsResult = { data: [], error: null };
    if (transactionIds.length) {
      try {
        reviewsResult = await getSupabaseClient()
          .from('reviews')
          .select('*')
          .in('transaction_id', transactionIds)
          .order('created_at', { ascending: false });
        if (reviewsResult.error) console.warn('Reviews unavailable for this thread:', reviewsResult.error.message);
      } catch (err) {
        console.warn('Reviews unavailable for this thread:', err?.message || err);
      }
    }

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
  } catch (err) {
    console.error('Failed to load conversation messages:', err);
    return { error: _userFacingError(err, 'Messages could not be loaded. Please refresh and try again.') };
  }
}

export async function updateOfferStatus({ offerId, userId, status }) {
  if (!['accepted', 'declined'].includes(status)) return { error: 'Unknown offer action.' };

  const { data: offerRow, error: offerError } = await getSupabaseClient()
    .from('offers')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();
  if (offerError) return { error: _userFacingError(offerError) };
  if (!offerRow) return { error: 'Offer not found.' };
  if (offerRow.seller_id !== userId) return { error: 'Only the seller can respond to this offer.' };
  if (offerRow.status !== 'pending') return { error: 'This offer has already been handled.' };

  const now = new Date().toISOString();
  const { data: updatedOffer, error: updateError } = await getSupabaseClient()
    .from('offers')
    .update({ status, responded_at: now, updated_at: now })
    .eq('offer_id', offerId)
    .select()
    .single();
  if (updateError) return { error: _userFacingError(updateError) };

  let transaction = null;
  if (status === 'accepted') {
    await getSupabaseClient()
      .from('offers')
      .update({ status: 'declined', updated_at: now })
      .eq('conversation_id', offerRow.conversation_id)
      .neq('offer_id', offerId)
      .eq('status', 'pending');

    const inserted = await getSupabaseClient()
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

  const { data: transactionRow, error: transactionError } = await getSupabaseClient()
    .from('transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .maybeSingle();
  if (transactionError) return { error: _userFacingError(transactionError) };
  if (!transactionRow) return { error: 'Transaction not found.' };

  const transaction = toTransaction(transactionRow);
  if (transaction.buyerId !== buyerId) return { error: 'Only the buyer can make this payment.' };
  const { data: offerRow, error: offerError } = await getSupabaseClient()
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

  const { data: paymentRow, error: paymentError } = await getSupabaseClient()
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

  await getSupabaseClient()
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

  const checkoutResult = await getSupabaseClient().functions.invoke('create-paystack-checkout', {
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
  const result = await getSupabaseClient().functions.invoke('verify-paystack-payment', {
    body: { transactionId, reference },
  });
  if (result.error) return { error: await _edgeFunctionErrorMessage(result.error, 'Payment could not be verified yet.') };
  if (result.data?.error) return { error: result.data.error };
  return { success: true, payment: result.data?.payment, transaction: result.data?.transaction };
}

export async function markTransactionCashSettled({ transactionId, staffId } = {}) {
  if (!transactionId || !staffId) return { error: 'Missing cash settlement details.' };
  const { error } = await getSupabaseClient()
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

  const { data, error } = await getSupabaseClient()
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
  const { data, error } = await getSupabaseClient()
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
  const cleanBody = String(body || '').trim();
  if (!conversationId || !senderId || !cleanBody) return { error: 'Message cannot be empty.' };

  const payloads = [
    { conversation_id: conversationId, sender_id: senderId, body: cleanBody, created_at: now },
    { conversation_id: conversationId, sender_id: senderId, message: cleanBody, created_at: now },
    { conversation_id: conversationId, sender_id: senderId, content: cleanBody, created_at: now },
  ];

  let lastError = null;
  for (const payload of payloads) {
    const { data, error } = await getSupabaseClient()
      .from('messages')
      .insert(payload)
      .select()
      .single();

    if (!error) {
      await _updateConversationTimestamp(conversationId, now);
      return { success: true, message: data };
    }

    lastError = error;
    if (!/column .* does not exist|schema cache|Could not find.*column/i.test(error.message || '')) break;
  }

  return { error: _userFacingError(lastError) };
}


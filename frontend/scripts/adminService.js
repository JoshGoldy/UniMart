import { _sb, _userFacingError } from './authService.js';
import { toUser, toListing, updateListingById } from './listingService.js';
import { toTransaction, toReview, toContentReport, toModerationAction, _uniqueValues } from './messagingService.js';

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
  if (collection && collection < dropoff) return { error: 'Collection cannot be before the handover time.' };

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
  if (Number.isFinite(dropoff.getTime()) && collection < dropoff) return { error: 'Collection cannot be before the handover time.' };

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


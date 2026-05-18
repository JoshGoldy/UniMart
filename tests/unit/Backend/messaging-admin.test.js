/**
 * Backend tests for auth.js — Messaging, Reviews, Reports, Admin & Facility
 * Covers: sendMessage, createReview, reportContent, getRolePermissions,
 *         updateRolePermission, updateUserRole, removeListingAsAdmin,
 *         removeReviewAsAdmin, updateContentReport, updateFacilityConfig,
 *         createFacilityBooking, confirmFacilityCollection
 */

import { jest } from '@jest/globals';
import {
  initializeSupabase,
  sendMessage,
  createReview,
  reportContent,
  getRolePermissions,
  updateRolePermission,
  updateUserRole,
  removeListingAsAdmin,
  removeReviewAsAdmin,
  updateContentReport,
  updateFacilityConfig,
  createFacilityBooking,
  confirmFacilityCollection,
} from '../../../frontend/scripts/auth.js';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function mkAuth() {
  return {
    signUp: jest.fn(), signInWithPassword: jest.fn(), signInWithOAuth: jest.fn(),
    signOut: jest.fn(), getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    updateUser: jest.fn(), verifyOtp: jest.fn(), resetPasswordForEmail: jest.fn(), resend: jest.fn(),
  };
}

function mkChain(resolvedData = null, resolvedError = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: resolvedError }),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    single: jest.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
  };
  return chain;
}

function mkSb(fromFn) {
  return {
    createClient: jest.fn().mockReturnValue({
      auth: mkAuth(),
      from: fromFn || jest.fn().mockReturnValue(mkChain()),
      storage: { from: jest.fn().mockReturnValue({ upload: jest.fn().mockResolvedValue({ error: null }), getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }) }) },
    }),
  };
}

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  test('returns success with message data on insert', async () => {
    const msgData = { id: 'm1', conversation_id: 'c1', sender_id: 'u1', body: 'Hello!' };
    const chain = {
      insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: msgData, error: null }),
      update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }),
    };
    initializeSupabase(mkSb(() => chain));
    const r = await sendMessage({ conversationId: 'c1', senderId: 'u1', body: 'Hello!' });
    expect(r.success).toBe(true);
    expect(r.message).toBeDefined();
  });

  test('returns error when insert fails', async () => {
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await sendMessage({ conversationId: 'c1', senderId: 'u1', body: 'Hi' })).error).toBeDefined();
  });
});

// ─── createReview ─────────────────────────────────────────────────────────────

describe('createReview', () => {
  test('returns error when required fields are missing', async () => {
    initializeSupabase(mkSb());
    expect((await createReview({ rating: 5 })).error).toBe('Missing review details.');
  });

  test('returns error for rating above 5', async () => {
    initializeSupabase(mkSb());
    expect((await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating: 6 })).error).toContain('1 and 5');
  });

  test('returns error for rating below 1', async () => {
    initializeSupabase(mkSb());
    expect((await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating: 0 })).error).toContain('1 and 5');
  });

  test('returns error for non-integer rating like 4.5', async () => {
    initializeSupabase(mkSb());
    expect((await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating: 4.5 })).error).toContain('1 and 5');
  });

  test('returns success with review data for valid integer rating 1–5', async () => {
    const reviewData = { id: 'r1', transaction_id: 't1', reviewer_id: 'u1', reviewee_id: 'u2', listing_id: 'l1', rating: 5, body: 'Great!', status: 'visible' };
    const chain = { upsert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: reviewData, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating: 5, body: 'Great!' });
    expect(r.success).toBe(true);
    expect(r.review).toBeDefined();
  });

  test('returns error when DB upsert fails', async () => {
    const chain = { upsert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'duplicate' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating: 4 })).error).toBeDefined();
  });

  test('accepts all valid integer ratings 1 through 5', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const reviewData = { id: `r${rating}`, rating, status: 'visible' };
      const chain = { upsert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: reviewData, error: null }) };
      initializeSupabase(mkSb(() => chain));
      const r = await createReview({ transactionId: 't1', reviewerId: 'u1', revieweeId: 'u2', listingId: 'l1', rating });
      expect(r.success).toBe(true);
    }
  });
});

// ─── reportContent ────────────────────────────────────────────────────────────

describe('reportContent', () => {
  test('returns error when targetId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await reportContent({ reporterId: 'u1', reason: 'spam' })).error).toBeDefined();
  });

  test('returns error when reason is missing', async () => {
    initializeSupabase(mkSb());
    expect((await reportContent({ reporterId: 'u1', targetId: 'l1', targetType: 'listing' })).error).toBeDefined();
  });

  test('returns error when reporterId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await reportContent({ targetId: 'l1', targetType: 'listing', reason: 'spam' })).error).toBeDefined();
  });

  test('returns success for valid listing report', async () => {
    const reportData = { id: 'rep1', reporter_id: 'u1', target_type: 'listing', target_id: 'l1', reason: 'spam', status: 'open' };
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: reportData, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await reportContent({ reporterId: 'u1', targetType: 'listing', targetId: 'l1', reason: 'spam' });
    expect(r.success).toBe(true);
    expect(r.report).toBeDefined();
  });

  test('sanitizes unknown targetType to listing', async () => {
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'r1', target_type: 'listing' }, error: null }) };
    const from = jest.fn().mockReturnValue(chain);
    initializeSupabase(mkSb(from));
    await reportContent({ reporterId: 'u1', targetType: 'user_profile', targetId: 'u2', reason: 'harassment' });
    expect(chain.insert.mock.calls[0][0].target_type).toBe('listing');
  });

  test('returns error when DB insert fails', async () => {
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'constraint' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await reportContent({ reporterId: 'u1', targetType: 'review', targetId: 'r1', reason: 'fake' })).error).toBeDefined();
  });
});

// ─── getRolePermissions ───────────────────────────────────────────────────────

describe('getRolePermissions', () => {
  test('returns permissions array from DB on success', async () => {
    const perms = [{ role: 'student', permission: 'marketplace_browsing', enabled: true }];
    const chain = { select: jest.fn().mockResolvedValue({ data: perms, error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getRolePermissions()).permissions).toEqual(perms);
  });

  test('returns empty array on DB error', async () => {
    const chain = { select: jest.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getRolePermissions()).permissions).toEqual([]);
  });

  test('returns empty array when data is null without error', async () => {
    const chain = { select: jest.fn().mockResolvedValue({ data: null, error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getRolePermissions()).permissions).toEqual([]);
  });
});

// ─── updateRolePermission ─────────────────────────────────────────────────────

describe('updateRolePermission', () => {
  test('returns success when upsert succeeds', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateRolePermission({ role: 'student', permission: 'messaging', enabled: true })).success).toBe(true);
  });

  test('returns error when upsert fails', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: { message: 'forbidden' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateRolePermission({ role: 'student', permission: 'messaging', enabled: false })).error).toBeDefined();
  });
});

// ─── updateUserRole ───────────────────────────────────────────────────────────

describe('updateUserRole', () => {
  test('returns success when role update succeeds', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateUserRole({ userId: 'u1', role: 'admin' })).success).toBe(true);
  });

  test('returns error when role update fails', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: { message: 'denied' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateUserRole({ userId: 'u1', role: 'admin' })).error).toBeDefined();
  });
});

// ─── removeListingAsAdmin ─────────────────────────────────────────────────────

describe('removeListingAsAdmin', () => {
  test('returns success when listing status update and action log both succeed', async () => {
    const chain = mkChain({});
    chain.eq = jest.fn().mockReturnValue({ ...chain, then: (r) => r({ error: null }) });
    initializeSupabase(mkSb(() => chain));
    expect((await removeListingAsAdmin({ listingId: 'l1', adminId: 'a1', note: 'Spam' })).success).toBe(true);
  });

  test('returns error when all listing status update attempts fail', async () => {
    // updateListingById does .update().eq().select().maybeSingle() — need full chain
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const chain = {
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue({ maybeSingle }),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
      upsert: jest.fn().mockResolvedValue({ error: { message: 'not found' } }),
      order: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };
    initializeSupabase(mkSb(() => chain));
    expect((await removeListingAsAdmin({ listingId: 'bad', adminId: 'a1', note: '' })).error).toBeDefined();
  });
});

// ─── removeReviewAsAdmin ──────────────────────────────────────────────────────

describe('removeReviewAsAdmin', () => {
  test('returns error when review update fails (e.g. bad reviewId)', async () => {
    const chain = { update: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: { message: 'not found' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await removeReviewAsAdmin({ reviewId: 'bad', adminId: 'a1', note: '' })).error).toBeDefined();
  });

  test('returns success when review update succeeds', async () => {
    const chain = mkChain({});
    chain.eq = jest.fn().mockReturnValue({ ...chain, then: (r) => r({ error: null }) });
    initializeSupabase(mkSb(() => chain));
    expect((await removeReviewAsAdmin({ reviewId: 'r1', adminId: 'a1', note: 'Inappropriate' })).success).toBe(true);
  });
});

// ─── updateContentReport ──────────────────────────────────────────────────────

describe('updateContentReport', () => {
  test('returns error when reportId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await updateContentReport({ adminId: 'a1', status: 'resolved' })).error).toBeDefined();
  });

  test('returns success on valid report status update', async () => {
    // updateContentReport tries .update().eq().select() and checks result.data.length
    const chain = mkChain({});
    // Make the chain's awaitable resolve with data array present
    chain.select = jest.fn().mockResolvedValue({ data: [{ id: 'rep1', status: 'resolved' }], error: null });
    initializeSupabase(mkSb(() => chain));
    expect((await updateContentReport({ reportId: 'rep1', adminId: 'a1', status: 'resolved', note: 'Handled' })).success).toBe(true);
  });
  
  test('returns report-not-found error when no rows match', async () => {
    const chain = mkChain({});
    chain.select = jest.fn().mockResolvedValue({ data: [], error: null });
    initializeSupabase(mkSb(() => chain));
    expect((await updateContentReport({ reportId: 'nonexistent', adminId: 'a1', status: 'resolved', note: '' })).error).toBeDefined();
  });
});

// ─── updateFacilityConfig ─────────────────────────────────────────────────────

describe('updateFacilityConfig', () => {
  test('uses defaults when opensAt is missing and succeeds', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateFacilityConfig({})).success).toBe(true);
  });

  test('returns success on valid facility config update', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await updateFacilityConfig({
      opensAt: '08:00', closesAt: '18:00', slotMinutes: 30,
      slotCapacity: 2, operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    });
    expect(r.success).toBe(true);
  });

  test('returns error when DB upsert fails', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: { message: 'config error' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await updateFacilityConfig({ opensAt: '09:00', closesAt: '17:00', slotMinutes: 30, slotCapacity: 1, operatingDays: ['monday'] })).error).toBeDefined();
  });
});

// ─── createFacilityBooking ────────────────────────────────────────────────────

describe('createFacilityBooking', () => {
  test('returns error when transactionId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await createFacilityBooking({ listingId: 'l1', actorId: 'u1', buyerId: 'u2' })).error).toBeDefined();
  });

  test('returns error when listingId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await createFacilityBooking({ transactionId: 't1', actorId: 'u1', buyerId: 'u2' })).error).toBeDefined();
  });

  test('returns transaction-not-found error when transaction lookup returns null', async () => {
    const chain = mkChain(null);  // maybeSingle returns null → transaction not found
    chain.eq = jest.fn().mockReturnValue({ ...chain, then: (r) => r({ error: null }) });
    initializeSupabase(mkSb(() => chain));
    const r = await createFacilityBooking({
      transactionId: 't1', listingId: 'l1', actorId: 'u1', buyerId: 'u2',
      dropoffScheduledAt: new Date().toISOString(), collectionScheduledAt: new Date().toISOString(),
    });
    expect(r.error).toBeDefined();
  });
});

// ─── confirmFacilityCollection ────────────────────────────────────────────────

describe('confirmFacilityCollection', () => {
  test('returns error when transactionId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await confirmFacilityCollection({ bookingId: 'b1', buyerId: 'u2' })).error).toBeDefined();
  });

  test('returns error when buyerId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await confirmFacilityCollection({ transactionId: 't1', bookingId: 'b1' })).error).toBeDefined();
  });

  test('returns booking-not-found error when booking lookup returns null', async () => {
    const chain = mkChain(null);  // maybeSingle returns null → booking not found
    initializeSupabase(mkSb(() => chain));
    const r = await confirmFacilityCollection({
      transactionId: 't1', bookingId: 'b1', buyerId: 'u2',
      collectionScheduledAt: new Date().toISOString(),
    });
    expect(r.error).toBeDefined();
  });
});

/**
 * Backend tests for auth.js — Listing & Marketplace functions
 * Covers: getMarketplaceListings, getSavedListingIds, saveListing, unsaveListing,
 *         getMyListings, createListing, updateListing, deleteListing,
 *         uploadListingImage, getListingDashboard
 */

import { jest } from '@jest/globals';
import {
  initializeSupabase,
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
} from '../../../frontend/scripts/auth.js';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function mkAuth() {
  return {
    signUp: jest.fn(), signInWithPassword: jest.fn(), signInWithOAuth: jest.fn(),
    signOut: jest.fn(), getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    updateUser: jest.fn(), verifyOtp: jest.fn(), resetPasswordForEmail: jest.fn(), resend: jest.fn(),
  };
}

function mkFullChain(overrides = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue({ error: null }),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return chain;
}

function mkSb(fromFn, storageFn) {
  return {
    createClient: jest.fn().mockReturnValue({
      auth: mkAuth(),
      from: fromFn || jest.fn().mockReturnValue(mkFullChain()),
      storage: storageFn || {
        from: jest.fn().mockReturnValue({
          upload: jest.fn().mockResolvedValue({ error: null }),
          getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/img.jpg' } }),
        }),
      },
    }),
  };
}

const NOW = new Date().toISOString();

// ─── getMarketplaceListings ───────────────────────────────────────────────────

describe('getMarketplaceListings', () => {
  test('returns listings array when primary query succeeds', async () => {
    const rows = [{ id: 'l1', title: 'Calculus Book', price: 150, status: 'active', seller_id: 'u1', category: 'books', created_at: NOW }];
    const chain = mkFullChain({
      order: jest.fn().mockResolvedValue({ data: rows, error: null }),
      in: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    initializeSupabase(mkSb(() => chain));
    const result = await getMarketplaceListings();
    expect(Array.isArray(result.listings)).toBe(true);
  });

  test('falls back to simple query when join query fails', async () => {
    let call = 0;
    const from = jest.fn(() => {
      const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
      chain.order = jest.fn().mockResolvedValue(
        call++ === 0 ? { data: null, error: { message: 'join failed' } } : { data: [], error: null }
      );
      return chain;
    });
    initializeSupabase(mkSb(from));
    const result = await getMarketplaceListings();
    expect(result.listings).toBeDefined();
  });

  test('returns error when both queries fail', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) };
    initializeSupabase(mkSb(() => chain));
    const result = await getMarketplaceListings();
    expect(result.error).toBeDefined();
  });
});

// ─── getSavedListingIds ───────────────────────────────────────────────────────

describe('getSavedListingIds', () => {
  test('returns empty array immediately when userId is null', async () => {
    initializeSupabase(mkSb());
    expect((await getSavedListingIds(null)).listingIds).toEqual([]);
  });

  test('returns listing ID array for a valid user', async () => {
    const rows = [{ listing_id: 'l1' }, { listing_id: 'l2' }];
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: rows, error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getSavedListingIds('user-1')).listingIds).toEqual(['l1', 'l2']);
  });

  test('returns error and empty array on DB failure', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getSavedListingIds('user-1');
    expect(r.error).toBeDefined();
    expect(r.listingIds).toEqual([]);
  });
});

// ─── saveListing ──────────────────────────────────────────────────────────────

describe('saveListing', () => {
  test('returns error when userId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await saveListing({ listingId: 'l1' })).error).toBeDefined();
  });

  test('returns error when listingId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await saveListing({ userId: 'u1' })).error).toBeDefined();
  });

  test('returns success when upsert succeeds', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: null }) };
    initializeSupabase(mkSb(() => chain));
    expect((await saveListing({ userId: 'u1', listingId: 'l1' })).success).toBe(true);
  });

  test('returns error when upsert fails', async () => {
    const chain = { upsert: jest.fn().mockResolvedValue({ error: { message: 'conflict' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await saveListing({ userId: 'u1', listingId: 'l1' })).error).toBeDefined();
  });
});

// ─── unsaveListing ────────────────────────────────────────────────────────────

describe('unsaveListing', () => {
  test('returns error when userId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await unsaveListing({ listingId: 'l1' })).error).toBeDefined();
  });

  test('returns error when listingId is missing', async () => {
    initializeSupabase(mkSb());
    expect((await unsaveListing({ userId: 'u1' })).error).toBeDefined();
  });

  test('returns success when delete chain resolves without error', async () => {
    let eqCount = 0;
    const chain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation(() => {
        eqCount++;
        return eqCount >= 2 ? Promise.resolve({ error: null }) : chain;
      }),
    };
    initializeSupabase(mkSb(() => chain));
    expect((await unsaveListing({ userId: 'u1', listingId: 'l1' })).success).toBe(true);
  });
});

// ─── getMyListings ────────────────────────────────────────────────────────────

describe('getMyListings', () => {
  test('returns listings array for a valid seller', async () => {
    const rows = [{ id: 'l1', title: 'Book', price: 100, status: 'active', seller_id: 'u1', category: 'books', created_at: NOW }];
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: rows, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getMyListings('u1');
    expect(r.listings).toBeDefined();
    expect(r.listings.length).toBe(1);
  });

  test('returns error on DB failure', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getMyListings('u1')).error).toBeDefined();
  });
});

// ─── createListing ────────────────────────────────────────────────────────────

describe('createListing', () => {
  const payload = { title: 'Physics Textbook', price: 200, description: 'Good condition', category: 'books', sellerId: 'u1', condition: 'good', status: 'active' };

  test('returns success with listing data on creation', async () => {
    const newRow = { id: 'l-new', ...payload, created_at: NOW };
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: newRow, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await createListing(payload);
    expect(r.success).toBe(true);
    expect(r.listing).toBeDefined();
  });

  test('returns error when insert fails', async () => {
    const chain = { insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'constraint violation' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await createListing(payload)).error).toBeDefined();
  });
});

// ─── updateListing ────────────────────────────────────────────────────────────

describe('updateListing', () => {
  const payload = { listingId: 'l1', sellerId: 'u1', title: 'Updated Book', price: 250, category: 'books', condition: 'good', status: 'active' };

  test('returns success on valid update', async () => {
    const chain = mkFullChain({ maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'l1' }, error: null }), single: jest.fn().mockResolvedValue({ data: { id: 'l1' }, error: null }) });
    initializeSupabase(mkSb(() => chain));
    expect((await updateListing(payload)).success).toBe(true);
  });

  test('returns error on DB failure', async () => {
    const chain = mkFullChain({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'update error' } }), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'update error' } }) });
    initializeSupabase(mkSb(() => chain));
    expect((await updateListing(payload)).error).toBeDefined();
  });
});

// ─── deleteListing ────────────────────────────────────────────────────────────

describe('deleteListing', () => {
  test('returns success when delete resolves without error', async () => {
    const chain = mkFullChain();
    // final await resolves to no-error
    chain.eq = jest.fn().mockReturnValue({ ...chain, then: (r) => r({ error: null }) });
    initializeSupabase(mkSb(() => chain));
    expect((await deleteListing({ listingId: 'l1', sellerId: 'u1' })).success).toBe(true);
  });

  test('returns error when delete fails', async () => {
    const chain = mkFullChain();
    chain.eq = jest.fn().mockReturnValue({ ...chain, then: (r) => r({ error: { message: 'Cannot delete' } }) });
    initializeSupabase(mkSb(() => chain));
    expect((await deleteListing({ listingId: 'l1', sellerId: 'u1' })).error).toBeDefined();
  });
});

// ─── uploadListingImage ───────────────────────────────────────────────────────

describe('uploadListingImage', () => {
  test('returns empty imageUrl when file is null', async () => {
    initializeSupabase(mkSb());
    expect((await uploadListingImage(null, 'u1')).imageUrl).toBe('');
  });

  test('returns publicUrl on successful upload', async () => {
    const fakeFile = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const storageMock = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/u1/img.jpg' } }),
      }),
    };
    initializeSupabase(mkSb(undefined, storageMock));
    expect((await uploadListingImage(fakeFile, 'u1')).imageUrl).toBe('https://cdn.example.com/u1/img.jpg');
  });

  test('returns error when storage upload fails', async () => {
    const fakeFile = new File(['data'], 'photo.png', { type: 'image/png' });
    const storageMock = {
      from: jest.fn().mockReturnValue({
        upload: jest.fn().mockResolvedValue({ error: { message: 'Bucket not found' } }),
        getPublicUrl: jest.fn(),
      }),
    };
    initializeSupabase(mkSb(undefined, storageMock));
    expect((await uploadListingImage(fakeFile, 'u1')).error).toBeDefined();
  });
});

// ─── getListingDashboard ──────────────────────────────────────────────────────

describe('getListingDashboard', () => {
  test('returns metrics, categories, monthly and recent on success', async () => {
    const rows = [
      { id: 'l1', title: 'Book', price: 100, status: 'active', seller_id: 'u1', category: 'books', created_at: NOW },
      { id: 'l2', title: 'Laptop', price: 5000, status: 'sold', seller_id: 'u1', category: 'electronics', created_at: NOW },
    ];
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: rows, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getListingDashboard('u1');
    expect(r.metrics).toBeDefined();
    expect(r.metrics.activeListings).toBe(1);
    expect(r.metrics.soldListings).toBe(1);
    expect(r.categories).toBeDefined();
    expect(r.monthly).toBeDefined();
    expect(r.recent).toBeDefined();
  });

  test('returns error when underlying getMyListings fails', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) };
    initializeSupabase(mkSb(() => chain));
    expect((await getListingDashboard('u1')).error).toBeDefined();
  });

  test('activeValue correctly sums prices of active listings only', async () => {
    const rows = [
      { id: 'l1', price: 300, status: 'active', seller_id: 'u1', category: 'books', created_at: NOW },
      { id: 'l2', price: 700, status: 'active', seller_id: 'u1', category: 'other', created_at: NOW },
      { id: 'l3', price: 9999, status: 'sold', seller_id: 'u1', category: 'other', created_at: NOW },
    ];
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: rows, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getListingDashboard('u1');
    expect(r.metrics.activeValue).toBe(1000);
  });

  test('monthly array always has 6 entries', async () => {
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: [], error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getListingDashboard('u1');
    expect(r.monthly.length).toBe(6);
  });

  test('recent contains at most 6 listings', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, price: 100, status: 'active', seller_id: 'u1', category: 'books', created_at: NOW }));
    const chain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockResolvedValue({ data: rows, error: null }) };
    initializeSupabase(mkSb(() => chain));
    const r = await getListingDashboard('u1');
    expect(r.recent.length).toBeLessThanOrEqual(6);
  });
});

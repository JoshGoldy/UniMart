/**
 * Tests for Auth module (auth.js)
 * Supabase is fully mocked — no network calls are made.
 */

global.window = { location: { href: '' } };

// ─── Reusable mock factory ───────────────────────────────────────────────────
// Returns a chain object where every method returns itself, and the terminal
// promise methods (single, order, upsert) resolve with a configurable value.

function makeChain(resolved = { data: null, error: null }) {
  const chain = {};
  const thenable = jest.fn().mockResolvedValue(resolved);
  ['select','insert','update','delete','upsert','eq','order'].forEach(m => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  chain.single = thenable;
  // Make order also resolve (for list queries)
  chain.order  = jest.fn().mockResolvedValue(resolved);
  // Make eq also resolve when it's the last call in the chain
  chain.eq     = jest.fn().mockReturnValue({ ...chain, then: undefined });
  // Re-attach thenable methods after eq override
  chain.eq.mockImplementation(() => chain);
  return chain;
}

function makeSb({ authOverrides = {}, dbResolved, storageUploadErr = null, publicUrl = 'https://cdn.example.com/img.jpg' } = {}) {
  const chain = makeChain(dbResolved || { data: null, error: null });
  return {
    createClient: jest.fn(() => ({
      auth: {
        signUp:                jest.fn().mockResolvedValue({ error: null }),
        signInWithPassword:    jest.fn().mockResolvedValue({ data: {}, error: null }),
        signOut:               jest.fn().mockResolvedValue({}),
        getSession:            jest.fn().mockResolvedValue({ data: { session: null } }),
        updateUser:            jest.fn().mockResolvedValue({ error: null }),
        verifyOtp:             jest.fn().mockResolvedValue({ data: {}, error: null }),
        resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
        ...authOverrides,
      },
      from: jest.fn(() => chain),
      storage: {
        from: jest.fn(() => ({
          upload:       jest.fn().mockResolvedValue({ error: storageUploadErr }),
          getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl } }),
        })),
      },
    })),
  };
}

function freshAuth(sbMock) {
  jest.resetModules();
  global.supabase = sbMock;
  global.window = { location: { href: '' } };
  return require('../auth.js').Auth;
}

// ═══════════════════════════════════════════════════════════════════════════
// getUserInitials  (pure — no Supabase needed)
// ═══════════════════════════════════════════════════════════════════════════

describe('getUserInitials', () => {
  let A;
  beforeAll(() => { A = freshAuth(makeSb()); });

  test('two-word name', ()        => expect(A.getUserInitials('Joshua Goldberg')).toBe('JG'));
  test('one-word name', ()        => expect(A.getUserInitials('Joshua')).toBe('J'));
  test('three-word name', ()      => expect(A.getUserInitials('Mary Jane Watson')).toBe('MJ'));
  test('empty string → ?', ()     => expect(A.getUserInitials('')).toBe('?'));
  test('null → ?', ()             => expect(A.getUserInitials(null)).toBe('?'));
  test('undefined → ?', ()        => expect(A.getUserInitials(undefined)).toBe('?'));
  test('lowercases uppercased',() => expect(A.getUserInitials('alice bob')).toBe('AB'));
});

// ═══════════════════════════════════════════════════════════════════════════
// signUp
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.signUp', () => {
  test('returns success when no error', async () => {
    const A = freshAuth(makeSb());
    const r = await A.signUp({ fullName: 'T', email: 't@t.com', password: 'p', accountType: 'buyer' });
    expect(r.success).toBe(true);
  });

  test('returns error message from Supabase', async () => {
    const A = freshAuth(makeSb({ authOverrides: { signUp: jest.fn().mockResolvedValue({ error: { message: 'Email taken' } }) } }));
    const r = await A.signUp({ fullName: 'T', email: 't@t.com', password: 'p', accountType: 'buyer' });
    expect(r.error).toBe('Email taken');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// signIn
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.signIn', () => {
  test('returns success and user on valid credentials', async () => {
    const fakeUser = { id: 'u1', email: 'a@b.com', user_metadata: { full_name: 'AB', account_type: 'buyer' } };
    const A = freshAuth(makeSb({ authOverrides: { signInWithPassword: jest.fn().mockResolvedValue({ data: { user: fakeUser }, error: null }) } }));
    const r = await A.signIn({ email: 'a@b.com', password: 'pass' });
    expect(r.success).toBe(true);
    expect(r.user.email).toBe('a@b.com');
  });

  test('returns error on invalid credentials', async () => {
    const A = freshAuth(makeSb({ authOverrides: { signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: { message: 'Invalid login' } }) } }));
    const r = await A.signIn({ email: 'bad@b.com', password: 'wrong' });
    expect(r.error).toBe('Invalid login');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// signOut
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.signOut', () => {
  test('redirects to login.html', async () => {
    const A = freshAuth(makeSb());
    await A.signOut();
    expect(global.window.location.href).toBe('login.html');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// requireAuth
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.requireAuth', () => {
  test('returns null and redirects when no session', async () => {
    const A = freshAuth(makeSb());
    const r = await A.requireAuth();
    expect(r).toBeNull();
    expect(global.window.location.href).toBe('login.html');
  });

  test('returns profile when session exists', async () => {
    const fakeUser = { id: 'u1', email: 'j@uni.ac.za', user_metadata: { full_name: 'Josh' } };
    const dbData = { id: 'u1', full_name: 'Josh', email: 'j@uni.ac.za', account_type: 'buyer', university: 'UCT', uni_campus: 'Main', student_number: 'S1' };
    const A = freshAuth(makeSb({
      authOverrides: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: fakeUser } } }) },
      dbResolved: { data: dbData, error: null },
    }));
    const r = await A.requireAuth();
    expect(r).not.toBeNull();
    expect(r.fullName).toBe('Josh');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// updateProfile
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.updateProfile', () => {
  test('returns success when both updates succeed', async () => {
    const A = freshAuth(makeSb({ dbResolved: { error: null } }));
    const r = await A.updateProfile({ id: 'u1', fullName: 'New', email: 'n@uni.ac.za', accountType: 'buyer' });
    expect(r.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// updateCampusInfo
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.updateCampusInfo', () => {
  test('returns success', async () => {
    const A = freshAuth(makeSb({ dbResolved: { error: null } }));
    const r = await A.updateCampusInfo({ id: 'u1', university: 'UCT', campus: 'Main', studentNumber: 'S1' });
    expect(r.success).toBe(true);
  });

  test('returns error when update fails', async () => {
    jest.resetModules();
    global.window = { location: { href: '' } };
    // updateCampusInfo does: _sb.from('users').update({...}).eq('id', id)
    // .eq() is the terminal call — it must resolve with the error
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
    };
    global.supabase = { createClient: jest.fn(() => ({ auth: makeSb().createClient().auth, from: jest.fn(() => chain), storage: makeSb().createClient().storage })) };
    const A = require('../auth.js').Auth;
    const r = await A.updateCampusInfo({ id: 'u1', university: 'UCT', campus: 'Main', studentNumber: 'S1' });
    expect(r.error).toBe('Update failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// updatePassword
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.updatePassword', () => {
  test('returns error when current password is wrong', async () => {
    const A = freshAuth(makeSb({ authOverrides: { signInWithPassword: jest.fn().mockResolvedValue({ error: { message: 'bad' } }) } }));
    const r = await A.updatePassword({ currentPassword: 'wrong', newPassword: 'new', email: 'x@y.com' });
    expect(r.error).toBe('Incorrect current password.');
  });

  test('returns success when password update succeeds', async () => {
    const A = freshAuth(makeSb({ authOverrides: { signInWithPassword: jest.fn().mockResolvedValue({ error: null }), updateUser: jest.fn().mockResolvedValue({ error: null }) } }));
    const r = await A.updatePassword({ currentPassword: 'correct', newPassword: 'newpass', email: 'x@y.com' });
    expect(r.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// requestPasswordReset / completePasswordRecovery
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.requestPasswordReset', () => {
  test('returns success', async () => {
    const A = freshAuth(makeSb());
    const r = await A.requestPasswordReset({ email: 'x@y.com', redirectTo: 'https://app.com' });
    expect(r.success).toBe(true);
  });

  test('returns error when reset fails', async () => {
    const A = freshAuth(makeSb({ authOverrides: { resetPasswordForEmail: jest.fn().mockResolvedValue({ error: { message: 'Not found' } }) } }));
    const r = await A.requestPasswordReset({ email: 'bad@y.com', redirectTo: '' });
    expect(r.error).toBe('Not found');
  });
});

describe('Auth.completePasswordRecovery', () => {
  test('returns success', async () => {
    const A = freshAuth(makeSb());
    const r = await A.completePasswordRecovery({ newPassword: 'newpass123' });
    expect(r.success).toBe(true);
  });

  test('returns error when update fails', async () => {
    const A = freshAuth(makeSb({ authOverrides: { updateUser: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }) } }));
    const r = await A.completePasswordRecovery({ newPassword: 'x' });
    expect(r.error).toBe('Update failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createListing
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.createListing', () => {
  const payload = { sellerId: 'u1', title: 'Book', description: 'Good', price: 100, category: 'Books', condition: 'Good', isTradeable: false, status: 'active', imageUrl: '' };

  test('returns success with mapped listing', async () => {
    const fakeRecord = { listing_id: 'l1', seller_id: 'u1', title: 'Book', description: 'Good', price: 100, category: 'Books', condition: 'Good', is_tradeable: false, status: 'active', image_url: '', created_at: '2026-01-01' };
    const A = freshAuth(makeSb({ dbResolved: { data: fakeRecord, error: null } }));
    const r = await A.createListing(payload);
    expect(r.success).toBe(true);
    expect(r.listing.title).toBe('Book');
  });

  test('returns error when insert fails', async () => {
    const A = freshAuth(makeSb({ dbResolved: { data: null, error: { message: 'Insert failed' } } }));
    const r = await A.createListing(payload);
    expect(r.error).toBe('Insert failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// updateListing
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.updateListing', () => {
  const payload = { listingId: 'l1', sellerId: 'u1', title: 'Book', description: '', price: 100, category: 'Books', condition: 'Good', isTradeable: false, status: 'active', imageUrl: '' };

  test('returns success', async () => {
    const fakeRecord = { listing_id: 'l1', seller_id: 'u1', title: 'Book', description: '', price: 100, category: 'Books', condition: 'Good', is_tradeable: false, status: 'active', image_url: '', created_at: '2026-01-01' };
    const A = freshAuth(makeSb({ dbResolved: { data: fakeRecord, error: null } }));
    const r = await A.updateListing(payload);
    expect(r.success).toBe(true);
  });

  test('returns error when update fails', async () => {
    const A = freshAuth(makeSb({ dbResolved: { data: null, error: { message: 'Update failed' } } }));
    const r = await A.updateListing(payload);
    expect(r.error).toBe('Update failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deleteListing
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.deleteListing', () => {
  test('returns success', async () => {
    const A = freshAuth(makeSb({ dbResolved: { error: null } }));
    const r = await A.deleteListing({ listingId: 'l1', sellerId: 'u1' });
    expect(r.success).toBe(true);
  });

  test('returns error when delete fails', async () => {
    jest.resetModules();
    global.window = { location: { href: '' } };
    // deleteListing does: _sb.from().delete().eq('listing_id', ...).eq('seller_id', ...)
    // second .eq() is terminal — must resolve with error
    let eqCallCount = 0;
    const chain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount >= 2) return Promise.resolve({ error: { message: 'Delete failed' } });
        return chain;
      }),
    };
    global.supabase = { createClient: jest.fn(() => ({ auth: makeSb().createClient().auth, from: jest.fn(() => chain), storage: makeSb().createClient().storage })) };
    const A = require('../auth.js').Auth;
    const r = await A.deleteListing({ listingId: 'l1', sellerId: 'u1' });
    expect(r.error).toBe('Delete failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getMarketplaceListings
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.getMarketplaceListings', () => {
  test('returns mapped listings', async () => {
    const fakeListings = [{ listing_id: 'l1', seller_id: 'u1', title: 'Laptop', description: '', price: 5000, category: 'Electronics', condition: 'Good', is_tradeable: true, status: 'active', image_url: '', created_at: '2026-01-01' }];
    const A = freshAuth(makeSb({ dbResolved: { data: fakeListings, error: null } }));
    const r = await A.getMarketplaceListings();
    expect(r.success).toBe(true);
    expect(r.listings[0].title).toBe('Laptop');
  });

  test('returns error when query fails', async () => {
    const A = freshAuth(makeSb({ dbResolved: { data: null, error: { message: 'Query failed' } } }));
    const r = await A.getMarketplaceListings();
    expect(r.error).toBe('Query failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getMyListings
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.getMyListings', () => {
  test('returns mapped listings for user', async () => {
    const fakeListings = [{ listing_id: 'l1', seller_id: 'u1', title: 'Chair', description: '', price: 200, category: 'Furniture', condition: 'Fair', is_tradeable: false, status: 'active', image_url: '', created_at: '2026-01-01' }];
    const A = freshAuth(makeSb({ dbResolved: { data: fakeListings, error: null } }));
    const r = await A.getMyListings('u1');
    expect(r.success).toBe(true);
    expect(r.listings[0].category).toBe('Furniture');
  });

  test('returns error when query fails', async () => {
    const A = freshAuth(makeSb({ dbResolved: { data: null, error: { message: 'Failed' } } }));
    const r = await A.getMyListings('u1');
    expect(r.error).toBe('Failed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// uploadListingImage
// ═══════════════════════════════════════════════════════════════════════════

describe('Auth.uploadListingImage', () => {
  test('rejects files over 5 MB', async () => {
    const A = freshAuth(makeSb());
    const r = await A.uploadListingImage({ name: 'big.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' }, 'u1');
    expect(r.error).toBe('Image must be 5 MB or smaller.');
  });

  test('returns imageUrl on successful upload', async () => {
    const A = freshAuth(makeSb({ publicUrl: 'https://cdn.example.com/photo.jpg' }));
    const r = await A.uploadListingImage({ name: 'photo.jpg', size: 1 * 1024 * 1024, type: 'image/jpeg' }, 'u1');
    expect(r.success).toBe(true);
    expect(r.imageUrl).toBe('https://cdn.example.com/photo.jpg');
  });

  test('returns error when storage upload fails', async () => {
    const A = freshAuth(makeSb({ storageUploadErr: { message: 'Upload failed' } }));
    const r = await A.uploadListingImage({ name: 'photo.jpg', size: 1 * 1024 * 1024, type: 'image/jpeg' }, 'u1');
    expect(r.error).toBe('Upload failed');
  });
});

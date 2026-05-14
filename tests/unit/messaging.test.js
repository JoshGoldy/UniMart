import { jest } from '@jest/globals';
import { initializeSupabase, startConversation } from '../../frontend/scripts/auth.js';

describe('messaging conversations', () => {
  test('creates conversations with the Supabase-allowed open status', async () => {
    const inserts = [];

    const createBuilder = (table) => {
      const builder = {
        select: jest.fn(() => builder),
        insert: jest.fn((payload) => {
          inserts.push({ table, payload });
          return builder;
        }),
        update: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        maybeSingle: jest.fn(async () => {
          if (table === 'listings') {
            return { data: { listing_id: 'listing-1', seller_id: 'seller-1' }, error: null };
          }
          return { data: null, error: null };
        }),
        single: jest.fn(async () => {
          if (table === 'conversations') {
            return {
              data: {
                conversation_id: 'conversation-1',
                listing_id: 'listing-1',
                buyer_id: 'buyer-1',
                seller_id: 'seller-1',
                status: 'open',
              },
              error: null,
            };
          }
          return { data: { message_id: 'message-1' }, error: null };
        }),
        then: (resolve) => resolve({ error: null }),
      };

      return builder;
    };

    initializeSupabase({
      createClient: () => ({
        from: jest.fn(createBuilder),
      }),
    });

    const result = await startConversation({
      listingId: 'listing-1',
      buyerId: 'buyer-1',
      initialMessage: 'Is this still available?',
    });

    expect(result.success).toBe(true);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'conversations',
        payload: expect.objectContaining({ status: 'open' }),
      }),
    ]));
  });
});

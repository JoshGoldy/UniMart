# Paystack Payments Integration

UniMart uses Paystack Checkout for online payments because it supports South African ZAR payments through a hosted checkout page and keeps card handling outside the UniMart frontend.

Implementation notes:
- Buyers can choose a full or partial online amount after an offer is accepted.
- Any remaining balance is stored as the cash due at collection.
- Trade facility staff must confirm the cash balance before releasing an item.
- The browser calls a Supabase Edge Function, and the Edge Function calls Paystack with the secret key.

Required setup:
1. Run `docs/payments-schema.sql`.
2. Deploy `supabase/functions/create-paystack-checkout`.
3. Deploy `supabase/functions/verify-paystack-payment`.
4. Add the Edge Function secret `PAYSTACK_SECRET_KEY`.
5. Add a Paystack webhook later for automatic background confirmation.

Useful Paystack docs:
- Initialize transaction: https://paystack.com/docs/api/transaction/
- Accept payments: https://paystack.com/docs/payments/accept-payments/
- SA pricing: https://paystack.com/za/pricing

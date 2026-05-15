# Resend Auth Email Hook

UniMart signup and password reset emails should be sent through Resend using a secure server-side auth email hook. The frontend must not call the Resend API directly because that would expose the API key in the browser.

## What This Fix Does

The app still asks the auth service to create the signup OTP. The auth service then calls the `send-email` function, and that function sends the OTP email through Resend.

This fixes the common issue where the UI says a code was sent but the user never receives the email because the default email provider is not delivering reliably.

## Files Added

- `supabase/functions/send-email/index.ts`

## Setup

1. Create or confirm a Resend API key.
2. Verify the sending domain in Resend.
3. In the auth dashboard, open Authentication > Hooks > Send Email.
4. Generate the hook secret.
5. Set the function secrets:

```bash
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_xxx"
supabase secrets set RESEND_FROM_EMAIL="UniMart <noreply@your-domain.co.za>"
```

6. Deploy the function:

```bash
supabase functions deploy send-email --no-verify-jwt
```

7. In Authentication > Hooks > Send Email, enable the HTTPS hook and use the deployed function URL.

## Important

Keep the auth email provider enabled. With the Send Email hook enabled, the hook handles delivery. If the hook is disabled, the configured email provider handles delivery instead.

## Email Template Note

If you temporarily use the built-in email template instead of the hook, make sure the OTP variable is written exactly as:

```html
{{ .Token }}
```

Do not add spaces inside `.Token`.

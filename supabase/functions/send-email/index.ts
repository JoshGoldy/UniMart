import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { Resend } from 'npm:resend@4.0.0';

type EmailPayload = {
  user: {
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') || '');
const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') || '').replace(/^v1,whsec_/, '');
const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'UniMart <noreply@your-domain.co.za>';

function getSubject(actionType: string) {
  const subjects: Record<string, string> = {
    signup: 'Confirm your UniMart signup',
    recovery: 'Reset your UniMart password',
    'reset-password': 'Reset your UniMart password',
    magiclink: 'Sign in to UniMart',
    email_change: 'Confirm your UniMart email change',
  };
  return subjects[actionType] || 'Your UniMart verification code';
}

function getIntro(actionType: string) {
  if (actionType === 'recovery' || actionType === 'reset-password') {
    return 'Use this code to reset your UniMart password.';
  }
  if (actionType === 'magiclink') return 'Use this code to sign in to UniMart.';
  if (actionType === 'email_change') return 'Use this code to confirm your new email address.';
  return 'Use this code to confirm your UniMart account.';
}

function buildVerifyUrl(emailData: EmailPayload['email_data']) {
  if (!emailData.token_hash || !emailData.redirect_to) return '';
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });
  const siteUrl = emailData.site_url || '';
  return `${siteUrl.replace(/\/$/, '')}/auth/v1/verify?${params.toString()}`;
}

function renderEmail({ user, email_data: emailData }: EmailPayload) {
  const name = user.user_metadata?.full_name?.split(' ')[0] || 'there';
  const code = emailData.token || emailData.token_new || '';
  const verifyUrl = buildVerifyUrl(emailData);
  const intro = getIntro(emailData.email_action_type);

  const text = [
    `Hi ${name},`,
    intro,
    code ? `Your verification code is: ${code}` : '',
    verifyUrl ? `You can also open this link: ${verifyUrl}` : '',
    'If you did not request this, you can ignore this email.',
    'UniMart',
  ].filter(Boolean).join('\n\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f241f;">
      <h2 style="margin:0 0 12px;">${getSubject(emailData.email_action_type)}</h2>
      <p>Hi ${name},</p>
      <p>${intro}</p>
      ${code ? `<div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 18px;background:#f4f1ea;border-radius:12px;text-align:center;margin:22px 0;">${code}</div>` : ''}
      ${verifyUrl ? `<p><a href="${verifyUrl}" style="display:inline-block;background:#3a6645;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open UniMart</a></p>` : ''}
      <p style="color:#6f6a5f;font-size:14px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return { subject: getSubject(emailData.email_action_type), html, text };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!hookSecret) return new Response(JSON.stringify({ error: 'Missing hook secret' }), { status: 500 });
  if (!Deno.env.get('RESEND_API_KEY')) return new Response(JSON.stringify({ error: 'Missing Resend API key' }), { status: 500 });

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  let verified: EmailPayload;

  try {
    verified = new Webhook(hookSecret).verify(payload, headers) as EmailPayload;
  } catch (error) {
    console.error('Auth email hook signature failed', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid hook signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const email = renderEmail(verified);
    const result = await resend.emails.send({
      from: fromEmail,
      to: [verified.user.email],
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (result.error) {
      console.error('Resend email failed', JSON.stringify(result.error));
      return new Response(JSON.stringify({ error: result.error.message || 'Resend email failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log(`Auth email sent to ${verified.user.email} for ${verified.email_data.email_action_type}`);
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Auth email hook failed', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Email failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// api/_lib/emailTemplate.js
//
// Small shared helper for sending one branded transactional email through
// Brevo. Used by api/waitlist.js (the join-confirmation email) and by the
// new waitlist routes in api/admin/router.js (the launch email).
//
// Kept separate from api/admin/router.js's own buildEmailHtml/
// handleSendEmail function so neither file has to import from the other,
// and so nothing about the existing admin "Communication center" changes.
//
// Requires BREVO_API_KEY and EMAIL_FROM_ADDRESS as Vercel environment
// variables - the same ones the admin Communication center already uses.
// If that feature already sends email successfully, these are already set
// and this file needs no extra setup.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Plain-text body in, branded HTML out. A blank line starts a new
// paragraph. A block of lines that all start with "- " becomes a bullet
// list, so callers can write plain text and still get a tidy email.
function buildEmailHtml(subject, textBody) {
  const blocks = String(textBody).split(/\n\s*\n/);
  const html = blocks
    .map((block) => {
      const lines = block.split('\n').filter((l) => l.trim().length > 0);
      const isList = lines.length > 0 && lines.every((l) => /^-\s+/.test(l.trim()));
      if (isList) {
        const items = lines
          .map((l) => `<li style="margin:0 0 8px;">${escapeHtml(l.trim().replace(/^-\s+/, ''))}</li>`)
          .join('');
        return `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:22px;color:#475569;">${items}</ul>`;
      }
      return `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#475569;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F6FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6FAFB;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(11,34,51,0.08);">
<tr><td align="center" bgcolor="#0E9A9C" style="background:linear-gradient(135deg,#0E9A9C 0%,#4A459C 100%);padding:36px 24px 28px 24px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Fluency<span style="color:#8CEECB;font-weight:800;">AI</span></div>
</td></tr>
<tr><td style="padding:36px 36px 8px 36px;">
<h1 style="margin:0 0 18px 0;font-size:19px;font-weight:800;color:#0B2233;letter-spacing:-0.3px;">${escapeHtml(subject)}</h1>
${html}
</td></tr>
<tr><td style="padding:20px 36px 0 36px;"><div style="height:1px;background-color:#E2E8F0;width:100%;"></div></td></tr>
<tr><td align="center" style="padding:20px 36px 36px 36px;">
<p style="margin:0;font-size:12px;line-height:18px;color:#94A3B8;">Sent by Fluency AI<br>You're receiving this because you joined the Fluency AI waitlist.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function sendBrandedEmail({ to, subject, textBody }) {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS;
  const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Fluency AI';

  if (!BREVO_API_KEY || !FROM_EMAIL) {
    throw new Error('Email sending is not configured (missing BREVO_API_KEY or EMAIL_FROM_ADDRESS env vars).');
  }

  const htmlContent = buildEmailHtml(subject, textBody);

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!brevoRes.ok) {
    const body = await brevoRes.text().catch(() => '');
    throw new Error('Brevo responded with ' + brevoRes.status + (body ? ': ' + body.slice(0, 300) : ''));
  }
  return brevoRes.json();
}

module.exports = { sendBrandedEmail, buildEmailHtml, escapeHtml };

// api/_lib/welcomeEmails.js
//
// The three welcome emails, all built on one template (colours, fonts and layout come from the supplied welcome.html):
//
//   1. accountWelcome   a person has created and confirmed their Fluency AI account
//   2. partnerWelcome   a partner application has been approved
//   3. waitlistWelcome  a visitor has joined the waitlist
//
// All three are sent FROM the address in the WELCOME_FROM_ADDRESS environment variable (welcome@fluencyai.app).
// If that variable is not set they fall back to EMAIL_FROM_ADDRESS, so nothing breaks while it is being set up.
// Replies go to WELCOME_REPLY_TO (default support@fluencyai.app), because the emails invite people to reply.
//
// This file only needs ./emailTemplate (to send) and, for the once-only account email, ./supabase (loaded when needed).

const { sendBrandedEmail } = require('./emailTemplate');

const SITE = 'https://fluencyai.app';
const STORE_URL = SITE + '/store';
const WAITLIST_URL = SITE + '/#join';
const HUB_URL = SITE + '/partner-hub';
const DEFAULT_REPLY_TO = 'support@fluencyai.app';
const NEW_ACCOUNT_DAYS = 3; // only accounts this new get a welcome, so nobody who signed up long ago is emailed by surprise

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}
function percent(rate) {
  return `${Math.round(Number(rate || 0.2) * 100)}%`;
}

// ---------- pieces of the template (styles copied from welcome.html) ----------
const FONT_DISPLAY = "font-family:'Bricolage Grotesque',Georgia,sans-serif;";
const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#B7CCD6;';
const P_LAST = 'margin:0 0 26px;font-size:16px;line-height:1.6;color:#B7CCD6;';
const MUTED = 'margin:26px 0 0;font-size:14px;line-height:1.6;color:#8FB0C0;';
const LINK = 'color:#10B8B8;text-decoration:none;font-weight:700;';

function stepRow(n, text, last) {
  const pad = last ? '' : 'padding:0 0 12px;';
  return `      <tr><td style="${pad}vertical-align:top;width:34px;"><div style="width:26px;height:26px;border-radius:999px;background:#10B8B8;color:#04121B;font-weight:700;font-size:13px;line-height:26px;text-align:center;">${n}</div></td>
      <td style="${pad}font-size:15px;line-height:1.5;color:#FFFFFF;">${text}</td></tr>`;
}
function stepsCard(label, steps) {
  const rows = steps.map((t, i) => stepRow(i + 1, t, i === steps.length - 1)).join('\n');
  return `  <div style="margin:0 0 26px;padding:22px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);">
    <p style="margin:0 0 14px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#35DDFB;">${esc(label)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows}
    </table>
  </div>`;
}
function button(href, label) {
  return `  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#10B8B8;">
    <a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:700;color:#04121B;text-decoration:none;border-radius:999px;">${esc(label)}</a>
  </td></tr></table>`;
}

function shell({ title, tag, headlineHtml, bodyHtml, reason, unsubscribeUrl }) {
  const unsub = unsubscribeUrl ? ` · <a href="${esc(unsubscribeUrl)}" style="color:#8FB0C0;">Unsubscribe</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#04121B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04121B;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#04121B;">
<tr><td align="center" style="padding:8px 0 28px;">
  <a href="${SITE}" style="text-decoration:none;">
  <div style="${FONT_DISPLAY}font-weight:800;font-size:30px;letter-spacing:-0.035em;color:#FFFFFF;line-height:1;">
    <span style="color:#10B8B8;">F</span>luenc<span style="position:relative;">y<span style="font-size:10px;letter-spacing:0.1em;color:#10B8B8;vertical-align:top;margin-left:3px;">AI</span></span>
  </div>
  </a>
</td></tr>
<tr><td style="background:radial-gradient(120% 90% at 50% 0%,#0F3A4C 0%,#0B2233 60%,#04121B 100%);background-color:#0B2233;border:1px solid rgba(255,255,255,0.09);border-radius:24px;padding:44px 40px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(91,85,184,0.2);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9A96E0;">${esc(tag)}</div>
  <h1 style="margin:22px 0 12px;${FONT_DISPLAY}font-weight:800;font-size:40px;line-height:1.04;letter-spacing:-0.035em;color:#FFFFFF;">${headlineHtml}</h1>
${bodyHtml}
</td></tr>
<tr><td align="center" style="padding:28px 16px 0;font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.6;color:#8FB0C0;">
  Fluency AI · Speak it like you mean it.<br>
  <a href="${SITE}" style="color:#8FB0C0;">fluencyai.app</a> · <a href="${SITE}/privacy" style="color:#8FB0C0;">Privacy</a> · <a href="${SITE}/terms" style="color:#8FB0C0;">Terms</a>${unsub}<br>
  ${esc(reason)}<br>
  © ${new Date().getFullYear()} Fluency AI
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const teal = (text) => `<span style="color:#10B8B8;">${text}</span>`;
const websiteLine = `You can always find us at <a href="${SITE}" style="${LINK}">fluencyai.app</a>.`;

// ---------- 1. a new account ----------
function accountWelcome({ name } = {}) {
  const hi = `Hi ${firstName(name)},`;
  const body = [
    `  <p style="${P}">${esc(hi)}</p>`,
    `  <p style="${P_LAST}">Your account is ready. Fluency AI is a speaking coach you talk to out loud. It hears how you actually speak, answers like a person, and explains the fix in your own language. The apps for iOS and Android are not open yet. When they launch, sign in with this account and start speaking.</p>`,
    '',
    stepsCard('While you wait', [
      `If you have not already, <a href="${WAITLIST_URL}" style="${LINK}">join the waitlist</a> to hear the moment the app launches, before we announce it anywhere else.`,
      `Browse the <a href="${STORE_URL}" style="${LINK}">exam guides</a>: 20-minute PDF guides for the exam that stands between you and your next step.`,
    ]),
    '',
    button(STORE_URL, 'Browse the exam guides'),
    '',
    `  <p style="${MUTED}">Questions? Just reply to this email. ${websiteLine}</p>`,
  ].join('\n');
  return {
    subject: 'Welcome to Fluency AI',
    htmlContent: shell({
      title: 'Welcome to Fluency AI',
      tag: 'Welcome aboard',
      headlineHtml: `Stop freezing.<br>${teal('Start speaking.')}`,
      bodyHtml: body,
      reason: "You're receiving this because you created a Fluency AI account.",
    }),
    textContent: [
      hi,
      'Your account is ready. Fluency AI is a speaking coach you talk to out loud. It hears how you actually speak, answers like a person, and explains the fix in your own language. The apps for iOS and Android are not open yet. When they launch, sign in with this account and start speaking.',
      `While you wait:\n1. If you have not already, join the waitlist to hear the moment the app launches, before we announce it anywhere else: ${WAITLIST_URL}\n2. Browse the exam guides: 20-minute PDF guides for the exam that stands between you and your next step: ${STORE_URL}`,
      `Browse the exam guides: ${STORE_URL}`,
      `Questions? Just reply to this email. You can always find us at ${SITE}`,
      "You're receiving this because you created a Fluency AI account.",
    ].join('\n\n'),
  };
}

// ---------- 2. an approved partner ----------
function partnerWelcome({ name, email, code, rate } = {}) {
  const hi = `Hi ${firstName(name)},`;
  const pct = percent(rate);
  const earn = `How you earn: ${pct} of the first app subscription payment from someone you referred, and ${pct} of every exam blueprint sold through your link. Each commission is confirmed after a 14-day refund window. Payouts are made monthly once you have $20 or more to collect.`;
  const payout = 'To get paid, just reply to this email with how you would like to receive your payouts.';
  const signIn = `Sign in at <a href="${HUB_URL}" style="${LINK}">fluencyai.app/partner-hub</a> with the email address you applied with (${esc(email)}). If you do not have a Fluency AI account yet, create one with that same email first.`;
  const buildLinks = 'In your Partner Hub, build links to the Store, the Pricing page or a single exam blueprint, and follow your clicks, sign-ups and sales.';
  const share = 'Share your link or your code. Anyone who uses it gets a discount at checkout.';
  const codeCard = `  <div style="margin:0 0 26px;padding:22px;border-radius:18px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);text-align:center;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#35DDFB;">Your partner code</p>
    <div style="${FONT_DISPLAY}font-weight:800;font-size:34px;line-height:1.1;letter-spacing:0.12em;color:#10B8B8;">${esc(code)}</div>
  </div>`;
  const body = [
    `  <p style="${P}">${esc(hi)}</p>`,
    `  <p style="${P_LAST}">Good news: your application to the Fluency AI Partner Program has been accepted.</p>`,
    '',
    codeCard,
    '',
    stepsCard('What to do next', [signIn, buildLinks, share]),
    '',
    `  <p style="${P}">${esc(earn)}</p>`,
    `  <p style="${P_LAST}">${esc(payout)}</p>`,
    '',
    button(HUB_URL, 'Open my Partner Hub'),
    '',
    `  <p style="${MUTED}">Welcome aboard,<br>The Fluency AI team<br><br>${websiteLine}</p>`,
  ].join('\n');
  return {
    subject: "You're in: welcome to the Fluency AI Partner Program",
    htmlContent: shell({
      title: 'Welcome to the Fluency AI Partner Program',
      tag: 'Partner Program',
      headlineHtml: `You're in.<br>${teal('Start earning.')}`,
      bodyHtml: body,
      reason: "You're receiving this because you applied to the Fluency AI Partner Program.",
    }),
    textContent: [
      hi,
      'Good news: your application to the Fluency AI Partner Program has been accepted.',
      `Your partner code: ${code}`,
      `What to do next:\n1. Sign in at ${HUB_URL} with the email address you applied with (${email}). If you do not have a Fluency AI account yet, create one with that same email first.\n2. ${buildLinks}\n3. ${share}`,
      earn,
      payout,
      `Open my Partner Hub: ${HUB_URL}`,
      `Welcome aboard,\nThe Fluency AI team\n\nYou can always find us at ${SITE}`,
      "You're receiving this because you applied to the Fluency AI Partner Program.",
    ].join('\n\n'),
  };
}

// ---------- 3. the waitlist ----------
function waitlistWelcome({ unsubscribeUrl } = {}) {
  const body = [
    `  <p style="${P}">Thanks for joining the Fluency AI waitlist.</p>`,
    `  <p style="${P_LAST}">You'll be one of the first to know the moment Fluency AI is available to download on iOS and Android, before we announce it anywhere else.</p>`,
    '',
    stepsCard('What to expect next', [
      'One email, right when we launch, with direct links to download the app.',
      'No spam in between. This list is only ever used for that one announcement.',
      `In the meantime, browse our <a href="${STORE_URL}" style="${LINK}">exam guides</a> at <a href="${SITE}" style="${LINK}">fluencyai.app</a>.`,
    ]),
    '',
    button(SITE, 'Visit fluencyai.app'),
    '',
    `  <p style="${MUTED}">Thanks for your patience while we get this right.<br>The Fluency AI team</p>`,
  ].join('\n');
  return {
    subject: "You're on the Fluency AI waitlist",
    htmlContent: shell({
      title: "You're on the Fluency AI waitlist",
      tag: "You're on the list",
      headlineHtml: `You're on the list.<br>${teal('Speak soon.')}`,
      bodyHtml: body,
      reason: "You're receiving this because you joined the Fluency AI waitlist.",
      unsubscribeUrl,
    }),
    textContent: [
      'Thanks for joining the Fluency AI waitlist.',
      "You'll be one of the first to know the moment Fluency AI is available to download on iOS and Android, before we announce it anywhere else.",
      `What to expect next:\n- One email, right when we launch, with direct links to download the app.\n- No spam in between. This list is only ever used for that one announcement.\n- In the meantime, browse our exam guides at ${STORE_URL}`,
      'Thanks for your patience while we get this right.\nThe Fluency AI team',
      `Visit ${SITE}`,
      "You're receiving this because you joined the Fluency AI waitlist." + (unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : ''),
    ].join('\n\n'),
  };
}

// ---------- sending ----------
function senderOptions() {
  return {
    fromAddress: process.env.WELCOME_FROM_ADDRESS || undefined, // unset: sendBrandedEmail uses EMAIL_FROM_ADDRESS
    replyTo: process.env.WELCOME_REPLY_TO || DEFAULT_REPLY_TO,
  };
}

/** Sends a built welcome email. Throws if the provider refuses it; callers decide whether that matters. */
async function sendWelcome(to, built, extra = {}) {
  return sendBrandedEmail({
    to,
    subject: built.subject,
    htmlContent: built.htmlContent,
    textContent: built.textContent,
    ...senderOptions(),
    ...extra,
  });
}

function sendWaitlistWelcome({ to, unsubscribeUrl }) {
  return sendWelcome(to, waitlistWelcome({ unsubscribeUrl }), { unsubscribeUrl });
}

// ---------- the account welcome, once per person ----------
// Called from three places (the website after sign-in, the confirm-email page, and the app's activity ping), so it has
// to be safe to call many times: the first call for a new, confirmed account sends; every later call does nothing.
// "Already welcomed" is kept in the account's app_metadata, which only the server can change.
async function sendAccountWelcomeOnce(user) {
  if (!user || !user.id || !user.email) return { sent: false, reason: 'no_user' };
  if (!user.email_confirmed_at) return { sent: false, reason: 'unconfirmed' };
  const age = Date.now() - Date.parse(user.created_at || 0);
  if (!(age >= 0 && age < NEW_ACCOUNT_DAYS * 86400000)) return { sent: false, reason: 'not_new' };
  if (user.app_metadata && user.app_metadata.welcome_email_sent_at) return { sent: false, reason: 'already_sent' };

  const { getServiceClient } = require('./supabase');
  const admin = getServiceClient().auth.admin;

  // Read the account fresh (the copy we were given may be a minute old), then claim it BEFORE sending.
  const { data: fresh, error: readErr } = await admin.getUserById(user.id);
  if (readErr || !fresh || !fresh.user) throw new Error('welcome: could not read the account: ' + (readErr && readErr.message));
  const meta = fresh.user.app_metadata || {};
  if (meta.welcome_email_sent_at) return { sent: false, reason: 'already_sent' };

  const stamp = new Date().toISOString();
  const { error: claimErr } = await admin.updateUserById(user.id, { app_metadata: { ...meta, welcome_email_sent_at: stamp } });
  if (claimErr) throw new Error('welcome: could not mark the account: ' + claimErr.message);

  const um = fresh.user.user_metadata || {};
  try {
    await sendWelcome(fresh.user.email, accountWelcome({ name: um.full_name || um.name || '' }));
  } catch (err) {
    // The email did not go out, so release the claim and let the next sign-in try again.
    await admin.updateUserById(user.id, { app_metadata: { ...meta, welcome_email_sent_at: null } }).catch(() => {});
    throw err;
  }
  return { sent: true };
}

// POST /api/welcome-email  (routed to the track-activity function with ?hook=welcome, see vercel.json)
// Needs the person's own sign-in token. Never takes an email address or id from the request.
async function welcomeHook(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { getUserFromRequest } = require('./userAuth');
  const { hit } = require('./rateLimit');
  const who = await getUserFromRequest(req);
  if (!who.ok) return res.status(who.status || 401).json({ error: who.error || 'Please sign in.' });
  const limited = await hit(`welcome:${who.user.id}`, { windowSeconds: 3600, max: 10 });
  if (!limited.allowed) return res.status(429).json({ error: 'Too many requests.' });
  try {
    const result = await sendAccountWelcomeOnce(who.user);
    return res.status(200).json({ ok: true, sent: result.sent });
  } catch (err) {
    console.error('welcome hook: could not send the welcome email:', err.message);
    return res.status(200).json({ ok: true, sent: false }); // never make sign-in feel broken because of an email
  }
}

module.exports = {
  accountWelcome, partnerWelcome, waitlistWelcome,
  sendWelcome, sendWaitlistWelcome, sendAccountWelcomeOnce, welcomeHook,
  SITE, STORE_URL, WAITLIST_URL, HUB_URL,
};

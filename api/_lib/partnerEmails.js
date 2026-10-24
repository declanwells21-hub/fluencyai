// api/_lib/partnerEmails.js
//
// The two emails a person gets when their Partner Program application is decided, so nobody has to be told by hand.

const { sendBrandedEmail } = require('./emailTemplate');
const { partnerWelcome } = require('./welcomeEmails');

const SITE = 'https://fluencyai.app';
const FOOTER = "You're receiving this because you applied to the Fluency AI Partner Program.";

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function percent(rate) {
  const n = Math.round(Number(rate || 0.2) * 100);
  return `${n}%`;
}

function acceptedEmail({ name, email, code, rate }) {
  const designed = partnerWelcome({ name, email, code, rate }); // the branded HTML version of this same message
  return {
    htmlContent: designed.htmlContent,
    textContent: designed.textContent,
    // sent from the welcome address (WELCOME_FROM_ADDRESS); with it unset the usual EMAIL_FROM_ADDRESS is used
    fromAddress: process.env.WELCOME_FROM_ADDRESS || undefined,
    replyTo: process.env.WELCOME_REPLY_TO || 'support@fluencyai.app',
    subject: "You're in: welcome to the Fluency AI Partner Program",
    textBody: [
      `Hi ${firstName(name)},`,
      'Good news: your application to the Fluency AI Partner Program has been accepted.',
      `Your partner code: ${code}`,
      [
        'What to do next:',
        `- Sign in at ${SITE}/partner-hub with the email address you applied with (${email}). If you do not have a Fluency AI account yet, create one with that same email first.`,
        '- In your Partner Hub, build links to the Store, the Pricing page or a single exam blueprint, and follow your clicks, sign-ups and sales.',
        '- Share your link or your code. Anyone who uses it gets a discount at checkout.',
      ].join('\n'),
      `How you earn: ${percent(rate)} of the first app subscription payment from someone you referred, and ${percent(rate)} of every exam blueprint sold through your link. Each commission is confirmed after a 14-day refund window. Payouts are made monthly once you have $20 or more to collect.`,
      'To get paid, just reply to this email with how you would like to receive your payouts.',
      'Welcome aboard,\nThe Fluency AI team',
    ].join('\n\n'),
    footerNote: FOOTER,
  };
}

function declinedEmail({ name }) {
  return {
    subject: 'Your Fluency AI Partner Program application',
    textBody: [
      `Hi ${firstName(name)},`,
      'Thank you for applying to the Fluency AI Partner Program and for the time you put into your application.',
      'We are not able to offer you a place right now. This is not a judgement on you or your work: we are growing the program step by step.',
      'You are welcome to apply again later, and we would be glad to hear from you.',
      'All the best,\nThe Fluency AI team',
    ].join('\n\n'),
    footerNote: FOOTER,
  };
}

/** Sends the accepted or declined email. Returns true if it was sent; never throws (a failed email must not undo a decision). */
async function sendDecisionEmail(decision, details) {
  try {
    const message = decision === 'approve' ? acceptedEmail(details) : declinedEmail(details);
    await sendBrandedEmail({ to: details.email, ...message });
    return true;
  } catch (err) {
    console.error('partnerEmails: could not send the decision email:', err.message);
    return false;
  }
}

module.exports = { sendDecisionEmail, acceptedEmail, declinedEmail };

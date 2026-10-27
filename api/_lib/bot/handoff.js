// api/_lib/bot/handoff.js
//
// "Talk to a person": the email that lands in support's inbox when a visitor asks for a human. It carries the
// visitor's address (as Reply-To, so support just presses Reply), their note, the page they were on and the chat so
// far. Nothing is ever emailed to the visitor's address (that would let anyone make us email a stranger).

'use strict';

const { escapeHtml } = require('../emailTemplate');

const ROLE_LABEL = { user: 'Visitor', assistant: 'Assistant' };

function oneLine(text, max) {
  return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, max);
}

function siteUrl() {
  return String(process.env.SITE_URL || 'https://fluencyai.app').replace(/\/+$/, '');
}

/** Returns { subject, htmlContent, textContent } for one hand-off. All visitor text is escaped. */
function buildHandoffEmail({ id, email, note, conversation, transcript }) {
  const msgs = transcript || [];
  const lastQuestion = oneLine((msgs.filter((m) => m.role === 'user').pop() || {}).content || note || '', 70);
  const subject = ('Chat hand-off #' + id + (lastQuestion ? ': ' + lastQuestion : '')).slice(0, 120);
  const page = conversation && conversation.page ? conversation.page : '';
  const lang = conversation && conversation.lang ? conversation.lang : '';
  const admin = siteUrl() + '/admin/';

  const text = [
    'A visitor asked for a person on the website chat.',
    '',
    'Reply to this email to answer them (Reply-To is their address).',
    'Email: ' + email,
    note ? 'Their note:\n' + note : 'Their note: (none)',
    page ? 'Page: ' + page : '',
    lang ? 'Language: ' + lang : '',
    '',
    msgs.length ? 'CHAT SO FAR' : 'No chat was started before the request.',
    ...msgs.map((m) => (ROLE_LABEL[m.role] || m.role) + ': ' + m.content),
    '',
    'Chat history and status: ' + admin,
  ].filter((l) => l !== '').join('\n');

  const row = (m) => '<tr><td style="padding:6px 10px 6px 0;vertical-align:top;color:#5B8497;white-space:nowrap">' + escapeHtml(ROLE_LABEL[m.role] || m.role) +
    '</td><td style="padding:6px 0;white-space:pre-wrap">' + escapeHtml(m.content) + '</td></tr>';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0B2233;max-width:640px">' +
    '<p style="margin:0 0 12px"><strong>A visitor asked for a person on the website chat.</strong><br>Reply to this email to answer them: the Reply-To is their address.</p>' +
    '<table style="border-collapse:collapse;margin:0 0 16px"><tr><td style="padding:2px 12px 2px 0;color:#5B8497">Email</td><td>' + escapeHtml(email) + '</td></tr>' +
    (page ? '<tr><td style="padding:2px 12px 2px 0;color:#5B8497">Page</td><td>' + escapeHtml(page) + '</td></tr>' : '') +
    (lang ? '<tr><td style="padding:2px 12px 2px 0;color:#5B8497">Language</td><td>' + escapeHtml(lang) + '</td></tr>' : '') + '</table>' +
    '<p style="margin:0 0 4px;color:#5B8497">Their note</p><p style="margin:0 0 16px;white-space:pre-wrap">' + (note ? escapeHtml(note) : '(none)') + '</p>' +
    (msgs.length ? '<p style="margin:0 0 4px;color:#5B8497">Chat so far</p><table style="border-collapse:collapse;border-top:1px solid #D8E4EA">' + msgs.map(row).join('') + '</table>' : '<p style="color:#5B8497">No chat was started before the request.</p>') +
    '<p style="margin:16px 0 0;color:#5B8497;font-size:13px">Chat history and status: <a href="' + escapeHtml(admin) + '">' + escapeHtml(admin) + '</a></p></div>';
  return { subject, htmlContent: html, textContent: text };
}

module.exports = { buildHandoffEmail };

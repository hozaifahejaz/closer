// Outgoing email through Resend (https://resend.com). Set the RESEND_API_KEY
// secret and the MAIL_FROM variable (e.g. "Closer <hello@yourdomain.com>", a
// domain verified in Resend) to switch password reset emails on.
export const mailEnabled = env => Boolean(env.RESEND_API_KEY && env.MAIL_FROM);

export async function sendMail(env, { to, subject, text, html }) {
  if (!mailEnabled(env)) throw new Error('Email is not set up');
  const res = await fetch(env.MAIL_API || 'https://api.resend.com/emails', { // MAIL_API: a stand-in endpoint for local testing
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email could not be sent (${res.status}) ${detail.slice(0, 200)}`);
  }
}

const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function resetEmail({ name, link }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Reset your Closer password',
    text: `${hi}\n\nSomeone asked to reset the password for your Closer account. Open this link within an hour to choose a new one:\n\n${link}\n\nIf this wasn't you, you can ignore this email; your password stays the same.\n\nCloser`,
    html: `<p>${escapeHtml(hi)}</p><p>Someone asked to reset the password for your Closer account. Open this link within an hour to choose a new one:</p>` +
      `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If this wasn't you, you can ignore this email; your password stays the same.</p><p>Closer</p>`,
  };
}

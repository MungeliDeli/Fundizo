import type { MailMessage } from './mailer.js';

/**
 * Email templates. Plain words, one action per email, a text version for every HTML version.
 * Every value from users is escaped. Links always point at WEB_BASE_URL.
 */
type To = MailMessage['to'];

export function verifyEmailMessage(
  to: To,
  firstName: string,
  code: string,
  link: string,
): MailMessage {
  return {
    to,
    tag: 'verify-email',
    subject: `${code} is your Fundizo code`,
    text: `Hi ${firstName},\n\nYour Fundizo code is ${code}. It expires in 15 minutes.\n\nOr open this link to confirm your email:\n${link}\n\nIf you didn't create a Fundizo account, you can ignore this email.`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p>Use this code to confirm your email address. It expires in 15 minutes.</p>
      <p style="font:700 32px/1 'Courier New',monospace;letter-spacing:8px;margin:24px 0;color:#17150F">${esc(code)}</p>
      ${button(link, 'Confirm my email')}
      <p style="color:#736C61;font-size:13px">If you didn't create a Fundizo account, you can ignore this email.</p>`),
  };
}

export function accountExistsMessage(
  to: To,
  firstName: string,
  loginLink: string,
  resetLink: string,
): MailMessage {
  return {
    to,
    tag: 'account-exists',
    subject: 'You already have a Fundizo account',
    text: `Hi ${firstName},\n\nSomeone (hopefully you) tried to sign up with this email, but you already have an account.\n\nLog in: ${loginLink}\nForgot your password? ${resetLink}\n\nIf this wasn't you, you can ignore this email. Your account is safe.`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p>Someone (hopefully you) tried to sign up with this email, but you already have a Fundizo account.</p>
      ${button(loginLink, 'Log in')}
      <p>Forgot your password? <a href="${esc(resetLink)}" style="color:#8F3F1D">Set a new one</a>.</p>
      <p style="color:#736C61;font-size:13px">If this wasn't you, you can ignore this email. Your account is safe.</p>`),
  };
}

export function resetPasswordMessage(to: To, firstName: string, link: string): MailMessage {
  return {
    to,
    tag: 'reset-password',
    subject: 'Set your Fundizo password',
    text: `Hi ${firstName},\n\nOpen this link to set a new password. It expires in 30 minutes and works once:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p>Use the button below to set a new password. The link expires in 30 minutes and works once.</p>
      ${button(link, 'Set a new password')}
      <p style="color:#736C61;font-size:13px">If you didn't ask for this, you can ignore this email.</p>`),
  };
}

export function passwordChangedMessage(to: To, firstName: string, resetLink: string): MailMessage {
  return {
    to,
    tag: 'password-changed',
    subject: 'Your Fundizo password was changed',
    text: `Hi ${firstName},\n\nYour password was just changed, and you were logged out on your other devices.\n\nIf this wasn't you, reset your password now: ${resetLink}`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p>Your password was just changed, and you were logged out on your other devices.</p>
      <p>If this wasn't you, <a href="${esc(resetLink)}" style="color:#8F3F1D">reset your password now</a>.</p>`),
  };
}

export function phoneConfirmedMessage(
  to: To,
  firstName: string,
  maskedPhone: string,
  resetLink: string,
): MailMessage {
  return {
    to,
    tag: 'phone-confirmed',
    subject: 'Your phone number was confirmed',
    text: `Hi ${firstName},\n\nThe phone number ${maskedPhone} is now confirmed on your Fundizo account.\n\nIf this wasn't you, reset your password now: ${resetLink}`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p>The phone number <strong>${esc(maskedPhone)}</strong> is now confirmed on your Fundizo account.</p>
      <p>If this wasn't you, <a href="${esc(resetLink)}" style="color:#8F3F1D">reset your password now</a>.</p>`),
  };
}

export function fundraiserLiveMessage(
  to: To,
  firstName: string,
  title: string,
  link: string,
): MailMessage {
  return {
    to,
    tag: 'fundraiser-live',
    subject: 'Your fundraiser is live',
    text: `Hi ${firstName},\n\n"${title}" is live and ready for donations.\n\nShare this link with family and friends (WhatsApp works best):\n${link}\n\nYou can withdraw once we have checked the people and the need. We'll tell you what we need.`,
    html: layout(`
      <p>Hi ${esc(firstName)},</p>
      <p><strong>${esc(title)}</strong> is live and ready for donations.</p>
      <p>Share the link with family and friends. WhatsApp works best.</p>
      ${button(link, 'See your fundraiser')}
      <p style="color:#736C61;font-size:13px">You can withdraw once we have checked the people and the need. We'll tell you what we need.</p>`),
  };
}

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F3EE;padding:24px 12px;font-family:Inter,Arial,sans-serif;color:#17150F;font-size:15px;line-height:1.5">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E3DDD3;border-radius:16px">
<tr><td style="padding:28px">
<p style="font:700 22px Arial,sans-serif;margin:0 0 20px;letter-spacing:-0.5px">fundizo<span style="color:#B4532A">.</span></p>
${body}
</td></tr></table>
<p style="text-align:center;color:#736C61;font-size:12px;margin-top:16px">Fundizo · Raise and give together, in Zambia</p>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#B4532A;color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">${esc(label)}</a></p>`;
}

export function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

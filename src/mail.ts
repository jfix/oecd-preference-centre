// Transactional emails (confirmation, sign-in link) are sent by the preference centre, not Adestra.
// The prototype stores them in dev_mail (see /dev/mailbox). For real sending, swap DevMailer for
// Cloudflare Email Service on Workers, or Azure Communication Services Email on Azure.

import { editionsById, t } from './config';
import type { Env } from './env';
import { esc } from './html';

// Placeholder sender; the real address depends on the sending domain chosen for production.
export const FROM_NAME = 'OECD';
export const FROM_ADDRESS = 'newsletters@oecd.org';

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<void>;
}

class DevMailer implements Mailer {
  constructor(private env: Env) {}
  async send(to: string, subject: string, html: string) {
    await this.env.DB.prepare(`INSERT INTO dev_mail (to_email, subject, html) VALUES (?1, ?2, ?3)`).bind(to, subject, html).run();
  }
}

export const mailer = (env: Env): Mailer => new DevMailer(env);

const layout = (body: string) => `<!doctype html><html><body style="margin:0;background:#F0F4F8;font-family:'Noto Sans',Arial,sans-serif;color:#586179">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#101D40;padding:20px 32px;color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px">OECD</td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.55">${body}</td></tr>
</table></td></tr></table></body></html>`;

const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#156DF9;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:4px;display:inline-block">${esc(label)}</a></p>`;

export function confirmEmail(lang: string, link: string, editionIds: string[]) {
  const items = editionIds
    .map((id) => editionsById.get(id))
    .filter(Boolean)
    .map((e) => `<li style="margin:4px 0;color:#101D40;font-weight:700">${esc(e!.name)}</li>`)
    .join('');
  return {
    subject: t(lang, 'email.confirmSubject'),
    html: layout(
      `<p>${esc(t(lang, 'email.confirmIntro'))}</p><ul style="padding-left:20px">${items}</ul>` +
        `${button(link, t(lang, 'email.confirmButton'))}<p style="font-size:13px">${esc(t(lang, 'email.confirmFoot'))}</p>`,
    ),
  };
}

export function signinEmail(lang: string, link: string) {
  return {
    subject: t(lang, 'email.signinSubject'),
    html: layout(
      `<p>${esc(t(lang, 'email.signinIntro'))}</p>${button(link, t(lang, 'email.signinButton'))}` +
        `<p style="font-size:13px">${esc(t(lang, 'email.signinFoot'))}</p>`,
    ),
  };
}

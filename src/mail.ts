// Transactional emails (confirmation, sign-in link) are sent by the preference centre, not Adestra.
// The prototype stores them in dev_mail (see /dev/mailbox). For real sending, swap DevMailer for
// Cloudflare Email Service on Workers, or Azure Communication Services Email on Azure.

import { editionsById } from './catalogue';
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

type L = 'en' | 'fr';

const copy = {
  en: {
    confirmSubject: 'Confirm your OECD subscription',
    confirmIntro: 'Please confirm that you want to receive:',
    confirmButton: 'Confirm subscription',
    confirmFoot: "If you didn't request this, ignore this email and you won't be subscribed. This link expires in 7 days.",
    signinSubject: 'Your link to manage OECD subscriptions',
    signinIntro: 'Use the button below to manage your OECD newsletters and blog alerts.',
    signinButton: 'Manage my subscriptions',
    signinFoot: "If you didn't request this, you can ignore this email. This link expires in 1 hour.",
  },
  fr: {
    confirmSubject: 'Confirmez votre abonnement OCDE',
    confirmIntro: 'Merci de confirmer que vous souhaitez recevoir :',
    confirmButton: "Confirmer l'abonnement",
    confirmFoot: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : vous ne serez pas abonné. Ce lien expire dans 7 jours.",
    signinSubject: 'Votre lien pour gérer vos abonnements OCDE',
    signinIntro: 'Utilisez le bouton ci-dessous pour gérer vos lettres d’information et alertes de blog OCDE.',
    signinButton: 'Gérer mes abonnements',
    signinFoot: "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message. Ce lien expire dans 1 heure.",
  },
};

const layout = (body: string) => `<!doctype html><html><body style="margin:0;background:#F0F4F8;font-family:'Noto Sans',Arial,sans-serif;color:#586179">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#101D40;padding:20px 32px;color:#fff;font-size:22px;font-weight:900;letter-spacing:-0.5px">OECD</td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.55">${body}</td></tr>
</table></td></tr></table></body></html>`;

const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#156DF9;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:4px;display:inline-block">${esc(label)}</a></p>`;

export function confirmEmail(lang: L, link: string, editionIds: string[]) {
  const t = copy[lang];
  const items = editionIds
    .map((id) => editionsById.get(id))
    .filter(Boolean)
    .map((e) => `<li style="margin:4px 0;color:#101D40;font-weight:700">${esc(e!.name)}</li>`)
    .join('');
  return {
    subject: t.confirmSubject,
    html: layout(`<p>${t.confirmIntro}</p><ul style="padding-left:20px">${items}</ul>${button(link, t.confirmButton)}<p style="font-size:13px">${t.confirmFoot}</p>`),
  };
}

export function signinEmail(lang: L, link: string) {
  const t = copy[lang];
  return {
    subject: t.signinSubject,
    html: layout(`<p>${t.signinIntro}</p>${button(link, t.signinButton)}<p style="font-size:13px">${t.signinFoot}</p>`),
  };
}

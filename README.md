# OECD newsletter preference centre (prototype)

A modern replacement for the OECD's newsletter signup pages: one catalogue of all newsletters and blog alerts, signup by email with double opt-in, a signed-in view to manage subscriptions, and an embeddable widget for section pages on oecd.org.

**The preference centre is the source of truth** for who is subscribed to what. Adestra only sends the newsletters; it is told about every subscribe and unsubscribe through its REST API.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then set SIGNING_SECRET to a long random string
npm run db:migrate
npm run dev
```

Open http://localhost:8787. The yellow "Prototype" bar links to:

- **Mailbox** (`/dev/mailbox`): the confirmation and sign-in emails the prototype "sent". Click the links in them to continue the flow.
- **Adestra sync** (`/dev/adestra`): the outbox of changes pushed to Adestra, the consent log, and a sample newsletter footer with manage/unsubscribe links.
- **Widget demo** (`/demo/tax.html`): the signup widget on a mock oecd.org topic page.

## Deployed prototype

https://oecd-preference-centre.jakob-fix.workers.dev (Cloudflare Workers + D1)

The `/dev/*` pages (mailbox, Adestra sync) need a password, user `oecd`. Set it with `wrangler secret put DEV_PASSWORD`. Deploy changes with `npm run deploy`; apply new migrations with `wrangler d1 migrations apply prefs --remote`.

## How it works

| Situation | What happens |
|---|---|
| Visitor picks newsletters and enters an email | Confirmation email with a signed link (valid 7 days). Response is the same whether or not the address is known. |
| They click the link | A page with a **Confirm** button (POST, so email link scanners can't confirm on their behalf). Subscriptions are saved, changes queued for Adestra, and they're signed in for 30 days. |
| Signed-in visitor | Toggles take effect immediately, with undo. "My subscriptions" filter. |
| "Manage subscriptions" | Email a one-hour sign-in link. No passwords. |
| Newsletter footer | "Manage" link (signs them in) and per-newsletter unsubscribe link (also supports RFC 8058 one-click). The manage URL is pushed to Adestra as a contact field. |

Changes go to an `outbox` table and are pushed to Adestra straight after the request, with a cron trigger every 5 minutes retrying failures. Every request, confirmation, subscribe and unsubscribe is recorded in `consent_events`.

### Catalogue

`src/catalogue.ts` lists topics (newsletters or blogs), each with one or more language **editions**. An edition is what people subscribe to and maps to one Adestra list. Newsletter names and descriptions come from oecd.org; the blogs and all Adestra list IDs are placeholders.

### Embedding the widget

```html
<script type="module" src="https://<preference-centre-host>/widget.js"></script>
<oecd-newsletter-signup topic="tax" lang="en"></oecd-newsletter-signup>
```

The embedding site's origin must be listed in `WIDGET_ORIGINS`, and its Content Security Policy must allow the script and API calls.

## Code layout

- `src/index.ts`: routes (API, email-link pages, dev tools)
- `src/store.ts`: database access and the Adestra outbox
- `src/adestra.ts`: fake adapter (default) and REST adapter (used when `ADESTRA_API_KEY` is set; **untested** against a live account)
- `src/tokens.ts`: HMAC-signed tokens for confirm, sign-in, session, manage and unsubscribe links
- `src/mail.ts`: transactional emails (stored in `dev_mail` for now)
- `public/`: catalogue page (`index.html`, `app.js`, `styles.css`), widget, demo page

## Not done yet

- Real email sending (Cloudflare Email Service now, Azure Communication Services later)
- Bot protection on the signup and sign-in endpoints (Turnstile) and rate limiting
- Receiving bounces and complaints back from Adestra
- Verifying the Adestra REST adapter against a real account
- Analytics, accessibility audit, full French copy for the server-rendered pages

## Moving to Azure

The code is written to keep the move small: Hono runs on Azure Functions or App Service, the SQL is plain enough for Azure SQL or Postgres, the outbox can become a Storage Queue, and email/Adestra are behind small interfaces.

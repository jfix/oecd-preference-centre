import { adestra } from './adestra';
import type { Env } from './env';
import { sign } from './tokens';

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  source?: string | null;
}

export async function ensureContact(env: Env, email: string, uiLang = 'en'): Promise<number> {
  const row = await env.DB.prepare(
    `INSERT INTO contacts (email, ui_lang) VALUES (?1, ?2)
     ON CONFLICT(email) DO UPDATE SET updated_at = datetime('now')
     RETURNING id`,
  )
    .bind(email, uiLang)
    .first<{ id: number }>();
  return row!.id;
}

export async function activeEditions(env: Env, email: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.edition_id FROM subscriptions s JOIN contacts c ON c.id = s.contact_id
     WHERE c.email = ?1 AND s.status = 'active'`,
  )
    .bind(email)
    .all<{ edition_id: string }>();
  return results.map((r) => r.edition_id);
}

/** Sets the given editions to active/unsubscribed and queues the changes for Adestra. Returns the editions that changed. */
export async function setSubscriptions(
  env: Env,
  email: string,
  editionIds: string[],
  status: 'active' | 'unsubscribed',
  meta: RequestMeta,
): Promise<string[]> {
  if (editionIds.length === 0) return [];
  const contactId = await ensureContact(env, email);
  const current = new Set(await activeEditions(env, email));
  const changed = editionIds.filter((id) => (status === 'active' ? !current.has(id) : current.has(id)));
  if (changed.length === 0) return [];

  const stmts = changed.flatMap((id) => [
    env.DB.prepare(
      `INSERT INTO subscriptions (contact_id, edition_id, status, source) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(contact_id, edition_id) DO UPDATE SET status = ?3, source = ?4, updated_at = datetime('now')`,
    ).bind(contactId, id, status, meta.source ?? null),
    env.DB.prepare(`INSERT INTO outbox (email, edition_id, action) VALUES (?1, ?2, ?3)`).bind(
      email,
      id,
      status === 'active' ? 'subscribe' : 'unsubscribe',
    ),
  ]);
  stmts.push(consentStmt(env, email, status === 'active' ? 'subscribed' : 'unsubscribed', changed, meta));
  await env.DB.batch(stmts);
  return changed;
}

const consentStmt = (env: Env, email: string, action: string, editionIds: string[], meta: RequestMeta) =>
  env.DB.prepare(
    `INSERT INTO consent_events (email, action, edition_ids, source, ip, user_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(email, action, JSON.stringify(editionIds), meta.source ?? null, meta.ip ?? null, meta.userAgent ?? null);

export const logConsent = (env: Env, email: string, action: string, editionIds: string[], meta: RequestMeta) =>
  consentStmt(env, email, action, editionIds, meta).run();

export async function manageUrl(env: Env, email: string) {
  return `${env.PUBLIC_BASE_URL}/signin?token=${await sign({ t: 'manage', e: email }, env.SIGNING_SECRET)}`;
}

/** Pushes pending changes to Adestra. Called after each change and from the cron trigger as a safety net. */
export async function processOutbox(env: Env, limit = 25) {
  const { results } = await env.DB.prepare(
    `SELECT id, email, edition_id, action, attempts FROM outbox
     WHERE status = 'pending' ORDER BY id LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: number; email: string; edition_id: string; action: 'subscribe' | 'unsubscribe'; attempts: number }>();

  const client = adestra(env);
  for (const job of results) {
    const res = await client.apply(job.email, job.edition_id, job.action, await manageUrl(env, job.email));
    const attempts = job.attempts + 1;
    const status = res.ok ? 'done' : attempts >= 8 ? 'failed' : 'pending';
    await env.DB.prepare(
      `UPDATE outbox SET status = ?2, attempts = ?3, last_error = ?4, request_log = ?5,
       processed_at = CASE WHEN ?2 = 'pending' THEN NULL ELSE datetime('now') END WHERE id = ?1`,
    )
      .bind(job.id, status, attempts, res.error ?? null, res.log)
      .run();
  }
}

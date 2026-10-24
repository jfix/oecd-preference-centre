// Adestra only sends the newsletters. We tell it who is on which list.
// The real adapter's endpoints follow Adestra's REST API v1 but have not been tested
// against a live account yet; check them (and the core table setup) before relying on them.

import { editionsById } from './catalogue';
import type { Env } from './env';

export interface SyncResult {
  ok: boolean;
  log: string;
  error?: string;
}

export interface AdestraClient {
  apply(email: string, editionId: string, action: 'subscribe' | 'unsubscribe', manageUrl: string): Promise<SyncResult>;
}

class FakeAdestra implements AdestraClient {
  async apply(email: string, editionId: string, action: 'subscribe' | 'unsubscribe', manageUrl: string) {
    const list = editionsById.get(editionId)?.adestraListId;
    const log = [
      `POST /contacts/merge  { email: "${email}", manage_url: "${manageUrl.slice(0, 48)}…" }`,
      action === 'subscribe' ? `POST /contacts/{id}/lists/${list}` : `DELETE /contacts/{id}/lists/${list}`,
    ].join('\n');
    return { ok: true, log };
  }
}

class RestAdestra implements AdestraClient {
  constructor(private env: Env) {}

  private async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${this.env.ADESTRA_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `TOKEN ${this.env.ADESTRA_API_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json<any>();
  }

  async apply(email: string, editionId: string, action: 'subscribe' | 'unsubscribe', manageUrl: string) {
    const list = editionsById.get(editionId)?.adestraListId;
    try {
      const contact = await this.call('POST', `/contacts/merge`, {
        table_id: Number(this.env.ADESTRA_CORE_TABLE_ID),
        data: { email, manage_url: manageUrl },
        dedupe_field: 'email',
      });
      const path = `/contacts/${contact.id}/lists/${list}`;
      await this.call(action === 'subscribe' ? 'POST' : 'DELETE', path);
      return { ok: true, log: `contact ${contact.id}: ${action} list ${list}` };
    } catch (err) {
      return { ok: false, log: '', error: String(err) };
    }
  }
}

export const adestra = (env: Env): AdestraClient => (env.ADESTRA_API_KEY ? new RestAdestra(env) : new FakeAdestra());

// Stateless signed tokens (HMAC-SHA256). Pending confirmations need no database row:
// the token itself carries the email, the editions and the expiry.

export type TokenPayload =
  | { t: 'confirm'; e: string; ed: string[]; src?: string; exp: number }
  | { t: 'signin'; e: string; exp: number }
  | { t: 'session'; e: string; exp: number }
  // Unsubscribe links never expire: they go in every newsletter footer.
  | { t: 'unsub'; e: string; ed: string[] }
  | { t: 'manage'; e: string };

const enc = new TextEncoder();

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

const keyCache = new Map<string, Promise<CryptoKey>>();
const key = (secret: string) => {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, k);
  }
  return k;
};

export const hours = (n: number) => Math.floor(Date.now() / 1000) + n * 3600;

export async function sign(payload: TokenPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verify<T extends TokenPayload['t']>(
  token: string | undefined | null,
  type: T,
  secret: string,
): Promise<Extract<TokenPayload, { t: T }> | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as TokenPayload;
    if (payload.t !== type) return null;
    if ('exp' in payload && payload.exp < Date.now() / 1000) return null;
    return payload as Extract<TokenPayload, { t: T }>;
  } catch {
    return null;
  }
}

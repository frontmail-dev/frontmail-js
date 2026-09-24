/** RFC 4122 v4 UUID; uses `crypto.randomUUID` when available (secure contexts only). */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const rnd = () => (c?.getRandomValues ? c.getRandomValues(new Uint8Array(1))[0]! : (Math.random() * 256) | 0);
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (d) => (+d ^ (rnd() & (15 >> (+d / 4)))).toString(16));
}

/** Recursively converts snake_case object keys to camelCase. */
export function camelize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) return value.map(camelize) as T;
  if (value && typeof value == 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const k in value) out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = camelize((value as Record<string, unknown>)[k]);
    return out as T;
  }
  return value as T;
}

/** Parses a `Retry-After` header (seconds or HTTP date) into seconds. */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const n = Number(header);
  const s = isNaN(n) ? (Date.parse(header) - Date.now()) / 1000 : n;
  return isNaN(s) ? undefined : Math.max(0, s);
}

/** Full-jitter exponential backoff: random in [0, min(max, base * 2^attempt)). */
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random = Math.random): number {
  return Math.floor(random() * Math.min(maxMs, baseMs * 2 ** attempt));
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

import { vi } from 'vitest';

export interface Call {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const accepted = (status: 'queued' | 'held' = 'queued') =>
  jsonResponse(202, { message_id: 'msg_1', status, status_token: 'tok_1' });

export const apiError = (status: number, code: string, headers?: Record<string, string>) =>
  jsonResponse(status, { error: { code, message: code + ' message', docs_url: 'https://docs/x', details: { a: 1 } } }, headers);

/** fetch mock returning the queued responses (or throwing queued errors) in order. */
export function mockFetch(...responses: Array<Response | Error | (() => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init: init as Call['init'] });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    if (typeof next == 'function') return next();
    return next!.clone();
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

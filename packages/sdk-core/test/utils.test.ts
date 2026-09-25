import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { backoffDelay, camelize, docsUrlFor, parseRetryAfter } from '../src';

describe('utils', () => {
  it('backoffDelay applies full jitter with a cap', () => {
    expect(backoffDelay(0, 100, 1000, () => 0.999)).toBe(99);
    expect(backoffDelay(5, 100, 1000, () => 0.5)).toBe(500);
    expect(backoffDelay(3, 100, 1000, () => 0)).toBe(0);
  });
  it('parseRetryAfter handles seconds and dates', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('5')).toBe(5);
    expect(parseRetryAfter('nonsense')).toBeUndefined();
    const s = parseRetryAfter(new Date(Date.now() + 10_000).toUTCString())!;
    expect(s).toBeGreaterThan(8);
    expect(s).toBeLessThanOrEqual(10);
  });
  it('camelize converts nested keys', () => {
    expect(camelize({ message_id: 1, events: [{ sent_at: 2 }], nested: { next_cursor: null } })).toEqual({
      messageId: 1,
      events: [{ sentAt: 2 }],
      nested: { nextCursor: null },
    });
  });
  it('camelize never copies prototype-changing keys', () => {
    const out = camelize<Record<string, unknown>>(
      JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}},"prototype":2,"ok_key":{"__proto__":{"y":1}}}'),
    );
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out)).toEqual(['okKey']);
    expect(Object.getPrototypeOf(out.okKey)).toBe(Object.prototype);
    expect((out as { polluted?: unknown }).polluted).toBeUndefined();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
  it('docsUrlFor', () => {
    expect(docsUrlFor('invalid_template_params')).toBe('https://docs.frontmail.dev/reference/errors/#invalid-template-params');
  });
});

describe('ERROR_STATUS', () => {
  // In the private monorepo the server-side table (packages/core) is the source of truth. The public
  // SDK mirror (frontmail-js) has no server code, so `scripts/sdk-export.mjs` writes a snapshot of it
  // next to this test instead. One of the two must exist – the test never silently skips.
  it('mirrors the server-side error table', async () => {
    // Plain paths: jsdom replaces the global `URL`, so `new URL(rel, import.meta.url)` is unreliable here.
    const here = dirname(fileURLToPath(import.meta.url));
    const serverTable = resolve(here, '../../core/src/errors.ts');
    const snapshot = resolve(here, 'error-codes.snapshot.json');
    let expected: Record<string, number>;
    if (existsSync(serverTable)) {
      ({ ERROR_CODES: expected } = (await import(/* @vite-ignore */ serverTable)) as { ERROR_CODES: Record<string, number> });
    } else {
      expect(existsSync(snapshot), 'error-codes.snapshot.json missing – run scripts/sdk-export.mjs').toBe(true);
      expected = JSON.parse(readFileSync(snapshot, 'utf8')) as Record<string, number>;
    }
    const { ERROR_STATUS } = await import('../src');
    expect(ERROR_STATUS).toEqual(expected);
  });
});

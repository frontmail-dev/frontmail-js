// Fails when the UMD bundle exceeds the gzip budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// 3.5 kB since the private-key guard and form-field filtering (security fixes, 0.2.0).
const LIMIT = 3.5 * 1024;
const files = ['dist/frontmail.umd.js', 'dist/index.js'];
let failed = false;
for (const file of files) {
  const code = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  // sdk-core must be inlined – an external reference means it was not built first (turbo ^build).
  if (code.includes('@frontmail/sdk-core')) {
    console.error(`${file}: @frontmail/sdk-core is not bundled – build it first (pnpm turbo run build --filter=@frontmail/browser)`);
    failed = true;
    continue;
  }
  const size = gzipSync(readFileSync(new URL('../' + file, import.meta.url)), { level: 9 }).length;
  const budget = file.includes('umd');
  const over = budget && size > LIMIT;
  failed ||= over;
  console.log(`${file}: ${(size / 1024).toFixed(2)} kB gzip${budget ? ` (limit ${LIMIT / 1024} kB)` : ''}${over ? ' – OVER BUDGET' : ''}`);
}
process.exit(failed ? 1 : 0);

// Fails when the UMD bundle exceeds the gzip budget.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 3 * 1024;
const files = ['dist/frontmail.umd.js', 'dist/index.js'];
let failed = false;
for (const file of files) {
  const size = gzipSync(readFileSync(new URL('../' + file, import.meta.url)), { level: 9 }).length;
  const budget = file.includes('umd');
  const over = budget && size > LIMIT;
  failed ||= over;
  console.log(`${file}: ${(size / 1024).toFixed(2)} kB gzip${budget ? ` (limit ${LIMIT / 1024} kB)` : ''}${over ? ' – OVER BUDGET' : ''}`);
}
process.exit(failed ? 1 : 0);

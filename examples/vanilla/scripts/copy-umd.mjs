// Copies the UMD build of @frontmail/browser into public/ so umd.html can load it with a plain <script>.
// In production you would use the CDN instead: https://cdn.jsdelivr.net/npm/@frontmail/browser/dist/frontmail.umd.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(import.meta.resolve('@frontmail/browser/umd'));
// Generated file – keep it out of lint.
writeFileSync(new URL('../public/frontmail.umd.js', import.meta.url), '/* eslint-disable */\n' + readFileSync(src, 'utf8'));
console.log('copied', src);

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isFrontmailError } from '@frontmail/sdk-core';
import { Frontmail } from './client';
import { SDK_MODULES, generateTypes } from './codegen';

const HELP = `Usage: frontmail types [options]

Generates TypeScript types for your template params so send() is checked at compile time.

Options:
  --out <file>       Output file (default: frontmail-env.d.ts)
  --api-url <url>    API base URL (default: $FRONTMAIL_API_URL or https://api.frontmail.dev)
  --module <name>    SDK module to augment (repeatable). Default: SDK packages found in ./package.json
  --stdout           Print instead of writing a file
  -h, --help         Show this help

Environment:
  FRONTMAIL_PRIVATE_KEY   Private key (sk_…) – required
`;

/** SDK modules listed in the project's package.json (falls back to all). */
export function detectModules(cwd: string): string[] {
  const file = resolve(cwd, 'package.json');
  if (!existsSync(file)) return [...SDK_MODULES];
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const found = SDK_MODULES.filter((m) => m in deps);
    return found.length ? found : [...SDK_MODULES];
  } catch {
    return [...SDK_MODULES];
  }
}

export interface CliIO {
  env: Record<string, string | undefined>;
  cwd: string;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  fetch?: typeof fetch;
}

export async function runCli(argv: string[], io: CliIO): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string', default: 'frontmail-env.d.ts' },
        'api-url': { type: 'string' },
        module: { type: 'string', multiple: true },
        stdout: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    io.stderr(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const [command] = args.positionals;
  if (args.values.help || !command) {
    io.stdout(HELP);
    return args.values.help ? 0 : 2;
  }
  if (command !== 'types') {
    io.stderr(`Unknown command "${command}".\n\n${HELP}`);
    return 2;
  }
  const privateKey = io.env.FRONTMAIL_PRIVATE_KEY;
  if (!privateKey) {
    io.stderr('FRONTMAIL_PRIVATE_KEY is not set. Create a private key in the dashboard (Settings → API keys).\n');
    return 1;
  }
  try {
    const fm = new Frontmail({ privateKey, apiUrl: args.values['api-url'] ?? io.env.FRONTMAIL_API_URL, fetch: io.fetch });
    const templates = await fm.templates.list();
    const code = generateTypes(templates, { modules: args.values.module ?? detectModules(io.cwd) });
    if (args.values.stdout) {
      io.stdout(code);
    } else {
      const out = resolve(io.cwd, args.values.out!);
      writeFileSync(out, code);
      io.stdout(`Wrote types for ${templates.length} template(s) to ${out}\n`);
    }
    return 0;
  } catch (e) {
    const msg = isFrontmailError(e) ? `${e.code}: ${e.message}${e.docsUrl ? ` (${e.docsUrl})` : ''}` : String(e);
    io.stderr(`frontmail types failed – ${msg}\n`);
    return 1;
  }
}

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { generateTypes, pascalCase } from '../src';
import type { TemplateSchema } from '../src';
import { runCli } from '../src/cli';
import { jsonResponse, mockFetch } from './helpers';

const templates: TemplateSchema[] = [
  {
    templateId: 'tpl_contact',
    name: 'Contact form',
    params: [
      { name: 'name', label: 'Your name', type: 'string', required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'age', type: 'number', required: false },
      { name: 'newsletter', type: 'boolean', required: false, default: false },
      { name: 'date', type: 'date', required: false },
      { name: 'topic', type: 'enum', required: true, enumValues: ['sales', 'support'] },
      {
        name: 'items',
        type: 'list',
        required: false,
        itemFields: [
          { name: 'title', type: 'string', required: true },
          { name: 'qty', type: 'number', required: false },
        ],
      },
      { name: 'first-name', type: 'text', required: false, description: 'Contains */ comment end' },
    ],
  },
  { templateId: 'tpl_empty', name: 'Příliš žluťoučký kůň', params: [] },
  { templateId: 'tpl_dup', name: 'Contact form', params: [] },
];

describe('generateTypes', () => {
  it('maps ParamDef types', () => {
    const out = generateTypes(templates, { modules: ['@frontmail/react'] });
    expect(out).toMatchSnapshot();
    expect(out).toContain('export interface ContactFormParams {');
    expect(out).toContain('  name: string;');
    expect(out).toContain('  age?: number;');
    expect(out).toContain('  newsletter?: boolean;');
    expect(out).toContain('  date?: string;');
    expect(out).toContain('  topic: "sales" | "support";');
    expect(out).toContain('  items?: Array<{\n    title: string;\n    qty?: number;\n  }>;');
    expect(out).toContain('  "first-name"?: string;');
    expect(out).not.toContain('Contains */');
    expect(out).toContain('export interface PrilisZlutouckyKunParams {}');
    expect(out).toContain('export interface ContactForm2Params {}');
    expect(out).toContain("declare module \"@frontmail/react\" {\n  interface FrontmailTemplates {\n    \"tpl_contact\": ContactFormParams;");
  });

  it('pascalCase', () => {
    expect(pascalCase('123 go')).toBe('Template123Go');
    expect(pascalCase('!!!')).toBe('Template');
  });

  it('produces declarations that type-check send() params', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fm-types-'));
    // Minimal stand-in for an SDK package exposing FrontmailTemplates.
    mkdirSync(join(dir, 'node_modules/@frontmail/react'), { recursive: true });
    writeFileSync(join(dir, 'node_modules/@frontmail/react/package.json'), JSON.stringify({ name: '@frontmail/react', types: 'index.d.ts' }));
    writeFileSync(
      join(dir, 'node_modules/@frontmail/react/index.d.ts'),
      `export interface FrontmailTemplates {}
       export type TemplateParams<T extends string> = T extends keyof FrontmailTemplates ? FrontmailTemplates[T] : Record<string, unknown>;
       export declare function send<T extends string>(templateId: T, params: TemplateParams<T>): void;`,
    );
    writeFileSync(join(dir, 'frontmail-env.d.ts'), generateTypes(templates, { modules: ['@frontmail/react'] }));
    writeFileSync(
      join(dir, 'app.ts'),
      `import { send } from '@frontmail/react';
       send('tpl_contact', { name: 'Jan', email: 'a@b.cz', topic: 'sales', items: [{ title: 'x' }] });
       send('tpl_other', { anything: 1 });
       // @ts-expect-error – invalid enum value
       send('tpl_contact', { name: 'Jan', email: 'a@b.cz', topic: 'nope' });
       // @ts-expect-error – missing required param
       send('tpl_contact', { email: 'a@b.cz', topic: 'sales' });`,
    );
    const program = ts.createProgram([join(dir, 'app.ts'), join(dir, 'frontmail-env.d.ts')], {
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      // Only the ES lib (no DOM) and no lib checking – keeps this in-process compile fast on CI.
      lib: ['lib.es2022.d.ts'],
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      types: [],
    });
    const diags = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(diags).toEqual([]);
    // A full TypeScript program can take several seconds on busy CI runners.
  }, 60_000);
});

describe('frontmail types CLI', () => {
  const io = (env: Record<string, string>, cwd: string, fetch?: typeof globalThis.fetch) => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { env, cwd, fetch, stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } };
  };

  it('requires FRONTMAIL_PRIVATE_KEY', async () => {
    const t = io({}, tmpdir());
    expect(await runCli(['types'], t.io)).toBe(1);
    expect(t.err.join('')).toContain('FRONTMAIL_PRIVATE_KEY');
  });

  it('prints help and rejects unknown commands', async () => {
    const t = io({}, tmpdir());
    expect(await runCli(['--help'], t.io)).toBe(0);
    expect(t.out.join('')).toContain('Usage: frontmail types');
    expect(await runCli(['nope'], t.io)).toBe(2);
    expect(await runCli(['types', '--bogus'], t.io)).toBe(2);
  });

  it('fetches templates and writes the file, augmenting installed SDKs', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'fm-cli-'));
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { '@frontmail/vue': '^1', vue: '^3' } }));
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { items: [{ template_id: 'tpl_1', name: 'Order', params: [{ name: 'total', type: 'number', required: true }] }] }),
    );
    const t = io({ FRONTMAIL_PRIVATE_KEY: 'sk_1' }, cwd, fetch);
    expect(await runCli(['types', '--out', 'fm.d.ts', '--api-url', 'http://localhost:3000'], t.io)).toBe(0);
    expect(calls[0]!.url).toBe('http://localhost:3000/v1/templates');
    expect(calls[0]!.init.headers.Authorization).toBe('Bearer sk_1');
    const file = readFileSync(join(cwd, 'fm.d.ts'), 'utf8');
    expect(file).toContain('export interface OrderParams {\n  total: number;\n}');
    expect(file).toContain('declare module "@frontmail/vue"');
    expect(file).not.toContain('declare module "@frontmail/react"');
    expect(t.out.join('')).toContain('1 template(s)');
  });

  it('supports --stdout and --module', async () => {
    const { fetch } = mockFetch(jsonResponse(200, { items: [] }));
    const t = io({ FRONTMAIL_PRIVATE_KEY: 'sk_1' }, tmpdir(), fetch);
    expect(await runCli(['types', '--stdout', '--module', '@frontmail/browser', '--module', '@frontmail/node'], t.io)).toBe(0);
    const out = t.out.join('');
    expect(out).toContain('declare module "@frontmail/browser"');
    expect(out).toContain('declare module "@frontmail/node"');
  });

  it('reports API errors', async () => {
    const { fetch } = mockFetch(
      jsonResponse(401, { error: { code: 'invalid_private_key', message: 'Invalid key', docs_url: 'https://docs/x' } }),
    );
    const t = io({ FRONTMAIL_PRIVATE_KEY: 'sk_bad' }, tmpdir(), fetch);
    expect(await runCli(['types'], t.io)).toBe(1);
    expect(t.err.join('')).toContain('invalid_private_key: Invalid key');
  });
});

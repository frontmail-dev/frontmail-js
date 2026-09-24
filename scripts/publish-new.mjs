#!/usr/bin/env node
// Publishes every public package in packages/* whose current version is not on npm yet, then makes
// sure a git tag + GitHub release `<name>@<version>` exists for it.
//
// This repository has no Changesets state (versions are bumped in the private monorepo), so "what
// to publish" is simply "package.json version missing on the registry". Safe to re-run: published
// versions are skipped and missing releases are created on the next run.
//
//   node scripts/publish-new.mjs             # publish (CI)
//   node scripts/publish-new.mjs --dry-run   # only report what would happen
//
// Tarballs are built with `pnpm pack` (resolves `workspace:*`, applies publishConfig) and published
// with `npm publish` (npm >= 11.5.1 handles Trusted Publishing / OIDC and provenance).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const inCi = process.env.GITHUB_ACTIONS === 'true';

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  return res;
}

function mustRun(cmd, args, opts = {}) {
  const res = run(cmd, args, { stdio: 'inherit', ...opts });
  if (res.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status}`);
}

/** Public workspace packages, dependencies first. */
function listPackages() {
  const pkgs = readdirSync(join(root, 'packages'))
    .map((dir) => join(root, 'packages', dir))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .map((dir) => ({ dir, json: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
    .filter((p) => !p.json.private);
  const names = new Set(pkgs.map((p) => p.json.name));
  const internalDeps = (p) =>
    Object.keys({
      ...p.json.dependencies,
      ...p.json.peerDependencies,
      ...p.json.devDependencies,
    }).filter((d) => names.has(d));
  const ordered = [];
  const seen = new Set();
  const visit = (p) => {
    if (seen.has(p.json.name)) return;
    seen.add(p.json.name);
    for (const dep of internalDeps(p)) visit(pkgs.find((q) => q.json.name === dep));
    ordered.push(p);
  };
  pkgs.sort((a, b) => a.json.name.localeCompare(b.json.name)).forEach(visit);
  return ordered;
}

/** true = this exact version is on npm; false = package or version missing; throws otherwise. */
function isPublished(name, version) {
  const res = run('npm', ['view', `${name}@${version}`, 'version', '--json']);
  if (res.status === 0) return res.stdout.trim() !== ''; // existing package, unknown version → empty output
  if (/E404|404 Not Found/.test(res.stderr + res.stdout)) return false;
  throw new Error(`npm view ${name}@${version} failed:\n${res.stderr}`);
}

function changelogSection(dir, version) {
  const file = join(dir, 'CHANGELOG.md');
  if (!existsSync(file)) return '';
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${version}`);
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}

function publish({ dir, json }) {
  const out = mkdtempSync(join(tmpdir(), 'frontmail-pack-'));
  try {
    mustRun('pnpm', ['pack', '--pack-destination', out], { cwd: dir });
    const tarball = readdirSync(out).find((f) => f.endsWith('.tgz'));
    if (!tarball) throw new Error(`pnpm pack produced no tarball for ${json.name}`);
    const args = ['publish', join(out, tarball), '--access', 'public'];
    if (inCi) args.push('--provenance');
    // Prereleases (1.2.0-beta.1) must not become `latest`.
    if (json.version.includes('-')) args.push('--tag', 'next');
    mustRun('npm', args, { cwd: dir });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function ensureRelease({ dir, json }) {
  const tag = `${json.name}@${json.version}`;
  if (run('gh', ['release', 'view', tag]).status === 0) return false;
  const notes =
    changelogSection(dir, json.version) ||
    `Published to npm: https://www.npmjs.com/package/${json.name}/v/${json.version}`;
  const args = ['release', 'create', tag, '--title', tag, '--notes', notes];
  if (process.env.GITHUB_SHA) args.push('--target', process.env.GITHUB_SHA);
  if (json.version.includes('-')) args.push('--prerelease');
  // --latest=false: with several packages per version, let GitHub not flip "latest" around randomly.
  args.push('--latest=false');
  mustRun('gh', args);
  return true;
}

const published = [];
for (const pkg of listPackages()) {
  const { name, version } = pkg.json;
  if (isPublished(name, version)) {
    console.log(`= ${name}@${version} already on npm`);
  } else if (dryRun) {
    console.log(`+ ${name}@${version} would be published`);
    published.push(`${name}@${version}`);
    continue;
  } else {
    console.log(`+ publishing ${name}@${version}`);
    publish(pkg);
    published.push(`${name}@${version}`);
  }
  if (dryRun || !inCi) continue;
  // Also covers versions published by an earlier run whose release step failed.
  if (ensureRelease(pkg)) console.log(`  created release ${name}@${version}`);
}

console.log(
  published.length
    ? `\n${dryRun ? 'Would publish' : 'Published'}: ${published.join(', ')}`
    : '\nNothing new to publish.',
);
if (process.env.GITHUB_STEP_SUMMARY && published.length && !dryRun) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Published\n\n${published.map((p) => `- \`${p}\``).join('\n')}\n`,
  );
}

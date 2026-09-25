#!/usr/bin/env node
// Publishes every public package in packages/* whose current version is not on npm yet, then makes
// sure a git tag + GitHub release `<name>@<version>` exists for it.
//
// This repository has no Changesets state (versions are bumped in the private monorepo), so "what
// to publish" is simply "package.json version missing on the registry". Safe to re-run: published
// versions are skipped and missing releases are created on the next run.
//
//   node scripts/publish-new.mjs               # pack + publish (manual)
//   node scripts/publish-new.mjs --dry-run     # only report what would happen
//   node scripts/publish-new.mjs --pack <dir>  # CI build job: pack missing versions into <dir>
//   node scripts/publish-new.mjs --from <dir>  # CI publish job: publish the tarballs from <dir>
//
// Tarballs are built with `pnpm pack` (resolves `workspace:*`, applies publishConfig) and published
// with `npm publish` (npm >= 11.5.1 handles Trusted Publishing / OIDC and provenance).
//
// In CI the build job (no credentials) packs, the publish job (npm OIDC, environment
// `npm-publish`) runs no package code: it only checks each tarball's name + version against the
// checked-out package.json and publishes it. GitHub release notes carry the SRI hash of UMD
// bundles for the version-pinned jsDelivr URL.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    pack: { type: 'string' },
    from: { type: 'string' },
  },
});
const dryRun = args['dry-run'];
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

/** `pnpm pack` into `out`; returns the tarball path. */
function pack({ dir, json }, out) {
  mkdirSync(out, { recursive: true });
  const before = new Set(readdirSync(out));
  mustRun('pnpm', ['pack', '--pack-destination', out], { cwd: dir });
  const tarball = readdirSync(out).find((f) => f.endsWith('.tgz') && !before.has(f));
  if (!tarball) throw new Error(`pnpm pack produced no tarball for ${json.name}`);
  return join(out, tarball);
}

/** Reads a file from a tarball (`package/<path>`). */
function readFromTarball(tarball, path) {
  const res = spawnSync('tar', ['-xzOf', tarball, `package/${path}`], {
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`cannot read ${path} from ${tarball}`);
  return res.stdout;
}

/** SRI snippet for the UMD bundles in a tarball (release notes). */
function sriNotes(tarball, json) {
  const list = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  const umd = list.stdout.split('\n').filter((f) => /^package\/dist\/[^/]+\.umd\.js$/.test(f));
  return umd
    .map((f) => {
      const path = f.slice('package/'.length);
      const integrity =
        'sha384-' + createHash('sha384').update(readFromTarball(tarball, path)).digest('base64');
      return (
        `**CDN (\`${path}\`):**\n\n\`\`\`html\n<script src="https://cdn.jsdelivr.net/npm/${json.name}@${json.version}/${path}"` +
        `\n  integrity="${integrity}" crossorigin="anonymous"></script>\n\`\`\``
      );
    })
    .join('\n\n');
}

/** Refuses a tarball whose package.json is not exactly the checked-out package + version. */
function checkTarball(tarball, json) {
  const inner = JSON.parse(readFromTarball(tarball, 'package.json').toString('utf8'));
  if (inner.name !== json.name || inner.version !== json.version)
    throw new Error(
      `${tarball} is ${inner.name}@${inner.version}, expected ${json.name}@${json.version}`,
    );
}

function publish({ json }, tarball) {
  const args = ['publish', tarball, '--access', 'public'];
  if (inCi) args.push('--provenance');
  // Prereleases (1.2.0-beta.1) must not become `latest`.
  if (json.version.includes('-')) args.push('--tag', 'next');
  mustRun('npm', args);
}

function ensureRelease({ dir, json }, extraNotes = '') {
  const tag = `${json.name}@${json.version}`;
  if (run('gh', ['release', 'view', tag]).status === 0) return false;
  const notes = [
    changelogSection(dir, json.version) ||
      `Published to npm: https://www.npmjs.com/package/${json.name}/v/${json.version}`,
    extraNotes,
  ]
    .filter(Boolean)
    .join('\n\n');
  const args = ['release', 'create', tag, '--title', tag, '--notes', notes];
  if (process.env.GITHUB_SHA) args.push('--target', process.env.GITHUB_SHA);
  if (json.version.includes('-')) args.push('--prerelease');
  // --latest=false: with several packages per version, let GitHub not flip "latest" around randomly.
  args.push('--latest=false');
  mustRun('gh', args);
  return true;
}

const setOutput = (key, value) =>
  process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

const packages = listPackages();
const published = [];

if (args.pack) {
  // Build job: pack every version that is not on npm yet + manifest.json.
  const out = resolve(args.pack);
  const manifest = [];
  for (const pkg of packages) {
    const { name, version } = pkg.json;
    if (isPublished(name, version)) continue;
    const tarball = pack(pkg, out);
    manifest.push({ name, version, dir: relative(root, pkg.dir), file: relative(out, tarball) });
    console.log(`+ packed ${name}@${version}`);
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  setOutput('count', manifest.length);
  console.log(
    manifest.length ? `\nPacked ${manifest.length} package(s).` : '\nNothing new to publish.',
  );
  process.exit(0);
}

let tarballs = new Map(); // name → tarball
let tmp;
if (args.from) {
  const from = resolve(args.from);
  const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8'));
  for (const m of manifest) {
    const pkg = packages.find((p) => p.json.name === m.name);
    if (!pkg || pkg.json.version !== m.version || relative(root, pkg.dir) !== m.dir)
      throw new Error(
        `manifest entry ${m.name}@${m.version} does not match the checked-out packages`,
      );
    const tarball = resolve(from, m.file);
    if (!tarball.startsWith(from)) throw new Error(`manifest entry ${m.name}: bad file ${m.file}`);
    checkTarball(tarball, pkg.json);
    tarballs.set(m.name, tarball);
  }
}

try {
  for (const pkg of packages) {
    const { name, version } = pkg.json;
    let notes = '';
    if (isPublished(name, version)) {
      console.log(`= ${name}@${version} already on npm`);
    } else if (dryRun) {
      console.log(`+ ${name}@${version} would be published`);
      published.push(`${name}@${version}`);
      continue;
    } else if (args.from && !tarballs.has(name)) {
      throw new Error(`${name}@${version} is not on npm and was not packed by the build job`);
    } else {
      console.log(`+ publishing ${name}@${version}`);
      const tarball =
        tarballs.get(name) ?? pack(pkg, (tmp ??= mkdtempSync(join(tmpdir(), 'frontmail-pack-'))));
      checkTarball(tarball, pkg.json);
      notes = sriNotes(tarball, pkg.json);
      publish(pkg, tarball);
      published.push(`${name}@${version}`);
    }
    if (dryRun || !inCi) continue;
    // Also covers versions published by an earlier run whose release step failed.
    if (ensureRelease(pkg, notes)) console.log(`  created release ${name}@${version}`);
  }
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}

console.log(
  published.length
    ? `\n${dryRun ? 'Would publish' : 'Published'}: ${published.join(', ')}`
    : '\nNothing new to publish.',
);
if (process.env.GITHUB_STEP_SUMMARY && published.length && !dryRun) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Published\n\n${published.map((p) => `- \`${p}\``).join('\n')}\n`,
  );
}

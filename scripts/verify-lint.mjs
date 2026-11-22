#!/usr/bin/env node
/**
 * Run n8n's own verification ruleset against this working tree.
 *
 * The Creator Portal gates verification on `@n8n/scan-community-package@beta`, which lints
 * the GitHub SOURCE (not the published dist) with the @n8n/community-nodes rules. Those
 * rules are stricter than — and in places contradict — eslint-plugin-n8n-nodes-base used by
 * `npm run lint`, so a green `npm run lint` says nothing about verification. Run this before
 * every release: a failed pre-check should surface here, not in the portal.
 *
 * The scanner is installed into a cache dir instead of devDependencies on purpose: it needs
 * typescript 6 while this package builds on typescript 5, and a shared tree breaks the
 * scanner's ts-api-utils.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCANNER = '@n8n/scan-community-package@beta';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(repoRoot, 'node_modules', '.cache', 'n8n-verify');
const scannerRoot = join(cacheDir, 'node_modules', '@n8n', 'scan-community-package');
// The beta moved its entry from scanner/scanner.mjs to dist/scanner.js (0.43); the exports
// (analyzePackage, SOURCE_FILE_PATTERNS) are the same. Accept either layout.
const scannerEntries = [join(scannerRoot, 'dist', 'scanner.js'), join(scannerRoot, 'scanner', 'scanner.mjs')];
const findEntry = () => scannerEntries.find((p) => existsSync(p));

/**
 * The cache must track the published beta, not the version that happened to be current
 * when the cache was first written. n8n adds rules to the beta between our releases:
 * `no-silent-error-swallowing` landed in the plugin after we cached scanner 0.29.1, so a
 * frozen cache said "passed" while the portal's fresh @beta failed the same code.
 */
function publishedBetaVersion() {
  try {
    return execFileSync('npm', ['view', SCANNER, 'version'], { encoding: 'utf8' }).trim();
  } catch {
    return null; // offline: fall back to whatever is cached
  }
}

function cachedVersion() {
  const manifest = join(cacheDir, 'node_modules', '@n8n', 'scan-community-package', 'package.json');
  if (!existsSync(manifest)) return null;
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
}

const wanted = publishedBetaVersion();
const cached = cachedVersion();

if (!findEntry() || (wanted && wanted !== cached)) {
  const why = cached ? `cached ${cached}, published beta ${wanted}` : 'not cached yet';
  console.log(`Installing ${SCANNER} into ${cacheDir} (${why}) ...`);
  mkdirSync(cacheDir, { recursive: true });
  execFileSync(
    'npm',
    // --ignore-scripts: eslint-plugin-n8n-nodes-base ships a `npx only-allow pnpm` preinstall
    ['install', '--prefix', cacheDir, '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', SCANNER],
    { stdio: 'inherit' },
  );
} else if (!wanted) {
  console.warn(`⚠ npm unreachable — linting with the cached scanner ${cached}, which may be behind the portal`);
}

const scanner = await import(pathToFileURL(findEntry()).href);
const target = process.argv[2] ?? repoRoot;
// 0.44 replaced analyzePackage(dir, patterns) with analyzeLocalPackage(dir); the npm
// provenance and attested-source checks only run after publishing (skippedChecks).
const result = scanner.analyzeLocalPackage
  ? await scanner.analyzeLocalPackage(target)
  : await scanner.analyzePackage(target, scanner.SOURCE_FILE_PATTERNS);
if (result.passed && result.skippedChecks?.length) {
  console.log(`(local scan: ${result.skippedChecks.join(', ')} run after publishing)`);
}

if (result.passed) {
  console.log('✅ n8n verification ruleset passed');
  process.exit(0);
}

console.error(`❌ n8n verification ruleset failed: ${result.message}`);
if (result.details) console.error(result.details);
process.exit(1);

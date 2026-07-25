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
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCANNER = '@n8n/scan-community-package@beta';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(repoRoot, 'node_modules', '.cache', 'n8n-verify');
const scannerEntry = join(cacheDir, 'node_modules', '@n8n', 'scan-community-package', 'scanner', 'scanner.mjs');

if (!existsSync(scannerEntry)) {
  console.log(`Installing ${SCANNER} into ${cacheDir} ...`);
  mkdirSync(cacheDir, { recursive: true });
  execFileSync(
    'npm',
    // --ignore-scripts: eslint-plugin-n8n-nodes-base ships a `npx only-allow pnpm` preinstall
    ['install', '--prefix', cacheDir, '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', SCANNER],
    { stdio: 'inherit' },
  );
}

const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(scannerEntry).href);
const result = await analyzePackage(process.argv[2] ?? repoRoot, SOURCE_FILE_PATTERNS);

if (result.passed) {
  console.log('✅ n8n verification ruleset passed');
  process.exit(0);
}

console.error(`❌ n8n verification ruleset failed: ${result.message}`);
if (result.details) console.error(result.details);
process.exit(1);

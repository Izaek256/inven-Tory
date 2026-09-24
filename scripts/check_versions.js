#!/usr/bin/env node
/**
 * Enforce version consistency before building/releasing:
 *  - apps/desktop/src-tauri/tauri.conf.json
 *  - apps/desktop/src-tauri/Cargo.toml
 *  - apps/desktop/package.json
 * must all carry the same version, and when running on a tag build
 * (GITHUB_REF=refs/tags/...) the tag must be vX.Y.Z of that version.
 *
 * Exit code 1 on any mismatch; emits GitHub Actions ::error:: annotations.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];

function fail(msg) {
  errors.push(msg);
  console.log(`::error::${msg}`);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

const tauriConf = readJson('apps/desktop/src-tauri/tauri.conf.json');
const packageJson = readJson('apps/desktop/package.json');

const cargoToml = fs.readFileSync(
  path.join(root, 'apps/desktop/src-tauri/Cargo.toml'),
  'utf8'
);
const cargoMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);

const versions = {
  'apps/desktop/src-tauri/tauri.conf.json': tauriConf.version,
  'apps/desktop/src-tauri/Cargo.toml': cargoMatch ? cargoMatch[1] : null,
  'apps/desktop/package.json': packageJson.version,
};

for (const [file, version] of Object.entries(versions)) {
  if (!version) {
    fail(`Could not read version from ${file}`);
  }
}

const unique = new Set(Object.values(versions).filter(Boolean));
if (unique.size > 1) {
  fail(
    `Version mismatch: ${Object.entries(versions)
      .map(([file, version]) => `${file}=${version}`)
      .join(', ')}`
  );
}

const ref = process.env.GITHUB_REF || '';
if (ref.startsWith('refs/tags/')) {
  const tag = ref.slice('refs/tags/'.length);
  const expected = `v${tauriConf.version}`;
  if (tauriConf.version && tag !== expected) {
    fail(`Tag ${tag} does not match app version ${expected}`);
  }
}

if (errors.length > 0) {
  process.exit(1);
}

const suffix = ref ? ` (ref ${ref})` : '';
console.log(`Versions OK: ${tauriConf.version}${suffix}`);

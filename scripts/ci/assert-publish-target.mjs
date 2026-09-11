#!/usr/bin/env node
/**
 * The publish workflow may publish ONE package, and this is what says so.
 *
 * ARC-09-S10. `@farstic/snow-mcp@1.0.0` is on npm and is never touched again (D-01): it is the
 * record of a thing that shipped, people have it pinned, and a republish under that name is not a
 * mistake anyone can take back. The workflow that can publish is therefore not trusted to be
 * pointed at the right package by whoever dispatches it — it is CHECKED, before `npm ci` runs and
 * long before a token is used, and the check is a script with its own tests rather than a line of
 * YAML nobody can exercise.
 *
 * Seven properties, and the first is the one this file exists for:
 *
 *   THE NAME IS `@farstic/snowarch`. Anything else refuses, and `@farstic/snow-mcp` refuses with
 *   D-01 named, because that is the mistake with consequences that cannot be undone.
 *
 *   THE VERSION IS THE TAG. A publish takes its version from `package.json`, not from the tag the
 *   workflow checked out, so a tag pointing at a tree whose version says something else would
 *   publish a version nobody asked for — under a provenance attestation saying it came from that
 *   tag.
 *
 *   `bin`, `files`, `engines`, `license` and `repository` are the package's promises to whoever
 *   runs `npx @farstic/snowarch`. `repository` matters twice over: npm's provenance attestation is
 *   checked against the repository the workflow runs in, so a wrong or missing one fails the
 *   publish at the registry with a message about OIDC rather than about the field.
 *
 * Usage: node scripts/ci/assert-publish-target.mjs <tag>        e.g. v2.0.0
 * Exit 0 every property holds · 1 a property failed · 2 cannot run here.
 */
import { readFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The one name this repository may publish, and the one it must never publish. */
export const PUBLISHABLE = '@farstic/snowarch';
export const FORBIDDEN = '@farstic/snow-mcp';

/**
 * Every failure this can report, as strings — so the tests assert the MESSAGE a maintainer will
 * read at 2am, not merely that something exited non-zero.
 */
export function problems(pkg, tag) {
  const out = [];
  const name = pkg?.name;
  if (name === FORBIDDEN) {
    out.push(`refusing — package name is "${FORBIDDEN}" (D-01: the old record is never touched)`);
  } else if (name !== PUBLISHABLE) {
    out.push(`refusing — package name is "${name}", expected "${PUBLISHABLE}"`);
  }

  // `v2.0.0` → `2.0.0`. A tag without the `v` is accepted: the comparison is the point, not the
  // spelling, and `verify-tag.mjs` has already had its say about the tag itself.
  const want = typeof tag === 'string' ? tag.replace(/^v/, '') : '';
  if (!want) {
    out.push('refusing — no tag was given, so the version cannot be checked against one');
  } else if (pkg?.version !== want) {
    out.push(`refusing — version is "${pkg?.version}" but the tag says "${want}"`);
  }

  if (pkg?.bin?.snowarch !== 'dist/cli/index.js') {
    out.push(`refusing — bin.snowarch is "${pkg?.bin?.snowarch}", expected "dist/cli/index.js"`);
  }
  const files = Array.isArray(pkg?.files) ? pkg.files : [];
  if (!files.includes('dist/')) {
    out.push(`refusing — files does not include "dist/" (${JSON.stringify(files)})`);
  }
  const node = pkg?.engines?.node;
  if (!node || !/>=\s*(2[0-9]|[3-9][0-9])/.test(node)) {
    out.push(`refusing — engines.node is "${node}", expected at least ">=20"`);
  }
  if (pkg?.license !== 'Apache-2.0') {
    out.push(`refusing — license is "${pkg?.license}", expected "Apache-2.0"`);
  }

  // Both shapes npm accepts: the object with a `url`, and the `github:owner/repo` shorthand. What
  // is asserted is the REPOSITORY it resolves to, because that is what the provenance attestation
  // is checked against — not the spelling of the field.
  const repo = pkg?.repository;
  const repoText = typeof repo === 'string' ? repo : repo?.url ?? '';
  if (!/farstic\/ai-servicenow-architect(\.git)?$/.test(repoText.replace(/\/+$/, ''))) {
    out.push(`refusing — repository is "${repoText || '(missing)'}", expected farstic/ai-servicenow-architect`);
  }

  // Provenance is requested by the workflow flag AND by the package, and the two must agree: a
  // package that says `provenance: false` publishes unattested even from a workflow that asked.
  if (pkg?.publishConfig?.access !== 'public') {
    out.push(`refusing — publishConfig.access is "${pkg?.publishConfig?.access}", expected "public"`);
  }
  if (pkg?.publishConfig?.provenance !== true) {
    out.push('refusing — publishConfig.provenance is not true, so the tarball would be unattested');
  }
  return out;
}

/** Only when run as a script: the tests import `problems` and never touch the filesystem. */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const tag = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const manifest = join(HERE, '..', '..', 'packages', 'snowarch', 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (e) {
    writeSync(2, `publish: cannot read ${manifest} — ${e.message}\n`);
    process.exitCode = 2;
  }
  if (pkg) {
    const found = problems(pkg, tag);
    if (found.length > 0) {
      writeSync(2, found.map((p) => `publish: ${p}\n`).join(''));
      process.exitCode = 1;
    } else {
      writeSync(1, `publish: ${pkg.name}@${pkg.version} is the publishable target for tag ${tag}\n`);
    }
  }
}

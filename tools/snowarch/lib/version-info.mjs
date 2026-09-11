/**
 * Everything `./snowarch version` reports, as one object, from one place.
 *
 * ARC-09-S04. The doctor's report header used to read the version and the contract sha for itself,
 * which meant two programs answering "what is this checkout" from two readers — and the moment they
 * disagreed, `/snowarch status` would quote one of them and the tag would say the other. One
 * function now, called by the command and by the doctor.
 *
 * Every value comes from a FILE or from git, and never from a literal here: the version from the
 * root `package.json`, the floors and the docs pin from `engine.config.json`, the contract sha
 * computed over the built artefact and compared with the pin the contract loader reads. A hard-coded
 * floor in this file would be a second declaration of a number the bootstrap enforces, and the two
 * would part company.
 *
 * NO NETWORK. The old server's CLI fetched a registry record on every invocation and nagged about a
 * stranger's package; `version` is the command a person runs when something is wrong, and it must
 * work on a train.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { branchState, describe, gitlink, isShallow, tagMessage } from './git.mjs';
import { loadConfig, version as readVersion } from './config.mjs';
import { parseTagMessage } from '../../../scripts/lib/release/tag.mjs';

/** The corpus path is config's, not a literal — ARC-03 owns where the submodule lives. */
const DOCS_PATH = 'vendor/ServiceNowDocs';

/** The pin file the contract gate writes. Read through the same path the loader uses. */
function pinnedContract(root) {
  const p = join(root, 'packages/contract/required-tools.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')).contractSha256 ?? null; } catch { return null; }
}

function builtContract(root) {
  const p = join(root, 'packages/snowarch/dist/contract.json');
  if (!existsSync(p)) return null;
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

/**
 * The facts, gathered. Pure enough to test: `git` is injected for the cases a fixture cannot make.
 *
 * Mismatches are REPORTED, not thrown: this is the command someone runs when they already suspect
 * something is wrong, and a crash tells them less than a line that names both values. The doctor is
 * what turns a mismatch into a FAIL.
 */
export function versionInfo(root, { env = process.env, platform = process.platform,
  commitState = true } = {}) {
  const config = loadConfig(root);
  const opts = { env, platform };

  const contractSha = builtContract(root);
  const contractPinned = pinnedContract(root);
  const docsPinConfig = config.docs.pin;
  const link = gitlink(root, DOCS_PATH, opts);

  const found = describe(root, opts);
  const raw = found ? tagMessage(root, found.name, opts) : null;
  const parsed = raw ? parseTagMessage(raw) : null;

  return {
    // ── ARC-06-S02's five keys, unchanged in name and type ──────────────────────────────────
    version: readVersion(root),
    contractSha,
    docsPin: docsPinConfig,
    docsFamily: config.docs.family,
    floors: config.floors,

    // ── what ARC-09-S04 adds, beside them ───────────────────────────────────────────────────
    tag: found
      ? {
        name: found.name,
        distance: found.distance,
        exact: found.exact,
        message: parsed
          ? { contract: parsed.contract ?? null, docsPin: parsed.docsPin ?? null, floors: parsed.floors }
          : null,
      }
      : null,
    // A shallow clone has no tags to describe; saying "no release tag" without saying why sends a
    // reader looking for a bug in the product.
    shallow: found ? false : isShallow(root, opts),
    // `git status --porcelain` walks the WORKING TREE, and this one has 35,000 corpus files in it:
    // 300 ms on a warm index, more on a cold one. The doctor's `engine` header does not use it —
    // it takes `version`, `tag` and `contractSha` — and the doctor is what the SessionStart banner
    // runs before a session's first word. Measured: the banner's median went 614 ms → 1188 ms on a
    // macOS runner and failed its own budget, which is how this was found. The command still asks;
    // the header does not.
    commit: commitState ? branchState(root, opts) : null,
    contractPinned,
    contractMatches: Boolean(contractSha && contractPinned && contractSha === contractPinned),
    docsPinConfig,
    docsPinGitlink: link,
    docsPinMatches: Boolean(link && docsPinConfig && link === docsPinConfig),
  };
}

/** `2.1.214` → `Claude Code ≥ 2.1.214`, in the order the config declares them. */
export const floorLine = (floors) => Object.entries(floors)
  .map(([k, v]) => `${k === 'claudeCode' ? 'claude' : k} ≥ ${v}`).join(' · ');

/**
 * The six lines. Line 1 is ARC-06-S02's, byte for byte — four programs quote it and a test pins it.
 */
export function renderVersion(info) {
  const lines = [];

  const floors = Object.entries(info.floors)
    .map(([k, v]) => `${k === 'claudeCode' ? 'Claude Code' : k} ≥ ${v}`).join(', ');
  lines.push(`snowarch ${info.version} · contract ${info.contractSha ? info.contractSha.slice(0, 12) : 'not built'} · `
    + `docs pin ${info.docsPin.slice(0, 7)} (${info.docsFamily}) · floors: ${floors}`);

  // tag:
  if (!info.tag) {
    lines.push(info.shallow
      ? 'tag:        none (shallow clone — tags unreachable; git fetch --tags --unshallow)'
      : 'tag:        none (no release tag reachable — development checkout)');
  } else if (info.tag.exact) {
    lines.push(`tag:        ${info.tag.name} (exact)`);
  } else {
    const n = info.tag.distance;
    lines.push(`tag:        ${info.tag.name}+${n} (${n} commit${n === 1 ? '' : 's'} past ${info.tag.name})`);
  }

  // commit: — always present for the command, which asks for the state; `null` only for the
  // doctor's header, which does not render lines.
  const c = info.commit ?? { short: null, branch: null, detached: false, dirty: false };
  const where = c.detached ? 'detached' : (c.branch ?? 'unknown');
  lines.push(`commit:     ${c.short ?? 'unknown'} (${where}, ${c.dirty ? 'dirty' : 'clean'})`);

  // contract:
  if (!info.contractSha) {
    lines.push('contract:   missing — packages/snowarch/dist/contract.json is not built');
  } else {
    const verdict = info.contractMatches
      ? 'matches engine pin'
      : 'DOES NOT match engine pin (run npm run contract)';
    lines.push(`contract:   sha256:${info.contractSha.slice(0, 4)}…${info.contractSha.slice(-4)}  `
      + `packages/snowarch/dist/contract.json — ${verdict}`);
  }

  // docs-pin:
  const pinVerdict = info.docsPinMatches
    ? 'gitlink matches engine.config.json'
    : `gitlink ${info.docsPinGitlink ? `${info.docsPinGitlink.slice(0, 7)} ` : ''}≠ engine.config.json (run ./snowarch docs verify)`;
  lines.push(`docs-pin:   ${info.docsPin.slice(0, 7)} (${info.docsFamily}) — ${pinVerdict}`);

  // floors:
  lines.push(`floors:     ${floorLine(info.floors)}`);

  // The tag's own record, when there is one — and whether this checkout is still that release.
  if (info.tag?.message?.contract) {
    const m = info.tag.message;
    const differs = (m.contract && m.contract !== info.contractSha)
      || (m.docsPin && m.docsPin !== info.docsPinGitlink);
    lines.push(`tag says:   contract ${m.contract.slice(0, 4)}…${m.contract.slice(-4)} · `
      + `docs-pin ${(m.docsPin ?? '').slice(0, 7)}${differs ? ' (differs — checkout is not the release)' : ''}`);
  }

  return lines;
}

/**
 * ARC-10-S01 — `docs/MIGRATION.md` says what the doctor says, and says it in both shells.
 *
 * The page tells a user to run commands that another module PRINTS. That is the whole risk: a
 * detector's wording changes, the page keeps the old string, and a reader copies a command that
 * does nothing — which is worse than no page, because it looks like it worked. So the commands are
 * not compared against a list written here. They are read out of `legacyChecks()` run against the
 * ARC-08-S03 fixture, and the fixture is the one that story's own tests use
 * (`tests/doctor/helpers/legacy-home.mjs` — one tree, two readers).
 *
 * The quoted BLOCKS are checked the same way: byte-identical to `docs/snippets/`, which
 * `packages/snowarch/tests/cli/import-legacy.test.ts` holds to what the command really prints.
 * Three links in that chain, no copy anywhere in it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { legacyChecks, removalCommand, BACKUP_REMINDER,
  STALE } from '../tools/snowarch/lib/doctor/checks/legacy.mjs';
import { fixtureHome, OTHER_PROJECT } from './doctor/helpers/legacy-home.mjs';
import { contextFor, greenTree, runById } from './doctor/helpers/tree.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'docs/MIGRATION.md';
const read = (rel) => readFileSync(join(root, rel), 'utf8').replace(/\r/g, '');

/** The two placeholders the page uses where the fixture has real paths. */
export const PLACEHOLDER = {
  thisFolder: '<old-engine-checkout>',
  other: '<other-old-folder>',
};

/**
 * Every command the `legacy` section emits for the ARC-08-S03 fixture, and the ids that emitted it.
 *
 * Run through the registry rather than by calling `run()` directly, so a check that lost its
 * `section` field stops being collected here and the page's coverage assertion notices.
 */
async function legacyFindings(t) {
  const tree = greenTree(t);
  const home = fixtureHome(t, { root: tree, legacy: true });
  const checks = legacyChecks().filter((c) => c.section === 'legacy');
  assert.ok(checks.length > 0, 'no check declares section "legacy" — the registry field moved');

  const commands = new Set();
  const ids = [];
  const projects = new Set();
  for (const check of checks) {
    ids.push(check.id);
    const r = await runById(checks, check.id, contextFor(tree, { home }));
    if (r.command) commands.add(r.command);
    for (const e of r.data?.entries ?? []) {
      commands.add(e.command);
      projects.add(e.project === tree ? PLACEHOLDER.thisFolder : PLACEHOLDER.other);
    }
    // The `.bak-*` reminder is a command too — the one that survives every removal.
    if (typeof r.remedy === 'string' && r.remedy.includes(BACKUP_REMINDER)) {
      commands.add('ls -la ~/.claude.json.bak-*');
    }
  }
  return { commands: [...commands], ids, projects: [...projects], tree };
}

/**
 * The rule, as a function over the page text, so the negative below runs THIS code and not a copy.
 * Returns one message per missing command — empty is the passing state.
 */
export function missingCommands(page, commands) {
  return commands.filter((c) => !page.includes(c))
    .map((c) => `migration-doc: doctor command "${c}" not found in ${PAGE}`);
}

// ─── AC 2, AC 3 ──────────────────────────────────────────────────────────────────────────────

test('AC 2 — every command the legacy checks print appears in the page', async (t) => {
  const { commands, ids, projects } = await legacyFindings(t);
  const page = read(PAGE);

  // Not vacuous: the fixture must have produced the commands this page exists to carry.
  assert.ok(commands.length >= 4, `only ${commands.length} command(s) from the fixture`);
  assert.deepEqual(missingCommands(page, commands), []);

  // AC 2's second half: every `section: 'legacy'` check id is named, so a reader who sees a WARN
  // can find the step that answers it.
  for (const id of ids) assert.ok(page.includes(id), `${PAGE} never names check ${id}`);

  // AC 3: the folder each command must be run FROM, as a placeholder rather than a fixture path.
  for (const p of projects) assert.ok(page.includes(p), `${PAGE} never names ${p}`);
});

test('...and a page missing one of them fails with the command in the message', async (t) => {
  const { commands } = await legacyFindings(t);
  // The command is BUILT from the detector's own data, never spelled: a test file that writes one
  // of those dead names out becomes a finding in the lint that forbids them (L03), which is the
  // correct behaviour of that lint — and this file is not a detector, it is a reader.
  const dropped = removalCommand(STALE.names[1]);
  assert.ok(commands.includes(dropped), 'the fixture stopped producing the second removal command');

  const mutilated = read(PAGE).split('\n').filter((l) => !l.includes(dropped)).join('\n');
  assert.deepEqual(missingCommands(mutilated, commands),
    [`migration-doc: doctor command "${dropped}" not found in ${PAGE}`]);
});

// ─── AC 4 — the quoted screens are the snippets, byte for byte ────────────────────────────────

/** Fenced blocks, with their info string, in document order. */
export function fences(text) {
  const out = [];
  let open = null;
  text.split('\n').forEach((line, i) => {
    const m = /^```(\S*)\s*$/.exec(line);
    if (!m) { if (open) open.body.push(line); return; }
    if (open) { out.push({ lang: open.lang, body: open.body.join('\n'), line: open.line }); open = null; }
    else open = { lang: m[1], body: [], line: i + 1 };
  });
  return out;
}

/**
 * What a snippet file's block IS.
 *
 * The same split `scripts/gen-modes.mjs` makes for the same two files: a `.txt` snapshot is the
 * block, with no fence of its own, and a `.md` fragment carries one around it.
 */
const snippetBlock = (rel) => {
  const text = read(rel);
  if (rel.endsWith('.txt')) return text.replace(/\n+$/, '');
  const m = /```\n([\s\S]*?)```/.exec(text);
  assert.ok(m, `${rel}: no fenced block`);
  return m[1].replace(/\n+$/, '');
};

test('AC 4 — step 3 shows the import plan and the review screen exactly as they are printed', () => {
  const bodies = fences(read(PAGE)).map((f) => f.body);
  for (const rel of ['docs/snippets/import-from-legacy.md', 'docs/snippets/review-screen-nonprod.txt']) {
    const want = snippetBlock(rel);
    assert.ok(bodies.includes(want),
      `${PAGE} has drifted from ${rel} — paste the block again rather than editing it here`);
  }
  // The closing advice names the directory AND the file beside it, because deleting one and
  // leaving the other leaves the credentials in place.
  const page = read(PAGE);
  assert.ok(page.includes('rm -r ~/.config/servicenow-mcp'), 'the deletion command is not on the page');
  assert.ok(page.includes('tokens.json'), 'the page names instances.json but not tokens.json');
  // Principle 10: the review screen proposes.
  assert.match(page, /Enter accepts the proposal as shown; any line is yours to edit first/);
});

// ─── AC 1 — the shape of the page, and both shells everywhere ─────────────────────────────────

test('AC 1 — the nine steps and the four closing sections are all there', () => {
  const page = read(PAGE);
  const headings = [...page.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map((m) => m[1]);
  for (let n = 1; n <= 9; n += 1) {
    assert.ok(headings.some((h) => h.startsWith(`${n}. `)), `no step ${n}`);
  }
  for (const s of ['Who this is for', 'What changes', 'Before you start', 'Verify',
    'Optional cleanup', 'Environment notes', 'Rollback']) {
    assert.ok(headings.includes(s), `no "${s}" section`);
  }
});

test('AC 1 — every macOS/Linux command block is followed by its Windows PowerShell form', () => {
  const blocks = fences(read(PAGE));
  const unpaired = [];
  blocks.forEach((f, i) => {
    if (f.lang !== 'sh') return;
    if (blocks[i + 1]?.lang !== 'powershell') unpaired.push(`${PAGE}:${f.line}`);
  });
  assert.deepEqual(unpaired, [], `${unpaired.length} sh block(s) with no PowerShell form`);
  // And the pairing is real rather than an artefact of there being no `sh` blocks at all.
  assert.ok(blocks.filter((f) => f.lang === 'sh').length >= 10,
    'too few shell blocks for a page of nine steps');
});

// ─── AC 6 — the retired vocabulary lives in the table and nowhere else ────────────────────────

test('AC 6 — the old words appear only as rows of the "What changes" table', () => {
  const RETIRED = [/claude mcp add/, /-e SERVICENOW_/, /Tier [012]/, /\/status/,
    /\/setup-instance/, /\.env\b/];
  const hits = [];
  read(PAGE).split('\n').forEach((line, i) => {
    for (const re of RETIRED) {
      if (!re.test(line)) continue;
      // A table row, and a table row only. Not a fenced command, not a step's prose.
      if (line.startsWith('|')) continue;
      hits.push(`${PAGE}:${i + 1}: ${re} in ${line.trim().slice(0, 70)}`);
    }
  });
  assert.deepEqual(hits, [], `${hits.length} retired token(s) outside the table`);
  // Both directions: the table really does carry them, or the check above passes on a page that
  // never mentions what the reader is migrating from.
  const table = read(PAGE).split('\n').filter((l) => l.startsWith('|'));
  for (const re of RETIRED) {
    assert.ok(table.some((l) => re.test(l)), `the table never shows ${re}`);
  }
});

test('AC 6 — the retired hook tooling is named only where it is being removed', () => {
  // `docs/MIGRATION.md` is exempt from the retired-SURFACE sweep because removing that tooling is
  // one of its steps. This keeps the exemption honest: the name may appear under "Optional
  // cleanup" and nowhere else on the page.
  const page = read(PAGE);
  const start = page.indexOf('## Optional cleanup');
  const end = page.indexOf('\n## ', start + 1);
  assert.ok(start > 0 && end > start, 'no "Optional cleanup" section to confine the name to');
  const outside = [page.slice(0, start), page.slice(end)].join('\n');
  assert.equal(/context-mode/.test(outside), false,
    'the retired hook tooling is named outside "Optional cleanup"');
  assert.equal(/context-mode/.test(page.slice(start, end)), true,
    'the cleanup section does not name what it removes');
});

// ─── AC 7 — the troubleshooting anchors resolve ───────────────────────────────────────────────

test('AC 7 — the proxy and TLS section names the variables and links live anchors', () => {
  const page = read(PAGE);
  for (const v of ['HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS']) {
    assert.ok(page.includes(v), `"Environment notes" never names ${v}`);
  }
  // Resolved against the headings themselves: `### <CODE>` renders as `#code`, which is the form
  // every other page in the tree links with.
  const headings = new Set([...read('docs/TROUBLESHOOTING.md').matchAll(/^###\s+(\S+)\s*$/gm)]
    .map((m) => m[1].toLowerCase()));
  for (const code of ['dns_failure', 'tls_ca_untrusted', 'proxy_unreachable']) {
    assert.ok(page.includes(`TROUBLESHOOTING.md#${code}`), `no link to #${code}`);
    assert.ok(headings.has(code), `docs/TROUBLESHOOTING.md has no ### heading for ${code}`);
  }
});

// ─── AC 8 — the legacy store's real location on Windows ───────────────────────────────────────

test('AC 8 — the Windows legacy-store path is under the home directory, never %APPDATA%', () => {
  const page = read(PAGE);
  assert.ok(page.includes(String.raw`%USERPROFILE%\.config\servicenow-mcp\instances.json`),
    'the page does not show the legacy store\'s real Windows path');
  // `%APPDATA%` is on the page deliberately: a Windows reader who knows where application data
  // normally lives has to be told this is the exception. So the assertion is not "never mentioned"
  // — it is that no PATH under it is offered, and that every mention denies it.
  assert.equal(/%APPDATA%[\\/][^\s`]*servicenow-mcp/.test(page), false,
    'the page offers a legacy-store path under %APPDATA%');
  const mentions = page.split('\n').filter((l) => l.includes('%APPDATA%'));
  assert.ok(mentions.length > 0, 'the page never corrects the %APPDATA% expectation');
  for (const l of mentions) {
    assert.match(l, /\bnot\b/, `%APPDATA% named without a denial: ${l.trim().slice(0, 70)}`);
  }
});

// ─── Redaction: a page about somebody's old install carries nothing from an instance ──────────

test('no instance hostname, address or sys_id reaches the page', () => {
  // Two hostnames are allowed BY NAME, and both come from the synthetic fixture the import snippet
  // is a snapshot of (`packages/snowarch/tests/fixtures/legacy-instances.json`). Any third one
  // fails, which is the property worth having.
  const ALLOWED = [/^dev\d+\.service-now\.com$/, /^acme\.service-now\.com$/];
  const page = read(PAGE);
  const hosts = [...page.matchAll(/\b([\w.-]+\.service-now\.com)\b/g)].map((m) => m[1]);
  const unexpected = [...new Set(hosts)].filter((h) => !ALLOWED.some((re) => re.test(h)));
  assert.deepEqual(unexpected, [], `${unexpected.length} unexpected instance hostname(s)`);
  assert.ok(hosts.length > 0, 'the placeholder scan found no hostname at all — it is not running');

  const mail = page.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  assert.equal(mail, null, `an address reached the page: ${mail?.[0]}`);
  const sysId = page.match(/\b[0-9a-f]{32}\b/);
  assert.equal(sysId, null, `a sys_id-shaped string reached the page: ${sysId?.[0]}`);
});

test('the install page points at it, and the README inherits the pointer', () => {
  assert.ok(existsSync(join(root, PAGE)));
  // The link is written PAGE-RELATIVE, like the four TROUBLESHOOTING links already on that page:
  // `docs/INSTALL.md` is the source and `README.md` is a composed copy of its body, so one link
  // text has to serve both locations and the one that resolves from `docs/` is the one the
  // link-check can verify. (That the composed copy's relative links do not resolve from the repo
  // root is a property of every link on that page and predates this one.)
  const LINK = '[MIGRATION.md](MIGRATION.md)';
  // The sentence's SHAPE, not the two names in it. Spelling them here would make this file a hit
  // in the ratchet that forbids them, and importing them from that file would re-run its six tests
  // inside this one — which it did, and the suite count is how it was noticed. The names
  // themselves are already guaranteed: `README.md` and `docs/INSTALL.md` are on the ratchet's
  // allow-list with owner ARC-10, and its backward direction fails if a listed file stops matching.
  const SENTENCE = /^Coming from `[a-z-]+` \/ `[a-z-]+`\? Follow \[MIGRATION\.md\]\(MIGRATION\.md\)\.$/m;
  for (const rel of ['README.md', 'docs/INSTALL.md']) {
    assert.ok(read(rel).includes(LINK), `${rel} does not link the migration page`);
    assert.match(read(rel), SENTENCE, `${rel} does not say who the migration page is for`);
  }
});

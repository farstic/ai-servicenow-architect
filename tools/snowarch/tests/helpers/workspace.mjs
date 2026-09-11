import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tempDir } from './temp.mjs';

/**
 * The smallest tree `bootstrap` will act on: a config, an areas file, a lockfile, a package.json.
 *
 * A temp root rather than the repository, and every test passes it explicitly, because the CLI
 * resolves its root from the module's own location — a test that forgot would install into the
 * checkout it is running from and leave `.local/` behind.
 */
export function makeCheckout({ pin = 'a'.repeat(40), family = 'australia' } = {}, t) {
  // TRACKED. This factory removed nothing at all, and fifteen files call it: the pile it left in
  // `TMPDIR` was five figures. Pass `t` and the tree goes when the test ends, pass or fail; without
  // one it goes when the process does.
  const root = tempDir('snowarch-bootstrap-', t);
  mkdirSync(join(root, 'vendor'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({
    docs: { pin, family, areasFile: 'vendor/docs-areas.txt', upstream: 'file:///dev/null' },
    mcp: { serverKey: 'servicenow', packageDir: 'packages/snowarch' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'vendor/docs-areas.txt'), 'markdown/alpha\nmarkdown/beta\n');
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'f', version: '2.0.0-test' }, null, 2)}\n`);
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  // The registration files as ARC-06-S01 commits them, because B01 re-evaluates S01's rules at run
  // time: a fixture with a placeholder `.mcp.json` would fail that check for a reason unrelated to
  // whatever the test is about.
  writeFileSync(join(root, '.mcp.json'), `${JSON.stringify({
    mcpServers: {
      servicenow: {
        type: 'stdio',
        command: 'node',
        args: ['${CLAUDE_PROJECT_DIR:-.}/packages/snowarch/dist/server.js'],
        env: { SNOW_STORE: '${SNOW_STORE:-}', SNOW_LOG_LEVEL: '${SNOW_LOG_LEVEL:-info}' },
        timeout: 600000,
      },
    },
  }, null, 2)}\n`);
  writeFileSync(join(root, '.claude/settings.json'), `${JSON.stringify({
    env: { MCP_TIMEOUT: '120000' }, permissions: { allow: [] },
  }, null, 2)}\n`);
  // The two files B01 and B07 must find gitignored, and a commit — `git diff HEAD` has nothing to
  // compare against without one.
  writeFileSync(join(root, '.gitignore'), '.local/\n.claude/settings.local.json\n');
  // A contract and a pin that agree, because ARC-06-S07's B05 checks exactly that on every run
  // where Node is present — which is every command test. The sha is COMPUTED from the bytes
  // written, never typed: a fixture whose pin was a literal would need editing every time the
  // fixture contract changed, and would fail for a reason unrelated to the test.
  mkdirSync(join(root, 'packages/snowarch/dist'), { recursive: true });
  mkdirSync(join(root, 'packages/contract'), { recursive: true });
  const contract = `${JSON.stringify({
    contractVersion: 1,
    server: { suggestedName: 'servicenow' },
    flags: [{ name: 'WRITE_ENABLED', requires: [] }],
    presets: { 'read-only': { WRITE_ENABLED: 'false' }, full: { WRITE_ENABLED: 'true' } },
    tools: [{ name: 'snow_core_record_read', gate: 'none', mutates: false }],
  }, null, 2)}\n`;
  writeFileSync(join(root, 'packages/snowarch/dist/contract.json'), contract);
  // The server package's manifest, because ARC-06-S07's B04 reads its `dependencies` to decide
  // what must resolve. Two names, so the check has something to check.
  writeFileSync(join(root, 'packages/snowarch/package.json'), `${JSON.stringify({
    name: '@fixture/snowarch', version: '0.0.0', type: 'module',
    dependencies: { undici: '*', zod: '*' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'packages/contract/required-tools.json'), `${JSON.stringify({
    $schema: './required-tools.schema.json',
    contractVersion: 1,
    contractSha256: createHash('sha256').update(contract).digest('hex'),
    serverKey: 'servicenow',
    tools: [{ name: 'snow_core_record_read', gate: 'none', mutates: false, used_by: ['fixture'] }],
  }, null, 2)}\n`);
  // A real repository, because ARC-06-S04's preflight asks git where the top of the tree is. A
  // fixture that was not one would fail the root check for a reason that has nothing to do with
  // what the test is about.
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  // `example.com` is RFC 2606's reserved name; `.invalid` is the rule of record's counter-example
  // and has no grandfather clause (ARC-09-C2).
  execFileSync('git', ['-c', 'user.email=f@example.com', '-c', 'user.name=f',
    'commit', '-qm', 'fixture'], { cwd: root, stdio: 'ignore' });
  return root;
}

/**
 * The arguments a command test passes: the fixture as the working directory, and a network probe
 * that never opens a socket.
 *
 * `cwd` is explicit because the preflight compares it against the root, and the process's own
 * working directory is this repository rather than the fixture. `skip-claude-check` because CI
 * runners have no Claude Code and this is not the test that cares.
 */
export const commandArgs = (root, flags = {}) => ({
  root,
  cwd: root,
  probe: async () => ({ ok: true, status: 200, proxy: null }),
  // `--docs skip` because these fixtures have no upstream to clone from: ARC-06-S06's B02 really
  // syncs now, and a command test about the plan, the state or the preflight should not be a
  // corpus test as a side effect. `b02-docs.test.mjs` drives B02 against the fixture upstream.
  flags: { 'skip-claude-check': true, docs: 'skip', ...flags },
});

/** A step whose behaviour the test dictates. The registry's shape, none of its work. */
export function stub(id, { title = id.toLowerCase(), result = { status: 'ok' }, inputs = () => [],
  runsWhen = () => true, skipReason = 'not applicable', cacheable = true, onRun = null } = {}) {
  return {
    id, title, needsNode: false, runsWhen, skipReason, cacheable, inputs,
    run: async (ctx) => (onRun ? onRun(ctx) : result),
  };
}

/** A logger that keeps what it was told, so assertions are on lines rather than on intent. */
export function recorder() {
  const lines = [];
  const push = (m) => lines.push(m);
  return { lines, step: push, ok: push, warn: push, fail: push, note: push, debug: push,
    json: (v) => lines.push(JSON.stringify(v)), commit: () => {}, discard: () => {},
    get logFile() { return null; } };
}

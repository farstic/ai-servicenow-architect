import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The smallest tree `bootstrap` will act on: a config, an areas file, a lockfile, a package.json.
 *
 * A temp root rather than the repository, and every test passes it explicitly, because the CLI
 * resolves its root from the module's own location — a test that forgot would install into the
 * checkout it is running from and leave `.local/` behind.
 */
export function makeCheckout({ pin = 'a'.repeat(40), family = 'australia' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'snowarch-bootstrap-'));
  mkdirSync(join(root, 'vendor'), { recursive: true });
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, 'engine.config.json'), `${JSON.stringify({
    docs: { pin, family, areasFile: 'vendor/docs-areas.txt', upstream: 'file:///dev/null' },
    mcp: { serverKey: 'servicenow' },
    floors: { node: '20.0.0', claudeCode: '2.1.214', git: '2.34.1' },
  }, null, 2)}\n`);
  writeFileSync(join(root, 'vendor/docs-areas.txt'), 'markdown/alpha\nmarkdown/beta\n');
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'f', version: '2.0.0-test' }, null, 2)}\n`);
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(join(root, '.mcp.json'), '{"mcpServers":{}}\n');
  writeFileSync(join(root, '.claude/settings.json'), '{}\n');
  // A real repository, because ARC-06-S04's preflight asks git where the top of the tree is. A
  // fixture that was not one would fail the root check for a reason that has nothing to do with
  // what the test is about.
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
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
  flags: { 'skip-claude-check': true, ...flags },
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

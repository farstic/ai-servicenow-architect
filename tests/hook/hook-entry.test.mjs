// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C239 — the two hook entries B07 writes, run the way Claude Code runs them.
//
// PostToolUse is an exec-form loader (`node -e …`, no shell): it reads the project path inside Node, runs
// post-write.mjs when it is there, and is a silent no-op when it is not, as after a move to an older release. Every case
// spawns exactly the command and args read back from the settings file the writer wrote, with `shell: false`.
// SessionStart stays a shell command, its project path now quoted, and it is run from a checkout path with a space
// in every shell that runs hooks on this platform.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { applyToggles, hookEntry, isOurPostWriteHook, SETTINGS_LOCAL } from '../../tools/snowarch/lib/settings-local.mjs';
import { syncCorpus } from '../../tools/snowarch/lib/docs/sync.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { UNCITED, buildUpstream, makeWorkspace } from '../helpers/docs-fixture.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = 'tools/snowarch/hooks/post-write.mjs';

const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

let scratch, upstream, upstreamUrl;
before(() => {
  scratch = tempDir('snowarch-c239-entry-');
  upstream = buildUpstream(scratch);
  upstreamUrl = pathToFileURL(upstream.bare).href;
});
after(() => { rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** A project with a sparse corpus and a copy of the engine's hooks and library, so the real script runs in it. */
function project() {
  const w = makeWorkspace({ scratch, pin: upstream.pin, upstreamUrl });
  syncCorpus({ ...w, mode: 'sparse', log: () => {} });
  for (const dir of ['tools/snowarch/lib', 'tools/snowarch/hooks']) {
    cpSync(join(REPO, ...dir.split('/')), join(w.root, ...dir.split('/')), { recursive: true });
  }
  return w.root;
}

/** Our PostToolUse entry as the writer wrote it into `root`'s settings file, read back from disk. */
function writtenEntry(root) {
  mkdirSync(join(root, '.claude'), { recursive: true });       // a checkout has it: .claude/settings.json is tracked
  const r = applyToggles({ root, mode: 'design-only', nodePresent: true, registration: 'project',
    serverKey: 'servicenow', check: () => true });
  assert.equal(r.ok, true, r.reason);
  const local = JSON.parse(readFileSync(join(root, SETTINGS_LOCAL), 'utf8'));
  const ours = (local.hooks?.PostToolUse ?? []).flatMap((g) => g.hooks ?? []).filter(isOurPostWriteHook);
  assert.equal(ours.length, 1, 'the settings file does not hold our citation hook exactly once');
  return ours[0];
}

/** The entry run as Claude Code runs an exec-form hook: the executable spawned with its args, no shell. */
const runEntry = (entry, projectDir, input) => spawnSync(entry.command, entry.args, {
  shell: false, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
});

const writing = (root, path) => ({ hook_event_name: 'PostToolUse', tool_name: 'Write',
  tool_input: { file_path: join(root, path) } });

test('ARC-09-C239 — PostToolUse is written in exec form: node and a loader, with no shell and no path in the command', () => {
  const [entry] = hookEntry().PostToolUse[0].hooks;
  assert.equal(entry.command, 'node');
  assert.equal(entry.args.length, 2);
  assert.equal(entry.args[0], '-e');
  assert.ok(entry.args[1].includes(`'${SCRIPT}'`), 'the loader does not name the script');
  assert.ok(entry.args[1].includes('process.env.CLAUDE_PROJECT_DIR'), 'the loader does not read the project path');
});

test('ARC-09-C239 — with the script gone, as after a move to an older release, the entry is a silent no-op', (t) => {
  const entry = writtenEntry(project());
  const empty = tempDir('snowarch-c239-gone-', t);
  const r = runEntry(entry, empty, writing(empty, 'clients/acme/envelopes/e.md'));
  assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', '']);
});

test('ARC-09-C239 — a script that throws at import, or does not parse, still exits 0 with nothing printed', (t) => {
  const entry = writtenEntry(project());
  for (const body of ["throw new Error('half-written');\n", 'export const = ;\n']) {
    const broken = tempDir('snowarch-c239-broken-', t);
    put(broken, SCRIPT, body);
    const r = runEntry(entry, broken, writing(broken, 'clients/acme/envelopes/e.md'));
    assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], body);
  }
});

test('ARC-09-C239 — a dead path: exit 2, and stderr byte for byte what the script prints run directly', () => {
  const root = project();
  const entry = writtenEntry(root);
  put(root, 'clients/acme/envelopes/dead.md', 'A claim (citation: markdown/alpha/typo.md).\n');
  const input = writing(root, 'clients/acme/envelopes/dead.md');
  const r = runEntry(entry, root, input);
  const direct = spawnSync(process.execPath, [join(root, ...SCRIPT.split('/'))],
    { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(direct.status, 2, direct.stderr);
  assert.deepEqual([r.status, r.stderr, r.stdout], [2, direct.stderr, '']);
  assert.match(r.stderr, /markdown\/alpha\/typo\.md \(line 1\)/);
});

test('ARC-09-C239 — only a real page outside the cone: exit 0 and one line of JSON carrying the notice', () => {
  const root = project();
  const entry = writtenEntry(root);
  put(root, 'clients/acme/envelopes/out.md', `A claim (citation: ${UNCITED}/index.md).\n`);
  const r = runEntry(entry, root, writing(root, 'clients/acme/envelopes/out.md'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.split('\n').length, 2, `not one line: ${r.stdout}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext,
    new RegExp(`${UNCITED}/index\\.md \\(line 1\\) — a real page, not installed on this sparse corpus`));
});

/** Git Bash, where Git for Windows puts it; `null` elsewhere or when it is not installed. */
const gitBash = () => [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
  .map((dir) => join(dir, 'Git', 'bin', 'bash.exe')).find((p) => existsSync(p)) ?? null;

test('ARC-09-C239 — SessionStart runs from a checkout path with a space, in each shell that runs hooks here', (t) => {
  const dir = join(tempDir('snowarch-c239-shell-', t), 'a checkout with spaces');
  put(dir, 'tools/snowarch/hooks/session-start.mjs', "process.stdout.write('C239-SESSION-START-RAN');\n");
  const { command } = hookEntry().SessionStart[0].hooks[0];
  assert.match(command, /^node "\$\{CLAUDE_PROJECT_DIR\}\/tools\/snowarch\/hooks\/session-start\.mjs"$/);
  // Two substitution models: Claude Code replacing the placeholder as text, and the shell expanding the variable.
  // PowerShell reads `${env:…}` for an environment variable, the spelling Claude Code rewrites the placeholder to.
  const shells = process.platform === 'win32'
    ? [gitBash() && { name: 'Git Bash', file: gitBash(), argv: (c) => ['-c', c], variable: command },
      { name: 'PowerShell', file: 'powershell.exe', argv: (c) => ['-NoProfile', '-NonInteractive', '-Command', c],
        variable: command.replaceAll('${CLAUDE_PROJECT_DIR}', '${env:CLAUDE_PROJECT_DIR}') }]
    : [{ name: 'bash', file: 'bash', argv: (c) => ['-c', c], variable: command },
      process.platform === 'darwin' && { name: 'zsh', file: 'zsh', argv: (c) => ['-c', c], variable: command }];
  const ran = [];
  for (const sh of shells.filter(Boolean)) {
    const text = spawnSync(sh.file, sh.argv(command.replaceAll('${CLAUDE_PROJECT_DIR}', dir)), { encoding: 'utf8' });
    const variable = spawnSync(sh.file, sh.argv(sh.variable),
      { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    for (const [model, r] of [['as text', text], ['as a variable', variable]]) {
      assert.equal(r.stdout, 'C239-SESSION-START-RAN', `${sh.name}, the path ${model}: ${r.stderr || r.error}`);
      ran.push(`${sh.name} ${model}`);
    }
  }
  // A floor, so a shell that silently drops out cannot pass: macOS runs bash and zsh, Linux bash, Windows PowerShell,
  // and on CI Git Bash as well.
  const floor = { darwin: 4, linux: 2, win32: process.env.CI ? 4 : 2 }[process.platform] ?? 2;
  assert.ok(ran.length >= floor, `only ${ran.length} of ${floor} runs: ${ran.join(', ')}`);
});

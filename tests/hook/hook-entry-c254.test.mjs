// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C254 — the two hook entries B07 writes beside C231's: PostToolUseFailure for Read (a Read of a corpus page that
// is not there is told which page was meant) and Stop (a reply that cites a dead path is sent back once). Both are exec
// form, a loader that is a no-op when the script is gone, as the citation hook's is (ARC-09-C239); both are ours to
// replace and a user's own hooks on the same events are theirs to keep. Every run case spawns exactly the command and
// args read back from the settings file the writer wrote, with `shell: false`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as SL from '../../tools/snowarch/lib/settings-local.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const READ_SCRIPT = 'tools/snowarch/hooks/read-failure.mjs';
const STOP_SCRIPT = 'tools/snowarch/hooks/stop-citations.mjs';

const put = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

/** A project with a copy of the engine's hooks and library, so the real scripts run in it, and a corpus of two pages. */
function project(t) {
  const root = tempDir('snowarch-c254-entry-', t);
  for (const dir of ['tools/snowarch/lib', 'tools/snowarch/hooks']) {
    cpSync(join(REPO, ...dir.split('/')), join(root, ...dir.split('/')), { recursive: true });
  }
  for (const page of ['markdown/alpha/page-one.md', 'markdown/alpha/deep/folder/page-two.md']) put(root, `vendor/ServiceNowDocs/${page}`, '# page\n');
  return root;
}

/** `.claude/settings.local.json` as the writer wrote it into `root`. */
function written(root) {
  mkdirSync(join(root, '.claude'), { recursive: true });
  const r = SL.applyToggles({ root, mode: 'design-only', nodePresent: true, registration: 'project', serverKey: 'servicenow',
    check: () => true });
  assert.equal(r.ok, true, r.reason);
  return JSON.parse(readFileSync(join(root, SL.SETTINGS_LOCAL), 'utf8'));
}

/** Our one hook of `event` in the settings file, found the way the writer finds it. */
function oursIn(local, event, isOurs) {
  const found = (local.hooks?.[event] ?? []).flatMap((g) => g.hooks ?? []).filter((h) => isOurs(h));
  assert.equal(found.length, 1, `the settings file does not hold our ${event} hook exactly once`);
  return found[0];
}

/** The entry run as Claude Code runs an exec-form hook: the executable spawned with its args, no shell. */
const runEntry = (entry, projectDir, input) => spawnSync(entry.command, entry.args, {
  shell: false, input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
});

const failedRead = (root, rel) => ({ hook_event_name: 'PostToolUseFailure', tool_name: 'Read',
  tool_input: { file_path: join(root, 'vendor', 'ServiceNowDocs', ...rel.split('/')) }, error: 'File does not exist.', is_interrupt: false });
const stopping = (message, extra = {}) => ({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: message, ...extra });

test('ARC-09-C254 — PostToolUseFailure is written for Read only, in exec form, with a loader of its own', () => {
  assert.deepEqual(SL.hookEntry().PostToolUseFailure, [{ matcher: 'Read', hooks: [{ type: 'command', command: 'node',
    args: ['-e', SL.READ_FAILURE_LOADER], timeout: 10 }] }]);
  assert.ok(SL.READ_FAILURE_LOADER.includes(`'${READ_SCRIPT}'`), 'the loader does not name the script');
  assert.ok(SL.READ_FAILURE_LOADER.includes('process.env.CLAUDE_PROJECT_DIR'), 'the loader does not read the project path');
});

test('ARC-09-C254 — Stop is written for every turn, in exec form, with a loader of its own', () => {
  assert.deepEqual(SL.hookEntry().Stop, [{ hooks: [{ type: 'command', command: 'node', args: ['-e', SL.STOP_CITATIONS_LOADER], timeout: 10 }] }]);
  assert.ok(SL.STOP_CITATIONS_LOADER.includes(`'${STOP_SCRIPT}'`), 'the loader does not name the script');
  assert.ok(SL.STOP_CITATIONS_LOADER.includes('process.env.CLAUDE_PROJECT_DIR'), 'the loader does not read the project path');
});

test('ARC-09-C254 — the loaders differ only in the script they name, and the citation hook\'s is the one C239 shipped', () => {
  const C239 = "try{const f=require('path').join(process.env.CLAUDE_PROJECT_DIR||'','tools/snowarch/hooks/post-write.mjs');"
    + "process.argv[1]=f;import(require('url').pathToFileURL(f).href).catch(()=>{process.exitCode=0})}catch{}";
  assert.equal(SL.POST_WRITE_LOADER, C239);
  assert.equal(SL.READ_FAILURE_LOADER, C239.replace('post-write.mjs', 'read-failure.mjs'));
  assert.equal(SL.STOP_CITATIONS_LOADER, C239.replace('post-write.mjs', 'stop-citations.mjs'));
});

test('ARC-09-C254 — which hook is ours: the loader or a shell path of our tree, and no other of the three, and no user\'s', () => {
  const loader = (l) => ({ command: 'node', args: ['-e', l] });
  const shell = (script) => ({ command: `node "\${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/${script}"` });
  assert.equal(SL.isOurReadFailureHook(loader(SL.READ_FAILURE_LOADER)), true);
  assert.equal(SL.isOurReadFailureHook(shell('read-failure.mjs')), true);
  assert.equal(SL.isOurStopHook(loader(SL.STOP_CITATIONS_LOADER)), true);
  assert.equal(SL.isOurStopHook(shell('stop-citations.mjs')), true);
  // another install's folder, either separator, is ours to replace
  assert.equal(SL.isOurStopHook({ command: 'node C:\\old\\checkout\\tools\\snowarch\\hooks\\stop-citations.mjs' }), true);
  for (const [name, check] of [['read-failure', SL.isOurReadFailureHook], ['stop-citations', SL.isOurStopHook]]) {
    assert.equal(check(loader(SL.POST_WRITE_LOADER)), false, `post-write is not ${name}`);
    assert.equal(check({ command: 'node "${CLAUDE_PROJECT_DIR}/tools/snowarch/hooks/session-start.mjs"' }), false, `session-start is not ${name}`);
    assert.equal(check({ command: `node ~/my-hooks/${name}.mjs` }), false, `a user's ${name}.mjs is theirs`);
    assert.equal(check({ command: `echo ${name}` }), false);
    assert.equal(check(undefined), false);
  }
  assert.equal(SL.isOurReadFailureHook(loader(SL.STOP_CITATIONS_LOADER)), false);
  assert.equal(SL.isOurStopHook(loader(SL.READ_FAILURE_LOADER)), false);
});

test('ARC-09-C254 — the writer puts both in the settings file once, and writing again changes nothing', (t) => {
  const root = tempDir('snowarch-c254-write-', t);
  const first = written(root);
  assert.ok(first.hooks.PostToolUseFailure && first.hooks.Stop, 'the settings file lacks one of the two');
  assert.deepEqual(first.hooks.PostToolUseFailure, SL.hookEntry().PostToolUseFailure);
  assert.deepEqual(first.hooks.Stop, SL.hookEntry().Stop);
  const second = written(root);
  assert.deepEqual(second, first, 'a second write changed the file');
});

test('ARC-09-C254 — with Node absent neither is written, as the citation hook is not', () => {
  const args = { mode: 'design-only', registration: 'project', serverKey: 'servicenow' };
  const with_ = SL.computeSettings({}, { ...args, nodePresent: true });
  assert.ok(with_.hooks?.PostToolUseFailure && with_.hooks?.Stop, 'with Node present they are written');
  const next = SL.computeSettings(with_, { ...args, nodePresent: false });
  assert.equal(next.hooks?.PostToolUseFailure, undefined);
  assert.equal(next.hooks?.Stop, undefined);
});

test('ARC-09-C254 — a user\'s own hooks on the same events stay, and an older copy of ours is replaced', () => {
  const mine = { hooks: [{ type: 'command', command: 'echo mine' }] };
  const current = { hooks: {
    Stop: [mine, { hooks: [{ type: 'command', command: 'node /old/checkout/tools/snowarch/hooks/stop-citations.mjs' }] }],
    PostToolUseFailure: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo theirs' }] }],
  } };
  const next = SL.computeSettings(current, { mode: 'design-only', nodePresent: true, registration: 'project', serverKey: 'servicenow' });
  assert.deepEqual(next.hooks.Stop, [mine, ...SL.hookEntry().Stop], 'the user\'s Stop hook is lost, or an old copy of ours stays');
  assert.deepEqual(next.hooks.PostToolUseFailure, [current.hooks.PostToolUseFailure[0], ...SL.hookEntry().PostToolUseFailure]);
  const again = SL.computeSettings(next, { mode: 'design-only', nodePresent: true, registration: 'project', serverKey: 'servicenow' });
  assert.deepEqual(again.hooks, next.hooks, 'computing again changed the hooks');
});

test('ARC-09-C254 — the written Read entry, run in a project, names the page that was meant, byte for byte what the script prints', (t) => {
  const root = project(t);
  const entry = oursIn(written(root), 'PostToolUseFailure', SL.isOurReadFailureHook);
  const input = failedRead(root, 'markdown/alpha/page-two.md');
  const r = runEntry(entry, root, input);
  const direct = spawnSync(process.execPath, [join(root, ...READ_SCRIPT.split('/'))], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.deepEqual([r.status, r.stderr], [0, '']);
  assert.equal(r.stdout, direct.stdout);
  assert.equal(r.stdout.split('\n').length, 2, `not one line: ${r.stdout}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
  assert.match(out.hookSpecificOutput.additionalContext, /The page is markdown\/alpha\/deep\/folder\/page-two\.md\./);
});

test('ARC-09-C254 — the written Stop entry, run in a project, sends a dead citation back once and then says nothing', (t) => {
  const root = project(t);
  const entry = oursIn(written(root), 'Stop', SL.isOurStopHook);
  const input = stopping('A claim (citation: markdown/alpha/page-two.md).');
  const r = runEntry(entry, root, input);
  const direct = spawnSync(process.execPath, [join(root, ...STOP_SCRIPT.split('/'))], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.deepEqual([r.status, r.stderr], [0, '']);
  assert.equal(r.stdout, direct.stdout);
  assert.equal(r.stdout.split('\n').length, 2, `not one line: ${r.stdout}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'block');
  assert.match(out.reason, /markdown\/alpha\/page-two\.md -> markdown\/alpha\/deep\/folder\/page-two\.md/);
  assert.match(out.reason, /starts "Correction:"/);
  for (const quiet of [stopping(input.last_assistant_message, { stop_hook_active: true }), stopping('Nothing is cited here.'),
    stopping('A claim (citation: markdown/alpha/page-one.md).')]) {
    const q = runEntry(entry, root, quiet);
    assert.deepEqual([q.status, q.stderr, q.stdout], [0, '', ''], quiet.last_assistant_message);
  }
});

test('ARC-09-C254 — with a script gone, as after a move to an older release, each entry is a silent no-op', (t) => {
  const local = written(project(t));
  const empty = tempDir('snowarch-c254-gone-', t);
  for (const [event, isOurs, input] of [
    ['PostToolUseFailure', SL.isOurReadFailureHook, failedRead(empty, 'markdown/alpha/page-two.md')],
    ['Stop', SL.isOurStopHook, stopping('A claim (citation: markdown/alpha/page-two.md).')],
  ]) {
    const r = runEntry(oursIn(local, event, isOurs), empty, input);
    assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], event);
  }
});

test('ARC-09-C254 — a script that throws at import, or does not parse, still exits 0 with nothing printed', (t) => {
  const local = written(project(t));
  for (const [event, isOurs, script, input] of [
    ['PostToolUseFailure', SL.isOurReadFailureHook, READ_SCRIPT, failedRead('/x', 'markdown/alpha/page-two.md')],
    ['Stop', SL.isOurStopHook, STOP_SCRIPT, stopping('A claim (citation: markdown/alpha/page-two.md).')],
  ]) {
    for (const body of ["throw new Error('half-written');\n", 'export const = ;\n']) {
      const broken = tempDir('snowarch-c254-broken-', t);
      put(broken, script, body);
      const r = runEntry(oursIn(local, event, isOurs), broken, input);
      assert.deepEqual([r.status, r.stderr, r.stdout], [0, '', ''], `${event}: ${body}`);
    }
  }
});

test('ARC-09-C254 — a script removed from a project leaves the project\'s other hooks running', (t) => {
  const root = project(t);
  const local = written(root);
  rmSync(join(root, ...READ_SCRIPT.split('/')));
  const stop = runEntry(oursIn(local, 'Stop', SL.isOurStopHook), root, stopping('A claim (citation: markdown/alpha/page-two.md).'));
  assert.equal(JSON.parse(stop.stdout).decision, 'block');
});

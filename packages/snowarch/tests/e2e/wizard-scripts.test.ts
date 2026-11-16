// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AUTH_EXHAUSTED, EXIT_FAILED, EXIT_OK, MAX_ATTEMPTS, runAdd, type AddIo } from '../../src/cli/instance.js';
import { fakeRest } from '../helpers/fake-rest.js';
import { trackTempDir } from '../helpers/server-child.js';
import { happyPathScript, threeFailuresScript, type Script } from './wizard-scripts.js';

/**
 * ARC-09-C286 — THE LIVE SUITE'S TERMINAL SCRIPTS, HELD AGAINST THE WIZARD IN EVERY PULL REQUEST.
 *
 * `instance-wizard.e2e.test.ts` types into a pseudo-terminal what a user would, after the prompts it waits for. Those prompts
 * are the wizard's words, and the suite runs only nightly and only with an instance: ARC-07-W3 reworded the password prompt on
 * 2026-09-26 and ARC-07-W10 turned the retry question into a numbered menu, and the cases kept waiting for `Password:` and
 * `attempt 2 of 3` and answering `y`. Nothing noticed, for the reason ARC-09-C278 found for the probe line: no case held the
 * script to the wizard without an instance. This file does. It drives the very scripts the live cases send through the real
 * wizard (`runAdd`) with a terminal that answers them the way `runInPty` does, and a client that answers like the instance
 * does for a wrong password (401) or a right one (200). A script that waits for words the wizard no longer prints does not
 * hang here for two minutes: it stops, and says which prompt found no step.
 */
const URL_PDI = 'https://dev12345.service-now.com';
const USERNAME = 'svc.snowarch';
const PASSWORD = ['pw', '-', 'live'].join('');
const WRONG = ['not', '-the', '-password'].join('');

/**
 * An `AddIo` whose answers are a pty script's. `runInPty` writes a step's answer once its pattern is in everything the
 * terminal has shown so far; this asks the same question of the same text, and a prompt that arrives when no answer is
 * ready is the pty run that would have waited out its timeout.
 */
function scripted(script: Script): AddIo & { screen: () => string; left: () => number } {
  const pending = [...script];
  const ready: string[] = [];
  let screen = '';
  const pump = (): void => {
    while (pending.length > 0 && pending[0] && pending[0].waitFor.test(screen)) ready.push((pending.shift() as Script[number]).send);
  };
  const show = (text: string): void => { screen += text; pump(); };
  const answer = (prompt: string): string => {
    const next = ready.shift();
    if (next === undefined) {
      throw new Error(`the live script stalled: the wizard asked ${JSON.stringify(prompt)} and no step was ready; `
        + `the next step waits for ${pending[0] ? String(pending[0].waitFor) : 'nothing (the script is spent)'}; the terminal so far:\n${screen}`);
    }
    return next.replace(/\r?\n$/, '');
  };
  return {
    write: (text: string) => show(text),
    ask: async (prompt: string) => { show(prompt); return answer(prompt); },
    secret: async (prompt: string) => { show(`${prompt} `); const typed = answer(prompt); show('\n'); return typed; },
    screen: () => screen,
    left: () => pending.length + ready.length,
  };
}

const workspace = () => {
  const dir = trackTempDir(mkdtempSync(join(tmpdir(), 'wizard-scripts-')));
  return { store: join(dir, 'instances.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

/** A client whose `sys_user` answers are scripted (the login), every other table with a 200. */
const client = (authStatuses: readonly number[]) => {
  const queue = [...authStatuses];
  const calls: number[] = [];
  return {
    calls,
    make: () => {
      const status = queue.length > 1 ? (queue.shift() as number) : (queue[0] ?? 200);
      calls.push(status);
      return fakeRest({
        sys_user: { status },
        sys_user_has_role: { status: 200, records: [{ 'role.name': 'admin' }] },
        sys_update_set: { status: 200 },
        sys_script_include: { status: 200 },
        cmdb_ci: { status: 200 },
        sys_atf_test: { status: 200 },
        sys_properties: { status: 200, records: [{ sys_id: 'x' }] },
      });
    },
  };
};

const reachable = async () => ({ ok: true as const, status: 200, latencyMs: 1 });

describe('ARC-09-C286 — case 1: the happy path, as the live suite types it', () => {
  it('is answered step by step by the wizard, ends saved, and leaves no step unsent', async () => {
    const w = workspace();
    try {
      const terminal = scripted(happyPathScript(PASSWORD));
      const result = await runAdd({ label: 'e2e', url: URL_PDI, environment: 'pdi', auth: 'basic', username: USERNAME, preset: 'full', makeDefault: true },
        terminal, { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} });

      expect(result.exitCode, terminal.screen()).toBe(EXIT_OK);
      expect(terminal.left(), 'a step the wizard never reached').toBe(0);
      // The line the live case asserts, word for word.
      expect(terminal.screen()).toMatch(/Saved instance "e2e" \(pdi · basic · preset full · default\)\./);
      expect(terminal.screen()).not.toContain(PASSWORD);
    } finally { w.cleanup(); }
  });
});

describe('ARC-09-C286 — case 3: three failures, as the live suite types them', () => {
  it('is answered step by step, exits 1, names the failure once per attempt, and saves nothing', async () => {
    const w = workspace();
    try {
      const terminal = scripted(threeFailuresScript(WRONG));
      const c = client([401, 401, 401]);
      const result = await runAdd({ label: 'e2e-bad', url: URL_PDI, environment: 'pdi', auth: 'basic', username: USERNAME, preset: 'read-only' },
        terminal, { storePath: w.store, makeClient: c.make, reachability: reachable, env: {} });

      expect(result.exitCode, terminal.screen()).toBe(EXIT_FAILED);
      expect(terminal.left(), 'a step the wizard never reached').toBe(0);
      // One line for each failed attempt: two with the menu, and the exhaustion line for the third. The live case asks for three at least.
      expect((terminal.screen().match(/AUTHENTICATION_FAILED/g) ?? []).length).toBe(MAX_ATTEMPTS);
      expect(terminal.screen()).toContain(AUTH_EXHAUSTED);
      expect(c.calls).toHaveLength(MAX_ATTEMPTS);
      expect(existsSync(w.store)).toBe(false);
    } finally { w.cleanup(); }
  });
});

describe('ARC-09-C286 — the driver itself can fail', () => {
  it('stops with the prompt that found no step, instead of waiting', async () => {
    const w = workspace();
    try {
      const stale: Script = [{ waitFor: /A prompt the wizard never prints/, send: `${PASSWORD}\n` }];
      await expect(runAdd({ label: 'e2e', url: URL_PDI, environment: 'pdi', auth: 'basic', username: USERNAME, preset: 'full', makeDefault: true },
        scripted(stale), { storePath: w.store, makeClient: client([200]).make, reachability: reachable, env: {} }))
        .rejects.toThrow(/the live script stalled: the wizard asked "Password[^"]*" and no step was ready; the next step waits for \/A prompt the wizard never prints\//);
    } finally { w.cleanup(); }
  });
});

describe('ARC-09-C286 — the live file takes its scripts from here', () => {
  it('spells no prompt of its own, and gives every pseudo-terminal start the fixture licence', () => {
    const live = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'instance-wizard.e2e.test.ts'), 'utf8');
    // A pattern written in the live file is the second spelling this file exists to remove: it drifts at night, unseen.
    expect(live).not.toMatch(/waitFor\s*:/);
    expect(live).toContain('happyPathScript(');
    expect(live).toContain('threeFailuresScript(');
    // Every `runInPty` start in it takes the licensed environment (the spawn-class guard holds this too; this names the cause where it is read).
    const starts = live.match(/runInPty\(/g) ?? [];
    const licensedStarts = live.match(/env:\s*licensed\(\)/g) ?? [];
    expect(starts.length).toBeGreaterThan(0);
    expect(licensedStarts.length).toBe(starts.length);
  });
});

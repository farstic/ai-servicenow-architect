// ARC-08-S02 — E-05…E-11: the checkout itself. Is this the tree we shipped, and is it wired up?
//
// Everything here answers a question about FILES THIS REPOSITORY COMMITS, which is what makes the
// remedies so blunt: `git checkout -- <file>`. A user's `.mcp.json` differing from HEAD is not a
// configuration choice the doctor should preserve — the registration, the server key and the
// placeholder defaults are the product, and ARC-06 gives every legitimate local variation its own
// home in `.claude/settings.local.json` and `.local/`. So E-07 and E-08 are never `fixable`: the
// command is printed for a human to run after they have looked at their own diff, and S06 refuses
// to run it for them.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { makeExec, samePath } from '../../steps/B00.mjs';
import { loadState, STATE_VERSION } from '../../state.mjs';
import { defineCheck } from '../registry.mjs';

import { credentialKeys, credentialLines, CREDENTIAL_EXT } from './credential-shape.mjs';
import { fail, ok, warn } from './result.mjs';

/** The four files that make a directory this checkout rather than any directory. */
export const ROOT_MARKERS = Object.freeze(
  ['engine.config.json', 'CLAUDE.md', '.mcp.json', 'packages/snowarch/package.json'],
);

const SETTINGS = join('.claude', 'settings.json');
const SETTINGS_LOCAL = join('.claude', 'settings.local.json');
const MCP_JSON = '.mcp.json';

/** `git`, run in the checkout. `ok` is exit 0; the doctor never reads git's stderr into a report. */
const gitIn = (ctx) => {
  const exec = ctx.exec ?? makeExec({ env: ctx.env, plat: ctx.platform });
  return (args) => exec('git', ['-C', ctx.root, ...args]);
};

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

/** Committed-and-unmodified, as git sees it. `null` when git could not answer at all. */
export function isUnmodified(git, rel) {
  const r = git(['diff', '--quiet', 'HEAD', '--', rel]);
  if (!r.found) return null;
  return r.ok;
}

/**
 * Every `${…}` in a `.mcp.json` value, and whether it carries a `:-` default.
 *
 * A placeholder without one expands to the empty string with no way to tell that from a value the
 * user meant to be empty. `01` §5 makes the default mandatory; this reports the ones that lost it.
 */
export function placeholdersWithoutDefault(value, found = []) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\$\{([^}]*)\}/g)) {
      if (!m[1].includes(':-')) found.push(`\${${m[1]}}`);
    }
    return found;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) placeholdersWithoutDefault(child, found);
  }
  return found;
}

/**
 * The structural claims `tests/engine-config.test.mjs` makes, minus Ajv.
 *
 * The test compiles `engine.config.schema.json` with Ajv, which is a dependency; the doctor has to
 * answer on a checkout where `npm ci` has never run, so the same claims are made by hand. They are
 * the claims, not the schema: a key that exists and is empty is the failure mode this catches, and
 * the two patterns are the two fields whose SHAPE has broken before (a space in the server key, a
 * short pin).
 */
export function configProblems(config, root) {
  const problems = [];
  const required = {
    product: config?.product,
    cli: config?.cli,
    'mcp.serverKey': config?.mcp?.serverKey,
    'mcp.package': config?.mcp?.package,
    'mcp.packageDir': config?.mcp?.packageDir,
    'floors.node': config?.floors?.node,
    'floors.git': config?.floors?.git,
    'floors.claudeCode': config?.floors?.claudeCode,
    'docs.family': config?.docs?.family,
    'docs.pin': config?.docs?.pin,
    'roster.skills': config?.roster?.skills,
    'roster.agents': config?.roster?.agents,
  };
  for (const [name, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === '') problems.push(`${name} is missing`);
  }
  if (config?.mcp?.serverKey && /\s/.test(config.mcp.serverKey)) {
    problems.push('mcp.serverKey contains whitespace');
  }
  if (config?.docs?.pin && !/^[0-9a-f]{40}$/.test(config.docs.pin)) {
    problems.push('docs.pin is not a 40-character sha');
  }
  const dir = config?.mcp?.packageDir;
  if (dir && !existsSync(join(root, dir))) {
    problems.push(`mcp.packageDir "${dir}" does not exist`);
  } else if (dir) {
    // The package NAME is compared against the package itself rather than against a literal here:
    // `@farstic/snowarch` written in this file would be a second declaration of it, and the one in
    // `packages/snowarch/package.json` is the one npm publishes.
    let name = null;
    try { name = readJson(root, join(dir, 'package.json')).name; } catch { /* reported below */ }
    if (name === null) problems.push(`${dir}/package.json is unreadable`);
    else if (name !== config.mcp.package) {
      problems.push(`mcp.package "${config.mcp.package}" ≠ ${dir}/package.json name "${name}"`);
    }
  }
  return problems;
}

/**
 * The SessionStart hook — read from `.claude/settings.local.json`, which is where it lives.
 *
 * S02's table put it in the committed `.claude/settings.json`. ARC-06-S05 moved it, and the reason
 * is in `settings-local.mjs` beside the writer: "the whole reason the committed settings.json is
 * hook-free" is that a SessionStart hook running `node` on a machine without Node prints an error
 * at every session start, so the hook is written locally and only when Node is present (S-05
 * variant B). A check that looked for it in the committed file would fail every correct install.
 *
 * The shape is that writer's: ONE `command` string, `${CLAUDE_PROJECT_DIR}`-relative, `timeout: 10`.
 * @returns {{problems: string[], present: boolean}}
 */
export function sessionStartProblems(local, root) {
  const problems = [];
  const entries = local?.hooks?.SessionStart;
  const hooks = (Array.isArray(entries) ? entries : []).flatMap((e) => e.hooks ?? []);
  const hook = hooks.find((h) => /session-start\.mjs/.test(String(h?.command ?? '')));
  if (!hook) return { problems, present: false };
  const command = String(hook.command ?? '');
  if (!/^node\s/.test(command)) problems.push(`SessionStart does not run node (${command})`);
  if (!/tools\/snowarch\/hooks\/session-start\.mjs$/.test(command)) {
    problems.push(`SessionStart does not run tools/snowarch/hooks/session-start.mjs (${command})`);
  } else if (!existsSync(join(root, 'tools', 'snowarch', 'hooks', 'session-start.mjs'))) {
    problems.push('tools/snowarch/hooks/session-start.mjs is not on disk');
  }
  if (!(Number(hook.timeout) <= 10)) {
    problems.push(`SessionStart timeout is ${hook.timeout}, which is more than 10 s`);
  }
  return { problems, present: true };
}

/**
 * The toggle matrix: what `.claude/settings.local.json` must say for the mode that was recorded.
 *
 * BOTH lists naming the server, or NEITHER, is the case worth the most words. Claude Code resolves
 * that combination itself, and whichever way it resolves it, the file no longer says what the user
 * asked for — so it is a FAIL with a fix rather than a warning, and S06's rewrite is the fix.
 */
export function toggleProblems({ mode, settings, serverKey }) {
  const enabled = (settings?.enabledMcpjsonServers ?? []).includes(serverKey);
  const disabled = (settings?.disabledMcpjsonServers ?? []).includes(serverKey);
  const problems = [];
  if (enabled && disabled) {
    problems.push(`${serverKey} is in BOTH enabledMcpjsonServers and disabledMcpjsonServers`);
  } else if (!enabled && !disabled) {
    problems.push(`${serverKey} is in NEITHER enabledMcpjsonServers nor disabledMcpjsonServers`);
  } else if (mode === 'live' && !enabled) {
    problems.push(`mode is live but ${serverKey} is disabled`);
  } else if (mode && mode !== 'live' && !disabled) {
    problems.push(`mode is ${mode} but ${serverKey} is enabled`);
  }
  return { problems, enabled, disabled };
}

export function engineRepoChecks() {
  return [
    defineCheck({
      id: 'E-98',
      section: 'repo',
      title: 'DRILL — a check nobody added to the snapshots',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async () => ({ status: 'ok', detail: 'drill' }),
    }),

    defineCheck({
      id: 'E-05',
      section: 'repo',
      title: 'repository root',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // The command already exited 3 if the cwd were not the root — this check exists so a report
      // read on its own says WHICH root, and so that git's opinion of the top level is on the
      // record beside the four markers.
      run: async (ctx) => {
        const missing = ROOT_MARKERS.filter((m) => !existsSync(join(ctx.root, m)));
        if (missing.length > 0) {
          return fail(`${ctx.root} is missing ${missing.join(', ')}`, {
            remedy: 'this is not a complete checkout — clone it again',
            data: { root: ctx.root, missing },
          });
        }
        const top = gitIn(ctx)(['rev-parse', '--show-toplevel']);
        if (!top.found || !top.ok) {
          // git's own absence is E-01's finding. Saying it twice would have the operator fix one
          // problem and read two lines about it.
          return warn(`${ctx.root} (git could not confirm the repository root)`,
            { data: { root: ctx.root } });
        }
        const agrees = samePath(top.stdout.trim(), ctx.root, ctx.platform);
        return agrees
          ? ok(ctx.root, { root: ctx.root, toplevel: top.stdout.trim() })
          : fail(`git reports the top level as ${top.stdout.trim()}, not ${ctx.root}`, {
            remedy: `cd ${top.stdout.trim()}`,
            data: { root: ctx.root, toplevel: top.stdout.trim() },
          });
      },
    }),

    defineCheck({
      id: 'E-06',
      section: 'repo',
      title: 'engine.config.json',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const problems = configProblems(ctx.config, ctx.root);
        return problems.length === 0
          ? ok(`${ctx.config.product} ${ctx.config.mcp.serverKey} · docs ${ctx.config.docs.family}`,
            { serverKey: ctx.config.mcp.serverKey, family: ctx.config.docs.family })
          : fail(problems.join('; '), {
            remedy: 'restore with `git checkout -- engine.config.json`',
            command: 'git checkout -- engine.config.json',
            data: { problems },
          });
      },
    }),

    defineCheck({
      id: 'E-07',
      section: 'repo',
      title: '.mcp.json committed and secret-free',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      // Never fixable. See the file header: the command is printed, and a human runs it.
      fixable: false,
      run: async (ctx) => {
        const problems = [];
        const unmodified = isUnmodified(gitIn(ctx), MCP_JSON);
        // Always compared against HEAD, on every platform: the S-03 fallback never edits this file
        // (it adds a local-scope entry through `claude mcp add-json … -s local` plus
        // `env.SNOWARCH_ROOT` in settings.local.json), so a modified `.mcp.json` is never the
        // fallback's doing — E-23/E-27 report that registration separately.
        if (unmodified === false) problems.push('differs from HEAD');
        let mcp = null;
        try { mcp = readJson(ctx.root, MCP_JSON); } catch (e) {
          return fail(`.mcp.json is unreadable — ${e.message}`, {
            remedy: 'git checkout -- .mcp.json',
            command: 'git checkout -- .mcp.json',
            data: { unmodified },
          });
        }
        const keys = Object.keys(mcp.mcpServers ?? {});
        const expected = ctx.config.mcp.serverKey;
        if (keys.length !== 1) problems.push(`expected exactly one mcpServers key, found ${keys.length}`);
        else if (keys[0] !== expected) problems.push(`mcpServers key "${keys[0]}" ≠ "${expected}"`);
        const server = mcp.mcpServers?.[keys[0]] ?? {};
        if (server.command !== 'node') problems.push(`command is "${server.command}", not "node"`);
        const bare = placeholdersWithoutDefault(mcp);
        for (const p of bare) problems.push(`placeholder ${p} has no ":-" default`);
        return problems.length === 0
          ? ok(`one server "${expected}", command node, placeholders defaulted`,
            { serverKey: expected, unmodified: true })
          : fail(problems.join('; '), {
            remedy: 'git checkout -- .mcp.json',
            command: 'git checkout -- .mcp.json',
            data: { problems, unmodified, placeholders: bare },
          });
      },
    }),

    defineCheck({
      id: 'E-08',
      section: 'repo',
      title: '.claude/settings.json committed',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const problems = [];
        const unmodified = isUnmodified(gitIn(ctx), SETTINGS);
        if (unmodified === false) problems.push('differs from HEAD');
        let settings = null;
        try { settings = readJson(ctx.root, SETTINGS); } catch (e) {
          return fail(`.claude/settings.json is unreadable — ${e.message}`, {
            remedy: 'git checkout -- .claude/settings.json',
            command: 'git checkout -- .claude/settings.json',
            data: { unmodified },
          });
        }
        if (!settings?.env?.MCP_TIMEOUT) problems.push('env.MCP_TIMEOUT is absent');
        // The hook's own file. Its ABSENCE is E-10's finding ("not bootstrapped"), not this one's
        // — but a hook that is there and wrong is this one's, because nothing else looks at it.
        let local = null;
        try { local = readJson(ctx.root, SETTINGS_LOCAL); } catch { local = null; }
        const hook = sessionStartProblems(local, ctx.root);
        problems.push(...hook.problems);
        return problems.length === 0
          ? ok(`MCP_TIMEOUT ${settings.env.MCP_TIMEOUT} · SessionStart hook `
            + `${hook.present ? 'present' : 'not installed (see E-10)'}`,
            { unmodified: true, mcpTimeout: settings.env.MCP_TIMEOUT, hook: hook.present })
          : fail(problems.join('; '), {
            remedy: 'git checkout -- .claude/settings.json',
            command: 'git checkout -- .claude/settings.json',
            data: { problems, unmodified },
          });
      },
    }),

    defineCheck({
      id: 'E-09',
      section: 'repo',
      title: 'no credential-shaped keys',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // Two legs, one pattern (`credential-shape.mjs`, shared with `tests/never-commit.test.mjs`):
      // a KEY that names a credential in one of the three settings files, and a tracked file
      // carrying a credential-shaped LITERAL. Only `file:line` is ever reported — printing the
      // match would put the credential in the report.
      run: async (ctx) => {
        const problems = [];
        for (const rel of [MCP_JSON, SETTINGS, SETTINGS_LOCAL]) {
          if (!existsSync(join(ctx.root, rel))) continue;
          let parsed;
          try { parsed = readJson(ctx.root, rel); } catch { continue; }
          for (const key of credentialKeys(parsed)) problems.push(`${rel}: key ${key}`);
        }
        const tracked = gitIn(ctx)(['ls-files']);
        const hits = [];
        if (tracked.found && tracked.ok) {
          for (const file of tracked.stdout.split('\n').filter((f) => f && CREDENTIAL_EXT.test(f))) {
            let text;
            try { text = readFileSync(join(ctx.root, file), 'utf8'); } catch { continue; }
            for (const line of credentialLines(text)) hits.push(`${file}:${line}`);
          }
        }
        for (const hit of hits.slice(0, 10)) problems.push(hit);
        return problems.length === 0
          ? ok('no credential-shaped key or literal', { scanned: tracked.ok ? 'tracked files' : 'settings only' })
          : fail(problems.join('; '), {
            remedy: 'remove the key; credentials live only in .local/instances.json '
              + '(`./snowarch instance set-credentials <label>`)',
            data: { problems },
          });
      },
    }),

    defineCheck({
      id: 'E-10',
      section: 'repo',
      title: 'settings.local toggles match the recorded mode',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        let state = null;
        try { state = loadState(ctx.root); } catch { state = null; }
        if (!existsSync(join(ctx.root, SETTINGS_LOCAL))) {
          return fail('.claude/settings.local.json is absent — the mode toggle is unset', {
            remedy: './snowarch mode design (or ./snowarch mode live)',
            command: './snowarch mode design',
            data: { mode: state?.mode ?? null,
              fix: { kind: 'toggles-mismatch', mode: state?.mode ?? 'design' } },
          });
        }
        let settings;
        try { settings = readJson(ctx.root, SETTINGS_LOCAL); } catch (e) {
          return fail(`.claude/settings.local.json is not valid JSON — ${e.message}`, {
            remedy: 'fix the JSON, then ./snowarch mode design or ./snowarch mode live',
            data: { mode: state?.mode ?? null },
          });
        }
        const serverKey = ctx.config.mcp.serverKey;
        const mode = state?.mode ?? null;
        const { problems, enabled, disabled } = toggleProblems({ mode, settings, serverKey });
        const data = { mode, enabled, disabled,
          fix: { kind: 'toggles-mismatch', mode: mode ?? 'design' } };
        if (problems.length > 0) {
          return fail(problems.join('; '), {
            remedy: mode === 'live' ? './snowarch mode live' : './snowarch mode design',
            command: mode === 'live' ? './snowarch mode live' : './snowarch mode design',
            data,
          });
        }
        // `disableAllHooks` has two meanings and they get different sentences. The bootstrap sets
        // it when Node was absent; that reason expires the moment Node appears, so it is a WARN
        // with a fix. A user who set it themselves is exercising a supported choice, and telling
        // them off for it would be the doctor overruling its operator.
        if (settings.disableAllHooks === true) {
          return state?.hooksDisabledByBootstrap === true
            ? warn('hooks were disabled when Node was absent; Node is present now', {
              remedy: 'remove "disableAllHooks" from .claude/settings.local.json',
              data: { ...data, fix: { kind: 'hooks-disabled-by-bootstrap' } },
            })
            : ok(`${mode ?? 'design'} · hooks disabled by choice (disableAllHooks)`, data);
        }
        return ok(`${mode ?? 'design'} · ${enabled ? 'enabled' : 'disabled'}`, data);
      },
    }),

    defineCheck({
      id: 'E-11',
      section: 'repo',
      title: '.local/ state',
      severity: 'fail',
      quick: true,
      network: false,
      spawns: false,
      fixable: true,
      run: async (ctx) => {
        const local = join(ctx.root, '.local');
        if (!existsSync(local)) {
          // `fixable: false` on the RESULT: the check can be fixable (a wrong mode is one command),
          // but an absent `.local/` is an install that never ran, and `--fix` does not install.
          return fail('.local/ is absent — not bootstrapped', {
            remedy: ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh',
            command: ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh',
            fixable: false,
            data: { fix: null },
          });
        }
        const notes = [];
        const problems = [];
        // Windows has no mode bits worth asserting: the directory inherits the parent's ACL, and
        // `chmod` there sets a read-only flag that means something else entirely. The check says
        // so rather than reporting a mode it did not apply — and it NEVER runs chmod.
        let mode = null;
        if (ctx.platform === 'win32') {
          notes.push('file modes: ACL-inherited');
        } else {
          mode = statSync(local).mode & 0o777;
          if (mode !== 0o700) {
            problems.push(`.local/ is mode ${mode.toString(8).padStart(3, '0')}, not 700`);
          }
        }
        let state = null;
        try {
          state = loadState(ctx.root);
        } catch (e) {
          return fail(e.message, {
            remedy: './snowarch bootstrap --reset',
            command: './snowarch bootstrap --reset',
            fixable: false,
            data: { mode, fix: null },
          });
        }
        if (!state) problems.push('.local/bootstrap-state.json is absent — not bootstrapped');
        else if (state.version !== STATE_VERSION) {
          notes.push(`state schema ${state.version} (current ${STATE_VERSION})`);
        }
        const logs = join(local, 'logs');
        if (!existsSync(logs)) problems.push('.local/logs/ is absent');
        const data = {
          mode: mode === null ? 'acl-inherited' : mode.toString(8).padStart(3, '0'),
          schema: state?.version ?? null,
          recordedMode: state?.mode ?? null,
          fix: mode !== null && mode !== 0o700 ? { kind: 'store-mode', path: '.local', to: '700' } : null,
        };
        if (problems.length > 0) {
          const fixable = data.fix !== null;
          return fail(problems.join('; '), {
            fixable,
            remedy: fixable ? 'chmod 700 .local' : (ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh'),
            command: fixable ? 'chmod 700 .local' : (ctx.platform === 'win32' ? 'bootstrap.cmd' : './bootstrap.sh'),
            data,
          });
        }
        const detail = [`mode ${state?.mode ?? 'unset'}`, ...notes].join(' · ');
        return ok(detail, data);
      },
    }),
  ];
}

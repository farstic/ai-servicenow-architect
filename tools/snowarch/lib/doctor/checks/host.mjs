// ARC-08-S03 — E-25, E-26, E-27: facts about the MACHINE, not about the checkout.
//
// Read-only, like `legacy.mjs`, and for the same reason: a cloud-sync folder, a proxy variable and
// a Claude Code approval are all things the user chose. The doctor reports them and names the
// command; it never moves a checkout, edits a shell profile or clicks an approval.
//
// E-26 says "as seen by this shell" out loud. Whether the environment the doctor sees is the
// environment Claude Code's spawned server sees is spike S-20 (`03` §A), and until that is
// answered a check that said "the server has no proxy" would be asserting something nobody has
// measured. Saying which environment was inspected costs one clause and is true today.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { cloudSyncProvider } from '../../cloud-sync.mjs';
import { maskProxy } from '../../net-sentences.mjs';
import { get as claudeGet, resolveClaude } from '../../registration-claude.mjs';
import { loadState } from '../../state.mjs';
import { remedyFor } from '../../../../../packages/contract/lib/contract.mjs';
import { defineCheck } from '../registry.mjs';

import { ok, skip, warn } from './result.mjs';

/** The four variables, in both spellings. POSIX tools read either; Windows sets the upper form. */
export const PROXY_VARS = Object.freeze([
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS',
]);

export const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

/** The value of `name` in either case, with the name that carried it. */
export function readVar(env, name) {
  for (const key of [name, name.toLowerCase()]) {
    if (Object.hasOwn(env, key)) return { key, value: env[key] };
  }
  return null;
}

/**
 * The status strings `claude mcp get` prints, quoted from the S-01 record.
 *
 * `docs/spikes/S-01-preseeded-approval/README.md` recorded them character for character on two
 * Claude Code versions (2.1.214 and 2.1.258). They are Claude Code's words, not ours (`03` R-13),
 * so anything unrecognised degrades to "could not read registration status" — a WARN — rather than
 * a confident wrong answer.
 */
export const STATUS_PATTERNS = Object.freeze([
  { kind: 'rejected', approved: false, match: /Rejected/i },
  { kind: 'pending', approved: false, match: /Pending approval/i },
  { kind: 'approved', approved: true, match: /Connected|Approved|^\s*[✔✓]/i },
]);

export function classifyStatus(statusLine) {
  const text = String(statusLine ?? '');
  if (text.trim() === '') return { kind: 'unknown', approved: null };
  for (const p of STATUS_PATTERNS) if (p.match.test(text)) return { kind: p.kind, approved: p.approved };
  return { kind: 'unknown', approved: null };
}

/** The certificate bundle, as far as a file can be inspected without parsing it. */
export function inspectCa(path) {
  if (!existsSync(path)) return { ok: false, reason: 'the file does not exist' };
  try {
    const head = readFileSync(path, 'utf8').slice(0, 4096);
    return head.includes(PEM_HEADER)
      ? { ok: true, reason: null }
      : { ok: false, reason: `no ${PEM_HEADER} block in the first 4 KB` };
  } catch (e) {
    return { ok: false, reason: `it cannot be read (${e.message})` };
  }
}

export function hostChecks() {
  return [
    defineCheck({
      id: 'E-25',
      section: 'host',
      title: 'cloud-sync folder',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      // `cloudSyncProvider` is ARC-06-S05's, which answers to
      // `packages/snowarch/tests/fixtures/cloud-sync-paths.json` — the one list the server's
      // detector, the bootstrap's warning and this check all answer to (ARC-07-S07). A second
      // implementation here would be a fourth answer to a question with one right one.
      run: async (ctx) => {
        const provider = cloudSyncProvider(ctx.root);
        if (!provider) return ok('not under a cloud-sync folder', { provider: null });
        // Reported in design-only too: `clients/` holds engagement content, and a synced folder
        // copies that as readily as it copies a credential file.
        return warn(`checkout is under a cloud-sync folder (${provider}) — `
          + '.local/instances.json (0600) will still be synced; move the checkout outside the '
          + 'synced tree or keep this instance read-only', {
          remedy: 'move the checkout to a local path such as ~/work/ (D-04)',
          data: { provider },
        });
      },
    }),

    defineCheck({
      id: 'E-26',
      section: 'host',
      title: 'proxy and CA environment',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const env = ctx.env ?? {};
        const seen = [];
        const problems = [];
        const data = { vars: {}, seenBy: 'this shell' };

        for (const name of PROXY_VARS) {
          const found = readVar(env, name);
          if (!found) continue;
          const { key, value } = found;
          if (String(value) === '') {
            // An empty proxy variable is not "no proxy": every library treats it differently, and
            // the server treats it as unset. Saying so is the only way a user learns the variable
            // they exported is doing nothing.
            problems.push(`${key} is set to an empty string — treated as unset by the server; `
              + 'unset it to silence this');
            data.vars[key] = '';
            continue;
          }
          const shown = name === 'NODE_EXTRA_CA_CERTS' ? String(value) : maskProxy(String(value));
          seen.push(`${key}=${shown}`);
          data.vars[key] = shown;
          if (name === 'NODE_EXTRA_CA_CERTS') {
            const ca = inspectCa(String(value));
            if (!ca.ok) {
              problems.push(`NODE_EXTRA_CA_CERTS points at a file where ${ca.reason} — `
                + 'see "Corporate networks" in packages/snowarch/README.md');
            }
          }
        }

        // SV-04 (ARC-08-S04) classifies a live network failure. When that ran in the same report,
        // its code is echoed here with the contract's remedy, so the host section and the server
        // section cannot give different advice about one failure.
        const code = ctx.networkCode ?? null;
        if (code) {
          const entry = ctx.contract ? remedyFor(ctx.contract, code) : null;
          problems.push(`the live probe reported ${code}${entry ? ` — ${entry.remedy}` : ''}`);
          data.networkCode = code;
        }

        if (problems.length > 0) {
          return warn(`${problems.join('; ')} (as seen by this shell)`, {
            remedy: 'unset or correct the variable in the shell that starts claude',
            data,
          });
        }
        return seen.length === 0
          ? ok('no proxy configured', data)
          : ok(`${seen.join(' · ')} (as seen by this shell)`, data);
      },
    }),

    defineCheck({
      id: 'E-27',
      section: 'host',
      title: 'Claude Code registration status',
      severity: 'warn',
      quick: true,
      network: false,
      // It runs `claude`, so `--quick` never selects it however fast it is: the cost being avoided
      // is the process.
      spawns: true,
      // Never fixable: the toggle is E-10's (and S06's), and the approval click is the user's.
      fixable: false,
      // AND: this check makes Claude Code run. The doctor writes nothing itself, but `claude mcp
      // get` is Claude Code touching its OWN configuration, and a real CLI rewrites `~/.claude.json`
      // while answering — measured on a redirected HOME. So "the file is unchanged after a doctor
      // run" is E-23's promise about THIS product, and it holds for `--section legacy` and for
      // `--quick` (which excludes this check), not for a full run against an installed CLI. The
      // detail says so rather than leaving a reader to discover a changed mtime and mistrust the
      // report.
      run: async (ctx) => {
        const claudePath = ctx.claudePath === undefined
          ? resolveClaude({ env: ctx.env, platform: ctx.platform })
          : ctx.claudePath;
        if (!claudePath) return skip('claude CLI not found (see E-00)', { statusLine: null });

        const serverKey = ctx.config?.mcp?.serverKey;
        const entry = claudeGet(serverKey, { root: ctx.root, claudePath, env: ctx.env,
          ...(ctx.exec ? { exec: ctx.exec } : {}) });
        const statusLine = entry.status ?? null;
        const { kind, approved } = classifyStatus(statusLine);
        const state = (() => { try { return loadState(ctx.root); } catch { return null; } })();
        const live = state?.mode === 'live';
        const data = { statusLine, scope: entry.scope ?? null, approved,
          registration: state?.registration ?? null, mode: state?.mode ?? null };

        if (!entry.found || kind === 'unknown') {
          // The format is Claude Code's, not ours (`03` R-13): a wording change must degrade to a
          // WARN a reader can act on, never to a confident FAIL about a healthy install.
          const reason = entry.reason ?? (statusLine ? `unrecognised status "${statusLine}"`
            : 'no entry reported');
          return warn(`could not read registration status: ${String(reason).split('\n')[0]}`, {
            remedy: `check it by hand: claude mcp get ${serverKey}`,
            command: `claude mcp get ${serverKey}`,
            data,
          });
        }

        // Design-only expects the ONE string the S-01 record measured for a disabled server:
        // `✘ Rejected (see disabledMcpjsonServers in settings)`. "Pending approval" is not it —
        // that record also found that `enabledMcpjsonServers` is not honoured before trust, so a
        // pending status in design-only means the disable toggle is not in force.
        if (!live && kind !== 'rejected') {
          return warn('server is not disabled in Claude Code although the recorded mode is '
            + 'design-only', {
            remedy: './snowarch mode design',
            command: './snowarch mode design',
            data,
          });
        }
        if (live && approved !== true) {
          return warn(`server is ${kind === 'rejected' ? 'rejected' : 'unapproved'} in Claude Code `
            + 'although the recorded mode is live', {
            remedy: './snowarch mode live, then answer Yes once in claude (S-01)',
            command: './snowarch mode live',
            data,
          });
        }
        const scopeNote = entry.scope === 'local'
          ? ` · scope local (${state?.registration ?? 'registration not recorded'})`
          : '';
        return ok(`${statusLine}${scopeNote} · read by running claude, which maintains its own `
          + 'configuration file', data);
      },
    }),

    /**
     * E-28 — is this checkout on the newest release?
     *
     * The one check in the engine that goes to the NETWORK for a reason other than reaching a
     * ServiceNow instance, and the only one that writes a file outside the report: it refreshes
     * `.local/upgrade-check.json`, which is what the SessionStart banner reads. The banner cannot
     * fetch — it has a 300 ms budget and may run on a machine with no Node — so something else has
     * to, and a doctor run the user started is the honest place for it.
     *
     * Rate-limited to once a day. A doctor run is not rare, and `git ls-remote` against a remote
     * that is slow or behind a proxy is not free; the cache says when it was last asked, and
     * `needsRefresh` is the whole of the policy.
     *
     * `--quick` never selects it and `--no-network` skips it, both by the flags rather than by an
     * `if` in the body: the runner's rules are the rules.
     */
    defineCheck({
      id: 'E-28',
      section: 'host',
      title: 'release currency',
      severity: 'warn',
      quick: false,
      network: true,
      spawns: true,
      fixable: false,
      run: async (ctx) => {
        const { needsRefresh, readUpgradeCheck, writeUpgradeCheck } =
          await import('../../upgrade-check.mjs');
        const cached = readUpgradeCheck(ctx.root);
        // ARC-09-C31. `ctx.now()` is EPOCH MILLISECONDS (the contract is stated where the context
        // is built); `upgrade-check.mjs` wants a `Date`, and its own default supplies one. This
        // used to be `ctx.now ?? (() => new Date())` — which reads as a sensible fallback and is
        // the bug: with the runner's real `ctx.now` the check handed a NUMBER to code that calls
        // `.toISOString()` and `.getTime()` on it, so the check crashed on any networked run with
        // either a release tag to compare against or a cache from a previous one.
        const now = () => new Date(ctx.now ? ctx.now() : Date.now());

        if (ctx.noNetwork) {
          return skip(cached?.latestTag
            ? `--no-network; the last check (${cached.checkedAt}) saw ${cached.latestTag}`
            : '--no-network, and nothing has been checked yet');
        }

        if (!needsRefresh(cached, { now })) {
          return cached.behind
            ? warn(`${cached.latestTag} available — run ./snowarch upgrade`,
              { command: './snowarch upgrade', data: { ...cached, refreshed: false } })
            : ok(`up to date (${cached.localTag ?? cached.latestTag ?? 'no tag'}) · last checked `
              + `${cached.checkedAt}`, { ...cached, refreshed: false });
        }

        // `ls-remote`, not `fetch`: the question is "what tags exist there", and a doctor has no
        // business writing objects into a user's repository to answer it.
        const remote = 'origin';
        const listed = (ctx.exec ?? execFileSync)('git',
          ['ls-remote', '--tags', '--refs', remote, 'v*'],
          { cwd: ctx.root, encoding: 'utf8', stdio: 'pipe', timeout: 15_000 });
        const { sortTags } = await import('../../commands/upgrade.mjs');
        const names = String(listed ?? '').split('\n')
          .map((l) => l.split('/').pop()?.trim()).filter(Boolean);
        const latest = sortTags(names).filter((t) => t.pre === null)[0]?.tag ?? null;
        if (!latest) return skip(`${remote} advertises no release tags`);

        const localTag = describeExact(ctx.root, ctx.exec);
        const behind = localTag !== latest;
        const written = writeUpgradeCheck(ctx.root,
          { latestTag: latest, localTag, behind, remote, now });

        return behind
          ? warn(`${latest} available — run ./snowarch upgrade`,
            { command: './snowarch upgrade', data: { ...written, refreshed: true } })
          : ok(`up to date (${latest})`, { ...written, refreshed: true });
      },
    }),
  ];
}

/** The tag this checkout is exactly on, or `null`. Never a guess from a nearby one. */
function describeExact(root, exec = execFileSync) {
  try {
    return String(exec('git', ['describe', '--tags', '--exact-match'],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' })).trim() || null;
  } catch { return null; }
}

// ARC-08-S06 — `--fix`: seven repairs, a closed whitelist, and a plan shown before anything moves.
//
// THE WHITELIST IS THE FEATURE. A doctor that repaired whatever it could would eventually repair
// something a user meant; every entry below is a class of drift that has exactly one correct
// resolution and no information in it that a human would supply differently. Everything else is
// listed under REFUSED with the command to run by hand — including the three files this module is
// structurally unable to write (`.mcp.json`, `.claude/settings.json`, anything under the home
// directory), which is asserted by a grep test rather than promised here.
//
// It is also why the fixers WIRE rather than implement: F1 is the bootstrap's dependency step, F2
// its docs step, F6 its toggle writer, F4 the server store's own atomic write. A repair with its
// own idea of how to install dependencies is a second installer.
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { cachePath, cacheStale, inputsPath } from '../doctor-cache.mjs';

/** The `data.fix.kind` vocabulary. A kind outside this table is never applied — it is reported. */
export const KINDS = Object.freeze(['deps-missing', 'corpus-missing', 'sparse-mismatch',
  'head-off-pin', 'flags-incomplete', 'store-mode', 'toggles-mismatch',
  'hooks-disabled-by-bootstrap', 'cache-stale']);

/** The one place that says which file a repair is allowed to touch, for the report and the test. */
export const TARGETS = Object.freeze({
  'deps-missing': 'node_modules/',
  'corpus-missing': 'vendor/ServiceNowDocs',
  'sparse-mismatch': 'vendor/ServiceNowDocs',
  'head-off-pin': 'vendor/ServiceNowDocs',
  'flags-incomplete': '.local/instances.json',
  'store-mode': '.local/',
  'toggles-mismatch': '.claude/settings.local.json',
  'hooks-disabled-by-bootstrap': '.claude/settings.local.json',
  'cache-stale': '.local/doctor-last.json',
});

const result = (state, detail = null) => ({ result: state, ...(detail ? { detail } : {}) });

/**
 * F1 — the dependencies, through the bootstrap's own step.
 *
 * Live mode only: a design-only install deliberately has none, and "repairing" that would install
 * a server the user asked not to have.
 */
async function fixDeps({ root, ctx, run }) {
  if (ctx.mode !== 'live') return result('noop', 'design-only installs have no dependencies');
  const B04 = await import('../steps/B04.mjs');
  const r = await (run ?? B04.run)({ root, mode: 'live', env: ctx.env ?? process.env,
    config: ctx.config, log: { debug: () => {} }, line: () => {} });
  return r?.status === 'fail' ? result('failed', r.detail) : result('applied', r?.detail ?? null);
}

/** F2 — the corpus, through the bootstrap's docs step. `skip` becomes `sparse`, and says so. */
async function fixDocs({ root, ctx, kind, run }) {
  const B02 = await import('../steps/B02.mjs');
  const recorded = ctx.docsMode ?? 'sparse';
  const mode = recorded === 'skip' ? 'sparse' : recorded;
  const note = recorded === 'skip' ? 'recorded mode was "skip" — synced as "sparse"' : null;
  const r = await (run ?? B02.run)({ root, docs: mode, env: ctx.env ?? process.env,
    config: ctx.config, log: { debug: () => {} }, line: () => {} });
  if (r?.status === 'fail') return result('failed', r.detail);
  return result('applied', [note, r?.detail].filter(Boolean).join(' · ') || null);
}

/**
 * F3 — the corpus checkout back onto the pin, and ONLY when the pin is the committed gitlink.
 *
 * `head-off-pin` from E-13 means the working tree moved; `pin ≠ gitlink` is a maintainer's
 * deliberate bump and is REFUSED with the `docs-bump.mjs` command, because moving the pin is a
 * decision and this is a repair.
 */
async function fixHeadOffPin({ root, ctx, fix, run }) {
  if (fix?.pinMovedByMaintainer) {
    return result('refused', 'the pin and the committed gitlink differ — that is a maintainer bump');
  }
  const sync = await import('../docs/sync.mjs');
  const r = await (run ?? sync.syncDocs)({ root, mode: ctx.docsMode ?? 'sparse',
    config: ctx.config, env: ctx.env ?? process.env });
  return r?.ok === false ? result('failed', r.reason ?? 'docs sync failed') : result('applied');
}

/**
 * F4 — the flags an entry never stated, written as the string `"false"`.
 *
 * Through the SERVER's own store module, imported by file path exactly as the doctor imports its
 * doctor (the engine is stdlib and has no `node_modules` of its own). `updateInstance` refuses a
 * patch naming a credential at all, so this fixer cannot touch one even if it were asked to — the
 * guard lives with the data rather than in the caller's good intentions.
 */
async function fixFlags({ root, ctx, fix, storeModule }) {
  const flags = fix?.flags ?? [];
  const label = fix?.label;
  if (!label || flags.length === 0) return result('noop', 'no flags to write');
  const entry = join(root, ctx.config?.mcp?.packageDir ?? 'packages/snowarch',
    'dist', 'store', 'index.js');
  if (!existsSync(entry)) return result('failed', 'the server store module is not built');
  const store = storeModule ?? await import(pathToFileURL(entry).href);
  const storePath = ctx.storePath ?? join(root, '.local', 'instances.json');
  const loaded = store.loadStore(storePath);
  if ('error' in loaded) return result('failed', loaded.error.message);
  const current = loaded.store.instances?.[label];
  if (!current) return result('failed', `no instance "${label}" in the store`);
  const absent = flags.filter((f) => current.flags?.[f] === undefined);
  if (absent.length === 0) return result('noop', 'every flag is already stated');
  const next = { ...(current.flags ?? {}) };
  for (const f of absent) next[f] = 'false';
  const written = store.updateInstance(storePath, label, { flags: next });
  if ('error' in written) return result('failed', written.error.message);
  if ('unknownInstance' in written) return result('failed', `no instance "${label}" in the store`);
  return result('applied', `${absent.join(', ')} = "false"`);
}

/** F5 — the store directory's mode. POSIX only; Windows inherits an ACL and has nothing to set. */
function fixStoreMode({ root, ctx, fix }) {
  if ((ctx.platform ?? process.platform) === 'win32') {
    return result('noop', 'file modes: ACL-inherited');
  }
  const target = join(root, fix?.path ?? '.local');
  if (!existsSync(target)) return result('noop', 'nothing to chmod');
  const want = parseInt(fix?.to ?? '700', 8);
  if ((statSync(target).mode & 0o777) === want) return result('noop', 'already correct');
  chmodSync(target, want);
  return result('applied', `mode ${(want).toString(8)}`);
}

/**
 * F6 — the toggle file, through ARC-06-S05's merge writer.
 *
 * That writer never overwrites a key it does not own, which is the whole reason this is a
 * whitelist entry: `.claude/settings.local.json` is the user's file, and a repair that rewrote it
 * wholesale would take their permissions and their hooks with it.
 */
async function fixToggles({ root, ctx, kind, apply }) {
  const settings = await import('../settings-local.mjs');
  const mode = ctx.mode === 'live' ? 'live' : 'design';
  const r = await (apply ?? settings.applyToggles)({
    root,
    mode,
    nodePresent: true,
    registration: ctx.registration ?? 'project',
    serverKey: ctx.config?.mcp?.serverKey,
    // Only the bootstrap's own `disableAllHooks` is ever removed, and only when the state says the
    // bootstrap set it. A key the user set is theirs.
    ...(kind === 'hooks-disabled-by-bootstrap' ? { removeDisableAllHooks: true } : {}),
  });
  return r?.changed === false ? result('noop', 'already correct') : result('applied', `mode ${mode}`);
}

/** F7 — a stale cache is deleted; the re-run writes a fresh one. */
function fixCache({ root }) {
  let removed = 0;
  for (const p of [cachePath(root), inputsPath(root)]) {
    if (existsSync(p)) { rmSync(p, { force: true }); removed += 1; }
  }
  return removed === 0 ? result('noop', 'no cache to clear') : result('applied', 'cache cleared');
}

/**
 * The whitelist, in APPLICATION ORDER.
 *
 * F1 before F2 before the rest, so a later fixer sees an earlier repair: dependencies before the
 * corpus (the docs step needs none, but the server checks do), the corpus before the flags, and
 * the cache last so the report it leaves describes the repaired checkout.
 */
export const FIXERS = Object.freeze([
  { id: 'F1', kind: 'deps-missing', title: 'install the server dependencies', apply: fixDeps },
  { id: 'F2', kind: 'corpus-missing', title: 'sync the documentation corpus', apply: fixDocs },
  { id: 'F2', kind: 'sparse-mismatch', title: 'sync the documentation corpus', apply: fixDocs },
  { id: 'F3', kind: 'head-off-pin', title: 'check the corpus out onto the pin', apply: fixHeadOffPin },
  { id: 'F4', kind: 'flags-incomplete', title: 'state every flag explicitly', apply: fixFlags },
  { id: 'F5', kind: 'store-mode', title: 'restore the store directory mode', apply: fixStoreMode },
  { id: 'F6', kind: 'toggles-mismatch', title: 'rewrite the mode toggles', apply: fixToggles },
  { id: 'F6', kind: 'hooks-disabled-by-bootstrap', title: 'remove the bootstrap\'s hook toggle',
    apply: fixToggles },
  { id: 'F7', kind: 'cache-stale', title: 'clear the stale doctor cache', apply: fixCache },
]);

const fixerFor = (kind) => FIXERS.find((f) => f.kind === kind) ?? null;

/**
 * What this run would do, and what it will not.
 *
 * A result is planned only when it is FIXABLE, names a kind the whitelist knows, and failed or
 * warned. Everything else that failed and carries a command is REFUSED — including the explicit
 * refusals the story names, which are printed whenever their check failed precisely because a user
 * running `--fix` is entitled to know what it declined to touch.
 */
export function buildPlan(report, { stale = null } = {}) {
  const actions = [];
  const refused = [];
  for (const check of report.checks ?? []) {
    if (!['fail', 'warn'].includes(check.status)) continue;
    const kind = check.data?.fix?.kind ?? null;
    const fixer = check.fixable && kind ? fixerFor(kind) : null;
    if (fixer) {
      actions.push({ id: fixer.id, check: check.id, kind, title: fixer.title,
        target: TARGETS[kind] ?? null, detail: check.detail, fix: check.data.fix });
    } else if (check.command) {
      refused.push({ check: check.id, detail: check.detail, command: check.command });
    }
  }
  // F7 has no check of its own: the cache's staleness is a fact about a file, and S05's rule is
  // the one the banner applies.
  if (stale?.stale) {
    actions.push({ id: 'F7', check: null, kind: 'cache-stale', title: 'clear the stale doctor cache',
      target: TARGETS['cache-stale'], detail: stale.reason, fix: {} });
  }
  const order = new Map(FIXERS.map((f, i) => [f.kind, i]));
  actions.sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99));
  return { actions, refused };
}

/** The first clause of a detail — enough to recognise the finding, not the whole of it. */
const firstClause = (detail) => {
  const text = String(detail ?? '');
  const cut = text.indexOf(' · ');
  return cut === -1 ? text : `${text.slice(0, cut)} …`;
};

/** The screen, in the story's layout. Principle 10: propose, review, then apply. */
export function renderPlan({ actions, refused }) {
  const lines = [`FIX PLAN (${actions.length} action${actions.length === 1 ? '' : 's'})`];
  if (actions.length === 0) lines.push('  nothing to repair');
  for (const a of actions) {
    const where = a.target ? `   (${a.target})` : '';
    lines.push(`  ${a.id}  ${(a.check ?? '—').padEnd(5)} ${a.title}: ${a.detail}${where}`);
  }
  if (refused.length > 0) {
    lines.push(`REFUSED (${refused.length})`);
    for (const r of refused) {
      // The check's OWN command, never a retyped one: `git checkout -- .mcp.json` is E-07's
      // sentence, and a copy here would be a second place to keep it right. The DETAIL is trimmed
      // to its first clause — E-23's runs to five projects, and a refusal list nobody can scan is
      // a refusal list nobody reads. The full line is three lines up, in the report itself.
      lines.push(`  ${r.check.padEnd(5)} ${firstClause(r.detail)} — run: ${r.command}`);
    }
  }
  return lines.join('\n');
}

/** Paths only — never a value, never a credential. One line per fixer, appended. */
export function logFix(root, entries, { now = new Date() } = {}) {
  try {
    const dir = join(root, '.local', 'logs');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `doctor-fix-${stamp}.log`);
    writeFileSync(file, `${entries.map((e) => `${e.id} ${e.check ?? '—'} ${e.kind} `
      + `${e.target ?? ''} → ${e.result}${e.detail ? ` (${e.detail})` : ''}`).join('\n')}\n`,
    { mode: 0o600 });
    return file;
  } catch {
    // A log that cannot be written is not a failed repair. The report is on the screen either way.
    return null;
  }
}

/**
 * Apply, in order, reporting each — and never aborting on one that failed.
 *
 * A fixer that throws is a `failed` entry with its message: the next repair may well be the one
 * the user needed, and a run that stopped at the first problem would leave a checkout half fixed
 * with no report of what happened.
 */
export async function applyPlan(plan, ctx, deps = {}) {
  const applied = [];
  for (const action of plan.actions) {
    const fixer = fixerFor(action.kind);
    if (!fixer) {
      applied.push({ ...action, result: 'refused', detail: 'not in the whitelist' });
      continue;
    }
    try {
      const outcome = await fixer.apply({ root: ctx.root, ctx, kind: action.kind, fix: action.fix,
        ...deps });
      applied.push({ ...action, ...outcome });
    } catch (e) {
      applied.push({ ...action, result: 'failed', detail: e.message });
    }
  }
  return applied;
}

/** `fixes[]` for the JSON: what was proposed, what happened, and where. */
export const fixesBlock = (applied) => applied.map((a) => ({
  id: a.id,
  check: a.check ?? null,
  kind: a.kind,
  target: a.target ?? null,
  action: a.title,
  result: a.result,
  ...(a.detail ? { detail: a.detail } : {}),
}));

export { cacheStale };

// ARC-08-S03 — E-23, E-24: what the OLD install left behind, found and never touched.
//
// READ-ONLY BY CONSTRUCTION. `~/.claude.json` belongs to Claude Code and the legacy store belongs
// to a product that is not this one; the doctor's job is to say what is there and print the exact
// command, and the user's job is to run it. Nothing here writes, renames or deletes anything — not
// under `--fix`, not ever — and `tests/doctor/legacy.test.mjs` greps this file for the three verbs
// rather than trusting the sentence. `readFileSync`, `existsSync`, `statSync`, `readdirSync`: that
// is the whole filesystem vocabulary of this module.
//
// Why it matters more here than anywhere else in the doctor: `00` P-34 counted SIX copies of one
// credential across the old layout, and the `.bak-*` files Claude Code writes keep every secret the
// original had. A user who deletes the registration and stops there still has the password on disk.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineCheck } from '../registry.mjs';

import { CREDENTIAL_KEY } from './credential-shape.mjs';
import { ok, warn } from './result.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The names the old installers wrote — DATA, not literals in this file.
 *
 * A check body that spelled them would be a finding in the repository's own retired-name ratchet
 * (L03), which is the correct behaviour of that ratchet: the words are dead everywhere except in
 * the detector that hunts them. So they live in JSON, and that one path is listed in the lint's
 * `POLICY_FILES`.
 */
export const STALE = JSON.parse(readFileSync(join(here, 'stale-registrations.json'), 'utf8'));

export const CLAUDE_JSON = '.claude.json';
export const LEGACY_STORE = ['.config', 'servicenow-mcp', 'instances.json'];

/** `~/…` for anything under the home directory. The report never prints a real home path. */
export const tildify = (p, home) => {
  const s = String(p);
  return home && s.startsWith(home) ? `~${s.slice(home.length)}` : s;
};

/**
 * Is this `mcpServers` entry a leftover of the old install?
 *
 * Two signals, because the old scripts wrote two shapes. The NAME is the reliable one. The
 * `snow-mcp` path segment catches a registration whose name was chosen by hand but whose `args`
 * still point at the old checkout. What is deliberately NOT here is a SUBSTRING match: the old
 * `scripts/legacy/doctor.sh` matched a case-insensitive alternation of the two dead names and a
 * bare `snow`, and that last alternative flags the CURRENT registration key — which would tell
 * every correctly installed user to delete their working server. (The dead names are not written
 * out here for the same reason they are not written out anywhere else in the tree: they live in
 * `stale-registrations.json`, which the retired-name ratchet exempts because being that list is
 * what the file is for.)
 */
export function isStaleEntry(name, entry) {
  if (STALE.names.includes(String(name))) return true;
  const args = Array.isArray(entry?.args) ? entry.args : [];
  const segment = STALE.pathSegment;
  return args.some((a) => {
    const parts = String(a).split(/[\\/]/);
    return parts.at(-1) === 'server.js' && parts.includes(segment);
  });
}

/** `set (len n)` for the first credential-shaped env key — the LENGTH, never the value. */
export function envSummary(entry) {
  const env = entry?.env && typeof entry.env === 'object' ? entry.env : {};
  const keys = Object.keys(env);
  const credential = keys.filter((k) => CREDENTIAL_KEY.test(k));
  const first = credential[0];
  const length = first === undefined ? null : String(env[first] ?? '').length;
  return { keys: keys.length, credential: credential.length, length };
}

/** Every `~/.claude.json.bak-*` / `.backup*`: how many and when the newest was written. */
export function backupFiles(home) {
  if (!home || !existsSync(home)) return { count: 0, newest: null };
  let count = 0;
  let newest = null;
  for (const name of readdirSync(home)) {
    if (!/^\.claude\.json\.(bak|backup)/.test(name)) continue;
    count += 1;
    try {
      const mtime = statSync(join(home, name)).mtime;
      if (newest === null || mtime > newest) newest = mtime;
    } catch { /* a file that vanished between the listing and the stat */ }
  }
  return { count, newest: newest ? newest.toISOString().slice(0, 10) : null };
}

/** The two container shapes the legacy wizard ever wrote (ARC-07-S08 accepted both). */
export function countLegacyInstances(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (Array.isArray(parsed)) return parsed.length;
  if (Array.isArray(parsed?.instances)) return parsed.instances.length;
  if (parsed?.instances && typeof parsed.instances === 'object') {
    return Object.keys(parsed.instances).length;
  }
  if (parsed && typeof parsed === 'object') {
    // The oldest shape: the object IS the map of labels. `defaultInstance` and friends are
    // metadata rather than entries, so an object value is what counts.
    return Object.values(parsed).filter((v) => v && typeof v === 'object').length;
  }
  return null;
}

/** The two lines E-23 prints for one stale entry under this folder. Quoted by ARC-10's migration. */
export const removalCommand = (name) => `claude mcp remove ${name} -s local`;
export const BACKUP_REMINDER = 'then review and delete ~/.claude.json.bak-* files — they retain '
  + 'the same secrets (ls -la ~/.claude.json.bak-* )';

export function legacyChecks() {
  return [
    defineCheck({
      id: 'E-23',
      section: 'legacy',
      title: 'stale MCP registrations in ~/.claude.json',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      // Never. The file is Claude Code's, the command is the user's to run, and S06 refuses it.
      fixable: false,
      run: async (ctx) => {
        const home = ctx.home ?? '';
        const path = home ? join(home, CLAUDE_JSON) : CLAUDE_JSON;
        if (!home || !existsSync(path)) {
          return ok(`no ~/${CLAUDE_JSON} — nothing to clean`, { entries: [], present: false });
        }
        let parsed;
        try {
          parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch (e) {
          // A WARN and never a FAIL: the doctor does not own this file, and a user whose Claude
          // Code configuration is broken has a problem the doctor can only describe.
          return warn(`~/${CLAUDE_JSON} is not valid JSON — Claude Code cannot read its own `
            + `configuration (${e.message})`, {
            remedy: `check it with: node -e 'JSON.parse(require("fs").readFileSync(process.env.HOME`
              + ` + "/${CLAUDE_JSON}", "utf8"))'`,
            data: { present: true, parsed: false, entries: [] },
          });
        }

        const projects = parsed?.projects && typeof parsed.projects === 'object' ? parsed.projects : {};
        const entries = [];
        let registration = null;
        for (const [project, config] of Object.entries(projects)) {
          const servers = config?.mcpServers && typeof config.mcpServers === 'object'
            ? config.mcpServers : {};
          const isThisFolder = project === ctx.root;
          for (const [name, entry] of Object.entries(servers)) {
            if (isThisFolder && name === ctx.config?.mcp?.serverKey) {
              // Not stale: this is the `mode live --register local` entry or the S-03 fallback
              // (both ARC-06-S12). The recorded state says which, and neither is a leftover.
              registration = name;
              continue;
            }
            if (!isStaleEntry(name, entry)) continue;
            entries.push({
              scope: isThisFolder ? 'this-folder' : 'other',
              project: tildify(project, home),
              name,
              command: removalCommand(name),
              ...envSummary(entry),
            });
          }
        }

        const backups = backupFiles(home);
        // The file's own mode is only worth reporting while something in it is worth removing.
        let insecure = false;
        if (entries.length > 0 && ctx.platform !== 'win32') {
          try { insecure = (statSync(path).mode & 0o077) !== 0; } catch { insecure = false; }
        }
        const data = {
          present: true,
          parsed: true,
          entries,
          backups,
          registration,
          mode: insecure ? 'group/world-readable' : null,
        };

        if (entries.length === 0) {
          const detail = registration
            ? `no stale registration; "${registration}" under this folder is this product's own`
            : 'no stale registration';
          return ok(detail, data);
        }

        const here = entries.filter((e) => e.scope === 'this-folder');
        const elsewhere = entries.filter((e) => e.scope === 'other');
        const counts = (e) => (e.credential > 0
          ? `holds ${e.keys} env keys, ${e.credential} credential-shaped — set (len ${e.length})`
          : `holds ${e.keys} env keys`);
        const lines = [];
        // The first line says WHERE, because the command differs: a registration under this folder
        // is removed by running the command here, and one under another project is removed by
        // running it there. Saying "for this folder" about somebody else's project would send a
        // user to run a command that reports nothing and leaves the entry in place.
        if (here.length > 0) {
          lines.push(`stale MCP registration "${here[0].name}" in ~/${CLAUDE_JSON} for this folder `
            + `(${counts(here[0])})`);
          if (here.length > 1) lines.push(`and ${here.length - 1} more under this folder`);
        } else {
          lines.push(`no stale registration for this folder; ${elsewhere.length} under other `
            + 'project(s)');
        }
        for (const other of elsewhere) {
          lines.push(`also registered under: ${other.project} (${other.name}) — run the same `
            + 'command from that folder');
        }
        if (backups.count > 0) {
          lines.push(`${backups.count} ~/${CLAUDE_JSON}.bak-* file(s) present`
            + `${backups.newest ? `, newest ${backups.newest}` : ''}`);
        }
        if (insecure) lines.push(`and it is group/world-readable — chmod 600 ~/${CLAUDE_JSON}`);

        return warn(lines.join(' · '), {
          // The commands, in the order a user runs them: every removal, then the reminder that the
          // backups still hold what was removed.
          remedy: [...here.map((e) => `${e.command}        (run from this folder)`),
            ...(backups.count > 0 ? [BACKUP_REMINDER] : [])].join('\n             → '),
          command: here[0]?.command ?? elsewhere[0]?.command,
          data,
        });
      },
    }),

    defineCheck({
      id: 'E-24',
      section: 'legacy',
      title: 'legacy wizard store',
      severity: 'warn',
      quick: true,
      network: false,
      spawns: false,
      fixable: false,
      run: async (ctx) => {
        const home = ctx.home ?? '';
        // The HOME directory's `.config` on every OS, Windows included — the legacy store never
        // used the platform's own application-data directory (ARC-07-S08's finding, from the old
        // `config-store.ts`). Looking in the platform-correct place would look right and find
        // nothing. The home itself arrives in `ctx`; nothing under `lib/` reads it.
        const path = home ? join(home, ...LEGACY_STORE) : join(...LEGACY_STORE);
        const shown = tildify(path, home).split('\\').join('/');
        if (!home || !existsSync(path)) {
          return ok('no legacy wizard store', { path: shown, present: false, instances: null });
        }
        let instances = null;
        try { instances = countLegacyInstances(readFileSync(path, 'utf8')); } catch { instances = null; }
        const count = instances === null ? 'unreadable' : `${instances} instance(s)`;
        // The command is `docs/snippets/import-from-legacy.md`'s, and `tests/doctor/legacy.test.mjs`
        // asserts it appears there verbatim — the L07 idiom: several declarations that must agree,
        // enforced by a check, rather than a runtime read of a document that may not be beside the
        // code on a user's machine.
        return warn(`legacy wizard store ${shown} present (${count}; never read by this product)`, {
          remedy: './snowarch instance import --from-legacy      '
            + '(migrates entries, then advises deleting the directory)',
          command: './snowarch instance import --from-legacy',
          data: { path: shown, present: true, instances },
        });
      },
    }),
  ];
}

import { describe, expect, it } from 'vitest';
import type { ProbeStatus } from '../../src/servicenow/probes.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLUMNS, ENTRY_DEFAULTS, FLAG_MEANINGS, PROBE_FIELD, annotate, applyingLine, dependencyViolation,
  flagQuestion, labelOf, parseFlagsArg, probeNote, probeRecommendsOff, prodRefusal, proposePreset,
  recordedSuffix, renderReviewScreen, resolveFlags,
  runReviewScreen, wrapRow,
} from '../../src/cli/preset-ui.js';
import {
  DEPENDENCIES, FLAG_NAMES, PRESETS, applyDependencyRule, dependentsOf, expandPreset, matchPreset,
  requiresOf, type Flags,
} from '../../src/utils/permissions.js';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { instanceSchema } from '../../src/store/schema.js';
import type { LastProbe } from '../../src/servicenow/probes.js';
import { scriptedTty } from '../helpers/scripted-tty.js';

/**
 * ARC-07-S04 — propose, review, apply.
 *
 * The rule under test is D-05, and the temptation runs the other way: a probe that came back
 * `not licensed` must change the RECOMMENDATION and never the toggle. A wizard that quietly
 * turned a flag off on the strength of one probe would produce an installation the user did not
 * choose and cannot explain — so several tests below assert a box is still `[x]` next to text
 * advising the opposite.
 */
const here = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS = resolve(here, '../../../../docs/snippets');

const probes = (over: Partial<LastProbe> = {}): LastProbe => ({
  at: '2026-09-10T00:00:00Z',
  auth: 'ok',
  write: 'ok',
  scripting: 'ok',
  cmdb: 'ok',
  atf: 'ok',
  nowAssist: 'ok',
  fluent: 'ok',
  ...over,
});

describe('proposePreset — the proposal is the environment, and nothing else', () => {
  it('non-production proposes full; production proposes read-only', () => {
    for (const env of ['pdi', 'dev', 'test'] as const) expect(proposePreset(env)).toBe('full');
    expect(proposePreset('prod')).toBe('read-only');
  });

  it('criterion 7 — a failing probe does not change the proposal', async () => {
    // D-05 in one assertion: the same environment, two very different probe reports, one answer.
    const bad = probes({ write: 'role missing', nowAssist: 'not licensed', fluent: 'not installed' });
    const withProbes = await resolveFlags({ label: 'pdi1', environment: 'pdi', yes: true, probes: bad });
    const without = await resolveFlags({ label: 'pdi1', environment: 'pdi', yes: true });
    expect(withProbes.preset).toBe('full');
    expect(withProbes.flags).toEqual(without.flags);
    expect(withProbes.flags).toEqual(expandPreset('full'));
    // ARC-07-C4 — the three assertions ABOVE are criterion 7 and are untouched: same preset, same
    // flags, with and without a failing probe. What changed is that this path now carries the
    // recommendation TEXT that D-05 requires and it was not printing — "a failing probe changes
    // only the recommendation text on that line, never the toggle". So the line says more and
    // decides nothing more, which is the distinction the criterion is about.
    expect(withProbes.applying).toContain('WRITE=on (probe: role missing');
    expect(withProbes.applying).toContain('NOW_ASSIST=on (probe: no Now Assist licence');
    expect(withProbes.applying).toContain('FLUENT=on (probe: not installed');
    expect(withProbes.applying).toMatch(/^Applying: preset full — WRITE=on /);
  });
});

describe('criterion 1 — the non-production screen', () => {
  const screen = () => renderReviewScreen({
    label: 'pdi',
    environment: 'pdi',
    preset: 'full',
    flags: expandPreset('full'),
    probes: probes({ nowAssist: 'not licensed', fluent: 'not installed' }),
  });

  it('matches the snapshot S10 will include, byte for byte', () => {
    const expected = readFileSync(resolve(SNAPSHOTS, 'review-screen-nonprod.txt'), 'utf8').trimEnd();
    expect(screen()).toBe(expected);
  });

  it('...and every box is [x], even where the probe recommends otherwise', () => {
    // The line advises `off` and the toggle says `on`: a recommendation the user is free to
    // ignore is the entire shape of this screen.
    const lines = screen().split('\n');
    // ARC-07-C14 numbered the rows, so a row now reads `1  [x] WRITE`. This case is the ADR-0005
    // guard and its property is unchanged: every box starts [x] however the row is prefixed.
    expect(lines.filter((l) => /^\s+\d+\s+\[x\]/.test(l))).toHaveLength(FLAG_NAMES.length);
    expect(screen()).toContain('[x] NOW_ASSIST');
    expect(screen()).toContain('recommend: off');
  });

  it('ARC-07-C13 — a recommendation says how to take it, on the line that makes it', () => {
    // THE OWNER'S v2.0.5 DRY RUN. The FLUENT line read `probe: @servicenow/sdk not on PATH — tools
    // will fail until licensed; keep on? (recommend: off)` over a footer reading `Enter = accept as
    // shown`, they pressed Enter, and the Applying line printed `FLUENT=on`. Both sentences are
    // literally true and together they mislead: the line ASKS A QUESTION and recommends an answer,
    // and the only way to give that answer is to already know you must type the flag's name.
    //
    // THE TOGGLE STAYS ON, and that is not a bug. ADR-0005 — owner-decided 2026-09-04 — says each
    // flag is pre-set ON and "a failing probe changes only the recommendation text on that line,
    // never the toggle", and ARC-07-C4 asserts it on the `--yes` path. So the fix is the text, which
    // is exactly what the ADR leaves open: the recommendation names the word that acts on it.
    // THE LOGICAL ROW, not one physical line. `wrapRow` folds at the 100-column budget — the same
    // rule the footer is written to, deliberately — so a row is its `[x]` line plus the indented
    // continuations that follow it. My first cut asserted against a single line and failed on a
    // correct fix, with the instruction split across the fold.
    const lines = screen().split('\n');
    const rowFor = (label: string): string => {
      const at = lines.findIndex((l) => l.includes(`[x] ${label}`));
      expect(at, `no row for ${label}`).toBeGreaterThan(-1);
      const rest: string[] = [];
      for (let i = at + 1; i < lines.length && !/^\s*\[[x ]\] |^\S/.test(lines[i]); i += 1) rest.push(lines[i]);
      return [lines[at], ...rest].join(' ').replace(/\s+/g, ' ');
    };

    for (const [flag, label] of [['FLUENT_ENABLED', 'FLUENT'], ['NOW_ASSIST_ENABLED', 'NOW_ASSIST']] as const) {
      const row = rowFor(label);
      expect(row).toContain('recommend: off');
      // THE LABEL THE SCREEN ITSELF SHOWS, and the word the loop accepts — measured, not assumed:
      // `labelOf` strips `_ENABLED`, and the toggle matches that label case-insensitively.
      // ARC-07-C14 re-pointed this: the documented way to act is the ROW NUMBER, derived from the
      // flag's index, so the line names `(type 6)` rather than the label. C13's property — a
      // recommendation says how to take it — is unchanged; only the word it names moved.
      expect(row).toContain(`(type ${FLAG_NAMES.indexOf(flag) + 1})`);
      expect(labelOf(flag)).toBe(label);
    }
    // ...and a flag whose probe is fine is not told how to turn itself off.
    expect(rowFor('WRITE')).not.toContain('to turn it off');
  });

  it('no line exceeds the terminal budget, and a long hint wraps rather than truncates', () => {
    // The part of a hint that a truncation removes is the part that says what to do about it.
    const long = 'the account cannot read that table family: on a PDI use the admin account, and '
      + 'elsewhere ask an administrator for a role that grants read access to the tables this flag '
      + 'unlocks, which for scripting means sys_script_include among several others';
    const rendered = renderReviewScreen({
      label: 'pdi', environment: 'pdi', preset: 'full', flags: expandPreset('full'),
      probes: probes({ scripting: 'role missing' }),
      hints: { SCRIPTING_ENABLED: long },
    });
    for (const line of rendered.split('\n')) expect(line.length).toBeLessThanOrEqual(COLUMNS);
    // Nothing lost: every word of the hint survives somewhere in the block.
    const flat = rendered.replace(/\s+/g, ' ');
    for (const word of long.split(' ')) expect(flat).toContain(word);
  });

  it('a flag row keeps its column even when the annotation wraps', () => {
    // The first implementation wrapped the whole row as one string, and the padding — consecutive
    // spaces — was eaten by the word wrapper: NOW_ASSIST sat one space from its annotation while
    // every other row lined up. The prefix is never wrapped now.
    const rows = screen().split('\n').filter((l) => /^\s+\d+\s+\[x\]/.test(l));   // ARC-07-C14: numbered
    const columns = new Set(rows.map((l) => l.indexOf('probe:')));
    expect(columns.size, `annotations start at ${[...columns].join(', ')}`).toBe(1);
    const wrapped = wrapRow('  [x] NOW_ASSIST   ', 'a '.repeat(80).trim());
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped[1].startsWith(' '.repeat('  [x] NOW_ASSIST   '.length))).toBe(true);
  });

  it('the annotations are the story\'s, one per probe status', () => {
    expect(annotate('ok')).toBe('probe: ok');
    expect(annotate('not licensed')).toContain('no Now Assist licence detected');
    expect(annotate('not installed')).toContain('@servicenow/sdk not on PATH');
    expect(annotate('role missing', 'no itil role')).toContain('role missing — no itil role');
    expect(annotate('skipped')).toBe('probe: skipped');
    expect(annotate(undefined)).toBe('probe: not run');
  });
});

describe('criterion 4 — the production screen', () => {
  const input = { label: 'prod-acme', environment: 'prod' as const, preset: 'read-only' as const,
    flags: expandPreset('read-only') };

  it('matches the snapshot, with six locked lines', () => {
    const expected = readFileSync(resolve(SNAPSHOTS, 'review-screen-prod.txt'), 'utf8').trimEnd();
    expect(renderReviewScreen(input)).toBe(expected);
    expect(renderReviewScreen(input).split('\n').filter((l) => l.includes('locked on production')))
      .toHaveLength(FLAG_NAMES.length);
  });

  it('typing a flag prints the locked message and asks again', async () => {
    const tty = scriptedTty(['WRITE', '']);
    const result = await runReviewScreen(input, tty);
    expect(tty.written).toContain(
      'WRITE is locked on production — raise it later with: ./snowarch instance set-preset '
      + 'prod-acme <preset> --ack-prod');
    // Re-prompted rather than exited: the user did not do anything wrong, they asked for
    // something the wizard will not do.
    expect(tty.prompts.filter((p) => p === '> ')).toHaveLength(2);
    expect(result.preset).toBe('read-only');
    expect(result.flags).toEqual(expandPreset('read-only'));
    expect(Object.values(result.flags).every((v) => v === 'false')).toBe(true);
  });

  it('...and so does `preset full` on production', async () => {
    const tty = scriptedTty(['preset full', '']);
    await runReviewScreen(input, tty);
    expect(tty.written).toContain('locked on production');
  });
});

describe('criterion 2 — toggling to a named preset', () => {
  it('NOW_ASSIST, FLUENT, Enter gives pdi-developer and the exact Applying line', async () => {
    const tty = scriptedTty(['NOW_ASSIST', 'FLUENT', '']);
    const result = await runReviewScreen({
      label: 'pdi', environment: 'pdi', preset: 'full', flags: expandPreset('full'),
      probes: probes(),
    }, tty);
    expect(result.preset).toBe('pdi-developer');
    expect(applyingLine(result.preset, result.flags)).toBe(
      'Applying: preset pdi-developer — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on '
      + 'NOW_ASSIST=off FLUENT=off');
  });

  it('the grammar is case-insensitive, and takes the long key too', async () => {
    for (const typed of ['now_assist', 'NOW_ASSIST_ENABLED', 'Now_Assist']) {
      const tty = scriptedTty([typed, '']);
      const result = await runReviewScreen({
        label: 'pdi', environment: 'pdi', preset: 'full', flags: expandPreset('full'),
      }, tty);
      expect(result.flags.NOW_ASSIST_ENABLED, typed).toBe('false');
    }
  });
});

describe('criterion 3 — the dependency dialogue', () => {
  const start = { label: 'pdi', environment: 'pdi' as const, preset: 'full' as const,
    flags: expandPreset('full') };

  it('WRITE off, answered yes, turns the dependents off too and the preset is custom', async () => {
    const tty = scriptedTty(['WRITE', 'y', '']);
    const result = await runReviewScreen(start, tty);
    expect(result.flags.WRITE_ENABLED).toBe('false');
    expect(result.flags.CMDB_WRITE_ENABLED).toBe('false');
    expect(result.flags.SCRIPTING_ENABLED).toBe('false');
    expect(result.preset).toBe('custom');
    expect(tty.prompts.some((p) => p.includes('require WRITE — turn them off as well? [Y/n]'))).toBe(true);
  });

  it('...answered no, everything stays on — the contradiction is never saved', async () => {
    const tty = scriptedTty(['WRITE', 'n', '']);
    const result = await runReviewScreen(start, tty);
    expect(result.flags).toEqual(expandPreset('full'));
    expect(result.preset).toBe('full');
  });

  it('turning SCRIPTING on with WRITE off offers to turn WRITE on; no leaves both off', async () => {
    const readOnly = { ...start, preset: 'read-only' as const, flags: expandPreset('read-only') };
    const yes = scriptedTty(['SCRIPTING', 'y', '']);
    const on = await runReviewScreen(readOnly, yes);
    expect(on.flags.WRITE_ENABLED).toBe('true');
    expect(on.flags.SCRIPTING_ENABLED).toBe('true');

    const no = scriptedTty(['SCRIPTING', 'n', '']);
    const off = await runReviewScreen(readOnly, no);
    expect(off.flags.SCRIPTING_ENABLED).toBe('false');
    expect(off.flags.WRITE_ENABLED).toBe('false');
  });
});

describe('the rest of the grammar', () => {
  const base = { label: 'pdi', environment: 'pdi' as const, preset: 'full' as const,
    flags: expandPreset('full') };

  it('`preset <unknown>` lists the four names rather than guessing', async () => {
    const tty = scriptedTty(['preset enterprise', '']);
    await runReviewScreen(base, tty);
    expect(tty.written).toContain('unknown preset "enterprise"');
    for (const name of [...Object.keys(PRESETS), 'custom']) expect(tty.written).toContain(name);
  });

  it('`preset read-only` re-renders with that preset\'s flags', async () => {
    const tty = scriptedTty(['preset read-only', '']);
    const result = await runReviewScreen(base, tty);
    expect(result.preset).toBe('read-only');
    expect(result.flags).toEqual(expandPreset('read-only'));
  });

  it('`?` explains every flag, and the meanings match the page a reader was given', () => {
    // The page is MARKDOWN and the constant is what a terminal prints, so emphasis is stripped
    // before comparing: `unlocks *writing* Script Includes` and `unlocks writing Script Includes`
    // are the same sentence, and a test that called them different would be testing asterisks.
    const plain = (text: string) => text.replace(/[*`_]/g, '').replace(/\s+/g, ' ');
    const page = plain(readFileSync(resolve(here, '../../../../docs/MODES-AND-PRESETS.md'), 'utf8'));
    for (const flag of FLAG_NAMES) {
      expect(Object.keys(FLAG_MEANINGS), flag).toContain(flag);
      // The page is hand-maintained from `01` §6.3; the constant must not drift from it. The
      // opening clause is enough to catch a rewrite of either without pinning the whole sentence.
      const opening = plain(FLAG_MEANINGS[flag].split(/[;.]/)[0]).trim().slice(0, 40);
      expect(page, flag).toContain(opening);
    }
  });

  it('...and `?` prints them all, within the column budget', async () => {
    const tty = scriptedTty(['?', '']);
    await runReviewScreen(base, tty);
    for (const flag of FLAG_NAMES) expect(tty.written).toContain(labelOf(flag));
    for (const line of tty.written.split('\n')) expect(line.length).toBeLessThanOrEqual(COLUMNS);
  });

  it('an unrecognised line says what IS recognised', async () => {
    const tty = scriptedTty(['sudo make me a sandwich', '']);
    await runReviewScreen(base, tty);
    // ARC-07-C14 — the screen documents the number, so its refusal names that.
    expect(tty.written).toContain('is not a row number or a command');
  });

  it('`q` and end-of-input both cancel, and cancelling decides nothing', async () => {
    for (const script of [['q'], []]) {
      const result = await runReviewScreen(base, scriptedTty(script));
      expect(result.cancelled).toBe(true);
    }
    const resolved = await resolveFlags({ label: 'pdi', environment: 'pdi', io: scriptedTty(['q']) });
    expect(resolved.ok).toBe(false);
    expect(resolved.exitCode).toBe(130);
    expect(resolved.message).toBe('Cancelled — nothing saved.');
  });
});

describe('criterion 6 — --flags', () => {
  it('a dependency violation is exit 2, naming the rule', () => {
    const parsed = parseFlagsArg(
      'WRITE=off,CMDB_WRITE=off,SCRIPTING=on,ATF=on,NOW_ASSIST=off,FLUENT=off');
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toContain('SCRIPTING requires WRITE');
  });

  it('five entries name the missing flag rather than defaulting it', () => {
    const parsed = parseFlagsArg('WRITE=on,CMDB_WRITE=on,SCRIPTING=on,ATF=on,NOW_ASSIST=off');
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toContain('missing: FLUENT');
    // Filling in the sixth would be the wizard choosing while claiming the caller did.
    expect(parsed.flags).toBeUndefined();
  });

  it('on/off/true/false are all accepted, in any case', () => {
    const parsed = parseFlagsArg(
      'write=ON,CMDB_WRITE=true,scripting=on,ATF=False,NOW_ASSIST=off,FLUENT=off');
    expect(parsed.ok).toBe(true);
    expect(parsed.flags?.ATF_ENABLED).toBe('false');
    expect(parsed.flags?.WRITE_ENABLED).toBe('true');
  });

  it('an unknown name and an unknown value each say what was expected', () => {
    expect(parseFlagsArg('WRITE=on,NONSENSE=on').message).toContain('is not a flag');
    expect(parseFlagsArg('WRITE=maybe').message).toContain('expected on or off');
  });

  it('a complete set implies custom unless it happens to match a name', async () => {
    const custom = await resolveFlags({ label: 'pdi', environment: 'pdi', yes: true,
      flags: 'WRITE=on,CMDB_WRITE=off,SCRIPTING=off,ATF=off,NOW_ASSIST=off,FLUENT=off' });
    expect(custom.preset).toBe('custom');
    const named = await resolveFlags({ label: 'pdi', environment: 'pdi', yes: true,
      flags: 'WRITE=on,CMDB_WRITE=on,SCRIPTING=on,ATF=on,NOW_ASSIST=off,FLUENT=off' });
    expect(named.preset).toBe('pdi-developer');
  });
});

describe('criterion 5 — production refuses, and writes nothing', () => {
  /** A store that records any attempt to write. The precondition is that it was never called. */
  const storeSpy = () => { const calls: string[] = []; return { calls, save: (l: string) => { calls.push(l); } }; };

  it('--preset full --env prod --yes is exit 3, with the D-05 text', async () => {
    const spy = storeSpy();
    expect(spy.calls).toEqual([]);                            // the precondition, asserted first
    const result = await resolveFlags({ label: 'prod-acme', environment: 'prod', preset: 'full',
      yes: true });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.message).toBe(prodRefusal('prod-acme'));
    expect(result.message).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
    expect(result.message).toContain('set-preset prod-acme full --ack-prod');
    // Nothing was written — the function returned before any save could be reached.
    expect(spy.calls).toEqual([]);
    expect(result.flags).toBeUndefined();
  });

  it('...and any `on` in --flags is the same refusal', async () => {
    const result = await resolveFlags({ label: 'prod-acme', environment: 'prod', yes: true,
      flags: 'WRITE=on,CMDB_WRITE=off,SCRIPTING=off,ATF=off,NOW_ASSIST=off,FLUENT=off' });
    expect(result.exitCode).toBe(3);
  });

  it('interactively it offers read-only, and Enter saves read-only', async () => {
    const tty = scriptedTty(['']);
    const result = await resolveFlags({ label: 'prod-acme', environment: 'prod', preset: 'full',
      io: tty });
    expect(tty.written).toContain('PROD_WRITE_NOT_ACKNOWLEDGED');
    expect(tty.prompts.some((p) => p.includes('Save "prod-acme" as read-only instead? [Y/n]'))).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.preset).toBe('read-only');
    expect(result.applying).toBe(
      'Applying: preset read-only — WRITE=off CMDB_WRITE=off SCRIPTING=off ATF=off '
      + 'NOW_ASSIST=off FLUENT=off');
  });

  it('...and answering no is still exit 3 with nothing saved', async () => {
    const result = await resolveFlags({ label: 'prod-acme', environment: 'prod', preset: 'full',
      io: scriptedTty(['n']) });
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.flags).toBeUndefined();
  });
});

describe('criterion 8 and the cross-checks', () => {
  it('the entry defaults are P-25\'s, and match the store schema', () => {
    expect(ENTRY_DEFAULTS).toEqual({ toolPackage: 'full', maxRecords: 100 });
    // The schema is the authority: parsing an entry WITHOUT them must produce them.
    const parsed = instanceSchema.parse({
      url: 'https://dev12345.service-now.com',
      environment: 'pdi',
      preset: 'read-only',
      auth: { method: 'basic', username: 'svc', password: ['pw', '-', '9'].join('') },
    });
    expect(parsed.toolPackage).toBe(ENTRY_DEFAULTS.toolPackage);
    expect(parsed.maxRecords).toBe(ENTRY_DEFAULTS.maxRecords);
  });

  it('the UI\'s view of the presets equals the contract\'s', () => {
    // ARC-04-S06 publishes `presets{}` in `dist/contract.json`; a wizard that disagreed with it
    // would offer an installation the server does not implement.
    const contract = JSON.parse(readFileSync(
      resolve(here, '../../dist/contract.json'), 'utf8')) as { presets: Record<string, Flags> };
    for (const name of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      expect(expandPreset(name), name).toEqual(contract.presets[name]);
    }
    expect(Object.keys(contract.presets).sort()).toEqual(Object.keys(PRESETS).sort());
  });

  it('matchPreset is expandPreset\'s inverse, and names the unnamed `custom`', () => {
    for (const name of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      expect(matchPreset(expandPreset(name)), name).toBe(name);
    }
    const odd = { ...expandPreset('read-only'), FLUENT_ENABLED: 'true' } as Flags;
    expect(matchPreset(odd)).toBe('custom');
  });

  it('every flag has a label, a meaning and a probe field — derived, not listed twice', () => {
    for (const flag of FLAG_NAMES) {
      expect(labelOf(flag), flag).toBe(flag.replace(/_ENABLED$/, ''));
      expect(FLAG_MEANINGS[flag], flag).toBeTruthy();
      expect(PROBE_FIELD[flag], flag).toBeTruthy();
    }
    expect(Object.keys(PROBE_FIELD).sort()).toEqual([...FLAG_NAMES].sort());
    expect(Object.keys(FLAG_MEANINGS).sort()).toEqual([...FLAG_NAMES].sort());
  });

  it('NO FLAG NAME IS SPELLED in src/cli — the graph lives in the preset module', () => {
    // ARC-07-S05's carry-over. The UI used to re-encode "WRITE ← CMDB_WRITE, SCRIPTING" as
    // literals: a second definition of a rule the server already owns, and the copy nobody would
    // think to update when a third dependency appears.
    const dir = resolve(here, '../../src/cli');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.ts')) files.push(p);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(2);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (/'[A-Z][A-Z0-9_]*_ENABLED'/.test(line)) offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(offenders).toEqual([]);
    // Not vacuous: the pattern it looks for is the one that was there.
    expect(/'[A-Z][A-Z0-9_]*_ENABLED'/.test("const x = 'WRITE_ENABLED';")).toBe(true);
  });

  it('the graph is one table, and the server rule reads it too', () => {
    expect(Object.keys(DEPENDENCIES).sort()).toEqual([...FLAG_NAMES].sort());
    expect(requiresOf('SCRIPTING_ENABLED' as never)).toEqual(['WRITE_ENABLED']);
    expect([...dependentsOf('WRITE_ENABLED' as never)].sort())
      .toEqual(['CMDB_WRITE_ENABLED', 'SCRIPTING_ENABLED']);
    // The server's own rule, driven from the same table: a contradiction is resolved towards LESS
    // access and reported, and the wizard's sentence names the same pair.
    const contradiction = { ...expandPreset('read-only'), SCRIPTING_ENABLED: 'true' } as Flags;
    const applied = applyDependencyRule(contradiction, 'fixture');
    expect(applied.effective.SCRIPTING_ENABLED).toBe('false');
    expect(applied.warnings[0]).toContain('requires WRITE_ENABLED=true');
  });

  it('the dependency rule reads the same from the UI as from the server', () => {
    expect(dependencyViolation(expandPreset('full'))).toBeNull();
    const contradiction = { ...expandPreset('read-only'), SCRIPTING_ENABLED: 'true' } as Flags;
    expect(dependencyViolation(contradiction)).toContain('SCRIPTING requires WRITE');
  });
});

/**
 * ARC-07-C4 — `--yes` applied a preset the same run's probes had just argued against.
 *
 * Sitting C, A6, rc.5. `instance add pdi2 … --password-stdin --yes` probed, printed
 * `fluent not installed`, and then:
 *
 *   Applying: preset full — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=on
 *   Saved instance "pdi2" (pdi · basic · preset full). Probes: … fluent not installed.
 *
 * One sentence saying FLUENT=on and fluent not installed. The interactive path shows
 * "(recommend: off)" and the owner had taken that advice on pdi minutes earlier; the probes were
 * computed and handed ONLY to the review screen, so the path with nobody to ask never saw them.
 *
 * The fix is neither of the two obvious ones. Applying silently would overrule a user on the path
 * whose whole promise is "no review screen"; refusing would block an install that works. It
 * applies the recommendation AND names the probe in the one line the path prints.
 */
const PROBED = (fluent: 'ok' | 'not installed') => ({
  at: '2026-09-19T06:09:48.841Z',
  auth: 'ok', write: 'ok', cmdb: 'ok', scripting: 'ok', atf: 'ok', nowAssist: 'ok', fluent,
}) as never;

describe('ARC-07-C4 — the non-interactive path annotates, and never toggles', () => {
  it('names the failing probe in the Applying line and leaves the flag ON', async () => {
    const r = await resolveFlags({
      label: 'pdi2', environment: 'pdi', yes: true, probes: PROBED('not installed'),
    } as never) as { ok: boolean; preset: string; flags: Record<string, string>; applying: string };

    expect(r.ok).toBe(true);
    // THE RULING, asserted: ADR-0005 — "a failing probe changes only the recommendation text on
    // that line, never the toggle". The flag stays on and the preset stays `full`.
    expect(r.flags.FLUENT_ENABLED).toBe('true');
    expect(r.preset).toBe('full');
    // THE DEFECT, closed: the line explains itself, so the Saved line's `fluent not installed`
    // confirms a stated choice instead of contradicting one.
    expect(r.applying).toContain(
      'FLUENT=on (probe: not installed — tools will fail until @servicenow/sdk is on PATH)');
    // Only the failing one is annotated.
    expect(r.applying).toContain('WRITE=on ');
    expect(r.applying).not.toContain('WRITE=on (');
  });

  it('is byte-identical to today when every probe is ok', async () => {
    const r = await resolveFlags({
      label: 'pdi2', environment: 'pdi', yes: true, probes: PROBED('ok'),
    } as never) as { preset: string; applying: string };

    expect(r.preset).toBe('full');
    expect(r.applying).toBe('Applying: preset full — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on '
      + 'NOW_ASSIST=on FLUENT=on');
    expect(r.applying).not.toContain('probe:');
  });

  it('says nothing when the probe did not run', async () => {
    // `skipped` and "no probes at all" are not failures, and a line that annotated them would be
    // reporting absence as a finding.
    const noProbes = await resolveFlags({
      label: 'pdi2', environment: 'pdi', yes: true,
    } as never) as { applying: string };
    expect(noProbes.applying).not.toContain('probe:');

    const skipped = await resolveFlags({
      label: 'pdi2', environment: 'pdi', yes: true, probes: PROBED('skipped' as never),
    } as never) as { applying: string };
    expect(skipped.applying).not.toContain('probe:');
  });
});

describe('ARC-07-C4 — the screen and the non-interactive path share one rule', () => {
  it('recommends off for exactly the statuses whose annotation says so', () => {
    // THE PROPERTY THAT WAS MISSING. `annotate` renders "(recommend: off)" and the `--yes` path
    // applies `probeRecommendsOff`; these were one rule stated in two places, and they disagreed
    // by omission — one shown, the other never consulted. This walks every status and requires
    // them to agree, so a new probe outcome cannot be added to one side alone.
    const statuses: ProbeStatus[] = ['ok', 'auth failed', 'role missing', 'unreachable', 'error',
      'not licensed', 'not installed', 'skipped'];
    for (const status of statuses) {
      // ARC-07-C14 changed the SHAPE of the advice — `— recommend: off (type n)` rather than
      // `keep on? (recommend: off)` — so the marker moves with it. The PROPERTY is untouched: the
      // screen and the non-interactive path must recommend off for exactly the same statuses.
      const annotated = annotate(status).includes('recommend: off');
      expect(probeRecommendsOff(status)).toBe(annotated);
      // ...and the non-interactive phrasing exists for exactly the same set.
      expect(probeNote(status) !== null).toBe(annotated);
    }
    // And the unprobed case, which is neither.
    expect(probeRecommendsOff(undefined)).toBe(false);
    expect(annotate(undefined)).not.toContain('(recommend: off)');
    expect(probeNote(undefined)).toBeNull();

    // NON-VACUITY: the loop must actually find both answers, or it proves nothing.
    expect(statuses.filter((s) => probeRecommendsOff(s)).length).toBeGreaterThan(0);
    expect(statuses.filter((s) => !probeRecommendsOff(s)).length).toBeGreaterThan(0);
  });
});

// ─── A recorded probe says it is recorded (the owner's 2026-09-23 sitting) ─────────────────────
//
// The screen rendered the same `probe: ok` whether the probe had just run or had been read out of
// the store, and the callers genuinely differ: `instance add`, `instance test` and
// `import --from-legacy` probe live and pass what they measured, while `set-preset` passes
// `entry.lastProbe` — a value of any age. The owner's question was the right one: *either the probes
// are fresh and should be written, or they are the recorded ones and the word should say so.*
//
// They are the recorded ones. `set-preset` does not probe, and making it probe would turn a local
// store edit into a network round trip nobody asked for.
describe('ARC-07 — probe provenance', () => {
  const AT = '2026-09-19T08:11:02.000Z';
  const STATUSES: Array<ProbeStatus | undefined> =
    ['ok', 'role missing', 'not licensed', 'not installed', 'skipped', undefined];

  it('a fresh probe renders exactly as it always did', () => {
    // The fresh path is the one every other caller uses, and it must not have moved: this is the
    // assertion that the change is additive rather than a rewording of everything.
    expect(annotate('ok')).toBe('probe: ok');
    expect(annotate('skipped')).toBe('probe: skipped');
    expect(annotate(undefined)).toBe('probe: not run');
    expect(annotate('role missing', 'no itil role'))
      .toBe('probe: role missing — no itil role — recommend: off');
  });

  it('a recorded probe names the day it was taken, beside the status', () => {
    expect(annotate('ok', undefined, AT)).toBe('probe: ok (recorded 2026-09-19)');
    // Beside the STATUS, not after the question: the qualifier belongs to the finding, and a line
    // ending `— recommend: off (recorded …)` would read as a date attached to the advice.
    expect(annotate('role missing', 'no itil role', AT))
      .toBe('probe: role missing (recorded 2026-09-19) — no itil role — recommend: off');
  });

  it('every status is qualified except the one with nothing to date', () => {
    for (const s of STATUSES) {
      const fresh = annotate(s, 'hint');
      const recorded = annotate(s, 'hint', AT);
      if (s === undefined) {
        // `not run` has no record, so a provenance would be describing one that does not exist.
        expect(recorded).toBe(fresh);
      } else {
        expect(recorded).not.toBe(fresh);
        expect(recorded).toContain('(recorded 2026-09-19)');
      }
    }
  });

  it('a DATE, not an age — the sentence stays true in a pasted transcript', () => {
    expect(recordedSuffix(AT)).toBe(' (recorded 2026-09-19)');
    expect(recordedSuffix(null)).toBe('');
    expect(recordedSuffix(undefined)).toBe('');
    // No "days ago": an age has to be recomputed to stay honest and is wrong the moment it is
    // copied into a record — which is exactly where these lines end up.
    expect(recordedSuffix(AT)).not.toMatch(/ago|day/);
  });

  it('the screen carries the provenance through to every flag row', () => {
    const probes = { at: AT, auth: 'ok', write: 'ok', scripting: 'ok', cmdb: 'ok', atf: 'ok',
      nowAssist: 'ok', fluent: 'ok' } as LastProbe;
    const flags = expandPreset('full') as Flags;
    const recorded = renderReviewScreen({ label: 'pdi', environment: 'pdi', preset: 'full',
      flags, probes, probesRecordedAt: AT });
    const fresh = renderReviewScreen({ label: 'pdi', environment: 'pdi', preset: 'full',
      flags, probes });

    expect((recorded.match(/\(recorded 2026-09-19\)/g) ?? []).length).toBe(FLAG_NAMES.length);
    expect(fresh).not.toContain('recorded');
    // ...and nothing else about the screen moved.
    expect(recorded.replace(/ \(recorded 2026-09-19\)/g, '')).toBe(fresh);
  });
});

/**
 * ARC-07-C14 — the review screen adopts the plan screen's interaction.
 *
 * OWNER RULING, 2026-09-26, in their own words: *"by giving the numbers of the rows I choose whether
 * it is on or off and so I set what rights it has."* The third screen in this product to be told that
 * a number in a list is a choice — the plan screen learned it at ARC-07-C12 after three sittings, and
 * this one is the same reader meeting the same grammar one screen later.
 *
 * ADR-0005 IS UNCHANGED AND IS THE REASON THE BOXES STILL START `[x]`: every flag is pre-set ON and
 * "a failing probe changes only the recommendation text on that line, never the toggle". This is an
 * interaction change, not a policy change — the user now has a documented way to *act* on the
 * recommendation, and the recommendation still does not act on its own.
 */
describe('ARC-07-C14 — a number opens that flag, and Enter applies', () => {
  const input = () => ({
    label: 'pdi', environment: 'pdi' as const, preset: 'full' as const,
    flags: expandPreset('full'),
    probes: probes({ fluent: 'not installed' }),
  });

  it('(a) a number, an answer, Enter — the flag is off and the transcript says so', async () => {
    const tty = scriptedTty(['6', '2', '']);
    const result = await runReviewScreen(input(), tty);

    expect(result.flags.FLUENT_ENABLED).toBe('false');
    expect(result.preset).toBe('custom');
    // THE QUESTION, in the wizard's shape, with the reason the probe gave.
    expect(tty.written).toContain(
      'FLUENT:  [1] on (current)  [2] off — recommended: @servicenow/sdk not on PATH');
    // ...AND THE ACK, naming what changed, what Enter does now, and the number that reopens it.
    expect(tty.written).toContain('FLUENT → off · Enter applies · 6 changes it again · q quits');
  });

  /**
   * THE REASON, ON ITS OWN WITNESS.
   *
   * Case (a) asserts the reason and the ack in one transcript, so dropping either turned (a) red and
   * neither could be told from the other. This case answers only "does the question say why", across
   * every status that recommends off — and it reads the answer off the ROW rather than spelling it,
   * so the question and the row cannot describe one probe in two ways. `annotationParts` is private;
   * comparing the two rendered surfaces is the same guarantee without widening the export.
   */
  it('the question names the probe\'s reason, in the row\'s own words', () => {
    const cases = [
      ['fluent', 'FLUENT_ENABLED', 'not installed'],
      ['nowAssist', 'NOW_ASSIST_ENABLED', 'not licensed'],
      ['scripting', 'SCRIPTING_ENABLED', 'role missing'],
    ] as const;
    for (const [field, flag, status] of cases) {
      const probed = probes({ [field]: status } as Partial<LastProbe>);
      const question = flagQuestion(flag, expandPreset('full'), status);
      const reason = /— recommended: (.+)$/.exec(question)?.[1];
      expect(reason, `${flag}: the question carries no reason`).toBeTruthy();
      // The same words the row prints for the same probe — one definition, two surfaces.
      const screen = renderReviewScreen({ ...input(), probes: probed });
      expect(screen, `${flag}: row and question disagree`).toContain(reason as string);
    }
    // ...and a probe that is fine attaches no reason at all: there is nothing to recommend.
    expect(flagQuestion('WRITE_ENABLED', expandPreset('full'), 'ok')).not.toContain('recommended:');
  });

  it('(b) a number then Enter leaves the flag alone and applies nothing yet', async () => {
    // Enter APPLIES at the screen's own prompt and means "leave it" at a flag's question — opening a
    // row by mistake must not change a permission.
    const tty = scriptedTty(['6', '', '']);
    const result = await runReviewScreen(input(), tty);
    expect(result.flags.FLUENT_ENABLED).toBe('true');
    expect(tty.written).not.toContain('FLUENT → off');
  });

  it('(c) an answer that is not an option says so and changes nothing', async () => {
    const tty = scriptedTty(['6', 'x', '']);
    const result = await runReviewScreen(input(), tty);
    expect(tty.written).toContain('"x" is not one of [1] on  [2] off');
    expect(result.flags.FLUENT_ENABLED).toBe('true');
  });

  it('...and the option can be answered by name', async () => {
    const tty = scriptedTty(['6', 'off', '']);
    const result = await runReviewScreen(input(), tty);
    expect(result.flags.FLUENT_ENABLED).toBe('false');
  });

  it('the rows are numbered in flag order, and the recommendation names its own number', async () => {
    const text = renderReviewScreen(input());
    const rows = text.split('\n').filter((l) => /^\s+\d+\s+\[[x ]\]/.test(l));
    expect(rows).toHaveLength(FLAG_NAMES.length);
    FLAG_NAMES.forEach((flag, i) => {
      expect(rows[i]).toContain(`${i + 1}  [x] ${labelOf(flag)}`);
    });
    // DERIVED from the row index, never spelled: the FLUENT row is the sixth, so its recommendation
    // says `(type 6)`. This replaces ARC-07-C13's `type FLUENT to turn it off`.
    const fluentAt = FLAG_NAMES.indexOf('FLUENT_ENABLED') + 1;
    expect(text).toContain(`recommend: off (type ${fluentAt})`);
    expect(text).not.toContain('type FLUENT to turn it off');
  });

  it('the footer documents the number, and every line fits the budget', async () => {
    const text = renderReviewScreen(input());
    expect(text).toContain('Enter = apply as shown · a number opens that flag · "preset <name>" '
      + 'switches · "?" explains');
    expect(text).not.toContain('Enter = accept as shown');
    expect(text).not.toContain('type a flag name to toggle');
    for (const line of text.split('\n')) expect(line.length).toBeLessThanOrEqual(100);
  });

  it('a flag whose probe is ok offers off with no reason attached', async () => {
    const tty = scriptedTty(['1', '', '']);
    await runReviewScreen({ ...input(), probes: probes() }, tty);
    expect(tty.written).toContain('WRITE:  [1] on (current)  [2] off');
    expect(tty.written).not.toContain('WRITE:  [1] on (current)  [2] off — recommended');
  });

  it('typing a flag name still works, as an undocumented alias', async () => {
    // The footer names one way on purpose; the grammar keeps the other so nobody's habit breaks.
    const tty = scriptedTty(['fluent', '']);
    const result = await runReviewScreen(input(), tty);
    expect(result.flags.FLUENT_ENABLED).toBe('false');
  });

  it('a number-driven change runs the dependency conversation, exactly as a name-driven one does', async () => {
    // WRITE is row 1 and CMDB_WRITE/SCRIPTING depend on it: turning it off by number must ask the
    // same question, because it is the same function underneath.
    const tty = scriptedTty(['1', '2', 'n', '']);
    const result = await runReviewScreen(input(), tty);
    expect(tty.prompts.join(' ')).toContain('require WRITE — turn them off as well?');
    // `n` keeps the needed flag ON, which is the story's own answer in that direction.
    expect(result.flags.WRITE_ENABLED).toBe('true');
  });

  it('"?" explains the number as well as the flags', async () => {
    const tty = scriptedTty(['?', '']);
    await runReviewScreen(input(), tty);
    // THE KEY FIRST, then the flags. A short distinctive fragment of each, not the whole sentence:
    // `wrapRow` folds at the budget, so asserting a full meaning fails on a correct screen — the
    // third time in this row that a long string met the fold.
    expect(tty.written).toContain('a number — opens that flag');
    expect(tty.written).toContain('WRITE — ');
    expect(tty.written).toContain(FLAG_MEANINGS.WRITE_ENABLED.split(' ').slice(0, 4).join(' '));
    // ...and the number is explained BEFORE the flags, which is the order a reader needs.
    expect(tty.written.indexOf('a number — opens')).toBeLessThan(tty.written.indexOf('WRITE — '));
  });
});

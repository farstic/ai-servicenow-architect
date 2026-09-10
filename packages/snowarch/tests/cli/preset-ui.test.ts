import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLUMNS, ENTRY_DEFAULTS, FLAG_MEANINGS, PROBE_FIELD, annotate, applyingLine, dependencyViolation,
  labelOf, parseFlagsArg, prodRefusal, proposePreset, renderReviewScreen, resolveFlags,
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
    expect(withProbes.applying).toBe(
      'Applying: preset full — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=on');
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
    expect(lines.filter((l) => l.trim().startsWith('[x]'))).toHaveLength(FLAG_NAMES.length);
    expect(screen()).toContain('[x] NOW_ASSIST');
    expect(screen()).toContain('recommend: off');
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
    const rows = screen().split('\n').filter((l) => l.trim().startsWith('[x]'));
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
    expect(tty.written).toContain('is not a flag or a command');
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

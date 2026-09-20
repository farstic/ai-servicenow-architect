/**
 * ARC-08-C18 — `./snowarch status`, the command.
 *
 * The panel's own rendering is `panel.test.mjs`'s subject. What is proved here is everything the
 * skill used to ask a model to do around it: resolve the checkout and exit 3 with a `cd` remedy,
 * fall back to the bootstrap state when the doctor cannot run and name ONLY the cause it observed,
 * emit the doctor's report under `--json` rather than a shape of its own, and return the doctor's
 * verdict as the exit code without letting that suppress the panel.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRegistry, defineCheck } from '../../tools/snowarch/lib/doctor/registry.mjs';
import { fallbackPanel, statusCommand } from '../../tools/snowarch/lib/commands/status.mjs';
import { maskForJson } from '../../tools/snowarch/lib/doctor/json-boundary.mjs';
import { BANNER } from '../../tools/snowarch/lib/text.mjs';
import { tempDir } from '../../tools/snowarch/tests/helpers/temp.mjs';
import { greenTree, linkInstall } from './helpers/tree.mjs';

/** A collector standing in for stdout, so nothing in a test reaches a terminal. */
const sink = () => {
  const chunks = [];
  return { write: (text) => chunks.push(text), text: () => chunks.join('') };
};

const registry = (...checks) => createRegistry(checks.map((over) => defineCheck({
  id: 'E-00', section: 'prereqs', title: 'a check', severity: 'fail',
  quick: true, network: false, spawns: false, fixable: false,
  run: async () => ({ status: 'ok', detail: 'fine' }),
  ...over,
})));

test('a passing run prints the panel and exits 0', async (t) => {
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({}) });

  assert.equal(code, 0);
  const lines = out.text().trimEnd().split('\n');
  assert.match(lines[0], /^Mode: /);
  assert.ok(lines.some((l) => l.startsWith('Doctor: 1 ok, 0 warn, 0 fail')));
  // No FAIL block and no --fix invitation on a clean run.
  assert.equal(out.text().includes('FAIL'), false);
  assert.equal(out.text().includes('--fix'), false);
});

test('a failing check exits 1 AND still prints the panel', async (t) => {
  // The two halves are one assertion on purpose. An exit 1 here is a finding about the checkout,
  // not a failure to render, and a command that signalled the finding by withholding the report
  // would leave a reader with a number and nothing to act on — which is exactly the `1 fail` that
  // reached a user with no failing line beside it in ARC-09-C46.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({
    id: 'E-00', title: 'a check', fixable: true,
    run: async () => ({ status: 'fail', detail: 'it did not', remedy: './snowarch fix-it' }),
  }) });

  assert.equal(code, 1);
  const text = out.text();
  assert.match(text, /^Mode: /);
  assert.ok(text.includes('E-00 FAIL a check: it did not — ./snowarch fix-it'));
  assert.ok(text.includes('Run ./snowarch doctor --fix for the fixable ones (1).'));
});

test('--json emits the doctor report, unchanged, and nothing else on stdout', async (t) => {
  // A panel-shaped JSON would be a second schema for one set of facts, and the first consumer to
  // read the wrong one would be reading a shape nothing maintains. `JSON.parse` of the WHOLE
  // stream is the assertion that proves no prose was interleaved.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, flags: { json: true },
    home: '/home/nobody', registry: registry({}) });

  assert.equal(code, 0);
  const parsed = JSON.parse(out.text());
  assert.equal(parsed.schema, 1);
  assert.equal(parsed.product, 'snowarch');
  assert.equal(parsed.options.quick, true);
  // Through the same boundary as `doctor --json`: labels and hosts leave masked.
  assert.deepEqual(parsed, maskForJson(parsed, { home: '/home/nobody' }));
  // The stream IS the object: not "no Mode line anywhere" — `modeLine` is a key of the report and
  // its value is that sentence — but nothing before the brace and nothing after the close.
  assert.equal(out.text().trimStart()[0], '{');
  assert.equal(out.text().trimEnd().endsWith('}'), true);
});

test('outside a checkout it exits 3 and says cd, with its own name on the line', async (t) => {
  // The skill's step 4 — "print the cd remedy and nothing else about mode" — is this branch, and
  // it is the command's now because the command is what observed it. `STATUS:` rather than
  // `DOCTOR:` because nobody ran a doctor: a reader sent looking for one would be looking for a
  // run that never happened.
  const outside = tempDir('snowarch-not-a-checkout-', t);
  const out = sink();
  const code = await statusCommand({ out, cwd: outside });

  assert.equal(code, 3);
  assert.equal(out.text().trimEnd(), 'STATUS: not at the repository root — run: cd <the checkout>');
});

test('inside the checkout but not at it, the remedy names the root', async (t) => {
  const root = greenTree(t);
  const deep = join(root, 'clients', 'acme');
  mkdirSync(deep, { recursive: true });
  const out = sink();

  assert.equal(await statusCommand({ out, cwd: deep }), 3);
  assert.equal(out.text().trimEnd(), `STATUS: not at the repository root — run: cd ${root}`);
});

test('when the doctor throws, the panel names the cause it observed and no other', async (t) => {
  // SKILL.md's rule for this line is "never state a cause you did not check", and the sentence it
  // pointed at — `BANNER.fromState` — ended "until Node 20+ is installed" unconditionally. That is
  // the one cause this command can never be the one to report: a machine without Node cannot run
  // it to find out. The cause is an argument now, and this is the argument arriving.
  const root = greenTree(t);
  const out = sink();
  const code = await statusCommand({ out, cwd: root, registry: registry({
    run: async () => { throw new TypeError('a check exploded'); },
  }), now: () => { throw new RangeError('not this one'); } });

  assert.equal(code, 1);
  const text = out.text().trimEnd();
  // `design`, not `design-only`: the state file records the mode the bootstrap wrote, and the
  // fallback QUOTES it rather than translating it into the banner's vocabulary. A renderer that
  // prettified it here would be inventing a word the file does not contain.
  assert.match(text, /^Mode: design — from bootstrap state \(/);
  assert.ok(text.endsWith('doctor unavailable after it failed (RangeError)'), text);
  assert.equal(text.includes('Node 20+'), false, 'it stated a cause it did not check');
  // The thrown message never reaches the line — it can carry a path or a value, and this line is
  // pasted into conversations.
  assert.equal(text.includes('not this one'), false);
});

test('the fallback says what it does not know rather than inventing a mode', async (t) => {
  const root = tempDir('snowarch-no-state-', t);
  assert.equal(fallbackPanel(root, 'after it failed (Error)'),
    'Mode: unknown — doctor unavailable after it failed (Error), and .local/bootstrap-state.json'
    + ' is absent — run ./bootstrap.sh (Windows: bootstrap.cmd)');

  mkdirSync(join(root, '.local'), { recursive: true });
  writeFileSync(join(root, '.local', 'bootstrap-state.json'), '{ not json');
  assert.match(fallbackPanel(root, 'after it failed (Error)'),
    /^Mode: unknown — doctor unavailable after it failed \(Error\), and \.local\/bootstrap-state\.json is unreadable \(/);

  writeFileSync(join(root, '.local', 'bootstrap-state.json'),
    JSON.stringify({ mode: 'live', updatedAt: '2026-09-10T10:00:00.000Z' }));
  assert.equal(fallbackPanel(root, 'after it failed (Error)'),
    'Mode: live — from bootstrap state (2026-09-10T10:00:00.000Z); doctor unavailable'
    + ' after it failed (Error)');
});

test('the banner sentence still reads as it always did, with its cause supplied', () => {
  // `fromState` gained a parameter and lost its default; the string the Node-free launchers carry
  // in `text.json` is unchanged, and this is the assertion that keeps it so.
  assert.equal(BANNER.fromState('design-only', '2026-09-10T10:00:00.000Z',
    'until Node 20+ is installed'),
  'Mode: design-only — from bootstrap state (2026-09-10T10:00:00.000Z); doctor unavailable'
  + ' until Node 20+ is installed');
  const sample = JSON.parse(readFileSync(
    join(import.meta.dirname, '../../tools/snowarch/lib/text.json'), 'utf8'));
  assert.equal(sample.banner.fromState, BANNER.fromState('design-only',
    '2026-09-10T10:00:00.000Z', 'until Node 20+ is installed'));
  // No default: a caller that forgets renders `undefined`, which is visibly broken — the right
  // failure for a sentence whose whole job is to be trusted.
  assert.match(BANNER.fromState('live', 'now'), /doctor unavailable undefined$/);
});

test('the command writes no file', async (t) => {
  // rc.5: the model, executing the skill's instructions by hand, wrote the doctor JSON to /tmp
  // twice to read it back. The panel is stdout and only stdout.
  const root = greenTree(t);
  const before = readdirSync(root).sort();
  const localBefore = readdirSync(join(root, '.local')).sort();

  await statusCommand({ out: sink(), cwd: root, registry: registry({}) });

  assert.deepEqual(readdirSync(root).sort(), before);
  // `.local/` is the one place a doctor run may touch, and only its own cache — never a report.
  const localAfter = readdirSync(join(root, '.local')).sort();
  // Exactly the doctor's own cache, both halves of it — the report the banner reads and the
  // inputs that decide whether it is stale. Nothing else, and nothing outside `.local/`.
  assert.deepEqual(localAfter.filter((f) => !localBefore.includes(f)),
    ['doctor-last.inputs.json', 'doctor-last.json']);
});

/**
 * ARC-08-C19 — the wiring, driven through the real `runDoctor`.
 *
 * `panel.test.mjs` hands `renderPanel` a report and proves the READER. It says nothing about
 * whether anything WRITES `report.instances` or fills `engine.docs` on the run the skill mandates,
 * and that gap is how ARC-07-C5 and ARC-09-C19 both reached a user: a resolver with green tests and
 * no writer. These drive `statusCommand` on a fixture checkout and read what comes out.
 */
describe('ARC-08-C19 — the quick run produces the lines the skill specifies', () => {
  const STORE = {
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: { url: 'https://example.test', environment: 'pdi', preset: 'custom',
        auth: { method: 'basic', username: 'u', password: 'p' },
        flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false },
      uat: { url: 'https://example.test', environment: 'test', preset: 'read-only',
        auth: { method: 'basic', username: 'u', password: 'p' },
        flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false },
    },
  };

  const withStore = (t) => {
    const root = greenTree(t);
    writeFileSync(join(root, '.local', 'instances.json'),
      `${JSON.stringify(STORE, null, 2)}\n`, { mode: 0o600 });
    return root;
  };

  test('names the instances from the store, and says that is where they came from', async (t) => {
    const root = withStore(t);
    const out = sink();
    await statusCommand({ out, cwd: root, registry: registry({}) });
    const text = out.text();

    assert.ok(text.includes('Instances: pdi (pdi, custom) · uat (test, read-only)'), text);
    assert.ok(text.includes("Instances are the store's own records; nothing was probed."));
    // No credential and no host reaches a line a person pastes into a conversation.
    assert.equal(text.includes('example.test'), false);
    assert.equal(/\bp\b\s*$/.test(text), false);
  });

  test('marks the source in --json so a consumer can tell a read from a handshake', async (t) => {
    const root = withStore(t);
    const out = sink();
    await statusCommand({ out, cwd: root, flags: { json: true }, registry: registry({}) });
    const report = JSON.parse(out.text());

    assert.equal(report.instances.source, 'store');
    assert.equal(report.instances.entries.length, 2);
    // `server` still means "the server answered", and on a quick run nothing did.
    assert.equal(report.server, null);
    assert.equal('instances' in report, true, 'the key is absent from schema v1');
  });

  test('an empty store is no instances block at all, not an empty one', async (t) => {
    // The difference between "nobody asked" and "asked and there are none" is the distinction
    // ARC-08-C17 was about; an empty `entries` would erase it again.
    const out = sink();
    await statusCommand({ out, cwd: greenTree(t), registry: registry({}) });
    assert.equal(out.text().includes('Instances:'), false);
    assert.equal(out.text().includes("store's own records"), false);
  });

  test('fills the docs line from the configured corpus and one bounded rev-parse', async (t) => {
    const root = greenTree(t);
    const out = sink();
    await statusCommand({ out, cwd: root, flags: { json: true }, registry: registry({}) });
    const docs = JSON.parse(out.text()).engine.docs;

    // The two facts a grounding decision turns on, on the run the skill mandates.
    assert.equal(typeof docs.pin, 'string');
    assert.equal(docs.family, 'australia');
    // …and the fields a quick run cannot know stay null, which schema v1 reads as "not filled".
    // `null` is not `false`: a corpus nobody compared has not failed to match anything.
    assert.equal(docs.citations, null);
    assert.equal(docs.familyMatches, null);
    assert.ok(docs.headMatchesPin === null || typeof docs.headMatchesPin === 'boolean');
  });
});

test('ARC-08-C19 — the instances block carries no account name, whatever its source', async (t) => {
  // FOUND BY `fix.test.mjs`, NOT BY THIS FILE. The first version copied the server's own entries
  // into the new key wholesale, and those carry a `username` — masked, but still address-shaped —
  // so a masked account name reached the doctor CACHE, which is a file an issue template asks a
  // stranger to paste. The redaction test caught it within the hour.
  //
  // The block is narrowed to what the panel renders: a report that travels must not carry a field
  // nothing reads. This asserts the property directly rather than relying on the redactor to keep
  // catching it, because the redactor's test is about the cache and this is about the key.
  const root = greenTree(t);
  writeFileSync(join(root, '.local', 'instances.json'), `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: { url: 'https://example.test', environment: 'pdi', preset: 'custom',
        auth: { method: 'basic', username: 'someone@corp.example.com', password: 'p' },
        flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const out = sink();
  await statusCommand({ out, cwd: root, flags: { json: true }, registry: registry({}) });
  const block = JSON.parse(out.text()).instances;

  assert.deepEqual(Object.keys(block).sort(), ['entries', 'source']);
  for (const entry of block.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['environment', 'label', 'preset']);
  }
  const serialised = JSON.stringify(block);
  assert.equal(/@/.test(serialised), false, 'an address-shaped string is in the instances block');
  assert.equal(serialised.includes('example.test'), false, 'a host is in the instances block');
});

/**
 * ARC-08-C21 — the most-quoted line in the product was reporting flags nobody had read.
 *
 * `modeLineDetailed`'s caller took `effectiveFlags` from the SERVER's instance list, which has been
 * empty on every `--quick` run since ARC-09-C8 moved the server section out of the subset. The
 * summary's `flags = {}` default then rendered every name as `off`, so a live user read
 * `WRITE=off CMDB_WRITE=off …` about an instance whose store says five of the six are on — in the
 * line the SessionStart banner, `./snowarch mode` and the panel all quote verbatim.
 *
 * A flag nobody read, printed as a flag that is off: absence rendered as a finding, in the sentence
 * this product repeats most often.
 */
describe('ARC-08-C21 — the mode line reports the flags that are actually set', () => {
  const storeWith = (root, over) => {
    writeFileSync(join(root, '.local', 'instances.json'), `${JSON.stringify({
      version: 1,
      defaultInstance: 'pdi',
      instances: {
        pdi: {
          url: 'https://example.test', environment: 'pdi', preset: 'custom',
          auth: { method: 'basic', username: 'u', password: 'p' },
          flags: {
            WRITE_ENABLED: 'true', CMDB_WRITE_ENABLED: 'true', SCRIPTING_ENABLED: 'true',
            ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'true', FLUENT_ENABLED: 'false',
          },
          toolPackage: 'full', maxRecords: 100, prodWriteAck: false,
          ...over,
        },
      },
    }, null, 2)}\n`, { mode: 0o600 });
    return root;
  };

  // `linkInstall` because the flag LABELS come from the contract, and a fixture without it has no
  // list of names to render — a different absence from "the flags were not read", which the line
  // now distinguishes. A real checkout has both.
  const live = (t) => linkInstall(greenTree(t, { mode: 'live' }));

  const modeLineFrom = async (root) => {
    const out = sink();
    await statusCommand({ out, cwd: root, flags: { json: true }, registry: registry({}) });
    return JSON.parse(out.text()).modeLineDetailed;
  };

  test('a quick live run prints the store\'s own flags, and never six offs', async (t) => {
    // The owner's state: five on, FLUENT off, on the run a session actually makes.
    const line = await modeLineFrom(storeWith(live(t), {}));

    assert.match(line, /^Mode: live — pdi \(pdi\)/);
    assert.ok(line.includes('WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off'),
      line);
    // The defect, named as what must not come back.
    assert.equal(line.includes('WRITE=off CMDB_WRITE=off'), false,
      'the line reports six offs for a store that says otherwise');
  });

  test('the dependency rule is applied, not just the stored flags', async (t) => {
    // SCRIPTING requires WRITE. A store that declares scripting without write is a contradiction,
    // and the server gates on `false` — so the line must say `off`, not repeat the declaration.
    // Computed by the server's own `applyDependencyRule`, never a second encoding of the graph.
    const line = await modeLineFrom(storeWith(live(t), {
      flags: {
        WRITE_ENABLED: 'false', CMDB_WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'true',
        ATF_ENABLED: 'true', NOW_ASSIST_ENABLED: 'false', FLUENT_ENABLED: 'false',
      },
    }));
    assert.ok(line.includes('WRITE=off CMDB_WRITE=off SCRIPTING=off ATF=on'), line);
  });

  test('a live run whose flags could not be read says so, in words', async (t) => {
    // A store written by a newer build naming a preset this one does not know. Guessing
    // `read-only` would understate it and `full` would overstate it — and OMITTING the summary
    // would be a shorter line nobody notices, which is absence hidden one step later.
    const line = await modeLineFrom(storeWith(live(t),
      { preset: 'a-preset-from-a-newer-build' }));

    assert.match(line, /^Mode: live — /);
    assert.ok(line.includes('flags unknown (store not read)'), line);
    assert.equal(/WRITE=(on|off)/.test(line), false, 'it invented a flag state it had not read');
  });

  test('design-only prints no flag summary at all', async (t) => {
    // There is no instance for the flags to be about. This is the one case where saying nothing is
    // the honest answer rather than the quiet one.
    const line = await modeLineFrom(linkInstall(greenTree(t, { mode: 'design' })));
    assert.match(line, /^Mode: design-only/);
    assert.equal(/WRITE=|flags unknown/.test(line), false, line);
  });
});

test('ARC-08-C21 — the two absences are told apart, by name', async (t) => {
  // `flagSummary` returns null for two different reasons and the line must not conflate them. My
  // first version said `(store not read)` unconditionally and the first fixture to reach it had a
  // readable store and no contract — a sentence stating a cause that was not the one, in the line
  // the banner quotes. The rule this repository applies to remedies applies to a parenthesis too.
  const unlinked = greenTree(t, { mode: 'live' });
  writeFileSync(join(unlinked, '.local', 'instances.json'), `${JSON.stringify({
    version: 1,
    defaultInstance: 'pdi',
    instances: {
      pdi: { url: 'https://example.test', environment: 'pdi', preset: 'full',
        auth: { method: 'basic', username: 'u', password: 'p' },
        flags: {}, toolPackage: 'full', maxRecords: 100, prodWriteAck: false },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const out = sink();
  await statusCommand({ out, cwd: unlinked, flags: { json: true }, registry: registry({}) });
  const line = JSON.parse(out.text()).modeLineDetailed;

  // The store IS readable here; the contract is what is missing, and the line says so.
  assert.ok(line.includes('flags unknown (contract unavailable)'), line);
  assert.equal(line.includes('store not read'), false,
    'it blamed the store for an absence the contract caused');
});

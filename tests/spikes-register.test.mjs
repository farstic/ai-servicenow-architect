import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARC-00 B00-02 — the verdict register may never say less than the record it summarises.
 *
 * The acceptance plan proposed a prose diff: `diff <(grep -h '^\`S-' docs/spikes/S-*\/README.md |
 * sort) <(grep '^| S-' docs/spikes/README.md)` must be empty. **It never can be, and not because
 * anything is wrong** — the register ABBREVIATES the record by design. Measured before this test
 * was written: S-06's record carries "394 tools everywhere" and the register does not; S-07's
 * record carries "34,688 materialised files of 48,997 tracked" and four per-machine timings and the
 * register carries none of them. A prose diff demands the register BECOME the record, which is the
 * one thing a register must not be.
 *
 * So the rule is the architect's, and it is mechanical rather than editorial:
 *   1. a record's verdict line is `S-NN: <TOKEN><qualifier?><separator><sentence>`, the TOKEN is the
 *      longest match from a CLOSED set of eight, and every caveat in the line — the qualifier
 *      included — is a **bold** phrase;
 *   2. the token must be equal on both sides, exactly;
 *   3. every bold phrase of the record must appear in the register row, verbatim;
 *   4. both directions, and a non-vacuity guard on the extractor itself.
 * Numbers that are not bold are the record's business. That is what lets "394 tools everywhere"
 * drop from S-06 while "measured on macOS only — du was not run on the runners" may not drop
 * from S-15.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPIKES = join(root, 'docs/spikes');

/**
 * The eight, LONGEST FIRST — and the order is load-bearing: `CONFIRMED` is a prefix of
 * `CONFIRMED WITH CORRECTIONS`, so a first-match parser would silently downgrade S-07's verdict to
 * the weaker one and every assertion here would still pass.
 */
const TOKENS = ['CONFIRMED WITH CORRECTIONS', 'INTERACTIVE-PENDING', 'CONFIRMED', 'REFUTED',
  'PARTIAL', 'NOT PROVEN', 'NOT RUN', 'DEFERRED'];

/** Whitespace normalised; case is NOT — a caveat that changed case changed emphasis. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Everything a verdict claims, as data. `null` token = nothing from the closed set.
 *
 * Backticks are STRIPPED rather than used as delimiters, and that is a correction: the first
 * version split on them, which works until a verdict quotes code. S-07's says "it needs a fifth
 * step, `git submodule init`, without which…", so span-splitting cut the verdict in three and took
 * the wrong third — the register row "did not parse" for a reason that was mine, not the file's.
 * The token is a PREFIX of the text after `S-NN:`, which no amount of inline code disturbs.
 */
function parseVerdict(text) {
  const flat = String(text ?? '').replace(/`/g, '').trim();
  const m = /^(S-\d+[a-z]?):\s*(.*)$/.exec(flat);
  if (m === null) return null;
  const [, id, rest] = m;
  const token = TOKENS.find((t) => rest.startsWith(t)) ?? null;
  // The qualifier is whatever sits between the token and the separator, and the separator is the
  // first em-dash OR PERIOD after it — S-14g reads `REFUTED on both halves. The cap is close…`,
  // so the period is a form this parser NAMES rather than an accident it tolerates.
  const after = token === null ? '' : rest.slice(token.length);
  // A period that ENDS A SENTENCE, not any period: the ruling says "the first em-dash or period
  // after the qualifier", and a bare `.` cuts `CONFIRMED on 2.1.258 —` at the "2.1", which would
  // make every version-qualified verdict unparseable. A period followed by whitespace or end-of-line
  // is the sentence end; `2.1.258` is not.
  const sep = after.search(/—|\.(\s|$)/);
  const qualifier = norm(sep === -1 ? after : after.slice(0, sep));
  return { id, token, qualifier, text: flat };
}

/** Bold phrases, which by the convention are exactly the caveats. */
const caveats = (text) => [...text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => norm(m[1]));

/**
 * The records, discovered from the REGISTER's evidence path rather than by globbing `S-*`.
 *
 * Measured, not assumed: `docs/spikes/S-06-cold-start/` is a directory whose name looks exactly
 * like a record's and which holds no README at all — it carries `handshake.mjs`, the cold-start
 * probe that the S-06 and S-15 records both cite by path. A glob would have called it a record with
 * a missing verdict and demanded an exclusion list; the register's evidence cell is the rule that
 * needs no exception. A record directory that LOST its README still fails, because a row names it.
 */
function records() {
  return registerRows().map((row) => {
    const dir = row.dir.replace(/\/$/, '');
    const path = join(SPIKES, dir, 'README.md');
    if (!existsSync(path)) return { dir, path, line: null, verdict: null, missing: true };
    const text = readFileSync(path, 'utf8');
    const line = text.split('\n').find((l) => /^`S-\d+[a-z]?:/.test(l));
    return { dir, path, line: line ?? null, verdict: line ? parseVerdict(line) : null, missing: false };
  });
}

/** Every README that carries a verdict line, so an UNREGISTERED record fails too. */
function recordDirsOnDisk() {
  return readdirSync(SPIKES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^S-\d+[a-z]?-/.test(e.name))
    .filter((e) => existsSync(join(SPIKES, e.name, 'README.md')))
    .filter((e) => readFileSync(join(SPIKES, e.name, 'README.md'), 'utf8')
      .split('\n').some((l) => /^`S-\d+[a-z]?:/.test(l)))
    .map((e) => e.name);
}

/** The §5 register rows: the evidence directory is the first cell after the id, the verdict last. */
function registerRows() {
  const text = readFileSync(join(SPIKES, 'README.md'), 'utf8');
  return text.split('\n').filter((l) => /^\| S-\d+[a-z]? \|/.test(l)).map((row) => {
    // Markdown CELLS, not backtick spans — see parseVerdict. A trailing `|` leaves an empty last
    // element, so it is dropped before the verdict cell is taken.
    const cells = row.split('|').map((c) => c.trim());
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    const cell = cells[cells.length - 1] ?? '';
    return { row, dir: (cells[2] ?? '').replace(/`/g, '').trim(), cell, verdict: parseVerdict(cell) };
  });
}

test('B00-02 — every row names a record that exists, parses, and carries a token from the closed set', () => {
  const rows = registerRows();
  assert.ok(rows.length >= 20, `only ${rows.length} register rows found`);
  const recs = records();
  for (const r of recs) {
    assert.equal(r.missing, false, `the register names ${r.dir}/README.md and it is not there`);
    // The verdict is the line under `## Verdict` — the parser takes the first verdict-shaped line in
    // the file, which is the same line today only because no record has a second one. That is luck,
    // not a rule, and luck is what ARC-00-C2 was made of: assert the proxy is valid rather than
    // assume it. Exactly one candidate, and it sits under the heading.
    const body = readFileSync(r.path, 'utf8').split('\n');
    const candidates = body.filter((l) => /^`S-\d+[a-z]?:/.test(l));
    assert.equal(candidates.length, 1, `${r.dir}: ${candidates.length} verdict-shaped lines, expected one`);
    const h = body.findIndex((l) => l.trim() === '## Verdict');
    assert.notEqual(h, -1, `${r.dir}: no "## Verdict" heading`);
    const after = body.slice(h + 1).find((l) => l.trim() !== '');
    assert.equal(after, candidates[0], `${r.dir}: the line under "## Verdict" is not the verdict`);
    assert.notEqual(r.line, null, `${r.dir}: no verdict line (expected a line starting \`S-NN:\`)`);
    assert.notEqual(r.verdict, null, `${r.dir}: the verdict line does not parse`);
    assert.notEqual(r.verdict.token, null,
      `${r.dir}: "${norm(r.verdict.text).slice(0, 90)}" starts with no token from the closed set`);
  }
  for (const row of rows) {
    assert.notEqual(row.verdict, null, `register row does not parse: ${row.row.slice(0, 80)}`);
    assert.notEqual(row.verdict.token, null,
      `register row carries no token from the closed set: ${row.cell.slice(0, 90)}`);
  }
  // The other direction on the FILES: a record on disk that no row names.
  const named = new Set(recs.map((r) => r.dir));
  for (const dir of recordDirsOnDisk()) {
    assert.ok(named.has(dir), `${dir}/README.md carries a verdict and no register row names it`);
  }
});

test('B00-02 — the token is the same on both sides, and both directions are covered', () => {
  const byId = new Map(records().filter((r) => r.verdict).map((r) => [r.verdict.id, r]));
  const rows = new Map(registerRows().filter((r) => r.verdict).map((r) => [r.verdict.id, r]));

  // Both directions, by name.
  for (const id of byId.keys()) assert.ok(rows.has(id), `${id} has a record but no register row`);
  for (const id of rows.keys()) assert.ok(byId.has(id), `${id} has a register row but no record`);

  const wrong = [];
  for (const [id, rec] of byId) {
    const row = rows.get(id);
    if (!row) continue;
    if (rec.verdict.token !== row.verdict.token) {
      wrong.push(`${id}: record says ${rec.verdict.token}, register says ${row.verdict.token}`);
    }
  }
  assert.deepEqual(wrong, [], `the register disagrees with the record on the verdict itself:\n${wrong.join('\n')}`);
});

test('B00-02 — never says less: every caveat the record names is in the register row', () => {
  const rows = new Map(registerRows().filter((r) => r.verdict).map((r) => [r.verdict.id, r]));
  const missing = [];
  let bolded = 0;
  for (const rec of records()) {
    if (!rec.verdict) continue;
    const row = rows.get(rec.verdict.id);
    if (!row) continue;
    const want = caveats(rec.line);
    bolded += want.length;
    for (const c of want) {
      if (!norm(row.cell).includes(c)) missing.push(`${rec.verdict.id}: register drops "${c}"`);
    }
  }
  // Non-vacuity on the EXTRACTOR, not on the data: with no bold phrase anywhere this test would
  // pass over a register that says nothing at all.
  assert.ok(bolded > 0,
    'no record carries a bold caveat — the convention is not in the tree, so this test proves nothing');
  assert.deepEqual(missing, [], `the register says less than the record:\n${missing.join('\n')}`);
});

test('B00-03 — the Claude Code floor is the version S-11 measured, in all three places', () => {
  // The floor is a claim about evidence: `2.1.214` is shipped because S-11 ran the mechanisms on
  // that binary. Three files say it — the product config, the seed the config was built from, and
  // the verdict line that earned it — and nothing compared them, so a bump in one was a floor with
  // no measurement behind it and a spike record nobody would have reread.
  const cfg = JSON.parse(readFileSync(join(root, 'engine.config.json'), 'utf8'));
  const seed = JSON.parse(readFileSync(join(SPIKES, 'engine.config.seed.json'), 'utf8'));
  const rec = records().find((r) => r.verdict && r.verdict.id === 'S-11');
  assert.ok(rec, 'no S-11 record');

  assert.equal(cfg.floors.claudeCode, seed.floors.claudeCode,
    'engine.config.json and the seed disagree about the Claude Code floor');
  assert.match(rec.verdict.text, new RegExp(`floor ${cfg.floors.claudeCode.replace(/\./g, '\\.')} sufficient`),
    `S-11's verdict does not say floor ${cfg.floors.claudeCode} is sufficient`);
  // Not vacuous: a floor the verdict never mentions must fail.
  assert.doesNotMatch(rec.verdict.text, /floor 9\.9\.9 sufficient/);

  // S-11's verdict is CONDITIONAL, and the condition is part of the floor's meaning: four of the
  // eleven mechanisms are unmeasured and named, and a named one failing reopens it. A verdict that
  // quietly lost the list would turn "sufficient on what we measured" into "sufficient".
  const unmeasured = ['${VAR:-default} expansion', 'enabled/disabledMcpjsonServers',
    'exec-form hook + CLAUDE_PROJECT_DIR', 'skills/agents listing'];
  for (const m of unmeasured) {
    assert.ok(rec.verdict.text.includes(m), `S-11's verdict no longer names ${m} as unmeasured`);
  }
});

/**
 * B00-01 — §A and §B of `03-RISKS-AND-UNKNOWNS.md` carry a Status and a Record for every spike.
 *
 * The plan's criterion was `grep -E '^\| S-' 03 | grep -ci unverified` prints 0. **That criterion
 * cannot pass without damaging the tree**, and this is the third one in this arc that could not:
 * the only matching row is S-26 in §F — *"MCP clients actually send `_meta[...]`"* — which says
 * **UNVERIFIED — recorded as a candidate, not a finding**, and says it because it is true. A grep
 * over every `| S-` line in the file counts an honest record as a defect. Scoped to the two tables
 * the criterion is about, it is a real check, and that is what runs here.
 */
test('B00-01 — every §A/§B spike row carries a Status and a Record that exists', () => {
  const text = readFileSync(join(root, 'docs/plans/03-RISKS-AND-UNKNOWNS.md'), 'utf8');
  const lines = text.split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith('| ID | Assumption |')) continue;
    assert.match(lines[i], /\| Status \| Record \|$/, 'a spike table has no Status/Record columns');
    for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j += 1) {
      if (/^\| S-\d+[a-z]?\s*\|/.test(lines[j])) rows.push(lines[j]);
    }
  }
  assert.ok(rows.length >= 25, `only ${rows.length} spike rows found across §A and §B`);

  const tokens = new Set(TOKENS);
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    const rec = cells[cells.length - 1].replace(/`/g, '');
    const stat = cells[cells.length - 2].replace(/\*/g, '').trim();
    const id = /^\| (S-\d+[a-z]?)/.exec(row)[1];
    assert.ok(tokens.has(stat), `${id}: Status "${stat}" is not one of the eight`);
    assert.ok(existsSync(join(root, rec)), `${id}: Record ${rec} does not exist`);
    // The Status is the REGISTER's, not an independent opinion — one source, three readers.
    const fromRegister = registerRows().find((r) => r.verdict && r.verdict.id === id);
    assert.ok(fromRegister, `${id}: a §A/§B row for a spike with no register row`);
    assert.equal(stat, fromRegister.verdict.token, `${id}: 03 disagrees with the register`);
    assert.doesNotMatch(row.toLowerCase(), /unverified/, `${id}: a gating spike row still says unverified`);
  }
});

test('ARC-00-C2 — every register row is four cells, and cell 3 names the story that ran it', () => {
  // The direction that was missing, and it let a broken row through this very PR. S-13's row had
  // its VERDICT in cell 3 and a second copy of the verdict in cell 4 — the story reference was
  // simply gone — and every test above passed, because they all read the LAST cell. A test that
  // only ever looks where the value should be cannot notice that something else is where it isn't.
  //
  // The pattern is `ARC-00-Snn`, or `Deferred → ARC-nn-Snn` for a spike ARC-00 handed on rather
  // than ran: S-10 went to ARC-04-S05 and S-13 to ARC-02-S03, and both of those cells are correct.
  // The architect's proposed `/^ARC-00-S\d\d$/` would have failed S-10, whose content is right —
  // so the rule is the one the data supports, and the two forms are both spelled out here.
  const rows = registerRows();
  assert.ok(rows.length >= 20, `only ${rows.length} register rows`);
  let deferred = 0;
  for (const { row } of rows) {
    const cells = row.split('|');
    let last = cells.length - 1;
    while (last > 0 && cells[last].trim() === '') last -= 1;
    const id = cells[1].trim();
    // `split('|')` leaves an empty element at index 0 (the leading pipe), so the data cells are
    // 1..last and their COUNT is `last`.
    assert.equal(last, 4, `${id}: the row has ${last} cells, not four — an unescaped | in the text?`);
    const story = cells[3].trim().replace(/\*/g, '');
    if (story.startsWith('Deferred')) deferred += 1;
    assert.match(story, /^(Deferred → )?ARC-\d{2}-S\d{2}$/,
      `${id}: cell 3 is "${story.slice(0, 60)}" — it must name the story that ran the spike`);
    // Cell 2 is the record directory, cell 4 the verdict: assert they have not swapped places.
    assert.match(cells[2].trim(), /^`S-\d+[a-z]?-[a-z0-9-]+\/`$/, `${id}: cell 2 is not a record directory`);
    assert.match(cells[last].trim(), /^`S-\d+[a-z]?: /, `${id}: cell 4 is not a verdict`);
  }
  // Not vacuous: both forms must actually occur, or the pattern is only being proven on one.
  assert.ok(deferred >= 2, 'no deferred rows found — the second form of cell 3 is untested');
});

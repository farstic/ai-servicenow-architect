#!/usr/bin/env python3
"""Re-measure the release rows' controls on a tag, in a clean clone.

HAND-RUN ONLY. NEVER IN CI. `tests/workflows.test.mjs` asserts that no workflow references this
file, and that assertion is the point rather than a formality: this script DELIBERATELY DEGRADES A
WORKING TREE — it edits source files so a named test fails, then restores them — and a job that ran
it would be a job that edits the repository it is testing. It also clones from the network, runs the
whole suite dozens of times, and takes the better part of an hour.

    python3 -u scripts/acceptance/tag-controls.py v2.0.0 [--source <repo>] [--keep]

`-u` IS NOT DECORATION. Python block-buffers stdout when it is redirected, so a long run written to
a file shows NOTHING until it exits — including if it dies. Measured: a v2.0.0 run sat at 0 bytes
for four minutes while `npm ci` was working, which is indistinguishable from a hang.

WHAT IT TOUCHES. Everything happens inside a `tempfile.mkdtemp()` clone, restored with
`git checkout -- .` after every control; the repository you run it from is never written to. Two
positive checks write OUTSIDE that clone because they cannot be what they are otherwise, and both
are uniquely named and removed in a `finally`:
  * `~/.rc-controls-probe` — the check is that a TMPDIR under HOME does not change the captured
    bytes, so it has to be under HOME;
  * `/tmp/rc-controls-linked-<pid>` — the check is a TMPDIR whose spelling goes through a SYMLINKED
    prefix, which on macOS is what `/tmp` -> `/private/tmp` is.
Confirm neither exists before a run: the cleanup is an `rmtree`.

AN INTERRUPTED RUN LEAKS ITS WORK DIRECTORY. The `mkdtemp` is removed on a normal exit (unless
`--keep`); a kill leaves `rc-controls-*` in TMPDIR, tens of MB once the clone starts. Sweep them
before quoting "TMPDIR leftovers" from anywhere.

Every control is "degrade -> the named test fails -> restore", and a degradation whose anchor is
not found on the tag is reported as a FINDING rather than skipped: the code having moved is the
thing worth knowing, and it is the question this harness exists to ask of a tag nobody has touched
since it was cut.
"""
import os, re, shutil, subprocess, sys, tempfile, json
from pathlib import Path

# THE STRANGER'S PATH. The tag exists for whoever clones it from GitHub, so that is what is
# measured; `--source` overrides only for a dry run of this harness itself.
DEFAULT_SOURCE = 'https://github.com/farstic/ai-servicenow-architect.git'


def parse_argv(argv):
    """The arguments, READ INSIDE A FUNCTION so importing this file needs no argv and runs nothing.

    These were three module-level `sys.argv` reads, which meant `import tag_controls` raised
    IndexError before it could be asked anything — and with `main()` also at module scope, an import
    that DID supply argv started a network clone. ARC-08-C25's own control is "every exporting
    script can be imported without running", and this file failed it in both directions while
    carrying a control that checks it for everybody else.
    """
    if len(argv) < 2:
        sys.exit('usage: python3 -u scripts/acceptance/tag-controls.py <tag> [--source <repo>] [--keep]')
    return (argv[1],
            argv[argv.index('--source') + 1] if '--source' in argv else DEFAULT_SOURCE,
            '--keep' in argv)

def run(cmd, cwd, env=None, timeout=1800):
    e = dict(os.environ); e.update(env or {})
    p = subprocess.run(cmd, cwd=cwd, env=e, shell=isinstance(cmd, str),
                       capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout or '') + (p.stderr or '')

# ANSI is STRIPPED FIRST. vitest colours the `×` line, so `^\s*` never matched it and a control
# that had fired was reported as `exit 1, no named failure` — a harness bug reading as a product
# finding, which is the one thing this report must not do. node:test's own lines happened not to be
# coloured, which is why it looked like it worked.
ANSI = re.compile(r'\x1b\[[0-9;]*m')
FAIL_PATTERNS = [re.compile(r'^\s*[✖×]\s+(.+?)(?:\s+\(\d|\s+\d+ms|$)', re.M)]

def failing_names(out):
    out = ANSI.sub('', out)
    names, seen = [], set()
    for pat in FAIL_PATTERNS:
        for m in pat.finditer(out):
            n = m.group(1).strip().rstrip(')').strip()
            if not n or n.startswith('failing tests') or n in seen:
                continue
            seen.add(n); names.append(n)
    return names

class Patch:
    def __init__(self, path, old, new):
        self.path, self.old, self.new = path, old, new

CONTROLS = []
def control(row, name, patches, test, expect, dist=False, kind='degrade'):
    CONTROLS.append(dict(row=row, name=name, patches=patches, test=test, expect=expect,
                         dist=dist, kind=kind))

# ── ARC-09-C47 ────────────────────────────────────────────────────────────────────────────────
control('ARC-09-C47', 'cache key renamed (remote -> remoteName)',
        [Patch('tools/snowarch/lib/upgrade-check.mjs', '    remote,\n', '    remoteName: remote,\n')],
        'node --test tests/upgrade/upgrade-unit.test.mjs',
        "the cache is the hook's contract")

# ── ARC-07-C5 ─────────────────────────────────────────────────────────────────────────────────
control('ARC-07-C5', 'add discards the probes it took',
        [Patch('packages/snowarch/src/cli/instance.ts',
               '    ...(probeResult?.last ? { lastProbe: storedProbe(probeResult.last) } : {}),',
               '    // REVERTED')],
        'npx vitest run tests/cli/instance.test.ts --root packages/snowarch',
        'writes lastProbe from the run that probed', dist=True)

# ── ARC-08-C18 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C18', 'ranAt rendered in local time',
        [Patch('tools/snowarch/lib/doctor/panel.mjs',
               '  return `${text.slice(0, 10)} ${text.slice(11, 16)} UTC`;',
               "  return new Date(text).toLocaleString('en-GB').slice(0, 17);")],
        'node --test tests/doctor/panel.test.mjs',
        'the same report renders identically under a different ambient environment')
control('ARC-08-C18', 'warnings listed in the panel',
        [Patch('tools/snowarch/lib/doctor/panel.mjs',
               '  const failures = failureLines(report);',
               '  const failures = nonOkLines(report);')],
        'node --test tests/doctor/panel.test.mjs',
        'FAILs are listed with their remedy')
control('ARC-08-C18', 'the skill renders from the JSON again',
        [Patch('.claude/skills/snowarch/SKILL.md', '1. Run `./snowarch status`.',
               '1. Run `./snowarch doctor --quick --json` and fill each line from the key in brackets.')],
        'node --test tests/doctor/status-template.test.mjs',
        'the skill runs the command and renders nothing itself')

# ── ARC-08-C19 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C19', 'instances never reach the report',
        [Patch('tools/snowarch/lib/doctor/index.mjs', '    instances: instanceBlock,',
               '    instances: null,')],
        'node --test tests/doctor/status-command.test.mjs',
        'ARC-08-C19')
control('ARC-08-C19', 'no docs fallback',
        [Patch('tools/snowarch/lib/doctor/index.mjs',
               '      { docsFallback: () => configuredDocs({ root }) }),', '      {}),')],
        'node --test tests/doctor/status-command.test.mjs',
        'ARC-08-C19')
control('ARC-08-C19', 'familyMatches unmapped',
        [Patch('tools/snowarch/lib/doctor/checks/index.mjs',
               "      familyMatches: data('E-14') ? data('E-14').family === docs.family : docs.familyMatches ?? null,",
               '')],
        'node --test tests/doctor/status-command.test.mjs',
        'ARC-08-C19')

# ── ARC-08-C20 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C20', 'an edited fixture value',
        [Patch('tests/fixtures/doctor/status-live.json', '"preset": "custom"', '"preset": "edited"')],
        'node --test tests/doctor/status-fixture-capture.test.mjs',
        'the committed fixtures are what the capture produces, today')
# ARC-08-C27 moved this anchor (it added `version` and `contractSha` to the same line), and the
# harness reported ANCHOR NOT FOUND on rc.9 rather than passing quietly — which is what that row
# class is for. Re-pointed at the current line and re-verified on the tag.
control('ARC-08-C20', 'the node pin dropped',
        [Patch('scripts/make-status-fixtures.mjs',
               '    engine: { ...report.engine, node: HOST_FACTS.node, version: HOST_FACTS.version,\n'
               '      contractSha: HOST_FACTS.contractSha, docs },',
               '    engine: { ...report.engine, version: HOST_FACTS.version,\n'
               '      contractSha: HOST_FACTS.contractSha, docs },')],
        'node scripts/make-status-fixtures.mjs --check',
        "this machine's node version", kind='degrade-exit')
control('ARC-08-C20', 'the masker reverted (resolved spelling dropped)',
        [Patch('tools/snowarch/lib/doctor/json-boundary.mjs', '  let resolved = null;',
               '  const resolved = null; // eslint-disable-line prefer-const')],
        'node --test tests/doctor/status-fixture-capture.test.mjs tests/doctor/json-boundary.test.mjs',
        'the capture is byte-identical under three TMPDIR layouts')

# ── ARC-08-C21 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C21', 'the store cut off from the mode line',
        [Patch('tools/snowarch/lib/doctor/index.mjs', '      flags: (probed ? instances : fromStore)',
               '      flags: (probed ? instances : [])')],
        'node --test tests/doctor/status-command.test.mjs',
        'ARC-08-C21')
control('ARC-08-C21', 'the `= {}` default restored',
        [Patch('tools/snowarch/lib/doctor/mode.mjs', 'export function flagSummary(contract, flags) {',
               'export function flagSummary(contract, flags = {}) {')],
        'node --test tests/doctor/mode-and-cache.test.mjs',
        'flags nobody read do not render as flags that are off')

# ── ARC-08-C22 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C22', 'a sub-command added to the dispatcher only',
        [Patch('packages/snowarch/src/cli/help-tables.ts',
               "  import: { positionals: 0, summary: 'migrate a snow-mcp 1.x store (--from-legacy), plan first' },",
               "  import: { positionals: 0, summary: 'migrate a snow-mcp 1.x store (--from-legacy), plan first' },\n"
               "  'set-timeout': { positionals: 1, summary: 'a sub-command nobody told the frame about' },")],
        'node --test tests/cli-help.test.mjs',
        # The TEST NAME, not the assertion message: the harness matches names, and supplying a
        # message made a firing control read as a failure.
        'the instance frame names every sub-command the dispatcher accepts', dist=True)

# ── ARC-08-C23 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C23', '[3/6] silent again',
        [Patch('packages/snowarch/src/cli/instance.ts',
               '    io.write(`[3/6] Authentication … ${method} (${skipReason(options)})\\n`);',
               '    void skipReason;')],
        'npx vitest run tests/cli/instance.test.ts --root packages/snowarch',
        'names the method it used and why', dist=True)
control('ARC-08-C23', 'the Store line unmasked',
        [Patch('packages/snowarch/src/cli/instance.ts',
               "  const masked = maskPath(path, { sepChar: platform === 'win32' ? '\\\\' : '/' });",
               '  const masked = path;')],
        'node --test tests/cosmetics.test.mjs',
        'the Store line is masked', dist=True)
control('ARC-08-C23', 'the header fixed to "everything on"',
        [Patch('packages/snowarch/src/cli/preset-ui.ts',
               '        + `— non-production: ${presetNote(flags)}`);',
               "        + '— non-production: everything on');")],
        'node --test tests/cosmetics.test.mjs',
        'the review screen describes the preset it is proposing', dist=True)
control('ARC-08-C23', "B04's ~72 MB literal restored",
        [Patch('tools/snowarch/lib/steps/B04.mjs',
               '  ctx.line?.(`[B04/09] deps … installing (npm ci${installSizeHint(ctx.state)})`);',
               "  ctx.line?.('[B04/09] deps … installing (npm ci, ~72 MB)');")],
        'node --test tools/snowarch/tests/b04-deps.test.mjs',
        'B04 announces a size it measured')
control('ARC-08-C23', 'maskPath separator branch removed',
        [Patch('packages/snowarch/src/store/paths.ts',
               "  const norm = (v: string) => (sepChar === '\\\\' ? v.replace(/\\\\/g, '/') : v);",
               '  const norm = (v: string) => v;')],
        'node --test tests/cosmetics.test.mjs',
        'both maskers match a prefix under either separator', dist=True)

# ── ARC-08-C24 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C24', 'the duplicate key written again',
        [Patch('tools/snowarch/lib/doctor/index.mjs', '    prereqs: collectPrereqs({ root, config, env }),',
               "    prereqs: { ...collectPrereqs({ root, config, env }), capabilities: data('E-04')?.packs ?? null },")],
        'node --test tests/doctor/status-command.test.mjs',
        'the emitted report names it exactly once')
control('ARC-08-C24', 'the renderer reads the old key',
        [Patch('tools/snowarch/lib/doctor/report-text.mjs',
               '  const capabilities = capabilitiesLine(report.engine?.capabilities ?? null);',
               '  const capabilities = capabilitiesLine(report.prereqs?.capabilities ?? null);')],
        'node --test tests/doctor/status-command.test.mjs',
        'the text report reads the value the writer meant')

# ── ARC-08-C25 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C25', 'the import guard removed',
        [Patch('scripts/ci/validate-report.mjs', 'if (INVOKED_DIRECTLY) main();\n\nfunction main() {', '')],
        'node --test tests/scripts-are-importable.test.mjs',
        'every exporting script can be imported without running')
control('ARC-08-C25', 'the quick report dropped from the upload',
        [Patch('.github/workflows/ci.yml', '            ${{ runner.temp }}/doctor-quick.json\n', '')],
        'node --test tests/workflows.test.mjs',
        'every report the job uploads is validated')

# ── ARC-08-C26 ────────────────────────────────────────────────────────────────────────────────
control('ARC-08-C26', 'the single-separator comparison restored',
        [Patch('packages/snowarch/src/store/paths.ts',
               '    const rest = underPrefix(target, checkout, sepChar);',
               '    const n2 = checkout.endsWith(sepChar) ? checkout.slice(0, -1) : checkout;\n'
               '    const rest = target === n2 ? \'\' : (target.startsWith(n2 + sepChar) ? target.slice(n2.length) : null);')],
        'node --test tests/shell-remedy.test.mjs',
        'a target under the checkout is relative, in either spelling', dist=True)

# ── rows added since rc.9 ─────────────────────────────────────────────────────────────────────
# Each is "degrade -> the named test fails -> restore", and an anchor that has moved is reported as
# ANCHOR NOT FOUND rather than skipped: on rc.9 that class caught ARC-08-C27 moving C20's line, and
# it is the only way a control that silently stopped testing anything shows up as something.

# ── ARC-08-C27 — the version pin ──────────────────────────────────────────────────────────────
control('ARC-08-C27', 'the version pin dropped from the capture',
        [Patch('scripts/make-status-fixtures.mjs',
               '    engine: { ...report.engine, node: HOST_FACTS.node, version: HOST_FACTS.version,\n'
               '      contractSha: HOST_FACTS.contractSha, docs },',
               '    engine: { ...report.engine, node: HOST_FACTS.node,\n'
               '      contractSha: HOST_FACTS.contractSha, docs },')],
        'node --test tests/doctor/status-fixture-capture.test.mjs',
        'ARC-08-C27')

# ── ARC-08-C31 — the day pin ──────────────────────────────────────────────────────────────────
control('ARC-08-C31', 'stampDay made a no-op (today leaks into the fixture)',
        [Patch('scripts/make-status-fixtures.mjs',
               '  return line.replace(/(doctor )\\d{4}-\\d{2}-\\d{2}/g, `$1${day}`);',
               '  return line;')],
        'node --test tests/doctor/status-fixture-capture.test.mjs',
        'ARC-08-C31')

# ── ARC-08-C28 — the keep-path is the store's decision, not the terminal's ────────────────────
control('ARC-08-C28', 'the keep-path made conditional on a terminal again',
        [Patch('tools/snowarch/lib/steps/B06.mjs', '  if (kept) {', '  if (kept && interactive) {')],
        'node --test tools/snowarch/tests/b06-migration.test.mjs',
        'ARC-08-C28')

# ── ARC-08-C29 — the plan is the runner's decision ────────────────────────────────────────────
# `tests/upgrade/` is outside `npm test`, so this is named explicitly. It is also the row whose
# FIRST control was aimed at the wrong line and passed while the product could not plan at all.
control('ARC-08-C29', 'the ctx spread restored at the call site (the original crash line)',
        [Patch('tools/snowarch/lib/commands/upgrade.mjs',
               '    const tagCtx = planContext({ root: at, config, ctx, state });',
               '    const tagCtx = { ...ctx, root: at, config };')],
        'node --test tests/upgrade/plan-agrees.test.mjs',
        'the plan survives the ctx the COMMAND hands it')

# ── ARC-08-C30 — E-29, and the snapshot tally ─────────────────────────────────────────────────
control('ARC-08-C30', 'E-29 reports a tree that never started as unfinished',
        [Patch('tools/snowarch/lib/doctor/checks/engine-repo.mjs',
               "        if (Object.keys(state.steps ?? {}).length === 0) {\n"
               "          return ok('no steps recorded yet');\n        }",
               '        // REVERTED')],
        'node --test tests/doctor/bootstrap-finished.test.mjs',
        'nothing started, not something unfinished')
control('ARC-08-C30', "a snapshot's summary no longer tallies its rows",
        [Patch('tests/fixtures/doctor/snapshot-darwin.json',
               '"ok": @@SUMMARY_OK@@,', '"ok": @@SUMMARY_OK_MINUS_1@@,')],
        'node --test tests/doctor/snapshot.test.mjs',
        'summary is the tally of its own rows')

# ── ADR-0010 / ARC-05-S12 — the capabilities pre-flight ───────────────────────────────────────
control('ADR-0010', 'the stop sentence removed from the rule-file generator',
        [Patch('packages/contract/gen/rule-file.mjs', '   > ${PREFLIGHT_STOP}', '   > (removed)')],
        'node --test tests/contract/gen-governance.test.mjs',
        'ADR-0010')

# ── ARC-09-S12 — one comparator, and the job that names the file ──────────────────────────────
control('ARC-09-S12', 'numeric prerelease identifiers compared as strings again',
        [Patch('tools/snowarch/lib/semver.mjs', 'export function comparePre(a, b) {',
               'export function comparePre(a, b) {\n  return a === b ? 0 : (a < b ? -1 : 1);')],
        'node --test tests/semver.test.mjs',
        "specification's own example")
control('ARC-09-S12', 'tag-order.test.mjs dropped from the upgrade-e2e list',
        [Patch('.github/workflows/ci.yml',
               ' \\\n            tests/upgrade/tag-order.test.mjs', '')],
        'node --test tests/workflows.test.mjs',
        'ARC-09-C48')


# ── ARC-09-C49 — the release runs the suite on the tree it commits ────────────────────────────
control('ARC-09-C49', 'npm test dropped from the post-write list',
        [Patch('scripts/release.mjs',
               "    ['test', ['npm', 'test'], 'npm test failed after the writes — the tree CI would refuse'],\n",
               '')],
        'node --test tests/release.test.mjs',
        'ARC-09-C49')
# THE ONE THAT KILLED rc.10, aimed at the tag's own VERSION OF RECORD.
#
# The plant is DERIVED from the clone's `package.json`, never spelled — and that is a correction
# measured on v2.0.0, not a tidy-up. This control used to plant the literal `2.0.0-rc.11`, which is
# correct at an rc tag (where the version of record IS `2.0.0-rc.N`, so the plant matches it) and
# WRONG at a final one: on v2.0.0 the version of record is the bare `2.0.0`, and `2.0.0-rc.11` is a
# DIFFERENT version. The sweep declined to flag it and was right to — that is ARC-09-C50, which
# measured 21 lines and four whole files that a substring match would have failed the release over.
# So the harness reported FAIL against correct behaviour, which is the one thing a control must
# never do. Derived, it is right at an rc and right at a final, and nothing has to be edited here
# at the next cut.
def resolve(text, clone, path, version_of_record):
    """Resolve a patch's placeholders against the TREE, so no control spells a moving value.

    Two classes so far, and both were learned the same way — by a control reporting FAIL or
    ANCHOR NOT FOUND against a product that was right:

      `@@VERSION_OF_RECORD@@`  the version this tree is of record for (v2.0.0: the bare triple).
      `@@SUMMARY_OK@@`         the `ok` count in the snapshot this patch targets, and
      `@@SUMMARY_OK_MINUS_1@@` one less — a tally that no longer matches its rows.

    The snapshot one replaced the literal `"ok": 27,`. That is a count which moves whenever a check
    legitimately changes status: ARC-09-C51's own E-28 fix took darwin from 27 to 28, and the anchor
    went missing on the very next tree — a FINDING about the harness, reported as one about the tag.
    """
    out = text.replace('@@VERSION_OF_RECORD@@', version_of_record)
    # THE RELEASE TARGET is the version-of-record with any prerelease dropped — `2.0.1-rc.1` -> `2.0.1`
    # — which is what the NEXT-release sweep asks about, and `…_ESCAPED` is the spelling a regex
    # literal carries (`2\.0\.1`). Both derived: a control that spelled either would be right at a
    # final tag and wrong at an rc, which is exactly how the C49 plant went wrong (ARC-09-C51).
    target = version_of_record.split('-')[0]
    out = out.replace('@@RELEASE_TARGET_ESCAPED@@', target.replace('.', r'\.'))
    out = out.replace('@@RELEASE_TARGET@@', target)
    if '@@SUMMARY_OK' in out:
        ok = json.loads(open(os.path.join(clone, path), encoding='utf-8').read())['summary']['ok']
        out = out.replace('@@SUMMARY_OK_MINUS_1@@', str(ok - 1)).replace('@@SUMMARY_OK@@', str(ok))
    return out


control('ARC-09-C49', "a literal of the tag's own version of record planted in a test",
        [Patch('tests/semver.test.mjs',
               "  assert.ok(compareSemver('9.0.0-rc.11', '9.0.0-rc.10') > 0);",
               "  assert.ok(compareSemver('@@VERSION_OF_RECORD@@', '9.0.0-rc.10') > 0);")],
        'node --test tests/version-literals.test.mjs',
        'no assertion spells the current version of record')

# ── ARC-09-C52 — the sweep sees a version spelled as a regex ───────────────────────────────────
#
# C51's promise is that every row's control is re-measured on a tag, and C52 arrived without one.
# Both of these are about the SAME hole from opposite sides: the first breaks the mechanism, the
# second re-plants the regression that proved the hole was real.
control('ARC-09-C52', 'the escaped spelling dropped from the sweep',
        [Patch('tests/version-literals.test.mjs',
               '  const forms = [String(version), escapedSpelling(version)]',
               '  const forms = [String(version)]')],
        'node --test tests/version-literals.test.mjs',
        'the escaped spelling is caught')
# THE REGRESSION THAT ACTUALLY BIT, re-planted: `install-page` pinned the README head to the record
# version in an escaped regex and broke on the post-release bump, with the sweep silent. The spelling
# is DERIVED from the tree's own release target — spelled, it would be right at a final tag and wrong
# at an rc, which is the C49 mistake this harness already made once.
control('ARC-09-C52', "a regex literal of the release target planted in a test",
        [Patch('tests/install-page.test.mjs',
               "  const rootVersion = JSON.parse(read('package.json')).version;",
               "  assert.match(read('docs/README-head.md'), /@@RELEASE_TARGET_ESCAPED@@/);\n"
               "  const rootVersion = JSON.parse(read('package.json')).version;")],
        'node --test tests/version-literals.test.mjs',
        'spells the version the NEXT release will carry')

# ── ARC-07-C7 — the nightly live suite ────────────────────────────────────────────────────────
control('ARC-07-C7', 'the dispatch guard restored to ref-only',
        [Patch('.github/workflows/e2e-live.yml',
               "    if: github.event_name == 'workflow_dispatch' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
               "    if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)")],
        'node --test tests/workflows.test.mjs',
        'the live suite never runs on a proposed change')
control('ARC-07-C7', "the schedule's checkout ref removed (back to aiming at main)",
        [Patch('.github/workflows/e2e-live.yml',
               "          ref: ${{ github.event_name == 'schedule' && 'develop' || github.ref }}\n",
               '')],
        'node --test tests/workflows.test.mjs',
        'the schedule tests develop')


def main(TAG, SOURCE, KEEP):
    work = tempfile.mkdtemp(prefix='rc-controls-')
    clone = os.path.join(work, 'clone')
    tmp = os.path.join(work, 'tmp'); os.makedirs(tmp)
    env = {'TMPDIR': tmp}
    print(f'# clone: {clone}\n# TMPDIR: {tmp}\n')

    code, out = run(['git', 'clone', '--quiet', SOURCE, clone], work)
    if code: sys.exit(f'clone failed: {out}')
    # `fetch --tags` first, so `describe --exact-match` resolves against the REMOTE's tag rather
    # than anything a local clone might have inherited — the tag being the remote's is half of what
    # is being checked.
    code, out = run(['git', 'fetch', '--tags', '--quiet'], clone, timeout=1800)
    if code: sys.exit(f'fetch --tags failed: {out}')
    code, out = run(['git', 'checkout', '--quiet', TAG], clone)
    if code: sys.exit(f'checkout {TAG} failed: {out}')
    _, sha = run(['git', 'rev-parse', 'HEAD'], clone)
    dcode, desc = run(['git', 'describe', '--tags', '--exact-match'], clone)
    _, remote_tag = run(['git', 'ls-remote', '--tags', 'origin', f'refs/tags/{TAG}'], clone, timeout=600)
    print(f'## tag {TAG}\nHEAD {sha.strip()}')
    print(f'describe --tags --exact-match: {desc.strip() if dcode == 0 else f"(exit {dcode}) " + desc.strip()}')
    print(f'ls-remote refs/tags/{TAG}: {remote_tag.strip() or "(absent on the remote)"}\n')

    # NO SUBMODULE YET, and that is a correction rather than a shortcut.
    #
    # `release.yml`'s `verify` job checks out with `submodules: false` and runs `npm test` on that
    # tree, so the corpus is ABSENT when the gate the release stands or falls on runs. My first
    # rc.8 measurement ran `submodule update --init` first, which produces a corpus that is present
    # but in FULL mode — a third state neither CI nor a bootstrapped user has — and
    # `docs-status.test.mjs` failed `'full' !== 'cone'`. That failure was my clone's, and it sat in
    # the table looking like the tag's.
    #
    # So the gates run under CI's own condition, and the corpus is initialised afterwards, for the
    # positive checks that are ABOUT the corpus. Which half ran under which condition is printed,
    # because a reader of this report should not have to reconstruct it.
    # THE VERSION OF RECORD, read from the tree under measurement — the string the version sweep
    # is about, and what `@@VERSION_OF_RECORD@@` in a patch resolves to.
    version_of_record = json.loads(
        open(os.path.join(clone, 'package.json'), encoding='utf-8').read())['version']
    print(f'version of record on this tree: {version_of_record}')
    print('gates run with submodules: false — the condition release.yml verify uses\n')
    code, out = run('npm ci --ignore-scripts', clone, env, 3600)
    print(f'npm ci: exit {code}\n')
    if code:
        print(out[-2000:]); sys.exit(1)

    print('## gates')
    gates = [('lint', 'npm run -s lint'), ('type-check', 'npm run -s type-check'),
             ('contract', 'npm run -s contract'), ('gen:check', 'npm run -s gen:check'),
             ('test', 'npm test'),
             ('upgrade-unit', 'node --test tests/upgrade/upgrade-unit.test.mjs'),
             ('commitlint', f'node scripts/ci/commitlint.mjs --base origin/develop --head {TAG}')]
    for name, cmd in gates:
        c, o = run(cmd, clone, env)
        print(f'  {name:14} exit {c}')
        if c and name == 'test':
            print('\n'.join(f'      {n}' for n in failing_names(o)[:10]))

    c, o = run(['git', 'status', '--porcelain'], clone)
    print(f'  tree dirty     {len([l for l in o.splitlines() if l.strip()])} file(s)')
    leftovers = [p for p in os.listdir(tmp) if 'snowarch' in p or 'status-fixture' in p]
    print(f'  TMPDIR leftovers {len(leftovers)}\n')

    print('## controls')
    rows = []
    for ctl in CONTROLS:
        applied, missing = [], []
        for p in ctl['patches']:
            f = os.path.join(clone, p.path)
            src = open(f, encoding='utf-8').read()
            # The ANCHOR is resolved too, not only the replacement: an anchor carrying a placeholder
            # would be counted literally and every such control would report ANCHOR NOT FOUND.
            old_text = resolve(p.old, clone, p.path, version_of_record)
            if src.count(old_text) != 1:
                missing.append(f'{p.path}: anchor x{src.count(old_text)}')
                continue
            # `@@VERSION_OF_RECORD@@` is resolved against the CLONE, so a control aimed at "the
            # version this tree is of record for" is right at an rc and right at a final release.
            # Spelling it was the v2.0.0 finding: the literal `2.0.0-rc.11` is not v2.0.0's version
            # of record, the sweep correctly ignored it, and the harness reported FAIL against the
            # product being right.
            new_text = resolve(p.new, clone, p.path, version_of_record)
            open(f, 'w', encoding='utf-8').write(src.replace(old_text, new_text, 1))
            applied.append(p.path)
        if missing:
            rows.append((ctl['row'], ctl['name'], 'ANCHOR NOT FOUND: ' + '; '.join(missing), 'FINDING'))
            run(['git', 'checkout', '--', '.'], clone)
            continue
        if ctl['dist']:
            run('node scripts/build-dist.mjs', clone, env)
        c, o = run(ctl['test'], clone, env)
        names = failing_names(o)
        if ctl['kind'] == 'degrade-exit':
            ok = c != 0 and ctl['expect'] in o
            got = next((l.strip() for l in o.splitlines() if ctl['expect'] in l), f'exit {c}')
        else:
            ok = c != 0 and any(ctl['expect'] in n for n in names)
            got = next((n for n in names if ctl['expect'] in n), (names[0] if names else f'exit {c}, no named failure'))
        rows.append((ctl['row'], ctl['name'], got, 'PASS' if ok else 'FAIL'))
        run(['git', 'checkout', '--', '.'], clone)
        if ctl['dist']:
            run('node scripts/build-dist.mjs', clone, env)
            run(['git', 'checkout', '--', '.'], clone)

    # ── the positive checks: things that must HOLD, with no degradation ───────────────────────
    # The architect's C20 list mixes these with the degradations (C1 symlinked TMPDIR, C2 the
    # capture reproducing the committed bytes, C6 the corpus hidden, C7 TMPDIR under HOME), and
    # ARC-08-C25's third is one too. They are run here rather than folded into the table above,
    # because "nothing failed" means something different for a check than for a control.
    print('\n## positive checks (must hold, no degradation)')
    # THE CORPUS, THE WAY A USER GETS IT — the bootstrap, not `submodule update --init`.
    #
    # `--init` leaves the corpus in FULL mode; the bootstrap configures sparse `cone`, which is
    # what every real checkout has and what `docs-status.test.mjs` asserts. My rc.8 run used
    # `--init` and produced a third state nobody has, and the resulting `'full' !== 'cone'` sat in
    # the table looking like a defect of the tag.
    #
    # `--mode design --yes --skip-claude-check` is release.yml's own invocation. Verified before
    # running it: no step under `tools/snowarch/lib/steps/` references `~/.claude.json`, and every
    # write is rooted at the checkout — a design-mode bootstrap touches nothing outside the clone.
    boot_code, boot_out = run(
        'node tools/snowarch/bin/snowarch.mjs bootstrap --mode design --yes --skip-claude-check',
        clone, env, 3600)
    mode_line = next((l for l in boot_out.splitlines() if l.startswith('Mode:')), '(no Mode line)')
    print(f'bootstrap --mode design: exit {boot_code}')
    print(f'  {mode_line}')
    dcode, dout = run('node tools/snowarch/bin/snowarch.mjs docs status', clone, env)
    print(f'  docs status: {" | ".join(l.strip() for l in dout.splitlines()[:2])}\n')
    positives = []

    c, o = run('node scripts/make-status-fixtures.mjs --check', clone, env)
    positives.append(('ARC-08-C20', 'the capture reproduces the committed bytes',
                      o.strip().splitlines()[-1] if o.strip() else f'exit {c}',
                      'PASS' if c == 0 else 'FAIL'))

    corpus = os.path.join(clone, 'vendor', 'ServiceNowDocs', 'markdown')
    hidden = corpus + '.hidden'
    if os.path.exists(corpus):
        os.rename(corpus, hidden)
        c, o = run('node scripts/make-status-fixtures.mjs --check', clone, env)
        os.rename(hidden, corpus)
        positives.append(('ARC-08-C20', 'the corpus hidden -> bytes unchanged',
                          o.strip().splitlines()[-1] if o.strip() else f'exit {c}',
                          'PASS' if c == 0 else 'FAIL'))
    else:
        positives.append(('ARC-08-C20', 'the corpus hidden -> bytes unchanged',
                          'vendor/ServiceNowDocs/markdown absent in the clone', 'FINDING'))

    under_home = os.path.join(os.path.expanduser('~'), '.rc-controls-probe')
    os.makedirs(under_home, exist_ok=True)
    try:
        c, o = run('node scripts/make-status-fixtures.mjs --check', clone, {'TMPDIR': under_home})
        positives.append(('ARC-08-C20', 'TMPDIR under HOME -> bytes unchanged',
                          o.strip().splitlines()[-1] if o.strip() else f'exit {c}',
                          'PASS' if c == 0 else 'FAIL'))
    finally:
        shutil.rmtree(under_home, ignore_errors=True)

    # ARC-08-C20 C1, run explicitly rather than only inside the three-layout test: a TMPDIR whose
    # spelling goes through a SYMLINKED prefix. On macOS `/tmp` is a link to `/private/tmp`, so
    # `os.tmpdir()` and the realpath of anything inside it differ — which is the layout that caught
    # the second finding (`toplevel: '/private~'`), and the reason `homeValues` masks both spellings.
    linked_tmp = os.path.join('/tmp', f'rc-controls-linked-{os.getpid()}')
    real = os.path.realpath('/tmp')
    os.makedirs(linked_tmp, exist_ok=True)
    try:
        c, o = run('node --test tests/doctor/status-fixture-capture.test.mjs', clone,
                   {'TMPDIR': linked_tmp})
        line = f'TMPDIR={linked_tmp} (realpath {real}); exit {c}'
        positives.append(('ARC-08-C20', 'the drift test under a symlinked TMPDIR prefix', line,
                          'PASS' if c == 0 else 'FAIL'))
        if c:
            for n in failing_names(o)[:4]:
                positives.append(('ARC-08-C20', '  ^ failing test', n, 'FAIL'))
    finally:
        shutil.rmtree(linked_tmp, ignore_errors=True)

    # ARC-08-C25: the validator refuses a report that cannot answer what it is collected for.
    fixture = os.path.join(clone, 'tests/fixtures/doctor/status-design.json')
    doctored = os.path.join(tmp, 'doctor.json')
    report = json.loads(open(fixture, encoding='utf-8').read())
    report['durationMs'] = None
    open(doctored, 'w', encoding='utf-8').write(json.dumps(report))
    c, o = run(f'node scripts/ci/validate-report.mjs "{doctored}"', clone, env)
    positives.append(('ARC-08-C25', 'a null durationMs is refused',
                      next((l.strip() for l in o.splitlines() if 'durationMs' in l), f'exit {c}'),
                      'PASS' if c != 0 and 'durationMs is null' in o else 'FAIL'))

    print('\n| row | check | line | verdict |')
    print('|---|---|---|---|')
    for r in positives:
        print(f'| {r[0]} | {r[1]} | `{r[2]}` | **{r[3]}** |')

    print(f'\n| row | control | failing test | verdict |')
    print(f'|---|---|---|---|')
    for r in rows:
        print(f'| {r[0]} | {r[1]} | `{r[2]}` | **{r[3]}** |')

    c, o = run(['git', 'status', '--porcelain'], clone)
    n = len([l for l in o.splitlines() if l.strip()])
    print(f'\ngit status --porcelain after all controls: {n} file(s)')
    if n:
        print(o)
    if not KEEP:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main(*parse_argv(sys.argv))

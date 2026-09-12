/**
 * Every generator in the repository, in one list.
 *
 * Four things run generators: `npm run gen`, `npm run lint`, the engine lint's L06, and a person
 * wondering what is generated. A list that lives in only one of them is a list the other three
 * disagree with — which is how a generated file ends up committed stale with CI green.
 *
 * `supportsRoot` is not a detail: `gen-governance` and `gen-roster` take `--root`, so L06 can run
 * them against a fixture tree; the other two resolve from their own location and only ever act on
 * the real repository. L06 says so rather than pretending it checked them.
 */
/**
 * What a failed generator run MEANS: a stale target, or a generator that never ran at all.
 *
 * They arrive the same way — a non-zero exit — and telling them apart is not cosmetic. A
 * generator that crashed produced no output to compare, so "the file differs" is a claim nobody
 * made; it sends a reader to regenerate a file that is fine and, in the doctor, reported a broken
 * toolchain as a stale document. That happened: `gen-readme-tables` imported the server's built
 * tools module, which needs `npm ci`, and on a design-only install E-21 said the README differed.
 *
 * `2` is the generators' own "cannot run" convention. Above that, a crash is recognised by what
 * Node prints when nothing caught the error — a stack, or an `ERR_*` module code — and a missing
 * dependency is separated from every other crash because on a design-only install it is EXPECTED
 * (no `npm ci` by design) and everywhere else it is a fault.
 */
export const MISSING_DEPENDENCY = /ERR_MODULE_NOT_FOUND|Cannot find (package|module)/;
const CRASH = /\n\s+at\s|\b[A-Za-z]*Error\b|\bERR_[A-Z_]+\b/;

export function classifyFailure({ status, out = '' }) {
  const first = out.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  if (status === 2) return { kind: 'cannot-run', dependency: false, reason: first };
  if (CRASH.test(out) && !out.includes('--- a/')) {
    const dependency = MISSING_DEPENDENCY.test(out);
    // The reason is the line Node PRINTS THE ERROR ON, which is not the first line that mentions
    // one: above the stack Node echoes the offending source, and `throw new TypeError('…')` is a
    // line about an error rather than an error. So the match is anchored — a line that BEGINS with
    // an error class, which is the shape of `TypeError: …` and of `Error [ERR_MODULE_NOT_FOUND]: …`.
    // `TypeError: …` and `Error [ERR_MODULE_NOT_FOUND]: …` both match; `throw new TypeError('…');`
    // does not (no colon after the identifier), and neither does `node:internal/…:301` (a colon
    // with no space after it is a path, not a message).
    const line = out.split('\n').map((l) => l.trim())
      .find((l) => /^(?:Uncaught\s+)?[A-Za-z_$][\w$]*(?:\s*\[[^\]]+\])?:\s/.test(l)) ?? first;
    return { kind: 'cannot-run', dependency, reason: line.slice(0, 160) };
  }
  return { kind: 'stale', dependency: false, reason: first };
}

export const GENERATORS = [
  {
    id: 'gen-governance',
    script: 'scripts/gen-governance.mjs',
    supportsRoot: true,
    targets: [
      '.claude/rules/00-mode-and-mcp-gate.md',
      'docs/MODES-AND-PRESETS.md',
      'governance/mcp-protocols.md',
      'docs/TROUBLESHOOTING.md',
      '.claude/settings.json',
    ],
  },
  {
    // ARC-07-S10: the review screens, the migration plan and the terminal hand-off are included in
    // `docs/MODES-AND-PRESETS.md` from the one definition of each. A separate generator from
    // `gen-governance` on purpose — that one owns the PRESETS block in the same file, and two
    // renderers inside one process would each compute their result from the pre-write text and
    // clobber the other. Two processes, in order, each leaving the other's block alone.
    id: 'gen-modes',
    script: 'scripts/gen-modes.mjs',
    supportsRoot: false,
    targets: ['docs/MODES-AND-PRESETS.md'],
  },
  {
    // ARC-08-S01: the ARCHITECTURE "Doctor" section's JSON shape and renderer sample, rendered from
    // the real modules with a fixture registry. A documentation block that embeds a moving value
    // goes stale the first time the value moves, and nobody re-reads a section they already
    // believe.
    id: 'gen-doctor-docs',
    script: 'scripts/gen-doctor-docs.mjs',
    supportsRoot: false,
    targets: ['docs/ARCHITECTURE.md'],
  },
  {
    // ARC-09-S08. The list `main`'s branch protection is set from, generated from `ci.yml` so a
    // renamed cell is a failing `gen-all --check` rather than a required context nobody produces.
    id: 'gen-required-contexts',
    script: 'scripts/gen-required-contexts.mjs',
    supportsRoot: false,
    targets: ['tests/fixtures/required-contexts.json'],
  },
  {
    // Same target as gen-doctor-docs, different regions: both edit `docs/ARCHITECTURE.md` and
    // neither reads the other's blocks, so the order they run in does not matter — each replaces
    // between its own markers and leaves the rest of the file byte-identical.
    id: 'gen-inputs-docs',
    script: 'scripts/gen-inputs-docs.mjs',
    supportsRoot: false,
    targets: ['docs/ARCHITECTURE.md'],
  },
  {
    id: 'gen-roster',
    script: 'scripts/gen-roster.mjs',
    supportsRoot: true,
    targets: ['docs/ARCHITECTURE.md'],
  },
  {
    // ARC-06 fix: the recipe block embeds the docs pin, which moves on every bump. Generated, so a
    // bump regenerates it instead of failing the parity test by construction.
    id: 'gen-docs-recipe',
    script: 'scripts/gen-docs-recipe.mjs',
    supportsRoot: true,
    // Three since ARC-06-S06: the published block, and the two launcher files the Node-free
    // bootstrap will source. One recipe, three readers, no hand-typed copy.
    targets: [
      'docs/ARCHITECTURE.md',
      'tools/snowarch/launcher/docs-recipe.sh',
      'tools/snowarch/launcher/docs-recipe.ps1',
    ],
  },
  {
    // ARC-06-S09: the closing block's strings, so the Node-free launchers print the same bytes.
    id: 'gen-text',
    script: 'scripts/gen-text.mjs',
    supportsRoot: true,
    targets: ['tools/snowarch/lib/text.json'],
  },
  {
    // ARC-06-S10: the sentences `bootstrap.sh` prints. bash cannot read JSON, so they are generated
    // into a marked region — the launcher runs on machines with no Node to check it, which is
    // exactly where a drifted copy would go unnoticed.
    id: 'gen-launcher-text',
    script: 'scripts/gen-launcher-text.mjs',
    supportsRoot: true,
    // Two since ARC-06-S11: the PowerShell launcher shares the same sentences in its own syntax.
    targets: ['bootstrap.sh', 'bootstrap.ps1'],
  },
  {
    id: 'gen-retired-names',
    script: 'packages/contract/gen-retired-names.mjs',
    supportsRoot: false,
    targets: ['packages/contract/retired-names.json'],
  },
  {
    id: 'gen-readme-tables',
    script: 'scripts/gen-readme-tables.mjs',
    supportsRoot: false,
    // The SERVER package's README — the presets, families, bundles and error-code tables rendered
    // from `dist/contract.json`. Listed as `README.md` until ARC-06-S13 looked: that is a different
    // document from the root README, and the root one has never had a generated block.
    targets: ['packages/snowarch/README.md'],
  },
  {
    // ARC-06-S13, and LAST on purpose: it reads `text.json`, which `gen-text` writes, and composes
    // `README.md` from `docs/INSTALL.md` — so anything that changes either has to have run first.
    id: 'gen-readme',
    script: 'scripts/gen-readme.mjs',
    supportsRoot: true,
    targets: ['docs/INSTALL.md', 'README.md'],
  },
];

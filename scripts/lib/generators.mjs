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
    targets: ['bootstrap.sh'],
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
    targets: ['README.md'],
  },
];

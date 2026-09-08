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

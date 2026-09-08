/**
 * The preset table inside `docs/MODES-AND-PRESETS.md`, between ARC-02-S09's markers.
 *
 * A block-in-file target: everything outside the two marker lines is hand-written and stays exactly
 * as it is — the byte-exact `"true"`/`"false"` note, `PRESET_FLAGS_MISMATCH`, and the rule that the
 * preset wins over disagreeing stored flags. Only the table is data.
 *
 * S09 hand-copied that table from `01` §6.3 and verified it row for row, so the first run of this
 * renderer must produce those same bytes. If it does not, one of the two is wrong about what the
 * server does, and that is worth finding out before the generator takes ownership.
 */

/**
 * The `Use it when…` column. Literals, keyed by preset name: it is advice about when to choose a
 * preset, which no amount of flag data implies. A preset with no entry gets an empty cell rather
 * than a guess — the flags are still rendered, so the row is never missing.
 */
const USE_WHEN = {
  'read-only': 'Auditing, reviewing, designing against a real instance; **the only preset a `prod` instance may hold without `--ack-prod`**',
  'pdi-developer': 'Building on a PDI / dev / test instance when Now Assist or Fluent are not wanted',
  full: "Everything on; **the system's proposal for every `pdi` / `dev` / `test` instance (D-05)**; NOW_ASSIST needs a licence, FLUENT needs `@servicenow/sdk` — both are probed and annotated before the user confirms",
  custom: 'Anything else; dependency rule enforced',
};

/** `custom` is not in `contract.presets` — it is the absence of a preset, so it is a literal row. */
const CUSTOM_ROW = '| `custom` | six explicit toggles | | | | | | ';

export const target = 'docs/MODES-AND-PRESETS.md';

export const markers = {
  begin: /^<!-- PRESETS:BEGIN/,
  end: /^<!-- PRESETS:END -->$/,
};

export function render(ctx) {
  const { contract } = ctx;
  const flags = contract.flags.map((f) => f.name);
  const short = (name) => name.replace('_ENABLED', '');

  const rows = Object.entries(contract.presets).map(([name, values]) => {
    const cells = flags.map((f) => values[f] ?? 'false');
    return `| \`${name}\` | ${cells.join(' | ')} | ${USE_WHEN[name] ?? ''} |`;
  });

  return [
    `| Preset | ${flags.map(short).join(' | ')} | Use it when… |`,
    `|${'---|'.repeat(flags.length + 2)}`,
    ...rows,
    `${CUSTOM_ROW}${USE_WHEN.custom ?? ''} |`,
  ].join('\n');
}

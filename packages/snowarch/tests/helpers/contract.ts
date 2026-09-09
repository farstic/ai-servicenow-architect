/**
 * The catalogue's expected size, in one place.
 *
 * It was a literal in `tests/tools/parity.test.ts` and a comment in `scripts/extract-tools.mjs`,
 * which is two numbers that have to be changed together and one that will not be. ARC-05-S08 gave
 * the contract suite a third use, so it moved here and both read it.
 *
 * The history is the reason the number is worth stating at all: ARC-04-S07 raised it to 398 with
 * `snow_us_capture_target_set`, and ARC-04-S08 took it back to 397 by removing
 * `snow_rpt_report_generate` while KEEPING the two script-execution stubs registered — removing
 * their names would turn a clear refusal into `UNKNOWN_TOOL`.
 *
 * `contract.toolCount` is DERIVED from the catalogue and never from this constant, so the contract
 * cannot disagree with the code even when the number below lags a change by one commit.
 */
export const EXPECTED_TOOL_COUNT = 397;

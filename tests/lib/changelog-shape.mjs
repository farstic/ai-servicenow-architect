/**
 * ARC-09-C62 — what makes an `## Unreleased` block a real release block.
 *
 * ARC-09-C12c's defect was that `extractNotes` stopped at the first `###` after `### Notes`, so every
 * hand-written group a pull request had added was dropped when the release emptied the section. The
 * test written for it needed the block under test to have the SHAPE that could fail that way — a
 * second heading below the Notes — and it asked for that with `> 50 lines`.
 *
 * A line count is a proxy, and the proxy started failing honest work: the 2.0.2 notes arrived at 49
 * lines, 2.0.3 at 48, 2.0.4 at 44. Three patches in a row had to grow to satisfy a number that was
 * standing in for a structure. So the structure is asserted instead.
 *
 * ANY GROUP, not an enumerated three. The assertion beside the count matched
 * `/^### (Added|Fixed|Changed)/m`, and `Internal` — the group this changelog uses most — was not in
 * it. Every shipped block passed only because each happened to carry a `Fixed` entry; 2.0.3 was one
 * entry away from being Internal-only, and the first Internal-only release would have failed a guard
 * for the wrong reason once the count was gone.
 */

/** `### Notes`, `### Fixed`, … with the line each was found on. */
const headings = (block) => [...String(block).matchAll(/^### (.+)$/gm)]
  .map((m) => ({ name: m[1].trim(), at: m.index ?? 0 }));

/**
 * What the block is missing to be a release block, as a list of sentences. Empty means it is one.
 *
 * Three requirements, each the thing C12c's proxy was standing in for:
 *   1. a `### Notes` heading, which is where the hand-written prose lives;
 *   2. prose under it — a stand-in with an empty Notes block cannot carry anything to lose;
 *   3. at least one further `### <Group>` heading carrying at least one `-` bullet, which is the
 *      second heading the dropped-groups defect needed in order to happen at all.
 */
export function shapeProblems(block) {
  const text = String(block ?? '');
  const found = headings(text);
  const problems = [];

  const notes = found.find((h) => h.name === 'Notes');
  if (!notes) return ['no `### Notes` heading'];

  const groups = found.filter((h) => h.at > notes.at && h.name !== 'Notes');
  const notesBody = text.slice(notes.at + '### Notes'.length,
    groups.length > 0 ? groups[0].at : text.length);
  if (!/\S/.test(notesBody.replace(/^\s+/, ''))) problems.push('the `### Notes` block has no prose');

  if (groups.length === 0) {
    problems.push('no `### <Group>` heading below `### Notes` — the shape the dropped-groups defect needs');
    return problems;
  }

  // At least ONE group has to carry a bullet. A heading with nothing under it is the same empty
  // stand-in the count was there to refuse, wearing a group's name.
  const bulleted = groups.some((g, i) => {
    const end = i + 1 < groups.length ? groups[i + 1].at : text.length;
    return /^[-*] \S/m.test(text.slice(g.at, end));
  });
  if (!bulleted) problems.push('no `### <Group>` heading carries a bullet');
  return problems;
}

/**
 * Text helpers shared by the generators.
 *
 * `firstSentence` lives here rather than in either generator because "the first sentence" has to
 * mean the same thing everywhere a description is squeezed into a table cell. `gen-roster.mjs`
 * needs it today for the sub-agent table (ARC-02-S07 criterion 3); `gen-readme-tables.mjs` does
 * not need it yet — its four blocks carry no prose column — and this is where it imports from
 * when it does.
 */

/**
 * The first sentence of a description, for a table cell.
 *
 * Ends at `. `, `? ` or `! ` — a full stop that is followed by a space and is not part of an
 * abbreviation or a version number. The exclusions are the ones that actually occur in this
 * repository's descriptions: `e.g.`, `i.e.`, `etc.`, `vs.`, `Inc.`, and any `N.N` version.
 * Returns the whole string, trimmed, when there is no sentence break.
 */
export function firstSentence(text) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const ABBREV = /(?:\b(?:e\.g|i\.e|etc|vs|Inc|Ltd|approx|no|No|cf|al)|\b[A-Z]|\d)\.$/;
  for (let i = 0; i < s.length; i += 1) {
    if (!'.?!'.includes(s[i])) continue;
    if (i + 1 < s.length && s[i + 1] !== ' ') continue;   // "2.0.0", "a.k.a" mid-token
    const head = s.slice(0, i + 1);
    if (s[i] === '.' && ABBREV.test(head)) continue;      // "e.g." is not the end of a sentence
    return head;
  }
  return s;
}

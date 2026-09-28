/**
 * ARC-07-C35b — the launcher audit's two missing pieces: a real string extractor, and command tracing.
 *
 * ARC-07-C35 shipped the audit with a key built by NORMALISING A LINE with regexes, and measured that it
 * resolved 12 of 70 asserted launchers. The row named both reasons, and both are visible in the failures:
 *
 *   - `expect(sv09.command).toBe(`${SERVER_CLI} upgrade`)` keyed as `sv09.command`, because the
 *     normaliser strips `expect(` and `.toBe(` but not the EXPRESSION between them. The key was assertion
 *     scaffolding, and no product line can carry it.
 *   - `store <command>` matches a pinned `store.mjs` and a deriving `store-command.ts`, so the
 *     architect's own named control pair — `store --help` reaches the engine, `store migrate --help`
 *     reaches the server, two commands apart in one file — could not be told apart at all.
 *
 * SO THIS PARSES INSTEAD OF NORMALISING, with `typescript`, which is already a pinned dependency here and
 * reads both `.mjs` and `.ts`. That is not gold-plating: the first reason above is not a regex that needs
 * one more case, it is a regex being asked to know where an expression ends. The extractor takes the
 * ARGUMENTS of the assertion call and nothing else, so `r.text`, `sv09.command` and
 * `status.configErrors[0]?.message` are excluded by construction rather than by another pattern.
 *
 * WHAT `sentence` MEANS HERE, and it is one definition for both sides: the prose a literal carries, with
 * every non-literal — an interpolation, a spelling constant, the launcher itself — replaced by one MARK.
 * A template literal contributes its cooked text with MARKs at its spans; `+` concatenation is joined; a
 * regex contributes its source with the escaping undone. TypeScript hands back cooked string values, so
 * `'a\\nb'` does not have to be unescaped by hand.
 *
 * COMMAND TRACING IS RULE 6 MECHANISED, and it reads the product's own route table rather than a list
 * written here: `COMMANDS` in `tools/snowarch/lib/cli.mjs` says which commands are `raw`, and the frame's
 * documented rule is that for a raw command everything after it belongs to the SERVER — including
 * `--help` once a sub-command is named — while a bare `--help` is the frame's own. So a case that spawns
 * `['store', '--help']` is answered by the engine and one that spawns `['store', 'migrate', '--help']` by
 * the server, which is exactly the pair the row asks to be told apart, decided by the argv the case runs.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { COMMANDS } from '../../tools/snowarch/lib/cli.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A sentinel no source contains, written as an escape so it is visible in a diff. */
export const MARK = '\u0001';

/** Both spellings of both launchers. `.\snowarch.cmd` appears in source as `.\\snowarch.cmd`. */
export const LAUNCHER = /\.\/snowarch|\.\/bootstrap\.sh|\.\\snowarch\.cmd|\.\\bootstrap\.cmd/;

/** A spelling read from the process renders whatever machine runs it; one given a platform does not. */
const READS_THE_PROCESS = new Set(['spellings', 'cliSpelling', 'bootstrapSpelling']);

/** The values `process.platform` can take that this repository drives by name. */
const PLATFORMS = new Set(['win32', 'linux', 'darwin']);

/**
 * ARC-07-C35's TARGET RULE, kept exactly: a launcher LITERAL, or a spelling INTERPOLATED INTO A STRING.
 *
 * A bare spelling argument is NOT a target, and that is measured rather than stylistic: C35's second
 * design treated `formatResult(r, SPELL)` — a line that THREADS a spelling and asserts nothing about a
 * launcher — as a target and produced 106 false ones, which would have made the baseline meaningless.
 * My first version of this extractor accepted any identifier that looked like a spelling and took the
 * count from 58 unresolved to 195, which is that same mistake arriving through a parser instead of a
 * regex. A parser is only better at what it is asked; this is what it is asked.
 */
const scriptKind = (file) => (/\.tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);

export const parse = (file, text) =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/**
 * A launcher SPELLED OUT becomes the same MARK an interpolation does.
 *
 * Without this, a pinned product line keeps `./snowarch` in its prose while a test that interpolates a
 * spelling has a MARK there, and the two can never match — which is exactly how the architect's control
 * pair failed its FIRST direction while passing its second: `tools/snowarch/lib/store.mjs` spells the
 * launcher (it is generated, and still on ARC-07-C31's exemption list), so `usage: MARK store <command>`
 * found nothing in the engine. Marking both sides is what makes "the same sentence" mean the same thing on
 * both sides of the comparison, which is the property this audit is built on.
 */
const markLaunchers = (text) => text.replace(new RegExp(LAUNCHER.source, 'g'), MARK);

/** `/usage: x/` → `usage: x` — the source without its slashes, flags, or escaping. */
const regexProse = (raw) => raw
  .replace(/^\/|\/[a-z]*$/g, '')
  .replace(/\\([.\/\\()[\]{}^$*+?|\-])/g, '$1');

/**
 * Does this literal SPELL a launcher? A regex is unescaped first, and that is not a detail.
 *
 * `/run \.\/snowarch doctor/` contains `\.\/snowarch`, not `./snowarch`, so a detector that tested the
 * raw text saw no launcher and skipped the assertion entirely — my own case caught it. ARC-07-C35's
 * line-based `sentence()` unescaped before matching; the parser has to do the same or it is worse than
 * what it replaced at exactly the shape this repository writes most.
 */
const spellsLauncher = (node) => {
  // `node.text`, THE COOKED VALUE — never `getText()`, which is the SOURCE. A Windows launcher is written
  // `'.\\snowarch.cmd'` in a source file and IS `.\snowarch.cmd` once cooked, and `LAUNCHER` describes the
  // cooked form. Testing the source meant every Windows-spelled literal in the repository was invisible to
  // this audit: 24 lines across 11 test files, including the seven engine literals ARC-07-C31 slice 2 fixed
  // and the seventeen server ones slice 3 fixed — so `EXPECTED_RENDERING`, whose whole purpose is the
  // win32 cell, had only ever seen POSIX. Measured: the fixture
  // `assert.equal(out, '.\\snowarch.cmd doctor')` yielded 0 sites and `'./snowarch doctor'` yielded 1.
  if (ts.isStringLiteralLike(node)) return LAUNCHER.test(node.text);
  /*
   * A REGEX IS READ, UNESCAPED FIRST — ARC-07-C35c's regex arm, switched on with the three pieces that stop it
   * crying wolf. `/run \.\/snowarch doctor/` holds `\.\/snowarch`, not `./snowarch`, so this is where the
   * escaping has to come off, and `assert.match(x, /…/)` is the shape this repository writes most.
   *
   * Switching it on alone reported THIRTEEN correct tests as mismatches, which is why it waited for: a
   * product-side kind that knows `${spellings({ platform: 'linux' }).cli}` is PINNED though it is an
   * interpolation; the committed generated pages indexed as product artefacts, because a page asserted by
   * `install-page.test.mjs` is POSIX by rule 3 while its runtime twin derives; and a way to tell a GENERATOR's
   * sentence from the runtime sentence it writes, since the two carry the same words by construction.
   */
  if (ts.isRegularExpressionLiteral(node)) return LAUNCHER.test(regexProse(node.getText()));
  return false;
};

/**
 * The prose a node carries, with MARK wherever something is not a literal.
 *
 * This is the whole of piece (a). It walks the expression rather than the text, so what comes back is
 * the sentence the test asserts — never the expression it asserts it about.
 */
/** The method calls whose ARGUMENT is the claim and whose receiver is only the haystack. */
const SEARCHES = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'search',
  'match', 'contains']);

/** A node that CARRIES prose: a literal, a template, a regex, an array of them, or a `+` of them. */
const isProse = (node) => ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)
  || ts.isRegularExpressionLiteral(node) || ts.isArrayLiteralExpression(node)
  || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
  || (ts.isParenthesizedExpression(node) && isProse(node.expression));

export function proseOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return markLaunchers(node.text);
  if (ts.isRegularExpressionLiteral(node)) return markLaunchers(regexProse(node.getText()));

  if (ts.isTemplateExpression(node)) {
    // The head, then every span: the interpolation becomes one MARK and the literal text after it stays.
    return markLaunchers(node.head.text
      + node.templateSpans.map((span) => MARK + span.literal.text).join(''));
  }

  // `'a' + b + 'c'` — the literals are prose and everything else is a MARK.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return proseOf(node.left) + proseOf(node.right);
  }

  if (ts.isParenthesizedExpression(node)) return proseOf(node.expression);

  /*
   * CONTAINERS CARRY PROSE, and dropping them mislabelled nine sites.
   *
   * `assert.equal(out, ['the corpus is missing', `run ${CLI} docs sync`].join('\n'))` used to contribute
   * `\n` — the join's separator and nothing else — because only a call's ARGUMENTS were read. The site was
   * then filed as "the assertion is about the launcher alone", which is a false reason: there is a sentence,
   * and the extractor was not looking at it. `carriesLauncher` walks INTO these containers, so the site was
   * declared and then described wrongly, which is worse than not seeing it.
   */
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((e) => proseOf(e)).join(' ');
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties
      .map((prop) => (ts.isPropertyAssignment(prop) ? proseOf(prop.initializer) : MARK))
      .join(' ');
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return ts.isBlock(node.body) ? MARK : proseOf(node.body);
  }

  // `new RegExp(`usage: ${CLI} …`)`, `esc(FRAME_CLI)`, and `[…].join('\n')`: the prose is in the arguments
  // AND, for a method call, in the receiver — which is where an array or a template usually sits.
  if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
    const fromArgs = (node.arguments ?? []).map((a) => proseOf(a));
    const callee = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      ? node.expression : null;
    /*
     * ARC-07-C35c — A SEARCH CALL'S SENTENCE IS ITS ARGUMENT, and the receiver is the haystack.
     *
     * `proseOf` folded both, so `\`prefix run ${CLI} docs sync suffix\`.includes(\`run ${CLI} docs sync\`)`
     * contributed the needle TWICE — once inside the haystack and once as the argument — and
     * `startsWith` did the same. Measured on planted cases: the needle appeared 2× in each. A sentence with
     * its own middle repeated matches no product line, and `bySentence` is a containment test, so the site
     * was unresolvable for a reason that had nothing to do with the launcher.
     *
     * The haystack is never the claim: `x.includes(y)` asserts something about Y. The other direction is
     * deliberately NOT in this list — `/re/.test(line)` puts the expectation in the RECEIVER, and `.join(sep)`
     * below builds the expectation from the receiver — so the list is the calls that SEARCH, and everything
     * else keeps both sides.
     */
    if (callee && SEARCHES.has(callee.name.text)) return fromArgs.join(' ');

    // `.join(sep)` is the shape this repository writes most, and the separator is part of the sentence.
    if (callee && callee.name.text === 'join' && ts.isArrayLiteralExpression(callee.expression)) {
      const sep = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
        ? node.arguments[0].text : ' ';
      return callee.expression.elements.map((e) => proseOf(e)).join(sep);
    }
    /*
     * ARC-07-C35b, fourth head — THE RECEIVER CONTRIBUTES ONLY WHEN IT IS ITSELF PROSE.
     *
     * Prepending `proseOf(receiver)` for every method call was a regression of the third head: for
     * `assert.ok(text.includes(`run ${CLI} docs sync`))` the receiver is an IDENTIFIER, so the sentence
     * began with a MARK and could never match a product line. Measured on the real tree: five named sites —
     * `bootstrap-plan:306`/`:828`, `cli-help:126`/`:134` and `store-forwarder:73`, C35's own control — all
     * led with a MARK, and each was then filed with a false "assembles" reason.
     */
    const fromReceiver = callee && isProse(callee.expression) ? proseOf(callee.expression) : '';
    return [fromReceiver, ...fromArgs].filter((x) => x !== '').join(' ');
  }

  // Everything else — an identifier, a property access, a call result — is not prose.
  return MARK;
}

/**
 * True when this node ASSERTS a launcher: a literal that spells one, or a string that interpolates one.
 *
 * `interpolatesSpelling` is what keeps a threaded spelling out: `${SPELL.cli}` inside a template is a
 * launcher rendered into prose, while `formatResult(r, SPELL)` is a spelling being passed to a function.
 */
function carriesLauncher(node, spellings) {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (spellsLauncher(n)) { found = true; return; }
    // A spelling interpolated INTO a string: a template span, or `'prose' + CLI`.
    if (ts.isTemplateExpression(n)
      && n.templateSpans.some((span) => mentionsSpelling(span.expression, spellings))) {
      found = true; return;
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const sides = [n.left, n.right];
      const prose = sides.some((side) => ts.isStringLiteralLike(side));
      const spelling = sides.some((side) => mentionsSpelling(side, spellings));
      if (prose && spelling) { found = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

/**
 * The kind an expectation states INLINE: `${spellings({ platform: 'linux', env: {} }).cli}` is PINNED.
 *
 * ARC-07-C35's own named control site — `tools/snowarch/tests/store-forwarder.test.mjs:73` — was reported
 * DERIVED against its own "PINNED POSIX" comment, because the kind was only ever read from a NAMED constant
 * and a template span has no name. `mentionsPinned` already knew how to read a call; the expectation did not.
 */
function inlineKind(node, sf, from) {
  let kind = null;
  const walk = (n) => {
    if (kind) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) {
        kind = pinsShell(n, sf, from) ? 'PINNED' : 'DERIVED'; return;
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return kind;
}

/** A named spelling constant, or a spelling call, appearing in this expression. */
function mentionsSpelling(node, known) {
  const has = typeof known === 'function' ? known : (name) => known.has(name);
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && has(n.text)) { hit = true; return; }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) { hit = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/** A launcher written out in a literal — the expectation is PINNED rather than derived. */
function hasLauncherLiteral(node) {
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (spellsLauncher(n)) { found = true; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return found;
}

/**
 * Every `const X = <spelling call>` in a file, and whether that spelling READS THE PROCESS.
 *
 * `const SERVER_CLI = esc(cliSpelling())` is DERIVED — it renders the machine running the test, which is
 * the property rule 1 is about. `cliSpelling('win32', {})` is PINNED: a fixture that names its platform.
 */
export function spellingConstants(sf) {
  const kinds = new Map();
  const walk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const call = spellingInitializer(node.initializer);
      if (call) kinds.set(node.name.text, pinsShell(call) ? 'PINNED' : 'DERIVED');
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return kinds;
}

/**
 * Does this spelling call PIN a shell? Read what the PLATFORM VALUE IS — ARC-07-C35c.
 *
 * The first rule was "an argument, and no mention of `process`", which is a proxy and it broke both ways.
 * Measured on planted cases:
 *
 *   - `const plat = process.platform; const S = spellings({ platform: plat, env: {} });` then a hard-coded
 *     `./snowarch` asserted against `render(S)` came back **EXPECTED_RENDERING** — the audit vouching for a
 *     POSIX literal that follows the RUNNER's shell, which is red on any Windows cell. A false negative, which
 *     is the bar this whole arc merges on.
 *   - the same spelling asserted as `${S.cli}` came back **PINNED**, so a deriving expectation against a
 *     deriving product line would have been reported as a disagreement. A false positive in the same breath.
 *
 * Both came from asking about the word `process` instead of about the value. The value is what decides: a
 * platform NAMED as a string is pinned, and anything else — a property off `process`, a variable, a call — is
 * the runner's. One hop through a local declaration, because `const WIN = { platform: 'win32', env: {} }` is
 * this repository's idiom and `spellings(WIN)` is the same thing said in two lines.
 *
 * `sf` and `from` are optional: `spellingConstants` walks a whole file and has no assertion to resolve from,
 * and without them an identifier is simply not resolvable, which is the safe answer — not pinned.
 */
export function pinsShell(call, sf = null, from = null) {
  if (!call || call.arguments.length === 0) return false;
  const [first] = call.arguments;

  // `cliSpelling('win32', {})` — the platform is positional.
  if (ts.isStringLiteralLike(first)) return PLATFORMS.has(first.text);

  // `spellings({ platform: … })`, or `spellings(WIN)` one hop away.
  const object = ts.isObjectLiteralExpression(first) ? first : resolveObject(first, sf, from);
  if (!object) return false;
  const platform = object.properties.find((prop) => ts.isPropertyAssignment(prop)
    && ts.isIdentifier(prop.name) && prop.name.text === 'platform');
  if (!platform || !ts.isPropertyAssignment(platform)) return false;
  return namesPlatform(platform.initializer, sf, from);
}

/** An object literal reached through one local declaration, or null. */
function resolveObject(node, sf, from) {
  if (!sf || !from || !ts.isIdentifier(node)) return null;
  const decl = declarationInScope(sf, from, node.text);
  return decl?.initializer && ts.isObjectLiteralExpression(decl.initializer) ? decl.initializer : null;
}

/** A platform NAMED as a string, directly or one local declaration away. */
function namesPlatform(node, sf, from) {
  if (ts.isStringLiteralLike(node)) return PLATFORMS.has(node.text);
  if (!sf || !from || !ts.isIdentifier(node)) return false;
  const decl = declarationInScope(sf, from, node.text);
  return Boolean(decl?.initializer && ts.isStringLiteralLike(decl.initializer)
    && PLATFORMS.has(decl.initializer.text));
}

/**
 * The kind of a spelling constant AS SEEN FROM one assertion — nearest scope wins, not last in the file.
 *
 * `spellingConstants` builds one table keyed by name, so two cases that both write `const cli = …` with
 * different kinds collapse into whichever appears later. Measured on a two-case fixture: a DERIVED case and
 * a PINNED case both came back PINNED, so the derived one could have hard-coded a launcher and passed. The
 * walk starts at the assertion and climbs, which is what a reader of that case would do.
 */
function kindInScope(sf, assertion, name, fileWide) {
  let scope = assertion.parent;
  while (scope) {
    let found = null;
    const scan = (n) => {
      if (found) return;
      // Do not descend into a NESTED function: its declarations are not in this scope.
      if (n !== scope && ts.isFunctionLike(n)) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
        const call = findSpellingCall(n.initializer);
        if (call) found = pinsShell(call, sf, n) ? 'PINNED' : 'DERIVED';
        return;
      }
      ts.forEachChild(n, scan);
    };
    scan(scope);
    if (found) return found;
    scope = scope.parent;
  }
  return fileWide.get(name) ?? null;
}

/**
 * The spelling call an initializer IS — not one it merely contains. ARC-07-C35b, fourth head.
 *
 * `const asPage = r.command.replace(spellings().cli, posix)` registered `asPage` as a DERIVED spelling,
 * which is a transformation of one, not one. A single-argument wrapper still counts, because
 * `const SERVER_CLI = esc(cliSpelling())` is this repository's idiom and `esc` is a formatter; a call with a
 * RECEIVER or more than one argument is doing something else.
 */
function spellingInitializer(node) {
  let n = node;
  while (n) {
    if (ts.isParenthesizedExpression(n) || ts.isAwaitExpression(n) || ts.isAsExpression(n)) {
      n = n.expression; continue;
    }
    if (ts.isPropertyAccessExpression(n)) { n = n.expression; continue; }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text : null;
      if (name && READS_THE_PROCESS.has(name)) return n;
      // A pure single-argument wrapper: `esc(cliSpelling())`.
      if (name && n.arguments.length === 1) { n = n.arguments[0]; continue; }
      return null;
    }
    return null;
  }
  return null;
}

function findSpellingCall(node) {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) { hit = n; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * The VALUE an assertion is about — and whether the case pinned the shell that produced it.
 *
 * WITHOUT THIS THE AUDIT CRIES WOLF. Once launchers inside regexes were detected, thirteen sites were
 * reported as "a pinned expectation against a product line that DERIVES", and every one of them was
 * CORRECT code: `assert.match(MODE_VARIANTS.unconfigured(win), /\.\\snowarch\.cmd mode live/)` supplies a
 * win32 spelling to the product and asserts the win32 rendering, which is precisely the pattern ARC-07-C31
 * established — drive both platforms by argument, assert each spelling. The product line derives, the
 * literal is the expected OUTPUT, and the two agree.
 *
 * So a launcher literal is a PINNED EXPECTATION only when nothing pinned the shell behind the value. When
 * the subject carries a pinned spelling, the literal is an expected rendering and a deriving product line
 * is what should be there.
 *
 * ONE HOP THROUGH A LOCAL VARIABLE, because that is what the cases actually write:
 * `const vWin = renderVersion(info, win).join('\n')` on one line and the assertion on the next. One hop is
 * bounded and enough; a second would be dataflow analysis, and an audit that needs that is the wrong shape.
 */
function subjectOf(node) {
  const { expression } = node;
  // `expect(subject).toContain(…)` — the subject is the argument of the `expect` call in the chain.
  if (ts.isPropertyAccessExpression(expression)) {
    let inner = expression.expression;
    while (inner && !ts.isCallExpression(inner)) {
      inner = ts.isPropertyAccessExpression(inner) || ts.isNonNullExpression(inner) ? inner.expression : null;
    }
    if (inner && ts.isIdentifier(inner.expression) && inner.expression.text === 'expect') {
      return inner.arguments[0] ?? null;
    }
  }
  // `assert.equal(subject, expected)` and friends.
  return node.arguments[0] ?? null;
}

/**
 * ARC-07-C35b — THE NARROW RULE FOR `EXPECTED_RENDERING`, as the architect ruled it, with the fourth head's
 * two corrections.
 *
 * The question is whether a pinned shell was DRIVEN INTO the call whose result is asserted — not whether the
 * case mentions one somewhere, which is the wide rule that hid a hard-coded POSIX assertion against the
 * server's deriving line.
 *
 * `argv` NO LONGER FORBIDS IT OUTRIGHT (item 11). The premise "an argv means nothing was driven" is true of a
 * CHILD PROCESS — a spawned doctor renders the runner's shell whatever the case says — and false of the
 * frame's in-process entry, where `cli(['doctor'], { platform: 'win32', env: {} })` carries both. So the
 * refusal is for a spawn: an argv whose own call received no pinned ctx.
 */
function drivenPinnedShell(sf, assertion, subject, isPinnedName, argv, argvCall, bearing) {
  if (!subject) return false;
  // A spawn drives the runner's shell, not the case's. An in-process entry that was HANDED a ctx does not.
  if (argv && !(argvCall && receivesPinned(sf, assertion, argvCall, isPinnedName, bearing))) return false;

  const calls = callsBehind(sf, assertion, subject);
  return calls.some((call) => receivesPinned(sf, assertion, call, isPinnedName, bearing));
}

/** The cooked text of a literal node, with a template's spans dropped. */
const cookedText = (node) => {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isRegularExpressionLiteral(node)) return regexProse(node.getText());
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => span.literal.text).join(' ');
  }
  return '';
};

/** Which spelling the assertion's own literals carry — ARC-07-C35b item 13, so a count can be asserted. */
const WINDOWS_SPELLING = /\.\\snowarch\.cmd|\.\\bootstrap\.cmd/;
const POSIX_SPELLING = /\.\/snowarch|\.\/bootstrap\.sh/;

/**
 * The LITERALS that carry the launcher, not the whole assertion argument that contains them.
 *
 * This is the difference between excluding the expectation and excluding everything. With `assert.ok(X)` the
 * bearing argument IS the subject expression, so filtering by overlap with it removed every inner argument —
 * including the `win` that `renderVersion(info, win)` receives — and the chain walk found nothing to pin.
 * Excluding the launcher-bearing LITERAL keeps both cases right: `store-forwarder:73`'s pinned call sits
 * inside that literal and stays excluded, while a ctx driven into a call two receivers down does not.
 */
function bearingLiterals(node, isPinnedName) {
  const out = [];
  const walk = (n) => {
    if (spellsLauncher(n)) { out.push(n); return; }
    if (ts.isTemplateExpression(n)
      && n.templateSpans.some((span) => mentionsSpelling(span.expression, isPinnedName))) {
      out.push(n); return;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return out;
}

/**
 * Does this call RECEIVE a pinned shell as an argument — excluding the expectation itself?
 *
 * `assert.ok(log.lines.join('\n').includes(`usage: ${spellings({ platform: 'linux' }).cli} store`))` has no
 * separate expected value: the subject IS the expectation, so the pinned spelling sits inside the sentence
 * rather than inside a call that produced a value. Counting it made ARC-07-C35's own named control site an
 * expected rendering when it is a pinned expectation.
 */
function receivesPinned(sf, assertion, call, isPinnedName, bearing) {
  const overlaps = (a, b) => a.getStart(sf) < b.getEnd() && b.getStart(sf) < a.getEnd();
  return (call.arguments ?? [])
    .filter((arg) => !bearing.some((b) => overlaps(arg, b)))
    .some((arg) => mentionsPinned(arg, isPinnedName, sf, assertion));
}

/**
 * The enclosing CASE, not the nearest arrow — ARC-07-C35c item 4.
 *
 * `while (!isFunctionLike(scope))` stops at the first callback, and an assertion inside a nested one is
 * common: `[out].forEach((one) => { assert.equal(one, …) })`. Measured, that cost a FALSE POSITIVE — the same
 * code with the assertion moved inside a `forEach` went from `EXPECTED_RENDERING` to a reported MISMATCH,
 * because the ctx driven two lines above was outside the callback the walk stopped at. An audit that reports
 * correct code is an audit somebody switches off.
 *
 * A case is the function a runner was handed, so the walk climbs until it finds one whose parent is a call to
 * `test`/`it`/`describe`, and falls back to the outermost function-like when a fixture is written some other
 * way. It never leaves the file.
 */
function enclosingCase(node) {
  let scope = node.parent;
  let outermost = null;
  while (scope) {
    if (ts.isFunctionLike(scope)) {
      outermost = scope;
      const parent = scope.parent;
      if (parent && ts.isCallExpression(parent)) {
        const name = ts.isIdentifier(parent.expression) ? parent.expression.text
          : (ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.text : null);
        if (name && /^(test|it|describe|suite)$/.test(name)) return scope;
      }
    }
    scope = scope.parent;
  }
  return outermost;
}

/**
 * Was a pinned shell driven into SOME call in this case — item 3, narrowed from "mentioned anywhere".
 *
 * The wide version answered yes for any `'win32'`/`'linux'`/`'darwin'` string in the case, including a skip
 * condition and a fixture value, and it downgrades a real mismatch to UNKNOWN — a false negative, which is
 * the bar this PR merges on. An ARGUMENT to a call is the evidence that a shell was driven somewhere, even
 * when it was not driven into the value asserted here.
 */
function pinnedDrivenSomewhereInCase(sf, assertion, isPinnedName, bearing) {
  const scope = enclosingCase(assertion);
  if (!scope) return false;
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n) && !isSpellingCall(n)
      && receivesPinned(sf, assertion, n, isPinnedName, bearing)) {
      hit = true; return;
    }
    ts.forEachChild(n, walk);
  };
  walk(scope);
  return hit;
}

/**
 * A call to the spelling functions themselves.
 *
 * ARC-07-C35c item 4, and the distinction is which QUESTION is being asked. For the SUBJECT's own chain a
 * spelling call is exactly what is being driven — `assert.equal(spellings(WIN).cli, '.\\snowarch.cmd')` is an
 * expected rendering, and excluding it there took the Windows renderings from 8 to 2, which is how I found this
 * out. For "did the case drive a shell somewhere ELSE", a spelling call is not the product being driven; it IS
 * the spelling, and counting it downgraded a real mismatch to an UNKNOWN — a pinned expectation against a
 * deriving product line, reported as nothing at all.
 */
function isSpellingCall(call) {
  const callee = ts.isIdentifier(call.expression) ? call.expression.text
    : (ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null);
  return Boolean(callee && READS_THE_PROCESS.has(callee));
}

/**
 * EVERY call the subject's value passed through — items 7 and 9.
 *
 * `renderVersion(info, win).join('\n')` is the extractor's own documented example and came back PINNED,
 * because only the OUTERMOST call was looked at and its argument is `'\n'`. So did `cli-help:134`, where
 * `win.includes('.\\snowarch.cmd doctor')` reads a constant bound from `DOCTOR_USAGE({ platform: 'win32' })`
 * — with a comment three lines above saying exactly that. The chain is walked instead: the call itself, the
 * calls under its receiver, and the call a binding came from, unwrapping `await` on the way.
 */
function callsBehind(sf, from, subject, seen = new Set()) {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)
      || ts.isAwaitExpression(node) || ts.isAsExpression(node)) {
      visit(node.expression); return;
    }
    if (ts.isCallExpression(node)) {
      out.push(node);
      // ...and keep descending: `a(ctx).join('\n').trim()` hides the driving call two receivers down.
      if (ts.isPropertyAccessExpression(node.expression)) visit(node.expression.expression);
      return;
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      visit(node.expression); return;
    }
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return;
      seen.add(node.text);
      const decl = declarationInScope(sf, from, node.text);
      if (decl?.initializer) visit(decl.initializer);
    }
  };
  visit(subject);
  return out;
}

/**
 * A shell NAMED rather than read: a pinned spelling constant, `cliSpelling('win32', {})`, a platform literal,
 * or a constant holding a platform-bearing ctx.
 *
 * `isPinnedName` is a PREDICATE, not a Set, and that is item 1 of the architect's second review: the Set was
 * built file-wide from `spellingConstants`, so a DERIVED case that hard-codes POSIX was granted
 * EXPECTED_RENDERING as soon as a LATER case declared the same constant name pinned. `kindInScope` had fixed
 * the expectation side and left the subject side on the old table.
 *
 * A NAMED CTX is item 8 and is this repository's idiom — `const WIN = { platform: 'win32', env: {} }`,
 * declared in four test files, including the one the extractor's own comment uses as its example. One hop
 * through `declarationInScope`, which already exists.
 */
function mentionsPinned(node, isPinnedName, sf, from) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n)) {
      if (isPinnedName(n.text)) { hit = true; return; }
      // A constant holding `{ platform: 'win32', … }` — one hop, no further.
      if (sf && from) {
        const decl = declarationInScope(sf, from, n.text);
        if (decl?.initializer && ts.isObjectLiteralExpression(decl.initializer)
          && platformLiteralIn(decl.initializer)) {
          hit = true; return;
        }
      }
    }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'platform'
      && ts.isStringLiteralLike(n.initializer)) {
      hit = true; return;
    }
    // A spelling object written out by hand, inline or one hop away.
    if (ts.isObjectLiteralExpression(n) && platformLiteralIn(n)) { hit = true; return; }
    // A POSITIONAL platform, which is how several cases drive it:
    // `deletionAdvice(2, 2, 'C:\\Users\\me', 'win32', {})` and `noTtyMessage('linux', {})`.
    if (ts.isStringLiteralLike(n) && PLATFORMS.has(n.text)) { hit = true; return; }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name) && pinsShell(n, sf, from)) { hit = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * `{ platform: 'win32', … }` — a ctx that names its platform — or a SPELLING OBJECT written out by hand.
 *
 * ARC-07-C35c's regex arm found the second shape: `windows-spellings.test.mjs:274` drives
 * `MODE_VARIANTS.unconfigured({ cli: '.\\snowarch.cmd', bootstrap: '.\\bootstrap.cmd' })` — a spelling with no
 * `platform` key and no `spellings()` call anywhere, so nothing recognised it and a correct assertion about the
 * Windows rendering was reported as a pinned expectation against a deriving product line. An object whose `cli`
 * or `bootstrap` IS a launcher literal is a named shell by construction: there is nothing left to derive.
 */
function platformLiteralIn(objectLiteral) {
  const named = objectLiteral.properties.some((prop) => ts.isPropertyAssignment(prop)
    && ts.isIdentifier(prop.name) && prop.name.text === 'platform'
    && ts.isStringLiteralLike(prop.initializer) && PLATFORMS.has(prop.initializer.text));
  if (named) return true;
  return objectLiteral.properties.some((prop) => ts.isPropertyAssignment(prop)
    && ts.isIdentifier(prop.name) && /^(cli|bootstrap)$/.test(prop.name.text)
    && ts.isStringLiteralLike(prop.initializer) && LAUNCHER.test(prop.initializer.text));
}

/**
 * Assertions whose FIRST argument is the value under test rather than the expectation.
 *
 * `assert.equal(bare('run .\\snowarch.cmd doctor'), false)` in `tests/windows-spellings.test.mjs` feeds a
 * launcher to the instrument it is testing: the launcher is INPUT, and the expectation is `false`. Treating
 * argument 0 as an expectation reported that case as a pinned expectation against a deriving product line —
 * a defect in a case whose whole subject is launcher spellings.
 *
 * `assert.ok(text.includes(`${CLI} doctor`))` is the other shape and must keep working: there is no separate
 * expected value, so argument 0 IS the expectation. The split is by assertion name, which is the only place
 * the difference is stated.
 */
const SUBJECT_FIRST = new Set(['equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual',
  'notDeepEqual', 'deepStrictEqual', 'match', 'doesNotMatch', 'include', 'notInclude']);

/**
 * Assertions that claim a sentence is ABSENT — ARC-07-C35c's regex arm again.
 *
 * `assert.doesNotMatch(r.text, /usage: \.\/snowarch instance <command>/)` says the engine's usage must NOT be
 * there, and comparing that sentence's kind to a product line's settles nothing: the case is not claiming the
 * product prints it. Before this, `instance-root-entry.test.mjs:88` was reported as a pinned expectation
 * against a deriving product line — a defect report about a case asserting an absence.
 */
const NEGATIVE = new Set(['notEqual', 'notStrictEqual', 'notDeepEqual', 'doesNotMatch', 'notInclude',
  'doesNotInclude']);

/**
 * Does the subject READ A COMMITTED FILE rather than call the product? ARC-07-C35c, piece 3.
 *
 * `read('README.md')`, `readFileSync(join(root, 'docs/INSTALL.md'))`, `JSON.parse(readFileSync(…text.json…))` —
 * a case whose value came off disk is asserting about an ARTEFACT, and an artefact is POSIX by rule 3 while its
 * runtime twin derives. Both are right, so the two must not be compared with each other: this is the route for
 * a case that runs nothing.
 */
const READS_A_FILE = /^(read|readFileSync|readJson|readFile|loadJson)$/;

function subjectReadsArtefact(sf, from, subject) {
  if (!subject) return false;
  let found = false;
  const walk = (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_A_FILE.test(name)) { found = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(subject);
  if (found) return true;
  // ...or one hop through the binding it came from: `const generated = JSON.parse(readFileSync(…))`.
  const name = ts.isIdentifier(subject) ? subject.text : rootIdentifier(subject);
  if (!name) return false;
  const decl = declarationInScope(sf, from, name);
  if (!decl?.initializer) return false;
  let hit = false;
  const scan = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const called = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (called && READS_A_FILE.test(called)) { hit = true; return; }
    }
    ts.forEachChild(n, scan);
  };
  scan(decl.initializer);
  return hit;
}

/** Does this assertion claim the sentence is ABSENT? */
function isNegativeAssertion(node) {
  const { expression } = node;
  if (!ts.isPropertyAccessExpression(expression)) return false;
  const root = rootIdentifier(expression);
  if (root === 'assert') return NEGATIVE.has(expression.name.text);
  // vitest: `expect(x).not.toContain(y)` — the negation is a property in the chain.
  if (root === 'expect') return /(^|\.)not\./.test(expression.getText());
  return false;
}

/** The arguments that carry what the assertion EXPECTS, with the subject dropped where there is one. */
function expectationArgs(node) {
  const { expression } = node;
  /*
   * ARC-07-C35b, fourth head — THE FAILURE MESSAGE IS NOT AN EXPECTATION, and four sites existed only
   * because of it: `bootstrap-finished:219` (whose expected value is literally `null`),
   * `win32-remedies:101`, `legacy:218` and `windows-spellings:514` are all cases where the launcher appears
   * in the DIAGNOSTIC string a reader sees when the assertion fails. A sentence written to help a human is
   * not a claim about the product, and treating it as one put four sites in the baseline with reasons that
   * could never be true. Dropped by ARITY, which is how `node:assert` states it — vitest's matchers take no
   * message at all, so `expect(...)` keeps everything.
   */
  if (ts.isPropertyAccessExpression(expression)) {
    const root = rootIdentifier(expression);
    if (root === 'expect') return node.arguments;
    if (root === 'assert') {
      const name = expression.name.text;
      if (SUBJECT_FIRST.has(name)) return node.arguments.slice(1, 2);
      // `throws`/`rejects` carry the expected error in argument 1; everything else expects argument 0.
      if (/^(throws|rejects|doesNotThrow|doesNotReject)$/.test(name)) return node.arguments.slice(0, 2);
      return node.arguments.slice(0, 1);
    }
  }
  // A bare `assert(value, message)`.
  if (ts.isIdentifier(expression) && expression.text === 'assert') return node.arguments.slice(0, 1);
  return node.arguments;
}

/** An assertion: `assert.*(…)`, `expect(…).*(…)`, or a bare `assert(…)`. */
function assertionArgs(node) {
  if (!ts.isCallExpression(node)) return null;
  const { expression } = node;
  if (ts.isIdentifier(expression) && expression.text === 'assert') return node.arguments;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = rootIdentifier(expression);
    if (root === 'assert' || root === 'expect') return node.arguments;
  }
  return null;
}

function rootIdentifier(node) {
  let n = node;
  while (n && !ts.isIdentifier(n)) {
    if (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) n = n.expression;
    else if (ts.isNonNullExpression(n) || ts.isParenthesizedExpression(n)) n = n.expression;
    else return null;
  }
  return n?.text ?? null;
}

/** The string-literal argv of a call like `run(entry, ['store', '--help'])` or `cli(['--json'])`. */
function argvOf(node) {
  for (const arg of node.arguments ?? []) {
    if (!ts.isArrayLiteralExpression(arg)) continue;
    const words = arg.elements.map((e) => (ts.isStringLiteral(e) ? e.text : null));
    // A single non-literal element makes the argv unknowable rather than partially known: a partially
    // known argv would route by a prefix the case may not actually run.
    if (words.length > 0 && words.every((w) => w !== null)) return words;
  }
  return null;
}

/**
 * The argv the enclosing case runs — the LAST spawn-shaped call before the assertion in the same body.
 *
 * Scoped to the enclosing function so a spawn in a neighbouring case cannot be borrowed, and LAST rather
 * than first because a case that runs two commands asserts about the most recent one.
 */
/**
 * The argv behind the VALUE being asserted, found through the identifier the subject reads.
 *
 * `argvInScope` takes the last spawn before the assertion, and a case that runs two commands and asserts the
 * FIRST is then routed to the second package — a correct assertion reported as a mismatch against a product
 * line it never reached. Measured on a two-spawn fixture: asserting `first.text` after a later
 * `run(entry, ['store','migrate','--help'])` routed to the server. So the subject's binding is asked first,
 * and the last spawn stays as the fallback for a case that asserts a call's result directly.
 */
function argvForSubject(sf, assertion, subject) {
  if (!subject) return null;

  /*
   * ARC-07-C35c item 3 — THE SUBJECT'S OWN SPAWN COMES FIRST.
   *
   * `assert.match(run(entry, ['store','--help']).text, …)` spawns INLINE, and the binding lookup below cannot
   * see it: `rootIdentifier` walks down to `run`, finds the harness's helper, and answers "bound, not a spawn".
   * Measured — with a later spawn in the case that gave argv `null` and NO route at all, and with an earlier
   * one it routed to that earlier spawn instead: `['store','migrate','--help']`, the server, for an assertion
   * about the engine's own answer. Asking the subject first is the whole fix for that shape.
   */
  const own = spawnShapedCall(subject);
  if (own) {
    const argv = argvOf(own);
    if (argv) return { argv, call: own };
  }

  const name = ts.isIdentifier(subject) ? subject.text : rootIdentifier(subject);
  if (!name) return null;
  // NEAREST SCOPE, and this is the same defect as the file-wide constants table: `const r = run(…)` appears
  // in every case in `store-root-entry.test.mjs`, so a file-wide scan gave EVERY assertion the FIRST case's
  // argv — measured, it routed the `migrate --help` case to the engine and reported a mismatch against a
  // product line it never reached.
  const found = declarationInScope(sf, assertion, name);
  // UNDEFINED means "no binding here, ask the fallback"; NULL means "bound, and not to a spawn" — item 10.
  // Collapsing the two let a setup spawn earlier in the case disable the narrow rule for an in-process
  // rendering that had nothing to do with it.
  if (!found?.initializer) return undefined;
  const call = spawnShapedCall(found.initializer);
  return call ? { argv: argvOf(call), call } : null;
}

/** The nearest declaration of `name` visible from this node, climbing out through the enclosing scopes. */
function declarationInScope(sf, from, name) {
  let scope = from.parent;
  while (scope) {
    let hit = null;
    const scan = (n) => {
      if (hit) return;
      if (n !== scope && ts.isFunctionLike(n)) return;
      if (ts.isVariableDeclaration(n) && bindsName(n.name, name)) { hit = n; return; }
      ts.forEachChild(n, scan);
    };
    scan(scope);
    if (hit) return hit;
    scope = scope.parent;
  }
  return null;
}

/**
 * Does this declaration bind `name` — as an identifier, or through a DESTRUCTURING pattern?
 *
 * ARC-07-C35c item 3. `const { text } = run(entry, ['store','--help'])` binds `text`, and only an identifier
 * name was recognised, so the subject `text` had no declaration and the route fell back to the LAST spawn in
 * the case. Measured: an assertion about the engine's own `store --help` answer routed to
 * `['store','migrate','--help']` — the server — which is a mismatch attributed to a product line the case
 * never reached. Array patterns too, because `const [first] = …` is the same statement written differently.
 */
function bindsName(nameNode, name) {
  if (ts.isIdentifier(nameNode)) return nameNode.text === name;
  if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
    return nameNode.elements.some((element) => {
      if (ts.isOmittedExpression(element)) return false;
      // `{ text }`, `{ text: renamed }` and `[first]` all reach here; the BOUND name is what matters.
      return bindsName(element.name, name);
    });
  }
  return false;
}

/** A call that RUNS something: the shapes this repository's cases use to spawn a command. */
function spawnShapedCall(node) {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && /^(run|cli|spawnSync|execFileSync|runAt|lintAt|snowarch)$/.test(name)) { hit = n; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

function argvInScope(sf, assertion) {
  let best = null;
  const within = (node) => {
    ts.forEachChild(node, (child) => {
      if (child.getStart(sf) >= assertion.getStart(sf)) return;
      if (ts.isCallExpression(child)) {
        const name = ts.isIdentifier(child.expression) ? child.expression.text
          : (ts.isPropertyAccessExpression(child.expression) ? child.expression.name.text : null);
        if (name && /^(run|cli|spawnSync|execFileSync|runAt|lintAt|snowarch)$/.test(name)) {
          const argv = argvOf(child);
          if (argv) best = { argv, call: child };
        }
      }
      within(child);
    });
  };
  // Walk out to the enclosing function body, then scan it forwards to the assertion.
  let scope = assertion.parent;
  while (scope && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  if (scope) within(scope);
  return best;
}

/**
 * Which package ANSWERS this argv — piece (b), read from the frame's own table.
 *
 * `COMMANDS[name].raw` is the frame saying "everything after this is the server CLI's, unparsed"; the
 * comment beside it adds that only a BARE `--help` is the frame's own. So a raw command with a further
 * positional is the server's, and everything else is the engine's. `null` when the argv names no command
 * this frame knows — an unknown route is not a guess.
 */
export function answeredBy(argv) {
  if (!Array.isArray(argv)) return null;
  const words = argv.filter((w) => typeof w === 'string');
  const at = words.findIndex((w) => Object.hasOwn(COMMANDS, w));
  if (at === -1) return null;
  const command = COMMANDS[words[at]];
  if (!command?.raw) return 'engine';
  const rest = words.slice(at + 1).filter((w) => !w.startsWith('-'));
  return rest.length > 0 ? 'server' : 'engine';
}

/**
 * Every asserted launcher in one test file: what it expects, the sentence it asserts, and what it ran.
 *
 * `sentence` is the prose of the assertion's ARGUMENTS only. `argv`/`answeredBy` are the route when the
 * case spawns something, and null when it calls a function directly — in which case the audit resolves by
 * sentence alone, exactly as before.
 */
export function assertedLaunchers(file, text) {
  const sf = parse(file, text);
  const spellings = spellingConstants(sf);
  // A PREDICATE per assertion, never a file-wide set — item 1. `kindInScope` resolves the name where the
  // assertion can see it, so a later case declaring the same name pinned cannot vouch for an earlier one.
  const isPinnedName = (assertion) => (name) => kindInScope(sf, assertion, name, spellings) === 'PINNED';
  const sites = [];

  const walk = (node) => {
    const args = assertionArgs(node);
    if (args && args.length > 0) {
      const bearing = expectationArgs(node).filter((a) => carriesLauncher(a, spellings));
      if (bearing.length > 0) {
        const literal = bearing.some((a) => hasLauncherLiteral(a));
        const named = bearing.map((a) => namedSpelling(a, spellings)).find(Boolean) ?? null;
        const subject = subjectOf(node);
        const negative = isNegativeAssertion(node);
        const readsArtefact = subjectReadsArtefact(sf, node, subject);
        // The subject's own binding decides the route. `undefined` means it has none, and only then does the
        // last spawn stand in; `null` means it is bound to something that is not a spawn, which is an answer.
        const bound = argvForSubject(sf, node, subject);
        const routed = bound === undefined ? argvInScope(sf, node) : bound;
        const argv = routed?.argv ?? null;
        const carriers = bearing.flatMap((a) => bearingLiterals(a, (name) => spellings.has(name)));
        const pinnedSubject = drivenPinnedShell(sf, node, subject, isPinnedName(node), argv,
          routed?.call ?? null, carriers);
        // THE SIDE-EFFECT SHAPE, reported rather than guessed either way. `promptSecret(…, { platform:
        // 'win32' })` writes to a recorder and the assertion reads `stdout.written`: the case DID drive a
        // pinned shell, but not into the call whose value is asserted, so the narrow rule cannot see it and
        // calling it a pinned expectation reported correct code as a defect. It is neither agreement nor a
        // mismatch — it is a question this audit cannot answer without dataflow, and the audit says so.
        const caseDrivesPinned = !argv && !pinnedSubject
          && pinnedDrivenSomewhereInCase(sf, node, isPinnedName(node), carriers);
        // The kind stated INLINE wins over a named constant, and a named constant is resolved in the
        // NEAREST scope rather than file-wide.
        const stated = bearing.map((a) => inlineKind(a, sf, node)).find(Boolean) ?? null;
        const scoped = named ? kindInScope(sf, node, named, spellings) : null;
        sites.push({
          file,
          line: lineOf(sf, node),
          /*
           * `EXPECTED_RENDERING` is decided by the SUBJECT — a case that drives a pinned shell and asserts
           * `${esc(win.cli)}` renders that shell as much as one that writes the launcher out.
           *
           * BUT THE EXPECTATION'S OWN KIND STILL DECIDES, which is item 2 of the architect's second review:
           * a pinned ctx driven in and `${spellings().cli}` — the RUNNER's spelling — asserted against it is
           * red on Windows, and the third head called it an expected rendering. A pinned subject with a
           * DERIVING expectation is the test comparing a pinned rendering to whatever machine it runs on, so
           * it gets its own answer and the audit reports it whatever the product line does.
           */
          expectation: pinnedSubject
            ? (literal || (stated ?? scoped) === 'PINNED'
              ? 'EXPECTED_RENDERING' : 'DERIVED_ON_PINNED_SUBJECT')
            : (literal ? 'PINNED' : (stated ?? scoped ?? 'DERIVED')),
          pinnedSubject,
          caseDrivesPinned,
          negative,
          readsArtefact,
          // STRICT: the spelling inside the assertion's OWN literals, so the Windows count is a number the
          // case can assert rather than a floor. A neighbourhood scan of nearby lines gave 13 where the
          // strict answer is smaller, and a floor of ten hid the difference.
          spelled: {
            windows: carriers.some((c) => WINDOWS_SPELLING.test(cookedText(c))),
            posix: carriers.some((c) => POSIX_SPELLING.test(cookedText(c))),
          },
          sentence: bearing.map((a) => proseOf(a)).join(' '),
          argv,
          answeredBy: answeredBy(argv),
        });
        // An assertion nested inside an assertion is the same site; do not walk into it twice.
        return;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return sites;
}

function namedSpelling(node, spellings) {
  let hit = null;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && spellings.has(n.text)) { hit = n.text; return; }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
}

/**
 * Every product line that spells or derives a launcher, as a sentence with its kind and its package.
 *
 * The same extractor on the other side, which is what makes "the same sentence" one definition. The
 * package is what command tracing compares against: a site routed to the server cannot be answered by a
 * line in `tools/snowarch/lib`.
 */
export function productLines(file, text) {
  const sf = parse(file, text);
  const lines = [];
  const walk = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isRegularExpressionLiteral(node) || ts.isTemplateExpression(node)) {
      const spelled = spellsLauncher(node);
      const interpolated = ts.isTemplateExpression(node)
        && node.templateSpans.some((s) => /cli|bootstrap|spell|CLI|POSIX|Spelling|SPELL/.test(s.expression.getText()));
      if (spelled || interpolated) {
        /*
         * ARC-07-C35c, piece 1 — AN INTERPOLATION THAT NAMES ITS PLATFORM IS PINNED.
         *
         * Every interpolation was called DERIVED, and `scripts/gen-doctor-docs.mjs:44` writes
         * `run ${spellings({ platform: 'linux', env: {} }).cli} docs sync` — a GENERATOR, pinning POSIX because
         * the page it writes is committed. Calling that line deriving is the same class of error this audit
         * exists to catch, one side over: a pinned product line described as following the reader's shell. It
         * was behind a mismatch report on `bootstrap-runner.test.mjs:177` before the narrow rule took that site
         * out of the comparison, so today it is correctness rather than a live defect — and the same
         * `pinsShell` that reads a test's spelling reads the product's.
         */
        const pinnedInterpolation = interpolated && node.templateSpans
          .some((span) => inlineKind(span.expression, sf, node) === 'PINNED');
        lines.push({ file, line: lineOf(sf, node), sentence: proseOf(node),
          kind: spelled || pinnedInterpolation ? 'PINNED' : 'DERIVED', package: packageOf(file) });
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return lines;
}

/** `engine` · `server` · `scripts` — which tree a product file lives in. */
export function packageOf(file) {
  if (file.startsWith('packages/snowarch/')) return 'server';
  if (file.startsWith('tools/snowarch/')) return 'engine';
  /*
   * ARC-07-C35c, piece 3 — A GENERATOR'S SENTENCE IS AN ARTEFACT'S, not the runtime's.
   *
   * `scripts/gen-*.mjs` writes committed pages, so it carries the same words as the runtime line by
   * construction — and it PINS them, because a committed page is POSIX by rule 3. Measured: with the two
   * sentences in one pool, `mode-and-cache.test.mjs:100` — which derives its expectation from
   * `MODE_VARIANTS` exactly as rule 1 asks — was matched against `gen-doctor-docs.mjs:66`'s pinned copy and
   * reported as a defect. They are different claims about different artefacts, so they are different packages:
   * a case that READS a page is answered by the pages and their generators, and a case that calls the product
   * is answered by the product.
   */
  if (/^scripts\/gen-/.test(file)) return 'artefact';
  return 'scripts';
}

export const readFile = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

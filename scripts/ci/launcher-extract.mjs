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
  // A REGEX IS NOT READ HERE, and that is a scope decision with a measurement behind it rather than an
  // oversight. `/run \.\/snowarch doctor/` holds `\.\/snowarch`, so unescaping it first — which
  // `regexProse` below does, and which ARC-07-C35's line-based version did — detects 45 more asserted
  // launchers. Turning that on produced THIRTEEN reported mismatches, every one of them correct code, and
  // chasing them down needs three separate pieces this row does not have: a product-side kind that knows
  // `${spellings({ platform: 'linux' }).cli}` is PINNED though it is an interpolation; the committed
  // generated pages indexed as product artefacts, because a page asserted by `install-page.test.mjs` is
  // POSIX by rule 3 and its runtime twin derives; and a way to tell a GENERATOR's sentence from the runtime
  // sentence it writes, since `scripts/gen-doctor-docs.mjs` carries the same words as the check it renders.
  // Shipping the widening without those would mean an audit that cries wolf on correct tests, which is how
  // a gate gets switched off. It is ARC-07-C35c, with those three pieces and this measurement as its start.
  return false;
};

/**
 * The prose a node carries, with MARK wherever something is not a literal.
 *
 * This is the whole of piece (a). It walks the expression rather than the text, so what comes back is
 * the sentence the test asserts — never the expression it asserts it about.
 */
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
    // `.join(sep)` is the shape this repository writes most, and the separator is part of the sentence.
    if (callee && callee.name.text === 'join' && ts.isArrayLiteralExpression(callee.expression)) {
      const sep = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
        ? node.arguments[0].text : ' ';
      return callee.expression.elements.map((e) => proseOf(e)).join(sep);
    }
    const fromReceiver = callee ? proseOf(callee.expression) : '';
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
function inlineKind(node) {
  let kind = null;
  const walk = (n) => {
    if (kind) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name)) { kind = pinsShell(n) ? 'PINNED' : 'DERIVED'; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return kind;
}

/** A named spelling constant, or a spelling call, appearing in this expression. */
function mentionsSpelling(node, spellings) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && spellings.has(n.text)) { hit = true; return; }
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
      const call = findSpellingCall(node.initializer);
      if (call) kinds.set(node.name.text, pinsShell(call) ? 'PINNED' : 'DERIVED');
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return kinds;
}

/**
 * Does this spelling call PIN a shell? Read the argument, never the count.
 *
 * `spellings({ platform: process.platform, env: process.env })` has an argument and derives from the process
 * anyway — it is the process spelled out longhand. Counting arguments called it pinned, which would let a
 * case that reads the runner's platform be treated as one that named it.
 */
export function pinsShell(call) {
  if (!call || call.arguments.length === 0) return false;
  let readsProcess = false;
  const walk = (n) => {
    if (readsProcess) return;
    if (ts.isIdentifier(n) && n.text === 'process') { readsProcess = true; return; }
    ts.forEachChild(n, walk);
  };
  for (const arg of call.arguments) walk(arg);
  return !readsProcess;
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
        if (call) found = pinsShell(call) ? 'PINNED' : 'DERIVED';
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
 * ARC-07-C35b, third head — THE NARROW RULE FOR `EXPECTED_RENDERING`, after the architect refuted the wide one.
 *
 * The wide version asked "does the enclosing function MENTION a pinned constant or a spelling call with
 * arguments", and that is not the question. Mutating the row's own control file proved it: adding a
 * FRAME_CLI assertion to the `migrate --help` case and hard-coding `usage: ./snowarch store <command>`
 * against the SERVER's result came back `EXPECTED_RENDERING`, `agreed=4`, 0 mismatches — the exact
 * Windows-red class the audit exists to catch, hidden by the fallback, because the case mentioned a pinned
 * constant somewhere else.
 *
 * The question is whether a pinned shell was DRIVEN INTO the call whose result is being asserted. So:
 *
 *   - the subject is a call, or a value bound from one, and that call RECEIVES the pinned spelling or a
 *     platform-bearing ctx as an argument, in the same function; and
 *   - `argv` is null — a case that SPAWNS a command cannot drive a shell by argument at all, so a launcher
 *     literal in a spawn-shaped case is a pinned expectation and nothing else.
 *
 * There is no "mentions" fallback. A case that pins a shell for one assertion and hard-codes a launcher in
 * another is now caught, which is the direction that matters.
 */
function drivenPinnedShell(sf, assertion, subject, pinned, argv, bearing) {
  // A spawn-shaped case drives nothing by argument. This is the half that unhid the mutation.
  if (argv) return false;
  if (!subject) return false;

  const call = callBehind(sf, assertion, subject);
  if (!call) return false;
  /*
   * THE EXPECTATION IS NOT A DRIVEN SHELL, and `assert.ok` is where the two are the same node.
   *
   * `assert.ok(log.lines.join('\n').includes(`usage: ${spellings({ platform: 'linux' }).cli} store`))`
   * has no separate expected value: the subject IS the expectation, so the pinned spelling sits inside the
   * sentence being asserted rather than inside a call that produced a value. Counting it made
   * `store-forwarder.test.mjs:73` — ARC-07-C35's own named control site — an EXPECTED_RENDERING when it is
   * a pinned expectation about a POSIX literal the engine's frame prints on every platform.
   */
  // OVERLAP IN EITHER DIRECTION. With `assert.ok(X)` the bearing node IS the subject call, so the
  // expectation CONTAINS the argument rather than sitting inside it — my first version only checked one way
  // and left `store-forwarder.test.mjs:73` misclassified exactly as before.
  const overlaps = (a, b) => a.getStart(sf) < b.getEnd() && b.getStart(sf) < a.getEnd();
  const driving = (call.arguments ?? []).filter((arg) => !bearing.some((b) => overlaps(arg, b)));
  return driving.some((arg) => mentionsPinned(arg, pinned));
}

/** Does the enclosing case mention a pinned shell anywhere — the WIDE signal, kept only to say "unknown". */
function mentionsInEnclosingCase(assertion, pinned) {
  let scope = assertion.parent;
  while (scope && !ts.isFunctionLike(scope)) scope = scope.parent;
  return Boolean(scope && mentionsPinned(scope, pinned));
}

/** The call whose result the subject is: itself, its root, or the initializer it was bound from. */
function callBehind(sf, from, subject) {
  if (ts.isCallExpression(subject)) return subject;
  if (ts.isPropertyAccessExpression(subject) || ts.isElementAccessExpression(subject)
    || ts.isNonNullExpression(subject) || ts.isParenthesizedExpression(subject)) {
    let inner = subject.expression;
    while (inner) {
      if (ts.isCallExpression(inner)) return inner;
      if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)
        || ts.isNonNullExpression(inner) || ts.isParenthesizedExpression(inner)) inner = inner.expression;
      else break;
    }
    // `r.text` where `const r = render(WIN)` — the binding carries the call.
    const name = rootIdentifier(subject);
    return name ? boundCall(sf, from, name) : null;
  }
  if (ts.isIdentifier(subject)) return boundCall(sf, from, subject.text);
  return null;
}

/** The call a local constant was bound from, resolved in the nearest scope that declares it. */
function boundCall(sf, from, name) {
  const decl = declarationInScope(sf, from, name);
  if (!decl?.initializer) return null;
  let inner = decl.initializer;
  // `await` as well as a property access or a cast: `const r = await runIt(WIN)` is the same shape.
  while (inner && !ts.isCallExpression(inner)) {
    inner = ts.isPropertyAccessExpression(inner) || ts.isNonNullExpression(inner)
      || ts.isParenthesizedExpression(inner) || ts.isAwaitExpression(inner) || ts.isAsExpression(inner)
      ? inner.expression : null;
  }
  return inner ?? null;
}

/**
 * A spelling that NAMED its platform: a pinned constant, `cliSpelling('win32', {})`, or a PLATFORM LITERAL.
 *
 * `DOCTOR_USAGE({ platform: 'win32', env: {} })` pins the shell without naming a spelling at all, and it is
 * how most of this repository drives the other platform — ARC-07 measured that forcing `process.platform`
 * is unusable locally, so every case since drives by argument. Without this arm, `cli-help.test.mjs:134`
 * asserted `.\snowarch.cmd doctor` against a deriving product line and was reported as a defect.
 */
function mentionsPinned(node, pinned) {
  let hit = false;
  const walk = (n) => {
    if (hit) return;
    if (ts.isIdentifier(n) && pinned.has(n.text)) { hit = true; return; }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'platform'
      && ts.isStringLiteralLike(n.initializer)) {
      hit = true; return;
    }
    // A POSITIONAL platform, which is how several cases drive it:
    // `deletionAdvice(2, 2, 'C:\\Users\\me', 'win32', {})` and `noTtyMessage('linux', {})`. Measured —
    // without this arm those two files' four correct assertions were reported as defects.
    if (ts.isStringLiteralLike(n) && PLATFORMS.has(n.text)) { hit = true; return; }
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression) ? n.expression.text
        : (ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : null);
      if (name && READS_THE_PROCESS.has(name) && pinsShell(n)) { hit = true; return; }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return hit;
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

/** The arguments that carry what the assertion EXPECTS, with the subject dropped where there is one. */
function expectationArgs(node) {
  const { expression } = node;
  if (ts.isPropertyAccessExpression(expression)) {
    const root = rootIdentifier(expression);
    // `expect(subject).toContain(expected)` — the outer call's arguments are already the expectation.
    if (root === 'expect') return node.arguments;
    if (root === 'assert' && SUBJECT_FIRST.has(expression.name.text)) return node.arguments.slice(1);
  }
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
  const name = ts.isIdentifier(subject) ? subject.text : rootIdentifier(subject);
  if (!name) return null;
  // NEAREST SCOPE, and this is the same defect as the file-wide constants table: `const r = run(…)` appears
  // in every case in `store-root-entry.test.mjs`, so a file-wide scan gave EVERY assertion the FIRST case's
  // argv — measured, it routed the `migrate --help` case to the engine and reported a mismatch against a
  // product line it never reached.
  const found = declarationInScope(sf, assertion, name);
  if (!found?.initializer) return null;
  const call = spawnShapedCall(found.initializer);
  return call ? argvOf(call) : null;
}

/** The nearest declaration of `name` visible from this node, climbing out through the enclosing scopes. */
function declarationInScope(sf, from, name) {
  let scope = from.parent;
  while (scope) {
    let hit = null;
    const scan = (n) => {
      if (hit) return;
      if (n !== scope && ts.isFunctionLike(n)) return;
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) { hit = n; return; }
      ts.forEachChild(n, scan);
    };
    scan(scope);
    if (hit) return hit;
    scope = scope.parent;
  }
  return null;
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
          if (argv) best = argv;
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
  const pinned = new Set([...spellings].filter(([, kind]) => kind === 'PINNED').map(([name]) => name));
  const sites = [];

  const walk = (node) => {
    const args = assertionArgs(node);
    if (args && args.length > 0) {
      const bearing = expectationArgs(node).filter((a) => carriesLauncher(a, spellings));
      if (bearing.length > 0) {
        const literal = bearing.some((a) => hasLauncherLiteral(a));
        const named = bearing.map((a) => namedSpelling(a, spellings)).find(Boolean) ?? null;
        const subject = subjectOf(node);
        // The subject's own binding decides the route; the last spawn is only the fallback (item 6).
        const argv = argvForSubject(sf, node, subject) ?? argvInScope(sf, node);
        const pinnedSubject = drivenPinnedShell(sf, node, subject, pinned, argv, bearing);
        // THE SIDE-EFFECT SHAPE, reported rather than guessed either way. `promptSecret(…, { platform:
        // 'win32' })` writes to a recorder and the assertion reads `stdout.written`: the case DID drive a
        // pinned shell, but not into the call whose value is asserted, so the narrow rule cannot see it and
        // calling it a pinned expectation reported correct code as a defect. It is neither agreement nor a
        // mismatch — it is a question this audit cannot answer without dataflow, and the audit says so.
        const caseDrivesPinned = !argv && !pinnedSubject && mentionsInEnclosingCase(node, pinned);
        // The kind stated INLINE wins over a named constant, and a named constant is resolved in the
        // NEAREST scope rather than file-wide.
        const stated = bearing.map((a) => inlineKind(a)).find(Boolean) ?? null;
        const scoped = named ? kindInScope(sf, node, named, spellings) : null;
        sites.push({
          file,
          line: lineOf(sf, node),
          // `EXPECTED_RENDERING` is decided by the SUBJECT, not by literal-vs-constant: a case that drives
          // a pinned shell and asserts `${esc(win.cli)}` is rendering that shell just as much as one that
          // writes the launcher out, and the wide rule reported the second and missed the first.
          expectation: pinnedSubject ? 'EXPECTED_RENDERING'
            : (literal ? 'PINNED' : (stated ?? scoped ?? 'DERIVED')),
          pinnedSubject,
          caseDrivesPinned,
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
        lines.push({ file, line: lineOf(sf, node), sentence: proseOf(node),
          kind: spelled ? 'PINNED' : 'DERIVED', package: packageOf(file) });
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
  return 'scripts';
}

export const readFile = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

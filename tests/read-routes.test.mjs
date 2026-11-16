// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — how a corpus page reaches a session, tested on the module that decides it (lib/docs/read-routes.mjs), apart from the hook.
 * The hook's own cases, one fixture transcript each, are tests/hook/stop-lever2.test.mjs; these are the pieces under them: the shell's words and
 * here-documents, the folder a `cd` sets, which command shows a page and which only lists or counts, what a search printed, one thread of rows,
 * and the sub-agents' files. Everything in the module is pure, so every case here is a string or a few rows in and a value out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cdOf, commandReads, expandBraces, hasExpansion, inputReads, joinPath, mentionsPage, pageAt, pagesInLines, pagesOfGrep, pagesOfInput, shellSegments, shellWords, walkThread,
} from '../tools/snowarch/lib/docs/read-routes.mjs';
import { isPointer } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { readSubagentRows, turnSources } from '../tools/snowarch/lib/docs/turn-sources.mjs';

const DOCS = '/home/dev/install/vendor/ServiceNowDocs';
const PAGE = 'markdown/csm/c_Esc.md';
const FILE = `${DOCS}/${PAGE}`;
const FOLDER = `${DOCS}/markdown/csm`;
const OTHER = 'markdown/csm/c_Other.md';
const pagesOf = (command, opts) => [...commandReads(command, opts).reads.keys()];

// ---- rows ---------------------------------------------------------------------------------------------------------------------
const A = (blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', content: blocks }, ...extra });
const U = (content, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });
const use = (id, name, input, extra = {}) => A([{ type: 'tool_use', id, name, input }], extra);
const res = (id, content, extra = {}) => U([{ type: 'tool_result', tool_use_id: id, content, ...extra }]);
// Built, not spelled whole: engine lint L02 holds every literal `mcp__<server>__` under tests/ to the product's own server key.
const MCP_FILE = ['mcp', 'srv', 'file_tool'].join('__');
const call = (id, name, input, body = 'ok', { error = false, row = {} } = {}) => [use(id, name, input, row), res(id, body, error ? { is_error: true } : {})];

// ---- the page a path names ----------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — pageAt: one page, in any spelling a call may carry; a folder, a glob, a list and another file are none', () => {
  assert.equal(pageAt(FILE), PAGE, 'absolute');
  assert.equal(pageAt(`vendor/ServiceNowDocs/${PAGE}`), PAGE, 'relative to the checkout');
  assert.equal(pageAt('C:\\Users\\Dev One\\snowarch\\vendor\\ServiceNowDocs\\markdown\\csm\\c_Esc.md'), PAGE, 'a Windows path, with a space in a folder name');
  assert.equal(pageAt(`${DOCS}//markdown//csm/c_Esc.md`), PAGE, 'doubled separators');
  for (const not of [`${DOCS}/markdown/csm/`, `${DOCS}/markdown/csm`, `${DOCS}/markdown/csm/*.md`, `${DOCS}/markdown/csm/c_{Esc,Other}.md`,
    `${DOCS}/markdown/csm/c_$NAME.md`, `${DOCS}/markdown/csm/c_Esc.md,${DOCS}/markdown/csm/c_Other.md`, `${DOCS}/markdown/csm/c_Esc.txt`,
    `${DOCS}/README.md`, PAGE, '/home/dev/notes/other.md', '', null, undefined, 7]) {
    assert.equal(pageAt(not), null, String(not));
  }
});

// ---- the shell's words ----------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — shellSegments: words without their quotes, cut at the operators and not inside quotes; the operator and the depth are kept', () => {
  const words = (c, o) => shellWords(c, o);
  assert.deepEqual(words(`sed -n '1,40p;60,90p' a.md`), [['sed', '-n', '1,40p;60,90p', 'a.md']], 'a ; inside quotes cuts nothing');
  assert.deepEqual(words(`cd d && sed -n 1,60p a.md || echo "no; way"`), [['cd', 'd'], ['sed', '-n', '1,60p', 'a.md'], ['echo', 'no; way']]);
  assert.deepEqual(words('head -3 a.md | grep -n x\ncat b.md'), [['head', '-3', 'a.md'], ['grep', '-n', 'x'], ['cat', 'b.md']]);
  assert.deepEqual(words('echo "say \\"hi\\" $HOME" \'it\'\\\'\'s\''), [['echo', 'say "hi" $HOME', "it's"]], 'escapes in double quotes, and a quote joined to a quote');
  assert.deepEqual(words('cat a.md \\\n  b.md'), [['cat', 'a.md', 'b.md']], 'a line continuation joins the lines');
  assert.deepEqual(words('cat a.md 2>&1 | head'), [['cat', 'a.md', '2>&1'], ['head']], '2>&1 is a word, not an operator');
  assert.deepEqual(words('x=$(cat a.md) && y=`cat b.md`'), [['x=$'], ['cat', 'a.md'], ['y='], ['cat', 'b.md']], 'a substitution has commands in it');
  assert.deepEqual(words('cat ""'), [['cat', '']], 'an empty word is a word');
  assert.deepEqual(words(''), []);
  assert.deepEqual(words(undefined), []);
  const { segments } = shellSegments('cd d && (cd e; cat a.md) | cat b.md');
  assert.deepEqual(segments.map((s) => [s.words.join(' '), s.op, s.depth]), [['cd d', '', 0], ['cd e', '&&', 1], ['cat a.md', ';', 1], ['cat b.md', '|', 0]], 'the operator before each, without the parentheses, and the depth of ( )');
});

test('ARC-09-C267 read-routes — shellSegments: a segment says whether a word of it has an expansion the shell would make', () => {
  const x = (c, o) => shellSegments(c, o).segments.map((g) => [g.words[0], g.x]);
  assert.deepEqual(x('cat $F && ls'), [['cat', true], ['ls', false]]);
  assert.deepEqual(x('cat \'$F\' && cat "$F"'), [['cat', false], ['cat', true]], 'single quotes keep the dollar, double quotes do not');
  assert.deepEqual(x('cat ${F} "a/$G.md"'), [['cat', true]]);
  assert.deepEqual(x('cat $(find .)'), [['cat', true], ['find', false]], 'the outer command is the one with the expansion');
  assert.deepEqual(x('cat `find .`'), [['cat', true], ['find', false]]);
  assert.deepEqual(x('cat a.md \\$F 2>&1'), [['cat', false]], 'an escaped dollar is a dollar');
  assert.deepEqual(x('cat <<EOF\n$F\nEOF'), [['cat', false]], 'a heredoc body is not words');
  assert.deepEqual(x('Get-Content $f', { powershell: true }), [['Get-Content', true]]);
  assert.deepEqual(x("Get-Content '$f'", { powershell: true }), [['Get-Content', false]]);
  assert.deepEqual(x('Write-Output `$f', { powershell: true }), [['Write-Output', false]], 'the back-tick escapes in PowerShell');
  const owner = shellSegments("python3 - <<'PY'\nprint(1)\nPY\ncat > n.md <<'EOF'\nx\nEOF");
  assert.deepEqual(owner.heredocs.map((h) => [h.owner[0], h.writes]), [['python3', false], ['cat', true]], 'the words of the line a heredoc belongs to');
});

test('ARC-09-C267 read-routes — shellSegments: a here-document is text, not commands; it says whether its line writes a file', () => {
  const doc = (command, o) => shellSegments(command, o);
  const plain = doc("cat > notes.md <<'EOF'\ncat vendor/ServiceNowDocs/markdown/csm/c_Esc.md\nsee markdown/csm/c_Esc.md\nEOF\nls");
  assert.deepEqual(plain.segments.map((s) => s.words), [['cat', '>', 'notes.md'], ['ls']], 'the body is not parsed as commands');
  assert.deepEqual(plain.heredocs.map(({ body, writes }) => ({ body, writes })), [{ body: 'cat vendor/ServiceNowDocs/markdown/csm/c_Esc.md\nsee markdown/csm/c_Esc.md', writes: true }], '> makes it a written file');
  assert.deepEqual(plain.heredocs[0].owner, ['cat', '>', 'notes.md'], 'and the words of the command it feeds');
  assert.equal(plain.bare, "cat > notes.md <<'EOF'\nls", 'the line without the body');
  assert.equal(doc('tee out.md <<EOF\nbody\nEOF').heredocs[0].writes, true, 'tee');
  assert.equal(doc('cat >>out.md <<EOF\nbody\nEOF').heredocs[0].writes, true, '>>');
  assert.equal(doc('cat <<EOF\nbody\nEOF').heredocs[0].writes, false, 'a heredoc to a command that prints does not write');
  assert.equal(doc('cat 2>/dev/null <<EOF\nbody\nEOF').heredocs[0].writes, false, '2> is not a write of the text');
  assert.equal(doc('cat >&2 <<EOF\nbody\nEOF').heredocs[0].writes, false, '>&2 is not one either');
  assert.equal(doc('cat &>out.md <<EOF\nbody\nEOF').heredocs[0].writes, true, '&> is');
  assert.deepEqual(doc('cat <<-"X Y"\n\tbody\n\tX Y\nls').heredocs.map((h) => h.body), ['\tbody'], '<<- with a quoted delimiter that has a space, and the closing line indented by tabs');
  const two = doc('cat <<A <<B > f.md\none\nA\ntwo\nB\nls');
  assert.deepEqual(two.heredocs.map((h) => h.body), ['one', 'two'], 'two on one line, in order');
  assert.deepEqual(two.segments.map((s) => s.words[0]), ['cat', 'ls']);
  assert.deepEqual(doc('cat <<EOF\nunclosed body').heredocs.map((h) => h.body), ['unclosed body'], 'a body with no closing line runs to the end');
  assert.deepEqual(doc('cat <<< "a here string"').segments.map((s) => s.words), [['cat', '<<<', 'a here string']], '<<< is not a here-document');
  assert.deepEqual(doc('echo $((1 << 2))').heredocs, [], 'a shift is not one either');
});

test('ARC-09-C267 read-routes — shellSegments with powershell: a back-slash is a letter, the back-tick escapes, a quote doubles, a comma parts a list, a here-string is a body', () => {
  const ps = (c) => shellSegments(c, { powershell: true });
  assert.deepEqual(ps('Get-Content "C:\\Docs\\a b\\c_Esc.md" -TotalCount 40').segments.map((s) => s.words), [['Get-Content', 'C:\\Docs\\a b\\c_Esc.md', '-TotalCount', '40']]);
  assert.deepEqual(ps("Get-Content 'it''s.md', b.md").segments.map((s) => s.words), [['Get-Content', "it's.md", 'b.md']], 'a doubled quote is one, a comma parts the items');
  assert.deepEqual(ps('Write-Output a`;b "x`"y"').segments.map((s) => s.words), [['Write-Output', 'a;b', 'x"y']], 'a back-tick escapes the next character');
  const here = ps("@'\nGet-Content C:\\a\\c_Esc.md\n'@ | Set-Content out.md");
  assert.deepEqual(here.heredocs.map(({ body, writes }) => ({ body, writes })), [{ body: 'Get-Content C:\\a\\c_Esc.md', writes: true }], 'a here-string is text, and Set-Content writes it');
  assert.deepEqual(ps('Get-Content a.md; Get-Content b.md').segments.map((s) => s.words), [['Get-Content', 'a.md'], ['Get-Content', 'b.md']]);
});

// ---- the shell's folder ---------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — joinPath: relative to a folder, tidied; relative with no folder stays relative; a drive letter is kept', () => {
  assert.equal(joinPath('/a/b', 'c/d.md'), '/a/b/c/d.md');
  assert.equal(joinPath('/a/b', '../c/./d.md'), '/a/c/d.md');
  assert.equal(joinPath('/a/b', '/x/y'), '/x/y', 'absolute ignores the folder');
  assert.equal(joinPath('/a', '../../..'), '/', 'never above the root');
  assert.equal(joinPath('C:\\Docs\\a', '..\\b\\c.md'), 'C:/Docs/b/c.md', 'a Windows folder and back-slashes');
  assert.equal(joinPath(null, 'vendor/ServiceNowDocs/markdown/csm'), 'vendor/ServiceNowDocs/markdown/csm', 'no folder: still a path');
  assert.equal(joinPath(null, '../x/y'), '../x/y', 'a .. that leaves it is kept');
  assert.equal(joinPath('', './a//b/'), 'a/b');
});

test('ARC-09-C267 read-routes — cdOf: the target of a command that changes the folder, as written; none when it cannot be told; null for any other command', () => {
  assert.deepEqual(cdOf(['cd', 'markdown/csm']), { dir: 'markdown/csm' });
  assert.deepEqual(cdOf(['cd', '--', '-odd']), { dir: '-odd' }, 'after --');
  assert.deepEqual(cdOf(['pushd', '/a/b']), { dir: '/a/b' });
  assert.deepEqual(cdOf(['/usr/bin/cd', '/a']), { dir: '/a' }, 'by path');
  for (const unknown of [['cd'], ['cd', '-'], ['cd', '~'], ['cd', '~/x'], ['cd', '$HOME'], ['cd', '$(pwd)'], ['cd', 'a*'], ['cd', '']]) assert.deepEqual(cdOf(unknown), { dir: null }, unknown.join(' '));
  assert.equal(cdOf(['ls', '/a']), null);
  assert.equal(cdOf(['Set-Location', '/a'], {}), null, 'Set-Location is PowerShell only');
  assert.deepEqual(cdOf(['Set-Location', '-Path', 'C:\\a'], { powershell: true }), { dir: 'C:\\a' });
  assert.deepEqual(cdOf(['sl', 'C:\\a'], { powershell: true }), { dir: 'C:\\a' });
  assert.deepEqual(cdOf(['cd', '-LiteralPath', 'C:\\a b'], { powershell: true }), { dir: 'C:\\a b' });
});

// ---- the commands that show a page -----------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — commandReads: the verbs that show a page, and where each reads it from', () => {
  for (const [command, verb] of [[`cat ${FILE}`, 'cat'], [`head -50 ${FILE}`, 'head'], [`tail -n 20 ${FILE}`, 'tail'], [`sed -n '1,40p' ${FILE}`, 'sed'],
    [`awk 'NR<40' ${FILE}`, 'awk'], [`nl -ba ${FILE}`, 'nl'], [`less ${FILE}`, 'less'], [`bat ${FILE}`, 'bat'], [`/usr/bin/cat ${FILE}`, 'cat'], [`cat < ${FILE}`, 'cat'],
    [`cat <${FILE}`, 'cat'], [`cut -c1-80 ${FILE}`, 'cut'], [`fold -w 100 ${FILE}`, 'fold'], [`tac ${FILE}`, 'tac'], [`sort ${FILE}`, 'sort'], [`column -t ${FILE}`, 'column'],
    [`FOO=1 BAR=2 cat ${FILE}`, 'cat'], [`grep -n escalation ${FILE}`, 'grep'], [`egrep -n 'a|b' ${FILE}`, 'egrep'], [`rg -n escalation ${FILE}`, 'rg'],
    [`grep -i -e one -e two ${FILE}`, 'grep'], [`grep --regexp=one ${FILE}`, 'grep'], [`cat vendor/ServiceNowDocs/${PAGE}`, 'cat']]) {
    assert.deepEqual([...commandReads(command).reads], [[PAGE, verb]], command);
  }
  assert.deepEqual([...commandReads(`cat ${FILE} ${DOCS}/${OTHER}`).reads], [[PAGE, 'cat'], [OTHER, 'cat']], 'several files');
  assert.deepEqual(pagesOf(`head -3 ${FILE} | grep -n x`), [PAGE], 'at the head of a pipe; the grep has no file');
  assert.deepEqual(pagesOf(`echo start && cat ${FILE} ; echo end`), [PAGE]);
  // a wrapper, a reserved word or an assignment in front of the verb is not the verb
  for (const [command, verb] of [[`nice -n 10 cat ${FILE}`, 'cat'], [`timeout 5 head -3 ${FILE}`, 'head'], [`env LANG=C sed -n 1p ${FILE}`, 'sed'], [`sudo -n tail ${FILE}`, 'tail'],
    [`nohup nl ${FILE}`, 'nl'], [`command cat ${FILE}`, 'cat'], [`time cat ${FILE}`, 'cat'], [`if true; then cat ${FILE}; fi`, 'cat'], [`! cat ${FILE}`, 'cat'], [`{ cat ${FILE}; }`, 'cat'],
    [`for x in 1; do cat ${FILE}; done`, 'cat'], [`A=1 B=2 nice cat ${FILE}`, 'cat']]) {
    assert.deepEqual([...commandReads(command).reads], [[PAGE, verb]], command);
  }
  assert.deepEqual(pagesOf(`x=$(sed -n 1p ${FILE})`), [PAGE], 'inside a substitution');
  assert.deepEqual([...commandReads(`Get-Content "C:\\i\\vendor\\ServiceNowDocs\\markdown\\csm\\c_Esc.md" -TotalCount 40`, { powershell: true }).reads], [[PAGE, 'get-content']]);
  assert.deepEqual([...commandReads(`gc ${FILE}; type ${DOCS}/${OTHER}`, { powershell: true }).reads], [[PAGE, 'gc'], [OTHER, 'type']]);
  assert.deepEqual([...commandReads(`Select-String -Path ${FILE} -Pattern x`, { powershell: true }).reads], [[PAGE, 'select-string']]);
  assert.deepEqual([...commandReads(`sls ${FILE} x`, { powershell: true }).reads].map(([p]) => p), [PAGE], 'sls');
});

test('ARC-09-C267 read-routes — commandReads: what is not a read — a listing, a count, names only, a write, text, another page, a folder, a glob no file system answered, other tools', () => {
  for (const command of [`ls ${FOLDER}`, `ls -l ${FILE}`, `wc -l ${FILE}`, `stat ${FILE}`, `find ${FOLDER} -name '*.md'`, `file ${FILE}`, `test -f ${FILE}`, `du -h ${FILE}`,
    `grep -l escalation ${FILE}`, `grep -c escalation ${FILE}`, `grep -L escalation ${FILE}`, `grep -q escalation ${FILE}`, `grep -rl escalation ${FOLDER} ${FILE}`,
    `grep --files-with-matches x ${FILE}`, `grep --count x ${FILE}`, `rg --files ${FILE}`, `rg -c x ${FILE}`, `rg --count-matches x ${FILE}`, `rg -q x ${FILE}`,
    `grep -n ${FILE} notes.txt`, `grep -e ${FILE} notes.txt`, `echo ${FILE}`, `echo "cat ${FILE}"`, `printf '%s' ${FILE}`, `cp ${FILE} /tmp/x`, `rm ${FILE}`, `touch ${FILE}`,
    `cat ${FOLDER}`, `cat ${FOLDER}/`, `cat ${FOLDER}/*.md`, `cat ${DOCS}/README.md`, `cat /home/dev/notes/other.md`, `curl -s ${FILE}`, `cat`, '', '   ', 'true']) {
    assert.deepEqual(pagesOf(command), [], command);
  }
  for (const command of [`Get-ChildItem ${FOLDER}`, `Select-String -Path ${FILE} -Pattern x -Quiet`, `Get-Item ${FILE}`, `Test-Path ${FILE}`, `Write-Output ${FILE}`, `Copy-Item ${FILE} x`]) {
    assert.deepEqual(pagesOf(command, { powershell: true }), [], command);
  }
  assert.deepEqual(pagesOf(`Get-Content ${FILE}`), [], 'Get-Content in a Bash call is not a command there');
  assert.deepEqual(pagesOf(`cat ${FILE}`, { powershell: true }), [PAGE], 'cat is an alias in PowerShell');
});

test('ARC-09-C267 read-routes — commandReads: a here-document that writes a file is not a read of the page it names, a command after it is', () => {
  const done = commandReads(`cat > notes.md <<'EOF'\nSee ${FILE}\ncat ${FILE}\nEOF\ncat ${DOCS}/${OTHER}`);
  assert.deepEqual([...done.reads.keys()], [OTHER], 'only the real command after the body');
  assert.deepEqual(done.heredocs.map((h) => h.writes), [true]);
  assert.deepEqual(pagesOf(`python3 - <<'PY'\nprint(open('${FILE}').read())\nPY`), [], 'a script fed on stdin is not parsed for pages: its text is the names rule\'s, below');
  assert.deepEqual(pagesOf(`cat <<EOF\n${FILE}\nEOF`), [], 'a heredoc given to cat prints text the model wrote');
});

test('ARC-09-C267 read-routes — commandReads: the folder — a cd sets it for what follows, relative paths and the row\'s own folder both count, a subshell or a pipe does not move it', () => {
  const rel = { rowCwd: '/home/dev/install' };
  assert.deepEqual(pagesOf('cat vendor/ServiceNowDocs/markdown/csm/c_Esc.md', rel), [PAGE], 'a path relative to the checkout');
  assert.deepEqual(pagesOf(`cd ${FOLDER} && sed -n 1,60p c_Esc.md`), [PAGE], 'the C268 case: absolute cd, relative page');
  assert.deepEqual(pagesOf('cd vendor/ServiceNowDocs/markdown/csm && sed -n 1,60p c_Esc.md', rel), [PAGE], 'relative cd, relative page, the folder from the row');
  assert.deepEqual(pagesOf('cd vendor/ServiceNowDocs/markdown/csm && sed -n 1,60p c_Esc.md'), [PAGE], 'relative cd with no folder anywhere still names the page');
  assert.deepEqual(pagesOf(`cd ${DOCS} ; cd markdown ; cd csm ; head c_Esc.md`), [PAGE], 'three steps');
  assert.deepEqual(pagesOf(`cd ${FOLDER}/.. && cat csm/c_Esc.md ../markdown/csm/c_Other.md`), [PAGE, OTHER], 'with ..');
  assert.deepEqual(pagesOf(`cat markdown/csm/c_Esc.md`, { rowCwd: DOCS }), [PAGE], 'from the corpus folder the row records');
  assert.deepEqual(pagesOf(`cat c_Esc.md`, { cwd: FOLDER }), [PAGE], 'the folder an earlier call left');
  assert.deepEqual(pagesOf(`cat c_Esc.md`, { cwd: '/elsewhere', rowCwd: FOLDER }), [PAGE], 'the row folder is tried when the tracked one does not name a page');
  assert.deepEqual(pagesOf(`cat c_Esc.md`), [], 'no folder at all');
  assert.deepEqual(pagesOf(`cd ${FOLDER}; cd /home/dev; cat c_Esc.md`), [], 'a later cd takes the folder away');
  assert.deepEqual(pagesOf(`cd /home/dev && (cd ${FOLDER} && cat c_Esc.md) && cat c_Other.md`), [PAGE], 'a subshell\'s cd ends with it');
  assert.deepEqual(pagesOf(`cd ${FOLDER} | cat; cat c_Esc.md`), [], 'a cd in a pipe is a subshell\'s');
  assert.deepEqual(pagesOf(`cd "$HOME/x" && cat c_Esc.md`, { rowCwd: '/home/dev' }), [], 'a folder that cannot be told is no folder');
  assert.deepEqual(pagesOf(`pushd ${FOLDER} && cat c_Esc.md`), [PAGE], 'pushd');
  assert.deepEqual([...pagesOf(`Set-Location '${FOLDER.replaceAll('/', '\\')}'; Get-Content c_Esc.md`, { powershell: true })], [PAGE], 'PowerShell Set-Location, with back-slashes');
  const moved = commandReads(`cd ${FOLDER} && cat c_Esc.md`);
  assert.deepEqual([moved.moved, moved.cwd], [true, FOLDER], 'the folder after the line');
  const kept = commandReads(`(cd ${FOLDER} && cat c_Esc.md)`, { cwd: '/home/dev' });
  assert.deepEqual([kept.moved, kept.cwd], [false, '/home/dev'], 'a subshell leaves it as it was');
  assert.deepEqual([commandReads('echo hi', { cwd: '/home/dev' }).moved, commandReads('echo hi', { cwd: '/home/dev' }).cwd], [false, '/home/dev']);
});

test('ARC-09-C267 read-routes — commandReads: a search over a folder or several files reports where it ran, for the lines it prints', () => {
  assert.deepEqual(commandReads(`grep -rn escalation ${FOLDER}`, { rowCwd: '/home/dev' }).searched, ['/home/dev']);
  assert.deepEqual(commandReads(`cd ${FOLDER} && rg -n escalation .`).searched, [FOLDER], 'inside the folder a cd set');
  assert.deepEqual(commandReads(`grep -l escalation ${FOLDER}/a.md`).searched, [], 'a search that prints no line');
  assert.deepEqual(commandReads(`cat ${FILE}`).searched, [], 'cat is not a search');
});

// ---- what a search printed ---------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — pagesInLines: pages whose lines were printed, with their path first; a listing, other files and a line that merely mentions a page are not', () => {
  const body = [
    `${FILE}:12:The sn\\_escalation table.`,
    `${FILE}-13-context line`,
    `vendor/ServiceNowDocs/${OTHER}:4:x`,
    'C:\\Users\\Dev One\\snowarch\\vendor\\ServiceNowDocs\\markdown\\csm\\c_Third.md:7:x',
    '/home/dev/notes/other.md:3:not the corpus',
    `12:see ${FILE}: it says so`,
    `${DOCS}/markdown/csm/c_Listed.md`,
    `${FILE.replace('c_Esc', 'c_Count')}:3`.replace(':3', ''),
    '',
  ].join('\n');
  assert.deepEqual([...pagesInLines(body)].sort(), [PAGE, OTHER, 'markdown/csm/c_Third.md'].sort());
  assert.deepEqual([...pagesInLines('c_Esc.md:12:x\nc_Other.md-13-y', [FOLDER])].sort(), [PAGE, OTHER].sort(), 'a path relative to the folder the search ran in');
  assert.deepEqual([...pagesInLines('c_Esc.md:12:x', [null, '', '/elsewhere'])], [], 'no folder that makes it a page');
  assert.deepEqual([...pagesInLines(undefined)], []);
  assert.deepEqual([...pagesInLines(`${FILE}:1:x`.repeat(1))], [PAGE]);
});

test('ARC-09-C267 read-routes — pagesOfGrep: only content mode shows lines of a page; the page a Grep names as its path counts, a listing and a count do not', () => {
  const lines = `${FILE}:12:text\n${DOCS}/${OTHER}-13-context`;
  assert.deepEqual([...pagesOfGrep({ output_mode: 'content', pattern: 'x', path: DOCS }, lines)].sort(), [PAGE, OTHER].sort());
  assert.deepEqual([...pagesOfGrep({ output_mode: 'content', pattern: 'x', path: FILE }, '12:text only')], [PAGE], 'one file searched: its lines carry no path');
  assert.deepEqual([...pagesOfGrep({ output_mode: 'files_with_matches', pattern: 'x', path: DOCS }, `${FILE}\n${DOCS}/${OTHER}`)], []);
  assert.deepEqual([...pagesOfGrep({ output_mode: 'count', pattern: 'x', path: DOCS }, `${FILE}:3`)], []);
  assert.deepEqual([...pagesOfGrep({ pattern: 'x', path: DOCS }, `${FILE}:3`)], [], 'the default mode lists files');
  assert.deepEqual([...pagesOfGrep({ output_mode: 'content', pattern: 'x', path: FILE }, '')], [], 'no lines came back: nothing was shown');
  assert.deepEqual([...pagesOfGrep({ output_mode: 'content', pattern: 'x', path: '.' }, 'c_Esc.md:12:x', FOLDER)], [PAGE], 'relative lines, joined to the row\'s folder');
});

test('ARC-09-C267 read-routes — pagesOfInput: a file an MCP call names, and what the shell in it shows', () => {
  assert.deepEqual([...pagesOfInput({ path: FILE })], [PAGE]);
  assert.deepEqual([...pagesOfInput({ file_path: FILE })], [PAGE]);
  assert.deepEqual([...pagesOfInput({ paths: [FILE, `${DOCS}/${OTHER}`, 7] })].sort(), [PAGE, OTHER].sort());
  assert.deepEqual([...pagesOfInput({ commands: [{ label: 'a', command: `cat ${FILE}` }, { label: 'b', command: `ls ${FOLDER}` }], queries: ['q'] })], [PAGE]);
  assert.deepEqual([...pagesOfInput({ language: 'shell', code: `head -50 ${FILE}` })], [PAGE]);
  assert.deepEqual([...pagesOfInput({ language: 'python', code: `print(open('${FILE}').read())` })], [], 'code in another language is not parsed');
  assert.deepEqual([...pagesOfInput({ path: '/home/dev/notes/other.md' })], []);
  assert.deepEqual([...pagesOfInput(undefined)], []);
  assert.deepEqual([...pagesOfInput({ command: `sed -n 1p ${FILE}` })], [PAGE]);
});

// ---- what cannot be resolved (ARC-09-C267, the architect's ruling of 2026-11-16) ------------------------------------------------------
test('ARC-09-C267 read-routes — expandBraces: lists, nested lists, ranges; a variable or a lone brace is left alone; a cap', () => {
  assert.deepEqual(expandBraces('a.md'), ['a.md']);
  assert.deepEqual(expandBraces('{a,b}.md'), ['a.md', 'b.md']);
  assert.deepEqual(expandBraces('c_{Esc,Other}.md'), ['c_Esc.md', 'c_Other.md']);
  assert.deepEqual(expandBraces('{x,y}/{1,2}.md'), ['x/1.md', 'x/2.md', 'y/1.md', 'y/2.md']);
  assert.deepEqual(expandBraces('c_{Esc,{A,B}}.md'), ['c_Esc.md', 'c_A.md', 'c_B.md']);
  assert.deepEqual(expandBraces('p{1..3}.md'), ['p1.md', 'p2.md', 'p3.md']);
  assert.deepEqual(expandBraces('p{a..c}.md'), ['pa.md', 'pb.md', 'pc.md']);
  assert.deepEqual(expandBraces('p{3..1}.md'), ['p3.md', 'p2.md', 'p1.md']);
  assert.deepEqual(expandBraces('${HOME}/a.md'), ['${HOME}/a.md'], 'a variable is not a list');
  assert.deepEqual(expandBraces('{a}.md'), ['{a}.md'], 'one item is not a list');
  assert.deepEqual(expandBraces('{}.md'), ['{}.md']);
  assert.deepEqual(expandBraces('x{,y}.md'), ['x.md', 'xy.md'], 'an empty item is an item');
  assert.equal(expandBraces('{1..9}{1..9}{1..9}.md').length, 256, 'capped, and the cap is the shell\'s answer cut, not an error');
});

test('ARC-09-C267 read-routes — hasExpansion: a variable, a substitution or a back-tick outside single quotes; not a literal, not a lone dollar', () => {
  for (const yes of ['cat $F', 'cat ${F}', 'cat $(find . -name x.md)', 'cat `find . -name x.md`', 'cat "$F"', 'cat "a/$F.md"', 'cat $1', 'echo $@']) {
    assert.equal(hasExpansion(yes), true, yes);
  }
  for (const no of ['cat a.md', "cat '$F'", 'cat \\$F', 'grep -n "^foo$" a.md', 'echo $', 'echo "cost: 5$"', "echo 'a `b`'"]) {
    assert.equal(hasExpansion(no), false, no);
  }
  assert.equal(hasExpansion('Get-Content $f', { powershell: true }), true);
  assert.equal(hasExpansion('Get-Content $(Get-Item a.md)', { powershell: true }), true);
  assert.equal(hasExpansion("Get-Content 'a$b.md'", { powershell: true }), false, 'a PowerShell single quote is literal');
  assert.equal(hasExpansion('Write-Output `$x', { powershell: true }), false, 'the back-tick escapes in PowerShell');
  assert.equal(hasExpansion('Get-Content `a.md', { powershell: true }), false, 'and is not a substitution there');
  assert.equal(hasExpansion('cat a.md', { powershell: true }), false);
  assert.equal(hasExpansion(undefined), false);
});

test('ARC-09-C267 read-routes — mentionsPage: a page\'s bare file name in a text, as a whole name and not inside another', () => {
  const name = 'c_Esc.md';
  for (const yes of ['cat c_Esc.md', 'cat ./c_Esc.md', 'cat dir/c_Esc.md', "open('/x/markdown/csm/c_Esc.md')", 'cat "c_Esc.md"', 'a:c_Esc.md', 'for f in c_Esc.md c_Other.md; do', 'see c_Esc.md.', 'C:\\docs\\c_Esc.md']) {
    assert.equal(mentionsPage(yes, name), true, yes);
  }
  for (const no of ['cat xc_Esc.md', 'cat c_Esc.md.bak', 'cat c_Esc.mdx', 'cat -c_Esc.md', 'cat .c_Esc.md', 'cat c_Esc', 'cat c_esc.md', 'cat c_Other.md', '']) {
    assert.equal(mentionsPage(no, name), false, no);
  }
  assert.equal(mentionsPage('cat xc_Esc.md c_Esc.md', name), true, 'a later whole name still counts');
  assert.equal(mentionsPage(undefined, name), false);
  assert.equal(mentionsPage('c_Esc.md', ''), false);
});

test('ARC-09-C267 read-routes — commandReads: a brace list is expanded in a viewer\'s arguments, whether or not a file system is given', () => {
  assert.deepEqual(pagesOf(`sed -n 1,40p ${FOLDER}/c_{Esc,Other}.md`), [PAGE, OTHER], 'absolute');
  assert.deepEqual(pagesOf(`cd ${FOLDER} && sed -n 1,40p {c_Esc,c_Other}.md`), [PAGE, OTHER], 'after a cd');
  assert.deepEqual(pagesOf('sed -n 1,40p {c_Esc,c_Other}.md', { cwd: FOLDER }), [PAGE, OTHER], 'from the folder an earlier call left');
  assert.deepEqual(pagesOf(`cat ${FOLDER}/c_{Esc,{Other,Gone}}.md`), [PAGE, OTHER, 'markdown/csm/c_Gone.md'], 'nested, and an item that is no file is still a name the shell would try');
  assert.deepEqual(pagesOf(`Get-Content ${FOLDER}/c_{Esc,Other}.md`, { powershell: true }), [], 'PowerShell does not expand braces');
});

test('ARC-09-C267 read-routes — commandReads: a glob is asked of the file system the caller gives, from the folder the shell was in, and only under the corpus', () => {
  const asked = [];
  const glob = (pattern, o) => { asked.push([pattern, Boolean(o?.ci)]); return pattern.endsWith('/*.md') || pattern.endsWith('/c_*.md') ? [`${FOLDER}/c_Esc.md`, `${FOLDER}/c_Other.md`, `${FOLDER}/index.json`] : []; };
  assert.deepEqual(pagesOf(`cat ${FOLDER}/*.md`, { glob }), [PAGE, OTHER], 'a pattern that expands to pages; the file that is no page is dropped');
  assert.deepEqual(asked.at(-1), [`${FOLDER}/*.md`, false]);
  assert.deepEqual(pagesOf(`cd ${FOLDER} && cat c_*.md`, { glob }), [PAGE, OTHER], 'a relative pattern after a cd');
  assert.deepEqual(asked.at(-1), [`${FOLDER}/c_*.md`, false]);
  assert.deepEqual(pagesOf('cat markdown/csm/c_*.md', { glob, cwd: DOCS }), [PAGE, OTHER], 'relative to the folder an earlier call left');
  assert.deepEqual(pagesOf('cat vendor/ServiceNowDocs/markdown/csm/*.md', { glob, rowCwd: '/home/dev/install' }), [PAGE, OTHER], 'relative to the row\'s folder');
  const before = asked.length;
  assert.deepEqual(pagesOf('cat /tmp/*.md', { glob }), [], 'a folder outside the corpus is not asked about');
  assert.deepEqual(pagesOf('cat *.md', { glob, cwd: '/home/dev' }), []);
  assert.deepEqual(pagesOf('cat *.md', { glob }), [], 'no folder known: the pattern is not made absolute from the process\'s own');
  assert.equal(asked.length, before, 'none of those reached the file system');
  assert.deepEqual(pagesOf(`cat ${FOLDER}/{c_Esc,c_Other}*.md`, { glob }), [], 'a brace and a glob together: each form is asked');
  assert.deepEqual(asked.slice(before).map(([p]) => p), [`${FOLDER}/c_Esc*.md`, `${FOLDER}/c_Other*.md`]);
  assert.deepEqual(pagesOf(`cat ${FOLDER}/*.md`), [], 'with no file system the pattern shows nothing it can name');
  pagesOf(`Get-Content "${FOLDER.replaceAll('/', '\\')}\\*.md"`, { powershell: true, glob });
  assert.deepEqual(asked.at(-1), [`${FOLDER}/*.md`, true], 'PowerShell: forward slashes, and case does not matter');
  assert.deepEqual(pagesOf(`grep -n escalation ${FOLDER}/*.md`, { glob }), [PAGE, OTHER], 'a search over a pattern');
  assert.deepEqual(pagesOf(`grep -l escalation ${FOLDER}/*.md`, { glob }), [], 'a listing search over it shows no page');
});

test('ARC-09-C267 read-routes — commandReads: what cannot be resolved is returned as the text of the call, for the names rule', () => {
  const un = (c, o) => commandReads(c, o).unresolved;
  const names = (c, o) => un(c, o).some((t) => mentionsPage(t, 'c_Esc.md'));
  // the architect's four, and their relatives
  for (const command of ['for f in c_Esc.md c_Other.md; do head -20 "$f"; done', 'find . -name c_Esc.md | xargs cat', 'find . -name c_Esc.md -exec cat {} \;', 'find . -name c_Esc.md -execdir head -5 {} +',
    'cat $(find . -name c_Esc.md)', 'cat `find . -name c_Esc.md`', 'F=c_Esc.md; cat $F', 'while read f; do sed -n 1,5p $f; done <<< c_Esc.md', 'ls c_Esc.md | parallel cat {}',
    'eval "cat c_Esc.md"', 'while read -r line; do echo "$line"; done < c_Esc.md', 'bash -c "cat c_Esc.md"', 'sh -c \'head c_Esc.md\'', 'echo c_Esc.md | xargs -I{} sed -n 1,3p {}']) {
    assert.equal(names(command), true, command);
  }
  // another language, by name or through a wrapper, and what a heredoc into it holds
  for (const command of [`python3 -c "print(open('${FILE}').read())"`, `python -c "open('${FILE}')"`, `node -e "require('fs').readFileSync('${FILE}')"`, `perl -ne 'print' ${FILE}`, `ruby -e 'puts File.read("${FILE}")'`,
    `php -r 'echo file_get_contents("${FILE}");'`, `nice -n 10 python3 -c "open('${FILE}')"`, `timeout 5 node -e "open('${FILE}')"`, `env LANG=C python3 -c "open('${FILE}')"`,
    `git show HEAD:vendor/ServiceNowDocs/${PAGE}`, `git -C vendor/ServiceNowDocs cat-file -p HEAD:${PAGE}`, `git blame ${FILE}`, `git log -p -- ${FILE}`,
    `python3 - <<'PY'\nprint(open('${FILE}').read())\nPY`, `node - <<EOF > out.txt\nrequire('fs').readFileSync('${FILE}')\nEOF`]) {
    assert.equal(names(command), true, command);
  }
  // a variable or a substitution in a viewer's arguments makes the call unresolved, and so does a viewer with nothing to name its pages
  assert.equal(names('cd "$REPO" && cat "$DOCS"/c_Esc.md && ls'), true, 'the whole call is the text');
  assert.equal(names('echo $HOME && cat c_Esc.md', { cwd: FOLDER }), false, 'a variable in another command of the call is not in a viewer\'s words: the viewer\'s page is the definite one');
  assert.equal(names('cd "$REPO" && cat c_Esc.md', { cwd: FOLDER }), true, 'but a cd with a variable loses the folder, and the viewer\'s relative name is then the text');
  assert.equal(names('$VIEWER c_Esc.md'), true, 'a verb the shell builds could be anything');
  assert.equal(names(`FILE=${FILE}; head -50 "$FILE"`), true);
  assert.equal(names(`cat ${DOCS}/markdown/csm/$(echo c_Esc).md`), false, 'a name the shell builds is not in the text');
  // PowerShell
  for (const command of [`Get-ChildItem ${FOLDER} -Filter c_Esc.md | Get-Content`, `gci -Recurse -Filter c_Esc.md | gc`, `Get-ChildItem c_Esc.md | ForEach-Object { Get-Content $_ }`,
    "foreach ($f in 'c_Esc.md') { Get-Content $f }", `$p = 'c_Esc.md'; Get-Content $p`, `[System.IO.File]::ReadAllText('${FILE}')`, "'c_Esc.md' | % { gc $_ }", `python -c "open('${FILE}')"`, `Invoke-Expression "gc ${FILE}"`]) {
    assert.equal(names(command, { powershell: true }), true, command);
  }
  // not unresolved: a command that cannot show a page, with a variable or not; a definite read
  for (const command of ['ls $DIR/c_Esc.md', 'echo $HOME c_Esc.md', 'grep -l x $F c_Esc.md', 'cd $REPO && ls c_Esc.md', 'wc -l c_Esc.md', 'cp c_Esc.md $DEST', `cat ${FILE}`, `ls ${FILE}`, 'find . -name c_Esc.md', 'git status c_Esc.md', 'curl -s c_Esc.md']) {
    assert.deepEqual(un(command), [], command);
  }
  assert.deepEqual(un('Get-ChildItem c_Esc.md', { powershell: true }), []);
  assert.deepEqual(un('Get-Content c_Esc.md | Select-String x', { powershell: true, cwd: FOLDER }), [], 'a read that feeds a pipe is a definite read, and the search after it has no file to name');
  assert.equal(names('Get-Content c_Esc.md | Get-Content', { powershell: true, cwd: FOLDER }), true, 'a Get-Content with nothing to name reads what the pipe gives it');
});

test('ARC-09-C267 read-routes — commandReads: the text of an unresolved call has its heredoc bodies when they are a script, not when they are text a command writes', () => {
  const text = (c) => commandReads(c).unresolved.join('\n');
  assert.match(text(`python3 - <<'PY'\nopen('c_Esc.md')\nPY`), /open\('c_Esc.md'\)/, 'a script on stdin');
  assert.match(text(`python3 - > out.txt <<'PY'\nopen('c_Esc.md')\nPY`), /open\('c_Esc.md'\)/, 'even when the interpreter\'s output goes to a file');
  assert.doesNotMatch(text(`cat > notes.md <<'EOF'\nsee c_Other.md\nEOF\nfind . -name x.md | xargs cat`), /c_Other/, 'a body that a cat writes is the model\'s text, not what the call read');
  assert.match(text(`cat > notes.md <<'EOF'\nsee c_Other.md\nEOF\nfind . -name x.md | xargs cat`), /x\.md/);
  assert.deepEqual(commandReads('ls \'$F\' c_Esc.md').unresolved, [], 'a single-quoted dollar is a literal');
});

test('ARC-09-C267 read-routes — commandReads: a folder the call cannot tell (an unresolvable cd, no cwd at all) leaves a relative .md name unresolved, not lost', () => {
  const un = (c, o) => commandReads(c, o).unresolved;
  const lost = commandReads(`cd "$REPO/vendor/ServiceNowDocs/markdown/csm" && sed -n 1,60p c_Esc.md`, { rowCwd: '/home/dev/install' });
  assert.deepEqual([...lost.reads], [], 'no page it can name');
  assert.deepEqual(lost.unresolved, ['c_Esc.md'], 'the name the model typed');
  assert.deepEqual([lost.moved, lost.lost, lost.cwd], [true, true, null], 'and the folder is lost for the calls that follow');
  assert.deepEqual(un('sed -n 1,60p c_Esc.md', { lost: true, rowCwd: '/home/dev/install' }), ['c_Esc.md'], 'the next call, with the folder still lost');
  assert.deepEqual(un('cat c_Esc.md notes.txt'), ['c_Esc.md'], 'no folder known at all; a name that is no .md is nothing to match');
  assert.deepEqual(un('cat notes.md', { cwd: '/home/dev' }), [], 'a folder that is known and is not the corpus: not a page, not unresolved');
  assert.deepEqual(un(`cat c_Esc.md`, { cwd: FOLDER }), [], 'a folder that is known and is the corpus: a page');
  const found = commandReads(`cd "$REPO" ; cd ${FOLDER}; cat c_Esc.md`);
  assert.deepEqual([...found.reads.keys(), found.lost, found.cwd], [PAGE, false, FOLDER], 'a later cd to a folder it can tell ends the loss');
  assert.deepEqual(un(`cat ${FOLDER}/*.md`, { glob: () => [] }), [`${FOLDER}/*.md`], 'a glob nothing answered');
});

test('ARC-09-C267 read-routes — commandReads: viewer — a call with a viewer or a search that prints lines, or a runner that is given one', () => {
  const v = (c, o) => commandReads(c, o).viewer;
  for (const yes of [`cat ${FILE}`, 'grep -n x c_Esc.md', 'rg x c_Esc.md', 'for f in a; do head -3 $f; done', 'ls | xargs head -2', 'find . -exec cat {} \;', 'find . -name x.md -execdir sed -n 1p {} +',
    'bash -c "cat x.md"', 'xargs -I{} sed -n 1p {}', 'ls | parallel awk 1 {}', 'sort $F', 'eval "tail -3 x.md"']) {
    assert.equal(v(yes), true, yes);
  }
  for (const no of ['ls dir', 'grep -l x a.md', 'grep -c x a.md', 'python3 -c "print(1)"', 'python3 -c "print(\'cat\')"', 'echo $F', 'find . -name x.md', 'cp a b', 'wc -l a.md', 'git show HEAD:x', 'ls | xargs echo', 'for f in a; do echo $f; done', '']) {
    assert.equal(v(no), false, no);
  }
  for (const yes of ['Get-Content a.md', 'gci | gc', 'Select-String x a.md', "foreach ($f in 'a') { Get-Content $f }", 'gci | ForEach-Object { Get-Content $_ }']) assert.equal(v(yes, { powershell: true }), true, yes);
  for (const no of ['Get-ChildItem', 'Select-String x a.md -Quiet', 'Write-Output a.md', 'python -c "print(1)"']) assert.equal(v(no, { powershell: true }), false, no);
});

test('ARC-09-C267 read-routes — walkThread: a failed viewer call shows the pages it names that are on disk, and an unresolved call with a viewer shows the pages its output names', () => {
  const exists = (page) => page !== 'markdown/csm/c_Gone.md';
  const rows = [
    U('q'),
    ...call('f1', 'Bash', { command: `cat ${FILE} ${FOLDER}/c_Gone.md` }, 'cat: c_Gone.md: No such file or directory', { error: true }),
    ...call('f2', 'Bash', { command: 'python3 -c "open(\'c_Other.md\')"' }, 'Traceback', { error: true }),
    ...call('f3', 'Bash', { command: `cd ${FOLDER} && false` }, '', { error: true }),
    ...call('f4', 'Bash', { command: 'cat c_Third.md' }, 'x'),
    ...call('u1', 'Bash', { command: 'for f in $(ls d); do echo "== $f"; head -3 d/$f; done' }, '== c_Fifth.md\n1\tx'),
    ...call('u2', 'Bash', { command: 'python3 -c "print(1)"' }, 'c_Sixth.md'),
    ...call('u3', 'Bash', { command: 'for f in $(ls d); do head -3 d/$f; done' }, '== c_Seventh.md', { error: true }),
    ...call('u4', 'Bash', { command: `cd ${FOLDER}; head -2 c_Eighth.md c_Gone.md` }, '==> c_Eighth.md <==', { error: true }),
  ];
  const walked = walkThread(rows, { pageExists: exists });
  assert.deepEqual([...walked.reached.keys()], [PAGE, 'markdown/csm/c_Eighth.md'], 'a.md of a failed cat, and the page of a failed head; not the one that is not on disk, not the python call, not what a failed cd would have set');
  assert.deepEqual(walked.opaque.map((o) => o.text), ['c_Third.md', 'x', 'for f in $(ls d); do echo "== $f"; head -3 d/$f; done', '== c_Fifth.md\n1\tx', 'python3 -c "print(1)"'],
    'the cat after the failed cd had no folder, so its name and its output; the loop and its output; the python call, whose output is not read, for it has no viewer');
  assert.deepEqual(walked.failedOpaque.map((o) => o.text), ['for f in $(ls d); do head -3 d/$f; done', '== c_Seventh.md'], 'what a failed call with a viewer leaves, apart');
  assert.deepEqual([...walkThread(rows).reached.keys()], [], 'with no way to ask whether a page is on disk a failed call shows nothing');
  const long = walkThread([U('q'), ...call('l', 'Bash', { command: 'for f in $(ls d); do head -3 d/$f; done' }, `${'x'.repeat(600_000)} c_Late.md`)]);
  assert.ok(long.opaque[1].text.length <= 500_000, 'an output is kept to its first 500,000 characters');
});

test('ARC-09-C267 read-routes — inputReads: an MCP call\'s files, its shell lines, and the code of another language as text', () => {
  const r = inputReads({ language: 'python', code: `print(open('${FILE}').read())` });
  assert.deepEqual([[...r.pages], r.unresolved], [[], [`print(open('${FILE}').read())`]]);
  assert.deepEqual([...inputReads({ language: 'shell', code: `head ${FILE}` }).pages], [PAGE]);
  const batch = inputReads({ commands: [{ label: 'a', command: 'find . -name c_Esc.md | xargs cat' }, { label: 'b', command: `cat ${DOCS}/${OTHER}` }], queries: ['q'] });
  assert.deepEqual([...batch.pages], [OTHER]);
  assert.ok(batch.unresolved.some((t) => mentionsPage(t, 'c_Esc.md')));
  assert.deepEqual([...inputReads({ language: 'shell', code: 'cat *.md' }, { rowCwd: FOLDER, glob: () => [`${FOLDER}/c_Esc.md`] }).pages], [PAGE], 'the file system and the row\'s folder reach an MCP shell line too');
  assert.deepEqual(inputReads({ language: 'javascript', code: '' }).unresolved, [], 'no code, nothing');
  assert.deepEqual(inputReads(undefined).unresolved, []);
});

// ---- one thread --------------------------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — walkThread: a call counts only when it came back without an error, and the route that showed the page is kept', () => {
  const rows = [
    U('how does a case escalate?'),
    ...call('r1', 'Read', { file_path: FILE }, '1\tbody'),
    ...call('r2', 'Read', { file_path: `${DOCS}/${OTHER}` }, 'File does not exist', { error: true }),
    ...call('b1', 'Bash', { command: `cat ${DOCS}/markdown/csm/c_Third.md` }),
    ...call('b2', 'Bash', { command: `cat ${DOCS}/markdown/csm/c_Fourth.md` }, 'No such file', { error: true }),
    ...call('g1', 'Grep', { pattern: 'x', path: DOCS, output_mode: 'content' }, `${DOCS}/markdown/csm/c_Fifth.md:3:x`),
    ...call('g2', 'Grep', { pattern: 'x', path: DOCS }, `${DOCS}/markdown/csm/c_Sixth.md`),
    ...call('m1', MCP_FILE, { path: `${DOCS}/markdown/csm/c_Seventh.md` }, 'summary'),
    ...call('p1', 'PowerShell', { command: `Get-Content ${DOCS}/markdown/csm/c_Eighth.md` }),
    ...call('s1', 'Skill', { skill: 'csm-specialist' }, `Launching skill: ${PAGE}`),
  ];
  const { reached } = walkThread(rows);
  assert.deepEqual([...reached].map(([page, how]) => [page, how.route]), [
    [PAGE, 'Read'], ['markdown/csm/c_Third.md', 'cat'], ['markdown/csm/c_Fifth.md', 'Grep'], ['markdown/csm/c_Seventh.md', 'mcp'], ['markdown/csm/c_Eighth.md', 'get-content'],
  ]);
  assert.deepEqual(walkThread(null).reached.size, 0);
  assert.deepEqual(walkThread([null, 7, 'x', {}, { type: 'user' }, { type: 'assistant', message: 'text' }, U([{ type: 'tool_result', tool_use_id: 'nobody', content: 'x' }])]).reached.size, 0, 'rows that are not calls are skipped');
});

test('ARC-09-C267 read-routes — walkThread: a cd that succeeded carries to the next call, a cd in a failed call does not, and a row\'s own folder is tried too', () => {
  const rows = [
    U('q'),
    ...call('c1', 'Bash', { command: `cd ${FOLDER}` }),
    ...call('c2', 'Bash', { command: 'sed -n 1,60p c_Esc.md' }),
    ...call('c3', 'Bash', { command: `cd ${DOCS}/markdown/hr && ls` }, 'no such folder', { error: true }),
    ...call('c4', 'Bash', { command: 'head -3 c_Other.md' }),
    ...call('c5', 'Bash', { command: 'cd ..' }),
    ...call('c6', 'Bash', { command: 'cat csm/c_Third.md' }),
    ...call('c7', 'Bash', { command: 'cat c_Fourth.md' }, 'ok', { row: { cwd: FOLDER } }),
    ...call('c8', 'Bash', { command: 'cat c_Never.md' }),
  ];
  assert.deepEqual([...walkThread(rows).reached.keys()], [PAGE, OTHER, 'markdown/csm/c_Third.md', 'markdown/csm/c_Fourth.md']);
});

test('ARC-09-C267 read-routes — walkThread: an unresolved call is kept as text with its row, an errored one is not, a lost folder carries and a later cd ends it', () => {
  const rows = [
    U('q'),
    ...call('o1', 'Bash', { command: 'find . -name c_Esc.md | xargs cat' }),
    ...call('o2', 'Bash', { command: 'python3 -c "open(\'c_Other.md\')"' }, 'Exit code 1', { error: true }),
    ...call('o3', 'Bash', { command: 'cd "$REPO/vendor/ServiceNowDocs/markdown/csm"' }),
    ...call('o4', 'Bash', { command: 'sed -n 1,10p c_Third.md' }),
    ...call('o5', 'Bash', { command: `cd ${FOLDER}` }),
    ...call('o6', 'Bash', { command: 'head -3 c_Fourth.md' }),
    ...call('o7', MCP_FILE, { language: 'python', code: "open('c_Fifth.md')" }),
  ];
  const { opaque, reached } = walkThread(rows);
  assert.deepEqual(opaque.map((o) => o.text), ['find . -name c_Esc.md | xargs cat', 'c_Third.md', "open('c_Fifth.md')"], 'the call that failed is not there, the folder was lost for o4 only');
  assert.deepEqual(opaque.map((o) => o.at), [1, 7, 13], 'and the row of each');
  assert.deepEqual([...reached.keys()], ['markdown/csm/c_Fourth.md'], 'what the second cd made resolvable is a definite read');
});

test('ARC-09-C267 read-routes — turnSources carries the texts of the failed and the successful unresolved calls apart, and asks the caller whether a page is on disk', () => {
  const rows = [U('q'),
    ...call('a', 'Bash', { command: 'cat c_Esc.md c_Gone.md' }, 'x', { error: true, row: { cwd: FOLDER } }),
    ...call('b', 'Bash', { command: 'ls d | xargs head -2' }, '==> d/c_Other.md <=='),
    ...call('c', 'Bash', { command: 'for f in c_Third.md; do head -3 "$f"; done' }, 'out', { error: true })];
  const t = turnSources(rows, { pageExists: (p) => !p.endsWith('c_Gone.md') });
  assert.deepEqual([...t.reached.keys()], [PAGE], 'the failed cat shows the page that is on disk, from the folder the row records');
  assert.deepEqual(t.opaque, ['ls d | xargs head -2', '==> d/c_Other.md <==']);
  assert.deepEqual(t.opaqueFailed, ['for f in c_Third.md; do head -3 "$f"; done', 'out']);
});

test('ARC-09-C267 read-routes — walkThread and turnSources take the file system the caller gives: a pattern in a call shows the pages it expands to', () => {
  const asked = [];
  const glob = (pattern) => { asked.push(pattern); return [`${FOLDER}/c_Esc.md`, `${FOLDER}/c_Other.md`]; };
  const rows = [U('q'), ...call('g1', 'Bash', { command: `cat ${FOLDER}/*.md` }, '1\tThe sn\\_escalation table.')];
  assert.deepEqual([...walkThread(rows, { glob }).reached.keys()], [PAGE, OTHER]);
  assert.deepEqual([...walkThread(rows).reached.keys()], [], 'without one the pattern names nothing');
  const t = turnSources(rows, { glob });
  assert.deepEqual([[...t.reached.keys()], [...t.pagesRead], t.names.read.has('sn_escalation')], [[PAGE, OTHER], [PAGE, OTHER], true], 'and the names those pages print are sourced');
  const text = turnSources([U('q'), ...call('p', 'Bash', { command: 'python3 -c "open(\'c_Esc.md\')"' })]);
  assert.deepEqual(text.opaque, ['python3 -c "open(\'c_Esc.md\')"'], 'turnSources carries the unresolved texts of every row');
  assert.ok(asked.length >= 1);
});

test('ARC-09-C267 read-routes — walkThread: a search\'s printed lines name pages (route search); the shell calls are kept by id, for the names a page\'s text sources', () => {
  const rows = [
    U('q'),
    ...call('s1', 'Bash', { command: `grep -rn escalation ${FOLDER}` }, `${FILE}:12:escalation here\n${DOCS}/${OTHER}:3:and here`),
    ...call('s2', 'Bash', { command: `grep -rl escalation ${FOLDER}` }, `${FILE}\n${DOCS}/${OTHER}`),
    ...call('s3', 'Bash', { command: `cat ${DOCS}/markdown/csm/c_Third.md | grep -n x` }, '4:x'),
    ...call('s4', 'PowerShell', { command: `Select-String -Path ${DOCS}\\markdown\\csm\\*.md -Pattern x` }, `${DOCS}/markdown/csm/c_Fourth.md:2:x`),
  ];
  const { reached, calls } = walkThread(rows);
  assert.deepEqual([...reached].map(([p, h]) => [p, h.route]), [[PAGE, 'search'], [OTHER, 'search'], ['markdown/csm/c_Third.md', 'cat'], ['markdown/csm/c_Fourth.md', 'search']]);
  assert.deepEqual([...calls.keys()], ['s1', 's3', 's4'], 'a listing grep shows no page');
  assert.deepEqual([...calls.get('s3')], [['markdown/csm/c_Third.md', 'cat']]);
});

test('ARC-09-C267 read-routes — walkThread: the text of a file written — Write, Edit, MultiEdit, NotebookEdit and a heredoc that redirects — and where in the rows it was', () => {
  const rows = [
    U('q'),
    ...call('w1', 'Write', { file_path: '/x/a.md', content: 'A cites markdown/csm/c_Esc.md' }),
    ...call('w2', 'Edit', { file_path: '/x/a.md', old_string: 'A', new_string: 'B cites markdown/csm/c_Other.md' }),
    ...call('w3', 'MultiEdit', { file_path: '/x/a.md', edits: [{ old_string: 'a', new_string: 'one' }, { old_string: 'b', new_string: 'two' }, { old_string: 'c' }] }),
    ...call('w4', 'NotebookEdit', { notebook_path: '/x/n.ipynb', new_source: 'cell' }),
    ...call('w5', 'Bash', { command: "cat > /x/b.md <<'EOF'\nC cites markdown/csm/c_Third.md\nEOF" }),
    ...call('w6', 'Bash', { command: "cat <<'EOF'\nprinted, not written\nEOF" }),
    ...call('w7', 'Write', { file_path: '/x/c.md', content: 'failed write' }, 'permission denied', { error: true }),
  ];
  const { writes } = walkThread(rows);
  assert.deepEqual(writes.map((w) => [w.tool, w.text]), [
    ['Write', 'A cites markdown/csm/c_Esc.md'], ['Edit', 'B cites markdown/csm/c_Other.md'], ['MultiEdit', 'one'], ['MultiEdit', 'two'], ['NotebookEdit', 'cell'],
    ['Bash', 'C cites markdown/csm/c_Third.md'],
  ]);
  assert.deepEqual(writes.map((w) => w.at), [1, 3, 5, 5, 7, 9], 'the row of each call');
});

// ---- the turn's facts -------------------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — turnSources: reached over every row (a compaction does not undo a read), written in this turn only, typed in every prompt', () => {
  const boundary = { type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted' };
  const rows = [
    U('First, please read markdown\\csm\\c_Typed.md for me', { cwd: '/home/dev/install' }),
    ...call('a', 'Read', { file_path: FILE }, '1\tbody'),
    ...call('w0', 'Write', { file_path: '/x/old.md', content: 'an earlier turn cites markdown/csm/c_Old.md' }),
    boundary,
    U('And now the second question'),
    ...call('b', 'Bash', { command: `cat ${DOCS}/${OTHER}` }),
    ...call('w1', 'Write', { file_path: '/x/new.md', content: 'this turn cites markdown/csm/c_New.md' }),
    A([{ type: 'text', text: 'done' }]),
  ];
  const t = turnSources(rows);
  assert.deepEqual([...t.reached.keys()], [PAGE, OTHER], 'the Read before the compaction counts');
  assert.deepEqual(t.written.map((w) => w.text), ['this turn cites markdown/csm/c_New.md'], 'a file of an earlier turn is not this turn\'s');
  assert.ok(t.typed.includes('markdown/csm/c_typed.md'), 'typed, lower case, forward slashes');
  assert.ok(t.pagesRead.has(OTHER) && !t.pagesRead.has(PAGE), 'the names a page sources are the live ones');
  // The same turn when the walk's grep route is not a page shown: `pagesRead` keeps its earlier meaning, `reached` does not.
  const searched = turnSources([U('q'), ...call('g', 'Bash', { command: `grep -n x ${FILE}` }, '3:x')]);
  assert.deepEqual([[...searched.reached.keys()], [...searched.pagesRead]], [[PAGE], []]);
  const relative = turnSources([U('q', { cwd: '/home/dev/install' }), ...call('cd', 'Bash', { command: 'cd vendor/ServiceNowDocs/markdown/csm' }, 'ok', { row: { cwd: '/home/dev/install' } }),
    ...call('s', 'Bash', { command: 'sed -n 1,60p c_Esc.md' }, '1\tThe sn\\_escalation table.', { row: { cwd: '/home/dev/install' } })]);
  assert.deepEqual([[...relative.reached.keys()], [...relative.pagesRead], relative.names.read.has('sn_escalation')], [[PAGE], [PAGE], true], 'a relative read after a cd is a page read, and its names are sourced');
});

test('ARC-09-C267 read-routes — turnSources: sub-agent rows are not the main thread\'s reads; readSubagentRows walks their files, one folder deep, within its limits', () => {
  const sub = [U('q', { isSidechain: true }), ...call('s', 'Read', { file_path: FILE }, '1\tbody', { row: { isSidechain: true } })].map((r) => (r.type === 'user' ? { ...r, isSidechain: true } : r));
  assert.equal(turnSources([U('q'), ...sub]).reached.size, 0, 'the main thread did not read it');
  const file = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const files = new Map([
    ['/s/ses.jsonl/', null],
    ['/s/ses/subagents/agent-a1.jsonl', file(sub)],
    ['/s/ses/subagents/agent-a2.jsonl', 'not json\n{"type":"user"'],
    ['/s/ses/subagents/agent-a1.meta.json', '{}'],
    ['/s/ses/subagents/workflows/wf_1/agent-w1.jsonl', file(sub)],
    ['/s/ses/subagents/workflows/wf_1/deeper/agent-too-deep.jsonl', file(sub)],
  ]);
  const dirs = new Set(['/s/ses/subagents', '/s/ses/subagents/workflows', '/s/ses/subagents/workflows/wf_1', '/s/ses/subagents/workflows/wf_1/deeper']);
  const fwd = (p) => p.replaceAll('\\', '/');                              // readSubagentRows joins with the platform's separator
  const seams = {
    list: (given) => {
      const dir = fwd(given);
      if (!dirs.has(dir)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      const prefix = `${dir}/`;
      return [...new Set([...files.keys(), ...dirs].filter((p) => p.startsWith(prefix) && p.length > prefix.length).map((p) => p.slice(prefix.length).split('/')[0]))];
    },
    stat: (given) => ({ size: (files.get(fwd(given)) ?? '').length, isDirectory: () => dirs.has(fwd(given)) }),
    read: (given) => files.get(fwd(given)),
  };
  const got = readSubagentRows('/s/ses.jsonl', seams);
  assert.equal(got.length, 2, 'the two files that parse: the session\'s agent and the workflow\'s, and not the one three folders down');
  assert.deepEqual(walkThread(got[0]).reached.size, 1, 'and what they read is a sub-agent\'s');
  assert.deepEqual(readSubagentRows('/s/none.jsonl', seams), [], 'no folder');
  assert.deepEqual(readSubagentRows('/s/ses.txt', seams), [], 'not a session file');
  assert.deepEqual(readSubagentRows(undefined, seams), []);
  const said = [];
  assert.deepEqual(readSubagentRows('/s/ses.jsonl', { ...seams, maxBytes: 10, onDebug: (m) => said.push(m) }), [], 'over the byte limit nothing is read, and it says so');
  assert.match(said.join(), /over the 10 limit/);
  assert.equal(readSubagentRows('/s/ses.jsonl', { ...seams, maxFiles: 1 }).length, 1, 'the file limit');
  assert.deepEqual(readSubagentRows('/s/ses.jsonl', { ...seams, read: () => { throw new Error('boom'); }, onDebug: (m) => said.push(m) }), [], 'a read that fails costs nothing');
  assert.match(said.join(), /unreadable: boom/);
});

// ---- the pointer rule -------------------------------------------------------------------------------------------------------------------
test('ARC-09-C267 read-routes — isPointer: "see also", "start with" and "read … first" before or around a citation, in its own sentence only', () => {
  const at = (line, citation = 'markdown/csm/c_Esc.md') => { const i = line.indexOf(citation); return isPointer(line, i, i + citation.length); };
  assert.equal(at('See also markdown/csm/c_Esc.md for the rest.'), true);
  assert.equal(at('Start with markdown/csm/c_Esc.md.'), true);
  assert.equal(at('You should start with the overview, markdown/csm/c_Esc.md.'), true);
  assert.equal(at('Read markdown/csm/c_Esc.md first.'), true);
  assert.equal(at('Read the page markdown/csm/c_Esc.md first, then the sibling.'), true);
  assert.equal(at('SEE ALSO: markdown/csm/c_Esc.md; markdown/csm/c_Other.md'), true, 'a ; does not end the sentence');
  assert.equal(at('See also markdown/csm/c_Esc.md; markdown/csm/c_Other.md', 'markdown/csm/c_Other.md'), true, 'the second page of the same sentence');
  assert.equal(at('The escalation rule is in markdown/csm/c_Esc.md.'), false, 'a claim');
  assert.equal(at('See also the glossary. The rule is in markdown/csm/c_Esc.md.'), false, 'the "see also" is another sentence');
  assert.equal(at('Read the glossary first. The rule is in markdown/csm/c_Esc.md.'), false, 'so is the "first"');
  assert.equal(at('The rule is in markdown/csm/c_Esc.md, as I read it first-hand.'), false, '"read" after, not before');
  assert.equal(at('I read markdown/csm/c_Esc.md and it was first rate.'), true, 'read before and first after, in one sentence: a pointer by the rule, as written');
  assert.equal(at('markdown/csm/c_Esc.md'), false);
});

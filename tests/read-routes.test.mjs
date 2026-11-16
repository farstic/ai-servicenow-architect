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
  cdOf, commandReads, joinPath, pageAt, pagesInLines, pagesOfGrep, pagesOfInput, shellSegments, shellWords, walkThread,
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

test('ARC-09-C267 read-routes — shellSegments: a here-document is text, not commands; it says whether its line writes a file', () => {
  const doc = (command, o) => shellSegments(command, o);
  const plain = doc("cat > notes.md <<'EOF'\ncat vendor/ServiceNowDocs/markdown/csm/c_Esc.md\nsee markdown/csm/c_Esc.md\nEOF\nls");
  assert.deepEqual(plain.segments.map((s) => s.words), [['cat', '>', 'notes.md'], ['ls']], 'the body is not parsed as commands');
  assert.deepEqual(plain.heredocs, [{ body: 'cat vendor/ServiceNowDocs/markdown/csm/c_Esc.md\nsee markdown/csm/c_Esc.md', writes: true }], '> makes it a written file');
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
  assert.deepEqual(here.heredocs, [{ body: 'Get-Content C:\\a\\c_Esc.md', writes: true }], 'a here-string is text, and Set-Content writes it');
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
    [`cat <${FILE}`, 'cat'], [`FOO=1 BAR=2 cat ${FILE}`, 'cat'], [`grep -n escalation ${FILE}`, 'grep'], [`egrep -n 'a|b' ${FILE}`, 'egrep'], [`rg -n escalation ${FILE}`, 'rg'],
    [`grep -i -e one -e two ${FILE}`, 'grep'], [`grep --regexp=one ${FILE}`, 'grep'], [`cat vendor/ServiceNowDocs/${PAGE}`, 'cat']]) {
    assert.deepEqual([...commandReads(command).reads], [[PAGE, verb]], command);
  }
  assert.deepEqual([...commandReads(`cat ${FILE} ${DOCS}/${OTHER}`).reads], [[PAGE, 'cat'], [OTHER, 'cat']], 'several files');
  assert.deepEqual(pagesOf(`head -3 ${FILE} | grep -n x`), [PAGE], 'at the head of a pipe; the grep has no file');
  assert.deepEqual(pagesOf(`echo start && cat ${FILE} ; echo end`), [PAGE]);
  assert.deepEqual(pagesOf(`x=$(sed -n 1p ${FILE})`), [PAGE], 'inside a substitution');
  assert.deepEqual([...commandReads(`Get-Content "C:\\i\\vendor\\ServiceNowDocs\\markdown\\csm\\c_Esc.md" -TotalCount 40`, { powershell: true }).reads], [[PAGE, 'get-content']]);
  assert.deepEqual([...commandReads(`gc ${FILE}; type ${DOCS}/${OTHER}`, { powershell: true }).reads], [[PAGE, 'gc'], [OTHER, 'type']]);
  assert.deepEqual([...commandReads(`Select-String -Path ${FILE} -Pattern x`, { powershell: true }).reads], [[PAGE, 'select-string']]);
  assert.deepEqual([...commandReads(`sls ${FILE} x`, { powershell: true }).reads].map(([p]) => p), [PAGE], 'sls');
});

test('ARC-09-C267 read-routes — commandReads: what is not a read — a listing, a count, names only, a write, text, another page, a folder, a glob, other tools', () => {
  for (const command of [`ls ${FOLDER}`, `ls -l ${FILE}`, `wc -l ${FILE}`, `stat ${FILE}`, `find ${FOLDER} -name '*.md'`, `file ${FILE}`, `test -f ${FILE}`, `du -h ${FILE}`,
    `grep -l escalation ${FILE}`, `grep -c escalation ${FILE}`, `grep -L escalation ${FILE}`, `grep -q escalation ${FILE}`, `grep -rl escalation ${FOLDER} ${FILE}`,
    `grep --files-with-matches x ${FILE}`, `grep --count x ${FILE}`, `rg --files ${FILE}`, `rg -c x ${FILE}`, `rg --count-matches x ${FILE}`, `rg -q x ${FILE}`,
    `grep -n ${FILE} notes.txt`, `grep -e ${FILE} notes.txt`, `echo ${FILE}`, `echo "cat ${FILE}"`, `printf '%s' ${FILE}`, `cp ${FILE} /tmp/x`, `rm ${FILE}`, `touch ${FILE}`,
    `cat ${FOLDER}`, `cat ${FOLDER}/`, `cat ${FOLDER}/*.md`, `cat ${FOLDER}/c_{Esc,Other}.md`, `cat ${DOCS}/README.md`, `cat /home/dev/notes/other.md`, `python3 -c "print(open('${FILE}').read())"`,
    `node -e "console.log(require('fs').readFileSync('${FILE}','utf8'))"`, `git show HEAD:vendor/ServiceNowDocs/${PAGE}`, `curl -s ${FILE}`, `cat`, '', '   ', 'true']) {
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
  assert.deepEqual(pagesOf(`python3 - <<'PY'\nprint(open('${FILE}').read())\nPY`), [], 'a script fed on stdin is not parsed');
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
    ...call('m1', 'mcp__srv__file_tool', { path: `${DOCS}/markdown/csm/c_Seventh.md` }, 'summary'),
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
  const seams = {
    list: (dir) => {
      if (!dirs.has(dir)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      const prefix = `${dir}/`;
      return [...new Set([...files.keys(), ...dirs].filter((p) => p.startsWith(prefix) && p.length > prefix.length).map((p) => p.slice(prefix.length).split('/')[0]))];
    },
    stat: (p) => ({ size: (files.get(p) ?? '').length, isDirectory: () => dirs.has(p) }),
    read: (p) => files.get(p),
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

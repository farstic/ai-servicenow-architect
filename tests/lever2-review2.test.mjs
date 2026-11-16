// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
/**
 * ARC-09-C267, lever 2 — the architect's SECOND review of #600 (2026-11-16, eight agents, every finding checked by a skeptic), on the pure modules. The hook-level
 * cases are tests/hook/stop-lever2-review2.test.mjs. Items are the architect's numbers:
 *   1, 2  a name filter other than \`find -name\` (find -iname/-ipath/-regex, rg -g/--glob/--iglob, grep --include, fd -g, Get-ChildItem -Filter/-Include) is taken
 *         as written, with its case, below its search root, and not joined to the shell's folder;
 *   3     a folder's file list fed to a viewer (rg -l DIR | xargs cat, find DIR -type f | xargs cat, a loop over $(ls DIR)) covers the folder;
 *   4     a file the turn wrote and then ran is a script, not a document that cites pages;
 *   5     a client file whose name is also a corpus page's name is not a citation of that page;
 *   7     a listing-only call (xargs grep -l, xargs wc -l, a loop that only echoes) shows no page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as routes from '../tools/snowarch/lib/docs/read-routes.mjs';
import { groundingFindings } from '../tools/snowarch/lib/docs/grounding-check.mjs';
import { A, U, res, use } from './helpers/lever2.mjs';

const { commandReads, shellSegments, walkThread } = routes;
const ROOT = '/home/dev/install/vendor/ServiceNowDocs/markdown';
const CSM = `${ROOT}/customer-service-management`;
const HERE = { cwd: '/home/dev/install', rowCwd: '/home/dev/install' };        // the shell is in the project folder, not in the corpus
const show = (p) => (p.dir !== undefined ? `dir:${p.dir}` : `${p.ci ? 'i' : 's'}:${p.w}`);
const pats = (command, opts = HERE) => commandReads(command, opts).patterns.map(show).sort();
const viewerOf = (command, opts = HERE) => commandReads(command, opts).viewer;

// ---- items 1 and 2: a name filter, as written, with its case ----------------------------------------------------------------------------------
test('ARC-09-C267 review 2, items 1 and 2 — a name filter is taken as written, with its case, whatever tool it belongs to, and is not joined to the shell\'s folder', () => {
  // find: -name and -path are case-sensitive, -iname and -ipath are not
  assert.deepEqual(pats(`find ${ROOT} -name 'cti-*' | xargs cat`), ['s:cti-*']);
  assert.deepEqual(pats(`find ${ROOT} -iname 'cti-*' | xargs cat`), ['i:cti-*']);
  assert.deepEqual(pats(`find ${ROOT} -ipath '*/csm/cti-*' -exec cat {} +`), ['i:*/csm/cti-*']);
  assert.deepEqual(pats(`find ${ROOT} -path '*/csm/cti-*' -exec cat {} +`), ['s:*/csm/cti-*']);
  // ripgrep: -g and --glob in four spellings, --iglob case-blind, a negated glob is no filter of what is read
  assert.deepEqual(pats(`rg -l -g 'c_Esc*.md' escal ${ROOT} | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`rg -l --glob='c_Esc*.md' escal ${ROOT} | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`rg -l --glob 'c_Esc*.md' escal ${ROOT} | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`rg --files -gc_Esc*.md ${ROOT} | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`rg --files --iglob 'C_ESC*.MD' ${ROOT} | xargs cat`), ['i:C_ESC*.MD']);
  assert.deepEqual(pats(`rg -l -g '!*.txt' escal ${ROOT} | xargs cat`), ['dir:markdown'], 'a negated glob narrows nothing: the folder is what is covered');
  // fd takes the glob as its pattern, and is case-blind unless the pattern has capitals (taken as blind: the side chosen)
  assert.deepEqual(pats(`fd -g 'c_Esc*.md' ${ROOT} | xargs cat`), ['i:c_Esc*.md']);
  assert.deepEqual(pats(`fd --glob 'c_Esc*.md' ${ROOT} | xargs cat`), ['i:c_Esc*.md']);
  // grep: --include in both spellings; --exclude is no filter of what is read
  assert.deepEqual(pats(`grep -rl --include='c_Esc*.md' escal ${ROOT} | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`grep -rl --include 'c_Esc*.md' escal ${ROOT} | head -5 | xargs cat`), ['s:c_Esc*.md']);
  assert.deepEqual(pats(`grep -rl --exclude='*.txt' escal ${ROOT} | xargs cat`), ['dir:markdown']);
  // PowerShell: -Filter and -Include, case-blind, a list of patterns, with the project's folder known
  const ps = { powershell: true, cwd: 'C:/home/dev/install', rowCwd: 'C:/home/dev/install' };
  assert.deepEqual(pats('Get-ChildItem -Path C:\\home\\dev\\install\\vendor\\ServiceNowDocs\\markdown -Recurse -Filter c_Esc*.md | Get-Content', ps), ['i:c_Esc*.md']);
  assert.deepEqual(pats('gci -Recurse -Include c_Esc*.md,t_Other*.md | Get-Content', ps), ['i:c_Esc*.md', 'i:t_Other*.md']);
  assert.deepEqual(pats('dir C:\\home\\dev\\install\\vendor\\ServiceNowDocs\\markdown -Filter *cti-demo* -Recurse | Get-Content', ps), ['i:*cti-demo*']);
});

test('ARC-09-C267 review 2, item 2 — a regex filter of find covers the folder it searches, or every page when no folder is known', () => {
  assert.deepEqual(pats(`find ${CSM} -iregex '.*cti-demo.*' | xargs head -80`), ['dir:markdown/customer-service-management']);
  assert.deepEqual(pats(`find ${CSM} -regex '.*CTI-demo.*\\.md' -exec cat {} +`), ['dir:markdown/customer-service-management']);
  assert.deepEqual(pats('find . -regex \'.*x.*\' | xargs cat'), ['s:*'], 'the shell stands in the project folder: no corpus folder is named');
  assert.deepEqual(pats('find . -iregex \'.*x.*\' | xargs cat', { cwd: CSM, rowCwd: '/home/dev/install' }), ['dir:markdown/customer-service-management'], 'the shell stands in the folder');
});

// ---- item 3: a folder's file list fed to a viewer ---------------------------------------------------------------------------------------------
test('ARC-09-C267 review 2, item 3 — in a call that cannot be resolved and has a content viewer, a word that names a folder under the corpus covers the folder', () => {
  const csm = ['dir:markdown/customer-service-management'];
  assert.deepEqual(pats(`rg -l escal ${CSM} | xargs cat`), csm);
  assert.deepEqual(pats(`find ${CSM} -type f | xargs cat`), csm);
  assert.deepEqual(pats(`ls ${CSM} | grep -i esc | xargs -I{} cat ${CSM}/{}`), csm);
  assert.deepEqual(pats(`for f in $(ls ${CSM}); do head -20 "${CSM}/$f"; done`), csm);
  assert.deepEqual(pats(`for f in a b; do cat "${CSM}/$f"; done`), csm, 'a viewer word with an expansion segment: its static prefix');
  assert.deepEqual(pats('rg -l escal . | xargs cat', { cwd: CSM, rowCwd: '/home/dev/install' }), csm, 'a relative word, from the folder the shell is in');
  assert.deepEqual(pats('rg -l escal ../hr-service-delivery | xargs cat', { cwd: CSM, rowCwd: '/home/dev/install' }), ['dir:markdown/hr-service-delivery']);
  assert.deepEqual(pats(`rg -l escal ${ROOT.replace('/markdown', '')} | xargs cat`), ['dir:markdown'], 'the corpus folder is the whole corpus');
  assert.deepEqual(pats(`rg -l escal ${ROOT.replace('/markdown', '')}/legal | xargs cat`), [], 'a folder of the corpus that is not markdown/');
  assert.deepEqual(pats('rg -l escal /home/dev/install/docs | xargs cat'), [], 'a folder that is not the corpus');
  assert.deepEqual(pats('rg -l escal markdown/customer-service-management | xargs cat', { lost: true, rowCwd: '/home/dev/install' }), [], 'a relative word when the folder is lost');
  // a name filter in the same command narrows what the folder covers
  assert.deepEqual(pats(`rg -l -g 'c_Esc*.md' escal ${CSM} | xargs cat`), ['s:c_Esc*.md']);
});

// ---- item 7: a call that only lists shows no page ---------------------------------------------------------------------------------------------
test('ARC-09-C267 review 2, item 7 — a listing-only call (xargs grep -l, xargs wc -l, a loop that only echoes) is no viewer and keeps no pattern; a content viewer does', () => {
  for (const command of [
    `find ${ROOT} -name '*.md' | xargs grep -l major_incident`,
    `find ${ROOT} -name '*.md' | xargs wc -l | sort -n | tail -3`,
    `for f in ${CSM}/*.md; do echo "$f"; done | wc -l`,
    `rg -l escal ${CSM} | xargs grep -c alpha`,
    `ls ${CSM} | xargs echo`,
    `find ${CSM} -type f | xargs ls -la`,
  ]) {
    assert.equal(viewerOf(command), false, `${command} is a listing`);
    assert.deepEqual(pats(command), [], `${command} shows no page`);
  }
  for (const command of [
    `find ${ROOT} -name '*.md' | xargs cat`,
    `find ${ROOT} -name '*.md' | xargs grep -n major_incident`,
    `find ${ROOT} -name '*.md' | xargs head -5`,
    `for f in ${CSM}/*.md; do head -3 "$f"; done`,
  ]) {
    assert.equal(viewerOf(command), true, `${command} shows lines`);
    assert.ok(pats(command).length > 0, `${command} covers pages`);
  }
  // a filter with no file operand, fed by a pipe, shows nothing of its own
  for (const command of ['ls | sort | tail -3', 'ls | head -5', 'ls | sed -n 1,5p', 'ls | awk \'NR<3\'', 'echo x | grep y']) {
    assert.equal(viewerOf(command), false, command);
  }
  // an interpreter can read without a verb: it keeps its patterns
  assert.ok(pats(`python3 -c "print(open(glob.glob('${CSM}/c_A*.md')[0]).read())"`).length > 0);
  assert.ok(pats(`bash -c "cat ${CSM}/c_A*.md"`).length > 0);
  assert.ok(pats(`eval "head ${CSM}/c_A*.md"`).length > 0);
});

// ---- item 4: a script the turn wrote and then ran ----------------------------------------------------------------------------------------------
const bashCall = (id, command) => [A([{ type: 'tool_use', id, name: 'Bash', input: { command } }], { cwd: '/home/dev/install' }), res(id, 'ok')];
const writeCall = (id, file, content) => [A([{ type: 'tool_use', id, name: 'Write', input: { file_path: file, content } }], { cwd: '/home/dev/install' }), res(id, 'ok')];
const readCall = (id, file) => [A([{ type: 'tool_use', id, name: 'Read', input: { file_path: file } }], { cwd: '/home/dev/install' }), res(id, '1\tx')];
const editCall = (id, file) => [A([{ type: 'tool_use', id, name: 'Edit', input: { file_path: file, old_string: 'a', new_string: 'b' } }], { cwd: '/home/dev/install' }), res(id, 'ok')];
const rowsOf = (...parts) => [U('how?'), ...parts.flat()];

test('ARC-09-C267 review 2, item 4 — a heredoc that writes a file names its target', () => {
  const target = (command) => shellSegments(command).heredocs[0].file;
  assert.equal(target("cat > /tmp/r.sh <<'EOF'\necho hi\nEOF"), '/tmp/r.sh');
  assert.equal(target('cat >> /tmp/a.py <<EOF\nx\nEOF'), '/tmp/a.py');
  assert.equal(target("tee /tmp/b.sh <<'EOF'\nx\nEOF"), '/tmp/b.sh');
  assert.equal(target("tee -a /tmp/b.sh <<'EOF'\nx\nEOF"), '/tmp/b.sh');
  assert.equal(target("cat <<'EOF' > /tmp/c.sh\nx\nEOF"), '/tmp/c.sh');
  assert.equal(target("cat > r.sh <<'EOF'\nx\nEOF"), 'r.sh');
  assert.equal(target("python3 - <<'PY'\nprint(1)\nPY"), null, 'a heredoc that feeds an interpreter writes no file');
});

test('ARC-09-C267 review 2, item 4 — a file written and then run (an interpreter or shell given its path, ./file, source) is a script; one that is not run, or only shown, is not', () => {
  const scriptOf = (parts) => walkThread(rowsOf(...parts), {}).writes.map((w) => [w.file, w.script]);
  const w = writeCall('w', '/tmp/readpages.py', 'print(1)');
  assert.deepEqual(scriptOf([w, bashCall('b', 'python3 /tmp/readpages.py')]), [['/tmp/readpages.py', true]]);
  assert.deepEqual(scriptOf([w, bashCall('b', 'python3 -u /tmp/readpages.py --all')]), [['/tmp/readpages.py', true]]);
  assert.deepEqual(scriptOf([w, bashCall('b', 'cd /tmp && python3 readpages.py')]), [['/tmp/readpages.py', true]], 'by its base name from another folder');
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/r.sh', 'ls'), bashCall('b', 'bash /tmp/r.sh')]), [['/tmp/r.sh', true]]);
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/r.sh', 'ls'), bashCall('b', 'sh /tmp/r.sh')]), [['/tmp/r.sh', true]]);
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/r.sh', 'ls'), bashCall('b', '/tmp/r.sh')]), [['/tmp/r.sh', true]]);
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/r.sh', 'ls'), bashCall('b', 'source /tmp/r.sh')]), [['/tmp/r.sh', true]]);
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/x.js', 'x'), bashCall('b', 'node /tmp/x.js')]), [['/tmp/x.js', true]]);
  assert.deepEqual(scriptOf([writeCall('w', '/tmp/x.ps1', 'x'), bashCall('b', 'pwsh -File /tmp/x.ps1')]), [['/tmp/x.ps1', true]]);
  assert.deepEqual(scriptOf([bashCall('b', "cat > /tmp/r.sh <<'EOF'\nls\nEOF"), bashCall('c', 'bash /tmp/r.sh')]), [['/tmp/r.sh', true]], 'a heredoc writer');
  assert.deepEqual(scriptOf([bashCall('b', "cat > /tmp/r.sh <<'EOF'\nls\nEOF\nbash /tmp/r.sh")]), [['/tmp/r.sh', true]], 'written and run in one call');
  // not scripts
  assert.deepEqual(scriptOf([w]), [['/tmp/readpages.py', false]], 'never run');
  assert.deepEqual(scriptOf([w, bashCall('b', 'cat /tmp/readpages.py')]), [['/tmp/readpages.py', false]], 'only shown');
  assert.deepEqual(scriptOf([bashCall('b', 'python3 /tmp/readpages.py'), w]), [['/tmp/readpages.py', false]], 'run before it was written');
  assert.deepEqual(scriptOf([writeCall('w', '/c/acme/envelopes/e1.md', 'x'), bashCall('b', 'cat /c/acme/envelopes/e1.md')]), [['/c/acme/envelopes/e1.md', false]], 'a document read back');
  assert.deepEqual(scriptOf([writeCall('w', '/c/acme/e1.md', 'x'), bashCall('b', 'python3 /tmp/other.py')]), [['/c/acme/e1.md', false]]);
});

test('ARC-09-C267 review 2, item 4 — turnSources carries the file and the script flag of what the turn wrote', async () => {
  const { turnSources } = await import('../tools/snowarch/lib/docs/turn-sources.mjs');
  const turn = turnSources(rowsOf(writeCall('w', '/tmp/readpages.py', 'x = "c_Alpha.md"'), bashCall('b', 'python3 /tmp/readpages.py'), writeCall('v', '/c/acme/e1.md', 'doc')), {});
  assert.deepEqual(turn.written.map((x) => [x.file, x.script]), [['/tmp/readpages.py', true], ['/c/acme/e1.md', false]]);
});

// ---- item 5: a client file whose name is also a corpus page's -----------------------------------------------------------------------------------
test('ARC-09-C267 review 2, item 5 — the base names of the files the session read, wrote or edited outside the corpus are its own', () => {
  const corpusPage = '/home/dev/install/vendor/ServiceNowDocs/markdown/it-service-management/c_Alpha.md';
  const w = walkThread(rowsOf(readCall('r1', '/home/dev/install/clients/acme/Incident.md'), editCall('e1', '/home/dev/install/clients/acme/Incident.md'),
    writeCall('w1', '/home/dev/install/clients/acme/change.md', 'x'), readCall('r2', corpusPage), bashCall('b', "cat > /home/dev/install/clients/acme/overview.md <<'EOF'\nx\nEOF")), {});
  assert.deepEqual([...w.ownFiles].sort(), ['change.md', 'incident.md', 'overview.md'], 'lower case, and not a corpus page');
});

const BETA = 'markdown/it-service-management/c_Beta.md';
const INCIDENT = 'markdown/it-service-management/incident.md';
const named = (name) => ({ 'incident.md': [INCIDENT], 'change.md': ['markdown/it-service-management/change.md'], 'overview.md': ['markdown/a/overview.md', 'markdown/b/overview.md'], 'c_Beta.md': [BETA] }[name] ?? []);
const find = (rows, reply, options = {}) => groundingFindings({ rows, reply, options: { blocking: ['citedUnread'], pagesNamed: named, ...options } });

test('ARC-09-C267 review 2, item 5 — a bare name of a file the session read or wrote outside the corpus, or that the answer gives a path to, is no citation of a corpus page', () => {
  const touched = rowsOf(readCall('r1', '/home/dev/install/clients/acme/incident.md'), writeCall('w1', '/home/dev/install/clients/acme/change.md', 'x'),
    writeCall('w2', '/home/dev/install/clients/acme/overview.md', 'x'));
  assert.deepEqual(find(touched, 'Updated `incident.md` with the RACI and started `change.md` for the CAB notes.').items, []);
  assert.deepEqual(find(touched, 'Drafted overview.md in the engagement folder.').items, []);
  // a path in the same answer
  assert.deepEqual(find(rowsOf(), 'The RACI is in clients/acme/incident.md; incident.md lists the approvers.').items, [], 'the answer gives the name a path outside the corpus');
  // the controls: a name nothing outside the corpus owns is still a citation, and so is one beside a corpus path
  assert.deepEqual(find(rowsOf(), 'See `incident.md` for the process.').items.map((i) => i.path), ['incident.md']);
  assert.deepEqual(find(touched, 'The rule is in c_Beta.md.').items.map((i) => i.path), ['c_Beta.md']);
  assert.deepEqual(find(rowsOf(), `The rule is in ${INCIDENT} and in clients/acme/incident.md.`).items.map((i) => i.path), [INCIDENT], 'a corpus path is still a citation');
});

test('ARC-09-C267 review 2, item 4 — what a script the turn ran cites is not asked about, and a document the turn wrote is', () => {
  const script = 'for name in ["c_Beta.md", "account-address-table.md"]: print(open(base + name).read())';
  const ran = rowsOf(writeCall('w', '/tmp/readpages.py', script), bashCall('b', 'python3 /tmp/readpages.py'));
  assert.deepEqual(find(ran, 'Both pages agree: addresses are stored per account.').items, []);
  const never = rowsOf(writeCall('w', '/tmp/readpages.py', script));
  assert.deepEqual(find(never, 'Saved.').items.map((i) => i.path), ['c_Beta.md'], 'a script that was not run is a file the turn wrote like any other');
  const doc = rowsOf(writeCall('w', '/home/dev/install/clients/acme/envelopes/e1.md', `The SLA rule is in ${BETA}.\n`), bashCall('b', 'cat /home/dev/install/clients/acme/envelopes/e1.md'));
  assert.deepEqual(find(doc, 'Saved.').items.map((i) => i.path), [BETA], 'a document read back is still a document');
  const withPaths = rowsOf(writeCall('w', '/tmp/r.py', `open("${BETA}")\n`), bashCall('b', 'python3 /tmp/r.py'));
  assert.deepEqual(find(withPaths, 'Done.').items, [], 'a full path in a script that ran');
});

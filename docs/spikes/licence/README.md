# ARC-00-S02 record — licence and relicensing statement (D-02)

**Status: DONE (2026-09-07).** All six acceptance criteria are MET; AC 3 and AC 6 are PARTIAL because
they need owner lines that have not arrived, and AC 1 needs an architect ruling on which published
rendering of the Apache-2.0 text the criterion means (§1). Nothing has been filled in on the owner's
behalf.

Produced 2026-09-06 · `AI-Architect-Claude` HEAD `21bdf69` · `snow-mcp` HEAD `bb09bde` · both
read-only throughout.

| File | What it is |
|---|---|
| `LICENSE` | The canonical Apache License 2.0 text, unmodified. Provenance in §1. |
| `NOTICE` | The agreed attribution text, byte-identical to the story's design-note block. |
| `RELICENSING.md` | The commit-message sentence, both `git shortlog`s, and the second-contributor Resolution section with (a)/(b) both `PENDING OWNER`. |
| `header-sweep.txt` | Every pre-Apache licence assertion in both source trees, one action per line, cross-checked against ARC-01's deletion scope. |

---

## 1. Provenance of `LICENSE` (AC 1)

| Field | Value |
|---|---|
| Source URL | `https://www.apache.org/licenses/LICENSE-2.0.txt` |
| Retrieved | 2026-09-06 |
| Size | 11,358 bytes · 202 lines |
| sha256 | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| Verification | `diff spikes/licence/LICENSE <downloaded copy>` → no output |

**Which "canonical" text, and why.** Three published plain-text renderings of Apache-2.0 exist and
they are not byte-identical:

| Source | Bytes | Lines | sha256 | Formatting |
|---|---|---|---|---|
| `apache.org/licenses/LICENSE-2.0.txt` **(chosen)** | 11,358 | 202 | `cfc7749b…523d30` | ASF original — indented, hard-wrapped |
| `spdx.org/licenses/Apache-2.0.txt` | 10,279 | 72 | `c274f803…88366c` | reflowed, one line per paragraph, no trailing newline |
| `spdx/license-list-data` `text/Apache-2.0.txt` | 10,280 | 73 | `074e6e32…4615ff` | reflowed, one line per paragraph |

**All three carry the full appendix and are word-for-word the same licence.** Measured, not assumed:
each contains exactly one `APPENDIX: How to apply the Apache License to your work.`; reduced to a
whitespace-normalised word stream, the chosen text and `spdx/license-list-data` are identical at
1,581 words with an empty `diff`, and `spdx.org` differs only by having no newline at end of file.
They differ in line wrapping and indentation and in nothing else.

The story's design note says "the unmodified Apache License 2.0 text (the SPDX canonical text). **No
appendix boilerplate edits.**" Since every rendering carries the appendix unedited, that phrase does
not discriminate between them. The ASF rendering was chosen because it is the ASF's own published
formatting, is what a GitHub licence-detector matches as `Apache-2.0`, and is what virtually every
Apache-2.0 `LICENSE` file in the wild contains; SPDX's role here is the *identifier* `Apache-2.0`,
which is what `package.json` carries (ARC-01).

**This needs an architect ruling, and it is a deviation rather than a reading.** AC 1 says
"byte-identical to the **SPDX** Apache-2.0 text". On its literal wording the delivered file does not
satisfy it: it is byte-identical to the ASF rendering and to neither SPDX one. Either ratify the ASF
rendering (and amend AC 1's wording) or say the word — swapping in an SPDX rendering is a one-file
change and the record's hashes are already here. The earlier version of this section claimed the
SPDX texts had no appendix; that was false and is corrected above.

Neither `LICENSE` nor `NOTICE` matches any of the five patterns in ARC-01's own sweep criterion, so
ARC-01 needs no allow-list entry for either.

---

## 2. `NOTICE` (AC 2)

Byte-identical to the block in the ARC-00-S02 design notes — verified by extracting that block from
`STORIES.md` on `origin/arc-00/spikes` and running `diff`, which produced no output. All required
elements present: the ServiceNowDocs Apache-2.0 attribution with its repository URL and submodule
path, the ServiceNow trademark and non-affiliation disclaimer, and both predecessor projects with
the 2026-09-04 relicensing date.

---

## 3. `header-sweep.txt` (AC 4)

The story's grep found three files. Four more items had to be added and one corrected, and none of
them is a judgement call — each is something the story's command provably cannot see:

- **`snow-mcp/LICENSE` is invisible to the grep.** The command filters
  `--include=*.md --include=*.ts --include=*.mjs --include=*.yaml --include=*.json`, and the file has
  no extension. The story's own design note names it as one of the four known hits, so the command
  and its stated expected result contradict each other.
- **`snow-mcp/README.md:83-85`** — a `## License` section reading "See [LICENSE](./LICENSE). © 2026
  Cvetomir Grigorov." It contains none of the five patterns because it points at the offending file
  instead of restating it, yet **ARC-01-S08's own scope names it explicitly**. It was missing from
  the first version of this sweep.
- **`snow-mcp/docs/index.html:279-280`** — a published MIT badge (`<div>MIT</div>` above
  `<div>License</div>`) on the project's docs landing page. No `--include=*.html`, and the text is
  not `license: MIT`. The file is deleted by ARC-01-S03, so the action is "none", but it is recorded
  so the claim is visibly dismissed rather than missed.
- **`SEE LICENSE IN LICENSE` occurs four times, not once** — `package.json:97`,
  `package-lock.json:10`, `desktop/package.json:10`, `desktop/package-lock.json:10`, all in
  snow-mcp. ARC-01's criterion greps for this fifth pattern; only the first needs a re-value, the
  rest go with deletions, and the lockfile deletion is therefore load-bearing.
- **The engine hit is the section `docs/README.md:157-159`, not just line 159** — 157 is the
  `## License` heading, and ARC-01-S08's scope names the whole range.

Exclusions and their suppressed counts are printed in the sweep's §1 — 57 files in the engine's
`ServiceNowDocs` submodule (third-party corpus, ARC-03's) and 119 in `snow-mcp/node_modules`
(dependency licences, never imported). `desktop/` is excluded from pass 1 but its two hits are
listed anyway.

Cross-check against ARC-01-S03's leaf-level D-03 cut: six of the ten items are deleted there and
need no edit (`smithery.yaml`, `TERMS.md`, `docs/index.html`, `server.json`, `package-lock.json`,
`desktop/**`); three need an explicit edit (`engine docs/README.md:157-159`, `snow-mcp/LICENSE`,
`snow-mcp/README.md:83-85`); one is a metadata re-value (`snow-mcp/package.json:97`).

**Story ownership was wrong in the first version and is corrected.** ARC-01-S02 imports the
*engine*; the *server* import, leaf cut and package rename are **ARC-01-S03**, and the licence edits
are **ARC-01-S08**. The first version routed every server-side action to ARC-01-S02, and asserted
"the server copy is not imported" — false: `LICENSE` is not on S03's `git rm -r` list, so
`packages/snowarch/LICENSE` does arrive in the tree carrying "All rights reserved", and ARC-01-S08's
criterion 2 (`cmp LICENSE packages/snowarch/LICENSE` exits 0) is what removes it.

---

## 4. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `LICENSE` byte-identical to the **SPDX** Apache-2.0 text (`diff` against a downloaded copy shows nothing) | **PARTIAL — architect ruling required.** Byte-identical to the ASF canonical rendering (sha256 `cfc7749b…523d30`; `diff` against the downloaded copy empty) and word-for-word identical to both SPDX renderings, but byte-identical to neither of them. §1 |
| 2 | `NOTICE` names ServiceNowDocs + Apache-2.0 attribution, the trademark disclaimer, and both predecessors with the relicensing date | **MET** — §2; verbatim `diff` against the story |
| 3 | `RELICENSING.md` contains the exact commit-message sentence **and a dated owner confirmation** | **MET (2026-09-07)** — the sentence is present as amended, and the owner's confirmation is quoted verbatim with its date, channel and the commit that carries it (`695167a`, authored by the owner in the plans repository). Provenance is stated exactly: it was relayed through the architect session, not received in the session that wrote the file, and the commit was verified independently first. |
| 4 | `header-sweep.txt` lists every hit with an action per line; at minimum the four known locations appear | **MET** — all four appear, plus three more the story's command cannot reach and three further `SEE LICENSE IN LICENSE` occurrences |
| 5 | Nothing under `~/work/AI-Architect-Claude` or `~/work/snow-mcp` changed | **MET** — §5 |
| 6 | `RELICENSING.md` quotes both `git shortlog -sn HEAD` outputs and records resolution (a) or (b) for the engine's second contributor | **MET (2026-09-07)** — both shortlogs are quoted, the full `5b40835` file list is recorded, and **resolution (a) is closed**: the contributor's own words (`"yes, agreed"`, MS Teams, 2026-09-07, `3611587`) are quoted with their channel and date. Resolution (b) is withdrawn; ARC-01-S02 may import those 138 files. |

**Both AC 3 and AC 6 closed on 2026-09-07.** Neither could be completed by the delivery team by
definition — one needed the owner's written confirmation, the other his decision plus a third party's
reply — and both arrived through the owner via the architect session. **No one was contacted by the
delivery team at any point**; outreach was the owner's throughout. Each is recorded verbatim with the
commit in the plans repository that carries it, and each commit was verified to exist and to be authored
by the owner's own git identity before anything was written here.

---

## 5. Both source repositories are unchanged (AC 5)

```
$ git -C ~/work/AI-Architect-Claude log --oneline -1
21bdf69 docs: field-notes §15 — sys_script_fix.name silently truncates at 40 chars over REST
$ git -C ~/work/AI-Architect-Claude status --short | wc -l
13        # identical to the ARC-00-S01 baseline; all pre-existing, including the ServiceNowDocs
          # submodule modification the criterion tells us to ignore

$ git -C ~/work/snow-mcp log --oneline -1
bb09bde chore(desktop): remove UI redesign brief (cleanup)
$ git -C ~/work/snow-mcp status --short | wc -l
1         # pre-existing
```

Every command run against either tree in this story was a read: `grep`, `git grep`, `git log`,
`git show`, `git shortlog`, `git ls-files`, `head`, `sed -n`.

---

## 6. Findings handed back to the architect

1. **The story's relicensing sentence asserts "sole author", which the story's own design note
   disproves for the engine.** Amended wording agreed with the architect 2026-09-06 and recorded in
   `RELICENSING.md` §1 with the reason.
2. **`5b40835` is far larger than the design note describes** — 138 files changed, 10,424
   insertions, 83 added and 55 modified, including `CLAUDE.md`, `README.md`, `governance-rules.md`,
   `taxonomy.md`, `prompt-patterns.md`, `VALIDATION-TESTS.md`, `.githooks/pre-commit`, seven
   `scripts/`, four `reference/templates/` and sixteen complete skills. The story's risk note
   ("resolution (b) costs nothing extra because ARC-02 rewrites those skills anyway") holds for the
   skills only. This materially changes the (a)/(b) trade and should reach the owner with the
   decision.
3. **The commit is a squash-merge of pull request #1** (single parent `6f11dfa`, committer GitHub),
   so the individual commits are not in this history and git attributes all 10,424 inserted lines to
   the PR author. Git authorship records who opened the pull request, not who wrote each line — the
   (a)/(b) decision needs the owner's knowledge of the collaboration, not just the file list.
4. **The story's sweep grep is not sufficient for its own stated expected result.** It cannot see
   `snow-mcp/LICENSE` (extensionless vs the `--include` filter) although the story names it as a
   known hit; it cannot see `snow-mcp/README.md:83-85` (no matched phrase) although ARC-01-S08's
   scope names it; and it cannot see the MIT badge in `snow-mcp/docs/index.html:279-280` (no
   `*.html`, and the value is split across HTML elements). Three further passes were needed — §3.
5. **ARC-01's sweep criterion carries a fifth pattern** (`SEE LICENSE IN LICENSE`) that the S02 grep
   does not, and it occurs **four** times in snow-mcp, not once. Three of the four disappear with
   ARC-01-S03's deletions, which makes the deletion of `packages/snowarch/package-lock.json`
   load-bearing for ARC-01-S08's criterion 1 rather than incidental — §3.
6. **AC 1 names "the SPDX Apache-2.0 text"** but no rendering is uniquely canonical: the ASF text,
   `spdx.org` and `spdx/license-list-data` are word-for-word identical and all carry the appendix,
   differing only in wrapping. The delivered file is the ASF rendering. Needs a ruling — §1.

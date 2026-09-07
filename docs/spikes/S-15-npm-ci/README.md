> **Redaction rules (ARC-00 STORIES.md conventions).** No instance URLs, usernames, passwords, tokens or
> `~/.claude.json` contents appear in a spike record — **key names only, values as `set (len n)`**.
> Paths are `~`-relative. Screenshots are cropped to the dialog.
> A spike that runs on several operating systems carries **one *Observed* block per OS and one verdict line**.

# S-15 — Root `npm ci` footprint and module resolution

**Run by:** ARC-00-S08 · **Verdict consumed by:** ARC-01-S05 / ARC-06-S07 (`npm ci` footprint)

**Status: CONFIRMED on nine CI cells, macOS and the Ubuntu VM. Only the Windows VM sample is outstanding.**

## Assumption

> `npm ci --omit=dev --ignore-scripts` at the monorepo root installs only the server's runtime dependencies (~72 MB) and nothing for `tools/snowarch`; no hoisting surprise breaks `dist/server.js` module resolution

**Impact if false:** M · **Evidence so far (from `03`):** Server production tree measured at 72 MB / 155 packages with no install scripts

## Environment

| Field | Value |
|---|---|
| macOS | **26.5.2** build **25F84**, arm64 — Node v24.16.0, npm 11.13.0, git 2.39.5 |
| GitHub runners | `ubuntu-22.04`, `macos-latest`, `windows-latest` × Node 20 / 22 / 24 — nine cells, workflow `.github/workflows/spike-matrix.yml`, run `34046168899` on `8071d00`, **9/9 green** |
| Ubuntu VM | **taken 2026-09-07** on the logged-in `clean` snapshot — the "slow laptop" sample; see the Observed section |
| Windows VM | `DEFERRED — Windows VM pending (owner input #2)` — the `windows-latest` runner covers the OS but not the "slow laptop" sample |
| Fixture source | `~/work/snow-mcp` at HEAD **`bb09bde`**, working tree, **read-only** |
| Date | 2026-09-06 |

**Fixture provenance, stated precisely.** `packages/snowarch/dist/` is copied byte-identical from
`snow-mcp/dist` (429 files, 4.2 MB, `diff -rq` clean). **`dist/` is not tracked in `snow-mcp`** —
`git ls-files dist` returns nothing — so the fixture copies an *untracked build output* of the working
tree at `bb09bde`, which is the same provenance gap `00` records for the published npm tarball. The
package manifest is `snow-mcp/package.json` with **only** `name` → `@farstic/snowarch`, `version` →
`2.0.0` and `bin` → `{ "snowarch": "dist/cli/index.js" }` changed; the 9 runtime dependencies and all 8
devDependencies are kept, so `--omit=dev` is meaningful. Nothing in `~/work/snow-mcp` was modified.

## Procedure

**Check that retires it (from `03`):** Run it on a clean checkout on all three OSes; run the MCP handshake.

```sh
cd spikes/S-15-npm-ci/fixture
rm -rf node_modules
npm ci --omit=dev --ignore-scripts                 # timed
du -sh node_modules ; ls node_modules | wc -l
test ! -d tools/snowarch/node_modules              # must pass
test ! -d packages/snowarch/node_modules || ls packages/snowarch/node_modules
node ../../S-06-cold-start/handshake.mjs packages/snowarch/dist/server.js
```

The lockfile was generated once on macOS with `npm install --package-lock-only` and committed
(`lockfileVersion` 3, 385 entries, both workspaces linked).

## Observed

### The nine CI cells (run `34046168899`, all green)

| Runner | Node | npm | `npm ci` wall | content size | packages | `ls \| wc -l` | `tools/snowarch/node_modules` | `packages/snowarch/node_modules` |
|---|---|---|---|---|---|---|---|---|
| ubuntu-22.04 | 20.20.2 | 10.8.2 | 2 781 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| ubuntu-22.04 | 22.23.2 | 10.9.8 | 3 727 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| ubuntu-22.04 | 24.20.0 | 11.19.0 | 4 596 ms | 57.3 MB | **171** | 156 | absent (PASS) | absent (fully hoisted) |
| macos-latest | 20.20.2 | 10.8.2 | 4 754 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| macos-latest | 22.23.2 | 10.9.8 | 2 424 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| macos-latest | 24.18.0 | 11.16.0 | 3 670 ms | 57.3 MB | **171** | 156 | absent (PASS) | absent (fully hoisted) |
| windows-latest | 20.20.2 | 10.8.2 | 10 015 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| windows-latest | 22.23.2 | 10.9.8 | 12 399 ms | 57.3 MB | **171** | 167 | absent (PASS) | absent (fully hoisted) |
| windows-latest | 24.19.0 | 11.17.0 | 11 051 ms | 57.3 MB | **171** | 156 | absent (PASS) | absent (fully hoisted) |

### Ubuntu VM `arc00-ubuntu` — the "slow laptop" sample the story asks for (2026-09-07)

Node v22.23.2, npm 10.9.8, git 2.34.1, on the logged-in `clean` snapshot:

```
npm ci --omit=dev --ignore-scripts   : 5 038 ms
du -sh node_modules                  : 76M   (77 280 KB)
content (the CI metric)              : 57.3 MB
packages                             : 171
ls node_modules | wc -l              : 167          (npm 10.x — consistent with point 2 below)
tools/snowarch/node_modules          : absent (PASS)
packages/snowarch/node_modules       : absent
```

**Content size and package count are identical to every CI cell and to macOS — 57.3 MB and 171** — while
`du` reads **76M** here against **72M** on macOS. Same tree, different filesystem block accounting, which
is the sharpest illustration yet of point 1 below: a footprint gate has to name its metric.

### macOS, local (the owner's machine)

```
npm ci --omit=dev --ignore-scripts
  cold cache (isolated cache dir): 3 512 ms
  warm cache (same dir, reinstall): 1 034 ms
du -sh node_modules            :  72M          (disk usage)
du -sk node_modules            : 73 612 KB
installed packages             : 171           (149 unscoped + 22 scoped; .bin and the 2 workspace symlinks excluded)
ls node_modules | wc -l        : 156           (149 visible unscoped dirs + 7 scope dirs; .bin hidden)
tools/snowarch/node_modules    : absent (PASS)
packages/snowarch/node_modules : absent — fully hoisted
```

### Three things the numbers say that the assumption's wording does not

0. **"Fully hoisted" is not literally true, and the record should not have said it.** The check the story
   specifies — `test ! -d packages/snowarch/node_modules` — passes on every cell, and that is what the
   table's last column reports. But the tree does contain **7 nested `node_modules`** where npm resolved a
   version conflict: `body-parser`, `brotli`, `negotiator`, `pptxgenjs`, `type-is`, `unicode-properties`,
   `unicode-trie`. That is ordinary npm behaviour, it breaks nothing (the real `dist/server.js` resolves
   its modules and completes a handshake from this tree on all nine cells), and none of them is under the
   workspace package — but "no per-package `node_modules` anywhere" would be false, so the verdict says
   what was actually checked instead.
1. **57.3 MB and 72 MB are both right; they measure different things.** 57.3 MB is the sum of file
   *content* (what CI computes); 72 MB is `du`, i.e. *disk usage* with 4 KB block rounding across 171
   packages of mostly small files. `03`'s "~72 MB" is a `du` figure. **ARC-01's "≤ 80 MB" footprint gate
   should say which metric it means** — the same tree passes at 57.3 and at 72, but a gate written
   against one and measured with the other is a trap.
2. **The package count is 171, not 155, and `ls | wc -l` is npm-version-dependent.** Every cell installs
   the same **171** packages, but `ls node_modules | wc -l` prints **167 on npm 10.x and 156 on npm 11.x**
   — the metric `03` quotes as "155" is the version-dependent one. The count of real package directories
   is stable across three OSes and **two** npm majors (10.x and 11.x, which is what the matrix exercises);
   the `ls` count is not.
3. **"No install scripts" holds for the production tree, and `--ignore-scripts` is belt-and-braces.** The
   *lockfile* has two packages that declare one — `esbuild` and `fsevents` — but both are dev-only and
   `--omit=dev` excludes them. Walking every installed `package.json` in the production tree finds no
   `preinstall` / `install` / `postinstall` anywhere.

**The D-03 cut, measured by actually cutting — and it is twice what the plan records.** The two package
directories are `pdfmake` 15 260 KB and `pptxgenjs` 5 112 KB, i.e. 20 372 KB, which is the figure
`02` D-03 quotes as "~20 MB of the 72 MB". **That figure counts only the two directories and understates
the cut by about a factor of two.** Removing them from `packages/snowarch` `dependencies`, regenerating
the lockfile and re-running `npm ci --omit=dev --ignore-scripts` orphans **34 further top-level entries**
— 36 disappear from `ls node_modules` altogether: `@noble` `@swc` `base64-js` `brotli` `browserify-zlib`
`clone` `core-util-is` `dfa` `fontkit` `https` `image-size` `immediate` `isarray` `js-md5` `jszip` `lie`
`linebreak` `pako` `pdfkit` `pdfmake` `png-js` `pptxgenjs` `process-nextick-args` `queue`
`readable-stream` `restructure` `safe-buffer` `sax` `setimmediate` `string_decoder` `tiny-inflate`
`tslib` `unicode-properties` `unicode-trie` `util-deprecate` `xmldoc`.

| metric | pre-cut | post-cut | saving |
|---|---|---|---|
| `du -sk` | 73 612 KB (72M) | **28 080 KB (27M)** | 45 532 KB (≈ 44.5 MB) |
| content (the CI metric) | 57.3 MB | **17.2 MB** | 40.1 MB |
| packages | 171 | **134** | 37 |
| `ls \| wc -l` | 156 | **120** | 36 |

So the number ARC-04-S01 should plan against, and the one S14 hands to `docs/INSTALL.md`, is
**≈ 27 MB (`du`) / ≈ 17 MB (content)**. An earlier version of this record said "≈ 52 MB / ≈ 37 MB" and
claimed the two-directory arithmetic "matches `02` D-03 exactly" — that agreement was circular (D-03's
~20 MB *is* the two-directory number) and the projection was wrong by about half. **`02` D-03 item (4)
and `03` S-15 should be corrected: the cut is worth ~45 MB of the 72 MB `du` (~40 MB of the 57.3 MB
content), not ~20 MB — which makes D-03 roughly twice as attractive as recorded.**

## Verdict

`S-15: CONFIRMED — 57.3 MB content / 171 packages on ubuntu-22.04, macos-latest and windows-latest × Node 20/22/24 (72 MB du, measured on macOS only — du was not run on the runners); nothing under tools/snowarch; no packages/snowarch/node_modules on any cell; handshake ok (394 tools)`

`npm ci --omit=dev --ignore-scripts` at the workspace root behaves identically on three operating
systems and two npm majors (10.x and 11.x): one root `node_modules`, nothing installed for `tools/snowarch`, no
`packages/snowarch/node_modules` (7 unrelated packages are nested for version conflicts — see point 0),
and the real `dist/server.js` resolves its modules and completes an MCP handshake from that tree. The `--workspace packages/snowarch` fallback in `03` is **not needed and
not adopted**. Two caveats travel with the verdict: the size figure depends on which metric is used
(see above), and the two VM samples — the ones that represent a consultant's laptop rather than a CI
runner — have not been taken.

## Evidence

- `spikes/S-15-npm-ci/fixture/` — the fixture and its committed lockfile.
- `.github/workflows/spike-matrix.yml`, run `34046168899` on `8071d00` — the nine cells.
- `spikes/S-06-cold-start/handshake.mjs` — the module-resolution proof.

<!-- ONE SOURCE. This fragment is the terminal hand-off, and it exists in exactly two places:
     here, and inside `.claude/skills/snowarch/SKILL.md` (indented three spaces, inside its numbered
     list). `tests/terminal-handoff.test.mjs` asserts they are the same text — the credential
     procedure is the one thing in this repository that must never have two versions, because a
     user following a stale copy types a password somewhere it was not meant to go.
     `docs/INSTALL.md` includes this file through `scripts/gen-readme.mjs`; ARC-07-S09 keeps the
     skill in step when it extends the skill body.

     THE COMMAND LINE IS THE TEMPLATE, and `scripts/handoff-command.mjs` renders it from these very
     bytes — the skill fills the placeholders from the three questions it asked, and what a user
     types by hand is therefore the same command the skill prints. Every placeholder is
     `<angle-bracketed>` so the renderer can find it and so a reader who never runs the skill can
     still see what to substitute. `--default` is the only optional part; the renderer drops it. -->

```
Next step happens in YOUR terminal (credentials never pass through this chat).
1. Open a terminal at this checkout: <absolute path>
2. Run:   ./snowarch instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default
   (Windows PowerShell/cmd:  snowarch.cmd instance add <label> --url <url> --env <env> --auth <auth> --preset <preset> --default)
3. The wizard proposes the environment and preset and shows a per-flag review — press Enter to accept, or edit any line.
4. Type your username and password when prompted (masked; nothing is echoed).
5. When it prints "Saved instance …", come back here and type:  /snowarch setup-instance --resume
I will wait. Nothing is written until you confirm in the terminal.
```

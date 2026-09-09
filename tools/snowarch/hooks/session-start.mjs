#!/usr/bin/env node
// The SessionStart banner — a STUB until ARC-08-S08 gives it a body.
//
// It is committed now because ARC-06-S05's B07 writes the hook entry that points at it, and a hook
// entry naming a file that does not exist is an error on every session start. Printing an honest
// "unknown" is better than that, and better than a hook that silently does nothing: a reader who
// sees this line knows where to look.
//
// `node:` imports only, and it must never fail: a SessionStart hook that exits non-zero is a
// broken session, and nothing this file could report is worth that.
process.stdout.write('Mode: unknown — run ./snowarch doctor\n');
process.exitCode = 0;

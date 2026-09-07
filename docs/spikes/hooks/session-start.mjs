#!/usr/bin/env node
// spikes/hooks/session-start.mjs -- exec-form SessionStart hook (ARC-00-S01, exercised by S-03 / S-05).
// Prints one line so the record can show whether the hook ran and whether ${CLAUDE_PROJECT_DIR}
// was substituted in `args` on this platform.
const dir = process.env.CLAUDE_PROJECT_DIR ?? '(unset)';
console.log(`Mode: spike — hook ran; CLAUDE_PROJECT_DIR=${dir}; cwd=${process.cwd()}`);

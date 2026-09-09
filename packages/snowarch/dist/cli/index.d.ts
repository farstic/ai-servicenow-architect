#!/usr/bin/env node
/**
 * snowarch CLI — four sub-commands.
 *
 * `start` is the only one implemented here. `instance`, `doctor` and `contract` are
 * stubs that exit 2: they are filled by ARC-07 (on the store module), ARC-04-S12 and
 * ARC-04-S06 respectively. They exist now so the command surface is stable for the
 * `tools/snowarch` launcher, which forwards to `dist/cli/index.js` — that path is a
 * contract with ARC-06/ARC-07 and must not move.
 *
 * What is deliberately absent: the npm update check (it fetched a third party's
 * package record — P-18), the `setup`, `auth`, `instances`, `web`, `shortcuts`,
 * `capabilities`, `run` and `report` commands (D-03), and any coloured output — a
 * CLI that may be piped should not depend on a TTY library for four sub-commands.
 */
import '../env-sanitise.js';

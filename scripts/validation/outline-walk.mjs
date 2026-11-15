#!/usr/bin/env node
// Copyright 2026 Cvetomir Grigorov. Licensed under the Business Source License 1.1 (see LICENSE).
// snowarch — AI ServiceNow Architect. Not affiliated with or endorsed by ServiceNow, Inc.
// ARC-09-C284 — an offline walk of `docs outline`: the calls and the printed lines it takes to reach a page from its area's top.
//
// The first, empty version: it walks nothing and prints nothing, so that the cases written against it can be seen to fail before it does
// any work.
export const TARGET = Object.freeze({ calls: 4, lines: 300 });
export const readerFor = () => () => null;
export const areasOf = () => [];
export const walkTo = () => ({ calls: [], reached: false });
export const locate = () => ({ tree: null, node: null, moved: null });
export const summarise = () => ({ pages: 0, reached: 0, calls: null, lines: null, withinTarget: 0 });
export function main() { return 2; }

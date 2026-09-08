/**
 * Criterion 1: a registration that omits `gate` or `mutates` must not compile.
 *
 * `@ts-expect-error` is the assertion — it fails the type-check if the line it precedes
 * turns out to be VALID. So this file passing `tsc` is the proof: remove a required field
 * from ToolDefinition and this file stops compiling, because the errors it expects vanish.
 */
import type { ToolDefinition } from '../../src/tools/types.js';

const complete: ToolDefinition = {
  name: 'snow_x_y_add',
  description: 'ok',
  inputSchema: { type: 'object' },
  gate: 'write',
  mutates: true,
};

// @ts-expect-error — `gate` is required
const noGate: ToolDefinition = {
  name: 'snow_x_y_add',
  description: 'missing gate',
  inputSchema: { type: 'object' },
  mutates: true,
};

// @ts-expect-error — `mutates` is required
const noMutates: ToolDefinition = {
  name: 'snow_x_y_add',
  description: 'missing mutates',
  inputSchema: { type: 'object' },
  gate: 'write',
};

const badGate: ToolDefinition = {
  name: 'snow_x_y_add',
  description: 'invented gate',
  inputSchema: { type: 'object' },
  // The directive sits on the PROPERTY, not the declaration: an invalid enum value is
  // reported where the value is, and @ts-expect-error only suppresses the following line.
  // @ts-expect-error — `gate` must be one of the seven, not any string
  gate: 'superuser',
  mutates: true,
};

// A manifest function's return type is what makes a missing field a compile error across all
// 397 registrations — this is the shape every *ToolManifest() is annotated with.
function manifest(): ToolDefinition[] {
  return [complete];
}

export { complete, noGate, noMutates, badGate, manifest };

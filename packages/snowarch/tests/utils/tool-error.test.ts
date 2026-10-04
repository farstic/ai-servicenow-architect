import { describe, expect, it } from 'vitest';
import { toolErrorText } from '../../src/utils/tool-error.js';
import { ServiceNowError } from '../../src/utils/errors.js';
import { carryWarningsOnError, type CutValueWarning } from '../../src/servicenow/stored-values.js';

/**
 * ARC-09-C93 — what the CallTool handler returns when a tool throws.
 *
 * The text is the contract the session rules read: `(Code: X)` at the end of the error line is how
 * a runtime error is recognised and its remedy chosen. A tool that failed AFTER it had written a
 * value the platform stored cut gets one more sentence; it must come after that line and must not
 * contain a marker of its own.
 */
const cut = {
  code: 'VALUE_TRUNCATED', operation: 'create', table: 'sys_ai_agent', sys_id: 'a1', field: 'name',
  sent_length: 60, stored_length: 40, column_limit: 40, confirmed: true, message: 'm',
} as CutValueWarning;

describe('toolErrorText', () => {
  it('a ServiceNowError is "Error: <message> (Code: <code>)", exactly as before', () => {
    expect(toolErrorText(new ServiceNowError('no role', 'INSUFFICIENT_PRIVILEGES')))
      .toBe('Error: no role (Code: INSUFFICIENT_PRIVILEGES)');
  });

  it('any other error is "Error executing tool: <message>", exactly as before', () => {
    expect(toolErrorText(new Error('boom'))).toBe('Error executing tool: boom');
    expect(toolErrorText('plain')).toBe('Error executing tool: Unknown error');
  });

  it('a failure after a cut write keeps its own line first and adds one sentence after it', () => {
    const err = new ServiceNowError('ACL refused', 'INSUFFICIENT_PRIVILEGES');
    carryWarningsOnError(err, [cut]);
    const [first, second, ...rest] = toolErrorText(err).split('\n');
    expect(first).toBe('Error: ACL refused (Code: INSUFFICIENT_PRIVILEGES)');
    expect(second).toContain('sys_ai_agent.name');
    expect(rest).toEqual([]);
    expect(second).not.toMatch(/\(Code:/);
  });

  it('the same for an error that is not a ServiceNowError', () => {
    const err = new Error('socket hang up');
    carryWarningsOnError(err, [cut]);
    const text = toolErrorText(err);
    expect(text.startsWith('Error executing tool: socket hang up\n')).toBe(true);
    expect(text).toContain('sys_ai_agent.name');
  });
});

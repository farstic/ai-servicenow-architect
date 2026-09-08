import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/utils/logging.js';

describe('logger — LOG_LEVEL gating + REDACT_SENSITIVE_DATA', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    delete process.env.LOG_LEVEL;
    delete process.env.REDACT_SENSITIVE_DATA;
  });

  it('suppresses messages above the configured level (LOG_LEVEL=error)', () => {
    process.env.LOG_LEVEL = 'error';
    logger.info('hello');
    logger.debug('dbg');
    logger.warn('warn');
    expect(spy).not.toHaveBeenCalled();
    logger.error('boom');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('emits debug when LOG_LEVEL=debug', () => {
    process.env.LOG_LEVEL = 'debug';
    logger.debug('dbg');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('defaults to info (debug hidden, info shown) when LOG_LEVEL is unset', () => {
    logger.debug('hidden');
    expect(spy).not.toHaveBeenCalled();
    logger.info('shown');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('redacts sensitive keys (deep) when REDACT_SENSITIVE_DATA=true', () => {
    process.env.LOG_LEVEL = 'info';
    process.env.REDACT_SENSITIVE_DATA = 'true';
    logger.info('auth', { username: 'amy', password: 'p@ss', nested: { api_key: 'k', ok: 1 } });
    expect(spy.mock.calls[0][1]).toEqual({
      username: 'amy',
      password: '***',
      nested: { api_key: '***', ok: 1 },
    });
  });

  /**
   * ARC-04-S10 flipped the default. This test previously asserted the opposite — that an unset
   * variable left credentials in the log — and it was passing, which is exactly how a default
   * that protects nobody stays in place: the suite recorded the behaviour rather than judging
   * it. The opt-out is still tested below, because it is a real feature for local debugging.
   */
  it('criterion 5 - redacts by default, with REDACT_SENSITIVE_DATA unset', () => {
    process.env.LOG_LEVEL = 'info';
    delete process.env.REDACT_SENSITIVE_DATA;
    logger.info('x', { password: 'p', headers: { Authorization: 'Basic abc' } });
    expect(spy.mock.calls[0][1]).toEqual({ password: '***', headers: { Authorization: '***' } });
  });

  it('criterion 5 - REDACT_SENSITIVE_DATA=false prints the values', () => {
    process.env.LOG_LEVEL = 'info';
    process.env.REDACT_SENSITIVE_DATA = 'false';
    logger.info('x', { password: 'p', headers: { Authorization: 'Basic abc' } });
    expect(spy.mock.calls[0][1]).toEqual({ password: 'p', headers: { Authorization: 'Basic abc' } });
  });

  it('a credential-shaped STRING is redacted under an innocent key', () => {
    // The case scrubbing by key alone missed: the value is recognisable on its own, and it
    // does not always arrive under a key called `authorization`.
    process.env.LOG_LEVEL = 'info';
    delete process.env.REDACT_SENSITIVE_DATA;
    logger.info('x', { note: 'Basic ZmFrZTpjcmVkcw==', items: ['Bearer eyJhbGciOi'] });
    expect(spy.mock.calls[0][1]).toEqual({ note: '***', items: ['***'] });
  });

  it('over-redacts prose beginning "Basic " — the accepted trade-off, asserted', () => {
    // `/^(Basic|Bearer)\s+\S+/i` also matches "Basic troubleshooting steps". That is a false
    // positive, and it is the RIGHT direction to fail in: over-redaction costs a word in a log
    // line, under-redaction publishes a credential. Written down rather than left as a
    // surprise, so anyone tightening the pattern later has to decide deliberately that they
    // are trading a leak risk for legibility.
    //
    // The bare word alone does not match — the pattern needs whitespace and a token after it.
    process.env.LOG_LEVEL = 'info';
    delete process.env.REDACT_SENSITIVE_DATA;
    logger.info('x', { note: 'Basic troubleshooting steps', other: 'Bearer', third: 'basically fine' });
    expect(spy.mock.calls[0][1]).toEqual({ note: '***', other: 'Bearer', third: 'basically fine' });
  });
});

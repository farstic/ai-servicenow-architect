/**
 * Stub the ONE HTTP seam, not the global `fetch`.
 *
 * ARC-04-S11 routed every request through `src/servicenow/http.ts` so that proxy variables are
 * honoured. Three existing suites failed as a result — not because the client broke, but
 * because they stubbed `global.fetch`, which the client no longer calls. Those failures were
 * correct and worth naming: a test that stubs a function nothing calls does not fail loudly, it
 * quietly stops testing, and only a change like this one reveals it. Two of the three then hung
 * for five seconds each, because the unmocked client was making a real request.
 *
 * `vi.mock` is hoisted **within the file that contains it**, so it has to be written in the
 * test file itself — calling it from inside a helper function registers it too late and the
 * real module loads. What lives here is the factory body, which the `vi.mock` callback runs
 * lazily and can therefore import normally:
 *
 *   const http = vi.hoisted(() => ({ calls: [], queue: [] }));
 *   vi.mock('../../src/servicenow/http.js', async () => snFetchMockModule(http));
 *
 *   respond(http, { ok: true, status: 200, text: async () => '{}' });
 *   expect(http.calls[0].url).toContain('sysparm_query=ORDERBYDESCsys_created_on');
 */
export interface SnFetchCall {
  url: string;
  init: Record<string, unknown>;
}

interface Queued {
  kind: 'ok' | 'err';
  value: unknown;
}

export interface SnFetchState {
  calls: SnFetchCall[];
  queue: Queued[];
}

/** The module shape `src/servicenow/http.ts` exports, backed by `state`. */
export function snFetchMockModule(state: SnFetchState): Record<string, unknown> {
  return {
    snFetch: async (url: string | URL, init: Record<string, unknown> = {}) => {
      state.calls.push({ url: String(url), init });
      // The last entry REPEATS rather than running out: a retry test queues a failure then a
      // success, and a client that retried a third time would otherwise hit an empty queue and
      // fail with a confusing error instead of the assertion the test actually makes.
      const next = state.queue.length > 1 ? state.queue.shift()! : state.queue[0];
      if (!next) throw new Error('fetch-mock: no response queued — call respond() first');
      if (next.kind === 'err') throw next.value;
      return next.value;
    },
    resetHttpDispatcher: () => {},
    proxyConfigured: () => false,
  };
}

/** Queue one response. The last queued response repeats for any further calls. */
export function respond(state: SnFetchState, response: unknown): void {
  state.queue.push({ kind: 'ok', value: response });
}

/** Queue one thrown error, for the network-failure paths. */
export function reject(state: SnFetchState, error: unknown): void {
  state.queue.push({ kind: 'err', value: error });
}

export function resetFetchMock(state: SnFetchState): void {
  state.calls.length = 0;
  state.queue.length = 0;
}

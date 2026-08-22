import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './test/mockRpc';

// M12-T01. One MSW server for the whole run, listening for real HTTP requests
// the real Connect transport makes. `onUnhandledRequest: 'error'` fails a test
// loudly the moment it exercises a call site nothing registered a response
// for, rather than letting `fetch` hang or fall through to the real network —
// the two failure modes a silent default would produce.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// jsdom has no ResizeObserver; @tanstack/react-virtual (used by the Tasks
// table view) needs one to observe the scroll container's size.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
}

// jsdom never lays anything out, so every element reports 0 for
// offsetHeight/clientHeight - @tanstack/react-virtual then measures a 0px
// viewport and renders zero rows. Report a generous fixed viewport instead
// so virtualized lists actually render their rows in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });

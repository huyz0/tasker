import '@testing-library/jest-dom';

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

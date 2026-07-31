/**
 * jsdom has no ResizeObserver, which Recharts' ResponsiveContainer constructs on
 * mount. The chart's layout is not what these tests are about — they drive the
 * input fields — so a no-op stub is enough to let the tree render.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

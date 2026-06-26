/**
 * Минимальный test setup.
 *
 * Обеспечивает наличие global.figma для тестов, которые не
 * переопределяют его inline. Реальные моки настраиваются в
 * каждом test файле (router.test.ts, serializer.test.ts, и т.д.)
 */
const mockFigma = {
  currentPage: { id: "0:1", name: "Page 1", type: "PAGE", selection: [], children: [] },
  root: { name: "Test File", children: [] },
  fileKey: "test-file-key",
  showUI: () => {},
  ui: { postMessage: () => {} },
  on: () => {},
  off: () => {},
};

(globalThis as Record<string, unknown>).figma = mockFigma;

import { vi } from "vitest";

const createMockNode = (overrides: Record<string, unknown> = {}) => ({
  id: "0:1",
  name: "Mock Node",
  type: "FRAME",
  parent: null,
  children: [],
  removed: false,
  appendChild: vi.fn(),
  insertChild: vi.fn(),
  removeChild: vi.fn(),
  setPluginData: vi.fn(),
  getPluginData: vi.fn(),
  setSharedPluginData: vi.fn(),
  getSharedPluginData: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
  exports: vi.fn(),
  exportSettings: [],
  nameRaw: "",
  name: "Mock Node",
  visible: true,
  locked: false,
  ...overrides,
});

global.figma = {
  currentPage: {
    id: "0:1",
    name: "Page 1",
    type: "PAGE",
    children: [],
  } as unknown as PageNode,
  root: {
    name: "Test File",
    children: [],
  } as unknown as DocumentNode,
  fileKey: "test-file-key",
  getNodeByIdAsync: vi.fn(async (id: string) => createMockNode({ id })),
  getNodeById: vi.fn((id: string) => createMockNode({ id })),
  createFrame: vi.fn(() => createMockNode({ type: "FRAME" })),
  createText: vi.fn(() => createMockNode({ type: "TEXT" })),
  createShape: vi.fn(() => createMockNode({ type: "RECTANGLE" })),
  createImage: vi.fn(() => createMockNode({ type: "RECTANGLE" })),
  createComponent: vi.fn(() => createMockNode({ type: "COMPONENT" })),
  createInstance: vi.fn(),
  loadFontAsync: vi.fn(),
  base64Decode: vi.fn(),
  showUI: vi.fn(),
  ui: {
    postMessage: vi.fn(),
  },
  importComponentByKeyAsync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
} as unknown as typeof figma;

global.gc = vi.fn();
global.USBDevice = class {} as unknown as USB;
global.Archive = class {} as unknown as Archive;
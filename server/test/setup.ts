/**
 * Test setup. Provides a vi.fn() for fetch so tests can use
 * `vi.mocked(globalThis.fetch)` to access mock methods.
 */
import { vi } from "vitest";

globalThis.fetch = vi.fn() as unknown as typeof fetch;

/**
 * Тесты для useWebSocket.
 *
 * Тестируем:
 * - formatDuration — чистая функция форматирования
 * - Type guards из types/messages
 */
import { describe, it, expect } from "vitest";
import { formatDuration } from "./useWebSocket";
import {
  isFileStatus,
  isBridgeEvent,
  isServerRequest,
  isServerMessage,
  isPluginMessage,
  asFileKey,
  asFileName,
} from "../types/messages";

describe("formatDuration", () => {
  it("formats milliseconds under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(1)).toBe("1ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats seconds for >= 1 second", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(23456)).toBe("23.5s");
    expect(formatDuration(60000)).toBe("60.0s");
  });
});

describe("isFileStatus", () => {
  it("accepts valid FileStatus", () => {
    const valid = {
      fileName: "test.fig",
      fileKey: "abc123",
      selectionCount: 5,
    };
    expect(isFileStatus(valid)).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(isFileStatus({ fileName: "x", fileKey: "y" })).toBe(false);
    expect(isFileStatus({ fileName: "x", fileKey: "y", selectionCount: "5" })).toBe(false);
    expect(isFileStatus(null)).toBe(false);
    expect(isFileStatus(undefined)).toBe(false);
    expect(isFileStatus("string")).toBe(false);
    expect(isFileStatus(42)).toBe(false);
  });
});

describe("isBridgeEvent", () => {
  it("accepts __bridge_event messages", () => {
    expect(
      isBridgeEvent({ type: "__bridge_event", event: "files", files: [] })
    ).toBe(true);
    expect(
      isBridgeEvent({ type: "__bridge_event", event: "server_version", serverVersion: "1.0" })
    ).toBe(true);
  });

  it("rejects non-bridge messages", () => {
    expect(isBridgeEvent({ type: "get_node", requestId: "r1" })).toBe(false);
    expect(isBridgeEvent({ event: "files" })).toBe(false);
    expect(isBridgeEvent(null)).toBe(false);
  });
});

describe("isServerRequest", () => {
  it("accepts server request messages", () => {
    expect(isServerRequest({ type: "get_node", requestId: "r1" })).toBe(true);
    expect(isServerRequest({ type: "set_node_properties" })).toBe(true);
  });

  it("rejects non-request messages", () => {
    expect(isServerRequest({ type: "__bridge_event", event: "files" })).toBe(false);
    expect(isServerRequest({})).toBe(false);
    expect(isServerRequest(null)).toBe(false);
  });
});

describe("isServerMessage", () => {
  it("accepts both bridge events and server requests", () => {
    expect(isServerMessage({ type: "__bridge_event", event: "files" })).toBe(true);
    expect(isServerMessage({ type: "get_node", requestId: "r1" })).toBe(true);
  });

  it("rejects invalid messages", () => {
    expect(isServerMessage({})).toBe(false);
    expect(isServerMessage(null)).toBe(false);
    expect(isServerMessage("string")).toBe(false);
  });
});

describe("isPluginMessage", () => {
  it("accepts plugin message types", () => {
    expect(isPluginMessage({ type: "ui-ready" })).toBe(true);
    expect(
      isPluginMessage({
        type: "server-request",
        payload: { type: "get_node" },
      })
    ).toBe(true);
  });

  it("rejects invalid plugin messages", () => {
    expect(isPluginMessage({ type: "unknown" })).toBe(false);
    expect(isPluginMessage({})).toBe(false);
    expect(isPluginMessage(null)).toBe(false);
  });
});

describe("branded type constructors", () => {
  it("asFileKey produces branded string", () => {
    const key = asFileKey("abc123");
    expect(typeof key).toBe("string");
    expect(key).toBe("abc123");
  });

  it("asFileName produces branded string", () => {
    const name = asFileName("design.fig");
    expect(typeof name).toBe("string");
    expect(name).toBe("design.fig");
  });
});

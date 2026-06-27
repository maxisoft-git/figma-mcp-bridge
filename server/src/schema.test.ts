import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateRpc, figmaNodeId, toolInputSchemas } from "./schema.js";
import { z } from "zod";

describe("schema validators", () => {
  describe("figmaNodeId", () => {
    it("accepts valid colon-separated IDs", () => {
      expect(figmaNodeId.safeParse("1:2").success).toBe(true);
      expect(figmaNodeId.safeParse("4029:12345").success).toBe(true);
    });

    it("accepts composite IDs with semicolons", () => {
      expect(figmaNodeId.safeParse("1:2;3:4").success).toBe(true);
      expect(figmaNodeId.safeParse("4029:12345;4029:67890").success).toBe(true);
    });

    it("rejects malformed IDs", () => {
      expect(figmaNodeId.safeParse("").success).toBe(false);
      expect(figmaNodeId.safeParse("abc").success).toBe(false);
      expect(figmaNodeId.safeParse("1-2").success).toBe(false);
      expect(figmaNodeId.safeParse("1:2:3").success).toBe(false);
    });
  });

  describe("toolInputSchemas", () => {
    it("exports a non-empty map of tool schemas", () => {
      const names = Object.keys(toolInputSchemas);
      expect(names.length).toBeGreaterThan(30);
      // Spot-check a few expected tools
      expect(names).toContain("get_node");
      expect(names).toContain("set_text_content");
      expect(names).toContain("create_frame");
      expect(names).toContain("get_dev_css");
    });

    it("get_node schema requires nodeId", () => {
      const schema = toolInputSchemas.get_node as unknown as z.ZodTypeAny;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ nodeId: "1:2" }).success).toBe(true);
    });

    it("delete_nodes schema requires confirm: true", () => {
      const schema = toolInputSchemas.delete_nodes as unknown as z.ZodTypeAny;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ nodeIds: ["1:2"], confirm: false }).success).toBe(false);
      expect(schema.safeParse({ nodeIds: ["1:2"], confirm: true }).success).toBe(true);
    });

    it("set_text_content schema requires nodeId and text", () => {
      const schema = toolInputSchemas.set_text_content as unknown as z.ZodTypeAny;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ nodeId: "1:2" }).success).toBe(false);
      expect(schema.safeParse({ nodeId: "1:2", text: "hi" }).success).toBe(true);
    });
  });
});

describe("validateRpc", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for valid tool calls", () => {
    expect(validateRpc("get_node", ["1:2"], undefined)).toBeNull();
    expect(validateRpc("set_text_content", ["1:2"], { text: "x" })).toBeNull();
    expect(validateRpc("delete_nodes", ["1:2"], { confirm: true })).toBeNull();
  });

  it("returns null for unknown tool (by design — forwarder trusts plugin)", () => {
    const err = validateRpc("nonexistent_tool", undefined, undefined);
    expect(err).toBeNull();
  });

  it("returns first error for missing required fields", () => {
    const err = validateRpc("set_text_content", ["1:2"], undefined);
    expect(err).toBeTruthy();
    expect(typeof err).toBe("string");
  });

  it("returns error for invalid nodeId format", () => {
    const err = validateRpc("get_node", ["bad-id"], undefined);
    expect(err).toBeTruthy();
  });

  it("returns error for delete_nodes without confirm: true", () => {
    const err = validateRpc("delete_nodes", ["1:2"], { confirm: false });
    expect(err).toBeTruthy();
  });
});

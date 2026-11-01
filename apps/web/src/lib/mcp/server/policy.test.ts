import { describe, expect, it } from "vitest";

import type { McpToolDefinition } from "../types";
import { callableTools, evaluateToolAccess, isWriteTool } from "./policy";

type ToolRef = Pick<McpToolDefinition, "name" | "scope" | "permission">;
const read: ToolRef = { name: "candidates_search", scope: "candidates:read", permission: "candidates:view" };
const write: ToolRef = { name: "applications_move_stage", scope: "candidates:write", permission: ["candidates:move", "candidates:view"] };
const info: ToolRef = { name: "workspace_info", scope: "settings:read", permission: null };

describe("evaluateToolAccess", () => {
  const caller = { scopes: ["candidates:read"], permissions: ["mcp:use", "candidates:view"] };

  it("allows when scope and every permission are held", () => {
    expect(evaluateToolAccess(read, caller)).toBe("ok");
  });

  it("flags a missing scope before a missing permission", () => {
    expect(evaluateToolAccess(write, caller)).toBe("missing_scope");
  });

  it("requires ALL listed permissions", () => {
    const both = { scopes: ["candidates:write"], permissions: ["mcp:use", "candidates:move"] };
    expect(evaluateToolAccess(write, both)).toBe("missing_permission");
    expect(evaluateToolAccess(write, { ...both, permissions: [...both.permissions, "candidates:view"] })).toBe("ok");
  });

  it("lets workspace_info through without any scope", () => {
    expect(evaluateToolAccess(info, { scopes: [], permissions: ["mcp:use"] })).toBe("ok");
  });
});

describe("callableTools", () => {
  const tools = [read, write, info];

  it("lists nothing without mcp:use", () => {
    expect(callableTools(tools, { scopes: ["candidates:read", "candidates:write"], permissions: ["candidates:view", "candidates:move"] })).toEqual([]);
  });

  it("filters by scope and permission, keeping registry order", () => {
    const names = callableTools(tools, { scopes: ["candidates:read"], permissions: ["mcp:use", "candidates:view"] }).map((tool) => tool.name);
    expect(names).toEqual(["candidates_search", "workspace_info"]);
  });
});

describe("isWriteTool", () => {
  it("treats anything not read-only as a write", () => {
    expect(isWriteTool({ annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } })).toBe(true);
    expect(isWriteTool({ annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })).toBe(false);
  });
});

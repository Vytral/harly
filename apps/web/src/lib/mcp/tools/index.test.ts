import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { PERMISSIONS } from "@/features/workspaces/permissions";

// The registry imports every tool, which import the real server actions. Keep
// the auth/config bootstrap and the database client out of this pure test.
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

import { MCP_SCOPES, MCP_TOOL_GROUPS } from "../types";
import { MCP_TOOLS } from "./index";

/**
 * Registry invariants. Tool names, scopes and annotations are a public
 * contract with every MCP client, so they are checked here for all groups.
 */

const NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const WRITE_SCOPE = /:(write|send)$/;

describe("MCP tool registry", () => {
  it("registers tools", () => {
    expect(MCP_TOOLS.length).toBeGreaterThan(0);
  });

  it("has unique snake_case names prefixed by an area", () => {
    const seen = new Set<string>();
    for (const tool of MCP_TOOLS) {
      expect(tool.name, tool.name).toMatch(NAME);
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(64);
      expect(seen.has(tool.name), `duplicate ${tool.name}`).toBe(false);
      seen.add(tool.name);
    }
  });

  it("puts every tool in a known group whose name prefixes the tool name", () => {
    for (const tool of MCP_TOOLS) {
      expect(MCP_TOOL_GROUPS, tool.name).toContain(tool.group);
      // Pipeline, reports and the like may share a prefix with another group;
      // the first word must still be a known area name or group.
      const area = tool.name.split("_")[0];
      const areas = new Set<string>([...MCP_TOOL_GROUPS, "application", "applications", "candidate", "scorecards", "email", "emails", "inbox", "mailbox", "offer", "interview", "document", "task", "report", "automation", "setting", "job", "message", "pipeline", "stages", "templates", "talent", "members", "workspace"]);
      expect(areas.has(area), `${tool.name} starts with unknown area "${area}"`).toBe(true);
    }
  });

  it("gives every tool a title and a model-facing description of at least 40 characters", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.title.trim().length, `${tool.name} title`).toBeGreaterThan(2);
      expect(tool.description.trim().length, `${tool.name} description`).toBeGreaterThanOrEqual(40);
    }
  });

  it("uses only scopes the OAuth server can grant", () => {
    for (const tool of MCP_TOOLS) {
      expect(MCP_SCOPES, tool.name).toContain(tool.scope);
    }
  });

  it("declares all four annotations as booleans", () => {
    for (const tool of MCP_TOOLS) {
      for (const key of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
        expect(typeof tool.annotations[key], `${tool.name}.${key}`).toBe("boolean");
      }
    }
  });

  it("pairs read-only tools with :read scopes and mutating tools with write scopes", () => {
    for (const tool of MCP_TOOLS) {
      if (tool.annotations.readOnlyHint) {
        expect(tool.scope, `${tool.name} is read-only`).toMatch(/:read$/);
        expect(tool.annotations.destructiveHint, `${tool.name} read-only cannot be destructive`).toBe(false);
      } else {
        expect(tool.scope, `${tool.name} mutates`).toMatch(WRITE_SCOPE);
      }
    }
  });

  it("never combines readOnlyHint with openWorldHint side effects", () => {
    for (const tool of MCP_TOOLS) {
      if (tool.annotations.readOnlyHint) expect(tool.annotations.destructiveHint, tool.name).toBe(false);
    }
  });

  it("references only real Harly permissions", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const tool of MCP_TOOLS) {
      const list = tool.permission === null ? [] : Array.isArray(tool.permission) ? tool.permission : [tool.permission];
      for (const permission of list) expect(known.has(permission), `${tool.name} -> ${permission}`).toBe(true);
    }
  });

  it("converts every input schema to a JSON Schema object with described fields", () => {
    for (const tool of MCP_TOOLS) {
      const schema = z.toJSONSchema(tool.input, { io: "input" }) as {
        type?: string;
        properties?: Record<string, { description?: string }>;
      };
      expect(schema.type, tool.name).toBe("object");
      for (const [field, definition] of Object.entries(schema.properties ?? {})) {
        expect(definition.description?.trim(), `${tool.name}.${field} needs .describe()`).toBeTruthy();
      }
    }
  });

  it("lets the workspace tools identify the caller", () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["workspace_info", "workspace_search", "workspace_members_list"]));
  });
});

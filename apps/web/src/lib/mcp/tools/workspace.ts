import "server-only";

import { and, asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

import { db, member as authMembers, user as authUsers } from "@harly/db";

import { resolveSearchActor, searchWorkspaceForActor } from "@/features/search/workspace-search";
import { roleLabel } from "@/features/workspaces/permissions";
import { getMcpActor } from "../actor";
import { buildWorkspaceSummary } from "../server/workspace-summary";
import { defineMcpTool, McpToolError, type McpToolDefinition } from "../types";

/**
 * Workspace-level tools: who you are acting as, a cross-entity search and the
 * team directory. The other groups build on the ids these return.
 */

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;

/** Escape `%`, `_` and `\` so user text is matched literally by ILIKE. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const workspaceInfo = defineMcpTool({
  name: "workspace_info",
  title: "Workspace and access info",
  description:
    "Describe the Harly workspace you are connected to and who you are acting as: workspace name and URL, the signed-in user, their role and the exact Harly permissions that role grants, the OAuth scopes granted to this connection, and which integrations (email, calendar, Slack...) are connected. " +
    "Call it first when you are unsure what you may do or when another tool refuses with a permission error. Takes no input and changes nothing.",
  group: "workspace",
  scope: "settings:read",
  permission: null,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({}),
  async run(_input, ctx) {
    const actor = getMcpActor();
    if (!actor) throw new McpToolError("No MCP actor in scope.", "unavailable");
    return buildWorkspaceSummary({ actor, appOrigin: ctx.appOrigin });
  },
});

const CANDIDATE_PATH = /\/dashboard\/candidates\/([^/?#]+)/;

const workspaceSearch = defineMcpTool({
  name: "workspace_search",
  title: "Search the workspace",
  description:
    "Search jobs, candidates, applications, tasks and teammates by name, email, title or keyword in one call; the same search as the command palette in Harly. " +
    "Use it to turn a name the user mentions into ids: jobs[].id is a jobId, candidates[].id a candidateId, applications[].applicationId an applicationId (with its candidateId). Only groups the user is allowed to see are returned, and only records inside their role's scope. " +
    "Returns up to limitPerGroup hits per group, each with a url to the record in Harly, and hasMore flags. For long candidate lists use the dedicated candidate search tool instead.",
  group: "workspace",
  scope: "candidates:read",
  permission: null,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    query: z.string().trim().min(2).max(200).describe("Text to look for: a person's name or email, a job title, a task title."),
    limitPerGroup: z.number().int().min(1).max(25).default(8).describe("Maximum hits per group (jobs, candidates, applications, tasks, people). Default 8."),
  }),
  async run(input, ctx) {
    const actor = await resolveSearchActor();
    const results = await searchWorkspaceForActor(actor, input.query, { limitPerGroup: input.limitPerGroup });
    const groups: Record<string, unknown[]> = {};
    const hasMore: Record<string, boolean> = {};
    for (const [group, value] of Object.entries(results.groups)) {
      if (!value) continue;
      hasMore[group] = value.hasMore;
      groups[group] = value.hits.map((hit) => {
        const base = {
          title: hit.primary,
          subtitle: hit.secondary,
          url: `${ctx.appOrigin}${hit.href}`,
        };
        if (group === "applications") {
          return { applicationId: hit.id, candidateId: CANDIDATE_PATH.exec(hit.href)?.[1] ?? null, ...base };
        }
        return { id: hit.id, ...base };
      });
    }
    return { query: results.query, groups, hasMore };
  },
});

const workspaceMembersList = defineMcpTool({
  name: "workspace_members_list",
  title: "List team members",
  description:
    "List the people in this workspace (recruiters, hiring managers, admins) with their role, job title, department and status. Use it to find a teammate's userId, for example to assign a task, add someone to a hiring team or pick an interviewer. " +
    "Optionally filter by a name or email fragment. Paginated with limit and offset; inactive and suspended members are included only when includeInactive is true. Needs permission to view members.",
  group: "workspace",
  scope: "settings:read",
  permission: "members:read",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  input: z.object({
    query: z.string().trim().max(100).optional().describe("Part of a name or email to filter by."),
    includeInactive: z.boolean().default(false).describe("Also list inactive and suspended members."),
    limit: z.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT).describe("Page size, default 25, maximum 100."),
    offset: z.number().int().min(0).max(100_000).default(0).describe("Number of members to skip, for paging."),
  }),
  async run(input, ctx) {
    const filters = [eq(authMembers.organizationId, ctx.workspaceId)];
    if (!input.includeInactive) filters.push(eq(authMembers.status, "active"));
    if (input.query) {
      const pattern = likePattern(input.query);
      filters.push(or(ilike(authUsers.name, pattern), ilike(authUsers.email, pattern))!);
    }
    const rows = await db
      .select({
        userId: authMembers.userId,
        name: authUsers.name,
        email: authUsers.email,
        role: authMembers.role,
        status: authMembers.status,
        department: authMembers.department,
        region: authMembers.region,
        jobTitle: authUsers.jobTitle,
      })
      .from(authMembers)
      .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
      .where(and(...filters))
      .orderBy(asc(authUsers.name), asc(authUsers.id))
      .limit(input.limit + 1)
      .offset(input.offset);

    const page = rows.slice(0, input.limit);
    return {
      members: page.map((row) => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        role: roleLabel(row.role),
        roleKey: row.role,
        status: row.status,
        jobTitle: row.jobTitle,
        department: row.department,
        region: row.region,
      })),
      count: page.length,
      nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
    };
  },
});

export const workspaceTools: McpToolDefinition[] = [workspaceInfo, workspaceSearch, workspaceMembersList];

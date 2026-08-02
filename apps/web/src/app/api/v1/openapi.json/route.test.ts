import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { GET } from "./route";
import { apiContracts } from "@/server/api/contracts/registry";

describe("GET /api/v1/openapi.json", () => {
  it("generates a valid OpenAPI 3.1 specification with unique operationIds and resolvable refs", async () => {
    const response = await GET(
      new Request("https://harly.example/api/v1/openapi.json"),
    );
    expect(response.status).toBe(200);

    const spec = await response.json();

    // 1. Verify OpenAPI version 3.1
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info?.title).toBeTruthy();
    expect(spec.info?.version).toBeTruthy();

    for (const componentGroup of Object.values(spec.components ?? {})) {
      if (typeof componentGroup !== "object" || componentGroup === null) {
        continue;
      }
      for (const key of Object.keys(componentGroup)) {
        expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
      }
    }

    // 2. Check for unique operationIds and documented responses across all routes
    const operationIds = new Set<string>();
    const duplicateIds: string[] = [];

    for (const [pathKey, methods] of Object.entries(spec.paths)) {
      for (const [methodKey, operation] of Object.entries(
        methods as Record<string, unknown>,
      )) {
        if (typeof operation !== "object" || operation === null) continue;
        const op = operation as {
          operationId?: string;
          responses?: Record<string, unknown>;
        };

        // Verify operationId exists and is unique
        const opId = op.operationId as string;
        expect(
          opId,
          `Missing operationId in ${methodKey.toUpperCase()} ${pathKey}`,
        ).toBeTruthy();

        if (operationIds.has(opId)) {
          duplicateIds.push(opId);
        } else {
          operationIds.add(opId);
        }

        // Verify every route has documented responses
        expect(
          op.responses,
          `Missing responses object in ${methodKey.toUpperCase()} ${pathKey}`,
        ).toBeTruthy();
        expect(
          Object.keys(op.responses ?? {}).length,
          `No responses defined for ${methodKey.toUpperCase()} ${pathKey}`,
        ).toBeGreaterThan(0);
      }
    }

    expect(
      duplicateIds,
      `Duplicate operationIds found: ${duplicateIds.join(", ")}`,
    ).toEqual([]);

    // 3. Verify all $ref references are resolvable and specification is valid
    // Dereference validates that every $ref (e.g. #/components/responses/BadRequest) exists in the spec
    const dereferenced = await SwaggerParser.dereference(
      JSON.parse(JSON.stringify(spec)),
    );
    expect(dereferenced).toBeTruthy();
  });

  it("keeps the contract registry aligned with the implemented API routes", () => {
    const apiRoot = path.resolve(process.cwd(), "src/app/api/v1");
    const implementedRoutes: string[] = [];
    const normalizeRoute = (value: string) =>
      value.replace(/\[([^\]]+)\]/g, "{$1}");

    const walk = (dir: string, segments: string[] = []) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, [...segments, entry.name]);
          continue;
        }
        if (entry.isFile() && entry.name === "route.ts") {
          const route = normalizeRoute(`/${segments.join("/")}`);
          if (route !== "/openapi.json") {
            implementedRoutes.push(route);
          }
        }
      }
    };
    walk(apiRoot);

    const contractPaths = new Set(
      apiContracts.map((contract) => contract.path.replace(/^\/api\/v1/, "")),
    );

    expect(implementedRoutes.length).toBeGreaterThan(0);
    for (const route of implementedRoutes) {
      expect(
        contractPaths.has(route),
        `Missing contract for route ${route}`,
      ).toBe(true);
    }
  });
});

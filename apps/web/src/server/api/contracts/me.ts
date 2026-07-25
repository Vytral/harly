import { z } from "zod";
import { defineContract } from "./core";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./types";

export const getMeContract = defineContract({
  method: "GET",
  path: "/api/v1/me",
  operationId: "getMe",
  summary: "Get current API key context",
  tags: ["Auth"],
  auth: { scopes: [] },
  responses: {
    200: successEnvelopeSchema(
      z.object({
        workspaceId: z.string().uuid(),
        keyId: z.string().uuid(),
        type: z.enum(["publishable", "secret"]),
        environment: z.enum(["live", "test"]),
        scopes: z.array(z.string()),
      }),
    ),
    401: errorEnvelopeSchema,
  },
});

export const meContracts = [getMeContract] as const;

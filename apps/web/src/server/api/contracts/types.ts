import { z } from "zod";

export { defineContract, buildRouteHandler, jsonSchema } from "./core";
export type {
  ContractDefinition as RouteDefinition,
  ContractRequestBody as RequestBodyDefinition,
  ContractResponse as ResponseDefinition,
  RouteContext,
  RouteHandler,
  RouteHandlerInput,
} from "./core";

export function successEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: z
      .object({
        pagination: z
          .object({
            nextCursor: z.string().nullable(),
            hasMore: z.boolean(),
            limit: z.number(),
          })
          .optional(),
      })
      .optional(),
  });
}

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

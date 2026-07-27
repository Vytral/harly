import { RouteDefinition } from "./types";

/**
 * Validates that an HTTP Response object returned from a route handler
 * strictly complies with the Zod schema defined in the route contract for that HTTP status code.
 */
export async function validateRouteResponse(
  route: RouteDefinition,
  response: Response,
  expectedStatus?: number,
) {
  const status = expectedStatus ?? response.status;
  if (response.status !== status) {
    throw new Error(`Expected HTTP ${status}, received ${response.status}`);
  }

  const responseDef = route.responses[status];
  if (!responseDef) {
    throw new Error(
      `Status ${status} is not documented in contract for route ${route.method} ${route.path}`,
    );
  }

  const schema = "schema" in responseDef ? responseDef.schema : responseDef;
  const json = await response.clone().json();
  const result = schema.safeParse(json);

  if (!result.success) {
    console.error(
      `Validation failed for ${route.method} ${route.path} status ${status}:`,
      result.error.format(),
    );
  }
  if (!result.success) {
    throw new Error(
      `Response for ${route.method} ${route.path} does not satisfy its contract`,
    );
  }
  return json;
}

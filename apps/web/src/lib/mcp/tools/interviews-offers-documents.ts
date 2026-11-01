import "server-only";

import type { McpToolDefinition } from "../types";
import { documentTools } from "./iod/document-tools";
import { interviewTools } from "./iod/interview-tools";
import { offerTools } from "./iod/offer-tools";

/** Interviews (with scorecards), offers and documents (requests, templates, e-signature). */
export const interviewsOffersDocumentsTools: McpToolDefinition[] = [
  ...interviewTools,
  ...offerTools,
  ...documentTools,
] as McpToolDefinition[];

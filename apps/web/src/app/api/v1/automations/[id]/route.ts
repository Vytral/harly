import { apiError, withApi } from "@/server/api/respond";
import { AUTOMATIONS_API_GONE_MESSAGE } from "@/features/automations/status";

export const runtime = "nodejs";

/** The public Automations HTTP API is withdrawn: answer 410 in the standard error envelope. */
const gone = withApi(async () => apiError("gone", AUTOMATIONS_API_GONE_MESSAGE));

export const GET = gone;
export const PATCH = gone;
export const DELETE = gone;

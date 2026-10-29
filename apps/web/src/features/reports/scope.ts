import "server-only";

import { isUnrestrictedScope } from "@/features/search/scope";
import type { RoleScope } from "@/features/workspaces/permissions";

export const REPORTS_SCOPE_MESSAGE =
  "Reports are not available for roles limited to specific jobs.";

/**
 * Thrown by the reports data layer when the actor's role is limited to specific
 * jobs. Workspace reports cannot be filtered by job, so a restricted actor gets
 * no metrics at all, whichever caller asks.
 */
export class ReportsScopeError extends Error {
  readonly code = "reports_scope_restricted";

  constructor(message: string = REPORTS_SCOPE_MESSAGE) {
    super(message);
    this.name = "ReportsScopeError";
  }
}

/** The part of an actor the reports data layer needs: whose role scope applies. */
export type ReportsActor = { scope: RoleScope };

export function reportsActorIsUnrestricted(actor: ReportsActor): boolean {
  return isUnrestrictedScope(actor.scope);
}

export function assertUnrestrictedReportsActor(actor: ReportsActor): void {
  if (!reportsActorIsUnrestricted(actor)) throw new ReportsScopeError();
}

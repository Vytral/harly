/**
 * Product kill switch for the automation system.
 *
 * Keep existing definitions and run history intact while the creator is out
 * of service. Re-enable this explicitly when the feature is production-ready.
 */
export const AUTOMATIONS_ENABLED = true;

/**
 * Emergency drain switch for dispatching the historical linear runner. New
 * workflows are created as v2; this remains only for an operator who finds a
 * legacy v1 definition after launch and wants its dispatch to fail closed
 * while it is explicitly paused or handled. It is not a v1 data migration
 * switch and it does not affect v2 creation or execution.
 */
export function legacyWorkflowDispatchDisabled(): boolean {
  return process.env.AUTOMATIONS_DISABLE_V1_DISPATCH === "1";
}

export const AUTOMATIONS_DISABLED_MESSAGE =
  "Automations are temporarily disabled.";

/**
 * Public REST `/api/v1/automations` is withdrawn independently of the
 * dashboard kill switch. A 410 here is not an outage of the builder.
 */
export const AUTOMATIONS_API_GONE_MESSAGE =
  "The public Automations HTTP API is withdrawn. Use the dashboard to build and inspect workflows. A replacement contract will ship with automations v2.";

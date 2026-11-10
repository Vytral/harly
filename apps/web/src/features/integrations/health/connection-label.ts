/**
 * The label a provider panel shows. A healthy integration keeps the label its
 * configuration gives (Connected, or Disabled for a switched-off integration).
 * Any other state is shown from the health model, so a panel never reads
 * Connected beside a reconnect notice.
 */

import { INTEGRATION_STATE_LABEL, type IntegrationHealthState, type IntegrationHealthView } from "./model";

export function providerStatusLabel(
  health: Pick<IntegrationHealthView, "state"> | null | undefined,
  configuredLabel: string,
  t?: (key: string) => string,
): string {
  if (!health || health.state === "connected") return configuredLabel;
  const state = health.state as IntegrationHealthState;
  if (t) return t(`features.integrations.integrationHealthNotice.states.${state}`);
  return INTEGRATION_STATE_LABEL[state];
}

/** Pill tone for a provider panel: attention states use the warn tone. */
export function providerStatusTone<T extends string>(
  health: Pick<IntegrationHealthView, "state"> | null | undefined,
  configuredTone: T,
): T | "warn" {
  if (!health || health.state === "connected") return configuredTone;
  if (health.state === "not_connected") return configuredTone;
  return "warn";
}

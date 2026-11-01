import Link from "next/link";
import type { Route } from "next";
import { PlugZap } from "lucide-react";

import { isDemoMode } from "@harly/config";

import { StatusPill } from "@/components/ui/status-pill";
import {
  attentionMessage,
  ATTENTION_TARGET,
  reconnectHref,
} from "@/features/integrations/health/attention-view";
import { getIntegrationAttention } from "@/features/integrations/health/repository";
import { can } from "@/features/workspaces/permissions-server";
import { getWorkspaceContext } from "@/features/workspaces/context";

import { Tile, TileHeader, TileLink } from "./primitives";

/**
 * Quiet notice for integrations that stopped working. Renders nothing when
 * nothing needs attention, in the public demo, or for users who cannot manage
 * integrations.
 */
export async function IntegrationAttentionCard() {
  if (isDemoMode()) return null;
  if (!(await can("integrations:manage"))) return null;

  const { organization } = await getWorkspaceContext();
  const items = await getIntegrationAttention(organization.id);
  if (items.length === 0) return null;

  return (
    <div className="mt-4">
      <Tile>
        <TileHeader
          icon={PlugZap}
          title="Integrations need attention"
          count={items.length}
          action={<TileLink href={"/settings/integrations" as Route}>Open integrations</TileLink>}
        />
        <ul className="flex flex-col gap-0.5 px-2 pb-3 pt-3">
          {items.map((item) => {
            const target = ATTENTION_TARGET[item.integration];
            return (
              <li
                key={item.integration}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {target.name}
                    <StatusPill tone={item.reconnectRequired ? "danger" : "warning"} size="sm">
                      {item.reconnectRequired ? "Reconnect required" : "Needs attention"}
                    </StatusPill>
                  </p>
                  <p className="truncate text-xs text-soft-ink">{attentionMessage(item)}</p>
                </div>
                <Link
                  href={reconnectHref(item.integration) as Route}
                  className="shrink-0 rounded-[var(--radius-btn)] border border-mist-border bg-card px-3 py-1.5 text-[13px] font-medium text-near-ink transition-colors hover:bg-card-inset"
                >
                  Reconnect
                </Link>
              </li>
            );
          })}
        </ul>
      </Tile>
    </div>
  );
}

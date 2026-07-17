import Link from "next/link";
import type { Route } from "next";
import type { ComponentType } from "react";

import {
  ArrowUpRightIcon,
  CheckIcon,
  PlusIcon,
} from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

type Logo = ComponentType<{ className?: string }>;

export type MarketplaceIntegration = {
  id: string;
  name: string;
  description: string;
  logo: Logo;
  logoClassName?: string;
  tileClassName: string;
  href?: string;
  status: "available" | "connected" | "coming-soon";
  actionLabel?: string;
};

export type MarketplaceGroup = {
  label: string;
  integrations: MarketplaceIntegration[];
};

/** Trailing affordance for a row. Purely visual — the whole row is the link. */
function RowIndicator({ integration }: { integration: MarketplaceIntegration }) {
  if (integration.status === "coming-soon") {
    return (
      <span className="shrink-0 rounded-md border border-dashed px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        Coming soon
      </span>
    );
  }

  const connected = integration.status === "connected";

  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground",
        connected && "text-pine group-hover:text-pine",
      )}
    >
      {connected ? (
        <CheckIcon className="size-4" />
      ) : integration.actionLabel === "Import" ? (
        <ArrowUpRightIcon className="size-4" />
      ) : (
        <PlusIcon className="size-4" />
      )}
    </span>
  );
}

function IntegrationRow({
  integration,
}: {
  integration: MarketplaceIntegration;
}) {
  const Logo = integration.logo;
  const connected = integration.status === "connected";
  const interactive =
    integration.status !== "coming-soon" && Boolean(integration.href);

  const inner = (
    <>
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10",
          integration.tileClassName,
        )}
      >
        <Logo className={cn("size-5", integration.logoClassName)} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {integration.name}
          </span>
          {connected ? (
            <span className="shrink-0 text-[11px] font-medium text-pine">
              Connected
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {integration.description}
        </span>
      </span>
      <RowIndicator integration={integration} />
    </>
  );

  const base =
    "group flex min-w-0 items-center gap-3 border-t border-border/60 py-3.5 transition-colors sm:px-2";

  if (interactive) {
    return (
      <Link
        href={integration.href as Route}
        aria-label={`Open ${integration.name}`}
        className={cn(
          base,
          "rounded-lg hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}

export function IntegrationMarketplace({
  groups,
}: {
  groups: MarketplaceGroup[];
}) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label} aria-labelledby={`integration-${group.label}`}>
          <h3
            id={`integration-${group.label}`}
            className="mb-3 text-sm font-semibold text-foreground"
          >
            {group.label}
          </h3>
          <div className="grid gap-x-10 sm:grid-cols-2">
            {group.integrations.map((integration) => (
              <IntegrationRow key={integration.id} integration={integration} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

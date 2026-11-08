import { Cloud, Cpu, Server } from "lucide-react";

import {
  ClaudeLogo,
  GeminiLogo,
  OpenAiLogo,
  OpenRouterLogo,
  XaiLogo,
} from "@/components/ui/icons/brands";
import { getProvider } from "@/lib/ai/providers";

/** Brand mark when we have one, otherwise a neutral icon that fits the kind. */
export function ProviderLogo({
  id,
  className,
}: {
  id: string | null | undefined;
  className?: string;
}) {
  switch (id) {
    case "openai":
      return <OpenAiLogo className={className} />;
    case "anthropic":
      return <ClaudeLogo className={className} />;
    case "google":
      return <GeminiLogo className={className} />;
    case "xai":
      return <XaiLogo className={className} />;
    case "openrouter":
      return <OpenRouterLogo className={className} />;
  }
  const info = id ? getProvider(id) : undefined;
  if (info?.allowPrivateHosts) {
    return <Server className={className} strokeWidth={1.8} aria-hidden />;
  }
  if (info?.kind === "azure") {
    return <Cloud className={className} strokeWidth={1.8} aria-hidden />;
  }
  return <Cpu className={className} strokeWidth={1.8} aria-hidden />;
}

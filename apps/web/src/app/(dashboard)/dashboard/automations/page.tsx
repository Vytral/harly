// The visual automations builder (WHEN → IF → DO) is paused for launch.
// The implementation under /features/automations/* is preserved verbatim
// so the feature can be re-enabled without rebuilding. See AGENTS.md in
// this directory for the full context and the re-enablement steps.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AutomationsPage() {
  notFound();
}

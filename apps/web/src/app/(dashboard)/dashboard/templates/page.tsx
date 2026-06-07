import { FileText } from "lucide-react";

import { ComingSoon } from "@/components/ComingSoon";

export default function TemplatesPage() {
  return (
    <ComingSoon
      icon={FileText}
      title="Templates"
      description="Reusable email and scorecard templates to keep your team consistent and fast."
    />
  );
}

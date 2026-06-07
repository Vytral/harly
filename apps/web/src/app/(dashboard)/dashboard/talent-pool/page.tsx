import { UsersRound } from "lucide-react";

import { ComingSoon } from "@/components/ComingSoon";

export default function TalentPoolPage() {
  return (
    <ComingSoon
      icon={UsersRound}
      title="Talent Pool"
      description="A searchable pool of past candidates to source from for future roles."
    />
  );
}

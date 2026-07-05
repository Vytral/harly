import { BrainCircuit } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getPipelineSummary } from "@/features/pipeline/data";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { generatePipelineHeadlineWithAI } from "@/lib/ai/surfaces/summarize-pipeline";
import { getWorkspaceContext } from "@/features/workspaces/context";

export async function PipelineSummaryCard({ jobId }: { jobId: string }) {
  const { organization: workspace } = await getWorkspaceContext();

  // Run DB query and AI config fetch in parallel.
  const [summary, aiConfig] = await Promise.all([
    getPipelineSummary(jobId),
    getWorkspaceAiConfig(workspace.id),
  ]);

  if (!summary || summary.totalActive === 0) return null;

  let aiHeadline: string | null = null;
  try {
    if (aiConfig) {
      aiHeadline = await generatePipelineHeadlineWithAI(aiConfig, summary);
    }
  } catch {
    // AI unavailable — show stats only
  }

  const topFits = summary.byRecommendation.strong_yes + summary.byRecommendation.yes;

  return (
    <Card className="bg-muted/30">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BrainCircuit className="size-4 text-primary" strokeWidth={1.8} />
          <span>Pipeline overview</span>
        </div>

        {aiHeadline ? (
          <p className="text-sm text-muted-foreground">{aiHeadline}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Active" value={summary.totalActive} />
          <StatTile label="Top fits" value={topFits} tone="positive" />
          <StatTile
            label="Unscored"
            value={summary.unscored}
            tone={summary.unscored > 0 ? "neutral" : "positive"}
          />
          <StatTile
            label={`Stalled ${summary.stalledDays}d+`}
            value={summary.stalledCandidates}
            tone={summary.stalledCandidates > 0 ? "warning" : "positive"}
          />
        </div>

        {summary.byRecommendation.strong_yes > 0 || summary.byRecommendation.yes > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {summary.byRecommendation.strong_yes > 0 ? (
              <span>
                <span className="font-medium text-primary">
                  {summary.byRecommendation.strong_yes}
                </span>{" "}
                strong yes
              </span>
            ) : null}
            {summary.byRecommendation.yes > 0 ? (
              <span>
                <span className="font-medium text-primary">{summary.byRecommendation.yes}</span> yes
              </span>
            ) : null}
            {summary.byRecommendation.maybe > 0 ? (
              <span>
                <span className="font-medium text-clay">{summary.byRecommendation.maybe}</span>{" "}
                maybe
              </span>
            ) : null}
            {summary.byRecommendation.no > 0 ? (
              <span>
                <span className="font-medium text-muted-foreground">
                  {summary.byRecommendation.no}
                </span>{" "}
                no
              </span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "positive" | "warning" | "neutral";
}) {
  return (
    <div className="rounded-lg bg-background px-3 py-2">
      <p
        className={`text-xl font-semibold tabular-nums ${
          tone === "positive"
            ? "text-primary"
            : tone === "warning"
              ? "text-clay"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

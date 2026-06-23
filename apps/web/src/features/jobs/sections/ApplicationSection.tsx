import { useState } from "react";

import type { JobApplicationConfig } from "../config";
import { JobQuestionBuilder } from "../JobQuestionBuilder";
import { Switch } from "@/components/ui/switch";

function LinkToggle({
  name,
  requiredName,
  label,
  setting,
}: {
  name: string;
  requiredName: string;
  label: string;
  setting: { enabled: boolean; required: boolean };
}) {
  const [enabled, setEnabled] = useState(setting.enabled);

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Switch name={name} checked={enabled} onCheckedChange={setEnabled} />
      </label>
      {enabled ? (
        <label className="mt-2.5 flex items-center justify-between gap-3 border-t pt-2.5">
          <span className="text-xs text-muted-foreground">
            Require candidates to fill this in
          </span>
          <Switch name={requiredName} defaultChecked={setting.required} />
        </label>
      ) : null}
    </div>
  );
}

export function ApplicationSection({
  applicationConfig,
}: {
  applicationConfig: JobApplicationConfig;
}) {
  return (
    <div className="space-y-5">
      <label className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 p-4">
        <span>
          <span className="block text-sm font-medium">Require CV / resume</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Candidates must upload a PDF, DOC, or DOCX.
          </span>
        </span>
        <Switch
          name="resumeRequired"
          defaultChecked={applicationConfig.resumeRequired}
        />
      </label>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Candidate links (optional)</p>
        <p className="text-sm text-muted-foreground">
          Pick which profile links to offer — candidates can leave any of them
          blank.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <LinkToggle
            name="profileLinkLinkedin"
            requiredName="profileLinkLinkedinRequired"
            label="LinkedIn"
            setting={applicationConfig.profileLinks.linkedin}
          />
          <LinkToggle
            name="profileLinkGithub"
            requiredName="profileLinkGithubRequired"
            label="GitHub"
            setting={applicationConfig.profileLinks.github}
          />
          <LinkToggle
            name="profileLinkWebsite"
            requiredName="profileLinkWebsiteRequired"
            label="Website / Portfolio"
            setting={applicationConfig.profileLinks.website}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold">Custom questions</h3>
        <JobQuestionBuilder initialQuestions={applicationConfig.questions} />
      </div>
    </div>
  );
}

import { jobsContracts } from "./jobs";
import { candidatesContracts } from "./candidates";
import { applicationsContracts } from "./applications";
import { apiKeysContracts } from "./api-keys";
import { webhooksContracts } from "./webhooks";
import { interviewsContracts } from "./interviews";
import { offersContracts } from "./offers";
import { scorecardsContracts } from "./scorecards";
import { tasksContracts } from "./tasks";
import { activityEventsContracts } from "./activity-events";
import { poolEntriesContracts } from "./pool-entries";
import { meContracts } from "./me";
import { automationsContracts } from "./automations";
import type { RouteDefinition } from "./types";

export const apiContracts: RouteDefinition[] = [
  ...jobsContracts,
  ...candidatesContracts,
  ...applicationsContracts,
  ...apiKeysContracts,
  ...webhooksContracts,
  ...interviewsContracts,
  ...offersContracts,
  ...scorecardsContracts,
  ...tasksContracts,
  ...activityEventsContracts,
  ...poolEntriesContracts,
  ...meContracts,
  ...automationsContracts,
];

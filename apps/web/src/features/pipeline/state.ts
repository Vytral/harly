/**
 * The status an application can hold. Derive it from a stage with
 * `applicationStatusForStage` (`@harly/db`), never from a stage's display name.
 */
export type PipelineApplicationStatus = "active" | "hired" | "rejected" | "withdrawn";

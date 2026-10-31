/**
 * Current rules-engine version. Its own module so client code (the pipeline
 * ranking) can compare against it without bundling the rules engine. Stored
 * engine versions look like `rules-v6:balanced` (version, then evaluation mode).
 */
export const RULES_EVALUATION_VERSION = "rules-v6";

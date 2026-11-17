import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

import { jobs } from "@harly/db";

/**
 * Conditions a job must meet to appear publicly (career page, sitemap,
 * publishable API keys): open, not trashed, already published and not past
 * its closing date. Null dates preserve legacy open jobs that predate
 * publication scheduling.
 *
 * Kept in its own module, free of server-only dependencies, so services can
 * import it without loading the whole jobs data layer.
 */
export function publicJobVisibilityConditions(now = new Date()) {
  return and(
    eq(jobs.status, "open"),
    isNull(jobs.deletedAt),
    or(isNull(jobs.publishedAt), lte(jobs.publishedAt, now)),
    or(isNull(jobs.validThrough), gte(jobs.validThrough, now)),
  );
}

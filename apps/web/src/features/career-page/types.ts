/**
 * Shared types for the career page feature , templates, builder, and public
 * render all import from here instead of redeclaring locally.
 */

export type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
  /** Optional compensation. Templates show a salary only when the route's
   *  job mapper passes these through (Showcase does; the others ignore them). */
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
};

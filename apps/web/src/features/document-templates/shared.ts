/** Column template for the templates list; its loading skeleton uses the same one. */
export const TEMPLATE_LIST_GRID =
  "md:grid-cols-[minmax(14rem,2fr)_minmax(10rem,1.5fr)_7rem_7rem_2.5rem]";

export type WorkflowDocumentTemplateItem = {
  id: string;
  name: string;
  title: string;
  body: string;
  format: string;
  archivedAt: Date | null;
  updatedAt: Date;
};

export type WorkflowDocumentTemplateSnapshot = {
  id: string;
  name: string;
  title: string;
  body: string;
  format: string;
};

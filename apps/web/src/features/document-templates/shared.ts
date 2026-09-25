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

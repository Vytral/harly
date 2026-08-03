export function buildEsignWebhookUrl(baseUrl: string, workspaceId: string): string {
  return `${baseUrl}?ws=${encodeURIComponent(workspaceId)}`;
}

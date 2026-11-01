import { handleMcpOptions, handleMcpRequest } from "@/lib/mcp/server/handler";

// The MCP endpoint authenticates in the route with an OAuth bearer token (see
// lib/mcp/server/handler.ts), so proxy.ts lists /mcp as a public path: an
// unauthenticated client must receive a real 401 challenge, never a redirect
// to the browser login page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(request: Request) {
  return handleMcpRequest(request);
}

// Stateless server: no event stream (GET) and no sessions (DELETE). Both answer
// 405 after the same origin checks.
export function GET(request: Request) {
  return handleMcpRequest(request);
}

export function DELETE(request: Request) {
  return handleMcpRequest(request);
}

export function OPTIONS(request: Request) {
  return handleMcpOptions(request);
}

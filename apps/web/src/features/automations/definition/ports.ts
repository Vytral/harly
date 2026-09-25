import { PORTS } from "./limits";
import type { WorkflowNode } from "./schema-v2";

/** One contract for editor handles, compiler validation and runtime resolutions. */
export function outputPorts(node: WorkflowNode): readonly string[] {
  if (node.type === "action") return node.failurePolicy === "route_error" ? PORTS.action : ["success"];
  if (node.type === "wait") return node.kind === "document_package"
    ? ["completed", "declined", "cancelled", "expired"]
    : ["matched", "expired"];
  return PORTS[node.type];
}

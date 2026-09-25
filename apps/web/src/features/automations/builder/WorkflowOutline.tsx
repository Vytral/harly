"use client";

import { useMemo, useState } from "react";

import { SearchIcon } from "@/components/ui/icons/phosphor";
import { cn } from "@/lib/utils";

import { NODE_KIND_LABEL, getNodeVisualMeta, nodeTitle } from "./node-copy";
import type { WorkflowGraphV2 } from "../definition/schema-v2";

export function outlineOrder(graph: WorkflowGraphV2): string[] {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.source) ?? [];
    list.push(edge.target);
    adj.set(edge.source, list);
  }
  const seen = new Set<string>();
  const order: string[] = [];
  const stack = [graph.entryNodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    const next = adj.get(id) ?? [];
    for (let i = next.length - 1; i >= 0; i -= 1) stack.push(next[i]!);
  }
  for (const node of graph.nodes) {
    if (!seen.has(node.id)) order.push(node.id);
  }
  return order;
}

export function WorkflowOutline({
  graph,
  selectedId,
  onSelect,
}: {
  graph: WorkflowGraphV2;
  selectedId?: string;
  onSelect: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const nodes = useMemo(() => {
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const ordered = outlineOrder(graph)
      .map((id) => byId.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    const needle = query.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((node) =>
      `${nodeTitle(node)} ${NODE_KIND_LABEL[node.type]} ${node.type}`.toLowerCase().includes(needle),
    );
  }, [graph, query]);

  return (
    <div className="flex min-h-0 flex-col border-t border-hairline-c bg-warm-paper">
      <div className="px-3 pt-2.5">
        <p className="type-col-head uppercase">Steps</p>
        <label className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-pure-snow px-2.5 py-1.5">
          <SearchIcon className="size-3.5 text-soft-ink" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a step"
            className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-soft-ink"
            aria-label="Find a step"
          />
        </label>
      </div>
      <ol className="min-h-0 max-h-44 space-y-0.5 overflow-y-auto px-2 py-2">
        {nodes.map((node) => {
          const meta = getNodeVisualMeta(node);
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left",
                  selectedId === node.id ? "bg-soft-kraft" : "hover:bg-soft-kraft/50",
                )}
              >
                <span
                  className={cn(
                    "font-chrome inline-block rounded-full px-1.5 py-0.5 text-[11px] uppercase tracking-wider",
                    meta.badgeClass,
                  )}
                >
                  {NODE_KIND_LABEL[node.type]}
                </span>
                <span className="block truncate text-xs font-medium text-foreground">{nodeTitle(node)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

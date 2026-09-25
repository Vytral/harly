"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { getNodeVisualMeta, nodeCaption, nodeTitle } from "../node-visuals";
import { sourcePorts } from "../state/commands";
import type { CanvasNodeData } from "../state/graph-to-flow";

export function WorkflowCanvasNode({ data, selected }: NodeProps<Node<CanvasNodeData, "harly">>) {
  const node = data.node;
  const ports = sourcePorts(node);
  const isDropTarget = data.isDropTarget === true;
  const isNew = data.isNew === true;
  const { kindLabel, badgeClass, iconBgClass, Icon } = getNodeVisualMeta(node);
  const caption = nodeCaption(node);
  const title = nodeTitle(node);
  const hasCustomTitle = Boolean(node.name?.trim() && node.name.trim() !== caption);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={isNew ? (reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }) : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative flex min-h-[92px] w-[240px] flex-col justify-between rounded-2xl border bg-pure-snow p-3.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-150 ease-out hover:shadow-md",
        selected
          ? "border-foreground ring-2 ring-chartreuse-signal shadow-md"
          : "border-border hover:border-foreground/40",
        isDropTarget && "border-chartreuse-signal bg-chartreuse-signal/5 ring-2 ring-chartreuse-signal/40",
      )}
    >
      {node.type !== "trigger" ? (
        <Handle
          type="target"
          id="in"
          position={Position.Top}
          aria-label={`Input for ${kindLabel}`}
          className="!size-3 !-top-1.5 !border-2 !border-pure-snow !bg-foreground shadow-xs transition-transform hover:!scale-125"
        />
      ) : null}

      <div>
        {/* Header with icon and badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-lg shadow-xs",
                iconBgClass,
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span
              className={cn(
                "font-chrome rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                badgeClass,
              )}
            >
              {kindLabel}
            </span>
          </div>
        </div>

        {/* Title */}
        <p
          title={title}
          className="mt-2 truncate font-display text-xs font-semibold leading-tight text-foreground"
        >
          {title}
        </p>

        {/* Caption/Subtitle: Natural language description */}
        <p
          title={caption}
          className={cn(
            "mt-1 line-clamp-2 text-[11px] leading-relaxed text-soft-ink",
            !hasCustomTitle && "font-normal",
          )}
        >
          {caption}
        </p>
      </div>

      {/* Output ports */}
      {ports.map((port, index) => (
        <Handle
          key={port}
          type="source"
          id={port}
          position={Position.Bottom}
          aria-label={`${kindLabel} ${port} output`}
          style={{ left: `${((index + 1) / (ports.length + 1)) * 100}%` }}
          className="!size-3 !-bottom-1.5 !border-2 !border-pure-snow !bg-foreground shadow-xs transition-transform hover:!scale-125"
        />
      ))}

      {ports.length > 1 ? (
        <div className="font-chrome mt-3 flex justify-around border-t border-hairline-c pt-2 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
          {ports.map((port) => (
            <span
              key={port}
              className={cn(
                "rounded-md px-1.5 py-0.5 transition-colors",
                port.toLowerCase() === "true" || port.toLowerCase() === "success"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : port.toLowerCase() === "false" || port.toLowerCase() === "failure"
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                    : "bg-soft-kraft text-soft-ink",
              )}
            >
              {port}
            </span>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}

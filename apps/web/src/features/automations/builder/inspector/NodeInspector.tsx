"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { toast } from "@/lib/notification-island/toast";

import { patchTriggerFilter, WORKFLOW_EVENTS, type WorkflowEvent } from "../../schema";
import type { Binding, WorkflowNode } from "../../definition/schema-v2";
import { cn } from "@/lib/utils";
import { ConditionPanel } from "../ConditionPanel";
import { actionMeta, pickableActions, triggerMeta, type ConfigField } from "../catalog";
import { NODE_KIND_LABEL, getNodeVisualMeta, nodeCaption, nodeTitle } from "../node-copy";
import { explainConnect, sourcePorts } from "../state/commands";
import type { EditorState } from "../state/editor-reducer";
import { asLiteral, literalValue } from "./bindings";
import { BindingPicker } from "./BindingPicker";
import { BuilderSelect } from "./BuilderSelect";
import { ScopedSearchSelect } from "./ScopedSearchSelect";
import { useDebouncedCommit } from "./use-debounced-commit";
import { builderFieldClass } from "../field-styles";
import { DocumentItemsEditor } from "../DocumentItemsEditor";
import { DocumentAttachmentsEditor } from "../DocumentAttachmentsEditor";
import { SignatureRecipientsEditor } from "../SignatureRecipientsEditor";
import { TEMPLATE_VARIABLES } from "@/features/email-templates/interpolate";
import type { WorkflowDocumentTemplateSnapshot } from "@/features/document-templates/shared";
import { formatDateTimeLocal } from "./datetime";
import {
  createWorkflowWebhookEndpointAction,
  toggleWorkflowWebhookEndpointAction,
  updateWorkflowWebhookEndpointPayloadSchemaAction,
} from "../../actions";
import { WebhookSchemaEditor } from "./WebhookSchemaEditor";

export type InspectorBuilderData = {
  toolManifests: {
    type: import("../../schema").ActionType;
    version: number;
  }[];
  members: { id: string; name: string; email?: string }[];
  stageNames: string[];
  stages?: { id: string; name: string; jobId: string }[];
  jobs: { id: string; title: string }[];
  emailTemplates: { id: string; name: string; subject: string; type: string }[];
  documentTemplates: WorkflowDocumentTemplateSnapshot[];
  documents: { id: string; name: string; mimeType: string }[];
  attachmentDocuments: { id: string; name: string; mimeType: string; checksum: string }[];
  interviews: { id: string; label: string; hint?: string }[];
  tags: string[];
  webhookEndpoints: {
    id: string;
    name: string;
    enabled: boolean;
    lastReceivedAt: string | null;
    payloadSchema: Record<string, unknown>;
  }[];
  defaultTimeZone: string;
};

const inputClass = builderFieldClass();

export function NodeInspector({
  state,
  workflowId,
  builderData,
  onChangeNode,
  onConnect,
  onDisconnect,
  onSelectNode,
  onClose,
}: {
  state: EditorState;
  workflowId?: string;
  builderData: InspectorBuilderData;
  onChangeNode: (node: WorkflowNode) => void;
  onConnect: (source: string, port: string, target: string) => void;
  onDisconnect: (edgeId: string) => void;
  onSelectNode?: (nodeId: string | null) => void;
  onClose?: () => void;
}) {
  const selectedId = state.selection.nodeIds[0];
  const node = state.graph.nodes.find((item) => item.id === selectedId);
  const reduceMotion = useReducedMotion();
  const contentTransition = reduceMotion
    ? { duration: 0.12, ease: "linear" as const }
    : { duration: 0.15, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!node ? (
        <motion.div
          key="empty"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
          transition={contentTransition}
          className="flex h-full min-h-0 w-full flex-col"
        >
          <InspectorEmptyState state={state} onSelectNode={onSelectNode} />
        </motion.div>
      ) : (
        <motion.div
          key={node.id}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
          transition={contentTransition}
          className="flex h-full min-h-0 w-full flex-col"
        >
          <InspectorForm
            node={node}
            state={state}
            workflowId={workflowId}
            builderData={builderData}
            onChangeNode={onChangeNode}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onClose={onClose ?? (() => onSelectNode?.(null))}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InspectorEmptyState({
  state,
  onSelectNode,
}: {
  state: EditorState;
  onSelectNode?: (nodeId: string | null) => void;
}) {
  const nodes = state.graph.nodes;
  const edges = state.graph.edges;
  const triggerNode = nodes.find((n) => n.type === "trigger");

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-warm-paper">
      <div className="border-b border-hairline-c px-4 py-3">
        <p className="font-display text-sm font-semibold text-foreground">
          Workflow Overview
        </p>
        <p className="mt-0.5 text-[11px] text-soft-ink">
          {nodes.length} {nodes.length === 1 ? "step" : "steps"} · {edges.length}{" "}
          {edges.length === 1 ? "connection" : "connections"}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Trigger status card */}
        <div className="rounded-xl border border-border bg-pure-snow p-3 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
            Trigger
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {triggerNode ? triggerMeta(triggerNode.event).label : "No trigger selected"}
              </p>
              <p className="text-[11px] text-soft-ink truncate">
                {triggerNode ? nodeCaption(triggerNode) : "Choose what starts this automation"}
              </p>
            </div>
            {triggerNode && onSelectNode && (
              <button
                type="button"
                onClick={() => onSelectNode(triggerNode.id)}
                className="shrink-0 rounded-lg border border-border bg-warm-paper px-2 py-1 text-[11px] font-medium text-foreground hover:bg-soft-kraft transition-colors"
              >
                Configure
              </button>
            )}
          </div>
        </div>

        {/* Steps outline / navigator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Steps in sequence</p>
            <span className="text-[11px] text-soft-ink">Select to edit</span>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-pure-snow shadow-xs">
            {nodes.map((n, index) => {
              const meta = getNodeVisualMeta(n);
              const Icon = meta.Icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectNode?.(n.id)}
                  className="flex w-full items-center gap-2.5 p-2.5 text-left text-xs transition-colors hover:bg-soft-kraft/40"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-soft-kraft text-[10px] font-semibold text-soft-ink">
                    {index + 1}
                  </span>
                  <div
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md border border-border",
                      meta.iconBgClass,
                    )}
                  >
                    <Icon className="size-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">
                      {nodeTitle(n)}
                    </p>
                    <p className="truncate text-[10px] text-soft-ink">
                      {nodeCaption(n)}
                    </p>
                  </div>
                  <span className="text-soft-ink/60 text-xs">›</span>
                </button>
              );
            })}
          </div>
        </div>

        {nodes.length <= 1 && (
          <div className="rounded-xl border border-dashed border-border bg-pure-snow/60 p-3.5 text-center">
            <p className="text-xs font-medium text-foreground">Add your first action</p>
            <p className="mt-1 text-[11px] text-soft-ink leading-relaxed">
              Drag an action from the library on the left or click &quot;+&quot; on the canvas edge to build your automation.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function InspectorForm({
  node,
  state,
  workflowId,
  builderData,
  onChangeNode,
  onConnect,
  onDisconnect,
  onClose,
}: {
  node: WorkflowNode;
  state: EditorState;
  workflowId?: string;
  builderData: InspectorBuilderData;
  onChangeNode: (node: WorkflowNode) => void;
  onConnect: (source: string, port: string, target: string) => void;
  onDisconnect: (edgeId: string) => void;
  onClose?: () => void;
}) {
  const nodeRef = useRef(node);
  useEffect(() => {
    nodeRef.current = node;
  }, [node]);
  const commitName = useCallback(
    (name: string) => onChangeNode({ ...nodeRef.current, name: name.trim() || undefined }),
    [onChangeNode],
  );
  const nameField = useDebouncedCommit(node.name ?? "", commitName);
  const ports = sourcePorts(node);
  const targets = state.graph.nodes.filter((item) => item.id !== node.id && item.type !== "trigger");
  const meta = getNodeVisualMeta(node);
  const Icon = meta.Icon;

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-border bg-warm-paper">
      <div className="flex items-center justify-between border-b border-hairline-c px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border border-border shadow-xs",
              meta.iconBgClass,
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-display text-sm font-semibold text-foreground truncate">
                {NODE_KIND_LABEL[node.type]}
              </p>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] uppercase tracking-wider font-semibold",
                  meta.badgeClass,
                )}
              >
                {meta.kindLabel}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-soft-ink truncate">{nodeCaption(node)}</p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Deselect step"
            className="shrink-0 rounded-lg p-1 text-soft-ink hover:bg-soft-kraft hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Step name</span>
          <input
            value={nameField.value}
            onChange={(event) => nameField.setValue(event.target.value)}
            onBlur={nameField.flush}
            className={inputClass}
            placeholder="Optional label"
          />
        </label>

        {node.type === "trigger" ? (
          <TriggerFields node={node} workflowId={workflowId} builderData={builderData} onChangeNode={onChangeNode} />
        ) : null}
        {node.type === "action" ? (
          <ActionFields
            node={node}
            graph={state.graph}
            builderData={builderData}
            onChangeNode={onChangeNode}
          />
        ) : null}
        {node.type === "condition" ? (
          <ConditionPanel
            value={node.tree ?? []}
            onChange={(tree) => onChangeNode({ ...node, tree })}
            stageNames={builderData.stageNames}
            jobs={builderData.jobs}
            tags={builderData.tags}
          />
        ) : null}
        {node.type === "delay" ? <DelayFields node={node} defaultTimeZone={builderData.defaultTimeZone} onChangeNode={onChangeNode} /> : null}
        {node.type === "approval" ? (
          <ApprovalFields node={node} builderData={builderData} onChangeNode={onChangeNode} />
        ) : null}
        {node.type === "wait" ? (
          <WaitFields node={node} graph={state.graph} onChangeNode={onChangeNode} />
        ) : null}
        {node.type === "end" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Result</span>
            <BuilderSelect
              value={node.result}
              onChange={(event) =>
                onChangeNode({ ...node, result: event.target.value as "completed" | "stopped" })
              }
              className={inputClass}
            >
              <option value="completed">Completed</option>
              <option value="stopped">Stopped</option>
            </BuilderSelect>
          </label>
        ) : null}

        {ports.length > 0 ? (
          <div className="border-t border-hairline-c pt-3">
            <p className="mb-2 text-xs font-medium text-foreground">Next steps</p>
            <div className="space-y-2">
              {ports.map((port) => {
                const connectedEdge = state.graph.edges.find(
                  (edge) => edge.source === node.id && edge.port === port,
                );
                const connectedTarget = connectedEdge
                  ? state.graph.nodes.find((n) => n.id === connectedEdge.target)
                  : null;

                if (connectedTarget && connectedEdge) {
                  return (
                    <div
                      key={port}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-pure-snow p-2.5 shadow-2xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-chrome rounded-md bg-soft-kraft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-soft-ink">
                          {port}
                        </span>
                        <ArrowRight className="size-3 text-soft-ink shrink-0" />
                        <span className="truncate text-xs font-medium text-foreground">
                          {connectedTarget.name ?? nodeCaption(connectedTarget)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDisconnect(connectedEdge.id)}
                        className="rounded-md p-1 text-soft-ink transition-colors hover:bg-danger-rust/10 hover:text-danger-rust"
                        title={`Disconnect ${port} output`}
                        aria-label={`Disconnect ${port} output`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <label key={port} className="block">
                    <span className="mb-1 block text-[11px] font-medium text-soft-ink">
                      Connect <span className="font-semibold text-foreground">{port}</span> to:
                    </span>
                    <BuilderSelect
                      value=""
                      onChange={(event) => {
                        const target = event.target.value;
                        if (target) onConnect(node.id, port, target);
                      }}
                      className={inputClass}
                    >
                      <option value="">Choose next step…</option>
                      {targets.map((target) => {
                        const blocked = explainConnect(state.graph, node.id, port, target.id);
                        return (
                          <option key={target.id} value={target.id} disabled={Boolean(blocked)}>
                            {target.name ?? nodeCaption(target)}
                            {blocked ? ` — ${blocked}` : ""}
                          </option>
                        );
                      })}
                    </BuilderSelect>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function TriggerFields({
  node,
  workflowId,
  builderData,
  onChangeNode,
}: {
  node: Extract<WorkflowNode, { type: "trigger" }>;
  workflowId?: string;
  builderData: InspectorBuilderData;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  const [createdEndpoints, setCreatedEndpoints] = useState<typeof builderData.webhookEndpoints>([]);
  const [endpointEnabledOverrides, setEndpointEnabledOverrides] = useState<Record<string, boolean>>({});
  const [endpointSchemaOverrides, setEndpointSchemaOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [endpointName, setEndpointName] = useState("Partner webhook");
  const [newSecret, setNewSecret] = useState<{ endpointUrl: string; secret: string } | null>(null);
  const [creating, startCreating] = useTransition();
  const jobId = typeof node.filter?.jobId === "string" ? node.filter.jobId : "";
  const stageId = typeof node.filter?.toStageId === "string" ? node.filter.toStageId : "";
  const stageName = typeof node.filter?.toStageName === "string" ? node.filter.toStageName : "";
  const endpointId = typeof node.filter?.endpointId === "string" ? node.filter.endpointId : "";
  const jobStages = jobId
    ? (builderData.stages ?? []).filter((stage) => stage.jobId === jobId)
    : [];
  const showStage = node.event === "application.stage_changed";
  const showWebhook = node.event === "webhook.received";

  const endpoints = [
    ...builderData.webhookEndpoints,
    ...createdEndpoints.filter((created) => !builderData.webhookEndpoints.some((endpoint) => endpoint.id === created.id)),
  ].map((endpoint) => ({
    ...endpoint,
    enabled: endpointEnabledOverrides[endpoint.id] ?? endpoint.enabled,
    payloadSchema: endpointSchemaOverrides[endpoint.id] ?? endpoint.payloadSchema,
  }));
  const selectedEndpoint = endpoints.find((endpoint) => endpoint.id === endpointId);

  const createEndpoint = (payloadSchema: Record<string, unknown>) => {
    if (!workflowId) {
      toast.error("Save the workflow before creating an inbound endpoint.");
      return;
    }
    startCreating(async () => {
      const result = await createWorkflowWebhookEndpointAction({
        workflowId,
        name: endpointName,
        payloadSchema,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreatedEndpoints((current) => [
        ...current,
        {
          id: result.endpoint.id,
          name: result.endpoint.name,
          enabled: result.endpoint.enabled,
          lastReceivedAt: result.endpoint.lastReceivedAt,
          payloadSchema: result.endpoint.payloadSchema,
        },
      ]);
      onChangeNode({
        ...node,
        filter: patchTriggerFilter(node.filter, { endpointId: result.endpoint.id }),
      });
      if (!result.endpointUrl) {
        toast.error("The endpoint was created, but its URL could not be returned. Refresh before using it.");
        return;
      }
      setNewSecret({ endpointUrl: result.endpointUrl, secret: result.secret });
      setEndpointName("");
      toast.success("Inbound endpoint created. Copy its secret now.");
    });
  };

  const saveEndpointSchema = (payloadSchema: Record<string, unknown>) => {
    if (!selectedEndpoint) {
      createEndpoint(payloadSchema);
      return;
    }
    startCreating(async () => {
      const result = await updateWorkflowWebhookEndpointPayloadSchemaAction({
        endpointId: selectedEndpoint.id,
        payloadSchema,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEndpointSchemaOverrides((current) => ({ ...current, [selectedEndpoint.id]: payloadSchema }));
      toast.success("Webhook payload schema saved.");
    });
  };

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy the ${label.toLowerCase()}.`);
    }
  };

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">When</span>
        <BuilderSelect
          value={node.event}
          onChange={(event) =>
            onChangeNode({
              ...node,
              event: event.target.value as WorkflowEvent,
              filter: event.target.value === node.event ? node.filter : undefined,
            })
          }
          className={inputClass}
        >
          {WORKFLOW_EVENTS.map((event) => (
            <option key={event} value={event}>
              {triggerMeta(event).label}
            </option>
          ))}
        </BuilderSelect>
      </label>
      <div>
        <span className="mb-1 block text-xs font-medium text-foreground">Only this job</span>
        <ScopedSearchSelect
          kind="jobs"
          value={jobId}
          placeholder="Any job"
          emptyLabel="Any job"
          initialItems={builderData.jobs.map((job) => ({ id: job.id, label: job.title }))}
          onChange={(id) =>
            onChangeNode({
              ...node,
              filter: patchTriggerFilter(node.filter, { jobId: id, toStageId: "", toStageName: "" }),
            })
          }
        />
      </div>
      {showStage ? (
        <div>
          <span className="mb-1 block text-xs font-medium text-foreground">When they reach</span>
          <ScopedSearchSelect
            kind="stages"
            value={jobId ? stageId : stageName}
            jobId={jobId || undefined}
            placeholder="Any stage"
            emptyLabel="Any stage"
            initialItems={
              jobId
                ? jobStages.map((stage) => ({ id: stage.id, label: stage.name }))
                : builderData.stageNames.map((name) => ({ id: name, label: name }))
            }
            onChange={(id, item) => {
              const stage = jobStages.find((entry) => entry.id === id);
              onChangeNode({
                ...node,
                filter: patchTriggerFilter(node.filter, {
                  toStageId: jobId ? id : "",
                  toStageName: stage?.name ?? item?.label ?? id,
                  stageName: "",
                }),
              });
            }}
          />
        </div>
      ) : null}
      {showWebhook ? (
        <div className="space-y-3 rounded-xl border border-border bg-pure-snow p-3">
          <div>
            <p className="text-xs font-medium text-foreground">Inbound endpoint</p>
            <p className="mt-1 text-[11px] leading-4 text-soft-ink">
              Harly authenticates each signed JSON request and checks its payload schema before starting this automation.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-foreground">Endpoint</span>
            <BuilderSelect
              value={endpointId}
              onChange={(event) =>
                onChangeNode({
                  ...node,
                  filter: patchTriggerFilter(node.filter, { endpointId: event.target.value }),
                })
              }
              className={inputClass}
            >
              <option value="">Choose an endpoint</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={endpoint.id}>
                  {endpoint.name}{endpoint.enabled ? "" : " — disabled"}
                </option>
              ))}
            </BuilderSelect>
          </label>
          {selectedEndpoint && !selectedEndpoint.enabled ? (
            <button
              type="button"
              className="text-[11px] font-medium text-foreground underline underline-offset-2"
              onClick={() => {
                startCreating(async () => {
                  const result = await toggleWorkflowWebhookEndpointAction({ endpointId: selectedEndpoint.id, enabled: true });
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  setEndpointEnabledOverrides((current) => ({ ...current, [selectedEndpoint.id]: true }));
                  toast.success("Inbound endpoint enabled.");
                });
              }}
              disabled={creating}
            >
              Enable this endpoint
            </button>
          ) : null}
          {selectedEndpoint ? (
            <div className="border-t border-border pt-3">
              <WebhookSchemaEditor
                key={`endpoint:${selectedEndpoint.id}`}
                schema={selectedEndpoint.payloadSchema}
                onSave={saveEndpointSchema}
                disabled={creating}
                saveLabel="Save payload schema"
                showSavedStatus
              />
            </div>
          ) : null}
          <div className="border-t border-border pt-3">
            <p className="text-[11px] font-medium text-foreground">Create endpoint</p>
            <p className="mt-1 text-[11px] leading-4 text-soft-ink">
              The signing secret is shown once. Store it in the sending system before closing this panel.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={endpointName}
                onChange={(event) => setEndpointName(event.target.value)}
                className={inputClass}
                placeholder="e.g. Greenhouse events"
                maxLength={120}
                disabled={creating}
              />
            </div>
            <div className="mt-3">
              <WebhookSchemaEditor
                key={`new:${workflowId ?? "unsaved"}:${createdEndpoints.length}`}
                schema={{}}
                onSave={createEndpoint}
                disabled={creating || !endpointName.trim() || !workflowId}
                saveLabel={creating ? "Creating endpoint…" : "Create endpoint"}
              />
            </div>
            {!workflowId ? (
              <p className="mt-2 text-[11px] text-danger-rust">Save this workflow to create its first endpoint.</p>
            ) : null}
          </div>
          {newSecret ? (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
              <p className="text-[11px] font-semibold text-foreground">Save this secret now</p>
              <p className="text-[11px] leading-4 text-soft-ink">It will not be displayed again.</p>
              <SecretRow label="URL" value={newSecret.endpointUrl} onCopy={() => void copyValue(newSecret.endpointUrl, "Endpoint URL")} />
              <SecretRow label="Secret" value={newSecret.secret} onCopy={() => void copyValue(newSecret.secret, "Secret")} />
              <button
                type="button"
                className="text-[11px] font-medium text-foreground underline underline-offset-2"
                onClick={() => setNewSecret(null)}
              >
                I saved it — hide secret
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SecretRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-chrome text-[11px] uppercase tracking-wide text-soft-ink">{label}</span>
        <button type="button" className="text-[10px] font-medium text-foreground underline underline-offset-2" onClick={onCopy}>
          Copy
        </button>
      </div>
      <code className="block max-h-16 overflow-auto rounded border border-border bg-warm-paper px-2 py-1.5 text-[10px] leading-4 text-foreground">
        {value}
      </code>
    </div>
  );
}

function ActionFields({
  node,
  graph,
  builderData,
  onChangeNode,
}: {
  node: Extract<WorkflowNode, { type: "action" }>;
  graph: EditorState["graph"];
  builderData: InspectorBuilderData;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  const meta = actionMeta(node.actionType);
  const availableActions = pickableActions(builderData.toolManifests);
  const reusableTemplateSelected = node.actionType === "generate_document" &&
    typeof literalValue(node.input?.templateId) === "string" &&
    Boolean(literalValue(node.input?.templateId));
  const setInput = (key: string, binding: Binding | undefined, clearKeys: string[] = []) => {
    const input = { ...(node.input ?? {}) };
    if (!binding) delete input[key];
    else input[key] = binding;
    for (const clearKey of clearKeys) delete input[clearKey];
    onChangeNode({ ...node, input });
  };
  const setActionField = (field: ConfigField, binding: Binding | undefined) => {
    if (node.actionType === "schedule_interview" && field.key === "mode" && binding?.kind === "literal" && binding.value !== "video") {
      onChangeNode({
        ...node,
        input: {
          ...(node.input ?? {}),
          mode: binding,
          meetingProvider: asLiteral("auto"),
        },
      });
      return;
    }
    const clearKeys = node.actionType === "send_document_for_signature"
      ? field.key === "documentId"
        ? ["documentRequestId"]
        : field.key === "documentRequestId"
          ? ["documentId"]
          : []
      : [];
    if (node.actionType === "generate_document" && field.key === "templateId") {
      const input = { ...(node.input ?? {}) };
      if (!binding) {
        delete input.templateId;
        delete input.templateSnapshot;
      } else {
        input.templateId = binding;
        const templateId = literalValue(binding);
        const template = typeof templateId === "string"
          ? builderData.documentTemplates.find((item) => item.id === templateId)
          : undefined;
        if (template) {
          input.templateSnapshot = asLiteral({
            id: template.id,
            name: template.name,
            title: template.title,
            body: template.body,
            format: template.format,
          });
        } else {
          delete input.templateSnapshot;
        }
      }
      onChangeNode({ ...node, input });
      return;
    }
    setInput(field.key, binding, clearKeys);
  };

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Action</span>
        <BuilderSelect
          value={node.actionType}
          onChange={(event) => {
            const actionType = event.target.value as typeof node.actionType;
            onChangeNode({
              ...node,
              actionType,
              toolVersion: availableActions.find(
                (action) => action.type === actionType,
              )?.toolVersion ?? node.toolVersion,
              input: {},
            });
          }}
          className={inputClass}
        >
          {availableActions.map((action) => (
            <option key={action.type} value={action.type}>
              {action.label}
            </option>
          ))}
        </BuilderSelect>
      </label>
      {meta?.config
        .filter((field) => !(reusableTemplateSelected && (field.key === "title" || field.key === "body")))
        .filter((field) => !(node.actionType === "schedule_interview" && field.key === "meetingProvider" && literalValue(node.input?.mode) !== undefined && literalValue(node.input?.mode) !== "video"))
        .map((field) => (
        <ConfigFieldEditor
          key={field.key}
          field={field}
          binding={node.input?.[field.key]}
          graph={graph}
          nodeId={node.id}
          builderData={builderData}
            onChange={(binding) => setActionField(field, binding)}
        />
      ))}
      {reusableTemplateSelected ? (
        <p className="text-[11px] text-soft-ink">
          This step uses the selected template snapshot. Clear the template to write custom document content instead.
        </p>
      ) : null}
      {node.actionType === "schedule_interview" ? (
        <p className="text-[11px] text-soft-ink">
          Automatic selection uses the workspace&apos;s connected provider. A specific provider must be connected; external meetings need a full URL in Location. Harly creates one video meeting per interview.
        </p>
      ) : null}
      {(node.actionType === "send_email" ||
        node.actionType === "send_slack" ||
        node.actionType === "add_note") && (
        <p className="text-[11px] text-soft-ink">
          Use data from the event or an earlier step. Missing values stay missing — they do not become blank text.
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">If this step fails</span>
        <BuilderSelect
          value={node.failurePolicy}
          onChange={(event) =>
            onChangeNode({
              ...node,
              failurePolicy: event.target.value as typeof node.failurePolicy,
            })
          }
          className={inputClass}
        >
          <option value="stop">Stop the automation</option>
          <option value="continue">Continue with a warning</option>
          <option value="route_error">Take the error path</option>
        </BuilderSelect>
      </label>
    </>
  );
}

function ConfigFieldEditor({
  field,
  binding,
  graph,
  nodeId,
  builderData,
  onChange,
}: {
  field: ConfigField;
  binding: Binding | undefined;
  graph: EditorState["graph"];
  nodeId: string;
  builderData: InspectorBuilderData;
  onChange: (binding: Binding | undefined) => void;
}) {
  const current = String(literalValue(binding) ?? "");
  const pickLiteral = (value: string) => onChange(value ? asLiteral(value) : undefined);

  if (field.kind === "stage") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        <ScopedSearchSelect
          kind="stages"
          value={usingData ? "" : current}
          placeholder="Select a stage"
          emptyLabel="Select a stage"
          allowEmpty={!field.required}
          initialItems={builderData.stageNames.map((name) => ({ id: name, label: name }))}
          onChange={(id, item) => pickLiteral(item?.label ?? id)}
          disabled={usingData}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "owner") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        <ScopedSearchSelect
          kind="members"
          value={usingData ? "" : current}
          placeholder="Assign to workflow owner"
          emptyLabel="Assign to workflow owner"
          initialItems={builderData.members.map((member) => ({
            id: member.id,
            label: member.name,
            hint: member.email,
          }))}
          onChange={(id) => pickLiteral(id)}
          disabled={usingData}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "email-template") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        {builderData.emailTemplates.length === 0 ? (
          <p className="text-[11px] text-soft-ink">
            No email templates in this workspace yet. Create one in settings, then pick it here.
          </p>
        ) : null}
        <ScopedSearchSelect
          kind="templates"
          value={usingData ? "" : current}
          placeholder="Choose an email template"
          emptyLabel="No template"
          initialItems={builderData.emailTemplates.map((template) => ({
            id: template.id,
            label: template.name,
            hint: template.type,
          }))}
          onChange={(id) => pickLiteral(id)}
          disabled={usingData}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "document-template") {
    return (
      <div>
        <FieldLabel field={field} />
        {builderData.documentTemplates.length === 0 ? (
          <p className="text-[11px] text-soft-ink">
            No document templates are available. Create one in Documents → Workflow templates, then return here.
          </p>
        ) : null}
        <BuilderSelect
          aria-label={field.label}
          value={current}
          onChange={(event) => {
            const template = builderData.documentTemplates.find((item) => item.id === event.target.value);
            if (!template) {
              onChange(undefined);
              return;
            }
            onChange(asLiteral(template.id));
          }}
          className={inputClass}
        >
          <option value="">Choose a document template</option>
          {builderData.documentTemplates.map((template) => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </BuilderSelect>
        <p className="mt-1 text-[11px] text-soft-ink">
          The selected content is snapshotted into this workflow step when chosen.
        </p>
      </div>
    );
  }
  if (field.kind === "document") {
    return (
      <div>
        <FieldLabel field={field} />
        {builderData.documents.length === 0 ? (
          <p className="text-[11px] text-soft-ink">
            No active PDF documents are available for signing in this workspace.
          </p>
        ) : null}
        <ScopedSearchSelect
          kind="documents"
          value={current}
          placeholder="Choose a PDF document"
          emptyLabel="No document"
          initialItems={builderData.documents.map((document) => ({
            id: document.id,
            label: document.name,
            hint: document.mimeType,
          }))}
          onChange={(id) => pickLiteral(id)}
          allowEmpty={!field.required}
        />
        <div className="mt-1.5">
          <BindingPicker
            graph={graph}
            nodeId={nodeId}
            value={binding}
            onChange={onChange}
            allowLiteral={false}
          />
        </div>
        <p className="mt-1 text-[11px] text-soft-ink">
          Choose an existing document or bind a documentId returned by a prior step.
        </p>
      </div>
    );
  }
  if (field.kind === "document-request") {
    return (
      <div>
        <FieldLabel field={field} />
        <BindingPicker
          graph={graph}
          nodeId={nodeId}
          value={binding}
          onChange={onChange}
          allowLiteral={false}
        />
        <p className="mt-1 text-[11px] text-soft-ink">
          Bind <code>primaryRequestId</code> from a previous Request documents step. The uploaded PDF is resolved only when the run reaches this node.
        </p>
      </div>
    );
  }
  if (field.kind === "interview") {
    return (
      <div>
        <FieldLabel field={field} />
        <ScopedSearchSelect
          kind="interviews"
          value={current}
          placeholder={field.placeholder ?? "Choose an interview"}
          emptyLabel="No interview"
          initialItems={builderData.interviews}
          onChange={(id) => pickLiteral(id)}
          allowEmpty={!field.required}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} allowLiteral={false} />
        </div>
        <p className="mt-1 text-[11px] text-soft-ink">
          Choose an upcoming interview or bind interview.id from the trigger.
        </p>
      </div>
    );
  }
  if (field.kind === "tag") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        <ScopedSearchSelect
          kind="tags"
          value={usingData ? "" : current}
          placeholder={field.placeholder ?? "Tag"}
          emptyLabel="Choose or type a tag"
          initialItems={builderData.tags.map((tag) => ({ id: tag, label: tag }))}
          onChange={(id, item) => pickLiteral(item?.label ?? id)}
          disabled={usingData}
        />
        <input
          value={current}
          onChange={(event) => pickLiteral(event.target.value)}
          maxLength={field.maxLength}
          placeholder="Or type a new tag"
          className={`${inputClass} mt-1.5`}
          disabled={usingData}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "due-offset") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    const num = typeof literalValue(binding) === "number" ? Number(literalValue(binding)) : Number(current) || 0;
    return (
      <div>
        <FieldLabel field={field} />
        <BuilderSelect aria-label={field.label} value={usingData ? "" : String(num)} onChange={(event) => onChange(asLiteral(Number(event.target.value)))} disabled={usingData} className={inputClass}>
          <option value="0">Same day</option>
          <option value="1">In 1 day</option>
          <option value="2">In 2 days</option>
          <option value="3">In 3 days</option>
          <option value="7">In 1 week</option>
          <option value="14">In 2 weeks</option>
        </BuilderSelect>
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "select") {
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        <BuilderSelect aria-label={field.label} value={usingData ? "" : current} onChange={(event) => pickLiteral(event.target.value)} disabled={usingData} className={inputClass}>
          <option value="">{field.placeholder ?? "Select…"}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </BuilderSelect>
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "datetime") {
    const raw = literalValue(binding);
    const usingData = binding?.kind !== undefined && binding.kind !== "literal";
    return (
      <div>
        <FieldLabel field={field} />
        <input
          aria-label={field.label}
          type="datetime-local"
          value={usingData ? "" : formatDateTimeLocal(raw)}
          disabled={usingData}
          required={field.required}
          onChange={(event) => onChange(event.target.value ? asLiteral(new Date(event.target.value).toISOString()) : field.required ? asLiteral("") : undefined)}
          className={inputClass}
        />
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "textarea" || field.kind === "text") {
    const appendVariable = (key: string) => {
      if (!key) return;
      const existing = typeof literalValue(binding) === "string" ? String(literalValue(binding)) : "";
      onChange(asLiteral(`${existing}{{${key}}}`));
    };
    return (
      <div>
        <FieldLabel field={field} />
        {field.kind === "textarea" ? (
          <textarea
            aria-label={field.label}
            value={binding?.kind === "literal" ? String(binding.value ?? "") : ""}
            onChange={(event) => pickLiteral(event.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            rows={3}
            className={`${inputClass} min-h-[72px] resize-y py-2`}
            disabled={binding?.kind === "trigger" || binding?.kind === "output"}
          />
        ) : (
          <input
            aria-label={field.label}
            value={binding?.kind === "literal" ? String(binding.value ?? "") : ""}
            onChange={(event) => pickLiteral(event.target.value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            className={inputClass}
            disabled={binding?.kind === "trigger" || binding?.kind === "output"}
          />
        )}
        <select
          aria-label={`Insert variable into ${field.label}`}
          value=""
          disabled={Boolean(binding && binding.kind !== "literal")}
          onChange={(event) => appendVariable(event.target.value)}
          className="mt-1.5 h-8 w-full rounded-lg border border-border bg-pure-snow px-2 text-[11px] text-soft-ink outline-none focus:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Insert a workflow variable…</option>
          {Array.from(new Set(TEMPLATE_VARIABLES.map((variable) => variable.group))).map((group) => (
            <optgroup key={group} label={group}>
              {TEMPLATE_VARIABLES.filter((variable) => variable.group === group).map((variable) => (
                <option key={variable.key} value={variable.key}>
                  {variable.label} · {`{{${variable.key}}}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="mt-1.5">
          <BindingPicker graph={graph} nodeId={nodeId} value={binding} onChange={onChange} />
        </div>
      </div>
    );
  }
  if (field.kind === "document-list") {
    return (
      <div>
        <FieldLabel field={field} />
        <DocumentItemsEditor
          value={literalValue(binding)}
          onChange={(value) => onChange(asLiteral(value))}
        />
        <p className="mt-1 text-[11px] text-soft-ink">
          The candidate will see these requests in the portal. Add a document-package wait after this step to continue when they are accepted.
        </p>
      </div>
    );
  }
  if (field.kind === "document-attachments") {
    return (
      <div>
        <FieldLabel field={field} />
        <DocumentAttachmentsEditor
          value={literalValue(binding)}
          documents={builderData.attachmentDocuments}
          onChange={(value) => onChange(asLiteral(value))}
        />
        <p className="mt-1 text-[11px] text-soft-ink">
          Selected PDFs are appended in order and frozen by checksum when this workflow is published.
        </p>
      </div>
    );
  }
  if (field.kind === "recipient-list") {
    return (
      <div>
        <FieldLabel field={field} />
        <SignatureRecipientsEditor
          value={literalValue(binding)}
          onChange={(value) => onChange(value.length > 0 ? asLiteral(value) : undefined)}
        />
        <p className="mt-1 text-[11px] text-soft-ink">
          Leave empty to sign as the candidate. Add up to ten recipients for ordered signing; the next signer is invited only after the previous one completes.
        </p>
      </div>
    );
  }
  if (field.kind === "keyval") {
    return (
      <div>
        <FieldLabel field={field} />
        <textarea
          value={current}
          onChange={(event) => pickLiteral(event.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${inputClass} min-h-[60px] resize-y py-1.5 font-mono`}
        />
      </div>
    );
  }
  if (field.kind === "secret-refs") {
    const listed = Array.isArray(literalValue(binding))
      ? (literalValue(binding) as string[]).join(", ")
      : current;
    return (
      <div>
        <FieldLabel field={field} />
        <input
          value={listed}
          onChange={(event) =>
            onChange(
              asLiteral(
                event.target.value
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean),
              ),
            )
          }
          placeholder={field.placeholder}
          className={inputClass}
        />
        <p className="mt-1 text-[11px] text-soft-ink">Reference secret names, never paste the secret itself.</p>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel field={field} />
      <input value={current} onChange={(event) => pickLiteral(event.target.value)} className={inputClass} />
    </div>
  );
}

function FieldLabel({ field }: { field: ConfigField }) {
  return (
    <span className="mb-1 block text-xs font-medium text-foreground">
      {field.label}
      {"required" in field && field.required ? <span className="ml-0.5 text-danger-rust">*</span> : null}
    </span>
  );
}

function DelayFields({
  node,
  defaultTimeZone,
  onChangeNode,
}: {
  node: Extract<WorkflowNode, { type: "delay" }>;
  defaultTimeZone: string;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  const hours = Math.max(1, Math.round((node.durationMs ?? 86_400_000) / 3_600_000));
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Wait until</span>
        <BuilderSelect
          value={node.mode}
          onChange={(event) => {
            const mode = event.target.value as typeof node.mode;
            onChangeNode({
              ...node,
              mode,
              ...(mode === "next_local" && !node.timeZone ? { timeZone: defaultTimeZone } : {}),
            });
          }}
          className={inputClass}
        >
          <option value="duration">A duration from now</option>
          <option value="next_local">The next local time</option>
        </BuilderSelect>
      </label>
      {node.mode === "duration" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Hours</span>
          <input
            type="number"
            min={1}
            max={24 * 30}
            value={hours}
            onChange={(event) =>
              onChangeNode({ ...node, durationMs: Number(event.target.value) * 3_600_000 })
            }
            className={inputClass}
          />
        </label>
      ) : (
        <>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Local time</span>
            <input
              type="time"
              value={node.localTime ?? "09:00"}
              onChange={(event) => onChangeNode({
                ...node,
                localTime: event.target.value,
                ...(!node.timeZone ? { timeZone: defaultTimeZone } : {}),
              })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Time zone</span>
            <input
              value={node.timeZone ?? defaultTimeZone}
              onChange={(event) => onChangeNode({ ...node, timeZone: event.target.value })}
              placeholder="Workspace zone unless set"
              className={inputClass}
            />
          </label>
        </>
      )}
    </>
  );
}

function ApprovalFields({
  node,
  builderData,
  onChangeNode,
}: {
  node: Extract<WorkflowNode, { type: "approval" }>;
  builderData: InspectorBuilderData;
  onChangeNode: (node: WorkflowNode) => void;
}) {
  return (
    <>
      <div>
        <span className="mb-1 block text-xs font-medium text-foreground">Who can approve</span>
        <ScopedSearchSelect
          kind="members"
          value=""
          placeholder="Add a person"
          emptyLabel="Close"
          initialItems={builderData.members
            .filter((member) => !node.eligibleActorIds.includes(member.id))
            .map((member) => ({ id: member.id, label: member.name, hint: member.email }))}
          onChange={(id) => {
            if (!id || node.eligibleActorIds.includes(id)) return;
            onChangeNode({ ...node, eligibleActorIds: [...node.eligibleActorIds, id] });
          }}
        />
        <ul className="mt-2 space-y-1">
          {node.eligibleActorIds.length === 0 ? (
            <li className="text-[11px] text-soft-ink">Add at least one person before publishing.</li>
          ) : (
            node.eligibleActorIds.map((id) => {
              const member = builderData.members.find((item) => item.id === id);
              return (
                <li key={id} className="flex items-center justify-between text-xs">
                  <span>{member?.name ?? id}</span>
                  <button
                    type="button"
                    className="text-soft-ink hover:text-danger-rust"
                    onClick={() =>
                      onChangeNode({
                        ...node,
                        eligibleActorIds: node.eligibleActorIds.filter((item) => item !== id),
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Rule</span>
        <BuilderSelect
          value={node.rule}
          onChange={(event) => onChangeNode({ ...node, rule: event.target.value as typeof node.rule })}
          className={inputClass}
        >
          <option value="any">Anyone can approve</option>
          <option value="all">Everyone must approve</option>
        </BuilderSelect>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Deadline (hours)</span>
        <input
          type="number"
          min={1}
          max={24 * 30}
          value={node.deadlineHours ?? 48}
          onChange={(event) => onChangeNode({ ...node, deadlineHours: Number(event.target.value) })}
          className={inputClass}
        />
      </label>
    </>
  );
}

function WaitFields({
  node,
  graph,
  onChangeNode,
}: {
  node: Extract<WorkflowNode, { type: "wait" }>;
  graph: EditorState["graph"];
  onChangeNode: (node: WorkflowNode) => void;
}) {
  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Wait for</span>
        <BuilderSelect
          value={node.kind}
          onChange={(event) => {
            const kind = event.target.value as typeof node.kind;
            onChangeNode({
              ...node,
              kind,
              ...(kind === "document_package" && !node.resourceType ? { resourceType: "package" as const } : {}),
            });
          }}
          className={inputClass}
        >
          <option value="event">An event</option>
          <option value="document_package">A signed document package</option>
        </BuilderSelect>
      </label>
      {node.kind === "event" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Event name</span>
          <BuilderSelect
            value={node.eventName ?? ""}
            onChange={(event) => onChangeNode({ ...node, eventName: event.target.value || undefined })}
            className={inputClass}
          >
            <option value="">Choose an event</option>
            {node.eventName && !WORKFLOW_EVENTS.includes(node.eventName as WorkflowEvent) ? (
              <option value={node.eventName}>{node.eventName} (custom)</option>
            ) : null}
            {WORKFLOW_EVENTS.map((event) => (
              <option key={event} value={event}>
                {triggerMeta(event).label}
              </option>
            ))}
          </BuilderSelect>
        </label>
      ) : null}
      {node.kind === "document_package" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Completion resource</span>
          <BuilderSelect
            value={node.resourceType ?? "package"}
            onChange={(event) => onChangeNode({ ...node, resourceType: event.target.value as typeof node.resourceType })}
            className={inputClass}
          >
            <option value="package">All requested uploads accepted</option>
            <option value="document">Signature document completed</option>
          </BuilderSelect>
          <p className="mt-1 text-[11px] text-soft-ink">
            Choose package for portal uploads, or document for a signature step. Harly reconciles both after a restart.
          </p>
        </label>
      ) : null}
      <div>
        <span className="mb-1 block text-xs font-medium text-foreground">Resource</span>
        <BindingPicker
          graph={graph}
          nodeId={node.id}
          value={node.resourceId}
          onChange={(resourceId) => onChangeNode({ ...node, resourceId })}
          allowLiteral={false}
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Deadline (hours)</span>
        <input
          type="number"
          min={1}
          max={24 * 90}
          value={node.deadlineHours ?? 168}
          onChange={(event) => onChangeNode({ ...node, deadlineHours: Number(event.target.value) })}
          className={inputClass}
        />
      </label>
    </>
  );
}

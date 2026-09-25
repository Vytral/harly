import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Hand,
  Mail,
  OctagonX,
  Play,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import type { WorkflowNode } from "../definition/schema-v2";
import { actionMeta, triggerMeta } from "./catalog";
import { describeConditions } from "./preview";

export const NODE_KIND_LABEL: Record<WorkflowNode["type"], string> = {
  trigger: "Trigger",
  condition: "Condition",
  action: "Action",
  delay: "Wait",
  approval: "Approval",
  wait: "Wait for",
  end: "End",
};

export type NodeVisualMeta = {
  kindLabel: string;
  badgeClass: string;
  iconBgClass: string;
  Icon: ComponentType<{ className?: string }>;
};

export function getNodeVisualMeta(node: WorkflowNode): NodeVisualMeta {
  switch (node.type) {
    case "trigger": {
      // Trigger is the only "live signal" in the graph , chartreuse is
      // rationed for genuinely live things (DESIGN.md), and starting the
      // whole automation qualifies.
      return {
        kindLabel: "Trigger",
        badgeClass: "bg-chartreuse-signal/20 text-chartreuse-ink dark:bg-chartreuse-signal/25 dark:text-chartreuse-signal font-semibold",
        iconBgClass: "bg-chartreuse-signal/25 text-chartreuse-ink dark:bg-chartreuse-signal/30 dark:text-chartreuse-signal",
        Icon: Zap,
      };
    }
    case "condition":
      // A branch point , reuses the Badge "info" tone (status-quiet), the
      // same quiet blue-grey used for neutral/logical states elsewhere.
      return {
        kindLabel: "Condition",
        badgeClass: "bg-status-quiet text-status-quiet-ink font-medium",
        iconBgClass: "bg-status-quiet text-status-quiet-ink",
        Icon: Filter,
      };
    case "action": {
      const isEmail = node.actionType === "send_email";
      const isStage = node.actionType === "move_stage";
      // The most common step type , solid ink tag tone (Badge "tag"), so it
      // reads as the default/operative step without claiming the signal
      // colour.
      return {
        kindLabel: "Action",
        badgeClass: "bg-tag-solid text-pure-snow dark:text-warm-paper font-medium",
        iconBgClass: "bg-tag-solid text-pure-snow dark:text-warm-paper",
        Icon: isEmail ? Mail : isStage ? ArrowRight : Play,
      };
    }
    case "delay":
      // Waiting states share the Badge "warning" tone (warning-clay) , the
      // same "pause / not yet" signal used for paused jobs elsewhere.
      return {
        kindLabel: "Wait",
        badgeClass: "bg-warning-clay/10 text-warning-clay font-medium",
        iconBgClass: "bg-warning-clay/15 text-warning-clay",
        Icon: Clock,
      };
    case "approval":
      // Approval reuses the Badge "success" tone (sage-wash) , it is a human
      // confirmation gate, semantically closer to "sign-off" than to a wait.
      return {
        kindLabel: "Approval",
        badgeClass: "bg-sage-wash text-success-olive font-medium",
        iconBgClass: "bg-sage-wash text-success-olive",
        Icon: Hand,
      };
    case "wait":
      return {
        kindLabel: "Wait",
        badgeClass: "bg-warning-clay/10 text-warning-clay font-medium",
        iconBgClass: "bg-warning-clay/15 text-warning-clay",
        Icon: Clock,
      };
    case "end":
      // End reflects its own outcome rather than a fixed "end" tone: success
      // tone for a completed run, danger tone for a stopped one.
      return node.result === "stopped"
        ? {
            kindLabel: "End",
            badgeClass: "bg-danger-rust/10 text-danger-rust font-medium",
            iconBgClass: "bg-danger-rust/15 text-danger-rust",
            Icon: OctagonX,
          }
        : {
            kindLabel: "End",
            badgeClass: "bg-sage-wash text-success-olive font-medium",
            iconBgClass: "bg-sage-wash text-success-olive",
            Icon: CheckCircle2,
          };
  }
}

export function nodeCaption(node: WorkflowNode): string {
  switch (node.type) {
    case "trigger": {
      const meta = triggerMeta(node.event);
      if (node.filter && Object.keys(node.filter).length > 0) {
        return `${meta.label} · Filtered`;
      }
      return "All incoming events";
    }
    case "condition": {
      if (!node.tree || node.tree.length === 0) return "Add rules to split paths";
      const desc = describeConditions(node.tree);
      return desc === "always" ? "Always passes" : `If ${desc}`;
    }
    case "action": {
      if (node.actionType === "send_email") {
        const templateBinding = node.input?.templateId;
        const subjectBinding = node.input?.subject;
        if (templateBinding && templateBinding.kind === "literal" && templateBinding.value) {
          return "Using email template";
        }
        if (subjectBinding && subjectBinding.kind === "literal" && subjectBinding.value) {
          return `Subject: "${String(subjectBinding.value).slice(0, 24)}"`;
        }
        return "Choose template or write subject";
      }
      if (node.actionType === "move_stage") {
        const stageBinding = node.input?.toStageName ?? node.input?.toStageId;
        if (stageBinding && stageBinding.kind === "literal" && stageBinding.value) {
          return `To: ${String(stageBinding.value)}`;
        }
        return "Choose target stage";
      }
      if (node.actionType === "add_note") {
        const bodyBinding = node.input?.body;
        if (bodyBinding && bodyBinding.kind === "literal" && bodyBinding.value) {
          return `Note: "${String(bodyBinding.value).slice(0, 24)}"`;
        }
        return "Empty note";
      }
      if (node.actionType === "add_tag") {
        const tagBinding = node.input?.tag;
        if (tagBinding && tagBinding.kind === "literal" && tagBinding.value) {
          return `Tag: "${String(tagBinding.value)}"`;
        }
        return "Choose tag";
      }
      return actionMeta(node.actionType)?.blurb ?? "Configured action";
    }
    case "delay": {
      if (node.mode === "duration" && node.durationMs) {
        const hours = Math.round(node.durationMs / 3600000);
        if (hours >= 24) {
          const days = Math.round(hours / 24);
          return `Wait ${days} ${days === 1 ? "day" : "days"}`;
        }
        return `Wait ${hours} ${hours === 1 ? "hour" : "hours"}`;
      }
      if (node.mode === "next_local") {
        return "Wait until local business time";
      }
      return "Pause automation";
    }
    case "approval":
      return node.rule === "all" ? "Everyone must approve" : "Anyone can approve";
    case "wait":
      return node.kind === "document_package" ? "Wait for document upload" : "Wait for event";
    case "end":
      return node.result === "stopped" ? "Stop automation" : "Complete automation";
  }
}

export function nodeTitle(node: WorkflowNode): string {
  const name = node.name?.trim();
  if (name && name.length > 0) return name;
  switch (node.type) {
    case "trigger":
      return triggerMeta(node.event).label;
    case "condition":
      return "Condition rule";
    case "action":
      return actionMeta(node.actionType)?.label ?? node.actionType.replaceAll("_", " ");
    case "delay":
      return "Wait";
    case "approval":
      return "Approval";
    case "wait":
      return "Wait for event";
    case "end":
      return "End automation";
  }
}

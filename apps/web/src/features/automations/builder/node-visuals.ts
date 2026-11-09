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
import { actionMeta, triggerMeta, type BuilderT } from "./catalog";
import { describeConditions } from "./preview";

/** Translation keys (under `labels.automations`) for each node kind label. */
export const NODE_KIND_KEY: Record<WorkflowNode["type"], string> = {
  trigger: "nodes.kind.trigger",
  condition: "nodes.kind.condition",
  action: "nodes.kind.action",
  delay: "nodes.kind.wait",
  approval: "nodes.kind.approval",
  wait: "nodes.kind.waitFor",
  end: "nodes.kind.end",
};

export type NodeVisualMeta = {
  /** Translation key for the short kind badge. */
  kindKey: string;
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
        kindKey: "nodes.kind.trigger",
        badgeClass: "bg-chartreuse-signal/20 text-chartreuse-ink dark:bg-chartreuse-signal/25 dark:text-chartreuse-signal font-semibold",
        iconBgClass: "bg-chartreuse-signal/25 text-chartreuse-ink dark:bg-chartreuse-signal/30 dark:text-chartreuse-signal",
        Icon: Zap,
      };
    }
    case "condition":
      // A branch point , reuses the Badge "info" tone (status-quiet), the
      // same quiet blue-grey used for neutral/logical states elsewhere.
      return {
        kindKey: "nodes.kind.condition",
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
        kindKey: "nodes.kind.action",
        badgeClass: "bg-tag-solid text-pure-snow dark:text-warm-paper font-medium",
        iconBgClass: "bg-tag-solid text-pure-snow dark:text-warm-paper",
        Icon: isEmail ? Mail : isStage ? ArrowRight : Play,
      };
    }
    case "delay":
      // Waiting states share the Badge "warning" tone (warning-clay) , the
      // same "pause / not yet" signal used for paused jobs elsewhere.
      return {
        kindKey: "nodes.kind.wait",
        badgeClass: "bg-warning-clay/10 text-warning-clay font-medium",
        iconBgClass: "bg-warning-clay/15 text-warning-clay",
        Icon: Clock,
      };
    case "approval":
      // Approval reuses the Badge "success" tone (sage-wash) , it is a human
      // confirmation gate, semantically closer to "sign-off" than to a wait.
      return {
        kindKey: "nodes.kind.approval",
        badgeClass: "bg-sage-wash text-success-olive font-medium",
        iconBgClass: "bg-sage-wash text-success-olive",
        Icon: Hand,
      };
    case "wait":
      return {
        kindKey: "nodes.kind.wait",
        badgeClass: "bg-warning-clay/10 text-warning-clay font-medium",
        iconBgClass: "bg-warning-clay/15 text-warning-clay",
        Icon: Clock,
      };
    case "end":
      // End reflects its own outcome rather than a fixed "end" tone: success
      // tone for a completed run, danger tone for a stopped one.
      return node.result === "stopped"
        ? {
            kindKey: "nodes.kind.end",
            badgeClass: "bg-danger-rust/10 text-danger-rust font-medium",
            iconBgClass: "bg-danger-rust/15 text-danger-rust",
            Icon: OctagonX,
          }
        : {
            kindKey: "nodes.kind.end",
            badgeClass: "bg-sage-wash text-success-olive font-medium",
            iconBgClass: "bg-sage-wash text-success-olive",
            Icon: CheckCircle2,
          };
  }
}

export function nodeCaption(node: WorkflowNode, t: BuilderT): string {
  switch (node.type) {
    case "trigger": {
      const meta = triggerMeta(node.event, t);
      if (node.filter && Object.keys(node.filter).length > 0) {
        return t("nodes.caption.triggerFiltered", { trigger: meta.label });
      }
      return t("nodes.caption.allIncomingEvents");
    }
    case "condition": {
      if (!node.tree || node.tree.length === 0) return t("nodes.caption.addRules");
      const desc = describeConditions(node.tree, t);
      return desc === t("preview.always")
        ? t("nodes.caption.alwaysPasses")
        : t("nodes.caption.ifCondition", { condition: desc });
    }
    case "action": {
      if (node.actionType === "send_email") {
        const templateBinding = node.input?.templateId;
        const subjectBinding = node.input?.subject;
        if (templateBinding && templateBinding.kind === "literal" && templateBinding.value) {
          return t("nodes.caption.usingTemplate");
        }
        if (subjectBinding && subjectBinding.kind === "literal" && subjectBinding.value) {
          return t("nodes.caption.subjectLine", { subject: String(subjectBinding.value).slice(0, 24) });
        }
        return t("nodes.caption.chooseTemplateOrSubject");
      }
      if (node.actionType === "move_stage") {
        const stageBinding = node.input?.toStageName ?? node.input?.toStageId;
        if (stageBinding && stageBinding.kind === "literal" && stageBinding.value) {
          return t("nodes.caption.toStage", { stage: String(stageBinding.value) });
        }
        return t("nodes.caption.chooseStage");
      }
      if (node.actionType === "add_note") {
        const bodyBinding = node.input?.body;
        if (bodyBinding && bodyBinding.kind === "literal" && bodyBinding.value) {
          return t("nodes.caption.noteLine", { body: String(bodyBinding.value).slice(0, 24) });
        }
        return t("nodes.caption.emptyNote");
      }
      if (node.actionType === "add_tag") {
        const tagBinding = node.input?.tag;
        if (tagBinding && tagBinding.kind === "literal" && tagBinding.value) {
          return t("nodes.caption.tagLine", { tag: String(tagBinding.value) });
        }
        return t("nodes.caption.chooseTag");
      }
      return actionMeta(node.actionType, t)?.blurb ?? t("nodes.caption.configuredAction");
    }
    case "delay": {
      if (node.mode === "duration" && node.durationMs) {
        const hours = Math.round(node.durationMs / 3600000);
        if (hours >= 24) {
          const days = Math.round(hours / 24);
          return t("nodes.caption.waitDays", { days });
        }
        return t("nodes.caption.waitHours", { hours });
      }
      if (node.mode === "next_local") {
        return t("nodes.caption.waitUntilLocalBusinessTime");
      }
      return t("nodes.caption.pauseAutomation");
    }
    case "approval":
      return node.rule === "all"
        ? t("nodes.caption.everyoneMustApprove")
        : t("nodes.caption.anyoneCanApprove");
    case "wait":
      return node.kind === "document_package"
        ? t("nodes.caption.waitForDocumentUpload")
        : t("nodes.caption.waitForEvent");
    case "end":
      return node.result === "stopped"
        ? t("nodes.caption.stopAutomation")
        : t("nodes.caption.completeAutomation");
  }
}

export function nodeTitle(node: WorkflowNode, t: BuilderT): string {
  const name = node.name?.trim();
  if (name && name.length > 0) return name;
  switch (node.type) {
    case "trigger":
      return triggerMeta(node.event, t).label;
    case "condition":
      return t("nodes.title.condition");
    case "action":
      return actionMeta(node.actionType, t)?.label ?? node.actionType.replaceAll("_", " ");
    case "delay":
      return t("nodes.title.delay");
    case "approval":
      return t("nodes.title.approval");
    case "wait":
      return t("nodes.title.wait");
    case "end":
      return t("nodes.title.end");
  }
}

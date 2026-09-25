import {
  pickableActions,
  TRIGGER_CATALOG,
  type ActionMeta,
  type SafeAutomationToolManifest,
  type TriggerMeta,
} from "./catalog";
import { CONTROL_BLOCKS, type BlockKind } from "./state/blocks";

export type LibraryItem = {
  id: string;
  kind: BlockKind;
  actionType?: ActionMeta["type"];
  toolVersion?: number;
  event?: TriggerMeta["event"];
  group: string;
  label: string;
  blurb: string;
  keywords: string;
};

export function libraryItems(
  manifests?: readonly SafeAutomationToolManifest[],
): LibraryItem[] {
  const trigger: LibraryItem = {
    id: "trigger",
    kind: "trigger",
    group: "Start",
    label: "When",
    blurb: "The event that starts this automation.",
    keywords: TRIGGER_CATALOG.map((entry) => `${entry.label} ${entry.event}`).join(" "),
  };
  const control = CONTROL_BLOCKS.map((block) => ({
    id: block.kind,
    kind: block.kind,
    group: "Control",
    label: block.label,
    blurb: block.blurb,
    keywords: `${block.label} ${block.blurb} ${block.kind}`,
  }));
  const actions = pickableActions(manifests).map((action) => ({
    id: `action:${action.type}`,
    kind: "action" as const,
    actionType: action.type,
    toolVersion: action.toolVersion,
    group: action.group,
    label: action.label,
    blurb: action.blurb,
    keywords: `${action.label} ${action.blurb} ${action.type} ${action.group}`,
  }));
  return [trigger, ...control, ...actions];
}

export function filterLibraryItems(items: LibraryItem[], query: string): LibraryItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;

  type ScoredItem = { item: LibraryItem; score: number };
  const scored: ScoredItem[] = [];

  for (const item of items) {
    const label = item.label.toLowerCase();
    const kind = item.kind.toLowerCase();
    const actionType = (item.actionType ?? "").toLowerCase();
    const blurb = item.blurb.toLowerCase();
    const keywords = item.keywords.toLowerCase();
    const group = item.group.toLowerCase();

    let score = 0;

    // 1. Exact matches (highest priority)
    if (label === needle || kind === needle || actionType === needle) {
      score = 100;
    }
    // 2. Starts with / prefix matches
    else if (label.startsWith(needle) || kind.startsWith(needle) || actionType.startsWith(needle)) {
      score = 75;
    }
    // 3. Word boundary match in label (e.g. "email" matches "Send email")
    else if (new RegExp(`\\b${needle}`, "i").test(label)) {
      score = 60;
    }
    // 4. Substring in label
    else if (label.includes(needle)) {
      score = 40;
    }
    // 5. Keyword or group match
    else if (keywords.includes(needle) || group.includes(needle)) {
      score = 25;
    }
    // 6. Substring in blurb description
    else if (blurb.includes(needle)) {
      score = 10;
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort descending by score, then alphabetically
  return scored
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .map((s) => s.item);
}

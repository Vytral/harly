import type { EditorSnapshot } from "./commands";

export const HISTORY_LIMIT = 100;

export function pushSnapshot(past: EditorSnapshot[], snapshot: EditorSnapshot): EditorSnapshot[] {
  return [...past, snapshot].slice(-HISTORY_LIMIT);
}

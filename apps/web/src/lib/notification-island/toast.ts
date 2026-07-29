import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

import { dismissIsland, pushIsland, settleIsland } from "./store";

const AUTO_HIDE_MS = { success: 2400, error: 3600 } as const;

// One line, no description: the topbar pill has room for a short status phrase,
// not a paragraph. Anything longer falls back to a corner toast instead of
// truncating or breaking the layout.
const MAX_ISLAND_CHARS = 42;

type ToastOpts = { description?: string; [key: string]: unknown };
// Sonner accepts any ReactNode (including undefined/null results from `err?.message`);
// the island only ever accepts a short plain string, everything else falls back.
type ToastMessage = ReactNode;

function fitsIsland(message: ToastMessage, opts?: ToastOpts): message is string {
  return typeof message === "string" && !opts?.description && message.length <= MAX_ISLAND_CHARS;
}

/**
 * API-compatible subset of sonner's `toast`. success/error/loading/promise
 * route through the topbar island when the message is short enough;
 * everything else (long messages, descriptions, warning/info/message) falls
 * back to the normal sonner toast unchanged.
 */
export const toast = Object.assign(
  (message: ToastMessage, opts?: ToastOpts) => sonnerToast(message, opts),
  {
    success(message: ToastMessage, opts?: ToastOpts) {
      if (!fitsIsland(message, opts)) return sonnerToast.success(message, opts);
      return pushIsland("success", message, AUTO_HIDE_MS.success);
    },
    error(message: ToastMessage, opts?: ToastOpts) {
      if (!fitsIsland(message, opts)) return sonnerToast.error(message, opts);
      return pushIsland("error", message, AUTO_HIDE_MS.error);
    },
    loading(message: ToastMessage, opts?: ToastOpts) {
      if (!fitsIsland(message, opts)) return sonnerToast.loading(message, opts);
      return pushIsland("loading", message);
    },
    promise<T>(
      promise: Promise<T>,
      msgs: {
        loading: string;
        success: string | ((value: T) => string);
        error: string | ((error: unknown) => string);
      },
    ) {
      if (!fitsIsland(msgs.loading)) return sonnerToast.promise(promise, msgs);

      const id = pushIsland("loading", msgs.loading);
      void promise.then(
        (value) => {
          const text = typeof msgs.success === "function" ? msgs.success(value) : msgs.success;
          if (fitsIsland(text)) settleIsland(id, "success", text, AUTO_HIDE_MS.success);
          else {
            dismissIsland(id);
            sonnerToast.success(text);
          }
        },
        (error: unknown) => {
          const text = typeof msgs.error === "function" ? msgs.error(error) : msgs.error;
          if (fitsIsland(text)) settleIsland(id, "error", text, AUTO_HIDE_MS.error);
          else {
            dismissIsland(id);
            sonnerToast.error(text);
          }
        },
      );
      return id;
    },
    dismiss(id?: string) {
      dismissIsland(id);
      sonnerToast.dismiss(id);
    },
    warning: sonnerToast.warning,
    info: sonnerToast.info,
    message: sonnerToast.message,
  },
);

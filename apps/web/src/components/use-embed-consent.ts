"use client";

import { useSyncExternalStore } from "react";

import {
  embedsAllowed,
  subscribeCookiePreferences,
} from "@/lib/cookie-consent";

export function useEmbedConsent(): boolean {
  return useSyncExternalStore(
    subscribeCookiePreferences,
    embedsAllowed,
    () => false,
  );
}

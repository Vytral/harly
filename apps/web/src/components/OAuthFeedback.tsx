"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/lib/notification-island/toast";

/**
 * Reads ?gcal=connected or ?gcal_error=... from the URL after an OAuth
 * callback redirect and shows a toast. Cleans the params afterwards.
 */
export function OAuthFeedback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const feedbacks: Array<{ key: string; errorKey: string; label: string }> = [
      { key: "gcal", errorKey: "gcal_error", label: "Google Calendar" },
      { key: "slack", errorKey: "slack_error", label: "Slack" },
      { key: "outlook", errorKey: "outlook_error", label: "Microsoft Outlook" },
      { key: "zoom", errorKey: "zoom_error", label: "Zoom" },
    ];

    let dirty = false;
    for (const fb of feedbacks) {
      if (searchParams.get(fb.key) === "connected") {
        toast.success(`${fb.label} connected successfully!`);
        dirty = true;
      }
      const err = searchParams.get(fb.errorKey);
      if (err) {
        toast.error(`${fb.label} connection failed: ${err}`);
        dirty = true;
      }
    }

    if (dirty) {
      const url = new URL(window.location.href);
      for (const fb of feedbacks) {
        url.searchParams.delete(fb.key);
        url.searchParams.delete(fb.errorKey);
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  return null;
}

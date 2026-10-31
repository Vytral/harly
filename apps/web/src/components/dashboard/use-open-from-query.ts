"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Open state for a drawer/dialog that can also be opened by a deep link such
 * as `/dashboard/candidates?new=1` (the header's "+" menu uses these). The
 * flag is stripped from the URL right away so a refresh or back navigation
 * does not reopen it.
 */
export function useOpenFromQuery(param = "new") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = searchParams.get(param) === "1";
  const [open, setOpen] = useState(requested);
  const [seenRequest, setSeenRequest] = useState(requested);

  // A client-side navigation to `?new=1` while mounted: open during render
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setOpen(true);
  }

  useEffect(() => {
    if (!requested) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const query = next.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as never, { scroll: false });
  }, [requested, param, pathname, router, searchParams]);

  return [open, setOpen] as const;
}

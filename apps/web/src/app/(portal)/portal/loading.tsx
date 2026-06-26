'use client';

import { SpinnerIcon } from '@/components/ui/icons/phosphor';
import { TextShimmer } from '@/components/ui/text-shimmer';

export default function PortalLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <SpinnerIcon className="size-8 text-muted-foreground" />
      <TextShimmer
        className="text-sm"
        duration={2}
        spread={2}
      >
        Loading candidate portal...
      </TextShimmer>
    </div>
  );
}

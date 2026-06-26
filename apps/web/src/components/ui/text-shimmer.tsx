import React from 'react';
import { cn } from '@/lib/utils';

export type TextShimmerProps = {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
};

function TextShimmerComponent({
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = children.length * spread;

  return (
    <p
      className={cn(
        'relative inline-block bg-[length:250%_100%,auto] bg-clip-text',
        'text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]',
        '[background-repeat:no-repeat,padding-box]',
        'dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff]',
        'animate-shimmer',
        className
      )}
      style={
        {
          '--spread': `${dynamicSpread}px`,
          '--shimmer-duration': `${duration}s`,
          backgroundImage: `linear-gradient(90deg,#0000 calc(50% - var(--spread)),var(--base-gradient-color),#0000 calc(50% + var(--spread))), linear-gradient(var(--base-color), var(--base-color))`,
        } as React.CSSProperties
      }
    >
      {children}
    </p>
  );
}

export const TextShimmer = React.memo(TextShimmerComponent);

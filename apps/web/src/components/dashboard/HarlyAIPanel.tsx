"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const HarlyLogoMark = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 666 617"
    className={className}
    aria-hidden="true"
    style={{ fillRule: "evenodd" }}
  >
    <defs>
      <linearGradient
        id="harly-ai-grad"
        x1="-6.76692"
        y1="525.898"
        x2="-1.07519"
        y2="83.5598"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="rgb(249,18,247)" />
        <stop offset="0.0909091" stopColor="rgb(229,21,243)" />
        <stop offset="0.272727" stopColor="rgb(112,33,231)" />
        <stop offset="0.454545" stopColor="rgb(48,38,223)" />
        <stop offset="0.681818" stopColor="rgb(0,80,228)" />
        <stop offset="0.863636" stopColor="rgb(0,130,239)" />
        <stop offset="1" stopColor="rgb(0,204,255)" />
      </linearGradient>
    </defs>
    <path
      d="M 105.052 296.5 C 107.214 264.163, 113.849 239.422, 128.159 210.336 C 153.21 159.418, 197.415 119.505, 250.32 100.035 C 273.272 91.5881, 303.76 86.0157, 327.089 86.0035 C 337.333 85.9981, 364.28 88.8181, 375.428 91.0621 C 398.777 95.762, 429.905 108.861, 451.174 122.937 C 484.155 144.763, 512.489 177.447, 529.486 213.269 C 543.979 243.814, 551.032 275.177, 550.969 308.801 C 550.9 345.759, 544.423 373.979, 528.547 406.5 C 516.774 430.616, 506.254 445.641, 488.039 464.354 C 461.27 491.854, 433.487 509.368, 398.169 521.008 C 374.36 528.854, 360.648 531.144, 333.954 531.732 C 314.449 532.162, 309.423 531.941, 296.704 530.097 C 262.293 525.108, 231.357 513.369, 203.5 494.729 C 172.864 474.231, 144.475 442.082, 128.237 409.5 C 116.2 385.348, 106.853 351.518, 105.484 327.147 C 105.186 321.841, 104.801 315.25, 104.629 312.5 C 104.457 309.75, 104.648 302.55, 105.052 296.5 Z M 466.545 287.5 C 463.293 266.817, 456.544 249.612, 444.379 231 C 426.372 203.45, 395.939 182.053, 362.252 173.257 C 348.815 169.749, 348.065 169.666, 329.5 169.654 C 309.459 169.64, 299.774 171.017, 284 176.126 C 262.882 182.966, 236.77 200.252, 223 216.508 C 206.162 236.386, 198 251.923, 191.754 275.989 C 189.213 285.779, 188.691 289.968, 188.262 304.014 C 187.488 329.3, 191.235 349.164, 200.457 368.664 C 213.041 395.272, 231.048 414.801, 257.848 430.909 C 268.705 437.434, 278.362 441.354, 292.677 445.048 C 325.481 453.512, 358.621 450.24, 388.5 435.587 C 404.134 427.92, 415.147 420.222, 426.624 408.937 C 448.803 387.128, 460.778 363.749, 466.488 331.11 C 468.296 320.77, 468.325 298.826, 466.545 287.5 Z"
      fill="url(#harly-ai-grad)"
    />
  </svg>
);

const PhFunnel = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
    <path fill="currentColor" d="M230.6 49.53A15.81 15.81 0 0 0 216 40H40a16 16 0 0 0-11.81 26.76l.08.09L96 139.17V216a16 16 0 0 0 24.87 13.32l32-21.34a16 16 0 0 0 7.13-13.32v-55.49l67.74-72.32l.08-.09a15.8 15.8 0 0 0 2.78-17.23m-84.42 81.05A8 8 0 0 0 144 136v58.66L112 216v-80a8 8 0 0 0-2.16-5.47L40 56h176Z"/>
  </svg>
);

const PhEnvelope = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
    <path fill="currentColor" d="M224 48H32a8 8 0 0 0-8 8v136a16 16 0 0 0 16 16h176a16 16 0 0 0 16-16V56a8 8 0 0 0-8-8m-96 85.15L52.57 64h150.86ZM98.71 128L40 181.81V74.19Zm11.84 10.85l12 11.05a8 8 0 0 0 10.82 0l12-11.05l58 53.15H52.57ZM157.29 128L216 74.18v107.64Z"/>
  </svg>
);

const PhUserCheck = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
    <path fill="currentColor" d="M144 157.68a68 68 0 1 0-71.9 0c-20.65 6.76-39.23 19.39-54.17 37.17a8 8 0 0 0 12.25 10.3C50.25 181.19 77.91 168 108 168s57.75 13.19 77.87 37.15a8 8 0 0 0 12.25-10.3c-14.94-17.78-33.52-30.41-54.12-37.17M56 100a52 52 0 1 1 52 52a52.06 52.06 0 0 1-52-52m197.66 33.66l-32 32a8 8 0 0 1-11.32 0l-16-16a8 8 0 0 1 11.32-11.32L216 148.69l26.34-26.35a8 8 0 0 1 11.32 11.32"/>
  </svg>
);

const PhChartBar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" aria-hidden="true">
    <path fill="currentColor" d="M224 200h-8V40a8 8 0 0 0-8-8h-56a8 8 0 0 0-8 8v40H96a8 8 0 0 0-8 8v40H48a8 8 0 0 0-8 8v64h-8a8 8 0 0 0 0 16h192a8 8 0 0 0 0-16M160 48h40v152h-40Zm-56 48h40v104h-40Zm-48 48h32v56H56Z"/>
  </svg>
);

const QUICK_PROMPTS = [
  { icon: PhFunnel,    label: "Review pipeline",       color: "text-blue-500" },
  { icon: PhEnvelope,  label: "Draft rejection email", color: "text-pink-500" },
  { icon: PhUserCheck, label: "Score candidate",       color: "text-green-500" },
  { icon: PhChartBar,  label: "Hiring report",         color: "text-purple-500" },
];

type HarlyAIPanelProps = {
  userName: string;
  open: boolean;
  onClose: () => void;
};

export function HarlyAIPanel({ userName, open, onClose }: HarlyAIPanelProps) {
  const [input, setInput] = useState("");
  const firstName = userName.split(" ")[0] ?? userName;

  function handleSubmit() {
    if (!input.trim()) return;
    // TODO: wire to AI action
    setInput("");
  }

  return (
    <div
      className={cn(
        "fixed bottom-20 right-6 z-50 w-[440px] transition-all duration-200 ease-out",
        open
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-3 opacity-0 pointer-events-none",
      )}
    >
      <Card className="flex h-full flex-col gap-0 overflow-hidden border border-border/80 p-0 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <HarlyLogoMark className="size-5 shrink-0" />
            <span className="text-sm font-semibold tracking-tight">Harly AI</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            onClick={onClose}
            aria-label="Close Harly AI"
          >
            <X className="size-4" />
          </Button>
        </div>

        <CardContent className="flex flex-1 flex-col gap-8 p-6">
          {/* Greeting */}
          <div className="flex flex-col items-center gap-6 pt-4 text-center">
            {/* Animated logo — no border/container, just the animation */}
            <Image
              src="/harly-ai-animado.svg"
              alt="Harly AI"
              width={80}
              height={80}
              unoptimized
              priority
            />
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xl font-semibold tracking-tight">
                Hi {firstName} 👋
              </h2>
              <p className="text-sm text-muted-foreground">
                What can I help you with today?
              </p>
            </div>

            {/* Quick prompts — 4 max */}
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map(({ icon: Icon, label, color }) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="h-7 cursor-pointer gap-1.5 rounded-md px-2.5 text-xs transition-colors hover:bg-accent"
                  onClick={() => setInput(label)}
                >
                  <span className={cn("shrink-0", color)}>
                    <Icon />
                  </span>
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Input area */}
          <div className="mt-auto overflow-hidden rounded-xl ring-1 ring-border/80 transition-shadow focus-within:ring-ring/50">
            <div className="relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything about your hiring pipeline…"
                className="min-h-[100px] resize-none border-none bg-transparent py-3 pl-3.5 pr-12 text-sm shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                aria-label="Send"
                className={cn(
                  "absolute bottom-3 right-3 flex size-7 items-center justify-center rounded-md bg-foreground text-background transition-all duration-150 active:scale-95",
                  !input.trim() && "cursor-not-allowed opacity-30",
                )}
              >
                <ArrowUp className="size-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type HarlyAIButtonProps = {
  open: boolean;
  onClick: () => void;
};

export function HarlyAIButton({ open, onClick }: HarlyAIButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? "Close Harly AI" : "Open Harly AI"}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex size-12 items-center justify-center rounded-2xl shadow-lg ring-1 ring-border/60 transition-all duration-200 active:scale-95 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        open
          ? "bg-foreground text-background ring-foreground/20"
          : "bg-background hover:bg-accent",
      )}
    >
      {open ? (
        <X className="size-5" />
      ) : (
        <HarlyLogoMark className="size-7" />
      )}
    </button>
  );
}

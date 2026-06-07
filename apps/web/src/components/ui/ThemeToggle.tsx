"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Both icons render; the `.dark` class (set by next-themes before hydration)
  // reveals the right one via CSS — no mount guard, no hydration mismatch.
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="size-[18px] dark:hidden" strokeWidth={1.5} />
      <Moon className="hidden size-[18px] dark:block" strokeWidth={1.5} />
    </Button>
  );
}

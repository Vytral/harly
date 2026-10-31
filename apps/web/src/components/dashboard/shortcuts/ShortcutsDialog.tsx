"use client";

import { Fragment } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "./Kbd";
import {
  displayKey,
  GROUP_ORDER,
  RESERVED_CHORDS,
  SHORTCUTS,
  type ShortcutDef,
} from "./catalog";
import { setShortcutsHelpOpen, useShortcutsHelpOpen } from "./shortcut-ui-store";

const ALL = Object.values(SHORTCUTS) as ShortcutDef[];

/** "Keyboard shortcuts" reference: every catalog entry, grouped, with kbd chips. */
export function ShortcutsDialog() {
  const open = useShortcutsHelpOpen();

  return (
    <Dialog open={open} onOpenChange={setShortcutsHelpOpen}>
      <DialogContent size="md" className="gap-4">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts pause while you type or a dialog is open. Press{" "}
            <Kbd className="mx-0.5 h-5 min-w-5 text-[11px]">?</Kbd> any time to see this list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section aria-labelledby="shortcuts-app">
            <h3 id="shortcuts-app" className="type-col-head pb-1.5">
              Anywhere
            </h3>
            <ul className="divide-y divide-hairline">
              <Row label="Search and commands">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </Row>
              <Row label="Ask the assistant">
                <Kbd>⌘</Kbd>
                <Kbd>J</Kbd>
              </Row>
            </ul>
          </section>

          {GROUP_ORDER.map((group) => {
            const items = ALL.filter((item) => item.group === group);
            const headingId = `shortcuts-${group.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <section key={group} aria-labelledby={headingId}>
                <h3 id={headingId} className="type-col-head pb-1.5">
                  {group}
                </h3>
                <ul className="divide-y divide-hairline">
                  {items.map((item) => (
                    <Row key={item.keys} label={item.label}>
                      {item.keys.split(" ").map((key, index) => (
                        <Fragment key={`${key}-${index}`}>
                          {index > 0 ? (
                            <span className="text-[12px] text-soft-ink" aria-label="then">
                              then
                            </span>
                          ) : null}
                          <Kbd>{displayKey(key)}</Kbd>
                        </Fragment>
                      ))}
                    </Row>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <span className="sr-only">Reserved: {RESERVED_CHORDS.join(", ")}</span>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2 text-[14px] text-near-ink">
      <span className="min-w-0">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">{children}</span>
    </li>
  );
}

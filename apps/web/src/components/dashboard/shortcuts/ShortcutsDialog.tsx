"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

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
} from "./catalog";
import { setShortcutsHelpOpen, useShortcutsHelpOpen } from "./shortcut-ui-store";

const ALL = Object.entries(SHORTCUTS);
const GROUP_KEYS: Record<string, string> = { General: "general", "Go to": "goTo", "Candidate page": "candidatePage", Inbox: "inbox" };

/** "Keyboard shortcuts" reference: every catalog entry, grouped, with kbd chips. */
export function ShortcutsDialog() {
  const t = useTranslations("shell.shortcuts");
  const open = useShortcutsHelpOpen();

  return (
    <Dialog open={open} onOpenChange={setShortcutsHelpOpen}>
      <DialogContent size="md" className="gap-4">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t.rich("description", { key: (chunks) => <Kbd className="mx-0.5 h-5 min-w-5 text-[11px]">{chunks}</Kbd> })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section aria-labelledby="shortcuts-app">
            <h3 id="shortcuts-app" className="type-col-head pb-1.5">
              {t("anywhere")}
            </h3>
            <ul className="divide-y divide-hairline">
              <Row label={t("searchCommands")}>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </Row>
              <Row label={t("askAssistant")}>
                <Kbd>⌘</Kbd>
                <Kbd>J</Kbd>
              </Row>
            </ul>
          </section>

          {GROUP_ORDER.map((group) => {
            const items = ALL.filter(([, item]) => item.group === group);
            const headingId = `shortcuts-${group.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <section key={group} aria-labelledby={headingId}>
                <h3 id={headingId} className="type-col-head pb-1.5">
                  {t(GROUP_KEYS[group])}
                </h3>
                <ul className="divide-y divide-hairline">
                  {items.map(([id, item]) => (
                    <Row key={id} label={t(`items.${id.replaceAll(".", "_")}`)}>
                      {item.keys.split(" ").map((key, index) => (
                        <Fragment key={`${key}-${index}`}>
                          {index > 0 ? (
                            <span className="text-[12px] text-soft-ink" aria-label={t("then")}>
                              {t("then")}
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
        <span className="sr-only">{t("reserved", { chords: RESERVED_CHORDS.join(", ") })}</span>
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BadgeDollarSign,
  CalendarDays,
  Send,
  ThumbsDown,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { decideOffer, sendOffer, withdrawOffer } from "@/features/offers/actions";
import { OfferDrawer } from "@/features/offers/OfferDrawer";
import {
  formatOfferComp,
  OFFER_STATUS_META,
  type CandidateOfferItem,
} from "@/features/offers/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShortDate, RelativeTime } from "@/lib/date-hydration";

export function OffersPanel({
  offers,
  applications,
}: {
  offers: CandidateOfferItem[];
  applications: Array<{ id: string; jobTitle: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CandidateOfferItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function run(action: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Could not update the offer.");
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {offers.length === 0
            ? "No offers yet."
            : `${offers.length} offer${offers.length === 1 ? "" : "s"}.`}
        </p>
        {applications.length > 0 ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <BadgeDollarSign className="size-4" />
            New offer
          </Button>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <BadgeDollarSign className="size-5" strokeWidth={1.6} />
          </span>
          <p className="text-sm font-medium">No offers extended</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Draft an offer with compensation and start date, then send it and
            track the candidate&apos;s decision here.
          </p>
        </div>
      ) : (
        offers.map((offer) => {
          const meta = OFFER_STATUS_META[offer.status];
          const comp = formatOfferComp(offer);
          return (
            <Card key={offer.id}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{offer.title}</p>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {offer.jobTitle}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {offer.status === "draft" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => setEditing(offer)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            run(() => sendOffer({ offerId: offer.id }), "Offer sent")
                          }
                        >
                          <Send className="size-4" />
                          Send offer
                        </Button>
                      </>
                    ) : null}
                    {offer.status === "sent" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                decideOffer({ offerId: offer.id, decision: "accepted" }),
                              "Offer accepted — candidate marked as hired",
                            )
                          }
                        >
                          <BadgeCheck className="size-4" />
                          Mark accepted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                decideOffer({ offerId: offer.id, decision: "declined" }),
                              "Offer marked as declined",
                            )
                          }
                        >
                          <ThumbsDown className="size-4" />
                          Declined
                        </Button>
                      </>
                    ) : null}
                    {offer.status === "draft" || offer.status === "sent" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => withdrawOffer({ offerId: offer.id }),
                            "Offer withdrawn",
                          )
                        }
                      >
                        <Undo2 className="size-4" />
                        Withdraw
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                  {comp ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <BadgeDollarSign className="size-4 text-muted-foreground" />
                      {comp}
                    </span>
                  ) : null}
                  {offer.equity ? <span>Equity: {offer.equity}</span> : null}
                  {offer.startDate ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" />
                      Starts <ShortDate value={offer.startDate} />
                    </span>
                  ) : null}
                  {offer.expiresAt ? (
                    <span>
                      Expires <ShortDate value={offer.expiresAt} />
                    </span>
                  ) : null}
                </div>

                {offer.notes ? (
                  <p className="whitespace-pre-line text-sm">{offer.notes}</p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {offer.createdByName ?? "Someone"} ·{" "}
                  <RelativeTime value={offer.createdAt} />
                  {offer.decidedAt ? (
                    <>
                      {" "}
                      · decided <RelativeTime value={offer.decidedAt} />
                    </>
                  ) : null}
                </p>
              </CardContent>
            </Card>
          );
        })
      )}

      <OfferDrawer
        open={createOpen || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        applications={applications}
        offer={editing}
      />
    </div>
  );
}

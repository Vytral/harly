"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { db, updateRequests, workspaceUpdateSettings } from "@harly/db";

import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { getWorkspaceContext } from "@/features/workspaces/context";

import { currentVersion, getUpdateState, refreshLatestRelease, reconcileUpdateRequests } from "./data";
import { classifyUpdate } from "./release-version";
import { isUpdaterOnline } from "./update-request-state";
import { validateUpdateWindow } from "./update-window";

const log = createLogger("updates");

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Every action here changes how the whole installation is run, so it is
 * enforced on the server for owners only. Hiding the nav item is a courtesy;
 * this is the gate.
 */
async function requireOwner() {
  assertNotDemo();
  const context = await getWorkspaceContext();
  if (context.roleKey !== "owner") {
    const t = await getTranslations("server.updates.actions");
    throw new Error(t("onlyOwners"));
  }
  return context;
}

async function failure(name: string, error: unknown): Promise<ActionResult> {
  log.error(error, `${name} failed`);
  const t = await getTranslations("server.updates.actions");
  return {
    ok: false,
    error: error instanceof Error ? error.message : t("somethingWrong"),
  };
}

export async function checkForUpdatesAction(): Promise<ActionResult> {
  try {
    await requireOwner();
    const state = await refreshLatestRelease({ force: true });
    revalidatePath("/settings/updates");
    if (state?.latestCheckError) {
      const t = await getTranslations("server.updates.actions");
      return { ok: false, error: t("checkFailed", { reason: state.latestCheckError }) };
    }
    return { ok: true };
  } catch (error) {
    return failure("checkForUpdatesAction", error);
  }
}

/**
 * Queues an update for the host updater. `expectedVersion` is the version the
 * owner saw in the confirm dialog: if the channel has moved on since, the
 * request is refused instead of installing something they did not confirm.
 */
export async function requestUpdateAction(expectedVersion: string): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOwner();
    const t = await getTranslations("server.updates.actions");
    await reconcileUpdateRequests();
    const state = await refreshLatestRelease();
    const latest = state?.latestVersion;
    const running = currentVersion();

    if (!latest || classifyUpdate(running, latest) === null) {
      throw new Error(t("upToDate"));
    }
    if (latest !== expectedVersion) {
      throw new Error(t("versionChanged", { version: latest }));
    }
    if (!isUpdaterOnline((await getUpdateState())?.updaterLastSeenAt ?? null, new Date())) {
      throw new Error(t("updaterNotConnected"));
    }

    let createdId: string;
    try {
      const [created] = await db
        .insert(updateRequests)
        .values({
          organizationId: organization.id,
          requestedBy: user.id,
          trigger: "manual",
          fromVersion: running,
          targetVersion: latest,
          message: "Waiting for the updater to pick this up.",
        })
        .returning({ id: updateRequests.id });
      createdId = created!.id;
    } catch {
      // The one-active-request index refused a second insert.
      throw new Error(t("alreadyInProgress"));
    }

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "update.requested",
      resourceType: "update_request",
      resourceId: createdId,
      severity: "critical",
      metadata: { fromVersion: running, targetVersion: latest, trigger: "manual" },
    });
    revalidatePath("/settings/updates");
    return { ok: true };
  } catch (error) {
    return failure("requestUpdateAction", error);
  }
}

/** Withdraws a request the updater has not picked up yet. */
export async function cancelUpdateRequestAction(requestId: string): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOwner();
    const t = await getTranslations("server.updates.actions");
    const [cancelled] = await db
      .update(updateRequests)
      .set({
        status: "cancelled",
        message: "Cancelled by an owner.",
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(updateRequests.id, z.uuid().parse(requestId)),
          eq(updateRequests.organizationId, organization.id),
          eq(updateRequests.status, "pending"),
        ),
      )
      .returning({ id: updateRequests.id });
    if (!cancelled) {
      throw new Error(t("alreadyPickedUp"));
    }
    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "update.cancelled",
      resourceType: "update_request",
      resourceId: cancelled.id,
      severity: "info",
    });
    revalidatePath("/settings/updates");
    return { ok: true };
  } catch (error) {
    return failure("cancelUpdateRequestAction", error);
  }
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  level: z.enum(["patch", "minor"]),
  days: z.array(z.number().int().min(1).max(7)).max(7),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(64),
});

export type AutoUpdateInput = z.input<typeof settingsSchema>;

export async function saveAutoUpdateSettingsAction(input: AutoUpdateInput): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOwner();
    const t = await getTranslations("server.updates.actions");
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) throw new Error(t("invalidSettings"));
    const value = parsed.data;
    const days = [...new Set(value.days)].sort((a, b) => a - b);
    const problem = validateUpdateWindow({
      days,
      startHour: value.startHour,
      endHour: value.endHour,
      timezone: value.timezone,
    });
    // Turning the policy on needs a usable window. Turning it off must always
    // work, so a half-edited window is simply not saved alongside the switch.
    if (problem && value.enabled) throw new Error(t(`window.${problem}`));

    const row = {
      autoUpdateEnabled: value.enabled,
      autoUpdateLevel: value.level,
      ...(problem
        ? {}
        : {
            windowDays: days,
            windowStartHour: value.startHour,
            windowEndHour: value.endHour,
            windowTimezone: value.timezone,
          }),
      updatedBy: user.id,
    };
    await db
      .insert(workspaceUpdateSettings)
      .values({ organizationId: organization.id, ...row })
      .onConflictDoUpdate({
        target: workspaceUpdateSettings.organizationId,
        set: { ...row, updatedAt: new Date() },
      });

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "settings.auto_update_updated",
      resourceType: "workspace_update_settings",
      resourceId: organization.id,
      severity: "critical",
      metadata: {
        enabled: value.enabled,
        level: value.level,
        days: days.join(","),
        window: `${value.startHour}-${value.endHour}`,
        timezone: value.timezone,
      },
    });
    revalidatePath("/settings/updates");
    return { ok: true };
  } catch (error) {
    return failure("saveAutoUpdateSettingsAction", error);
  }
}

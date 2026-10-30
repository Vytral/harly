"use server";

import { revalidatePath } from "next/cache";

import { assertNotDemo } from "@/features/demo/assert-not-demo";
import { requireWorkspaceRole } from "@/features/workspaces/context";
import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";

import { loadSampleData, removeSampleData, SampleDataError } from "./service";

const log = createLogger("sample-data");

export type SampleDataActionResult =
  | { ok: true; status: "loaded" | "already_loaded" | "removed" | "none" }
  | { ok: false; error: string };

/** Only operator-facing messages reach the page; database text is logged, not shown. */
function failureResult(error: unknown, fallback: string): SampleDataActionResult {
  return {
    ok: false,
    error: error instanceof SampleDataError ? error.message : fallback,
  };
}

function revalidateWorkspacePages() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard/candidates");
  revalidatePath("/dashboard/pipeline");
}

/** Owner or admin: add the clearly synthetic sample job and candidates. */
export async function loadSampleDataAction(): Promise<SampleDataActionResult> {
  try {
    assertNotDemo();
    const { organization, user } = await requireWorkspaceRole(["owner", "admin"]);
    const result = await loadSampleData({
      workspaceId: organization.id,
      actorUserId: user.id,
    });

    if (result.status === "loaded") {
      await logAuditEvent({
        workspaceId: organization.id,
        actorId: user.id,
        actorEmail: user.email,
        action: "sample_data.loaded",
        resourceType: "workspace",
        resourceId: organization.id,
        severity: "info",
        metadata: { batchId: result.batchId, counts: result.counts },
      });
    }

    revalidateWorkspacePages();
    return { ok: true, status: result.status };
  } catch (error) {
    log.error(error, "failed to load sample data");
    return failureResult(error, "Sample data could not be loaded. Try again.");
  }
}

/** Owner or admin: delete the tracked sample rows and nothing else. */
export async function removeSampleDataAction(): Promise<SampleDataActionResult> {
  try {
    assertNotDemo();
    const { organization, user } = await requireWorkspaceRole(["owner", "admin"]);
    const result = await removeSampleData({ workspaceId: organization.id });

    if (result.status === "none") {
      return { ok: true, status: "none" };
    }

    await logAuditEvent({
      workspaceId: organization.id,
      actorId: user.id,
      actorEmail: user.email,
      action: "sample_data.removed",
      resourceType: "workspace",
      resourceId: organization.id,
      severity: "info",
      metadata: {
        batchId: result.batchId,
        deleted: result.deleted,
        kept: result.kept,
        keptRecords: result.keptRecords,
      },
    });

    revalidateWorkspacePages();
    return { ok: true, status: "removed" };
  } catch (error) {
    log.error(error, "failed to remove sample data");
    return failureResult(error, "Sample data could not be removed. Try again.");
  }
}

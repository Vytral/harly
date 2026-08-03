import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("lucide-react", () => ({
  CalendarClock: () => null,
  CheckCircle2: () => null,
  ChevronDown: () => null,
  ClipboardCheck: () => null,
  Download: () => null,
  FileText: () => null,
  Mail: () => null,
  Pencil: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
  UserMinus: () => null,
}));
vi.mock("@/lib/notification-island/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/features/candidates/EditCandidateDrawer", () => ({ EditCandidateDrawer: () => null }));
vi.mock("@/features/candidates/EmailDrawer", () => ({ EmailDrawer: () => null }));
vi.mock("@/features/candidates/EvaluationDrawer", () => ({ EvaluationDrawer: () => null }));
vi.mock("@/features/candidates/MoveStageButton", () => ({ MoveStageButton: () => null }));
vi.mock("@/features/candidates/PdfViewer", () => ({ PdfViewer: () => null }));
vi.mock("@/features/candidates/ScheduleDrawer", () => ({ ScheduleDrawer: () => null }));
vi.mock("@/features/candidates/actions", () => ({
  bulkUpdateCandidateStatusAction: vi.fn(),
  trashCandidateAction: vi.fn(),
}));
vi.mock("@/features/pool/CandidatePoolButton", () => ({ CandidatePoolButton: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: () => null,
  DialogContent: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogTrigger: () => null,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: () => null,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuTrigger: () => null,
}));
vi.mock("@/components/ui/icons/phosphor", () => ({ ProhibitIcon: () => null }));

import {
  CandidateActionBar,
  decisionApplicationIds,
} from "./CandidateActionBar";

const applications = [
  {
    applicationId: "application-a",
    jobTitle: "Frontend Engineer",
    currentStageName: "Screening",
  },
  {
    applicationId: "application-b",
    jobTitle: "Product Designer",
    currentStageName: "Interview",
  },
];

describe("candidate decision application scope", () => {
  it("returns only the explicitly selected application", () => {
    expect(decisionApplicationIds(applications, "application-b")).toEqual([
      "application-b",
    ]);
  });

  it("falls back to the first application when the selection is stale", () => {
    expect(decisionApplicationIds(applications, "missing-application")).toEqual([
      "application-a",
    ]);
  });

  it("renders an explicit application selector when a candidate has several applications", () => {
    const markup = renderToStaticMarkup(
      createElement(CandidateActionBar, {
        candidate: {
          id: "candidate-1",
          workspaceId: "workspace-1",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          phone: null,
          address: null,
          location: null,
          linkedinUrl: null,
          githubUrl: null,
          websiteUrl: null,
          avatarUrl: null,
          headline: null,
          summary: null,
        },
        name: "Ada Lovelace",
        resumeUrl: null,
        stageName: "Screening",
        applications,
        members: [],
        cal: { enabled: false, bookingUrl: null },
        move: null,
      }),
    );

    expect(markup).toContain('aria-label="Application to update"');
    expect(markup).toContain("Frontend Engineer");
    expect(markup).toContain("Product Designer");
  });
});

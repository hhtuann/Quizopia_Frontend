// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModerationPage from "./page";
import {
  dismissReport,
  getModerationGrant,
  getPublicationHistory,
  hidePublication,
  listModerationReports,
  resolveReport,
  restorePublication,
  type ModerationAuditEntry,
  type ModerationReportItem,
  type ModerationReportPage,
} from "@/lib/api/community-owner";

/**
 * P3-A-FE2 (#44) — moderation console: the grant gate (403/api → denied
 * state, non-API/network → retryable Try-again; queue never fetched until
 * granted), queue rendering + status filter, publication-summary fallback,
 * hide with MANDATORY reason (empty submit blocked), dismiss with optional
 * note, and the append-only history view rendered newest-first.
 */

vi.mock("@/lib/api/community-owner", () => ({
  getModerationGrant: vi.fn(),
  listModerationReports: vi.fn(),
  hidePublication: vi.fn(),
  restorePublication: vi.fn(),
  dismissReport: vi.fn(),
  resolveReport: vi.fn(),
  getPublicationHistory: vi.fn(),
  DEFAULT_MODERATION_PAGE_SIZE: 10,
}));

function report(overrides: Partial<ModerationReportItem> = {}): ModerationReportItem {
  return {
    id: 9,
    reasonCode: "INAPPROPRIATE_CONTENT",
    details: "Contains offensive wording in question 3.",
    status: "OPEN",
    createdAt: "2026-11-07T15:30:00Z",
    publicationId: 3,
    publication: {
      title: "Algebra fundamentals",
      authorName: "MathWhiz",
      categoryCode: "toan",
      categoryTitle: "Mathematics",
      questionCount: 12,
      sectionCount: 3,
      durationMinutes: 30,
    },
    ...overrides,
  };
}

function pageOf(
  items: ModerationReportItem[],
  totalPages = 1,
  totalElements = items.length
): ModerationReportPage {
  return { items, page: 0, size: 10, totalElements, totalPages };
}

function audit(
  id: number,
  action: ModerationAuditEntry["action"],
  reason: string,
  extra: Partial<ModerationAuditEntry> = {}
): ModerationAuditEntry {
  return {
    id,
    action,
    fromStatus: null,
    toStatus: null,
    fromModerationState: "VISIBLE",
    toModerationState: "HIDDEN",
    reason,
    createdAt: `2026-11-0${id}T10:00:00Z`,
    actorUserId: 40 + id,
    ...extra,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ModerationPage />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.mocked(getModerationGrant).mockReset();
  vi.mocked(listModerationReports).mockReset();
  vi.mocked(hidePublication).mockReset();
  vi.mocked(restorePublication).mockReset();
  vi.mocked(dismissReport).mockReset();
  vi.mocked(resolveReport).mockReset();
  vi.mocked(getPublicationHistory).mockReset();
});
afterEach(cleanup);

describe("/community/moderation", () => {
  it("denies the console without the grant (403) and never fetches the queue", async () => {
    vi.mocked(getModerationGrant).mockRejectedValue({
      kind: "api",
      status: 403,
      code: "COMMUNITY_ACCESS_DENIED",
      message: "denied",
      raw: {},
    });
    mount();

    expect(await screen.findByText(/You are not a community moderator/)).toBeTruthy();
    expect(listModerationReports).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Hide" })).toBeNull();
  });

  it("offers a retryable error when the grant check fails non-API (network)", async () => {
    vi.mocked(getModerationGrant)
      .mockRejectedValueOnce({ kind: "network", message: "offline", raw: {} })
      .mockResolvedValueOnce({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    mount();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
    // A transport failure is never a denial — and the queue stays unfetched.
    expect(screen.queryByText(/You are not a community moderator/)).toBeNull();
    expect(listModerationReports).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Inappropriate content")).toBeTruthy();
    expect(getModerationGrant).toHaveBeenCalledTimes(2);
  });

  it("renders the queue with report + publication summaries and OPEN actions", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    mount();

    expect(await screen.findByText("Inappropriate content")).toBeTruthy();
    expect(screen.getByText(/offensive wording in question 3/)).toBeTruthy();
    expect(screen.getByText("Algebra fundamentals")).toBeTruthy();
    expect(screen.getByText(/publication #3/)).toBeTruthy();
    expect(screen.getByText(/report #9/)).toBeTruthy();

    // Month + year render — old rows stay unambiguous (fix round FE-1).
    expect(screen.getByText(/Reported/).textContent).toMatch(/Nov 2026/);
    for (const name of ["Hide", "Restore", "History", "Dismiss report", "Resolve report"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(listModerationReports).toHaveBeenCalledWith({
      status: "OPEN",
      page: 0,
      size: 10,
    });
  });

  it("filters the queue by status tabs", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(
      pageOf([report({ id: 15, status: "DISMISSED" })])
    );
    mount();
    await screen.findByText("Inappropriate content");

    fireEvent.click(screen.getByRole("button", { name: "Dismissed" }));

    await waitFor(() =>
      expect(listModerationReports).toHaveBeenLastCalledWith({
        status: "DISMISSED",
        page: 0,
        size: 10,
      })
    );
    // Handled reports expose no dismiss/resolve actions.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Dismiss report" })).toBeNull()
    );
  });

  it("blocks hide until a reason is entered, then submits it", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    vi.mocked(hidePublication).mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));

    expect(await screen.findByText("Hide publication")).toBeTruthy();
    // Mandatory reason: empty submit is blocked by the zod schema.
    fireEvent.click(screen.getByRole("button", { name: "Hide from community" }));
    expect(await screen.findByText("A reason is required.")).toBeTruthy();
    expect(hidePublication).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/reason \(required\)/i), {
      target: { value: "Confirmed offensive content" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide from community" }));

    await waitFor(() =>
      expect(hidePublication).toHaveBeenCalledWith(3, "Confirmed offensive content")
    );
    expect(await screen.findByText(/was hidden from the community/)).toBeTruthy();
  });

  it("restores with a mandatory reason", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    vi.mocked(restorePublication).mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    fireEvent.change(await screen.findByLabelText(/reason \(required\)/i), {
      target: { value: "Reviewed — false positive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore to community" }));

    await waitFor(() =>
      expect(restorePublication).toHaveBeenCalledWith(3, "Reviewed — false positive")
    );
  });

  it("dismisses a report with an optional (empty) note", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    vi.mocked(dismissReport).mockResolvedValue(report({ status: "DISMISSED" }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss report" }));

    // No reason needed — submit directly with an empty note.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss report" }));

    await waitFor(() => expect(dismissReport).toHaveBeenCalledWith(9, undefined));
    expect(await screen.findByText("Report dismissed.")).toBeTruthy();
  });

  it("resolves a report forwarding the note", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    vi.mocked(resolveReport).mockResolvedValue(report({ status: "RESOLVED" }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Resolve report" }));

    fireEvent.change(await screen.findByLabelText(/note \(optional\)/i), {
      target: { value: "Handled by hiding" },
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Resolve report" }));

    await waitFor(() =>
      expect(resolveReport).toHaveBeenCalledWith(9, "Handled by hiding")
    );
  });

  it("renders the append-only history newest-first", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(pageOf([report()]));
    // Server order arbitrary; ids 11 (older) then 12 (newer).
    vi.mocked(getPublicationHistory).mockResolvedValue([
      audit(11, "HIDE", "spam cleanup", { actorUserId: 51 }),
      audit(12, "RESTORE", "restored after review", {
        fromModerationState: "HIDDEN",
        toModerationState: "VISIBLE",
        actorUserId: 52,
      }),
    ]);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "History" }));

    expect(await screen.findByText("Moderation history")).toBeTruthy();
    const rows = await screen.findAllByRole("row");
    // Header + 2 data rows; newest (id 12, Restore) first.
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain("Restore");
    expect(rows[1].textContent).toContain("restored after review");
    expect(rows[1].textContent).toContain("HIDDEN → VISIBLE");
    expect(rows[1].textContent).toContain("#52");
    expect(rows[2].textContent).toContain("Hide");
    expect(rows[2].textContent).toContain("spam cleanup");
    expect(getPublicationHistory).toHaveBeenCalledWith(3);
  });

  it("degrades a null publication summary to the id fallback instead of crashing", async () => {
    vi.mocked(getModerationGrant).mockResolvedValue({ granted: true });
    vi.mocked(listModerationReports).mockResolvedValue(
      pageOf([
        report({ publication: null as unknown as ModerationReportItem["publication"] }),
      ])
    );
    mount();

    expect(await screen.findByText("Publication #3")).toBeTruthy();
    const meta = screen.getByText(/publication #3/);
    expect(meta.textContent).toContain("by —");
    expect(meta.textContent).toContain("0 questions");
    expect(meta.textContent).toContain("0 sections");
    expect(meta.textContent).toContain("0 min");
  });
});

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { AiAlertItem } from "@/lib/api/ai-detections";
import { AlertReviewForm, reviewActionLabel } from "./AlertReviewForm";

/**
 * P4-E review flows (design §3.3/§4): optimistic-version submit with a
 * per-intent Idempotency-Key (regenerated after success / acknowledged
 * conflict), 409 MONITORING_REVIEW_VERSION_CONFLICT surfacing the server
 * message, generic failure state, and the history disclosure (§3.4).
 */
import type * as Api from "@/lib/api/alert-review";

let keySeq = 0;

vi.mock("@/lib/api/alert-review", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    submitAlertReview: vi.fn(),
    getAlertReviews: vi.fn(),
    newIdempotencyKey: () => `key-${++keySeq}`,
  };
});

import { getAlertReviews, submitAlertReview } from "@/lib/api/alert-review";

const submitMock = vi.mocked(submitAlertReview);
const historyMock = vi.mocked(getAlertReviews);

function alertItem(overrides: Partial<AiAlertItem> = {}): AiAlertItem {
  return {
    alertId: 9,
    attemptId: 10,
    studentUserId: 77,
    studentName: "Nguyen Van A",
    alertType: "PHONE_DETECTED",
    status: "OPEN",
    firstDetectedAt: "2026-11-15T08:00:00Z",
    lastDetectedAt: "2026-11-15T08:00:20Z",
    detectionCount: 3,
    maxConfidence: 0.87,
    modelId: "yolo26s",
    modelVersion: "8.4.64-onnx",
    provenance: "CLIENT_MODEL",
    latestDetections: null,
    reviewVersion: 0,
    reviewStatus: "UNREVIEWED",
    ...overrides,
  };
}

function renderForm(alert: AiAlertItem = alertItem()): {
  container: HTMLElement;
  client: QueryClient;
  invalidateSpy: MockInstance;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const { container } = render(
    <QueryClientProvider client={client}>
      <AlertReviewForm alert={alert} sessionId={5} />
    </QueryClientProvider>
  );
  return { container, client, invalidateSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  keySeq = 0;
});

afterEach(cleanup);

describe("AlertReviewForm submit (happy path + idempotency)", () => {
  it("submits the alert's optimistic version, action and note with the intent key", async () => {
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 1,
      reviewStatus: "NEEDS_FOLLOW_UP",
      action: "NEEDS_FOLLOW_UP",
      note: "theo dõi thêm",
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:00:00Z",
      idempotentReplay: false,
    });
    const { container } = renderForm(alertItem({ reviewVersion: 0 }));

    fireEvent.click(screen.getByRole("button", { name: "Cần theo dõi thêm" }));
    fireEvent.change(
      container.querySelector("textarea") as HTMLTextAreaElement,
      { target: { value: "theo dõi thêm" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith(
        9,
        { expectedVersion: 0, action: "NEEDS_FOLLOW_UP", note: "theo dõi thêm" },
        "key-1"
      )
    );
    expect(
      await screen.findByText("Đã lưu đánh giá (phiên 1).")
    ).not.toBeNull();
  });

  it("regenerates the idempotency key after success (new intent, new key)", async () => {
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 1,
      reviewStatus: "VIEWED",
      action: "MARK_VIEWED",
      note: null,
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:00:00Z",
      idempotentReplay: false,
    });
    renderForm(alertItem({ reviewVersion: 0 }));

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    // Second intent carries the regenerated key, never the used one.
    expect(submitMock.mock.calls[0][2]).toBe("key-1");
    expect(submitMock.mock.calls[1][2]).toBe("key-2");
  });

  it("reports an idempotent replay honestly", async () => {
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 2,
      reviewStatus: "VIEWED",
      action: "MARK_VIEWED",
      note: null,
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:00:00Z",
      idempotentReplay: true,
    });
    renderForm(alertItem({ reviewVersion: 1 }));

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    expect(
      await screen.findByText("Yêu cầu trùng lặp — giữ nguyên đánh giá phiên 2.")
    ).not.toBeNull();
  });

  it("invalidates alerts feed, dashboard keys, attempt timeline and the open report on success", async () => {
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 1,
      reviewStatus: "VIEWED",
      action: "MARK_VIEWED",
      note: null,
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:00:00Z",
      idempotentReplay: false,
    });
    const { invalidateSpy } = renderForm(alertItem({ attemptId: 10 }));

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());

    const keys = invalidateSpy.mock.calls.map(
      (call) => JSON.stringify(call[0]?.queryKey)
    );
    expect(keys).toContain(JSON.stringify(["exam-sessions", 5, "ai-alerts"]));
    expect(keys).toContain(JSON.stringify(["exam-sessions", 5, "monitoring-overview"]));
    expect(keys).toContain(JSON.stringify(["exam-sessions", 5, "monitoring-participants"]));
    expect(keys).toContain(JSON.stringify(["attempts", 10, "timeline"]));
    expect(keys).toContain(JSON.stringify(["alerts", 9, "reviews"]));
    expect(keys).toContain(
      JSON.stringify(["attempts", 10, "monitoring-report"])
    );
  });

  it("omits the note when the textarea is only whitespace", async () => {
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 1,
      reviewStatus: "VIEWED",
      action: "MARK_VIEWED",
      note: null,
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:00:00Z",
      idempotentReplay: false,
    });
    const { container } = renderForm();
    fireEvent.change(
      container.querySelector("textarea") as HTMLTextAreaElement,
      { target: { value: "   " } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith(
        9,
        { expectedVersion: 0, action: "MARK_VIEWED" },
        "key-1"
      )
    );
  });
});

describe("AlertReviewForm conflict (409) and failure states", () => {
  const conflictError = {
    kind: "api",
    status: 409,
    code: "MONITORING_REVIEW_VERSION_CONFLICT",
    message: "Alert was already reviewed (current version 3)",
    raw: null,
  };

  it("surfaces the server message (with current version) and a retry affordance", async () => {
    submitMock.mockRejectedValue(conflictError);
    const { invalidateSpy } = renderForm(alertItem({ reviewVersion: 0 }));

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));

    expect(
      await screen.findByText(/current version 3/i)
    ).not.toBeNull();
    // Conflict → refetch the fresh version rows.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());

    fireEvent.click(
      screen.getByRole("button", { name: "Đã hiểu — dùng phiên bản mới" })
    );
    expect(screen.queryByText(/current version 3/i)).toBeNull();

    // Retry after acknowledge uses a REGENERATED key.
    submitMock.mockResolvedValue({
      alertId: 9,
      reviewVersion: 4,
      reviewStatus: "VIEWED",
      action: "MARK_VIEWED",
      note: null,
      reviewerUserId: 5,
      reviewedAt: "2026-11-17T08:01:00Z",
      idempotentReplay: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(submitMock.mock.calls[0][2]).toBe("key-1");
    expect(submitMock.mock.calls[1][2]).toBe("key-2");
  });

  it("falls back to a generic error for non-409 failures", async () => {
    submitMock.mockRejectedValue({ kind: "network", message: "offline", raw: null });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Lưu đánh giá" }));
    expect(
      await screen.findByText("Không lưu được đánh giá — thử lại.")
    ).not.toBeNull();
  });
});

describe("AlertReviewForm note field", () => {
  it("enforces maxLength 1000 with a live counter", () => {
    const { container } = renderForm();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(1000);
    fireEvent.change(textarea, { target: { value: "abc" } });
    expect(screen.getByText("3/1000")).not.toBeNull();
  });
});

describe("AlertReviewForm history disclosure (§3.4)", () => {
  it("fetches and renders history only when opened", async () => {
    historyMock.mockResolvedValue({
      alertId: 9,
      currentReview: {
        status: "FALSE_POSITIVE",
        version: 1,
        reviewedAt: "2026-11-17T08:00:00Z",
        reviewerName: "Te",
      },
      history: [
        {
          version: 1,
          action: "FALSE_POSITIVE",
          note: "sai báo động",
          reviewerName: "Te",
          reviewedAt: "2026-11-17T08:00:00Z",
        },
      ],
    });
    renderForm();

    expect(historyMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Xem lịch sử đánh giá" }));
    await waitFor(() => expect(historyMock).toHaveBeenCalledWith(9));

    const history = await screen.findByTestId("alert-review-history");
    expect(history.textContent).toContain("v1");
    expect(history.textContent).toContain(reviewActionLabel("FALSE_POSITIVE"));
    expect(history.textContent).toContain("sai báo động");
    expect(history.textContent).toContain("Te");
  });

  it("shows the honest empty state when no reviews exist", async () => {
    historyMock.mockResolvedValue({
      alertId: 9,
      currentReview: { status: "UNREVIEWED", version: 0, reviewedAt: null, reviewerName: null },
      history: [],
    });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Xem lịch sử đánh giá" }));
    expect(await screen.findByText("Chưa có đánh giá nào.")).not.toBeNull();
  });

  it("shows the honest failure state when history cannot load", async () => {
    historyMock.mockRejectedValue({ kind: "http", status: 500, message: "boom", raw: null });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Xem lịch sử đánh giá" }));
    expect(
      await screen.findByText("Chưa tải được lịch sử đánh giá.")
    ).not.toBeNull();
  });
});

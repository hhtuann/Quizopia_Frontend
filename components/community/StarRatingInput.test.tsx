// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StarRatingInput } from "./StarRatingInput";
import {
  deleteRating,
  getSocialSummary,
  putRating,
  type SocialSummary,
} from "@/lib/api/community-social";
import type * as SocialApi from "@/lib/api/community-social";

/**
 * P3-C4 (#68) — the accessible star rating selector that replaces #67's
 * RATE_DIALOG_SEAM: radiogroup semantics (roles, names, aria-checked, roving
 * tabindex), keyboard operation (arrows/Home/End move AND submit; the ends
 * clamp — never wrap), the
 * update path (PUT on selection), Clear (DELETE), live aggregate rendering
 * (null average → "—"), and the publisher self-rating 409 informative state.
 */

// Real classifiers, mocked transport only — hooks stay real so keying +
// invalidation are exercised.
vi.mock("@/lib/api/community-social", async (importOriginal) => {
  const actual = await importOriginal<typeof SocialApi>();
  return {
    ...actual,
    getSocialSummary: vi.fn(),
    putLike: vi.fn(),
    deleteLike: vi.fn(),
    putRating: vi.fn(),
    deleteRating: vi.fn(),
  };
});

const socialMock = vi.mocked(getSocialSummary);
const putRatingMock = vi.mocked(putRating);
const deleteRatingMock = vi.mocked(deleteRating);

function summary(overrides: Partial<SocialSummary> = {}): SocialSummary {
  return {
    likeCount: 12,
    average: 4.25,
    ratingCount: 8,
    commentCount: 3,
    liked: false,
    myRating: null,
    ...overrides,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <StarRatingInput publicationId={7} />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  socialMock.mockResolvedValue(summary());
  putRatingMock.mockResolvedValue({ average: 4.5, ratingCount: 9, myRating: 4 });
  deleteRatingMock.mockResolvedValue({ average: 4, ratingCount: 7, myRating: null });
});
afterEach(cleanup);

describe("star rating input — radiogroup semantics", () => {
  it("renders a fieldset/legend radiogroup with five named radios and the aggregate", async () => {
    mount();

    const group = await screen.findByTestId("star-radiogroup");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toBe("Your rating");
    // fieldset/legend wraps the group (visible legend text).
    expect(screen.getByText("Your rating").closest("fieldset")).toBeTruthy();

    // The aggregate lands asynchronously next to the (already-rendered) group.
    expect(await screen.findByText("4.25 / 5 · 8 ratings")).toBeTruthy();

    for (let n = 1; n <= 5; n++) {
      const radio = screen.getByRole("radio", {
        name: `${n} ${n === 1 ? "star" : "stars"}`,
      });
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("marks the own rating checked and roves the tabindex onto it", async () => {
    socialMock.mockResolvedValue(summary({ myRating: 4 }));
    mount();

    await screen.findByText("Your rating: 4");
    const radios = [1, 2, 3, 4, 5].map((n) =>
      screen.getByRole("radio", { name: `${n} ${n === 1 ? "star" : "stars"}` })
    );
    radios.forEach((radio, i) => {
      expect(radio.getAttribute("aria-checked")).toBe(i === 3 ? "true" : "false");
      expect(radio.getAttribute("tabIndex")).toBe(i === 3 ? "0" : "-1");
    });
  });

  it("renders a null average as — (zero ratings)", async () => {
    socialMock.mockResolvedValue(summary({ average: null, ratingCount: 0 }));
    mount();

    expect(await screen.findByText("— / 5 · 0 ratings")).toBeTruthy();
  });
});

describe("star rating input — keyboard operation", () => {
  it("ArrowRight moves focus AND submits the newly focused value (APG radiogroup)", async () => {
    mount();
    const one = await screen.findByRole("radio", { name: "1 star" });

    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 2));
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "2 stars" })
    );

    const two = screen.getByRole("radio", { name: "2 stars" });
    fireEvent.keyDown(two, { key: "ArrowDown" });
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 3));
  });

  it("ArrowLeft moves backwards; Home/End jump", async () => {
    socialMock.mockResolvedValue(summary({ myRating: 3 }));
    mount();
    const three = await screen.findByRole("radio", { name: "3 stars" });

    fireEvent.keyDown(three, { key: "ArrowLeft" });
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 2));

    const two = screen.getByRole("radio", { name: "2 stars" });
    fireEvent.keyDown(two, { key: "End" });
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 5));

    const five = screen.getByRole("radio", { name: "5 stars" });
    fireEvent.keyDown(five, { key: "Home" });
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 1));
  });

  it("CLAMPS at the ends: ArrowRight on 5★ stays on 5★ (no wrap-and-downgrade), ArrowLeft on 1★ stays", async () => {
    socialMock.mockResolvedValue(summary({ myRating: 5 }));
    mount();
    const five = await screen.findByRole("radio", { name: "5 stars" });
    five.focus();

    fireEvent.keyDown(five, { key: "ArrowRight" });
    // A wrap would have submitted 1★ — a silent downgrade in one press.
    expect(putRatingMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(five);

    const one = screen.getByRole("radio", { name: "1 star" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowLeft" });
    expect(putRatingMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(one);
  });
});

describe("star rating input — submit / update / clear", () => {
  it("submits PUT verbatim on click and shows the refreshed own rating", async () => {
    socialMock
      .mockResolvedValueOnce(summary({ myRating: null }))
      // Post-write invalidation refetch answer (set BEFORE the click — no race).
      .mockResolvedValue(summary({ myRating: 5, ratingCount: 9 }));
    mount();

    fireEvent.click(await screen.findByRole("radio", { name: "5 stars" }));
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 5));

    // Invalidate-after-settle refetches the twin with the fresh state.
    expect(await screen.findByText("Your rating: 5")).toBeTruthy();
  });

  it("ignores further selections while a rating PUT is in flight (aria-busy)", async () => {
    const { promise, resolve } = Promise.withResolvers<SocialApi.RatingState>();
    putRatingMock.mockReturnValue(promise);
    mount();

    const four = await screen.findByRole("radio", { name: "4 stars" });
    fireEvent.click(four);
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledTimes(1));
    expect(
      (await screen.findByTestId("star-radiogroup")).getAttribute("aria-busy")
    ).toBe("true");

    // A second click during the flight is swallowed.
    fireEvent.click(screen.getByRole("radio", { name: "2 stars" }));
    expect(putRatingMock).toHaveBeenCalledTimes(1);

    resolve({ average: 4.5, ratingCount: 9, myRating: 4 });
    await waitFor(() =>
      expect((screen.getByTestId("star-radiogroup") as HTMLElement).getAttribute("aria-busy")).toBe("false")
    );
  });

  it("Clear calls DELETE and the own rating disappears after settle", async () => {
    socialMock
      .mockResolvedValueOnce(summary({ myRating: 4 }))
      // Post-clear invalidation refetch answer (set BEFORE the click — no race).
      .mockResolvedValue(summary({ myRating: null, ratingCount: 7 }));
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Clear my rating" }));
    await waitFor(() => expect(deleteRatingMock).toHaveBeenCalledWith(7));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Clear my rating" })).toBeNull()
    );
    const four = screen.getByRole("radio", { name: "4 stars" });
    expect(four.getAttribute("aria-checked")).toBe("false");
  });
});

describe("star rating input — publisher self-rating 409", () => {
  it("shows the informative state instead of the controls", async () => {
    putRatingMock.mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_SELF_RATING_NOT_ALLOWED",
      message: "Self rating not allowed",
      raw: {},
    });
    mount();

    fireEvent.click(await screen.findByRole("radio", { name: "3 stars" }));
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 3));

    expect(await screen.findByText("You cannot rate your own quiz.")).toBeTruthy();
    expect(screen.queryByTestId("star-radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear my rating" })).toBeNull();
    // The aggregate stays visible for context.
    expect(screen.getByText("4.25 / 5 · 8 ratings")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StarRatingInput } from "./StarRatingInput";
import {
  getSocialSummary,
  putRating,
  type SocialSummary,
} from "@/lib/api/community-social";
import type * as SocialApi from "@/lib/api/community-social";

/**
 * P3-C4 (#68) + #74 — the accessible star rating selector that replaced
 * #67's RATE_DIALOG_SEAM: radiogroup semantics (roles, names, aria-checked,
 * roving tabindex), keyboard operation (arrows/Home/End move AND submit; the
 * ends clamp — never wrap), the update path (PUT on selection), CUMULATIVE
 * star fill 1..N with exactly one checked radio (#74), the removed
 * badge/Clear surface (#74), live aggregate rendering (null average → "—"),
 * and the publisher self-rating 409 informative state.
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
  };
});

const socialMock = vi.mocked(getSocialSummary);
const putRatingMock = vi.mocked(putRating);

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

/** #74 cumulative-fill probe: does star N render filled? */
function filled(n: number): string | null {
  return screen.getByTestId(`star-${n}`).getAttribute("data-filled");
}

/** Asserts stars 1..count filled amber and count+1..5 outlined gray. */
function expectFill(count: number): void {
  for (let n = 1; n <= 5; n++) {
    expect(filled(n)).toBe(n <= count ? "true" : "false");
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  socialMock.mockResolvedValue(summary());
  putRatingMock.mockResolvedValue({ average: 4.5, ratingCount: 9, myRating: 4 });
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

    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "4 stars" }).getAttribute("aria-checked")
      ).toBe("true")
    );
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

describe("star rating input — submit / update", () => {
  it("submits PUT verbatim on click and shows the refreshed own rating", async () => {
    socialMock
      .mockResolvedValueOnce(summary({ myRating: null }))
      // Post-write invalidation refetch answer (set BEFORE the click — no race).
      .mockResolvedValue(summary({ myRating: 5, ratingCount: 9 }));
    mount();

    fireEvent.click(await screen.findByRole("radio", { name: "5 stars" }));
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 5));

    // Invalidate-after-settle refetches the twin with the fresh state — the
    // cumulative fill is the visible own-rating readout (#74).
    await waitFor(() => expectFill(5));
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
});

describe("star rating input — cumulative fill (#74)", () => {
  it.each([1, 3, 5])(
    "my rating %i fills exactly stars 1..%i amber, the rest outlined",
    async (n) => {
      socialMock.mockResolvedValue(summary({ myRating: n }));
      mount();

      await waitFor(() => expectFill(n));
      // The amber class itself carries the color — not just the data hook.
      expect(screen.getByTestId("star-1").className).toContain("text-[#F59E0B]");
      expect(screen.getByTestId("star-5").className).toContain(
        n === 5 ? "text-[#F59E0B]" : "text-[#94A3B8]"
      );
      // aria-checked lands on EXACTLY the committed star — the cumulative
      // fill is purely visual, never a second checked radio.
      const checkedStars = [1, 2, 3, 4, 5].filter(
        (k) =>
          screen.getByTestId(`star-${k}`).getAttribute("aria-checked") === "true"
      );
      expect(checkedStars).toEqual([n]);
    }
  );

  it("unrated renders zero filled stars (all outlined)", async () => {
    mount();

    await screen.findByText("4.25 / 5 · 8 ratings");
    expectFill(0);
  });

  it("hover previews the cumulative range 1..H; leaving restores the committed fill", async () => {
    socialMock.mockResolvedValue(summary({ myRating: 2 }));
    mount();
    await waitFor(() => expectFill(2));

    fireEvent.mouseEnter(screen.getByTestId("star-4"));
    expectFill(4);
    // The preview moves no checked radio.
    expect(screen.getByTestId("star-2").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("star-4").getAttribute("aria-checked")).toBe("false");

    fireEvent.mouseLeave(screen.getByTestId("star-4"));
    expectFill(2);
  });

  it("hover on an unrated row previews 1..H, then falls back to all gray", async () => {
    mount();
    await screen.findByText("4.25 / 5 · 8 ratings");

    fireEvent.mouseEnter(screen.getByTestId("star-3"));
    expectFill(3);
    fireEvent.mouseLeave(screen.getByTestId("star-3"));
    expectFill(0);
  });

  it("renders no 'Your rating:' badge and no Clear my rating button", async () => {
    socialMock.mockResolvedValue(summary({ myRating: 4 }));
    mount();
    await waitFor(() => expectFill(4));

    expect(screen.queryByText(/^Your rating: \d$/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Clear my rating" })
    ).toBeNull();
  });

  it("updating 5→3 by clicking the stars again re-renders exactly 3 filled (PUT upsert)", async () => {
    socialMock
      .mockResolvedValueOnce(summary({ myRating: 5 }))
      // Post-write invalidation refetch answer (set BEFORE the click — no race).
      .mockResolvedValue(summary({ myRating: 3, ratingCount: 8 }));
    mount();
    await waitFor(() => expectFill(5));

    fireEvent.click(screen.getByTestId("star-3"));
    await waitFor(() => expect(putRatingMock).toHaveBeenCalledWith(7, 3));
    await waitFor(() => expectFill(3));
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

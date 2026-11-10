// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommentSection } from "./CommentSection";
import {
  createComment,
  deleteComment,
  listComments,
  reportComment,
  updateComment,
  type CommentPage,
  type CommunityComment,
} from "@/lib/api/community-comments";
import type * as CommentsApi from "@/lib/api/community-comments";
import { useAuth } from "@/hooks/useAuth";
import type { CurrentUserResponse } from "@/lib/auth/types";

/**
 * #73 (Epic #70 F4–F6; ADR-007 Rev 4) — the community discussion
 * surface. List render + pagination + empty/error/retry, the compact
 * composer (account displayName shown automatically — no name input, no
 * consent gate, no everyday Cancel; char-count bounds; body-only
 * create), server-backed ownership (isMine flag — duplicate author
 * names never grant cross-user controls), inline edit/delete, the
 * report dialog's validation, and poisoned-fixture leak checks — the
 * §5 DTO renders authorName/body only, never any identity.
 */

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Real classifiers, mocked transport only — the hooks stay real so
// keying and invalidation are exercised.
vi.mock("@/lib/api/community-comments", async (importOriginal) => {
  const actual = await importOriginal<typeof CommentsApi>();
  return {
    ...actual,
    listComments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    reportComment: vi.fn(),
  };
});

const listMock = vi.mocked(listComments);
const createMock = vi.mocked(createComment);
const updateMock = vi.mocked(updateComment);
const deleteMock = vi.mocked(deleteComment);
const reportMock = vi.mocked(reportComment);

const LOGIN_HREF = "/login?returnTo=%2Fcommunity%2Fquizzes%2F7";

function comment(overrides: Partial<CommunityComment> = {}): CommunityComment {
  return {
    commentId: 11,
    authorName: "MathWhiz",
    body: "Great quiz — the section on fractions is spot on.",
    createdAt: "2026-11-01T10:00:00Z",
    editedAt: null,
    isMine: false,
    ...overrides,
  };
}

function page(items: CommunityComment[], totalPages = 1): CommentPage {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages,
    sort: "createdAt: DESC",
  };
}

const authedUser = (roles: string[]): CurrentUserResponse => ({
  id: 1,
  username: "ada",
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  phone: null,
  status: "ACTIVE",
  emailVerified: true,
  googleLinked: false,
  roles,
  permissions: [],
});

function asGuest() {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    status: "unauthenticated",
    isAuthenticated: false,
    isLoading: false,
  } as never);
}

function asUser(roles: string[] = ["STUDENT"]) {
  vi.mocked(useAuth).mockReturnValue({
    user: authedUser(roles),
    status: "authenticated",
    isAuthenticated: true,
    isLoading: false,
  } as never);
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <CommentSection publicationId={7} loginHref={LOGIN_HREF} />
      </QueryClientProvider>
    </StrictMode>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  asGuest();
  listMock.mockResolvedValue(page([comment()]));
  createMock.mockResolvedValue(comment({ authorName: "Ada Lovelace", isMine: true }));
  updateMock.mockResolvedValue(comment());
  deleteMock.mockResolvedValue(undefined);
  reportMock.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("comment section — list states", () => {
  it("renders newest-first items (author name, timestamp, Edited marker, body) for guests with a login CTA, no actions", async () => {
    listMock.mockResolvedValue(
      page([
        comment({
          commentId: 11,
          authorName: "MathWhiz",
          body: "Newest take.",
          createdAt: "2026-11-02T10:00:00Z",
        }),
        comment({
          commentId: 10,
          authorName: "Bob",
          body: "Great quiz — the section on fractions is spot on.",
          editedAt: "2026-11-03T09:00:00Z",
          createdAt: "2026-11-01T10:00:00Z",
        }),
      ])
    );
    mount();

    const section = await screen.findByTestId("comment-section");
    expect(await within(section).findByText("MathWhiz")).toBeTruthy();
    expect(within(section).getByText("Bob")).toBeTruthy();
    expect(within(section).getByText("Edited")).toBeTruthy();
    expect(
      within(section).getByText("Great quiz — the section on fractions is spot on.")
    ).toBeTruthy();
    // Bounded bubble present on each row.
    expect(within(section).getByTestId("comment-bubble-10")).toBeTruthy();
    expect(within(section).getByTestId("comment-bubble-11")).toBeTruthy();

    // Guests: readable list, sign-in CTA, and no per-item actions at all.
    const cta = within(section).getByTestId("sign-in-to-comment");
    expect(cta.getAttribute("href")).toBe(LOGIN_HREF);
    expect(within(section).queryByTestId("comment-editor")).toBeNull();
    for (const label of ["Edit", "Delete", "Report"]) {
      expect(within(section).queryByRole("button", { name: label })).toBeNull();
    }
    expect(listMock).toHaveBeenCalledWith(7, { page: 0, size: 20 });
  });

  it("shows the empty state when the publication has no comments", async () => {
    listMock.mockResolvedValue(page([]));
    mount();

    expect(await screen.findByTestId("comment-empty")).toBeTruthy();
    expect(
      screen.getByText("No comments yet — start the discussion.")
    ).toBeTruthy();
    expect(screen.queryByTestId("comment-pagination")).toBeNull();
  });

  it("shows a list error with retry, and refetches on Try again", async () => {
    listMock.mockRejectedValueOnce({ kind: "network", message: "x", raw: {} });
    mount();

    expect(await screen.findByText("Couldn't load comments.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    expect(await screen.findByText("MathWhiz")).toBeTruthy();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("renders the neutral gone copy without a retry on 404", async () => {
    listMock.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    expect(
      await screen.findByText("This quiz is no longer available.")
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("comment section — pagination", () => {
  it("pages with disabled bounds and an aria-live indicator; the fetch follows the page", async () => {
    listMock.mockResolvedValue(
      page([comment({ commentId: 21, authorName: "P2" })], 2)
    );
    mount();

    const nav = await screen.findByTestId("comment-pagination");
    const prev = within(nav).getByRole("button", { name: "Previous" });
    const next = within(nav).getByRole("button", { name: "Next" });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect(within(nav).getByText("Page 1 of 2")).toBeTruthy();

    listMock.mockResolvedValue(page([comment({ commentId: 1, authorName: "P1" })], 2));
    fireEvent.click(next);
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 1, size: 20 })
    );
    expect((await screen.findAllByText("P1")).length).toBeGreaterThan(0);
    expect(within(nav).getByText("Page 2 of 2")).toBeTruthy();

    listMock.mockResolvedValue(page([comment({ commentId: 21, authorName: "P2" })], 2));
    fireEvent.click(prev);
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 0, size: 20 })
    );
    expect((await screen.findAllByText("P2")).length).toBeGreaterThan(0);
  });

  it("clamps back to the last page when a delete empties the trailing page", async () => {
    listMock.mockResolvedValue(
      page([comment({ commentId: 11, isMine: true })], 2)
    );
    asUser();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 1, size: 20 })
    );

    // The refetch after this delete reports a single remaining page — the
    // clamp steps the fetch back to page 0.
    listMock.mockResolvedValue(page([comment({ commentId: 1, authorName: "Root" })], 1));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(11));
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 0, size: 20 })
    );
    // One page left → the nav is gone and the remaining page-0 rows render.
    expect(await screen.findByText("Root")).toBeTruthy();
    expect(screen.queryByTestId("comment-pagination")).toBeNull();
  });
});

describe("comment section — composer (Rev 4: displayName, no alias capture)", () => {
  it("shows the account displayName automatically — no name field, no consent gate, no Cancel; posts body only", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    // The signed-in account name, bold, next to the initials avatar.
    expect(
      within(editor).getByTestId("composer-author-name").textContent
    ).toBe("Ada Lovelace");
    // Informative disclosure only — never a confirmation gate.
    expect(
      within(editor).getByText(
        "Your display name is publicly visible next to your comments."
      )
    ).toBeTruthy();
    // NO alias/display-name input, NO alias consent copy, NO Cancel.
    expect(within(editor).queryByLabelText("Display name")).toBeNull();
    expect(within(editor).queryByTestId("alias-consent")).toBeNull();
    expect(
      within(editor).queryByRole("button", { name: "Cancel" })
    ).toBeNull();

    // Under-bound: blank body keeps submit disabled.
    const submit = within(editor).getByRole("button", {
      name: "Post comment",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    // Rev 4 contract: the create payload is BODY ONLY.
    await waitFor(() => expect(createMock).toHaveBeenCalledWith(7, { body: "First!" }));
  });

  it("disables submit over the 2000-char bound and shows the live count", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    const body = within(editor).getByLabelText("Comment");
    fireEvent.change(body, { target: { value: "x".repeat(2001) } });

    const count = within(editor).getByTestId("comment-char-count");
    expect(count.textContent).toContain("2001/2000");
    expect(count.textContent).toContain(
      "comments must be 2000 characters or fewer."
    );
    expect(
      (within(editor).getByRole("button", { name: "Post comment" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it("clears the composer and announces the posted notice after a success", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    expect(await within(editor).findByText("Comment posted.")).toBeTruthy();
    // The composer still shows the account name — nothing to re-capture.
    expect(
      within(editor).getByTestId("composer-author-name").textContent
    ).toBe("Ada Lovelace");
    expect(
      (within(editor).getByLabelText("Comment") as HTMLTextAreaElement).value
    ).toBe("");
  });

  it("keeps the typed body for a retry when the server rejects with 400 validation", async () => {
    asUser();
    createMock.mockRejectedValue({
      kind: "api",
      status: 400,
      code: "COMMUNITY_VALIDATION_ERROR",
      message: "Validation failed",
      raw: {},
    });
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));

    expect(
      await within(editor).findByText("Comments must be 2000 characters or fewer.")
    ).toBeTruthy();
    expect(
      (within(editor).getByLabelText("Comment") as HTMLTextAreaElement).value
    ).toBe("First!");
  });

  it("keeps the publication-scoped quiz copy when a create hits a 404", async () => {
    asUser();
    createMock.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));

    // The create POST addresses the PUBLICATION — the 404 is the quiz copy.
    expect(
      await within(editor).findByText("This quiz is no longer available.")
    ).toBeTruthy();
    expect(
      within(editor).queryByText("This comment is no longer available.")
    ).toBeNull();
  });
});

describe("comment section — server-backed ownership (isMine)", () => {
  it("shows Edit/Delete on own comments (isMine) and never Report; foreign rows the inverse", async () => {
    listMock.mockResolvedValue(
      page([
        comment({ commentId: 11, authorName: "Ada Lovelace", isMine: true }),
        comment({ commentId: 12, authorName: "Bob", isMine: false }),
      ])
    );
    asUser();
    mount();

    const own = await screen.findByTestId("comment-11");
    expect(within(own).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(own).getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(within(own).queryByRole("button", { name: "Report" })).toBeNull();

    const foreign = screen.getByTestId("comment-12");
    expect(within(foreign).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(foreign).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(foreign).getByRole("button", { name: "Report" })).toBeTruthy();
  });

  it("duplicate author names never grant cross-user controls — ownership is the flag, not the text", async () => {
    // Two rows with the IDENTICAL authorName; only the flagged one is own.
    listMock.mockResolvedValue(
      page([
        comment({ commentId: 11, authorName: "Twin Name", isMine: true }),
        comment({ commentId: 12, authorName: "Twin Name", isMine: false }),
      ])
    );
    asUser();
    mount();

    const own = await screen.findByTestId("comment-11");
    expect(within(own).getByRole("button", { name: "Edit" })).toBeTruthy();
    const foreign = screen.getByTestId("comment-12");
    expect(within(foreign).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(foreign).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(foreign).getByRole("button", { name: "Report" })).toBeTruthy();
    // Both rows still display the same public name.
    expect(within(own).getByText("Twin Name")).toBeTruthy();
    expect(within(foreign).getByText("Twin Name")).toBeTruthy();
  });

  it("edits inline: pre-filled editor, PATCH on Save, edit mode exits after settle", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, isMine: true })]));
    asUser();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const editor = screen.getByTestId("comment-11");
    const textarea = within(editor).getByLabelText("Comment");
    expect((textarea as HTMLTextAreaElement).value).toBe(
      "Great quiz — the section on fractions is spot on."
    );

    fireEvent.change(textarea, { target: { value: "Edited take." } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(11, { body: "Edited take." }));
    await waitFor(() =>
      expect(within(editor).queryByRole("button", { name: "Save" })).toBeNull()
    );
  });

  it("cancel exits the inline editor without traffic (edit-specific Cancel stays)", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, isMine: true })]));
    asUser();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const row = screen.getByTestId("comment-11");
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));
    expect(within(row).queryByRole("button", { name: "Save" })).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deletes an own comment via the idempotent DELETE", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, isMine: true })]));
    asUser();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(11));
  });

  it("surfaces the comment-scoped gone copy when a delete hits a 404", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, isMine: true })]));
    deleteMock.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    asUser();
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    // The DELETE addresses the COMMENT row — not the quiz copy.
    expect(
      await screen.findByText("This comment is no longer available.")
    ).toBeTruthy();
    expect(
      screen.queryByText("This quiz is no longer available.")
    ).toBeNull();
  });
});

describe("comment section — report dialog", () => {
  async function openReport() {
    listMock.mockResolvedValue(
      page([comment({ commentId: 11, authorName: "MathWhiz", isMine: false })])
    );
    asUser();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Report" }));
    return screen.findByRole("dialog");
  }

  it("requires a reason before submit; sends reasonCode and optional details", async () => {
    const dialog = await openReport();
    const submit = within(dialog).getByRole("button", {
      name: "Submit report",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "SPAM" },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.change(within(dialog).getByLabelText(/Details/), {
      target: { value: "Repeated advertising." },
    });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(reportMock).toHaveBeenCalledWith(11, {
        reasonCode: "SPAM",
        details: "Repeated advertising.",
      })
    );
    expect(
      await within(dialog).findByText("Report sent — our moderators will review it.")
    ).toBeTruthy();
  });

  it("blocks details over the 500-char bound", async () => {
    const dialog = await openReport();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "OTHER" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Details/), {
      target: { value: "x".repeat(501) },
    });
    expect(
      (within(dialog).getByRole("button", { name: "Submit report" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(within(dialog).getByTestId("report-details-count").textContent).toContain(
      "501/500"
    );
  });
});

describe("comment section — safe rendering", () => {
  it("renders only the §5 DTO fields — poisoned fixture identity never reaches the DOM", async () => {
    listMock.mockResolvedValue(
      page([
        comment({
          commentId: 11,
          authorName: "MathWhiz",
          body: "plain text <img src=x onerror=alert(1)> & ${jndi:ldap://x}",
          // Poisoned extras that MUST NOT render:
          authorAlias: "LegacyAlias",
          authorUserId: 42,
          authorEmail: "secret@example.com",
          authorUsername: "ada",
          userId: 1,
        } as unknown as CommunityComment),
      ])
    );
    mount();

    await screen.findByTestId("comment-11");
    const html = document.body.innerHTML;
    for (const forbidden of [
      "authorUserId",
      "authorEmail",
      "secret@example.com",
      "authorUsername",
      "authorAlias",
      "LegacyAlias",
      "userId",
    ]) {
      expect(html).not.toContain(forbidden);
    }
    // The markup in the body renders as inert TEXT, never as elements.
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/plain text/).textContent).toContain("<img src=x");
  });
});

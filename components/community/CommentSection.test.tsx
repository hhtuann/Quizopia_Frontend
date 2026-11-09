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
 * P3-C4 (#68) — the community discussion section. List render + pagination
 * + empty/error/retry, the create flow (char-count bounds, disabled states,
 * first-comment alias capture + §4 consent copy, alias-taken 409 copy,
 * collapse after the first success), own edit/delete vs foreign-report
 * (alias-set heuristic — an in-session alias change keeps older own rows
 * editable), the report dialog's validation, and poisoned-
 * fixture leak checks — the §5 DTO renders authorAlias/body only, never any
 * user identity.
 */

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Real classifiers/aliases, mocked transport only — the hooks stay real so
// keying, invalidation and the cache-only alias entry are exercised.
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
    authorAlias: "MathWhiz",
    body: "Great quiz — the section on fractions is spot on.",
    createdAt: "2026-11-01T10:00:00Z",
    editedAt: null,
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
  createMock.mockResolvedValue(comment({ authorAlias: "Ada" }));
  updateMock.mockResolvedValue(comment());
  deleteMock.mockResolvedValue(undefined);
  reportMock.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("comment section — list states", () => {
  it("renders newest-first items (alias, timestamp, edited marker, body) for guests with a login CTA, no actions", async () => {
    listMock.mockResolvedValue(
      page([
        comment({
          commentId: 11,
          authorAlias: "MathWhiz",
          body: "Newest take.",
          createdAt: "2026-11-02T10:00:00Z",
        }),
        comment({
          commentId: 10,
          authorAlias: "Bob",
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
    expect(within(section).getByText("(edited)")).toBeTruthy();
    expect(
      within(section).getByText("Great quiz — the section on fractions is spot on.")
    ).toBeTruthy();

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
      page([comment({ commentId: 21, authorAlias: "P2" })], 2)
    );
    mount();

    const nav = await screen.findByTestId("comment-pagination");
    const prev = within(nav).getByRole("button", { name: "Previous" });
    const next = within(nav).getByRole("button", { name: "Next" });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect(within(nav).getByText("Page 1 of 2")).toBeTruthy();

    listMock.mockResolvedValue(page([comment({ commentId: 1, authorAlias: "P1" })], 2));
    fireEvent.click(next);
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 1, size: 20 })
    );
    expect(await screen.findByText("P1")).toBeTruthy();
    expect(within(nav).getByText("Page 2 of 2")).toBeTruthy();

    listMock.mockResolvedValue(page([comment({ commentId: 21, authorAlias: "P2" })], 2));
    fireEvent.click(prev);
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 0, size: 20 })
    );
    expect(await screen.findByText("P2")).toBeTruthy();
  });

  it("clamps back to the last page when a delete empties the trailing page", async () => {
    listMock.mockResolvedValue(
      page([comment({ commentId: 11, authorAlias: "MathWhiz" })], 2)
    );
    asUser();
    // Seed the alias so the item is the caller's own (deletable).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["community", "comments", "my-alias"], ["MathWhiz"]);
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <CommentSection publicationId={7} loginHref={LOGIN_HREF} />
        </QueryClientProvider>
      </StrictMode>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(7, { page: 1, size: 20 })
    );

    // The refetch after this delete reports a single remaining page — the
    // clamp steps the fetch back to page 0.
    listMock.mockResolvedValue(page([comment({ commentId: 1, authorAlias: "Root" })], 1));
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

describe("comment section — create flow + alias capture", () => {
  it("captures the alias on the first comment with the §4 consent copy", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    expect(within(editor).getByLabelText("Display name")).toBeTruthy();
    expect(
      within(editor).getByText("This name is publicly visible next to your comments.")
    ).toBeTruthy();

    // Under-bound: blank body/alias keep submit disabled.
    const submit = within(editor).getByRole("button", {
      name: "Post comment",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Ada" },
    });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(7, { body: "First!", alias: "Ada" })
    );
  });

  it("disables submit over the 2000-char bound and shows the live count", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Ada" },
    });
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

  it("collapses the alias field after the first success and re-shows consent on change", async () => {
    asUser();
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Ada" },
    });
    const body = within(editor).getByLabelText("Comment");
    fireEvent.change(body, { target: { value: "First!" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    // Success: notice + collapsed capture ("Posting as …", no consent copy).
    expect(await within(editor).findByText("Comment posted.")).toBeTruthy();
    expect(await within(editor).findByText("Posting as")).toBeTruthy();
    expect(within(editor).queryByLabelText("Display name")).toBeNull();
    expect(
      within(editor).queryByText("This name is publicly visible next to your comments.")
    ).toBeNull();

    // §4 re-consent: changing the name re-opens the field + consent copy.
    fireEvent.click(within(editor).getByRole("button", { name: "Change" }));
    const aliasField = within(editor).getByLabelText("Display name");
    expect(
      within(editor).queryByText("This name is publicly visible next to your comments.")
    ).toBeNull(); // identical value ⇒ no change ⇒ no consent copy
    fireEvent.change(aliasField, { target: { value: "Ada Lovelace" } });
    expect(
      within(editor).getByText("This name is publicly visible next to your comments.")
    ).toBeTruthy();
  });

  it("surfaces the alias-taken 409 copy and keeps the typed values for a retry", async () => {
    asUser();
    createMock.mockRejectedValue({
      kind: "api",
      status: 409,
      code: "COMMUNITY_ALIAS_TAKEN",
      message: "Alias taken",
      raw: {},
    });
    mount();

    const editor = await screen.findByTestId("comment-editor");
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "MathWhiz" },
    });
    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "First!" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));

    expect(
      await within(editor).findByText(
        "That display name is already taken — try a different one."
      )
    ).toBeTruthy();
    expect(
      (within(editor).getByLabelText("Display name") as HTMLInputElement).value
    ).toBe("MathWhiz");
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
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Ada" },
    });
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

describe("comment section — own edit/delete vs foreign report", () => {
  function mountAuthedWithAlias(alias: string | null) {
    asUser();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (alias != null) {
      qc.setQueryData(["community", "comments", "my-alias"], [alias]);
    }
    return render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <CommentSection publicationId={7} loginHref={LOGIN_HREF} />
        </QueryClientProvider>
      </StrictMode>
    );
  }

  it("shows Edit/Delete on own comments (alias match) and never Report; foreign rows the inverse", async () => {
    listMock.mockResolvedValue(
      page([
        comment({ commentId: 11, authorAlias: "Ada" }),
        comment({ commentId: 12, authorAlias: "Bob" }),
      ])
    );
    mountAuthedWithAlias("Ada");

    const own = await screen.findByTestId("comment-11");
    expect(within(own).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(own).getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(within(own).queryByRole("button", { name: "Report" })).toBeNull();

    const foreign = screen.getByTestId("comment-12");
    expect(within(foreign).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(foreign).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(foreign).getByRole("button", { name: "Report" })).toBeTruthy();
  });

  it("without a known alias nothing is treated as own (server remains the truth)", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    mountAuthedWithAlias(null);

    const row = await screen.findByTestId("comment-11");
    expect(within(row).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(row).getByRole("button", { name: "Report" })).toBeTruthy();
  });

  it("edits inline: pre-filled editor, PATCH on Save, edit mode exits after settle", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    mountAuthedWithAlias("Ada");

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

  it("cancel exits the inline editor without traffic", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    mountAuthedWithAlias("Ada");

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const row = screen.getByTestId("comment-11");
    // The create editor's Cancel stays distinct — scope to the row.
    fireEvent.click(within(row).getByRole("button", { name: "Cancel" }));
    expect(within(row).queryByRole("button", { name: "Save" })).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("deletes an own comment via the idempotent DELETE", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    mountAuthedWithAlias("Ada");

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(11));
  });

  it("alias SET: an in-session alias change keeps older own rows editable", async () => {
    asUser();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["community", "comments", "my-alias"], ["Ada"]);
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <CommentSection publicationId={7} loginHref={LOGIN_HREF} />
        </QueryClientProvider>
      </StrictMode>
    );

    // Own row under the previously stored alias.
    const older = await screen.findByTestId("comment-11");
    expect(within(older).getByRole("button", { name: "Edit" })).toBeTruthy();

    // §4 alias change: post once under a new name — the create APPENDS the
    // stored snapshot to the set (it must not replace the older entry).
    createMock.mockResolvedValue(comment({ commentId: 13, authorAlias: "Grace" }));
    listMock.mockResolvedValue(
      page([
        comment({ commentId: 13, authorAlias: "Grace" }),
        comment({ commentId: 11, authorAlias: "Ada" }),
      ])
    );
    const editor = screen.getByTestId("comment-editor");
    fireEvent.click(within(editor).getByRole("button", { name: "Change" }));
    fireEvent.change(within(editor).getByLabelText("Display name"), {
      target: { value: "Grace" },
    });
    fireEvent.change(within(editor).getByLabelText("Comment"), {
      target: { value: "New name, same me." },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    // After the settle-refetch BOTH aliases are recognised as own — the
    // older row keeps Edit/Delete instead of falling back to Report — and
    // the editor credits the CURRENT (last-appended) alias.
    const olderRow = await screen.findByTestId("comment-11");
    expect(within(olderRow).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(olderRow).getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(within(olderRow).queryByRole("button", { name: "Report" })).toBeNull();
    const newRow = screen.getByTestId("comment-13");
    expect(within(newRow).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(within(editor).getByText("Grace")).toBeTruthy();
  });

  it("surfaces the comment-scoped gone copy when a delete hits a 404", async () => {
    listMock.mockResolvedValue(page([comment({ commentId: 11, authorAlias: "Ada" })]));
    deleteMock.mockRejectedValue({
      kind: "api",
      status: 404,
      code: "COMMUNITY_NOT_FOUND",
      message: "Not found",
      raw: {},
    });
    mountAuthedWithAlias("Ada");

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
    asUser();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <CommentSection publicationId={7} loginHref={LOGIN_HREF} />
        </QueryClientProvider>
      </StrictMode>
    );
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
          authorAlias: "MathWhiz",
          body: "plain text <img src=x onerror=alert(1)> & ${jndi:ldap://x}",
          // Poisoned extras that MUST NOT render:
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
      "userId",
    ]) {
      expect(html).not.toContain(forbidden);
    }
    // The markup in the body renders as inert TEXT, never as elements.
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/plain text/).textContent).toContain("<img src=x");
  });
});

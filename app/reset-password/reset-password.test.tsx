// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";
import { passwordApi } from "@/lib/api/password";
import { useAuthStore } from "@/lib/auth/store";

vi.mock("@/lib/api/password", () => ({
  passwordApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() },
}));

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const TOKEN = "top-secret-reset-token";
const NEW_PASSWORD = "brand-new-password";

function mountPage() {
  return render(
    <StrictMode>
      <ResetPasswordPage />
    </StrictMode>,
  );
}

async function mountWithToken() {
  window.location.hash = `#token=${TOKEN}`;
  mountPage();
  await screen.findByRole("button", { name: "Reset password" });
}

function fillAndSubmit(newPassword: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirmPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

/** No storage slot may ever hold the reset token. */
function expectTokenNowhere() {
  expect(window.location.hash).toBe("");
  expect(window.location.search).not.toContain(TOKEN);
  for (const storage of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < storage.length; i += 1) {
      expect(storage.getItem(storage.key(i) ?? "")).not.toContain(TOKEN);
    }
  }
}

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  originalFetch = window.fetch;
  window.fetch = vi.fn().mockResolvedValue(undefined) as unknown as typeof fetch;
  window.location.hash = "";
  useAuthStore.setState({ accessToken: null, user: null, status: "unauthenticated" });
});
afterEach(() => {
  cleanup();
  // jsdom runs without fetch; restore only when the environment provided one
  // (the stub is reinstalled by beforeEach, and test files are isolated).
  if (originalFetch) window.fetch = originalFetch;
});

describe("reset-password page", () => {
  it("strips the fragment before any network call, keeps the token only in memory, and uses it on submit", async () => {
    await mountWithToken();

    // Stripped synchronously on mount — before any network activity.
    expect(window.location.hash).toBe("");
    expect(window.fetch).not.toHaveBeenCalled();
    expect(passwordApi.resetPassword).not.toHaveBeenCalled();

    vi.mocked(passwordApi.resetPassword).mockResolvedValue(undefined);
    fillAndSubmit(NEW_PASSWORD, NEW_PASSWORD);

    await waitFor(() => expect(passwordApi.resetPassword).toHaveBeenCalledOnce());
    // The StrictMode-safe ref retained the captured token for the submit…
    expect(passwordApi.resetPassword).toHaveBeenCalledWith({
      token: TOKEN,
      newPassword: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    // …and it never reappears in the URL or any storage.
    expectTokenNowhere();
  });

  it("shows the missing-token state with a request-new link", async () => {
    mountPage();
    expect((await screen.findByRole("alert")).textContent).toContain("incomplete");
    expect(
      screen.getByRole("link", { name: "Request a new link" }).getAttribute("href"),
    ).toBe("/forgot-password");
    expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();

    cleanup();
    window.location.hash = "#token=";
    mountPage();
    expect((await screen.findByRole("alert")).textContent).toContain("incomplete");
    expect(passwordApi.resetPassword).not.toHaveBeenCalled();
  });

  it("blocks weak and mismatched passwords client-side without calling the API", async () => {
    await mountWithToken();

    fillAndSubmit("short", "short");
    expect(await screen.findByText("Use at least 8 characters.")).toBeTruthy();
    expect(passwordApi.resetPassword).not.toHaveBeenCalled();

    fillAndSubmit("a-long-enough-password", "a-different-password");
    expect(await screen.findByText("Both new password entries must match.")).toBeTruthy();
    expect(passwordApi.resetPassword).not.toHaveBeenCalled();
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("maps a server 400 to the single generic retry state with a request-new CTA", async () => {
    await mountWithToken();
    vi.mocked(passwordApi.resetPassword).mockRejectedValue({
      kind: "api",
      status: 400,
      code: "AUTH_PASSWORD_RESET_INVALID",
      message: "reset token rejected",
      raw: {},
    });

    fillAndSubmit(NEW_PASSWORD, NEW_PASSWORD);

    await waitFor(() =>
      expect(screen.getByText(/invalid, expired, or has already been used/)).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: "Request a new link" }).getAttribute("href"),
    ).toBe("/forgot-password");
    // One shared state — the form (and any distinguishing detail) is gone.
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("on success clears local auth, redirects to the login success notice, and persists no token", async () => {
    useAuthStore.setState({
      accessToken: "stale-access-token",
      user: {
        id: 1,
        username: "alice",
        email: "alice@example.com",
        roles: ["STUDENT"],
      } as never,
      status: "authenticated",
    });
    vi.mocked(passwordApi.resetPassword).mockResolvedValue(undefined);
    await mountWithToken();

    fillAndSubmit(NEW_PASSWORD, NEW_PASSWORD);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?passwordReset=1"));
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    // Reset never auto-logs-in: no token exchange, nothing persisted anywhere.
    expect(window.fetch).not.toHaveBeenCalled();
    expectTokenNowhere();
  });
});

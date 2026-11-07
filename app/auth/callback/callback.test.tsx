// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OAuthCallbackPage from "./page";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { authApi } from "@/lib/auth";
import { invalidateSession } from "@/lib/auth/store";
import type { TokenResponse } from "@/lib/auth/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("code=one-time-code"),
}));
// The page consumes the barrel (`@/lib/auth`), so mock it there while keeping
// the real store/generation helpers for the race assertions.
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  authApi: { exchangeOauthCode: vi.fn() },
}));

const token = { accessToken: "t" } as TokenResponse;

function mountPage() {
  const qc = new QueryClient();
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <OAuthCallbackPage />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  invalidateSession();
});
afterEach(cleanup);

describe("OAuth callback", () => {
  it("exchanges exactly once despite StrictMode double-invoked effects", async () => {
    vi.mocked(authApi.exchangeOauthCode).mockResolvedValue(token);
    mountPage();
    await waitFor(() => expect(authApi.exchangeOauthCode).toHaveBeenCalledOnce());
  });

  it("shows the retry state when the exchange fails in the current session", async () => {
    vi.mocked(authApi.exchangeOauthCode).mockRejectedValue(new Error("bad code"));
    mountPage();
    await waitFor(() => {
      expect(document.body.textContent ?? "").toContain("Sign-in failed");
    });
  });

  it("stays silent when the exchange resolves after the session was invalidated", async () => {
    const { promise, resolve: release } = Promise.withResolvers<TokenResponse>();
    vi.mocked(authApi.exchangeOauthCode).mockReturnValue(promise);
    mountPage();
    await waitFor(() => expect(authApi.exchangeOauthCode).toHaveBeenCalledOnce());
    invalidateSession();
    release(token);
    await Promise.resolve();
    expect(document.body.textContent ?? "").not.toContain("Sign-in failed");
  });
});

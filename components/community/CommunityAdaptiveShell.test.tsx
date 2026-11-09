// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import { CommunityAdaptiveShell } from "./CommunityAdaptiveShell";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="authenticated-app-shell">{children}</div>
  ),
}));
vi.mock("@/components/layout/PublicHeader", () => ({
  PublicHeader: () => <div data-testid="guest-public-header">Guest header</div>,
}));
vi.mock("@/components/auth/RequireAuth", () => ({
  AuthLoader: () => <div role="status">Checking session…</div>,
}));

afterEach(cleanup);

function show(status: "loading" | "authenticated" | "unauthenticated") {
  vi.mocked(useAuth).mockReturnValue({ status } as ReturnType<typeof useAuth>);
  render(
    <CommunityAdaptiveShell>
      <p>Public catalog</p>
    </CommunityAdaptiveShell>
  );
}

describe("CommunityAdaptiveShell", () => {
  it("waits for auth bootstrap, avoiding a login/register flash", () => {
    show("loading");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByTestId("guest-public-header")).toBeNull();
    expect(screen.queryByTestId("authenticated-app-shell")).toBeNull();
  });

  it("shows the full authenticated shell when signed in", () => {
    show("authenticated");
    expect(screen.getByTestId("authenticated-app-shell")).toBeTruthy();
    expect(screen.queryByTestId("guest-public-header")).toBeNull();
    expect(screen.getByText("Public catalog")).toBeTruthy();
  });

  it("keeps the catalog public for anonymous visitors", () => {
    show("unauthenticated");
    expect(screen.getByTestId("guest-public-header")).toBeTruthy();
    expect(screen.queryByTestId("authenticated-app-shell")).toBeNull();
    expect(screen.getByText("Public catalog")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedShell } from "./AuthenticatedShell";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/layout/AppShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

const authMock = vi.mocked(useAuth);
/** Minimal auth-state surface RequireAuth reads (status + user roles). */
interface AuthStateStub {
  status: "loading" | "unauthenticated" | "authenticated";
  user: { roles: string[]; displayName: string } | null;
}

function stubAuth(status: AuthStateStub["status"], roles: string[] | null) {
  authMock.mockReturnValue({
    status,
    user: roles ? { roles, displayName: "U" } : null,
  } as never);
}

/**
 * P2-D TL finding D-FE-01: the shared-session route must be reachable for
 * every authenticated capability holder — TEACHER-only (V16 dual capability),
 * STUDENT-only, and dual-role — because the SERVER eligibility/start policy
 * is the authorizer, not the route group.
 */
describe("AuthenticatedShell", () => {
  afterEach(() => {
    cleanup();
    authMock.mockReset();
  });

  it("renders children for a TEACHER-only user (no STUDENT role)", () => {
    stubAuth("authenticated", ["TEACHER"]);
    render(
      <AuthenticatedShell>
        <p>landing</p>
      </AuthenticatedShell>
    );
    expect(screen.getByText("landing")).not.toBeNull();
    expect(screen.getByTestId("app-shell")).not.toBeNull();
  });

  it("renders children for STUDENT-only and dual-role users", () => {
    stubAuth("authenticated", ["STUDENT"]);
    const first = render(
      <AuthenticatedShell>
        <p>a</p>
      </AuthenticatedShell>
    );
    expect(screen.getByText("a")).not.toBeNull();
    first.unmount();

    stubAuth("authenticated", ["STUDENT", "TEACHER"]);
    render(
      <AuthenticatedShell>
        <p>b</p>
      </AuthenticatedShell>
    );
    expect(screen.getByText("b")).not.toBeNull();
  });

  it("shows the loader and never renders children while unauthenticated", () => {
    stubAuth("unauthenticated", null);
    render(
      <AuthenticatedShell>
        <p>landing</p>
      </AuthenticatedShell>
    );
    expect(screen.queryByText("landing")).toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
  });
});

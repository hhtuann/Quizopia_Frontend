// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Header from "./Header";
import { useAuth } from "@/hooks/useAuth";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authApi: { providers: vi.fn().mockResolvedValue({ googleEnabled: false }) } }));
vi.mock("@/lib/view/store", () => ({ useActiveView: () => ({ view: "student", canStudent: true, canTeacher: true }) }));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./WorkspaceSwitcher", () => ({ WorkspaceSwitcher: () => null }));
vi.mock("@/components/teacher/exam-editor/ConfirmDialog", () => ({ ConfirmDialog: () => null }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function stubUser(displayName = "Ada Lovelace") {
  vi.mocked(useAuth).mockReturnValue({ user: { displayName, username: "ada", roles: ["STUDENT", "TEACHER"], email: "ada@example.com", googleLinked: false }, logout: vi.fn(), refreshUser: vi.fn() } as never);
}

describe("Header profile menu", () => {
  it("keeps roving keyboard focus and Escape return with the active profile action", async () => {
    stubUser();
    const closeMobile = vi.fn();
    render(<Header isMobileMenuOpen={false} setIsMobileMenuOpen={closeMobile} />);
    const trigger = screen.getByRole("button", { name: "Tài khoản" });
    fireEvent.click(trigger);
    const profile = screen.getByRole("menuitem", { name: "Hồ sơ" });
    await waitFor(() => expect(document.activeElement).toBe(profile));
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(profile, { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Hồ sơ" }));
    expect(push).toHaveBeenCalledWith("/profile");
    expect(closeMobile).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("renders the refreshed display name and initials from shared identity", () => {
    stubUser();
    const view = render(<Header isMobileMenuOpen={false} setIsMobileMenuOpen={vi.fn()} />);
    expect(screen.getByText("AL")).not.toBeNull();
    stubUser("Grace Hopper");
    view.rerender(<Header isMobileMenuOpen={false} setIsMobileMenuOpen={vi.fn()} />);
    expect(screen.getByText("GH")).not.toBeNull();
    expect(screen.getByText("Grace Hopper")).not.toBeNull();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
  });
});

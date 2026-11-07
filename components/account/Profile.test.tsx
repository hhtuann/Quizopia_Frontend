// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Profile } from "./Profile";
import { useAuth } from "@/hooks/useAuth";
import { updateProfile } from "@/lib/api/account";
import type { CurrentUserResponse } from "@/lib/auth/types";
import { invalidateSession } from "@/lib/auth/store";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api/account", () => ({ updateProfile: vi.fn() }));
const user: CurrentUserResponse = { id: 1, username: "ada", displayName: "Ada Lovelace", email: "ada@example.com", phone: "+1234567890", status: "ACTIVE", emailVerified: true, googleLinked: true, roles: ["TEACHER"], permissions: [] };
const refreshUser = vi.fn();
const saveButton = () => screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ user, refreshUser } as never);
  vi.mocked(updateProfile).mockResolvedValue(user);
  refreshUser.mockResolvedValue(user);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("Profile", () => {
  it("shows owner information, indicators, and initials without editable identity fields", () => {
    render(<Profile />);
    for (const value of ["ada", "ada@example.com", "TEACHER", "ACTIVE", "Email verified", "Google linked", "AL"]) expect(screen.getByText(value)).not.toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(saveButton().disabled).toBe(true);
  });
  it("shows absent indicators and a loading state", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { ...user, emailVerified: false, googleLinked: false, phone: null }, refreshUser } as never);
    const view = render(<Profile />);
    expect(screen.getByText("Email not verified")).not.toBeNull();
    expect(screen.getByText("Google not linked")).not.toBeNull();
    expect((screen.getByLabelText("Phone number (optional)") as HTMLInputElement).value).toBe("");
    vi.mocked(useAuth).mockReturnValue({ user: null, refreshUser } as never);
    view.rerender(<Profile />);
    expect(screen.getByRole("status").textContent).toContain("Loading");
  });
  it("cancels dirty edits without a request", async () => {
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Changed" } });
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe(user.displayName);
    expect(saveButton().disabled).toBe(true);
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it("saves normalized editable values only and refreshes shared identity", async () => {
    const updated = { ...user, displayName: "Grace Hopper", phone: null };
    vi.mocked(updateProfile).mockResolvedValue(updated);
    refreshUser.mockResolvedValue(updated);
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " Grace Hopper " } });
    fireEvent.change(screen.getByLabelText("Phone number (optional)"), { target: { value: "" } });
    fireEvent.click(saveButton());
    await screen.findByText("Profile saved.");
    expect(updateProfile).toHaveBeenCalledWith({ displayName: "Grace Hopper", phone: null });
    expect(refreshUser).toHaveBeenCalledOnce();
    expect(saveButton().disabled).toBe(true);
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Grace Hopper");
  });
  it("blocks invalid input before the request", async () => {
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "   " } });
    fireEvent.click(saveButton());
    await screen.findByText("Display name is required.");
    expect(updateProfile).not.toHaveBeenCalled();
  });
  it.each([
    [{ kind: "network" }, "Network error"],
    [{ kind: "api", status: 423 }, "temporarily locked"],
    [{ kind: "api", status: 400 }, "Check your display name"],
    [{ kind: "http", status: 500 }, "Could not save"],
  ])("keeps dirty edits after a failed save", async (failure, message) => {
    vi.mocked(updateProfile).mockRejectedValue(failure);
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Changed");
    await waitFor(() => expect(saveButton().disabled).toBe(false));
    expect(refreshUser).not.toHaveBeenCalled();
  });
  it("does not refresh or accept a save completed after session invalidation", async () => {
    const { promise, resolve } = Promise.withResolvers<CurrentUserResponse>();
    vi.mocked(updateProfile).mockReturnValue(promise);
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledOnce());
    invalidateSession();
    await act(async () => resolve({ ...user, displayName: "Stale response" }));
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.queryByText("Profile saved.")).toBeNull();
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Changed");
  });
  it("disables editing and duplicate submission while saving", async () => {
    const { promise, resolve: finish } = Promise.withResolvers<CurrentUserResponse>();
    vi.mocked(updateProfile).mockReturnValue(promise);
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByLabelText("Display name") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(user));
  });
  it("distinguishes a saved profile from a failed identity refresh and retries only the read", async () => {
    refreshUser.mockRejectedValueOnce(new Error("offline"));
    render(<Profile />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Changed" } });
    fireEvent.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toContain("Your profile was saved");
    await waitFor(() => expect((screen.getByRole("button", { name: "Refresh account display" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh account display" }));
    await screen.findByText("Profile saved.");
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(refreshUser).toHaveBeenCalledTimes(2);
  });
});

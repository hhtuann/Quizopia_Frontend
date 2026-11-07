// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage, { NEUTRAL_CONFIRMATION } from "./page";
import { passwordApi } from "@/lib/api/password";

vi.mock("@/lib/api/password", () => ({
  passwordApi: { forgotPassword: vi.fn(), resetPassword: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("forgot-password page", () => {
  it("shows the identical neutral confirmation for different emails", async () => {
    vi.mocked(passwordApi.forgotPassword).mockResolvedValue(undefined);

    render(
      <StrictMode>
        <ForgotPasswordPage />
      </StrictMode>,
    );
    submitEmail("alice@example.com");
    await waitFor(() => expect(screen.getByRole("status")).toBeDefined());

    const firstConfirmation = screen.getByRole("status").textContent;
    expect(firstConfirmation).toBe(NEUTRAL_CONFIRMATION);
    // No echo of the submitted address — nothing account-specific at all.
    expect(firstConfirmation).not.toContain("alice@example.com");
    expect(passwordApi.forgotPassword).toHaveBeenCalledWith("alice@example.com");

    cleanup();
    render(
      <StrictMode>
        <ForgotPasswordPage />
      </StrictMode>,
    );
    submitEmail("bob.smith@other.org");
    await waitFor(() => expect(screen.getByRole("status")).toBeDefined());

    expect(screen.getByRole("status").textContent).toBe(firstConfirmation);
    expect(screen.getByRole("status").textContent).not.toContain("bob.smith@other.org");
  });

  it("blocks a syntactically invalid email with an accessible error and never calls the API", async () => {
    render(
      <StrictMode>
        <ForgotPasswordPage />
      </StrictMode>,
    );
    submitEmail("not-an-email");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("valid email");
    expect(passwordApi.forgotPassword).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("disables the resend action for the cooldown countdown after a submit", async () => {
    vi.mocked(passwordApi.forgotPassword).mockResolvedValue(undefined);

    render(
      <StrictMode>
        <ForgotPasswordPage />
      </StrictMode>,
    );
    submitEmail("alice@example.com");

    const resend = await screen.findByRole("button", { name: /Resend link/ });
    expect(resend).toHaveProperty("disabled", true);
    expect(resend.textContent).toMatch(/Resend link \(60s\)/);
  });
});

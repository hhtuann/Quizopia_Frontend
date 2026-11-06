// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionShareCard } from "./SessionShareCard";

describe("SessionShareCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(cleanup);

  function copyButton() {
    return screen.getByRole("button", { name: "Copy participant link" });
  }

  it("renders the stable participant link with the session id", () => {
    render(<SessionShareCard sessionId={42} visibility="PUBLIC" />);
    const out = screen.getByLabelText("Participant link");
    expect(out.textContent).toContain("/sessions/42");
  });

  it("describes PUBLIC vs CLASS_RESTRICTED access", () => {
    const { unmount } = render(<SessionShareCard sessionId={1} visibility="PUBLIC" />);
    expect(screen.getByText(/Any signed-in platform member/i)).not.toBeNull();
    unmount();

    render(<SessionShareCard sessionId={2} visibility="CLASS_RESTRICTED" />);
    expect(screen.getByText(/members of the assigned classes/i)).not.toBeNull();
  });

  it("copies via the clipboard API and shows confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SessionShareCard sessionId={7} visibility="CLASS_RESTRICTED" />);
    fireEvent.click(copyButton());

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/sessions/7")));
    expect(await screen.findByText(/Link copied/i)).not.toBeNull();
  });

  it("falls back to the legacy copy path when the clipboard API rejects", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as typeof document.execCommand;

    render(<SessionShareCard sessionId={9} visibility="PUBLIC" />);
    fireEvent.click(copyButton());

    await waitFor(() => expect(execCommand).toHaveBeenCalled());
    expect(await screen.findByText(/Link copied/i)).not.toBeNull();
  });

  it("shows a manual-copy hint when both copy strategies fail", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    document.execCommand = vi.fn().mockReturnValue(false) as typeof document.execCommand;

    render(<SessionShareCard sessionId={11} visibility="PUBLIC" />);
    fireEvent.click(copyButton());

    expect(await screen.findByRole("alert")).not.toBeNull();
  });
});

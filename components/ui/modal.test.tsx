// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ModalShell } from "./modal";

/**
 * ModalShell (shared create-flow dialog) — Create Class visual contract with
 * the CommunityDialog a11y baseline: Esc/backdrop/X close, focus lands on the
 * panel, Tab cycles inside (trap), focus returns to the opener, background
 * scroll locks while open, and `busy` suppresses dismissal.
 */

function Harness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open modal
      </button>
      {open && (
        <ModalShell title="Test modal" onClose={() => setOpen(false)} busy={busy}>
          <input aria-label="First field" />
          <button type="button">Last button</button>
        </ModalShell>
      )}
    </div>
  );
}

afterEach(cleanup);

describe("ModalShell — close affordances", () => {
  it("closes on Escape and restores focus to the opener", () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    const opener = screen.getByRole("button", { name: "Open modal" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Focus moved into the panel on open.
    expect(document.activeElement).toBe(dialog.querySelector('div[tabindex="-1"]'));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes on backdrop click and via the X button", () => {
    const { unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    const dialog = screen.getByRole("dialog");
    // Backdrop is the first child covering the viewport.
    fireEvent.click(dialog.children[0]);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
  });

  it("suppresses Escape and backdrop close while busy", () => {
    render(
      <StrictMode>
        <Harness busy />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(dialog.children[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("ModalShell — focus trap and scroll lock", () => {
  it("cycles Tab within the panel", () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));

    // DOM order: X close button (header) → input → "Last button".
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last button" });

    // Tab from the last focusable wraps to the first.
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first wraps to the last.
    first.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks the body scroll while open and restores it on close", () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );
    fireEvent.click(screen.getByRole("button", { name: "Open modal" }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CommunityDialog } from "./CommunityDialog";

/**
 * Fix round (#43/#44) — CommunityDialog focus restore (WAI-ARIA modal
 * pattern): the element focused when the dialog opens regains focus when the
 * dialog closes (open → false, still mounted) and when it unmounts while
 * open (the `{dialog && <Dialog/>}` mounting style the pages use).
 */

function Harness({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {show && (
        <CommunityDialog
          open={open}
          titleId="dialog-title"
          title="Test dialog"
          onCancel={() => setOpen(false)}
        >
          <p>Dialog body</p>
        </CommunityDialog>
      )}
    </div>
  );
}

afterEach(cleanup);

describe("CommunityDialog — focus restore", () => {
  it("returns focus to the opener when the dialog closes", () => {
    render(
      <StrictMode>
        <Harness show />
      </StrictMode>
    );
    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog");
    // Focus moved into the panel on open…
    expect(document.activeElement).toBe(
      dialog.querySelector('div[tabindex="-1"]')
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    // …and returns to the opener on close.
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the opener when unmounted while open", () => {
    const { rerender } = render(
      <StrictMode>
        <Harness show />
      </StrictMode>
    );
    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Parent drops the dialog subtree while it is still open.
    rerender(
      <StrictMode>
        <Harness show={false} />
      </StrictMode>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

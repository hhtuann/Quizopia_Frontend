"use client";

import { useEffect, useState } from "react";
import { Badge, Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/** Deep-link URL for a session: stable locator, server authorizes access. */
export function sessionShareUrl(sessionId: number): string {
  return `${typeof window === "undefined" ? "" : window.location.origin}/sessions/${sessionId}`;
}

/**
 * Copy-to-clipboard with a graceful fallback for non-secure contexts
 * (document.execCommand). Resolves false when both strategies fail.
 */
export async function copyShareLink(url: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

/**
 * Teacher-side share affordance (P2-D, issue #20): shows the stable
 * participant link for the session and a copy action. The link is a locator,
 * NEVER a credential — every access is authorized server-side by the
 * eligibility/start policy.
 */
export function SessionShareCard({
  sessionId,
  visibility,
}: {
  sessionId: number;
  visibility: "PUBLIC" | "CLASS_RESTRICTED";
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = sessionShareUrl(sessionId);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const handle = setTimeout(() => setCopied(false), 4000);
    return () => clearTimeout(handle);
  }, [copied]);

  const onCopy = async () => {
    setFailed(false);
    const ok = await copyShareLink(url);
    if (ok) {
      setCopied(true);
    } else {
      setFailed(true);
    }
  };

  return (
    <div className={cn(cardVariants(), "p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
            Share session
          </h2>
          <p className="mt-1 text-xs font-medium text-[#64748B]">
            {visibility === "PUBLIC"
              ? "Any signed-in platform member can open this link while the session is running."
              : "Only members of the assigned classes can open this link."}
          </p>
        </div>
        <Badge variant={visibility === "PUBLIC" ? "accent" : "default"}>
          {visibility === "PUBLIC" ? "Public" : "Class-restricted"}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <output
          aria-label="Participant link"
          className="min-w-0 flex-1 truncate rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 font-mono text-sm text-[#0F172A]"
        >
          {url}
        </output>
        <Button type="button" onClick={onCopy} aria-label="Copy participant link">
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>

      {copied && (
        <p role="status" className="mt-3 text-xs font-medium text-[#10B981]">
          Link copied — share it with your participants.
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-xs font-medium text-[#EF4444]">
          Couldn&apos;t copy automatically — select the link above and copy it manually.
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useSyncExternalStore } from "react";

const noop = () => () => {};

export function CopyInvite({ code, expiresAt }: { code: string; expiresAt: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/invite/${code}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Show Tracker", url });
        return;
      } catch {
        // Cancelled: fall back to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={share} className="btn-primary shrink-0">
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Works until {new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
      </p>
    </div>
  );
}

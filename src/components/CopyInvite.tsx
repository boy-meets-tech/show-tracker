"use client";

import { useState, useSyncExternalStore } from "react";
import posthog from "posthog-js";

const noop = () => () => {};
const STORAGE_KEY = "invite-message";
const DEFAULT_MESSAGE =
  "I'm using Show Tracker to keep track of what I'm watching. Join me so we can see each other's shows and swap recommendations!";

function savedMessage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function CopyInvite({ code, expiresAt }: { code: string; expiresAt: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const stored = useSyncExternalStore(noop, savedMessage, () => null);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = `${origin}/invite/${code}`;
  const message = edited ?? stored ?? DEFAULT_MESSAGE;

  function updateMessage(value: string) {
    setEdited(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Private mode etc.: the message just won't be remembered.
    }
  }

  async function share() {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.capture("invite_shared");
    }
    const text = message.trim();
    const full = text ? `${text}\n\n${url}` : url;

    // Always copy the message and link together first.
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the share sheet below still works.
    }

    // Then open the phone's share sheet. The link goes inside the text (not as
    // a separate URL) so apps don't drop the message and send the bare link.
    if (navigator.share) {
      try {
        await navigator.share({ text: full });
      } catch {
        // Share sheet closed: the text is already copied.
      }
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Message</span>
        <textarea
          value={message}
          onChange={(e) => updateMessage(e.target.value)}
          maxLength={500}
          rows={3}
          className="input"
        />
      </label>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Invite link"
          className="input font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <button onClick={share} className="btn-primary shrink-0">
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
      <p className="text-xs text-muted">
        {copied ? "Message and link copied. Paste them anywhere. " : "Share copies your message and the link together. "}
        Works until{" "}
        {new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
      </p>
    </div>
  );
}

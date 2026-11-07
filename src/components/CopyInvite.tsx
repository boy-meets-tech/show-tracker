"use client";

import { useState, useSyncExternalStore } from "react";

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
    const text = message.trim();
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join me on Show Tracker", text, url });
        return;
      } catch (e) {
        // Closing the share sheet isn't an error; anything else falls back to copying.
        if ((e as Error).name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(text ? `${text}\n\n${url}` : url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        Your message is sent along with the link. Works until{" "}
        {new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
      </p>
    </div>
  );
}

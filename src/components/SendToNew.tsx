"use client";

import { useState } from "react";
import { createTitleInvite } from "@/app/actions";
import { track } from "@/lib/analytics";

// Recommend a title to someone who isn't on Show Tracker yet: makes a
// one-person invite link that shows them the title, then opens the share sheet.
export function SendToNew({ titleId, titleName }: { titleId: string; titleName: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok?: string; error?: string } | null>(null);

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      const { code, error } = await createTitleInvite(titleId, note);
      if (!code) {
        setStatus({ error: error ?? "Couldn't create the link. Try again." });
        return;
      }
      const url = `${window.location.origin}/invite/${code}`;
      const text = note.trim()
        ? `I think you'd love ${titleName}. “${note.trim()}”\n\nJoin me on Show Tracker to see it: ${url}`
        : `I think you'd love ${titleName}! Join me on Show Tracker to see it: ${url}`;
      track("title_invite_shared", { with_note: note.trim().length > 0 });

      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Clipboard blocked: the share sheet below still works.
      }
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch {
          // Share sheet closed: the text is already copied.
        }
      }
      setStatus({
        ok: copied
          ? "Link copied. When they join, you'll be friends and it'll be waiting in their For you list."
          : `Send them this link: ${url}`,
      });
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-accent underline">
        Send to someone not on Show Tracker yet
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-surface-2 p-3">
      <p className="text-sm font-medium">Send to someone new</p>
      <p className="text-xs text-muted">
        You&apos;ll get a link to text them. It shows {titleName}, and when they join you become
        friends and it&apos;s saved in their recommendations. Each link works for one person.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder="Why they'd love it (optional)"
        className="input"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={send} disabled={busy} className="btn-primary">
          {busy ? "Making link…" : "Share link"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted underline">
          Cancel
        </button>
      </div>
      {status?.ok ? <p className="text-sm text-green-600 break-words">{status.ok}</p> : null}
      {status?.error ? <p className="text-sm text-red-500">{status.error}</p> : null}
    </div>
  );
}

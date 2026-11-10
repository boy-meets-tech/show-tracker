"use client";

import { useState } from "react";
import { createTitleInvite } from "@/app/actions";
import { track } from "@/lib/analytics";

// Recommend a title to someone who isn't on Show Tracker yet: makes a
// one-person invite link that shows them the title, then opens the share sheet.
// The note comes from the Recommend form.
export function SendToNew({
  titleId,
  titleName,
  note,
  name,
}: {
  titleId: string;
  titleName: string;
  note: string;
  name?: string;
}) {
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
      const why = note.trim();
      const text = why
        ? `I think you'd love ${titleName}. “${why}”\n\nJoin me on Show Tracker to see it: ${url}`
        : `I think you'd love ${titleName}! Join me on Show Tracker to see it: ${url}`;
      track("title_invite_shared", { with_note: why.length > 0 });

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
          ? "Link copied. When they join, you'll be friends and it'll be waiting for them."
          : `Send them this link: ${url}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {name ? <>Can&apos;t find <span className="ph-mask">{name}</span>?</> : "Someone not on Show Tracker yet?"}
          </p>
          <p className="text-xs text-muted">
            Text them a link to {titleName}. When they join, you&apos;re friends and it&apos;s
            waiting for them.
          </p>
        </div>
        <button type="button" onClick={send} disabled={busy} className="btn-secondary shrink-0 py-1.5">
          {busy ? "Making link…" : "Send a link"}
        </button>
      </div>
      {status?.ok ? <p className="mt-2 break-words text-sm text-green-600">{status.ok}</p> : null}
      {status?.error ? <p className="mt-2 text-sm text-red-500">{status.error}</p> : null}
    </div>
  );
}

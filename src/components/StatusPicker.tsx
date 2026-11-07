"use client";

import { useOptimistic, useTransition } from "react";
import posthog from "posthog-js";
import { setStatus } from "@/app/actions";
import { STATUSES, STATUS_LABEL, type WatchStatus } from "@/lib/labels";

// Highlights the chosen status immediately, then saves in the background.
export function StatusPicker({ titleId, status }: { titleId: string; status: WatchStatus | null }) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();

  function choose(next: WatchStatus) {
    if (next === optimistic) return;
    startTransition(async () => {
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
        posthog.capture("watch_status_changed", { status: next });
      }
      setOptimistic(next);
      const fd = new FormData();
      fd.set("status", next);
      await setStatus(titleId, fd);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Your status">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={optimistic === s}
          onClick={() => choose(s)}
          className={optimistic === s ? "btn-primary" : "btn-secondary"}
        >
          {STATUS_LABEL[s]}
        </button>
      ))}
      <span className={`text-xs text-muted transition-opacity ${pending ? "opacity-100" : "opacity-0"}`} aria-live="polite">
        Saving…
      </span>
    </div>
  );
}

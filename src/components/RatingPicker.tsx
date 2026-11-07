"use client";

import { useOptimistic, useTransition } from "react";
import posthog from "posthog-js";
import { setRating } from "@/app/actions";

export function RatingPicker({ titleId, rating }: { titleId: string; rating: number | null }) {
  const [optimistic, setOptimistic] = useOptimistic(rating);
  const [, startTransition] = useTransition();

  function choose(value: number | null) {
    startTransition(async () => {
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
        posthog.capture("title_rating_changed", { rating: value });
      }
      setOptimistic(value);
      const fd = new FormData();
      fd.set("rating", value === null ? "" : String(value));
      await setRating(titleId, fd);
    });
  }

  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        Your rating{optimistic ? `: ${optimistic}/10` : ""}
        {optimistic ? (
          <button onClick={() => choose(null)} className="ml-2 underline">
            clear
          </button>
        ) : null}
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating out of 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={optimistic === n}
            onClick={() => choose(n)}
            className={`h-8 w-7 rounded text-xs font-semibold transition ${
              optimistic && n <= optimistic
                ? "bg-accent text-accent-contrast"
                : "bg-surface-2 text-muted hover:bg-border"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

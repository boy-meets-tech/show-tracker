"use client";

import { useState } from "react";
import { STATUSES, STATUS_LABEL, type WatchStatus } from "@/lib/labels";
import type { EntryRow } from "@/lib/types";
import { ServiceBadge } from "./ServiceBadge";
import { TitleRow } from "./TitleRow";

const EMPTY_TEXT: Record<WatchStatus, string> = {
  watching: "Nothing in progress right now.",
  want: "Nothing saved for later yet.",
  finished: "Nothing finished yet.",
  dropped: "Nothing dropped.",
};

// Tabs across the top, one per status; tapping one shows just those titles.
export function LibraryTabs({
  entries,
  available = {},
  hasServices = false,
  recommendedBy = {},
}: {
  entries: EntryRow[];
  available?: Record<string, string[]>;
  hasServices?: boolean;
  recommendedBy?: Record<string, string[]>;
}) {
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, entries.filter((e) => e.status === s).length])
  ) as Record<WatchStatus, number>;
  // Open on the first tab that has something in it.
  const [active, setActive] = useState<WatchStatus>(
    () => STATUSES.find((s) => counts[s] > 0) ?? "watching"
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const canFilter = hasServices && (active === "want" || active === "watching");
  const inTab = entries.filter((e) => e.status === active);
  const shown = canFilter && onlyMine ? inTab.filter((e) => available[e.title_id]) : inTab;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Library sections"
        className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STATUSES.map((s) => {
          const selected = s === active;
          return (
            <button
              key={s}
              role="tab"
              id={`tab-${s}`}
              aria-selected={selected}
              aria-controls="library-panel"
              onClick={() => setActive(s)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                selected
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border bg-surface text-foreground hover:bg-surface-2"
              }`}
            >
              {STATUS_LABEL[s]}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  selected ? "bg-black/15" : "bg-surface-2 text-muted"
                }`}
              >
                {counts[s]}
              </span>
            </button>
          );
        })}
      </div>

      {canFilter ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Only what I can watch on my services
        </label>
      ) : null}

      <div id="library-panel" role="tabpanel" aria-labelledby={`tab-${active}`}>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {canFilter && onlyMine && inTab.length ? "None of these are on your services right now." : EMPTY_TEXT[active]}
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {shown.map((e) => (
              <TitleRow
                key={e.title_id}
                id={e.titles.id}
                name={e.titles.name}
                posterPath={e.titles.poster_path}
                year={e.titles.year}
                mediaType={e.titles.media_type}
              >
                {e.rating ? (
                  <span className="mt-1 inline-block text-xs font-semibold text-accent">
                    {e.rating}/10
                  </span>
                ) : null}
                {recommendedBy[e.title_id] ? (
                  <p className="mt-1 text-xs text-muted">
                    Recommended by{" "}
                    <span className="ph-mask font-medium text-foreground">
                      {formatNames(recommendedBy[e.title_id])}
                    </span>
                  </p>
                ) : null}
                <div>
                  <ServiceBadge names={available[e.title_id]} />
                </div>
              </TitleRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

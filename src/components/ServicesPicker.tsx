"use client";

import { useState, useTransition } from "react";
import { setMyServices } from "@/app/actions";
import type { Provider } from "@/lib/tmdb";

// Tap the services you subscribe to; saves as you go.
export function ServicesPicker({ services, selected }: { services: Provider[]; selected: number[] }) {
  const [chosen, setChosen] = useState(() => new Set(selected));
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  function toggle(id: number) {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
    start(() => setMyServices([...next]));
  }

  if (services.length === 0) {
    return <p className="text-sm text-muted">Couldn&apos;t load services for your country right now.</p>;
  }

  // Your picks first, then the most popular ones.
  const ordered = [...services.filter((s) => chosen.has(s.id)), ...services.filter((s) => !chosen.has(s.id))];
  const visible = showAll ? ordered : ordered.slice(0, Math.max(16, chosen.size));

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Tap the ones you pay for. Titles on them get an &ldquo;On Netflix&rdquo;-style tag, and you can
        filter your list to what you can watch right now.
      </p>
      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
        {visible.map((s) => {
          const on = chosen.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.id)}
                className="flex w-full flex-col items-center gap-1 text-center"
              >
                <span className={`relative rounded-xl ${on ? "ring-2 ring-accent" : "opacity-60"}`}>
                  {s.logoPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${s.logoPath}`}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 rounded-xl"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-xs">
                      {s.name.slice(0, 2)}
                    </span>
                  )}
                  {on ? (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-contrast">
                      ✓
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 text-[11px] leading-tight">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        {ordered.length > visible.length || showAll ? (
          <button type="button" onClick={() => setShowAll(!showAll)} className="underline">
            {showAll ? "Show fewer" : `Show all ${ordered.length}`}
          </button>
        ) : (
          <span />
        )}
        <span aria-live="polite">{pending ? "Saving…" : chosen.size ? `${chosen.size} selected` : ""}</span>
      </div>
    </div>
  );
}

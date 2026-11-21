"use client";

import { useState, useTransition } from "react";
import { answerWatchTogether, askWatchTogether, type ActionState } from "@/app/actions";
import { track } from "@/lib/analytics";
import type { ProfileRow } from "@/lib/types";
import { Avatar } from "./Avatar";

// Where things stand with one friend for this title.
export type TogetherState =
  | "none" // they want to watch it; nobody has asked yet
  | "asked-them" // you asked, waiting for them
  | "asked-me" // they asked you
  | "in" // you're watching it together
  | "they-passed";

export type TogetherRow = { friend: ProfileRow; state: TogetherState };

export function WatchTogether({ titleId, rows }: { titleId: string; rows: TogetherRow[] }) {
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
      {rows.map((r) => (
        <Row key={r.friend.id} titleId={titleId} row={r} />
      ))}
    </div>
  );
}

function Row({ titleId, row }: { titleId: string; row: TogetherRow }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<ActionState>(null);
  const name = <strong className="ph-mask">{row.friend.display_name}</strong>;

  const run = (action: () => Promise<ActionState>, event: string) =>
    start(async () => {
      track(event);
      setResult(await action());
    });

  let text: React.ReactNode;
  let buttons: React.ReactNode = null;
  switch (row.state) {
    case "in":
      text = <>🍿 You&apos;re watching this together with {name}</>;
      break;
    case "asked-them":
      text = <>Asked {name} to watch it together · waiting</>;
      break;
    case "they-passed":
      text = <>{name} passed on watching this one together</>;
      break;
    case "asked-me":
      text = <>🍿 {name} wants to watch this with you</>;
      buttons = (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => answerWatchTogether(titleId, row.friend.id, "in"), "watch_together_in")}
            className="btn-primary py-1.5"
          >
            I&apos;m in
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => answerWatchTogether(titleId, row.friend.id, "out"), "watch_together_out")}
            className="btn-secondary py-1.5"
          >
            Not this one
          </button>
        </>
      );
      break;
    case "none":
      text = <>🍿 {name} wants to watch this too</>;
      buttons = (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => askWatchTogether(titleId, row.friend.id), "watch_together_asked")}
          className="btn-primary py-1.5"
        >
          {busy ? "Asking…" : "Watch together?"}
        </button>
      );
      break;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={row.friend.display_name} url={row.friend.avatar_url} size={28} />
        <p className="min-w-0 flex-1">{text}</p>
        {buttons ? <div className="flex gap-2">{buttons}</div> : null}
      </div>
      {result?.error ? <p className="mt-1 text-xs text-red-500">{result.error}</p> : null}
    </div>
  );
}

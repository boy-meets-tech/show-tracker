import type { WatchStatus } from "./labels";

export type SentRec = {
  id: number;
  to_id: string;
  title_id: string;
  created_at: string;
  dismissed_at: string | null;
};

export type FriendEntry = { user_id: string; title_id: string; status: WatchStatus; rating: number | null };

export type Outcome =
  | { kind: "finished"; rating: number | null }
  | { kind: "watching"; rating: number | null }
  | { kind: "dropped"; rating: number | null }
  | { kind: "saved" }
  | { kind: "passed" }
  | { kind: "waiting" };

// What the friend did with a recommendation, from their library entry.
export function outcomeOf(rec: SentRec, entry: FriendEntry | undefined): Outcome {
  if (entry) {
    if (entry.status === "want") return { kind: "saved" };
    return { kind: entry.status, rating: entry.rating };
  }
  return rec.dismissed_at ? { kind: "passed" } : { kind: "waiting" };
}

export function outcomeLabel(o: Outcome) {
  switch (o.kind) {
    case "finished":
      return o.rating ? `Finished · ${o.rating}/10` : "Finished";
    case "watching":
      return o.rating ? `Watching · ${o.rating}/10` : "Watching";
    case "dropped":
      return o.rating ? `Dropped · ${o.rating}/10` : "Dropped";
    case "saved":
      return "Saved for later";
    case "passed":
      return "Passed";
    case "waiting":
      return "Not started yet";
  }
}

// "Hit rate": how many recommendations friends actually started, and how
// they rated them.
export function hitRate(outcomes: Outcome[]) {
  const started = outcomes.filter((o) => o.kind === "watching" || o.kind === "finished" || o.kind === "dropped");
  const ratings = started.map((o) => ("rating" in o ? o.rating : null)).filter((r): r is number => r !== null);
  return {
    sent: outcomes.length,
    started: started.length,
    finished: outcomes.filter((o) => o.kind === "finished").length,
    // A hit: they finished it, or started it and rated it 8+.
    hits: outcomes.filter((o) => o.kind === "finished" || ("rating" in o && (o.rating ?? 0) >= 8)).length,
    averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    rated: ratings.length,
  };
}

export type TasteStats = { user_id: string; sent: number; started: number; hits: number; avg_rating: number | null };

// "4/5 hits": shown once someone has sent at least two recommendations.
export function tasteLabel(stats: TasteStats | undefined) {
  if (!stats || stats.sent < 2) return null;
  return `${stats.hits}/${stats.sent} recs hit`;
}

// Half or more of at least three recommendations landed.
export function isTrustedTaste(stats: TasteStats | undefined) {
  return Boolean(stats && stats.sent >= 3 && stats.hits / stats.sent >= 0.5);
}

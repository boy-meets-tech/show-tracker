export const STATUSES = ["watching", "want", "finished", "dropped"] as const;
export type WatchStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "Watching",
  want: "Want to watch",
  finished: "Finished",
  dropped: "Dropped",
};

// Past-tense phrasing for the activity feed.
export const STATUS_VERB: Record<WatchStatus, string> = {
  watching: "started watching",
  want: "wants to watch",
  finished: "finished",
  dropped: "dropped",
};

export function isStatus(value: unknown): value is WatchStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

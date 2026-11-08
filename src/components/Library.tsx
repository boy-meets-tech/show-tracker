import { getMyId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { EntryRow } from "@/lib/types";
import { myWatchSetup, onMyServices } from "@/lib/watch";
import { LibraryTabs } from "./LibraryTabs";

// A person's logged titles, in tabs by status. RLS only returns rows for
// yourself and your friends.
export async function Library({ userId, empty }: { userId: string; empty: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("watch_entries")
    .select("title_id, status, rating, updated_at, titles(id, name, media_type, poster_path, year)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  const entries = (data ?? []) as unknown as EntryRow[];
  if (entries.length === 0) return <>{empty}</>;
  // Tag titles you could watch now on your own services (unfinished ones only).
  const [{ services }, available, recommendedBy] = await Promise.all([
    myWatchSetup(),
    onMyServices(entries.filter((e) => e.status === "want" || e.status === "watching").map((e) => e.title_id)),
    recommendersFor(userId),
  ]);
  return (
    <LibraryTabs
      entries={entries}
      available={available}
      hasServices={services.length > 0}
      recommendedBy={recommendedBy}
    />
  );
}

// On your own library: who recommended each title to you, e.g.
// { "tv-95396": ["Sarah"] }. Recommendations are private, so not shown on
// other people's profiles.
async function recommendersFor(userId: string): Promise<Record<string, string[]>> {
  if (userId !== (await getMyId())) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select("title_id, from:profiles!recommendations_from_id_fkey(display_name)")
    .eq("to_id", userId);
  const map: Record<string, string[]> = {};
  for (const r of (data ?? []) as unknown as { title_id: string; from: { display_name: string } }[]) {
    (map[r.title_id] ??= []).push(r.from.display_name);
  }
  return map;
}

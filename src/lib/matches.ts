import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, TitleRowData } from "@/lib/types";

export type Match = { title: TitleRowData; friends: ProfileRow[]; latest: string };

// Titles on your Want to watch list that friends want to watch too.
// Newest match first (when a friend most recently saved it).
export async function bothWantMatches(meId: string): Promise<Match[]> {
  const supabase = await createClient();
  const { data: mineData } = await supabase
    .from("watch_entries")
    .select("title_id, titles(id, name, media_type, poster_path, year)")
    .eq("user_id", meId)
    .eq("status", "want");
  const mine = (mineData ?? []) as unknown as { title_id: string; titles: TitleRowData }[];
  if (mine.length === 0) return [];

  // Only friends' entries are visible besides your own.
  const { data: theirData } = await supabase
    .from("watch_entries")
    .select("title_id, updated_at, profiles(id, username, display_name, avatar_url)")
    .eq("status", "want")
    .neq("user_id", meId)
    .in("title_id", mine.map((m) => m.title_id))
    .order("updated_at", { ascending: false });
  const byTitle = new Map<string, { friends: ProfileRow[]; latest: string }>();
  for (const e of (theirData ?? []) as unknown as { title_id: string; updated_at: string; profiles: ProfileRow }[]) {
    const m = byTitle.get(e.title_id) ?? { friends: [], latest: e.updated_at };
    m.friends.push(e.profiles);
    byTitle.set(e.title_id, m);
  }
  return mine
    .filter((m) => byTitle.has(m.title_id))
    .map((m) => ({ title: m.titles, ...byTitle.get(m.title_id)! }))
    .sort((a, b) => b.latest.localeCompare(a.latest));
}

import { createClient } from "@/lib/supabase/server";
import type { TasteStats } from "@/lib/recStats";

// How often each person's recommendations land (you and your friends only).
// Empty before the database update.
export async function tasteStats(userIds: string[]): Promise<Map<string, TasteStats>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.rpc("taste_stats", { people: ids });
  return new Map(
    ((data ?? []) as TasteStats[]).map((s) => [s.user_id, { ...s, avg_rating: s.avg_rating === null ? null : Number(s.avg_rating) }])
  );
}

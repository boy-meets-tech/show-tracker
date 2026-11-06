import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "./types";

// Profiles of everyone the given user is friends with.
export async function listFriends(meId: string): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("friendships")
    .select(
      "user_a, user_b, a:profiles!friendships_user_a_fkey(id, username, display_name, avatar_url), b:profiles!friendships_user_b_fkey(id, username, display_name, avatar_url)"
    );
  const rows = (data ?? []) as unknown as { user_a: string; a: ProfileRow; b: ProfileRow }[];
  return rows
    .map((r) => (r.user_a === meId ? r.b : r.a))
    .sort((x, y) => x.display_name.localeCompare(y.display_name));
}

"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { isStatus } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { getTitleDetails, parseTitleId } from "@/lib/tmdb";

export type ActionState = { ok?: string; error?: string } | null;

// Make sure the title exists in our database, using TMDB as the source of
// truth (never trusting title details sent by the browser).
async function ensureTitle(id: string) {
  if (!parseTitleId(id)) throw new Error("Unknown title");
  const supabase = await createClient();
  const { data: existing } = await supabase.from("titles").select("id").eq("id", id).maybeSingle();
  if (existing) return;

  const details = await getTitleDetails(id);
  if (!details) throw new Error("Couldn't find that title on TMDB");
  const { error } = await supabase.from("titles").upsert(
    {
      id: details.id,
      media_type: details.mediaType,
      tmdb_id: details.tmdbId,
      name: details.name,
      poster_path: details.posterPath,
      year: details.year,
      overview: details.overview.slice(0, 2000),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

export async function setStatus(titleId: string, formData: FormData) {
  const me = await getMe();
  const status = formData.get("status");
  if (!isStatus(status)) return;
  await ensureTitle(titleId);

  const supabase = await createClient();
  await supabase
    .from("watch_entries")
    .upsert({ user_id: me.id, title_id: titleId, status }, { onConflict: "user_id,title_id" });
  refresh();
}

export async function setRating(titleId: string, formData: FormData) {
  const me = await getMe();
  const raw = String(formData.get("rating") ?? "");
  const rating = raw === "" ? null : Number(raw);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) return;

  const supabase = await createClient();
  // Rating something you haven't logged marks it finished.
  const { data: entry } = await supabase
    .from("watch_entries")
    .select("status")
    .eq("user_id", me.id)
    .eq("title_id", titleId)
    .maybeSingle();
  if (entry) {
    await supabase
      .from("watch_entries")
      .update({ rating })
      .eq("user_id", me.id)
      .eq("title_id", titleId);
  } else if (rating !== null) {
    await ensureTitle(titleId);
    await supabase
      .from("watch_entries")
      .insert({ user_id: me.id, title_id: titleId, status: "finished", rating });
  }
  refresh();
}

export async function removeEntry(titleId: string) {
  const me = await getMe();
  const supabase = await createClient();
  await supabase.from("watch_entries").delete().eq("user_id", me.id).eq("title_id", titleId);
  refresh();
}

export async function recommend(
  titleId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = await getMe();
  const friendIds = formData.getAll("friend").map(String).filter(Boolean);
  const note = String(formData.get("note") ?? "").trim().slice(0, 280) || null;
  if (friendIds.length === 0) return { error: "Pick at least one friend." };

  try {
    await ensureTitle(titleId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("recommendations").upsert(
    friendIds.map((to_id) => ({ from_id: me.id, to_id, title_id: titleId, note })),
    { onConflict: "from_id,to_id,title_id", ignoreDuplicates: true }
  );
  if (error) return { error: "Couldn't send that. Are you still friends?" };
  refresh();
  return { ok: friendIds.length === 1 ? "Sent!" : `Sent to ${friendIds.length} friends!` };
}

export async function dismissRecommendation(id: number) {
  await getMe();
  const supabase = await createClient();
  await supabase
    .from("recommendations")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id);
  refresh();
}

// --- Friends -----------------------------------------------------------------

// One-tap "Add friend" from search results and profiles.
export async function addFriend(username: string) {
  await getMe();
  const supabase = await createClient();
  await supabase.rpc("send_friend_request", { target_username: username });
  refresh();
}

export async function acceptFriendRequest(requesterId: string) {
  await getMe();
  const supabase = await createClient();
  await supabase.rpc("accept_friend_request", { requester: requesterId });
  refresh();
}

export async function deleteFriendRequest(fromId: string, toId: string) {
  await getMe();
  const supabase = await createClient();
  await supabase.from("friend_requests").delete().eq("from_id", fromId).eq("to_id", toId);
  refresh();
}

export async function removeFriend(friendId: string) {
  const me = await getMe();
  const [a, b] = [me.id, friendId].sort();
  const supabase = await createClient();
  await supabase.from("friendships").delete().eq("user_a", a).eq("user_b", b);
  refresh();
}

export async function createInvite() {
  const me = await getMe();
  const supabase = await createClient();
  await supabase.from("invites").insert({ created_by: me.id });
  refresh();
}

export async function acceptInvite(code: string) {
  await getMe();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { invite_code: code });
  if (error) redirect(`/invite/${encodeURIComponent(code)}?error=1`);
  redirect(`/u/${data}`);
}

// --- Settings ----------------------------------------------------------------

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getMe();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: "Usernames are 3–20 letters, numbers or underscores." };
  }
  if (!displayName || displayName.length > 50) return { error: "Enter a name (up to 50 characters)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ username, display_name: displayName })
    .eq("id", me.id);
  if (error) {
    return { error: error.code === "23505" ? "That username is taken." : error.message };
  }
  refresh();
  return { ok: "Saved." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

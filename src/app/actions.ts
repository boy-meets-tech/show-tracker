"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getMyId } from "@/lib/auth";
import { isStatus } from "@/lib/labels";
import {
  notify,
  notifyActivity,
  notifyFriendRequest,
  notifyNowFriends,
  notifyRecommendation,
  type NotificationKind,
} from "@/lib/push";
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
  const me = { id: await getMyId() };
  const status = formData.get("status");
  if (!isStatus(status)) return;
  await ensureTitle(titleId);

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("watch_entries")
    .select("status")
    .eq("user_id", me.id)
    .eq("title_id", titleId)
    .maybeSingle();
  const { error } = await supabase
    .from("watch_entries")
    .upsert({ user_id: me.id, title_id: titleId, status }, { onConflict: "user_id,title_id" });
  if (!error && before?.status !== status) {
    // Sends after the response, so the button doesn't wait on it.
    after(() => notifyActivity(me.id, titleId, { status }));
  }
  refresh();
}

export async function setRating(titleId: string, formData: FormData) {
  const me = { id: await getMyId() };
  const raw = String(formData.get("rating") ?? "");
  const rating = raw === "" ? null : Number(raw);
  if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) return;

  const supabase = await createClient();
  // Rating something you haven't logged marks it finished.
  const { data: entry } = await supabase
    .from("watch_entries")
    .select("status, rating")
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
  if (rating !== null && entry?.rating !== rating) {
    after(() => notifyActivity(me.id, titleId, { rating }));
  }
  refresh();
}

export async function removeEntry(titleId: string) {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  await supabase.from("watch_entries").delete().eq("user_id", me.id).eq("title_id", titleId);
  refresh();
}

export async function recommend(
  titleId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const me = { id: await getMyId() };
  const friendIds = formData.getAll("friend").map(String).filter(Boolean);
  const note = String(formData.get("note") ?? "").trim().slice(0, 280) || null;
  if (friendIds.length === 0) return { error: "Pick at least one friend." };

  try {
    await ensureTitle(titleId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { data: sent, error } = await supabase
    .from("recommendations")
    .upsert(
      friendIds.map((to_id) => ({ from_id: me.id, to_id, title_id: titleId, note })),
      { onConflict: "from_id,to_id,title_id", ignoreDuplicates: true }
    )
    .select("to_id");
  if (error) return { error: "Couldn't send that. Are you still friends?" };
  // Only notify people this is new for (repeats are ignored above).
  const newlySent = (sent ?? []).map((r: { to_id: string }) => r.to_id);
  if (newlySent.length) after(() => notifyRecommendation(me.id, newlySent, titleId, note));
  refresh();
  return { ok: friendIds.length === 1 ? "Sent!" : `Sent to ${friendIds.length} friends!` };
}

export async function dismissRecommendation(id: number) {
  await getMyId();
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
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const { data: result } = await supabase.rpc("send_friend_request", { target_username: username });
  if (result === "sent" || result === "accepted") {
    const { data: target } = await supabase.from("profiles").select("id").eq("username", username).single();
    if (target) {
      after(() =>
        result === "sent"
          ? notifyFriendRequest(me.id, target.id)
          : notifyNowFriends(me.id, target.id, "accepted")
      );
    }
  }
  refresh();
}

export async function acceptFriendRequest(requesterId: string) {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_friend_request", { requester: requesterId });
  if (!error) after(() => notifyNowFriends(me.id, requesterId, "accepted"));
  refresh();
}

export async function deleteFriendRequest(fromId: string, toId: string) {
  await getMyId();
  const supabase = await createClient();
  await supabase.from("friend_requests").delete().eq("from_id", fromId).eq("to_id", toId);
  refresh();
}

export async function removeFriend(friendId: string) {
  const me = { id: await getMyId() };
  const [a, b] = [me.id, friendId].sort();
  const supabase = await createClient();
  await supabase.from("friendships").delete().eq("user_a", a).eq("user_b", b);
  refresh();
}

export async function createInvite() {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  await supabase.from("invites").insert({ created_by: me.id });
  refresh();
}

export async function acceptInvite(code: string) {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { invite_code: code });
  if (error) redirect(`/invite/${encodeURIComponent(code)}?error=1`);
  const { data: inviter } = await supabase.from("profiles").select("id").eq("username", data).single();
  if (inviter && inviter.id !== me.id) {
    after(() => notifyNowFriends(me.id, inviter.id, "invite"));
  }
  redirect(`/u/${data}`);
}

// --- Settings ----------------------------------------------------------------

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = { id: await getMyId() };
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

// --- Notifications -----------------------------------------------------------

export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  await getMyId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    sub_endpoint: sub.endpoint,
    sub_p256dh: sub.keys.p256dh,
    sub_auth: sub.keys.auth,
  });
  if (error) throw new Error("Couldn't turn on notifications for this device.");
}

export async function deletePushSubscription(endpoint: string) {
  await getMyId();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

const KINDS: NotificationKind[] = ["friend_requests", "recommendations", "friend_activity", "friend_loved"];

export async function setNotificationSetting(kind: NotificationKind, enabled: boolean) {
  const me = { id: await getMyId() };
  if (!KINDS.includes(kind)) return;
  const supabase = await createClient();
  await supabase
    .from("notification_settings")
    .upsert({ user_id: me.id, [kind]: enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  refresh();
}

// Sends a test to your own devices. Waits a few seconds first, because
// iPhones usually don't show a web app's notification while it's on screen.
export async function sendTestPush(delaySeconds = 0) {
  const me = { id: await getMyId() };
  if (delaySeconds > 0) await new Promise((r) => setTimeout(r, Math.min(delaySeconds, 10) * 1000));
  return notify([me.id], null, {
    title: "Notifications are on",
    body: "You'll hear about friend requests, recommendations and what your friends watch.",
    url: "/settings",
    tag: "test",
  });
}

// "Where to watch" country; null means detect it automatically.
export async function setWatchCountry(country: string | null) {
  const me = { id: await getMyId() };
  if (country !== null && !/^[A-Z]{2}$/.test(country)) return;
  const supabase = await createClient();
  await supabase.from("profiles").update({ country }).eq("id", me.id);
  refresh();
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

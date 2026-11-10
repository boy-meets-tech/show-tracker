"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getMyId, getMyIdOrNull } from "@/lib/auth";
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
    const recommenders = await recommendersOf(me.id, titleId);
    after(() => notifyActivity(me.id, titleId, { status }, recommenders));
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
    const recommenders = await recommendersOf(me.id, titleId);
    after(() => notifyActivity(me.id, titleId, { rating }, recommenders));
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

export type PersonMatch = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  relation: "sent" | "received" | "none";
};

// People on Show Tracker who aren't your friends yet, for the Recommend form.
export async function findPeople(query: string): Promise<PersonMatch[]> {
  if (!(await getMyIdOrNull())) return [];
  const q = query.trim().slice(0, 50);
  if (q.replace(/^@/, "").length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_people", { query: q });
  return ((data ?? []) as (Omit<PersonMatch, "relation"> & { relation: string })[])
    .filter((p) => p.relation !== "friend")
    .slice(0, 5) as PersonMatch[];
}

// Recommend to someone on Show Tracker who isn't your friend yet: sends a
// friend request, and the recommendation arrives when they accept.
export async function recommendToNewFriend(
  titleId: string,
  username: string,
  note: string
): Promise<ActionState> {
  const me = { id: await getMyId() };
  const cleanNote = note.trim().slice(0, 280) || null;
  try {
    await ensureTitle(titleId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("username", username)
    .maybeSingle();
  if (!target) return { error: "Couldn't find that person." };

  const { data: result, error: requestError } = await supabase.rpc("send_friend_request", {
    target_username: username,
  });
  if (requestError) return { error: "Couldn't send the friend request. Try again." };

  if (result === "accepted" || result === "already_friends") {
    // You're friends now (they'd already asked you), so it goes straight through.
    const { error } = await supabase
      .from("recommendations")
      .upsert(
        { from_id: me.id, to_id: target.id, title_id: titleId, note: cleanNote },
        { onConflict: "from_id,to_id,title_id", ignoreDuplicates: true }
      );
    if (error) return { error: "Couldn't send that. Try again." };
    after(async () => {
      if (result === "accepted") await notifyNowFriends(me.id, target.id, "accepted");
      await notifyRecommendation(me.id, [target.id], titleId, cleanNote);
    });
    refresh();
    return { ok: `You're now friends with ${target.display_name}, and it's sent!` };
  }

  const { error } = await supabase
    .from("pending_recommendations")
    .upsert(
      { from_id: me.id, to_id: target.id, title_id: titleId, note: cleanNote },
      { onConflict: "from_id,to_id,title_id", ignoreDuplicates: true }
    );
  if (error) {
    return {
      error:
        error.code === "PGRST205" || error.code === "42P01"
          ? "Friend request sent. Recommending to non-friends needs a database update first (the SQL file)."
          : "Friend request sent, but the recommendation didn't save. Try again.",
    };
  }
  after(() => notifyFriendRequest(me.id, target.id, titleId));
  refresh();
  return {
    ok: `Friend request sent to ${target.display_name}. They'll get the recommendation when they accept.`,
  };
}

// Dismisses every recommendation of this title sent to you (from anyone).
export async function dismissRecommendation(titleId: string) {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  await supabase
    .from("recommendations")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("to_id", me.id)
    .eq("title_id", titleId)
    .is("dismissed_at", null);
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
  // Retire any unused older link so only the newest one works.
  await supabase.from("invites").delete().eq("created_by", me.id).is("used_at", null).is("title_id", null);
  await supabase.from("invites").insert({ created_by: me.id });
  refresh();
}

export async function acceptInvite(code: string, titleId?: string) {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { invite_code: code });
  if (error) redirect(`/invite/${encodeURIComponent(code)}?error=1`);
  const { data: inviter } = await supabase.from("profiles").select("id").eq("username", data).single();
  if (inviter && inviter.id !== me.id) {
    after(() => notifyNowFriends(me.id, inviter.id, "invite"));
  }
  // Invites that came with a recommendation go straight to the title.
  redirect(titleId && parseTitleId(titleId) ? `/title/${titleId}` : `/u/${data}`);
}

// A one-person invite link that also recommends this title, for someone who
// isn't on Show Tracker yet. Returns the link's code.
export async function createTitleInvite(
  titleId: string,
  note: string
): Promise<{ code?: string; error?: string }> {
  const me = { id: await getMyId() };
  try {
    await ensureTitle(titleId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .insert({ created_by: me.id, title_id: titleId, note: note.trim().slice(0, 280) || null })
    .select("code")
    .single();
  if (error) {
    return {
      error:
        error.code === "PGRST204" || error.code === "42703"
          ? "This needs a database update first (the SQL file in Supabase)."
          : "Couldn't create the link. Try again.",
    };
  }
  return { code: data.code };
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

// Friends who recommended this title to me (to credit them on my activity).
async function recommendersOf(meId: string, titleId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select("from_id")
    .eq("to_id", meId)
    .eq("title_id", titleId);
  return (data ?? []).map((r: { from_id: string }) => r.from_id);
}

// --- Notifications -----------------------------------------------------------

// Saves this device's notification registration. deviceId is a random id the
// device keeps, so a newer registration replaces the same device's old one.
export async function savePushSubscription(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  deviceId?: string
) {
  await getMyId();
  const supabase = await createClient();
  const base = { sub_endpoint: sub.endpoint, sub_p256dh: sub.keys.p256dh, sub_auth: sub.keys.auth };
  const device = deviceId && /^[A-Za-z0-9-]{8,64}$/.test(deviceId) ? deviceId : null;
  let { error } = await supabase.rpc("save_push_subscription", { ...base, sub_device: device });
  // Before the push_device_id migration the function has no device argument.
  if (error?.code === "PGRST202") ({ error } = await supabase.rpc("save_push_subscription", base));
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

// The streaming services you subscribe to (TMDB provider ids).
export async function setMyServices(ids: number[]) {
  const me = { id: await getMyId() };
  const services = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
  const supabase = await createClient();
  await supabase.from("profiles").update({ services }).eq("id", me.id);
  refresh();
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

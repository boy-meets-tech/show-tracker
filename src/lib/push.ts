// Sends phone push notifications. Server only: uses the Supabase secret key,
// which bypasses row-level security, to look up other people's devices.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateVAPIDKeys, sendNotification, setVapidDetails } from "web-push";

export type NotificationKind =
  | "friend_requests"
  | "recommendations"
  | "friend_activity"
  | "friend_loved";

export type PushMessage = {
  title: string;
  body: string;
  url: string; // where tapping the notification opens
  tag?: string; // a newer notification with the same tag replaces the older one
};

let adminClient: SupabaseClient | null = null;

function admin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!key || !url) {
    console.error("push: SUPABASE_SECRET_KEY or the Supabase URL is missing");
    return null;
  }
  adminClient ??= createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

type VapidKeys = { publicKey: string; privateKey: string };
let vapid: Promise<VapidKeys | null> | null = null;

// The push signing keys are created once and kept in the private
// app_secrets table, so they never need to be copied around by hand.
async function loadVapidKeys(): Promise<VapidKeys | null> {
  const db = admin();
  if (!db) return null;
  const read = async () => {
    const { data, error } = await db
      .from("app_secrets")
      .select("name, value")
      .in("name", ["vapid_public_key", "vapid_private_key"]);
    if (error) console.error("push: could not read keys", error.message);
    const rows = new Map((data ?? []).map((r: { name: string; value: string }) => [r.name, r.value]));
    const publicKey = rows.get("vapid_public_key");
    const privateKey = rows.get("vapid_private_key");
    return publicKey && privateKey ? { publicKey, privateKey } : null;
  };

  const existing = await read();
  if (existing) return existing;

  const fresh = generateVAPIDKeys();
  // If two servers race here, the first insert wins and both read it back.
  const { error: saveError } = await db.from("app_secrets").upsert(
    [
      { name: "vapid_public_key", value: fresh.publicKey },
      { name: "vapid_private_key", value: fresh.privateKey },
    ],
    { onConflict: "name", ignoreDuplicates: true }
  );
  if (saveError) console.error("push: could not save keys", saveError.message);
  return read();
}

function vapidKeys() {
  // Remember the keys once loaded, but retry next time if loading failed.
  vapid ??= loadVapidKeys()
    .catch((e) => {
      console.error("push: could not load keys", e);
      return null;
    })
    .then((keys) => {
      if (!keys) vapid = null;
      return keys;
    });
  return vapid;
}

// The public half, which browsers need to subscribe.
export async function vapidPublicKey(): Promise<string | null> {
  return (await vapidKeys())?.publicKey ?? null;
}

const SUBJECT = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://localhost";

export type PushResult = { sent: number; failed: number; problem?: string };

// Send to these people's devices, skipping anyone who turned this kind off.
// Pass kind = null to ignore settings (used for the test notification).
// Every send is logged, so delivery problems show up in the Vercel logs.
export async function notify(
  userIds: string[],
  kind: NotificationKind | null,
  message: PushMessage
): Promise<PushResult> {
  const ids = [...new Set(userIds)];
  const result = await deliver(ids, kind, message);
  console.log(
    `push: ${kind ?? "test"} to ${ids.length} user(s): sent ${result.sent}, failed ${result.failed}` +
      (result.problem ? ` (${result.problem})` : "")
  );
  return result;
}

async function deliver(ids: string[], kind: NotificationKind | null, message: PushMessage): Promise<PushResult> {
  const none = (problem?: string): PushResult => ({ sent: 0, failed: 0, problem });
  if (ids.length === 0) return none();
  const db = admin();
  if (!db) return none("server is missing its Supabase secret key");
  const keys = await vapidKeys();
  if (!keys) return none("push keys couldn't be loaded");

  let recipients = ids;
  if (kind) {
    const { data: off, error } = await db
      .from("notification_settings")
      .select("user_id")
      .in("user_id", ids)
      .eq(kind, false);
    if (error) return none(`couldn't read settings: ${error.message}`);
    const muted = new Set((off ?? []).map((r: { user_id: string }) => r.user_id));
    recipients = ids.filter((id) => !muted.has(id));
  }
  if (recipients.length === 0) return none("everyone has this kind turned off");

  const { data: subs, error } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", recipients);
  if (error) return none(`couldn't read devices: ${error.message}`);
  if (!subs?.length) return none("no devices have notifications turned on");

  setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
  const payload = JSON.stringify(message);
  const gone: string[] = [];
  const problems: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      const service = new URL(s.endpoint).host;
      try {
        const res = await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: "high" }
        );
        sent++;
        console.log(`push: ${service} accepted (${res.statusCode})`);
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        // The device unsubscribed or the app was removed: forget it.
        if (err.statusCode === 404 || err.statusCode === 410) gone.push(s.endpoint);
        const why = `${service} said ${err.statusCode ?? "error"}${err.body ? `: ${err.body}` : ""}`;
        problems.push(why);
        console.error("push: send failed,", why, err.message ?? "");
      }
    })
  );
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
  return { sent, failed: subs.length - sent, problem: problems.join("; ") || undefined };
}

// --- Event helpers ------------------------------------------------------------

async function names(db: SupabaseClient, userId: string, titleId?: string) {
  const [{ data: person }, title] = await Promise.all([
    db.from("profiles").select("display_name, username").eq("id", userId).single(),
    titleId
      ? db.from("titles").select("name").eq("id", titleId).single().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  return {
    who: (person as { display_name: string } | null)?.display_name ?? "A friend",
    username: (person as { username: string } | null)?.username ?? "",
    title: (title as { name: string } | null)?.name ?? "a title",
  };
}

async function friendIdsOf(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  return (data ?? []).map((r: { user_a: string; user_b: string }) =>
    r.user_a === userId ? r.user_b : r.user_a
  );
}

export async function notifyFriendRequest(fromId: string, toId: string) {
  const db = admin();
  if (!db) return;
  const { who } = await names(db, fromId);
  await notify([toId], "friend_requests", {
    title: "New friend request",
    body: `${who} wants to be friends on Show Tracker.`,
    url: "/friends",
    tag: `request-${fromId}`,
  });
}

export async function notifyNowFriends(actorId: string, otherId: string, how: "accepted" | "invite") {
  const db = admin();
  if (!db) return;
  const { who, username } = await names(db, actorId);
  await notify([otherId], "friend_requests", {
    title: how === "invite" ? `${who} joined from your invite` : `${who} accepted your friend request`,
    body: "You're now friends. See what they're watching.",
    url: username ? `/u/${username}` : "/friends",
    tag: `friends-${actorId}`,
  });
}

export async function notifyRecommendation(fromId: string, toIds: string[], titleId: string, note: string | null) {
  const db = admin();
  if (!db) return;
  const { who, title } = await names(db, fromId, titleId);
  await notify(toIds, "recommendations", {
    title: `${who} recommended ${title}`,
    body: note ? `“${note}”` : "Tap to see it and add it to your list.",
    url: `/title/${titleId}`,
    tag: `rec-${fromId}-${titleId}`,
  });
}

const STATUS_PHRASE = {
  watching: "started watching",
  want: "wants to watch",
  finished: "finished",
  dropped: "dropped",
} as const;

// A friend changed a status or rating. Friends who have the title on their
// Want to watch list get "loved it" instead when the rating is 8 or more.
const REC_PHRASE = {
  watching: "started",
  want: "saved to Want to watch",
  finished: "finished",
  dropped: "dropped",
} as const;

// recommenderIds: friends who recommended this title to the actor. They get a
// "you recommended it" notification instead of the generic activity one.
export async function notifyActivity(
  actorId: string,
  titleId: string,
  change: { status: keyof typeof STATUS_PHRASE } | { rating: number },
  recommenderIds: string[] = []
) {
  const db = admin();
  if (!db) return;
  const friends = await friendIdsOf(db, actorId);
  if (friends.length === 0) return;
  const { who, title } = await names(db, actorId, titleId);
  const url = `/title/${titleId}`;
  // One notification per friend per title: newer updates replace older ones.
  const tag = `activity-${actorId}-${titleId}`;

  const recommenders = recommenderIds.filter((id) => friends.includes(id));
  if (recommenders.length) {
    await notify(recommenders, "recommendations", {
      title:
        "rating" in change
          ? `${who} rated ${title} ${change.rating}/10`
          : `${who} ${REC_PHRASE[change.status]} ${title}`,
      body: "You recommended it to them.",
      url,
      tag,
    });
  }

  let lovers: string[] = [];
  if ("rating" in change && change.rating >= 8) {
    const { data } = await db
      .from("watch_entries")
      .select("user_id")
      .eq("title_id", titleId)
      .eq("status", "want")
      .in("user_id", friends.filter((id) => !recommenders.includes(id)));
    lovers = (data ?? []).map((r: { user_id: string }) => r.user_id);
    await notify(lovers, "friend_loved", {
      title: `${who} loved ${title}`,
      body: `They rated it ${change.rating}/10, and it's on your Want to watch list.`,
      url,
      tag,
    });
  }

  const others = friends.filter((id) => !lovers.includes(id) && !recommenders.includes(id));
  await notify(others, "friend_activity", {
    title: "rating" in change ? `${who} rated ${title} ${change.rating}/10` : `${who} ${STATUS_PHRASE[change.status]} ${title}`,
    body: "Tap to see it on Show Tracker.",
    url,
    tag,
  });
}

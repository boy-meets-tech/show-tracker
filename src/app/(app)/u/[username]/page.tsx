import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ActivityItem } from "@/components/ActivityItem";
import { Avatar } from "@/components/Avatar";
import { FriendRequestForm } from "@/components/FriendRequestForm";
import { Library } from "@/components/Library";
import { Card, Empty, Skeleton } from "@/components/Section";
import { getMe } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow, ProfileRow } from "@/lib/types";

export default function ProfilePage({ params }: PageProps<"/u/[username]">) {
  return (
    <Suspense fallback={<Skeleton rows={6} />}>
      <Profile params={params} />
    </Suspense>
  );
}

async function Profile({ params }: Pick<PageProps<"/u/[username]">, "params">) {
  const { username } = await params;
  const me = await getMe();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("username", decodeURIComponent(username).toLowerCase())
    .maybeSingle();
  if (!data) notFound();
  const person = data as ProfileRow;
  const isMe = person.id === me.id;

  const { data: friends } = await supabase.rpc("are_friends", { a: me.id, b: person.id });
  const canSee = isMe || friends === true;

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={person.display_name} url={person.avatar_url} size={64} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{person.display_name}</h1>
          <p className="text-sm text-muted">@{person.username}</p>
        </div>
      </div>

      {!canSee ? (
        <Card title={`You're not friends with ${person.display_name} yet`}>
          <p className="mb-3 text-sm text-muted">
            Only friends can see what someone is watching. Send a friend request:
          </p>
          <FriendRequestForm />
        </Card>
      ) : (
        <>
          <RecentActivity userId={person.id} isMe={isMe} />
          <Library userId={person.id} empty={<Empty>Nothing logged yet.</Empty>} />
        </>
      )}
    </>
  );
}

async function RecentActivity({ userId, isMe }: { userId: string; isMe: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity")
    .select(
      "id, kind, status, rating, created_at, profiles(id, username, display_name, avatar_url), titles(id, name, media_type, poster_path, year)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);
  const items = (data ?? []) as unknown as ActivityRow[];
  if (items.length === 0) return null;
  return (
    <Card title="Recently">
      <ul className="-my-3 divide-y divide-border">
        {items.map((item) => (
          <ActivityItem key={item.id} item={item} showUser={!isMe} />
        ))}
      </ul>
    </Card>
  );
}

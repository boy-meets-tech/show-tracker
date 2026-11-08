import { Suspense } from "react";
import Link from "next/link";
import { ActivityItem } from "@/components/ActivityItem";
import { Card, Empty, PageTitle, Skeleton } from "@/components/Section";
import { getMyId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow } from "@/lib/types";

export default function FeedPage() {
  return (
    <>
      <PageTitle sub="What your friends have been watching lately.">Feed</PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <Feed />
      </Suspense>
    </>
  );
}

const ACTIVITY_SELECT =
  "id, kind, status, rating, created_at, profiles(id, username, display_name, avatar_url), titles(id, name, media_type, poster_path, year)";

async function Feed() {
  const me = { id: await getMyId() };
  const supabase = await createClient();

  const [{ data: activity }, { data: recRows }, { count: friendCount }] = await Promise.all([
    supabase
      .from("activity")
      .select(ACTIVITY_SELECT)
      .neq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("recommendations")
      .select("title_id")
      .eq("to_id", me.id)
      .is("dismissed_at", null),
    supabase.from("friendships").select("user_a", { count: "exact", head: true }),
  ]);
  const items = (activity ?? []) as unknown as ActivityRow[];
  // Two friends recommending the same title counts once.
  const recCount = new Set((recRows ?? []).map((r: { title_id: string }) => r.title_id)).size;

  return (
    <>
      {recCount ? (
        <Link
          href="/recs"
          className="mb-6 flex items-center justify-between rounded-xl bg-accent-soft p-4 text-sm"
        >
          <span>
            <strong>
              {recCount} recommendation{recCount === 1 ? "" : "s"}
            </strong>{" "}
            from friends waiting for you
          </span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}

      {!friendCount ? (
        <Card title="Add your friends">
          <p className="text-sm text-muted">
            Your feed fills up with what your friends watch and rate. Send them an invite link to
            get started.
          </p>
          <Link href="/friends" className="btn-primary mt-4">
            Invite friends
          </Link>
        </Card>
      ) : items.length === 0 ? (
        <Empty>Nothing yet. Your friends haven&apos;t logged anything.</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </>
  );
}

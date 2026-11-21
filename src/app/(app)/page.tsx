import { Suspense } from "react";
import Link from "next/link";
import { ActivityItem } from "@/components/ActivityItem";
import { Avatar } from "@/components/Avatar";
import { Poster } from "@/components/Poster";
import { Card, Empty, PageTitle, Skeleton } from "@/components/Section";
import { getMyId } from "@/lib/auth";
import { bothWantMatches } from "@/lib/matches";
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

      <Suspense fallback={null}>
        <MatchStrip meId={me.id} />
      </Suspense>

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

// "Watch together": titles on your list and a friend's. Only shown when there are some.
async function MatchStrip({ meId }: { meId: string }) {
  const matches = await bothWantMatches(meId);
  if (matches.length === 0) return null;
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <h2 className="text-sm font-semibold">🍿 Watch together</h2>
          <p className="text-xs text-muted">On your list and a friend&apos;s</p>
        </div>
        {matches.length > 3 ? (
          <Link href="/recs#both-want" className="text-xs text-accent underline">
            See all {matches.length}
          </Link>
        ) : null}
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {matches.slice(0, 3).map(({ title, friends }) => (
          <li key={title.id}>
            <Link href={`/title/${title.id}`} className="block">
              <span className="relative block">
                <Poster path={title.poster_path} name={title.name} className="w-full" />
                <span className="absolute -right-1 -bottom-1 flex -space-x-1.5">
                  {friends.slice(0, 2).map((f) => (
                    <span key={f.id} className="rounded-full ring-2 ring-[var(--surface)]">
                      <Avatar name={f.display_name} url={f.avatar_url} size={22} />
                    </span>
                  ))}
                </span>
              </span>
              <span className="mt-1.5 block truncate text-xs font-medium">{title.name}</span>
              <span className="ph-mask block truncate text-[11px] text-muted">
                with {friends.length > 1 ? `${friends[0].display_name} +${friends.length - 1}` : friends[0].display_name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

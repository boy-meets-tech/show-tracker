import { Suspense } from "react";
import Link from "next/link";
import { dismissRecommendation } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { Card, Empty, PageTitle, Skeleton } from "@/components/Section";
import { SentRecommendations } from "@/components/SentRecommendations";
import { ServiceBadge } from "@/components/ServiceBadge";
import { TitleRow } from "@/components/TitleRow";
import { onMyServices } from "@/lib/watch";
import { getMyId } from "@/lib/auth";
import { timeAgo } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, TitleRowData } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "For you" };

export default function RecsPage() {
  return (
    <>
      <PageTitle sub="Recommendations from friends, what they loved, and how your own picks landed.">
        For you
      </PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <Recs />
      </Suspense>
    </>
  );
}

type Rec = {
  id: number;
  note: string | null;
  created_at: string;
  profiles: ProfileRow;
  titles: TitleRowData;
};

type Pick = {
  title_id: string;
  name: string;
  media_type: string;
  poster_path: string | null;
  year: number | null;
  avg_rating: number;
  friend_count: number;
  friend_names: string[];
};

async function Recs() {
  const me = { id: await getMyId() };
  const supabase = await createClient();
  const [{ data: recData }, { data: pickData }] = await Promise.all([
    supabase
      .from("recommendations")
      .select(
        "id, note, created_at, profiles!recommendations_from_id_fkey(id, username, display_name, avatar_url), titles(id, name, media_type, poster_path, year)"
      )
      .eq("to_id", me.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("friend_picks", { max_results: 20 }),
  ]);
  const recs = (recData ?? []) as unknown as Rec[];
  const picks = (pickData ?? []) as Pick[];
  const available = await onMyServices([...recs.map((r) => r.titles.id), ...picks.map((p) => p.title_id)]);

  return (
    <>
      <Card title="Recommended to you">
        {recs.length === 0 ? (
          <Empty>No recommendations right now.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {recs.map((r) => (
              <li key={r.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <TitleRow
                    id={r.titles.id}
                    name={r.titles.name}
                    posterPath={r.titles.poster_path}
                    year={r.titles.year}
                    mediaType={r.titles.media_type}
                  >
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <Avatar name={r.profiles.display_name} url={r.profiles.avatar_url} size={16} />
                      <span>
                        From <strong className="ph-mask">{r.profiles.display_name}</strong> · {timeAgo(r.created_at)}
                      </span>
                    </div>
                    {r.note ? <p className="ph-mask mt-1 text-sm italic">“{r.note}”</p> : null}
                    <ServiceBadge names={available[r.titles.id]} />
                  </TitleRow>
                </div>
                <form action={dismissRecommendation.bind(null, r.id)}>
                  <SubmitButton event="recommendation_dismissed" className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted underline hover:text-foreground">Dismiss</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Your friends loved these">
        {picks.length === 0 ? (
          <Empty>
            When friends rate something 8/10 or higher that you haven&apos;t logged, it shows up
            here. <Link href="/friends" className="text-accent underline">Add more friends</Link> to
            get more picks.
          </Empty>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {picks.map((p) => (
              <TitleRow
                key={p.title_id}
                id={p.title_id}
                name={p.name}
                posterPath={p.poster_path}
                year={p.year}
                mediaType={p.media_type}
              >
                <p className="mt-1 text-xs">
                  <span className="font-semibold text-accent">{p.avg_rating}/10</span>{" "}
                  <span className="text-muted">
                    from <span className="ph-mask">{formatNames(p.friend_names)}</span>
                  </span>
                </p>
                <ServiceBadge names={available[p.title_id]} />
              </TitleRow>
            ))}
          </div>
        )}
      </Card>

      <Suspense fallback={<Skeleton rows={3} />}>
        <SentRecommendations meId={me.id} />
      </Suspense>
    </>
  );
}

function formatNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
